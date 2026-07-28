"""
Calls Gemini Vision to generate TikTok product listing fields.
Strategy: send the full page/slide image to Gemini so it can read all visible
text (price, size, SKU). The YOLO-cropped image is only used for the thumbnail
stored on disk — it is NOT sent to Gemini.
"""
import base64
import json
import re
from typing import Optional, Tuple

import google.generativeai as genai
from PIL import Image

from app.core.config import settings
from app.models.product import TikTokProductPayload, TikTokSKU, TikTokPrice, TikTokStockInfo
from app.services.extractor import image_to_bytes


_SYSTEM_PROMPT = """You are an e-commerce product listing specialist for TikTok Shop.
You will receive a product image and optional seller notes.
Generate a TikTok Shop product listing as strict JSON.

Rules:
- "sku_code": if a supplier/model code is visible (e.g. "BAC-146", "SKU-001"), extract it here. Otherwise null.
- "title": a clean, buyer-facing product name. Do NOT include the SKU/model code in the title.
- "description": product marketing copy in HTML. Do NOT include the SKU/model code in the description.
- "selling_price": set ONLY if explicitly provided in the seller notes. Otherwise null. Never guess.
- "cost_price": extract only the numeric value from whatever price is visible (e.g. "US$ 8.90" → "8.90", "FOB 12.50" → "12.50"). Return a plain decimal string with no currency symbols. Otherwise null.
- "package_dimensions": read ONLY from text visible in the image or extracted text (e.g. "SIZE: 7x3x17 CM"). Return as {"length": "7", "width": "3", "height": "17", "unit": "CENTIMETER"}. If not stated, return null. Never estimate.
- "package_weight": read ONLY from text visible in the image or extracted text. Return as {"value": "0.5", "unit": "KILOGRAM"}. If not stated, return null. Never estimate.
- "available_stock": read ONLY from text visible in the image or seller notes (e.g. "Stock: 50", "Qty: 200"). Return as an integer. If not stated, return null.
- "category_id": return null always — it will be assigned manually.
- "brand_id": null unless clearly stated.

Return ONLY valid JSON, no markdown, no explanation:
{
  "sku_code": "string or null",
  "title": "string (max 255 chars)",
  "description": "string (HTML ok, 50-1000 chars)",
  "category_id": null,
  "brand_id": null,
  "selling_price": "string or null",
  "cost_price": "string or null",
  "available_stock": null,
  "tags": ["string"],
  "package_weight": null,
  "package_dimensions": null
}"""

_USER_PROMPT_TEMPLATE = """Extracted text from the source (use this to read price, size, SKU etc.):
---
{extracted_text}
---

Seller notes:
---
{additional_text}
---

Generate the JSON now."""


def _build_prompt(extracted_text: str, additional_text: str) -> str:
    return _USER_PROMPT_TEMPLATE.format(
        extracted_text=extracted_text or "(none)",
        additional_text=additional_text or "(none)",
    )


def _parse_response(raw: str) -> dict:
    raw = re.sub(r"^```[a-z]*\n?", "", raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r"```$", "", raw.strip(), flags=re.MULTILINE)
    return json.loads(raw.strip())


def _img_part(img: Image.Image) -> dict:
    return {
        "inline_data": {
            "mime_type": "image/jpeg",
            "data": base64.b64encode(image_to_bytes(img, fmt="JPEG")).decode("utf-8"),
        }
    }


def _coerce_weight(raw) -> Optional[dict]:
    if not raw or raw in ("null", ""):
        return None
    if isinstance(raw, dict):
        return raw
    return None


def _coerce_dimensions(raw) -> Optional[dict]:
    if not raw or raw in ("null", ""):
        return None
    if isinstance(raw, dict):
        return raw
    # Gemini sometimes returns a plain string like "07X03X17 CM"
    if isinstance(raw, str):
        import re
        m = re.match(r"(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(cm|in|inch)?", raw.strip(), re.IGNORECASE)
        if m:
            unit = "INCH" if m.group(4) and m.group(4).lower().startswith("in") else "CENTIMETER"
            return {"length": m.group(1), "width": m.group(2), "height": m.group(3), "unit": unit}
    return None


def generate_product_payload(
    page_image: Image.Image,
    extracted_text: str,
    additional_text: str,
    selling_price_override: Optional[str] = None,
) -> Tuple[TikTokProductPayload, Optional[str], Optional[str], Optional[str]]:
    """
    Returns (TikTokProductPayload, selling_price, cost_price, sku_code).

    page_image: full page/slide render — Gemini sees all text labels from this.
    selling_price_override: explicit value from upload form — takes priority.
    """
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(
        model_name="gemini-3.1-flash-lite",
        system_instruction=_SYSTEM_PROMPT,
    )

    response = model.generate_content([
        _img_part(page_image),
        _build_prompt(extracted_text, additional_text),
    ])
    data = _parse_response(response.text)

    raw_sp = data.get("selling_price")
    selling_price = selling_price_override or (
        raw_sp if raw_sp not in (None, "", "null") else None
    )

    cost_price = data.get("cost_price")
    if cost_price in ("", "null", None):
        cost_price = None

    sku_code = data.get("sku_code")
    if sku_code in ("", "null", None):
        sku_code = None

    raw_stock = data.get("available_stock")
    stock = int(raw_stock) if isinstance(raw_stock, (int, float)) and raw_stock is not None else 0

    sku = TikTokSKU(
        original_price=TikTokPrice(
            amount=selling_price if selling_price else "0.00",
            currency="USD",
        ),
        stock_infos=[TikTokStockInfo(available_stock=stock)],
    )

    payload = TikTokProductPayload(
        title=data.get("title", "")[:255],
        description=data.get("description", ""),
        category_id=data.get("category_id") or "",
        brand_id=data.get("brand_id"),
        images=[],
        skus=[sku],
        package_weight=_coerce_weight(data.get("package_weight")),
        package_dimensions=_coerce_dimensions(data.get("package_dimensions")),
    )

    return payload, selling_price, cost_price, sku_code
