"""
POST   /api/products/upload      — ingest file, generate TikTok payload, save to JSON db
GET    /api/products/             — list all saved products
GET    /api/products/{id}         — get single product
PATCH  /api/products/{id}         — edit a product record
POST   /api/products/push         — push selected products to TikTok
PATCH  /api/products/bulk-price   — apply price formula to selected/all products
"""
import asyncio
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.core.config import settings
from app.models.product import (
    BulkPriceResult,
    BulkPriceUpdate,
    DeleteRequest,
    DeleteResult,
    ProductEditRequest,
    ProductRecord,
    ProductResponse,
    PushRequest,
    PushResult,
    TikTokProductPayload,
    TikTokPrice,
    UploadType,
    PushStatus,
)
from app.services import db
from app.services.extractor import extract_pages
from app.services.gemini_service import generate_product_payload
from app.services.tiktok_service import push_product_to_tiktok

router = APIRouter(prefix="/api/products", tags=["products"])


def _record_to_response(r: ProductRecord) -> ProductResponse:
    payload = r.tiktok_payload or TikTokProductPayload(title="", description="")
    return ProductResponse(
        product_source_id=r.product_source_id,
        title=payload.title,
        description=payload.description,
        cost_price=r.cost_price,
        selling_price=r.selling_price,
        category_id=payload.category_id,
        images_count=len(payload.images),
        push_status=r.push_status,
        tiktok_payload=payload,
        source_city=r.source_city,
        factory_name=r.factory_name,
        tiktok_listing_id=r.tiktok_listing_id,
        sku_code=r.sku_code,
        source_file=r.source_file,
        source_page=r.source_page,
        image_url=r.image_path and f"/static/images/{Path(r.image_path).name}",
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


# ── Upload (preview only — does NOT save to DB) ────────────────────────────

@router.post("/upload", response_model=List[ProductResponse])
async def upload_products(
    upload_type: UploadType = Form(...),
    file: UploadFile = File(...),
    text: Optional[str] = Form(None),
    selling_price: Optional[str] = Form(None),
    source_city: Optional[str] = Form(None),
    factory_name: Optional[str] = Form(None),
):
    """
    Extracts pages, calls Gemini, and returns preview records.
    Nothing is written to the database until POST /confirm is called.
    """
    file_bytes = await file.read()
    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower()

    if upload_type == UploadType.single:
        allowed = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".gif"}
        if ext not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Single upload only accepts image files, got: {ext}",
            )

    if upload_type == UploadType.multiple:
        allowed = {".pdf", ".pptx", ".ppt"}
        if ext not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Multiple upload requires a PDF or PPTX file, got: {ext}",
            )

    Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
    (Path(settings.uploads_dir) / filename).write_bytes(file_bytes)

    loop = asyncio.get_event_loop()
    pages = await loop.run_in_executor(None, extract_pages, file_bytes, filename)

    if not pages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract any pages/images from the uploaded file.",
        )

    async def process_page(page_data):
        # Gemini receives the full page image — it can see all text labels
        payload, sp, cp, sku_code = await loop.run_in_executor(
            None,
            generate_product_payload,
            page_data.page_image,
            page_data.extracted_text,
            text or "",
            selling_price,
        )

        # Save the YOLO-cropped thumbnail to disk for the UI
        from app.services.extractor import image_to_bytes
        img_filename = f"{filename}_page{page_data.page_index}.jpg"
        img_path = Path(settings.images_dir) / img_filename
        img_bytes = await loop.run_in_executor(
            None, image_to_bytes, page_data.image, "JPEG"
        )
        img_path.write_bytes(img_bytes)

        record = ProductRecord(
            source_file=filename,
            source_page=page_data.page_index,
            upload_type=upload_type,
            source_city=source_city,
            factory_name=factory_name,
            cost_price=cp,
            selling_price=sp,
            sku_code=sku_code,
            extracted_text=page_data.extracted_text,
            additional_text=text,
            tiktok_payload=payload,
            image_path=str(img_path),
        )
        return record

    records = await asyncio.gather(*[process_page(p) for p in pages])
    return [_record_to_response(r) for r in records]


# ── Confirm: save previewed products to DB ─────────────────────────────────

@router.post("/confirm", response_model=List[ProductResponse])
async def confirm_products(products: List[ProductResponse]):
    """
    Receive the (possibly user-edited) preview records and persist them to the JSON DB.
    The UI sends back the full list after the user reviews/edits the Gemini output.
    """
    saved = []
    for p in products:
        # Reconstruct a full ProductRecord from the response shape
        existing = await db.get_product(p.product_source_id)
        if existing:
            # Already saved (e.g. double-confirm) — just update
            record = existing
        else:
            record = ProductRecord(product_source_id=p.product_source_id)

        payload = p.tiktok_payload
        record.tiktok_payload = payload
        record.cost_price = p.cost_price
        record.selling_price = p.selling_price
        record.source_city = p.source_city
        record.factory_name = p.factory_name
        record.tiktok_listing_id = p.tiktok_listing_id
        record.sku_code = p.sku_code
        record.source_file = p.source_file
        record.source_page = p.source_page
        # Re-derive image_path from the served URL if present
        if p.image_url:
            img_name = Path(p.image_url).name
            record.image_path = str(Path(settings.images_dir) / img_name)

        await db.save_product(record)
        saved.append(record)

    return [_record_to_response(r) for r in saved]


