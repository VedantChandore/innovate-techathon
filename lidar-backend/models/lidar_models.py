"""
lidar_models.py - lidar_scans and lidar_metrics tables
"""
import uuid
from datetime import date, datetime
from sqlalchemy import String, Float, Integer, DateTime, Date, ForeignKey, Text, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


def uuid4_str() -> str:
    return str(uuid.uuid4())


class LidarScan(Base):
    __tablename__ = "lidar_scans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    road_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    lidar_source: Mapped[str] = mapped_column(String(32), nullable=False)  # mobile/drone/phone
    original_filename: Mapped[str] = mapped_column(String(256))
    las_filename: Mapped[str] = mapped_column(String(256))
    point_density: Mapped[float] = mapped_column(Float, default=0.0)
    upload_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    survey_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="processing")  # processing | completed | failed
    potree_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    metrics: Mapped[list["LidarMetrics"]] = relationship("LidarMetrics", back_populates="scan")


class LidarMetrics(Base):
    __tablename__ = "lidar_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    road_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scan_id: Mapped[str] = mapped_column(String(36), ForeignKey("lidar_scans.id"), nullable=False)
    pothole_count: Mapped[int] = mapped_column(Integer, default=0)
    pothole_total_volume_m3: Mapped[float] = mapped_column(Float, default=0.0)
    avg_pothole_depth_mm: Mapped[float] = mapped_column(Float, default=0.0)
    max_pothole_depth_mm: Mapped[float] = mapped_column(Float, default=0.0)
    avg_rut_depth_mm: Mapped[float] = mapped_column(Float, default=0.0)
    max_rut_depth_mm: Mapped[float] = mapped_column(Float, default=0.0)
    roughness_proxy: Mapped[float] = mapped_column(Float, default=0.0)
    damaged_area_percent: Mapped[float] = mapped_column(Float, default=0.0)
    point_density_pts_per_m2: Mapped[float] = mapped_column(Float, default=0.0)
    lidar_quality_score: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    scan: Mapped["LidarScan"] = relationship("LidarScan", back_populates="metrics")
