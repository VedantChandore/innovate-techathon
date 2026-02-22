"""
workorder_engine.py - Rule engine for automated work order generation
"""
from typing import Literal

from config import RATE_PER_M3
from models.workorder_models import MaintenanceWorkOrder
from models.lidar_models import LidarMetrics


SeverityType = Literal["low", "medium", "high", "critical"]


def evaluate_work_order(metrics: LidarMetrics) -> bool:
    """
    Returns True if work order should be created:
    - max_pothole_depth_mm > 80  OR
    - damaged_area_percent > 2%  OR
    - avg_rut_depth_mm > 12
    """
    return (
        metrics.max_pothole_depth_mm > 80
        or metrics.damaged_area_percent > 2.0
        or metrics.avg_rut_depth_mm > 12
    )


def classify_severity(
    max_pothole_depth_mm: float,
    damaged_area_percent: float,
) -> SeverityType:
    """
    Critical → depth > 120mm OR damage > 5%
    High → depth > 80mm
    Medium → damage 1–2%
    Low → minor defects
    """
    if max_pothole_depth_mm > 120 or damaged_area_percent > 5:
        return "critical"
    if max_pothole_depth_mm > 80:
        return "high"
    if 1.0 <= damaged_area_percent <= 2.0:
        return "medium"
    return "low"


def get_recommended_action(severity: SeverityType) -> str:
    if severity == "critical":
        return "reconstruction"
    if severity == "high":
        return "overlay"
    return "patch"


def get_sla_days(severity: SeverityType) -> int:
    return {"critical": 7, "high": 15, "medium": 30, "low": 60}[severity]


def create_work_order_if_needed(
    db_session,
    road_id: str,
    scan_id: str,
    metrics: LidarMetrics,
) -> MaintenanceWorkOrder | None:
    """
    If metrics exceed thresholds, create MaintenanceWorkOrder.
    Returns the work order or None.
    """
    if not evaluate_work_order(metrics):
        return None

    severity = classify_severity(
        metrics.max_pothole_depth_mm,
        metrics.damaged_area_percent,
    )
    recommended_action = get_recommended_action(severity)
    sla_days = get_sla_days(severity)
    vol = metrics.pothole_total_volume_m3
    cost = vol * RATE_PER_M3

    wo = MaintenanceWorkOrder(
        road_id=road_id,
        scan_id=scan_id,
        severity=severity,
        estimated_repair_volume_m3=vol,
        estimated_cost=cost,
        recommended_action=recommended_action,
        sla_days=sla_days,
        status="pending",
    )
    db_session.add(wo)
    return wo
