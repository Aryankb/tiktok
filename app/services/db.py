"""
Simple local JSON file database for product records.
Thread-safe via a file lock (asyncio-friendly with run_in_executor).
"""
import json
import asyncio
from pathlib import Path
from typing import List, Optional, Dict
from functools import partial

from app.core.config import settings
from app.models.product import ProductRecord


def _load_all() -> Dict[str, dict]:
    path = Path(settings.products_db_file)
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_all(data: Dict[str, dict]) -> None:
    path = Path(settings.products_db_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _upsert(record: ProductRecord) -> None:
    from datetime import datetime
    record.updated_at = datetime.utcnow().isoformat()
    data = _load_all()
    data[record.product_source_id] = record.model_dump(mode="json")
    _save_all(data)


def _get(product_source_id: str) -> Optional[ProductRecord]:
    data = _load_all()
    raw = data.get(product_source_id)
    if raw is None:
        return None
    return ProductRecord.model_validate(raw)


def _list_all() -> List[ProductRecord]:
    data = _load_all()
    return [ProductRecord.model_validate(v) for v in data.values()]


def _get_many(ids: List[str]) -> List[ProductRecord]:
    data = _load_all()
    result = []
    for pid in ids:
        raw = data.get(pid)
        if raw:
            result.append(ProductRecord.model_validate(raw))
    return result


def _delete_many(ids: List[str]) -> int:
    data = _load_all()
    deleted = 0
    for pid in ids:
        if pid in data:
            del data[pid]
            deleted += 1
    _save_all(data)
    return deleted


# ── Async wrappers ─────────────────────────────────────────────────────────

async def save_product(record: ProductRecord) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, partial(_upsert, record))


async def get_product(product_source_id: str) -> Optional[ProductRecord]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(_get, product_source_id))


async def list_products() -> List[ProductRecord]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _list_all)


async def get_products_by_ids(ids: List[str]) -> List[ProductRecord]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(_get_many, ids))


async def delete_products(ids: List[str]) -> int:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(_delete_many, ids))
