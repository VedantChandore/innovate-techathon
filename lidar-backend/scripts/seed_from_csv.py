"""
seed_from_csv.py - Seed lidar_scans and lidar_metrics from maharashtra_lidar_metrics_500 .csv
Run from lidar-backend dir: python -m scripts.seed_from_csv
"""
import csv
import sys
from pathlib import Path

# Add project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from config import LIDAR_CSV_PATH, DATABASE_URL_SYNC


def parse_float(val, default=0.0):
    try:
        return float(val) if val else default
    except (ValueError, TypeError):
        return default


def parse_int(val, default=0):
    try:
        return int(float(val)) if val else default
    except (ValueError, TypeError):
        return default


def run_sync():
    from models.lidar_models import LidarScan, LidarMetrics
    from models.workorder_models import MaintenanceWorkOrder, Alert
    from lidar.workorder_engine import create_work_order_if_needed
    from sqlalchemy import select

    engine = create_engine(DATABASE_URL_SYNC)
    from models.base import Base
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    if not LIDAR_CSV_PATH.exists():
        print(f"CSV not found: {LIDAR_CSV_PATH}")
        return

    # damaged_area in CSV is decimal (0.0114 = 1.14%)
    def pct(val):
        v = parse_float(val, 0)
        return v * 100 if v and v < 1 else v

    with open(LIDAR_CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            road_id = row.get("road_id", "").strip()
            if not road_id:
                continue
            scan_id = row.get("scan_id", "").strip()
            if not scan_id:
                scan_id = f"seed-{road_id}-{i}"
            survey_date_str = row.get("last_lidar_survey_date", "").strip()
            survey_date = None
            if survey_date_str:
                try:
                    from datetime import datetime
                    survey_date = datetime.strptime(survey_date_str, "%Y-%m-%d").date()
                except ValueError:
                    pass

            existing = session.execute(select(LidarScan).where(LidarScan.id == scan_id)).scalar_one_or_none()
            if not existing:
                scan = LidarScan(
                    id=scan_id,
                    road_id=road_id,
                    lidar_source=row.get("lidar_source", "mobile"),
                    original_filename=row.get("las_filename", ""),
                    las_filename=row.get("las_filename", f"{scan_id}.laz"),
                    point_density=parse_float(row.get("point_density_pts_per_m2")),
                    survey_date=survey_date,
                    status="completed",
                    potree_url=row.get("potree_url"),
                )
                session.add(scan)
            session.flush()

            existing_m = session.execute(select(LidarMetrics).where(LidarMetrics.scan_id == scan_id)).scalar_one_or_none()
            if not existing_m:
                metrics = LidarMetrics(
                    road_id=road_id,
                    scan_id=scan_id,
                    pothole_count=parse_int(row.get("pothole_count")),
                    pothole_total_volume_m3=parse_float(row.get("pothole_total_volume_m3")),
                    avg_pothole_depth_mm=parse_float(row.get("avg_pothole_depth_mm")),
                    max_pothole_depth_mm=parse_float(row.get("max_pothole_depth_mm")),
                    avg_rut_depth_mm=parse_float(row.get("avg_rut_depth_mm")),
                    max_rut_depth_mm=parse_float(row.get("max_rut_depth_mm")),
                    roughness_proxy=parse_float(row.get("roughness_proxy")),
                    damaged_area_percent=pct(row.get("damaged_area_percent")),
                    point_density_pts_per_m2=parse_float(row.get("point_density_pts_per_m2")),
                    lidar_quality_score=parse_float(row.get("lidar_quality_score"), 40),
                )
                session.add(metrics)
                session.flush()

            metrics_obj = session.execute(select(LidarMetrics).where(LidarMetrics.scan_id == scan_id)).scalar_one_or_none()
            if metrics_obj:
                wo = create_work_order_if_needed(session, road_id, scan_id, metrics_obj)
                if wo:
                    session.add(Alert(
                        road_id=road_id,
                        work_order_id=wo.id,
                        alert_type="work_order_created",
                        message=f"Work order {wo.severity} created for {road_id}",
                    ))

    session.commit()
    print(f"Seeded from {LIDAR_CSV_PATH}")


if __name__ == "__main__":
    run_sync()
