"""
road_cibil_inference.py
=======================
Production inference pipeline for the Road CIBIL Scoring Model.

Responsibilities:
  - Load the exported pickle artifact ONCE at startup
  - Expose a single predict() method that accepts a dict of raw features
  - Embed all preprocessing, feature engineering, PDI computation,
    ML inference, and hybrid blending inside this class
  - NO training code — inference-only

Usage:
    predictor = RoadCIBILPredictor("road_cibil_model.pkl")
    result = predictor.predict({"iri_value": 3.5, "potholes_per_km": 5, ...})
"""

from __future__ import annotations

import logging
import pickle
import time
from pathlib import Path
from typing import Any

import warnings

import numpy as np
import pandas as pd

logger = logging.getLogger("road_cibil.inference")

# ──────────────────────────────────────────────────────────────────────────────
#  Deterministic encoding maps  (must match training — embedded here so the
#  inference server needs NO external config files)
# ──────────────────────────────────────────────────────────────────────────────
_ORDINAL_MAPS: dict[str, dict[str, int]] = {
    "surface_type": {"earthen": 1, "gravel": 2, "bitumen": 3, "concrete": 4},
    "slope_category": {"flat": 1, "moderate": 2, "steep": 3},
    "monsoon_rainfall_category": {"low": 1, "medium": 2, "high": 3},
    "terrain_type": {"plain": 1, "hilly": 2, "steep": 3},
}

_BOOL_COLS = [
    "landslide_prone",
    "flood_prone",
    "ghat_section_flag",
    "tourism_route_flag",
]

_REGION_VALUES = ["rural", "semi-urban", "urban"]  # expected one-hot prefixes


