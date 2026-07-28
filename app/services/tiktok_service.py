"""
TikTok Shop Open API integration.
Handles:
 1. Image upload to TikTok (get back a URI)
 2. Product creation (create_product endpoint)

Docs reference: https://partner.tiktokshop.com/docv2/page/product
"""
import hashlib
import hmac
import time
import base64
import io
from typing import List, Optional

import httpx
from PIL import Image

from app.core.config import settings
from app.models.product import TikTokProductPayload, TikTokImage
from app.services.extractor import image_to_bytes


# ── Signature helper ───────────────────────────────────────────────────────

def _sign_request(path: str, params: dict, body: str = "") -> dict:
    """
    Generate TikTok Shop API HMAC-SHA256 signature.
    See: https://partner.tiktokshop.com/docv2/page/signature
    """
    timestamp = str(int(time.time()))
    params = {
        **params,
        "app_key": settings.tiktok_app_key,
        "timestamp": timestamp,
        "access_token": settings.tiktok_access_token,
    }

    # Sort params alphabetically, exclude sign and access_token from string
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


# ── Image upload ───────────────────────────────────────────────────────────

async def upload_image_to_tiktok(image: Image.Image) -> str:
    """Upload a PIL image to TikTok's image service, return the URI."""
    img_bytes = image_to_bytes(image, fmt="JPEG")
    path = "/api/products/images/upload"
    params = _sign_request(path, {"shop_cipher": settings.tiktok_shop_cipher})

    async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=60) as client:
        response = await client.post(
            path,
            params=params,
            files={"data": ("product.jpg", img_bytes, "image/jpeg")},
        )
        response.raise_for_status()
        data = response.json()

    if data.get("code") != 0:
        raise RuntimeError(f"TikTok image upload failed: {data.get('message')}")

    return data["data"]["uri"]


# ── Product creation ───────────────────────────────────────────────────────

async def push_product_to_tiktok(
    payload: TikTokProductPayload,
    product_images: Optional[List[Image.Image]] = None,
) -> str:
    """
    Push a product to TikTok Shop.
    If product_images is provided, uploads them first and attaches URIs.
    Returns the TikTok product_id on success.
    """
    import json

    # If we have actual image objects, upload them first
    if product_images:
        uris = []
        for img in product_images:
            uri = await upload_image_to_tiktok(img)
            uris.append(TikTokImage(uri=uri))
        payload.images = uris

    path = "/api/products"
    body_dict = {
        "title": payload.title,
        "description": payload.description,
        "category_id": payload.category_id,
        "images": [{"uri": img.uri} for img in payload.images],
        "skus": [
            {
                "original_price": {
                    "amount": sku.original_price.amount,
                    "currency": sku.original_price.currency,
                },
                "stock_infos": [
                    {"warehouse_id": si.warehouse_id, "available_stock": si.available_stock}
                    for si in sku.stock_infos
                ],
                **({"seller_sku": sku.seller_sku} if sku.seller_sku else {}),
            }
            for sku in payload.skus
        ],
    }

    if payload.brand_id:
        body_dict["brand_id"] = payload.brand_id
    if payload.package_weight:
        body_dict["package_weight"] = payload.package_weight
    if payload.package_dimensions:
        body_dict["package_dimensions"] = payload.package_dimensions

    body_str = json.dumps(body_dict)
    params = _sign_request(path, {"shop_cipher": settings.tiktok_shop_cipher}, body_str)

    async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=60) as client:
        response = await client.post(
            path,
            params=params,
            content=body_str,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        data = response.json()

    if data.get("code") != 0:
        raise RuntimeError(f"TikTok product creation failed: {data.get('message')} | {data}")

    return data["data"]["product_id"]
