"""
budget_routes.py - Budget optimization: rank work orders, simulate allocation
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.base import get_db
from models.workorder_models import MaintenanceWorkOrder

router = APIRouter(prefix="/budget", tags=["Budget"])

SEVERITY_WEIGHT = {"critical": 4, "high": 3, "medium": 2, "low": 1}
DEFAULT_TRAFFIC_WEIGHT = 1.0  # Would join with road_registry for real traffic_weight


@router.get("/simulate")
async def budget_simulate(
    budget: float = Query(..., description="Available budget in ₹"),
    session: AsyncSession = Depends(get_db),
):
    """
    Rank work orders by (severity_weight × traffic_weight × volume).
    Select until budget exhausted. Return recommended roads list.
    """
    r = await session.execute(
        select(MaintenanceWorkOrder)
        .where(MaintenanceWorkOrder.status == "pending")
        .order_by(MaintenanceWorkOrder.created_at.desc())
    )
    orders = r.scalars().all()

    def priority(wo: MaintenanceWorkOrder) -> float:
        sw = SEVERITY_WEIGHT.get(wo.severity, 1)
        return sw * DEFAULT_TRAFFIC_WEIGHT * max(0.01, wo.estimated_repair_volume_m3)

    sorted_orders = sorted(orders, key=priority, reverse=True)

    spent = 0.0
    selected = []
    for wo in sorted_orders:
        if spent + wo.estimated_cost <= budget:
            spent += wo.estimated_cost
            selected.append({
                "work_order_id": wo.id,
                "road_id": wo.road_id,
                "severity": wo.severity,
                "estimated_cost": wo.estimated_cost,
                "recommended_action": wo.recommended_action,
            })
        else:
            break

    return {
        "budget": budget,
        "spent": round(spent, 2),
        "remaining": round(budget - spent, 2),
        "work_orders_count": len(selected),
        "recommended_roads": list({s["road_id"] for s in selected}),
        "work_orders": selected,
    }
