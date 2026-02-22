"""Unit tests for metric calculations"""
import pytest
from lidar.metrics import compute_metrics_from_dict, compute_road_health_adjustment


def test_compute_metrics_from_dict():
    data = {
        "pothole_count": 10,
        "pothole_total_volume_m3": 1.5,
        "avg_pothole_depth_mm": 80,
        "max_pothole_depth_mm": 120,
        "avg_rut_depth_mm": 8,
        "max_rut_depth_mm": 12,
        "roughness_proxy": 2.5,
        "damaged_area_percent": 3.0,
        "point_density_pts_per_m2": 150,
        "lidar_quality_score": 75,
    }
    m = compute_metrics_from_dict(data)
    assert m["pothole_count"] == 10
    assert m["pothole_total_volume_m3"] == 1.5
    assert m["max_pothole_depth_mm"] == 120
    assert m["damaged_area_percent"] == 3.0


def test_compute_road_health_adjustment():
    score = compute_road_health_adjustment(
        base_score=80,
        pothole_total_volume_m3=2.0,
        avg_rut_depth_mm=10,
        damaged_area_percent=4,
    )
    # 80 - 20 - 5 - 20 = 35
    assert score == 35
