"""
road_health.py - road_health_scores for LiDAR-updated scores
"""
from datetime import datetime
from sqlalchemy import String, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class RoadHealthScore(Base):
    """Stores LiDAR-updated health scores for Road Registry integration."""
    __tablename__ = "road_health_scores"

    road_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    health_score: Mapped[float] = mapped_column(Float, default=0.0)  # 0-100
    pothole_volume_penalty: Mapped[float] = mapped_column(Float, default=0.0)
    rut_depth_penalty: Mapped[float] = mapped_column(Float, default=0.0)
    damaged_area_penalty: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
