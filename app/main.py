from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.api.products import router as products_router
from app.api.categories import router as categories_router

app = FastAPI(
    title="TikTok Live Commerce Admin",
    description="Backend for managing product listings for TikTok Shop live commerce.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    settings.ensure_dirs()
    # Mount after ensure_dirs so the directory is guaranteed to exist
    app.mount("/static/images", StaticFiles(directory=settings.images_dir), name="images")


app.include_router(products_router)
app.include_router(categories_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
