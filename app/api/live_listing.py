"""
Live Listing API

POST /api/live-listing/transcribe       — Transcribe audio blob via SpeechRecognition, return text
POST /api/live-listing/extract          — Gemini extracts fields from image + voice text
POST /api/live-listing/upload-image     — Upload image to TikTok, get back URI
POST /api/live-listing/add-sku          — Add a new SKU (variation) to existing listing on TikTok
GET  /api/live-listing/warehouse        — Get warehouse ID for the shop (needed for stock)
"""
import asyncio
import base64
import json
import re
import sys
import time
import hashlib
import hmac
from typing import Optional

import httpx
import google.generativeai as genai
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter(prefix="/api/live-listing", tags=["live-listing"])


# ── Signing (v2: access_token in x-tts-access-token header, not query params) ──

def _sign(path: str, params: dict, body: str = "") -> tuple[dict, dict]:
    """
    New-style v2 signing: access_token goes in x-tts-access-token header only,
    excluded from both query params and the signature string.
    Returns (query_params, headers).
    """
    timestamp = str(int(time.time()))
    query: dict = {
        **params,
        "app_key": settings.tiktok_app_key,
        "timestamp": timestamp,
    }
    sorted_params = sorted(
        [(k, str(v)) for k, v in query.items() if k != "sign"],
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
    headers = {"x-tts-access-token": settings.tiktok_access_token}
    return query, headers


# ── Gemini extraction prompt ───────────────────────────────────────────────

_EXTRACT_PROMPT = """You are helping list a product on TikTok Shop for a live stream seller.
The user has uploaded a product image and may have provided voice/text notes.

Extract the following fields and return ONLY valid JSON:
{
  "product_name": "short clean product name, no codes",
  "dimensions": {"length": "number string", "width": "number string", "height": "number string"},
  "price": "numeric string only e.g. 12.90, or null if not mentioned",
  "stock": integer or null,
  "notes": "any other relevant info from the image or text"
}

Rules:
- product_name: clean buyer-facing name only, no SKU codes, no brand prefix
- dimensions: read ONLY if visible in image or stated in notes. Return null if not found.
- price: numeric only, no currency symbols. null if not mentioned.
- stock: integer only. null if not mentioned.
- Return ONLY the JSON object, no markdown, no explanation.

Voice/text notes from user:
{voice_text}
"""


# ── Request/response models ────────────────────────────────────────────────

class ExtractedFields(BaseModel):
    product_name: str = ""
    dimensions: Optional[dict] = None   # {length, width, height}
    price: Optional[str] = None
    stock: Optional[int] = None
    notes: Optional[str] = None


class SkuItem(BaseModel):
    title: str
    image_uri: str
    price: str
    stock: int
    seller_sku: Optional[str] = None


class AddSkuRequest(BaseModel):
    listing_id: str
    skus: list[SkuItem]      # one or more SKUs to add in a single PUT


class AddSkuResult(BaseModel):
    success: bool
    sku_ids: Optional[list[str]] = None
    error: Optional[str] = None


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    image: Optional[UploadFile] = File(default=None),
):
    """
    Receive a recorded audio blob (webm/ogg/mp4 — whatever browser MediaRecorder produces).
    Gemini 1.5 Flash handles audio natively: transcribes speech AND extracts product fields
    in one call, optionally combined with an image.
    """
    audio_bytes = await audio.read()
    audio_mime = audio.content_type or "audio/webm"
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

    img_b64 = None
    img_mime = "image/jpeg"
    if image:
        img_bytes = await image.read()
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        img_mime = image.content_type or "image/jpeg"

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-3.1-flash-lite")

    prompt = (
        "You are helping list a product on TikTok Shop for a live stream seller.\n"
        "The seller has recorded a voice note describing the product. "
        "There may also be a product image attached.\n\n"
        "Step 1 — Transcribe the voice note exactly as spoken (return as 'transcript').\n"
        "Step 2 — Using the transcript AND image (if present), extract product fields.\n\n"
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "transcript": "exact words spoken",\n'
        '  "product_name": "short clean buyer-facing name, no SKU codes",\n'
        '  "dimensions": {"length": "number", "width": "number", "height": "number"},\n'
        '  "price": "numeric string e.g. 12.90, or null",\n'
        '  "stock": integer or null,\n'
        '  "notes": "any other info"\n'
        "}\n\n"
        "Rules:\n"
        "- product_name: keep it SHORT — max 3-4 words, buyer-facing only. No brand prefix, no SKU codes.\n"
        "  Examples: 'Wooden Chopping Board', 'Round Storage Box', 'Bamboo Tray Set'\n"
        "- If the seller says a set size (e.g. 'set of 3', 'pack of 6'), include it: 'Storage Box Set of 3'\n"
        "- If the seller mentions a material (wood, bamboo, plastic), include it in the name\n"
        "- dimensions: only if mentioned in audio or visible in image, else null\n"
        "- price: numeric only, no currency symbol, null if not mentioned\n"
        "- Return ONLY the JSON object, no markdown, no explanation."
    )

    parts: list = [prompt, {"mime_type": audio_mime, "data": audio_b64}]
    if img_b64:
        parts.append({"mime_type": img_mime, "data": img_b64})

    response = model.generate_content(parts)
    raw = response.text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(422, f"Gemini returned unparseable response: {raw[:200]}")

    return {
        "transcript": data.get("transcript") or "",
        "product_name": data.get("product_name") or "",
        "dimensions": data.get("dimensions"),
        "price": str(data["price"]) if data.get("price") else None,
        "stock": data.get("stock"),
        "notes": data.get("notes"),
    }


