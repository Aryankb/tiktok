from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str = ""

    tiktok_app_key: str = ""
    tiktok_app_secret: str = ""
    tiktok_access_token: str = ""
    tiktok_shop_cipher: str = ""
    tiktok_api_base_url: str = "https://open-api.tiktokglobalshop.com"

    tiktok_listing_ids: str = ""   # comma-separated product IDs used as live listing slots

    data_dir: str = "./data"
    uploads_dir: str = "./uploads"
    images_dir: str = "./data/images"   # extracted product images served statically
    products_db_file: str = "./data/products.json"

    def ensure_dirs(self) -> None:
        Path(self.data_dir).mkdir(parents=True, exist_ok=True)
        Path(self.uploads_dir).mkdir(parents=True, exist_ok=True)
        Path(self.images_dir).mkdir(parents=True, exist_ok=True)


settings = Settings()
