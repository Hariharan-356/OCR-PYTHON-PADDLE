from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]


@dataclass
class Settings:
    service_host: str = os.getenv('OCR_SERVICE_HOST', '127.0.0.1')
    service_port: int = int(os.getenv('OCR_SERVICE_PORT', '8001'))
    shared_secret: str = os.getenv('OCR_SERVICE_SECRET', 'claims-digi-local')
    max_upload_mb: int = int(os.getenv('OCR_MAX_FILE_MB', '50'))
    max_total_bytes: int = int(os.getenv('OCR_MAX_TOTAL_BYTES', '200000000'))
    allow_untrusted: bool = os.getenv('OCR_ALLOW_UNTRUSTED', 'false').lower() == 'true'
    tmp_dir: Path = Path(os.getenv('OCR_TMP_DIR', BASE_DIR / 'tmp'))
    model_dir: Path = Path(os.getenv('OCR_MODEL_DIR', BASE_DIR / 'models'))
    primary_engine: str = os.getenv('OCR_PRIMARY_ENGINE', 'paddleocr')
    secondary_engine: str = os.getenv('OCR_SECONDARY_ENGINE', 'easyocr')

    def __post_init__(self) -> None:
        self.tmp_dir.mkdir(parents=True, exist_ok=True)
        self.model_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