@router.get("/listings")
async def get_listings():
    """
    Return the configured live listing slots with their product names fetched from TikTok.
    Uses TIKTOK_LISTING_IDS from .env — these are the pre-created product slots, not order-derived IDs.
    """
    ids = [i.strip() for i in settings.tiktok_listing_ids.split(",") if i.strip()]
    if not ids:
        return []

    async def fetch_one(lid: str) -> dict:
        path = f"/product/202309/products/{lid}"
        params, headers = _sign(path, {"shop_cipher": settings.tiktok_shop_cipher})
        try:
            async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=15) as client:
                resp = await client.get(path, params=params, headers=headers)
                data = resp.json()
            if data.get("code") == 0:
                product = data.get("data") or {}
                return {
                    "listing_id": lid,
                    "product_name": product.get("title") or "",
                    "status": product.get("status") or "",
                    "sku_count": len(product.get("skus") or []),
                }
        except Exception:
            pass
        return {"listing_id": lid, "product_name": "", "status": "", "sku_count": 0}

    results = await asyncio.gather(*[fetch_one(lid) for lid in ids])
    return list(results)


@router.post("/extract", response_model=ExtractedFields)
async def extract_fields(
    image: UploadFile = File(...),
    voice_text: str = Form(default=""),
):
    """Send image + voice text to Gemini, return extracted product fields."""
    img_bytes = await image.read()
    img_b64 = base64.b64encode(img_bytes).decode("utf-8")
    mime = image.content_type or "image/jpeg"

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-3.1-flash-lite")

    prompt = _EXTRACT_PROMPT.replace("{voice_text}", voice_text or "(none)")

    response = model.generate_content([
        prompt,
        {"mime_type": mime, "data": img_b64},
    ])

    raw = response.text.strip()
    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(422, f"Gemini returned unparseable response: {raw[:200]}")

    return ExtractedFields(
        product_name=data.get("product_name") or "",
        dimensions=data.get("dimensions"),
        price=str(data["price"]) if data.get("price") else None,
        stock=data.get("stock"),
        notes=data.get("notes"),
    )


@router.post("/upload-image")
async def upload_image(image: UploadFile = File(...)):
    """Upload image to TikTok and return the URI for use in product listing."""
    img_bytes = await image.read()

    # No shop_cipher for image upload — just app_key + timestamp + sign
    path = "/product/202309/images/upload"
    params, headers = _sign(path, {})

    async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=60) as client:
        resp = await client.post(
            path,
            params=params,
            headers=headers,
            files={
                "data": (image.filename or "product.jpg", img_bytes, image.content_type or "image/jpeg"),
                "use_case": (None, "MAIN_IMAGE"),
            },
        )
        try:
            data = resp.json()
        except Exception:
            data = {}
        if not resp.is_success:
            raise HTTPException(502, f"TikTok image upload HTTP {resp.status_code}: {data or resp.text[:300]}")

    if data.get("code") != 0:
        raise HTTPException(502, f"TikTok image upload failed: {data.get('message')} (code {data.get('code')})")

    return {"uri": data["data"]["uri"]}


