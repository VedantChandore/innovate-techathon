"""Unit tests for work order trigger logic"""
import pytest
from lidar.workorder_engine import (
    evaluate_work_order,
    classify_severity,
    get_recommended_action,
    get_sla_days,
)
from models.lidar_models import LidarMetrics


def _metrics(max_depth=0, damage_pct=0, avg_rut=0, **kw):
    return LidarMetrics(
        road_id="MA-TEST-001",
        scan_id="scan-1",
        max_pothole_depth_mm=max_depth,
        damaged_area_percent=damage_pct,
        avg_rut_depth_mm=avg_rut,
        **kw,
    )


def test_evaluate_work_order_triggers_on_depth():
    m = _metrics(max_depth=85)
    assert evaluate_work_order(m) is True


def test_evaluate_work_order_triggers_on_damage():
    m = _metrics(damage_pct=2.5)
    assert evaluate_work_order(m) is True


def test_evaluate_work_order_triggers_on_rut():
    m = _metrics(avg_rut=13)
    assert evaluate_work_order(m) is True


def test_evaluate_work_order_no_trigger():
    m = _metrics(max_depth=50, damage_pct=1, avg_rut=8)
    assert evaluate_work_order(m) is False


def test_classify_severity_critical():
    assert classify_severity(130, 3) == "critical"
    assert classify_severity(100, 6) == "critical"


def test_classify_severity_high():
    assert classify_severity(90, 1) == "high"


def test_get_recommended_action():
    assert get_recommended_action("critical") == "reconstruction"
    assert get_recommended_action("high") == "overlay"
    assert get_recommended_action("medium") == "patch"


def test_get_sla_days():
    assert get_sla_days("critical") == 7
    assert get_sla_days("high") == 15
