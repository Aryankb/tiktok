"""
Orders API

POST /api/orders/sync              — fetch from TikTok, save (listing_id = product_id from TikTok)
GET  /api/orders                   — list all orders (with optional filters)
GET  /api/orders/listings          — distinct listing IDs found in orders
GET  /api/orders/export/{listing_id} — download Excel for one factory/listing
"""
import asyncio
from datetime import datetime, timezone
from functools import partial
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.models.order import OrderRecord, OrderSyncResult
from app.services import orders_db, orders_service
from app.services.excel_export import generate_factory_excel, generate_combined_excel

router = APIRouter(prefix="/api/orders", tags=["orders"])


# ── Request / response models ──────────────────────────────────────────────

class SyncRequest(BaseModel):
    date_from: str   # "YYYY-MM-DD"
    date_to: str     # "YYYY-MM-DD"
    status: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────

def _date_to_ts(date_str: str, end_of_day: bool = False) -> int:
    """Parse YYYY-MM-DD to unix timestamp (UTC). end_of_day adds 86399 seconds."""
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    ts = int(dt.timestamp())
    return ts + 86399 if end_of_day else ts


def _set_listing_ids(orders: list[OrderRecord]) -> None:
    """
    listing_id = product_id from TikTok order line item.
    Products were created manually in Seller Center — each listing ID
    is a TikTok product that contains all variations for one factory/livestream.
    """
    for order in orders:
        for item in order.line_items:
            if not item.listing_id and item.product_id:
                item.listing_id = item.product_id


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("/sync", response_model=OrderSyncResult)
async def sync_orders(body: SyncRequest):
    """
    Fetch orders from TikTok for the given date range,
    match line items to our local listing IDs, and save to orders.json.
    """
    try:
        start_ts = _date_to_ts(body.date_from, end_of_day=False)
        end_ts = _date_to_ts(body.date_to, end_of_day=True)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")

    # Fetch from TikTok
    orders, errors = await orders_service.fetch_orders(start_ts, end_ts, body.status)

    if errors and not orders:
        raise HTTPException(502, detail="; ".join(errors))

    # listing_id = product_id (set directly from TikTok order data)
    _set_listing_ids(orders)

    # Save / upsert
    saved = await orders_db.save_orders(orders)

    return OrderSyncResult(
        fetched=len(orders),
        saved=saved,
        skipped=len(errors),
    )


