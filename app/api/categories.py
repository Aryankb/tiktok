"""
GET /api/categories  — fetch TikTok Shop category tree and return a flat list
                       of leaf categories with their numeric ID and full path.

TikTok endpoint: GET /api/categories  (requires shop_cipher, locale)
Docs: https://partner.tiktokshop.com/docv2/page/product-category-get
"""
import hashlib
import hmac
import time
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryOption(BaseModel):
    id: str
    name: str        # leaf name, e.g. "Hooks & Hangers"
    full_path: str   # breadcrumb, e.g. "Home & Living > Home Decor > Hooks & Hangers"


def _sign(path: str, params: dict, body: str = "") -> dict:
    timestamp = str(int(time.time()))
    params = {
        **params,
        "app_key": settings.tiktok_app_key,
        "timestamp": timestamp,
        "access_token": settings.tiktok_access_token,
    }
    sorted_params = sorted(
        [(k, v) for k, v in params.items() if k not in ("sign", "access_token")],
        key=lambda x: x[0],
    )
    param_str = "".join(f"{k}{v}" for k, v in sorted_params)
    base_string = f"{settings.tiktok_app_secret}{path}{param_str}{body}{settings.tiktok_app_secret}"
    signature = hmac.new(
        settings.tiktok_app_secret.encode("utf-8"),
        base_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return {**params, "sign": signature}


def _flatten_categories(nodes: list, ancestors: list = None) -> List[CategoryOption]:
    """Recursively flatten TikTok category tree into leaf nodes with full path."""
    if ancestors is None:
        ancestors = []
    result = []
    for node in nodes:
        name = node.get("local_display_name") or node.get("display_name", "")
        path_parts = ancestors + [name]
        children = node.get("sub_category_list") or node.get("children") or []
        if not children:
            # Leaf node
            result.append(CategoryOption(
                id=str(node["id"]),
                name=name,
                full_path=" > ".join(path_parts),
            ))
        else:
            result.extend(_flatten_categories(children, path_parts))
    return result


@router.get("/", response_model=List[CategoryOption])
async def list_categories(locale: str = "en-US"):
    """
    Fetch the full TikTok Shop category tree and return a flat list of leaf categories.
    Each entry has the numeric category_id and a human-readable full path.
    """
    # Return empty list if TikTok credentials aren't configured yet
    if (not settings.tiktok_app_key
            or settings.tiktok_app_key in ("your_tiktok_app_key", "")
            or settings.tiktok_shop_cipher in ("your_shop_cipher", "")):
        return []

    path = "/api/products/categories"
    params = _sign(path, {
        "shop_cipher": settings.tiktok_shop_cipher,
        "locale": locale,
    })

    async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=30) as client:
        response = await client.get(path, params=params)
        response.raise_for_status()
        data = response.json()

    if data.get("code") != 0:
        raise HTTPException(
            status_code=502,
            detail=f"TikTok categories API error: {data.get('message')} (code {data.get('code')})",
        )

    raw_categories = (
        data.get("data", {}).get("category_list")
        or data.get("data", {}).get("categories")
        or []
    )
    return _flatten_categories(raw_categories)
