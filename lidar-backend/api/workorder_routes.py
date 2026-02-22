"""
workorder_routes.py - Maintenance work orders CRUD
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.base import get_db
from models.workorder_models import MaintenanceWorkOrder

router = APIRouter(prefix="/workorders", tags=["Work Orders"])


@router.get("")
async def list_work_orders(
    road_id: str | None = Query(None),
    status: str | None = Query(None),
    severity: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    session: AsyncSession = Depends(get_db),
):
    """List maintenance work orders with optional filters."""
    q = select(MaintenanceWorkOrder)
    if road_id:
        q = q.where(MaintenanceWorkOrder.road_id == road_id)
    if status:
        q = q.where(MaintenanceWorkOrder.status == status)
    if severity:
        q = q.where(MaintenanceWorkOrder.severity == severity)
    q = q.order_by(MaintenanceWorkOrder.created_at.desc()).offset(offset).limit(limit)
    r = await session.execute(q)
    rows = r.scalars().all()
    return {
        "items": [
            {
                "id": x.id,
                "road_id": x.road_id,
                "scan_id": x.scan_id,
                "severity": x.severity,
                "status": x.status,
                "estimated_repair_volume_m3": x.estimated_repair_volume_m3,
                "estimated_cost": x.estimated_cost,
                "recommended_action": x.recommended_action,
                "sla_days": x.sla_days,
                "created_at": x.created_at.isoformat() if x.created_at else None,
            }
            for x in rows
        ]
    }


@router.get("/{work_order_id}")
async def get_work_order(
    work_order_id: str,
    session: AsyncSession = Depends(get_db),
):
    r = await session.execute(select(MaintenanceWorkOrder).where(MaintenanceWorkOrder.id == work_order_id))
    wo = r.scalar_one_or_none()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return {
        "id": wo.id,
        "road_id": wo.road_id,
        "scan_id": wo.scan_id,
        "severity": wo.severity,
        "status": wo.status,
        "estimated_repair_volume_m3": wo.estimated_repair_volume_m3,
        "estimated_cost": wo.estimated_cost,
        "recommended_action": wo.recommended_action,
        "assigned_department": wo.assigned_department,
        "sla_days": wo.sla_days,
        "created_at": wo.created_at.isoformat() if wo.created_at else None,
    }