@router.post("/add-sku", response_model=AddSkuResult)
async def add_sku(req: AddSkuRequest):
    """
    Add one or more new SKUs to an existing TikTok listing in a single PUT.
    All new SKUs are appended together — one review wait covers all of them.
    """
    if not req.skus:
        raise HTTPException(400, "At least one SKU required")

    # Step 1: GET existing product
    get_path = f"/product/202309/products/{req.listing_id}"
    get_params, get_headers = _sign(get_path, {"shop_cipher": settings.tiktok_shop_cipher})

    async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=30) as client:
        get_resp = await client.get(get_path, params=get_params, headers=get_headers)
        try:
            get_data = get_resp.json()
        except Exception:
            get_data = {}
        if not get_resp.is_success:
            raise HTTPException(502, f"TikTok GET product HTTP {get_resp.status_code}: {get_data or get_resp.text[:300]}")

    if get_data.get("code") != 0:
        raise HTTPException(502, f"TikTok GET product failed: {get_data.get('message')} (code {get_data.get('code')})")

    product_data = get_data.get("data") or {}
    existing_skus = product_data.get("skus") or []

    # Extract warehouse ID from existing SKUs
    warehouse_id = None
    for s in existing_skus:
        inv = s.get("inventory") or []
        if inv and inv[0].get("warehouse_id"):
            warehouse_id = str(inv[0]["warehouse_id"])
            break
    if not warehouse_id:
        raise HTTPException(502, "Could not determine warehouse ID from existing product SKUs")

    # Preserve existing SKUs with full required fields
    preserved = []
    for s in existing_skus:
        if not s.get("id"):
            continue
        sku_entry: dict = {"id": s["id"]}
        if s.get("sales_attributes"):
            cleaned_attrs = []
            for a in s["sales_attributes"]:
                attr: dict = {}
                if a.get("id"):       attr["id"] = a["id"]
                if a.get("value_id"): attr["value_id"] = a["value_id"]
                if a.get("value_name"): attr["value_name"] = a["value_name"]
                if a.get("sku_img", {}).get("uri"):
                    attr["sku_img"] = {"uri": a["sku_img"]["uri"]}
                cleaned_attrs.append(attr)
            sku_entry["sales_attributes"] = cleaned_attrs
        if s.get("price"):
            price = s["price"]
            sku_entry["price"] = {
                "amount": price.get("original_price") or price.get("sale_price") or price.get("amount") or "0",
                "currency": "SGD",
            }
        inv = s.get("inventory") or []
        if inv:
            sku_entry["inventory"] = [{"warehouse_id": str(inv[0]["warehouse_id"]), "quantity": inv[0].get("quantity", 0)}]
        preserved.append(sku_entry)

    # Attribute id that all new SKUs must share (must match existing SKUs' attribute type)
    existing_attr_id = None
    if existing_skus:
        attrs = existing_skus[0].get("sales_attributes") or []
        if attrs:
            existing_attr_id = attrs[0].get("id")

    # Build all new SKUs for the single PUT
    new_skus = []
    for item in req.skus:
        new_attr: dict = {"sku_img": {"uri": item.image_uri}, "value_name": item.title}
        if existing_attr_id:
            new_attr["id"] = existing_attr_id
        new_skus.append({
            "sales_attributes": [new_attr],
            "price": {"amount": item.price, "currency": "SGD"},
            "inventory": [{"warehouse_id": warehouse_id, "quantity": item.stock}],
            **({"seller_sku": item.seller_sku} if item.seller_sku else {}),
        })

    # Build PUT body
    category_chains = product_data.get("category_chains") or []
    leaf_category = next((c for c in reversed(category_chains) if c.get("is_leaf")), None)
    if not leaf_category:
        leaf_category = category_chains[-1] if category_chains else None

    put_payload: dict = {"skus": preserved + new_skus}
    if product_data.get("title"):
        put_payload["title"] = product_data["title"]
    if product_data.get("description"):
        put_payload["description"] = product_data["description"]
    if leaf_category:
        put_payload["category_id"] = leaf_category["id"]
        put_payload["category_version"] = "v2"
    for field in ("brand_id", "main_images", "package_weight", "package_dimensions",
                  "size_chart", "delivery_services"):
        if product_data.get(field) is not None:
            put_payload[field] = product_data[field]

    print(f"[add-sku] adding {len(new_skus)} new SKU(s) in single PUT", file=sys.stderr)

    put_path = f"/product/202309/products/{req.listing_id}"
    put_body = json.dumps(put_payload)
    put_params, put_headers = _sign(put_path, {"shop_cipher": settings.tiktok_shop_cipher}, put_body)
    put_headers["Content-Type"] = "application/json"

    async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=30) as client:
        put_resp = await client.put(put_path, params=put_params, headers=put_headers, content=put_body)
        try:
            put_data = put_resp.json()
        except Exception:
            put_data = {}
        if not put_resp.is_success:
            print(f"[add-sku] PUT {put_resp.status_code}: {put_data or put_resp.text[:1000]}", file=sys.stderr)
            raise HTTPException(502, f"TikTok PUT product HTTP {put_resp.status_code}: {put_data or put_resp.text[:300]}")

    if put_data.get("code") != 0:
        print(f"[add-sku] TikTok error: {put_data}", file=sys.stderr)
        return AddSkuResult(success=False, error=f"{put_data.get('message')} (code {put_data.get('code')})")

    # Identify newly created SKU ids from the response
    existing_ids = {s["id"] for s in existing_skus if s.get("id")}
    added_skus = [s for s in (put_data.get("data", {}).get("skus") or []) if s.get("id") not in existing_ids]
    sku_ids = [s["id"] for s in added_skus if s.get("id")]
    print(f"[add-sku] PUT succeeded, new sku ids: {sku_ids}", file=sys.stderr)

    # Step 3: Poll until product leaves review — one wait covers ALL newly added SKUs
    poll_path = f"/product/202309/products/{req.listing_id}"
    for attempt in range(24):  # up to 120s (24 × 5s)
        await asyncio.sleep(5)
        poll_params, poll_headers = _sign(poll_path, {"shop_cipher": settings.tiktok_shop_cipher})
        async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=15) as client:
            try:
                poll_resp = await client.get(poll_path, params=poll_params, headers=poll_headers)
                poll_data = poll_resp.json()
            except Exception:
                poll_data = {}
        if poll_data.get("code") != 0:
            print(f"[add-sku] poll {attempt+1}: GET error {poll_data.get('code')}", file=sys.stderr)
            continue
        pd = poll_data.get("data") or {}
        status = pd.get("status", "")
        audit_status = (pd.get("audit") or {}).get("status", "")
        print(f"[add-sku] poll {attempt+1}: status={status} audit={audit_status}", file=sys.stderr)
        if status not in ("PENDING",) and audit_status not in ("AUDITING",):
            print(f"[add-sku] review cleared after {(attempt+1)*5}s", file=sys.stderr)
            break
    else:
        print(f"[add-sku] poll timed out after 120s, continuing", file=sys.stderr)

    return AddSkuResult(success=True, sku_ids=sku_ids)


