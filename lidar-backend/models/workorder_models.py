"""
workorder_models.py - maintenance_work_orders, contractor_performance_log, alerts
"""
from datetime import date, datetime
from sqlalchemy import String, Float, Integer, DateTime, Date, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


def uuid4_str() -> str:
    import uuid
    return str(uuid.uuid4())


class MaintenanceWorkOrder(Base):
    __tablename__ = "maintenance_work_orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    road_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scan_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)  # low | medium | high | critical
    estimated_repair_volume_m3: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_cost: Mapped[float] = mapped_column(Float, default=0.0)
    recommended_action: Mapped[str] = mapped_column(String(64))  # patch | overlay | reconstruction
    assigned_department: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sla_days: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending | in-progress | completed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ContractorPerformanceLog(Base):
    __tablename__ = "contractor_performance_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    road_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    contractor_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    before_volume: Mapped[float] = mapped_column(Float, default=0.0)
    after_volume: Mapped[float] = mapped_column(Float, default=0.0)
    improvement_percent: Mapped[float] = mapped_column(Float, default=0.0)
    quality_score: Mapped[float] = mapped_column(Float, default=0.0)
    verified_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    verification_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    road_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    work_order_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    alert_type: Mapped[str] = mapped_column(String(64))  # work_order_created | critical_segment | etc.
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    read: Mapped[bool] = mapped_column(default=False)