class RoadCIBILPredictor:
    """
    Inference-only wrapper around the trained Road CIBIL pipeline.

    Thread-safe for concurrent FastAPI requests (all state is read-only
    after __init__).
    """

    def __init__(self, model_path: str | Path) -> None:
        model_path = Path(model_path)
        if not model_path.exists():
            raise FileNotFoundError(f"Model artifact not found: {model_path}")

        logger.info("Loading model artifact from %s …", model_path)
        t0 = time.perf_counter()

        with open(model_path, "rb") as fh:
            artifact: dict[str, Any] = pickle.load(fh)

        # ── Unpack artifact ────────────────────────────────────────────────
        self._model          = artifact["model"]
        self._scaler         = artifact["scaler"]
        self._feature_cols   = artifact["feature_cols"]
        self._distress_cols  = artifact["DISTRESS_COLS"]
        self._distress_max   = artifact["DISTRESS_MAX"]
        self._pdi_weights    = artifact["PDI_WEIGHTS"]
        self._condition_bins = artifact["CONDITION_BINS"]
        self._condition_lbls = artifact["CONDITION_LABELS"]
        self._pseudo_w       = artifact["PSEUDO_WEIGHT"]
        self._ml_w           = artifact["ML_WEIGHT"]
        self._model_version  = artifact.get("model_version", "v1.0")
        self._metrics        = artifact.get("metrics", {})

        elapsed = (time.perf_counter() - t0) * 1000
        logger.info(
            "✅  Model loaded in %.1f ms | version=%s | features=%d | R²=%s",
            elapsed,
            self._model_version,
            len(self._feature_cols),
            self._metrics.get("R²", "n/a"),
        )

    # ── Public ────────────────────────────────────────────────────────────────

    @property
    def model_version(self) -> str:
        return self._model_version

    @property
    def metrics(self) -> dict:
        return self._metrics

    def predict(self, raw: dict[str, Any], current_year: int = 2026) -> dict[str, Any]:
        """
        Score a single road segment.

        Parameters
        ----------
        raw : dict
            Raw feature dictionary matching the input schema.
        current_year : int
            Year used to compute road_age and years_since_rehab.

        Returns
        -------
        dict with keys:
            pdi, pseudo_cibil, ml_predicted_cibil,
            final_cibil_score, condition_category
        """
        t0 = time.perf_counter()

        df = pd.DataFrame([raw])
        df = self._handle_missing(df)
        df = self._encode_categoricals(df)
        df = self._engineer_features(df, current_year)
        df = self._compute_pdi(df)

        pseudo_cibil = float(df["Pseudo_CIBIL"].iloc[0])
        pdi          = float(df["PDI"].iloc[0])

        ml_pred = self._ml_predict(df)

        final_cibil = round(
            float(np.clip(
                self._pseudo_w * pseudo_cibil + self._ml_w * ml_pred, 0.0, 100.0
            )), 2
        )

        condition = self._assign_condition(final_cibil)
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)

        return {
            "pdi":                   round(pdi, 2),
            "pseudo_cibil":          round(pseudo_cibil, 2),
            "ml_predicted_cibil":    round(ml_pred, 2),
            "final_cibil_score":     final_cibil,
            "condition_category":    condition,
            "latency_ms":            latency_ms,
        }

    # ── Private helpers ───────────────────────────────────────────────────────

    def _handle_missing(self, df: pd.DataFrame) -> pd.DataFrame:
        """Fill missing numeric values with domain-safe defaults."""
        df = df.copy()
        # Distress defaults → 0 (no distress observed)
        for col in self._distress_cols:
            if col not in df.columns:
                df[col] = 0.0
            else:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

        # Numeric structural / traffic defaults
        numeric_defaults = {
            "avg_daily_traffic": 5000.0,
            "truck_percentage": 15.0,
            "peak_hour_traffic": 500.0,
            "traffic_weight": 5.0,
            "elevation_m": 200.0,
            "lane_count": 2.0,
            "year_constructed": 2010.0,
            "last_major_rehab_year": 2015.0,
            "length_km": 1.0,
            "pci_score": 70.0,
        }
        for col, default in numeric_defaults.items():
            if col not in df.columns:
                df[col] = default
            else:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(default)

        # Categorical defaults
        cat_defaults = {
            "surface_type": "bitumen",
            "slope_category": "flat",
            "monsoon_rainfall_category": "medium",
            "terrain_type": "plain",
            "region_type": "rural",
        }
        for col, default in cat_defaults.items():
            if col not in df.columns:
                df[col] = default
            else:
                df[col] = df[col].fillna(default)

        # Boolean flag defaults → 0
        for col in _BOOL_COLS:
            if col not in df.columns:
                df[col] = 0
            else:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

        return df

    def _encode_categoricals(self, df: pd.DataFrame) -> pd.DataFrame:
        """Deterministic ordinal + one-hot encoding (mirrors training)."""
        df = df.copy()
        for col, mapping in _ORDINAL_MAPS.items():
            if col in df.columns:
                df[col] = df[col].map(mapping).fillna(2).astype(int)

        # One-hot region_type
        if "region_type" in df.columns:
            region_val = str(df["region_type"].iloc[0]).lower()
            for rv in _REGION_VALUES:
                df[f"region_{rv}"] = int(region_val == rv)
            df.drop(columns=["region_type"], inplace=True)
        else:
            for rv in _REGION_VALUES:
                if f"region_{rv}" not in df.columns:
                    df[f"region_{rv}"] = 0

        for col in _BOOL_COLS:
            if col in df.columns:
                df[col] = df[col].astype(int)

        return df

    def _engineer_features(self, df: pd.DataFrame, current_year: int) -> pd.DataFrame:
        """Derive time-based and traffic-stress features."""
        df = df.copy()
        if "year_constructed" in df.columns:
            df["road_age"] = (current_year - df["year_constructed"]).clip(lower=0)
        if "last_major_rehab_year" in df.columns:
            df["years_since_rehab"] = (
                current_year - df["last_major_rehab_year"]
            ).clip(lower=0)
        if "avg_daily_traffic" in df.columns and "truck_percentage" in df.columns:
            df["traffic_stress"] = (
                df["avg_daily_traffic"] * df["truck_percentage"] / 100.0
            )
        return df

    def _compute_pdi(self, df: pd.DataFrame) -> pd.DataFrame:
        """Compute PDI and Pseudo_CIBIL using embedded weights and ceilings."""
        df = df.copy()
        weighted_sum = pd.Series(np.zeros(len(df)), index=df.index)
        for col, weight in self._pdi_weights.items():
            max_val = self._distress_max[col]
            normalised = (df[col].clip(lower=0, upper=max_val) / max_val).astype(float)
            weighted_sum += weight * normalised

        df["PDI"]          = (weighted_sum * 100).clip(0, 100).round(2)
        df["Pseudo_CIBIL"] = (100 - df["PDI"]).clip(0, 100).round(2)
        return df

    def _ml_predict(self, df: pd.DataFrame) -> float:
        """Scale features and run RF inference."""
        # Build feature matrix — fill any missing feature cols with 0
        X = pd.DataFrame(index=df.index)
        for col in self._feature_cols:
            X[col] = df[col] if col in df.columns else 0.0

        X_scaled = self._scaler.transform(X)
        # Suppress sklearn feature-name warning (array input is intentional)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            pred = float(self._model.predict(X_scaled)[0])
        return round(float(np.clip(pred, 0.0, 100.0)), 2)

    def _assign_condition(self, score: float) -> str:
        """Map final CIBIL score to a condition label."""
        bins   = self._condition_bins
        labels = self._condition_lbls
        for i in range(len(bins) - 1):
            if bins[i] <= score < bins[i + 1]:
                return labels[i]
        return labels[-1]  # score == 100 edge case
