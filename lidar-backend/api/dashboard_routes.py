"""
dashboard_routes.py - Dashboard KPIs and metrics
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.base import get_db
from models.lidar_models import LidarScan, LidarMetrics
from models.workorder_models import MaintenanceWorkOrder, ContractorPerformanceLog, Alert

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/kpis")
async def get_kpis(
    session: AsyncSession = Depends(get_db),
    month: str | None = Query(None, description="YYYY-MM"),
):
    """
    Dashboard KPIs:
    - Km scanned this month
    - Total pothole volume statewide
    - % roads in safe condition
    - Contractor average quality score
    - SLA compliance rate
    """
    now = datetime.utcnow()
    if month:
        try:
            y, m = map(int, month.split("-"))
            start = datetime(y, m, 1)
            end = start + timedelta(days=32)
            end = datetime(end.year, end.month, 1) - timedelta(seconds=1)
        except ValueError:
            start = now - timedelta(days=30)
            end = now
    else:
        start = now - timedelta(days=30)
        end = now

    # Scans this period (proxy for km - assume ~1km per scan)
    scans_r = await session.execute(
        select(func.count(LidarScan.id)).where(
            LidarScan.upload_timestamp >= start,
            LidarScan.upload_timestamp <= end,
        )
    )
    scans_count = scans_r.scalar() or 0

    # Total pothole volume (from metrics)
    vol_r = await session.execute(select(func.sum(LidarMetrics.pothole_total_volume_m3)))
    total_volume = vol_r.scalar() or 0.0

    # Roads in safe condition: metrics where no work order created
    # Simplified: count metrics with low distress
    safe_r = await session.execute(
        select(func.count(LidarMetrics.id)).where(
            LidarMetrics.max_pothole_depth_mm <= 80,
            LidarMetrics.damaged_area_percent <= 2,
            LidarMetrics.avg_rut_depth_mm <= 12,
        )
    )
    safe_count = safe_r.scalar() or 0
    total_metrics_r = await session.execute(select(func.count(LidarMetrics.id)))
    total_metrics = total_metrics_r.scalar() or 1
    safe_pct = round(100 * safe_count / total_metrics, 2) if total_metrics else 0

    # Contractor avg quality
    qual_r = await session.execute(select(func.avg(ContractorPerformanceLog.quality_score)))
    contractor_avg = qual_r.scalar() or 0.0

    # SLA compliance: work orders completed within SLA
    wo_r = await session.execute(
        select(MaintenanceWorkOrder).where(MaintenanceWorkOrder.status == "completed")
    )
    completed = wo_r.scalars().all()
    # Simplified: assume all completed are within SLA (would need actual completion dates)
    sla_compliant = len(completed)
    total_wo_r = await session.execute(select(func.count(MaintenanceWorkOrder.id)))
    total_wo = total_wo_r.scalar() or 1
    sla_rate = round(100 * sla_compliant / total_wo, 2) if total_wo else 0

    return {
        "km_scanned_this_month": scans_count,  # proxy: 1 scan ≈ 1 km
        "total_pothole_volume_statewide_m3": round(total_volume, 4),
        "roads_safe_condition_percent": safe_pct,
        "contractor_avg_quality_score": round(float(contractor_avg), 2),
        "sla_compliance_rate_percent": sla_rate,
    }


@router.get("/alerts")
async def list_alerts(
    limit: int = Query(50, le=200),
    session: AsyncSession = Depends(get_db),
):
    r = await session.execute(
        select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    )
    alerts = r.scalars().all()
    return {
        "items": [
            {
                "id": a.id,
                "road_id": a.road_id,
                "work_order_id": a.work_order_id,
                "alert_type": a.alert_type,
                "message": a.message,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in alerts
        ]
    }


@router.get("/critical-segments")
async def critical_segments(
    session: AsyncSession = Depends(get_db),
):
    """Roads with critical work orders (for map red marking)."""
    r = await session.execute(
        select(MaintenanceWorkOrder)
        .where(
            MaintenanceWorkOrder.severity.in_(["critical", "high"]),
            MaintenanceWorkOrder.status != "completed",
        )
    )
    orders = r.scalars().all()
    return {"road_ids": list({wo.road_id for wo in orders})}
