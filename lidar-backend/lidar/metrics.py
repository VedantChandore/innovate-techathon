"""
metrics.py - Extract pavement distress metrics from LiDAR processing output
PDAL pipeline outputs JSON; we parse and compute derived metrics.
"""
from typing import Any


def compute_metrics_from_dict(data: dict[str, Any]) -> dict[str, float | int]:
    """
    Compute lidar_metrics fields from processing output.
    data may come from PDAL pipeline metadata or from CSV row.
    """
    pothole_count = int(data.get("pothole_count", 0))
    pothole_total_volume_m3 = float(data.get("pothole_total_volume_m3", 0))
    avg_pothole_depth_mm = float(data.get("avg_pothole_depth_mm", 0))
    max_pothole_depth_mm = float(data.get("max_pothole_depth_mm", 0))
    avg_rut_depth_mm = float(data.get("avg_rut_depth_mm", 0))
    max_rut_depth_mm = float(data.get("max_rut_depth_mm", 0))
    roughness_proxy = float(data.get("roughness_proxy", 0))
    damaged_area_percent = float(data.get("damaged_area_percent", 0))
    point_density_pts_per_m2 = float(data.get("point_density_pts_per_m2", 0))
    lidar_quality_score = float(data.get("lidar_quality_score", 40))

    return {
        "pothole_count": pothole_count,
        "pothole_total_volume_m3": pothole_total_volume_m3,
        "avg_pothole_depth_mm": avg_pothole_depth_mm,
        "max_pothole_depth_mm": max_pothole_depth_mm,
        "avg_rut_depth_mm": avg_rut_depth_mm,
        "max_rut_depth_mm": max_rut_depth_mm,
        "roughness_proxy": roughness_proxy,
        "damaged_area_percent": damaged_area_percent,
        "point_density_pts_per_m2": point_density_pts_per_m2,
        "lidar_quality_score": lidar_quality_score,
    }


def compute_road_health_adjustment(
    base_score: float,
    pothole_total_volume_m3: float,
    avg_rut_depth_mm: float,
    damaged_area_percent: float,
) -> float:
    """
    new_score = base_score
      - (pothole_total_volume_m3 × 10)
      - (avg_rut_depth_mm × 0.5)
      - (damaged_area_percent × 5)
    Clamp 0-100.
    """
    adj = (
        base_score
        - (pothole_total_volume_m3 * 10)
        - (avg_rut_depth_mm * 0.5)
        - (damaged_area_percent * 5)
    )
    return max(0.0, min(100.0, adj))
