from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class OrderStatus(str, Enum):
    unpaid = "UNPAID"
    on_hold = "ON_HOLD"
    awaiting_shipment = "AWAITING_SHIPMENT"
    awaiting_collection = "AWAITING_COLLECTION"
    in_transit = "IN_TRANSIT"
    delivered = "DELIVERED"
    completed = "COMPLETED"
    cancelled = "CANCELLED"


class OrderLineItem(BaseModel):
    order_line_item_id: str
    product_id: str
    sku_id: str
    product_name: str
    sku_name: Optional[str] = None        # variation name e.g. "Blue / L"
    seller_sku: Optional[str] = None      # your internal SKU code
    sku_image: Optional[str] = None       # image URL from TikTok
    quantity: int = 1
    sale_price: Optional[str] = None      # per unit
    original_price: Optional[str] = None
    currency: Optional[str] = None
    listing_id: Optional[str] = None      # tiktok_listing_id — filled from our products DB


class OrderRecord(BaseModel):
    order_id: str
    status: str = ""
    create_time: int = 0                  # unix timestamp
    update_time: int = 0
    paid_time: Optional[int] = None
    currency: str = "SGD"
    total_amount: Optional[str] = None
    buyer_uid: Optional[str] = None
    line_items: List[OrderLineItem] = Field(default_factory=list)
    synced_at: Optional[str] = None       # ISO timestamp of when we fetched it


# ── API response models ────────────────────────────────────────────────────

class OrderLineItemResponse(BaseModel):
    order_id: str
    order_line_item_id: str
    product_id: str
    sku_id: str
    product_name: str
    sku_name: Optional[str] = None
    seller_sku: Optional[str] = None
    sku_image: Optional[str] = None
    quantity: int
    sale_price: Optional[str] = None
    currency: str = "SGD"
    listing_id: Optional[str] = None
    status: str = ""
    create_time: int = 0


class OrderSyncResult(BaseModel):
    fetched: int
    saved: int
    skipped: int