@router.get("")
async def get_orders(
    listing_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """List orders with optional filters."""
    orders = await orders_db.list_orders()

    if listing_id:
        orders = [
            o for o in orders
            if any(item.listing_id == listing_id for item in o.line_items)
        ]
    if status:
        orders = [o for o in orders if o.status == status]
    if date_from:
        ts = _date_to_ts(date_from)
        orders = [o for o in orders if o.create_time >= ts]
    if date_to:
        ts = _date_to_ts(date_to, end_of_day=True)
        orders = [o for o in orders if o.create_time <= ts]

    orders.sort(key=lambda o: o.create_time, reverse=True)
    return [o.model_dump(mode="json") for o in orders]


@router.get("/listings")
async def get_listing_ids():
    """Return distinct listing IDs with aggregated stats from saved orders."""
    orders = await orders_db.list_orders()

    # listing_id → {product_names, total_orders, total_units}
    meta: dict[str, dict] = {}

    for o in orders:
        if o.status not in ("IN_TRANSIT", "DELIVERED", "AWAITING_SHIPMENT", "AWAITING_COLLECTION"):
            continue
        for item in o.line_items:
            lid = item.listing_id
            if not lid:
                continue
            if lid not in meta:
                meta[lid] = {
                    "listing_id": lid,
                    "product_names": set(),
                    "total_orders": set(),
                    "total_units": 0,
                    "latest_order_time": 0,
                }
            meta[lid]["product_names"].add(item.product_name)
            meta[lid]["total_orders"].add(o.order_id)
            meta[lid]["total_units"] += item.quantity
            if o.create_time > meta[lid]["latest_order_time"]:
                meta[lid]["latest_order_time"] = o.create_time

    # Sort newest listing first
    sorted_meta = sorted(meta.values(), key=lambda m: m["latest_order_time"], reverse=True)

    result = []
    for m in sorted_meta:
        names = sorted(m["product_names"])
        result.append({
            "listing_id": m["listing_id"],
            "product_name": names[0] if names else "",
            "total_orders": len(m["total_orders"]),
            "total_units": m["total_units"],
            "latest_order_date": datetime.utcfromtimestamp(m["latest_order_time"]).strftime("%Y-%m-%d") if m["latest_order_time"] else "",
        })

    return result


@router.get("/activity/{listing_id}")
async def get_listing_activity(
    listing_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """
    Return paginated recent activity (all statuses) for one listing,
    plus total revenue (sum of total_amount for completed/delivered/in_transit orders).
    """
    orders = await orders_db.list_orders()

    # Filter to this listing
    relevant = [
        o for o in orders
        if any(item.listing_id == listing_id for item in o.line_items)
    ]
    relevant.sort(key=lambda o: o.update_time or o.create_time, reverse=True)

    # Total revenue — only count paid/shipped/delivered orders
    REVENUE_STATUSES = {"AWAITING_SHIPMENT", "AWAITING_COLLECTION", "IN_TRANSIT", "DELIVERED", "COMPLETED"}
    total_revenue = 0.0
    currency = "SGD"
    for o in relevant:
        if o.status in REVENUE_STATUSES and o.total_amount:
            try:
                total_revenue += float(o.total_amount)
                currency = o.currency or currency
            except ValueError:
                pass

    # Paginate
    total = len(relevant)
    start = (page - 1) * page_size
    page_orders = relevant[start: start + page_size]

    items = []
    for o in page_orders:
        # Only include line items for this listing
        listing_items = [i for i in o.line_items if i.listing_id == listing_id]
        items.append({
            "order_id": o.order_id,
            "status": o.status,
            "create_time": o.create_time,
            "update_time": o.update_time,
            "total_amount": o.total_amount,
            "currency": o.currency,
            "line_items": [
                {
                    "sku_name": i.sku_name,
                    "seller_sku": i.seller_sku,
                    "sku_image": i.sku_image,
                    "quantity": i.quantity,
                    "sale_price": i.sale_price,
                }
                for i in listing_items
            ],
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_revenue": round(total_revenue, 2),
        "currency": currency,
        "items": items,
    }


@router.get("/export/{listing_id}")
async def export_excel(
    listing_id: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    product_name: Optional[str] = Query(None),
):
    """
    Stream an Excel file for one factory/listing ID.
    Contains one row per unique SKU with aggregated quantities and embedded images.
    """
    orders = await orders_db.list_orders()

    # Apply date filters if given
    if date_from:
        ts = _date_to_ts(date_from)
        orders = [o for o in orders if o.create_time >= ts]
    if date_to:
        ts = _date_to_ts(date_to, end_of_day=True)
        orders = [o for o in orders if o.create_time <= ts]

    # Check we actually have orders for this listing
    has_any = any(
        item.listing_id == listing_id
        for o in orders
        for item in o.line_items
    )
    if not has_any:
        raise HTTPException(404, f"No orders found for listing ID {listing_id!r}")

    _from = date_from or "all"
    _to = date_to or "all"

    # Run the blocking Excel build in a thread
    loop = asyncio.get_event_loop()
    excel_bytes = await loop.run_in_executor(
        None,
        partial(generate_factory_excel, orders, listing_id, _from, _to),
    )

    import re
    if product_name:
        safe_name = re.sub(r'[\\/:*?"<>|]', '', product_name).strip()[:80]
    else:
        safe_name = listing_id[-8:]
    filename = f"{safe_name}.xlsx"

    return StreamingResponse(
        iter([excel_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class MultiExportRequest(BaseModel):
    listing_ids: list[str]
    date_from: Optional[str] = None
    date_to: Optional[str] = None


@router.post("/export-multi")
async def export_excel_multi(body: MultiExportRequest):
    """Export a combined Excel for multiple listing IDs (e.g. two factories combined)."""
    if not body.listing_ids:
        raise HTTPException(400, "At least one listing_id required")

    orders = await orders_db.list_orders()

    if body.date_from:
        ts = _date_to_ts(body.date_from)
        orders = [o for o in orders if o.create_time >= ts]
    if body.date_to:
        ts = _date_to_ts(body.date_to, end_of_day=True)
        orders = [o for o in orders if o.create_time <= ts]

    loop = asyncio.get_event_loop()
    excel_bytes = await loop.run_in_executor(
        None,
        partial(generate_combined_excel, orders, body.listing_ids),
    )

    import re
    safe = re.sub(r'[\\/:*?"<>|]', '', "+".join(lid[-6:] for lid in body.listing_ids))
    filename = f"combined_{safe}.xlsx"

    return StreamingResponse(
        iter([excel_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
