"""
main.py
=======
FastAPI production inference backend for the Road CIBIL Scoring Service.

Endpoints:
    POST /score    — Score a single road segment
    GET  /health   — Service health + model metadata

Run locally:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Swagger UI:
    http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Ensure the api/ directory is on the path when running from project root ──
sys.path.insert(0, str(Path(__file__).parent))

from road_cibil_inference import RoadCIBILPredictor
from schemas import HealthResponse, RoadFeatures, ScoreResponse

# ──────────────────────────────────────────────────────────────────────────────
#  Logging
# ──────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("road_cibil.api")

# ──────────────────────────────────────────────────────────────────────────────
#  Model path resolution
# ──────────────────────────────────────────────────────────────────────────────
_THIS_DIR    = Path(__file__).parent          # …/api/
_PROJECT_DIR = _THIS_DIR.parent               # …/AISSM/
MODEL_PATH   = Path(
    os.environ.get("MODEL_PATH", str(_PROJECT_DIR / "road_cibil_model.pkl"))
)

# ──────────────────────────────────────────────────────────────────────────────
#  Application state (singleton predictor — loaded once at startup)
# ──────────────────────────────────────────────────────────────────────────────
_predictor: RoadCIBILPredictor | None = None


def get_predictor() -> RoadCIBILPredictor:
    """Return the globally loaded predictor; raise 503 if not ready."""
    if _predictor is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model is not loaded. The service may still be starting up.",
        )
    return _predictor


# ──────────────────────────────────────────────────────────────────────────────
#  Lifespan (startup / shutdown)
# ──────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model exactly once at startup; release at shutdown."""
    global _predictor
    logger.info("=" * 60)
    logger.info("  Road CIBIL Scoring API — Starting up")
    logger.info("  Model path : %s", MODEL_PATH)
    logger.info("=" * 60)

    try:
        _predictor = RoadCIBILPredictor(MODEL_PATH)
        logger.info("✅  Model loaded successfully | version=%s", _predictor.model_version)
        logger.info("    Metrics: %s", _predictor.metrics)
    except FileNotFoundError as exc:
        logger.critical("❌  Model file not found: %s", exc)
        raise RuntimeError(str(exc)) from exc
    except Exception as exc:
        logger.critical("❌  Failed to load model: %s", exc)
        raise

    yield  # ── API is live ──────────────────────────────────────────────────

    logger.info("Road CIBIL API shutting down.")
    _predictor = None


# ──────────────────────────────────────────────────────────────────────────────
#  FastAPI app
# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Road CIBIL Scoring API",
    description=(
        "Production inference service for the Maharashtra Highway CIBIL Scoring System.\n\n"
        "Scores highway segments on a **0–100 scale** using a hybrid "
        "deterministic PDI formula (70%) + RandomForest ML (30%).\n\n"
        "**Condition bands:** Good (80–100) · Fair (60–79) · Poor (40–59) · Critical (0–39)"
    ),
    version="1.0.0",
    contact={
        "name": "CRCMS — Central Road Condition Monitoring System",
        "url": "https://maharashtra.gov.in",
    },
    license_info={"name": "Government of Maharashtra — Internal Use"},
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS (allow localhost dev tools) ─────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:3000",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
#  Global exception handler
# ──────────────────────────────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal error occurred. Please check server logs."},
    )


# ──────────────────────────────────────────────────────────────────────────────
#  Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    tags=["Monitoring"],
)
async def health() -> HealthResponse:
    """
    Returns service status and loaded model metadata.
    Use this endpoint to verify the API is ready to serve predictions.
    """
    predictor = get_predictor()
    return HealthResponse(
        status="running",
        model_version=predictor.model_version,
        model_metrics=predictor.metrics,
    )


@app.post(
    "/score",
    response_model=ScoreResponse,
    summary="Score a road segment",
    tags=["Inference"],
    status_code=status.HTTP_200_OK,
)
async def score_road(payload: RoadFeatures, request: Request) -> ScoreResponse:
    """
    Score a single highway segment and return its Road CIBIL score.

    **Input:** Raw road features (distress indicators, traffic, geometry, environment).

    **Output:** Final hybrid CIBIL score (0–100), condition category,
    component scores (PDI, Pseudo_CIBIL, ML_Predicted_CIBIL), and latency.

    **Scoring formula:**

        Final_CIBIL = 0.7 × Pseudo_CIBIL + 0.3 × ML_Predicted_CIBIL

    All fields have safe defaults — you can submit a partial payload.
    """
    predictor = get_predictor()

    try:
        raw_dict: dict[str, Any] = payload.model_dump()
        result   = predictor.predict(raw_dict)
    except ValueError as exc:
        logger.warning("Validation error during inference: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("Inference failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Inference failed. Check server logs.",
        ) from exc

    logger.info(
        "Scored segment | final_cibil=%.2f | condition=%s | latency=%.1f ms",
        result["final_cibil_score"],
        result["condition_category"],
        result["latency_ms"],
    )

    return ScoreResponse(
        final_cibil_score  = result["final_cibil_score"],
        condition_category = result["condition_category"],
        pdi                = result["pdi"],
        pseudo_cibil       = result["pseudo_cibil"],
        ml_predicted_cibil = result["ml_predicted_cibil"],
        model_version      = predictor.model_version,
        latency_ms         = result["latency_ms"],
        timestamp          = datetime.now(timezone.utc).isoformat(),
    )


# ──────────────────────────────────────────────────────────────────────────────
#  Entry-point for direct execution  (python main.py)
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,        # reload=True is for dev; disable in production
        log_level="info",
        access_log=True,
    )
