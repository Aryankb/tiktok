"""
Generates a factory-ready Excel file for one listing ID.

Layout:
  Row 1: Header (listing ID)
  Row 2: Date range (first order → last order in data, not filter range)
  Row 3: Inclusion note (which statuses are counted)
  Row 4: Column headers
  Row 5+: One row per unique SKU — Image | Product Name | Variation | Supplier SKU | Total Qty

Only ACTIVE statuses counted: IN_TRANSIT, DELIVERED, AWAITING_SHIPMENT,
AWAITING_COLLECTION, COMPLETED (without refund — we can't detect refunds,
so COMPLETED is excluded to be safe).
"""
import io
import urllib.request
from datetime import datetime, timezone
from typing import List, Optional

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from app.models.order import OrderRecord


# Statuses included in factory count — excludes CANCELLED, UNPAID, COMPLETED
# (COMPLETED may include refunded orders which we cannot distinguish via API)
_INCLUDED_STATUSES = {"IN_TRANSIT", "DELIVERED", "AWAITING_SHIPMENT", "AWAITING_COLLECTION"}
_EXCLUDED_NOTE = "Included: IN_TRANSIT, DELIVERED, AWAITING_SHIPMENT, AWAITING_COLLECTION   |   Excluded: CANCELLED, UNPAID, COMPLETED"

_HEADER_FILL = PatternFill("solid", fgColor="1A1A2E")
_SUBHEADER_FILL = PatternFill("solid", fgColor="E94560")
_NOTE_FILL = PatternFill("solid", fgColor="2D2D44")
_ALT_FILL = PatternFill("solid", fgColor="F5F5F5")
_WHITE_FILL = PatternFill("solid", fgColor="FFFFFF")
_BORDER = Border(
    left=Side(style="thin", color="DDDDDD"),
    right=Side(style="thin", color="DDDDDD"),
    top=Side(style="thin", color="DDDDDD"),
    bottom=Side(style="thin", color="DDDDDD"),
)

_IMG_ROW_HEIGHT = 120
_IMG_COL_WIDTH = 20


def _fetch_image_bytes(url: str) -> Optional[bytes]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.read()
    except Exception:
        return None


def _add_image_to_cell(ws, img_bytes: bytes, col: int, row: int, size: int = 70):
    try:
        img = XLImage(io.BytesIO(img_bytes))
        img.width = size
        img.height = size
        ws.add_image(img, f"{get_column_letter(col)}{row}")
    except Exception:
        pass


def _fmt_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%d %b %Y")