@router.get("/skus/{listing_id}")
async def get_listing_skus(listing_id: str):
    """
    Fetch existing SKUs for a listing from TikTok.
    Returns list of {sku_id, seller_sku, title, price, stock, image_url}.
    """
    get_path = f"/product/202309/products/{listing_id}"
    get_params, get_headers = _sign(get_path, {"shop_cipher": settings.tiktok_shop_cipher})

    async with httpx.AsyncClient(base_url=settings.tiktok_api_base_url, timeout=30) as client:
        resp = await client.get(get_path, params=get_params, headers=get_headers)
        try:
            data = resp.json()
        except Exception:
            data = {}
        if not resp.is_success:
            raise HTTPException(502, f"TikTok GET product HTTP {resp.status_code}: {data or resp.text[:300]}")

    if data.get("code") != 0:
        raise HTTPException(502, f"TikTok GET product failed: {data.get('message')} (code {data.get('code')})")

    raw_skus = (data.get("data") or {}).get("skus") or []
    skus = []
    for s in raw_skus:
        attrs = s.get("sales_attributes") or []
        title = attrs[0].get("value_name", "") if attrs else ""
        sku_img = (attrs[0].get("sku_img") or {}) if attrs else {}
        img_url = (sku_img.get("urls") or sku_img.get("thumb_urls") or [""])[0]
        price = (s.get("price") or {}).get("sale_price") or ""
        stock = sum((inv.get("quantity") or 0) for inv in (s.get("inventory") or []))
        skus.append({
            "sku_id": s.get("id", ""),
            "seller_sku": s.get("seller_sku", ""),
            "title": title,
            "price": str(price),
            "stock": stock,
            "image_url": img_url,
        })
    return {"skus": skus}


