"""
Fetches orders from TikTok Shop Open API.

Endpoints used:
  POST /api/orders/search   — paginated order list with line_items
  GET  /api/orders/detail   — full detail including sku_image (fallback)

TikTok returns sku_image directly inside line_items on the search endpoint
for most regions. If missing, we fall back to the product detail endpoint.
"""
import hashlib
import hmac
import json
import time
from datetime import datetime
from typing import List, Optional, Tuple

import httpx

from app.core.config import settings
from app.models.order import OrderRecord, OrderLineItem


def _sign(path: str, query_params: dict = None, body: str = "") -> tuple[dict, dict]:
    """
    Returns (query_params_with_sign, headers).

    TikTok V2 (202309) signing rule:
      secret + path + sorted(all_query_params) + body + secret
    - access_token goes ONLY in x-tts-access-token header
    - page_size and pagination params go in query string (included in sign)
    - filter params (create_time_ge etc.) go in JSON body (included in sign)
    """
    timestamp = str(int(time.time()))
    query: dict = {
        **(query_params or {}),
        "app_key": settings.tiktok_app_key,
        "shop_cipher": settings.tiktok_shop_cipher,
        "timestamp": timestamp,
    }
    sorted_params = sorted(
        [(k, str(v)) for k, v in query.items()],
        key=lambda x: x[0],
    )
    param_str = "".join(f"{k}{v}" for k, v in sorted_params)
    base_string = f"{settings.tiktok_app_secret}{path}{param_str}{body}{settings.tiktok_app_secret}"
    signature = hmac.new(
        settings.tiktok_app_secret.encode("utf-8"),
        base_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    query["sign"] = signature
    headers = {
        "Content-Type": "application/json",
        "x-tts-access-token": settings.tiktok_access_token,
    }
    return query, headers


def _parse_line_item(raw: dict, order_id: str, currency: str) -> OrderLineItem:
    return OrderLineItem(
        order_line_item_id=raw.get("id") or raw.get("order_line_item_id", ""),
        product_id=raw.get("product_id", ""),
        sku_id=raw.get("sku_id", ""),
        product_name=raw.get("product_name", ""),
        sku_name=raw.get("sku_name") or raw.get("sku_display_name"),
        seller_sku=raw.get("seller_sku"),
        sku_image=(
            raw.get("sku_image")
            or raw.get("sku_image_url")
            or raw.get("product_image")
            or raw.get("image_url")
        ),
        quantity=int(raw.get("quantity", 1)),
        sale_price=raw.get("sale_price") or raw.get("original_price"),
        currency=currency,
    )


def _parse_order(raw: dict) -> OrderRecord:
    currency = raw.get("currency", "SGD")
    line_items_raw = raw.get("line_items") or raw.get("order_line_items") or []
    order_id = str(raw.get("id") or raw.get("order_id", ""))

    line_items = [_parse_line_item(li, order_id, currency) for li in line_items_raw]

    return OrderRecord(
        order_id=order_id,
        status=raw.get("status", ""),
        create_time=int(raw.get("create_time", 0)),
        update_time=int(raw.get("update_time", 0)),
        paid_time=raw.get("paid_time"),
        currency=currency,
        total_amount=raw.get("payment", {}).get("total_amount") if isinstance(raw.get("payment"), dict) else None,
        buyer_uid=raw.get("buyer_uid"),
        line_items=line_items,
        synced_at=datetime.utcnow().isoformat(),
    )


async def fetch_orders(
    start_ts: int,
    end_ts: int,
    status: Optional[str] = None,
) -> Tuple[List[OrderRecord], List[str]]:
    """
    Fetch all orders in the given unix timestamp range.
    Returns (orders, errors).
    Handles cursor-based pagination automatically.

    The 202309 versioned API takes business params as query params (not JSON body).
    """
    path = "/order/202309/orders/search"
    all_orders: List[OrderRecord] = []
    errors: List[str] = []
    cursor = None

    async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=30) as client:
        while True:
            # page_size goes in query string; filters go in JSON body
            query_params: dict = {"page_size": 50}
            if cursor:
                query_params["page_token"] = cursor

            body_dict: dict = {
                "create_time_ge": start_ts,
                "create_time_lt": end_ts,
            }
            if status:
                body_dict["order_status"] = status

            body_str = json.dumps(body_dict)
            all_params, headers = _sign(path, query_params, body_str)

            resp = await client.post(
                path,
                params=all_params,
                content=body_str.encode(),
                headers=headers,
            )

            try:
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                errors.append(str(e))
                break

            if data.get("code") != 0:
                errors.append(f"TikTok API error: {data.get('message')} (code {data.get('code')})")
                break

            orders_raw = (
                data.get("data", {}).get("orders")
                or data.get("data", {}).get("order_list")
                or []
            )

            for raw in orders_raw:
                try:
                    all_orders.append(_parse_order(raw))
                except Exception as e:
                    errors.append(f"Parse error for order {raw.get('id')}: {e}")

            # Pagination — API uses next_page_token
            resp_data = data.get("data", {})
            next_cursor = resp_data.get("next_page_token")
            total = resp_data.get("total_count", 0)

            if not next_cursor or len(all_orders) >= total:
                break
            cursor = next_cursor

    return all_orders, errors


async def fetch_order_detail(order_ids: List[str]) -> List[OrderRecord]:
    """
    Fetch full order details (including sku_image) for specific order IDs.
    Used as fallback when search endpoint doesn't return images.
    """
    if not order_ids:
        return []

    path = "/order/202309/orders"
    params, headers = _sign(path)

    async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=30) as client:
        resp = await client.get(
            path,
            params={**params, "order_ids": ",".join(order_ids[:50])},
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()

    orders_raw = data.get("data", {}).get("orders") or []
    return [_parse_order(raw) for raw in orders_raw]