def generate_factory_excel(
    orders: List[OrderRecord],
    listing_id: str,
    date_from: str,   # kept for API compat but NOT used in header
    date_to: str,
) -> bytes:
    # ── Aggregate — only included statuses ────────────────────────────────
    agg: dict = {}
    min_ts: int = 0
    max_ts: int = 0

    for order in orders:
        if order.status not in _INCLUDED_STATUSES:
            continue
        for item in order.line_items:
            if item.listing_id != listing_id:
                continue

            # Track actual date range from orders
            if order.create_time:
                if min_ts == 0 or order.create_time < min_ts:
                    min_ts = order.create_time
                if order.create_time > max_ts:
                    max_ts = order.create_time

            sid = item.sku_id or f"{item.product_name}|{item.sku_name}"
            if sid not in agg:
                agg[sid] = {
                    "product_name": item.product_name,
                    "sku_name": item.sku_name or "",
                    "seller_sku": item.seller_sku or "",
                    "sku_image": item.sku_image or "",
                    "total_qty": 0,
                }
            agg[sid]["total_qty"] += item.quantity

    rows = list(agg.values())
    rows.sort(key=lambda r: (r["product_name"], r["sku_name"]))

    # ── Date range label from actual orders ───────────────────────────────
    if min_ts and max_ts:
        date_label = f"{_fmt_ts(min_ts)}  →  {_fmt_ts(max_ts)}"
    else:
        date_label = "All dates"

    # ── Build workbook ────────────────────────────────────────────────────
    wb = Workbook()
    ws = wb.active
    ws.title = f"Listing {listing_id[-6:]}"

    NUM_COLS = 5  # Image | Product Name | Variation | Supplier SKU | Total Qty
    last_col = get_column_letter(NUM_COLS)

    # Row 1 — title
    ws.merge_cells(f"A1:{last_col}1")
    c = ws["A1"]
    c.value = f"Factory Order Sheet   |   Listing ID: {listing_id}"
    c.font = Font(name="Calibri", bold=True, color="FFFFFF", size=13)
    c.fill = _HEADER_FILL
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 28

    # Row 2 — date range (from actual orders)
    ws.merge_cells(f"A2:{last_col}2")
    c = ws["A2"]
    c.value = f"Orders: {date_label}   |   {len(rows)} unique products   |   {sum(r['total_qty'] for r in rows)} total units"
    c.font = Font(name="Calibri", italic=True, color="FFFFFF", size=10)
    c.fill = _HEADER_FILL
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 20

    # Row 3 — inclusion note
    ws.merge_cells(f"A3:{last_col}3")
    c = ws["A3"]
    c.value = _EXCLUDED_NOTE
    c.font = Font(name="Calibri", italic=True, color="AAAACC", size=9)
    c.fill = _NOTE_FILL
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[3].height = 16

    # Row 4 — column headers
    headers = ["Image", "Product Name", "Variation", "Supplier SKU", "Total Qty"]
    col_widths = [_IMG_COL_WIDTH, 40, 25, 18, 12]

    for col_idx, (header, width) in enumerate(zip(headers, col_widths), start=1):
        cell = ws.cell(row=4, column=col_idx, value=header)
        cell.font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
        cell.fill = _SUBHEADER_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = _BORDER
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    ws.row_dimensions[4].height = 22

    # Rows 5+ — data
    for row_idx, item in enumerate(rows, start=5):
        fill = _ALT_FILL if row_idx % 2 == 0 else _WHITE_FILL
        ws.row_dimensions[row_idx].height = _IMG_ROW_HEIGHT

        # Col A — image
        img_cell = ws.cell(row=row_idx, column=1, value="")
        img_cell.fill = fill
        img_cell.border = _BORDER
        if item["sku_image"]:
            img_bytes = _fetch_image_bytes(item["sku_image"])
            if img_bytes:
                _add_image_to_cell(ws, img_bytes, 1, row_idx, size=100)

        # Col B — product name
        cell = ws.cell(row=row_idx, column=2, value=item["product_name"])
        cell.font = Font(name="Calibri", size=10, bold=True)
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        cell.fill = fill
        cell.border = _BORDER

        # Col C — variation
        cell = ws.cell(row=row_idx, column=3, value=item["sku_name"] or "—")
        cell.font = Font(name="Calibri", size=10)
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.fill = fill
        cell.border = _BORDER

        # Col D — supplier SKU
        cell = ws.cell(row=row_idx, column=4, value=item["seller_sku"] or "—")
        cell.font = Font(name="Calibri", size=10, color="666666")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.fill = fill
        cell.border = _BORDER

        # Col E — total qty
        cell = ws.cell(row=row_idx, column=5, value=item["total_qty"])
        cell.font = Font(name="Calibri", size=11, bold=True)
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.fill = fill
        cell.border = _BORDER

    # ── Totals row ────────────────────────────────────────────────────────
    total_row = len(rows) + 5
    ws.merge_cells(f"A{total_row}:D{total_row}")
    total_label = ws.cell(row=total_row, column=1, value="TOTAL")
    total_label.font = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
    total_label.fill = _SUBHEADER_FILL
    total_label.alignment = Alignment(horizontal="right", vertical="center")
    total_label.border = _BORDER

    total_qty_cell = ws.cell(row=total_row, column=5, value=sum(r["total_qty"] for r in rows))
    total_qty_cell.font = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
    total_qty_cell.fill = _SUBHEADER_FILL
    total_qty_cell.alignment = Alignment(horizontal="center", vertical="center")
    total_qty_cell.border = _BORDER

    ws.row_dimensions[total_row].height = 22
    ws.freeze_panes = "A5"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
