from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
import uuid
from datetime import datetime


class UploadType(str, Enum):
    single = "single"
    multiple = "multiple"


class PushStatus(str, Enum):
    pending = "pending"
    pushed = "pushed"
    failed = "failed"


# ── TikTok product sub-models ──────────────────────────────────────────────

class TikTokPrice(BaseModel):
    amount: str                  # string decimal, e.g. "29.99"
    currency: str = "USD"


class TikTokStockInfo(BaseModel):
    warehouse_id: str = ""
    available_stock: int = 0


class TikTokSKU(BaseModel):
    seller_sku: Optional[str] = None
    original_price: TikTokPrice     # selling price shown to buyer
    stock_infos: List[TikTokStockInfo] = Field(default_factory=lambda: [TikTokStockInfo()])
    sales_attributes: List[dict] = Field(default_factory=list)


class TikTokImage(BaseModel):
    uri: str                         # TikTok image URI after upload


class TikTokProductPayload(BaseModel):
    """Exact shape sent to TikTok create-product endpoint."""
    title: str
    description: str
    category_id: str = ""
    brand_id: Optional[str] = None
    images: List[TikTokImage] = Field(default_factory=list)
    skus: List[TikTokSKU] = Field(default_factory=list)
    package_weight: Optional[dict] = None   # {"value": "0.5", "unit": "KILOGRAM"}
    package_dimensions: Optional[dict] = None


# ── Internal product record stored in JSON db ──────────────────────────────

class ProductRecord(BaseModel):
    product_source_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    # Source metadata
    source_file: Optional[str] = None
    source_page: Optional[int] = None        # for multi-page docs
    upload_type: UploadType = UploadType.single

    # Sourcing info
    source_city: Optional[str] = None
    factory_name: Optional[str] = None

    # TikTok listing slot assigned for push
    tiktok_listing_id: Optional[str] = None

    # Pricing (both stored internally)
    cost_price: Optional[str] = None         # extracted from file/text
    selling_price: Optional[str] = None      # provided by user in text

    # Supplier SKU / model code extracted from source (e.g. "BAC-146")
    sku_code: Optional[str] = None

    # Extracted raw data
    extracted_text: Optional[str] = None
    additional_text: Optional[str] = None    # user-supplied text

    # Extracted product image saved to disk (relative path under data/images/)
    image_path: Optional[str] = None

    # Generated TikTok payload
    tiktok_payload: Optional[TikTokProductPayload] = None

    # Push state
    push_status: PushStatus = PushStatus.pending
    tiktok_product_id: Optional[str] = None
    push_error: Optional[str] = None


# ── API request/response models ────────────────────────────────────────────

class ProductResponse(BaseModel):
    product_source_id: str
    title: str
    description: str
    cost_price: Optional[str]
    selling_price: Optional[str]
    category_id: str
    images_count: int
    push_status: PushStatus
    tiktok_payload: TikTokProductPayload
    source_city: Optional[str] = None
    factory_name: Optional[str] = None
    tiktok_listing_id: Optional[str] = None
    sku_code: Optional[str] = None
    source_file: Optional[str] = None
    source_page: Optional[int] = None
    image_url: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PushRequest(BaseModel):
    product_source_ids: List[str]


class PushResult(BaseModel):
    product_source_id: str
    success: bool
    tiktok_product_id: Optional[str] = None
    error: Optional[str] = None


class ProductEditRequest(BaseModel):
    """Fields the UI may patch on an existing product record."""
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    cost_price: Optional[str] = None
    selling_price: Optional[str] = None
    package_weight: Optional[dict] = None
    package_dimensions: Optional[dict] = None
    source_city: Optional[str] = None
    factory_name: Optional[str] = None
    tiktok_listing_id: Optional[str] = None
    sku_code: Optional[str] = None
    available_stock: Optional[int] = None


class DeleteRequest(BaseModel):
    product_source_ids: List[str]


class DeleteResult(BaseModel):
    deleted: int


class BulkPriceUpdate(BaseModel):
    """Apply a pricing formula to a list of products (or all if ids is empty)."""
    product_source_ids: List[str] = Field(default_factory=list)  # empty = all
    formula: str  # e.g. "cost * 1.20" or "cost + 50"
    # Convenience fields for common formula: selling = cost * (1 + margin/100)
    margin_percent: Optional[float] = None  # overrides formula if set


class BulkPriceResult(BaseModel):
    updated: int
    skipped: int  # products with no cost_price
