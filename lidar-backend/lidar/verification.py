"""
verification.py - Contractor verification: compare before/after LiDAR scans
"""
from models.workorder_models import ContractorPerformanceLog


def verify_repair(
    db_session,
    road_id: str,
    before_volume: float,
    after_volume: float,
    contractor_id: str | None = None,
    verified_by: str | None = None,
) -> ContractorPerformanceLog:
    """
    Create contractor performance log entry.
    improvement_percent = (before - after) / before * 100
    quality_score: 100 if reduction >= 90%, else proportional.
    """
    if before_volume <= 0:
        improvement_percent = 100.0
        quality_score = 100.0
    else:
        reduction = (before_volume - after_volume) / before_volume * 100
        improvement_percent = max(0, min(100, reduction))
        quality_score = improvement_percent if improvement_percent >= 90 else improvement_percent * 0.9

    log = ContractorPerformanceLog(
        road_id=road_id,
        contractor_id=contractor_id,
        before_volume=before_volume,
        after_volume=after_volume,
        improvement_percent=improvement_percent,
        quality_score=quality_score,
        verified_by=verified_by,
    )
    db_session.add(log)
    return log


def is_contractor_flagged(improvement_percent: float) -> bool:
    """Flag if reduction < 90%."""
    return improvement_percent < 90