# ── List / Get ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ProductResponse])
async def list_all_products():
    records = await db.list_products()
    return [_record_to_response(r) for r in records]


# ── Bulk price formula (must be before /{id} to avoid path collision) ──────

@router.patch("/bulk-price", response_model=BulkPriceResult)
async def bulk_update_prices(body: BulkPriceUpdate):
    """
    Apply a price formula to products.
    If margin_percent is set: selling_price = cost_price * (1 + margin_percent / 100)
    Otherwise evaluates body.formula with `cost` as the cost_price variable.
    """
    if body.product_source_ids:
        records = await db.get_products_by_ids(body.product_source_ids)
    else:
        records = await db.list_products()

    updated = 0
    skipped = 0

    for record in records:
        if not record.cost_price:
            skipped += 1
            continue
        try:
            cost = float(record.cost_price)
        except ValueError:
            skipped += 1
            continue

        if body.margin_percent is not None:
            new_price = cost * (1 + body.margin_percent / 100)
        else:
            # Evaluate formula safely — only allow simple math with `cost`
            allowed_names = {"cost": cost, "abs": abs, "round": round, "min": min, "max": max}
            new_price = float(eval(body.formula, {"__builtins__": {}}, allowed_names))  # noqa: S307

        new_price_str = f"{new_price:.2f}"
        record.selling_price = new_price_str

        if record.tiktok_payload and record.tiktok_payload.skus:
            record.tiktok_payload.skus[0].original_price = TikTokPrice(
                amount=new_price_str, currency="USD"
            )

        await db.save_product(record)
        updated += 1

    return BulkPriceResult(updated=updated, skipped=skipped)


# ── Delete products ────────────────────────────────────────────────────────

@router.delete("/delete", response_model=DeleteResult)
async def delete_products(body: DeleteRequest):
    deleted = await db.delete_products(body.product_source_ids)
    return DeleteResult(deleted=deleted)


# ── Get / Edit single product ──────────────────────────────────────────────

@router.get("/{product_source_id}", response_model=ProductResponse)
async def get_product(product_source_id: str):
    record = await db.get_product(product_source_id)
    if not record:
        raise HTTPException(status_code=404, detail="Product not found")
    return _record_to_response(record)


@router.patch("/{product_source_id}", response_model=ProductResponse)
async def edit_product(product_source_id: str, body: ProductEditRequest):
    record = await db.get_product(product_source_id)
    if not record:
        raise HTTPException(status_code=404, detail="Product not found")

    payload = record.tiktok_payload or TikTokProductPayload(title="", description="")

    if body.title is not None:
        payload.title = body.title
    if body.description is not None:
        payload.description = body.description
    if body.category_id is not None:
        payload.category_id = body.category_id
    if body.package_weight is not None:
        payload.package_weight = body.package_weight
    if body.package_dimensions is not None:
        payload.package_dimensions = body.package_dimensions

    if body.selling_price is not None:
        record.selling_price = body.selling_price
        if payload.skus:
            payload.skus[0].original_price = TikTokPrice(amount=body.selling_price, currency="USD")

    if body.cost_price is not None:
        record.cost_price = body.cost_price
    if body.source_city is not None:
        record.source_city = body.source_city
    if body.factory_name is not None:
        record.factory_name = body.factory_name
    if body.tiktok_listing_id is not None:
        record.tiktok_listing_id = body.tiktok_listing_id
    if body.sku_code is not None:
        record.sku_code = body.sku_code
    if body.available_stock is not None:
        if payload.skus:
            for sku in payload.skus:
                for si in sku.stock_infos:
                    si.available_stock = body.available_stock

    record.tiktok_payload = payload
    await db.save_product(record)
    return _record_to_response(record)


# ── Push to TikTok ─────────────────────────────────────────────────────────

@router.post("/push", response_model=List[PushResult])
async def push_products(body: PushRequest):
    records = await db.get_products_by_ids(body.product_source_ids)
    if not records:
        raise HTTPException(status_code=404, detail="No matching products found")

    async def push_one(record: ProductRecord) -> PushResult:
        if not record.tiktok_payload:
            return PushResult(
                product_source_id=record.product_source_id,
                success=False,
                error="No TikTok payload generated yet",
            )
        try:
            tiktok_id = await push_product_to_tiktok(record.tiktok_payload)
            record.push_status = PushStatus.pushed
            record.tiktok_product_id = tiktok_id
            await db.save_product(record)
            return PushResult(
                product_source_id=record.product_source_id,
                success=True,
                tiktok_product_id=tiktok_id,
            )
        except Exception as exc:
            record.push_status = PushStatus.failed
            record.push_error = str(exc)
            await db.save_product(record)
            return PushResult(
                product_source_id=record.product_source_id,
                success=False,
                error=str(exc),
            )

    results = await asyncio.gather(*[push_one(r) for r in records])
    return list(results)
