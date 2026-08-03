"""
Simple local JSON file database for order records.
Mirrors the pattern used in db.py for products.
"""
import json
import asyncio
from pathlib import Path
from typing import List, Optional, Dict
from functools import partial

from app.core.config import settings
from app.models.order import OrderRecord


def _db_path() -> Path:
    return Path(settings.data_dir) / "orders.json"


def _load_all() -> Dict[str, dict]:
    path = _db_path()
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_all(data: Dict[str, dict]) -> None:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _upsert(record: OrderRecord) -> None:
    data = _load_all()
    data[record.order_id] = record.model_dump(mode="json")
    _save_all(data)


def _upsert_many(records: List[OrderRecord]) -> int:
    data = _load_all()
    count = 0
    for record in records:
        data[record.order_id] = record.model_dump(mode="json")
        count += 1
    _save_all(data)
    return count


def _list_all() -> List[OrderRecord]:
    data = _load_all()
    return [OrderRecord.model_validate(v) for v in data.values()]


def _get(order_id: str) -> Optional[OrderRecord]:
    data = _load_all()
    raw = data.get(order_id)
    return OrderRecord.model_validate(raw) if raw else None


# ── Async wrappers ─────────────────────────────────────────────────────────

async def save_orders(records: List[OrderRecord]) -> int:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(_upsert_many, records))


async def list_orders() -> List[OrderRecord]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _list_all)


async def get_order(order_id: str) -> Optional[OrderRecord]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(_get, order_id))
