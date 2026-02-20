"""
schemas.py
==========
Pydantic v2 request / response models for the Road CIBIL Scoring API.

Every field has:
  - A type annotation
  - A default value (so partial payloads are valid)
  - ge/le validators where domain-meaningful bounds exist
  - A description shown in the Swagger UI
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ──────────────────────────────────────────────────────────────────────────────
#  REQUEST MODEL
# ──────────────────────────────────────────────────────────────────────────────

class RoadFeatures(BaseModel):
    """All raw features for a single highway segment."""

    # ── Distress indicators ──────────────────────────────────────────────────
    iri_value: float = Field(
        default=2.5, ge=0.0, le=20.0,
        description="International Roughness Index (m/km). Range: 0–20."
    )
    alligator_cracking_pct: float = Field(
        default=5.0, ge=0.0, le=100.0,
        description="Alligator (fatigue) cracking as % of surface area."
    )
    potholes_per_km: float = Field(
        default=3.0, ge=0.0, le=500.0,
        description="Number of potholes per km."
    )
    rutting_depth_mm: float = Field(
        default=5.0, ge=0.0, le=200.0,
        description="Maximum rutting depth in mm."
    )
    cracks_longitudinal_pct: float = Field(
        default=5.0, ge=0.0, le=100.0,
        description="Longitudinal cracks as % of surface."
    )
    cracks_transverse_per_km: float = Field(
        default=3.0, ge=0.0, le=500.0,
        description="Transverse cracks per km."
    )
    raveling_pct: float = Field(
        default=5.0, ge=0.0, le=100.0,
        description="Raveling (aggregate loss) as % of surface."
    )
    edge_breaking_pct: float = Field(
        default=5.0, ge=0.0, le=100.0,
        description="Edge breaking / edge deterioration as % of edge length."
    )
    patches_per_km: float = Field(
        default=2.0, ge=0.0, le=200.0,
        description="Number of patched areas per km (maintenance history)."
    )
    pothole_avg_depth_cm: float = Field(
        default=2.0, ge=0.0, le=50.0,
        description="Average pothole depth in cm."
    )

    # ── Structural ───────────────────────────────────────────────────────────
    pci_score: float = Field(
        default=70.0, ge=0.0, le=100.0,
        description="Pavement Condition Index (0=failed, 100=perfect)."
    )
    lane_count: float = Field(
        default=2.0, ge=1.0, le=12.0,
        description="Number of lanes."
    )
    length_km: float = Field(
        default=1.0, ge=0.01, le=500.0,
        description="Segment length in km."
    )

    # ── Time / rehabilitation ─────────────────────────────────────────────────
    year_constructed: float = Field(
        default=2010.0, ge=1900.0, le=2026.0,
        description="Year the road was originally constructed."
    )
    last_major_rehab_year: float = Field(
        default=2015.0, ge=1900.0, le=2026.0,
        description="Year of last major rehabilitation."
    )

    # ── Traffic ───────────────────────────────────────────────────────────────
    avg_daily_traffic: float = Field(
        default=5000.0, ge=0.0,
        description="Average Daily Traffic (vehicles/day)."
    )
    truck_percentage: float = Field(
        default=15.0, ge=0.0, le=100.0,
        description="Percentage of traffic that is heavy trucks."
    )
    peak_hour_traffic: float = Field(
        default=500.0, ge=0.0,
        description="Peak hour traffic volume."
    )
    traffic_weight: float = Field(
        default=5.0, ge=0.0,
        description="Average traffic load weight (tonnes)."
    )

    # ── Environment & geography ────────────────────────────────────────────────
    elevation_m: float = Field(
        default=200.0, ge=0.0, le=8000.0,
        description="Average elevation in metres."
    )
    surface_type: str = Field(
        default="bitumen",
        description="Surface type: 'earthen', 'gravel', 'bitumen', or 'concrete'."
    )
    slope_category: str = Field(
        default="flat",
        description="Slope category: 'flat', 'moderate', or 'steep'."
    )
    monsoon_rainfall_category: str = Field(
        default="medium",
        description="Annual rainfall class: 'low', 'medium', or 'high'."
    )
    terrain_type: str = Field(
        default="plain",
        description="Terrain type: 'plain', 'hilly', or 'steep'."
    )
    region_type: str = Field(
        default="rural",
        description="Region class: 'rural', 'semi-urban', or 'urban'."
    )

    # ── Boolean risk flags ────────────────────────────────────────────────────
    landslide_prone: int = Field(
        default=0, ge=0, le=1,
        description="1 if segment is in a landslide-prone zone."
    )
    flood_prone: int = Field(
        default=0, ge=0, le=1,
        description="1 if segment is in a flood-prone zone."
    )
    ghat_section_flag: int = Field(
        default=0, ge=0, le=1,
        description="1 if the segment is a ghat (mountain pass) section."
    )
    tourism_route_flag: int = Field(
        default=0, ge=0, le=1,
        description="1 if the segment is on a designated tourism route."
    )

    # ── Validators ────────────────────────────────────────────────────────────

    @field_validator("surface_type")
    @classmethod
    def validate_surface_type(cls, v: str) -> str:
        allowed = {"earthen", "gravel", "bitumen", "concrete"}
        v_lower = v.lower().strip()
        if v_lower not in allowed:
            raise ValueError(f"surface_type must be one of {allowed}, got '{v}'")
        return v_lower

    @field_validator("slope_category")
    @classmethod
    def validate_slope_category(cls, v: str) -> str:
        allowed = {"flat", "moderate", "steep"}
        v_lower = v.lower().strip()
        if v_lower not in allowed:
            raise ValueError(f"slope_category must be one of {allowed}, got '{v}'")
        return v_lower

    @field_validator("monsoon_rainfall_category")
    @classmethod
    def validate_rainfall(cls, v: str) -> str:
        allowed = {"low", "medium", "high"}
        v_lower = v.lower().strip()
        if v_lower not in allowed:
            raise ValueError(f"monsoon_rainfall_category must be one of {allowed}, got '{v}'")
        return v_lower

    @field_validator("terrain_type")
    @classmethod
    def validate_terrain(cls, v: str) -> str:
        allowed = {"plain", "hilly", "steep"}
        v_lower = v.lower().strip()
        if v_lower not in allowed:
            raise ValueError(f"terrain_type must be one of {allowed}, got '{v}'")
        return v_lower

    @field_validator("region_type")
    @classmethod
    def validate_region(cls, v: str) -> str:
        allowed = {"rural", "semi-urban", "urban"}
        v_lower = v.lower().strip()
        if v_lower not in allowed:
            raise ValueError(f"region_type must be one of {allowed}, got '{v}'")
        return v_lower

    @model_validator(mode="after")
    def validate_rehab_after_construction(self) -> "RoadFeatures":
        if self.last_major_rehab_year < self.year_constructed:
            raise ValueError(
                "last_major_rehab_year cannot be earlier than year_constructed"
            )
        return self

    class Config:
        json_schema_extra = {
            "example": {
                "iri_value": 3.5,
                "alligator_cracking_pct": 12.0,
                "potholes_per_km": 6.0,
                "rutting_depth_mm": 8.0,
                "cracks_longitudinal_pct": 10.0,
                "cracks_transverse_per_km": 5.0,
                "raveling_pct": 8.0,
                "edge_breaking_pct": 6.0,
                "patches_per_km": 3.0,
                "pothole_avg_depth_cm": 2.5,
                "pci_score": 68.0,
                "lane_count": 2.0,
                "length_km": 3.2,
                "year_constructed": 2005.0,
                "last_major_rehab_year": 2018.0,
                "avg_daily_traffic": 8500.0,
                "truck_percentage": 20.0,
                "peak_hour_traffic": 850.0,
                "traffic_weight": 7.0,
                "elevation_m": 350.0,
                "surface_type": "bitumen",
                "slope_category": "flat",
                "monsoon_rainfall_category": "medium",
                "terrain_type": "plain",
                "region_type": "rural",
                "landslide_prone": 0,
                "flood_prone": 0,
                "ghat_section_flag": 0,
                "tourism_route_flag": 0,
            }
        }


# ──────────────────────────────────────────────────────────────────────────────
#  RESPONSE MODELS
# ──────────────────────────────────────────────────────────────────────────────

class ScoreResponse(BaseModel):
    """Full scoring response for POST /score."""

    final_cibil_score:    float = Field(description="Hybrid CIBIL score (0–100).")
    condition_category:   str   = Field(description="Good / Fair / Poor / Critical.")
    pdi:                  float = Field(description="Pavement Distress Index (0–100).")
    pseudo_cibil:         float = Field(description="PDI-based deterministic score.")
    ml_predicted_cibil:   float = Field(description="RandomForest ML prediction.")
    model_version:        str   = Field(description="Model artifact version tag.")
    latency_ms:           float = Field(description="Inference latency in milliseconds.")
    timestamp:            str   = Field(description="ISO-8601 UTC timestamp.")

    class Config:
        json_schema_extra = {
            "example": {
                "final_cibil_score": 72.34,
                "condition_category": "Fair",
                "pdi": 29.15,
                "pseudo_cibil": 70.85,
                "ml_predicted_cibil": 75.20,
                "model_version": "v1.0",
                "latency_ms": 4.2,
                "timestamp": "2026-02-19T10:30:00.000Z",
            }
        }


class HealthResponse(BaseModel):
    """Response for GET /health."""
    status:        str = Field(description="Service status.")
    model_version: str = Field(description="Loaded model version.")
    model_metrics: dict = Field(description="Training-time evaluation metrics.")
