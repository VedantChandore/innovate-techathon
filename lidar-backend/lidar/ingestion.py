"""
ingestion.py - File ingestion pipeline: save raw, convert XYZ->LAS, store metadata
"""
import shutil
import uuid
from pathlib import Path
from datetime import datetime

from config import RAW_UPLOADS_DIR, LAS_DIR, MAX_UPLOAD_SIZE_MB, MIN_POINT_DENSITY
from models.lidar_models import LidarScan


def ensure_dirs() -> None:
    RAW_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    LAS_DIR.mkdir(parents=True, exist_ok=True)


def save_raw_file(file_content: bytes, filename: str, scan_id: str | None = None) -> Path:
    """Save uploaded file to raw storage."""
    ensure_dirs()
    sid = scan_id or str(uuid.uuid4())
    ext = Path(filename).suffix.lower() or ".xyz"
    out_path = RAW_UPLOADS_DIR / f"{sid}{ext}"
    out_path.write_bytes(file_content)
    return out_path


def convert_xyz_to_las(raw_path: Path, scan_id: str) -> Path | None:
    """
    Convert .xyz to .las/.laz using PDAL.
    Returns path to LAS file, or None if conversion fails.
    In mock mode (PDAL not installed), we create a placeholder and return it.
    """
    import json
    try:
        import pdal
        pipeline_json = [
            {"type": "readers.text", "filename": str(raw_path), "separator": " "},
            {"type": "filters.reciprocity"},
            {"type": "writers.las", "filename": str(LAS_DIR / f"{scan_id}.las"), "compression": "laszip"},
        ]
        pipeline = pdal.Pipeline(json.dumps(pipeline_json))
        pipeline.execute()
        return LAS_DIR / f"{scan_id}.laz"
    except ImportError:
        # Mock: just copy or create placeholder
        las_path = LAS_DIR / f"{scan_id}.laz"
        las_path.parent.mkdir(parents=True, exist_ok=True)
        las_path.touch()
        return las_path
    except Exception:
        return None


def create_scan_record(
    db_session,
    road_id: str,
    lidar_source: str,
    original_filename: str,
    las_filename: str,
    point_density: float,
    survey_date: str | None,
    status: str = "completed",
    potree_url: str | None = None,
) -> LidarScan:
    scan_id = str(uuid.uuid4())
    scan = LidarScan(
        id=scan_id,
        road_id=road_id,
        lidar_source=lidar_source,
        original_filename=original_filename,
        las_filename=las_filename,
        point_density=point_density,
        survey_date=datetime.fromisoformat(survey_date.replace("Z", "+00:00")).date() if survey_date else None,
        status=status,
        potree_url=potree_url,
    )
    db_session.add(scan)
    return scan
