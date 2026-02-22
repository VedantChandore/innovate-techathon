"""
config.py - Configuration for LiDAR Backend
"""
import os
from pathlib import Path

# Project paths
PROJECT_ROOT = Path(__file__).parent.resolve()
LIDAR_CSV_PATH = Path(
    os.environ.get(
        "LIDAR_CSV_PATH",
        str(PROJECT_ROOT.parent / "maharashtra_lidar_metrics_500 .csv")
    )
)

# Database: PostgreSQL preferred; SQLite for local dev without Postgres
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"sqlite+aiosqlite:///{PROJECT_ROOT / 'lidar.db'}"
)
# Sync URL for migrations/seed (SQLAlchemy sync engine)
DATABASE_URL_SYNC = DATABASE_URL.replace("+aiosqlite", "").replace("sqlite+aiosqlite", "sqlite")

# Storage
STORAGE_ROOT = Path(os.environ.get("LIDAR_STORAGE", str(PROJECT_ROOT / "storage")))
RAW_UPLOADS_DIR = STORAGE_ROOT / "raw"
LAS_DIR = STORAGE_ROOT / "las"
POTREE_VIEWER_DIR = STORAGE_ROOT / "potree"

# Limits
MAX_UPLOAD_SIZE_MB = int(os.environ.get("MAX_UPLOAD_SIZE_MB", 500))
MIN_POINT_DENSITY = float(os.environ.get("MIN_POINT_DENSITY", 5.0))
RATE_PER_M3 = float(os.environ.get("RATE_PER_M3", 15000))  # ₹/m³ repair

# API
LIDAR_API_PORT = int(os.environ.get("LIDAR_API_PORT", 8001))
