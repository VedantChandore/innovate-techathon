"""
main.py - LiDAR-Based Road Condition Intelligence API

Endpoints:
  POST /lidar/upload        - Upload point cloud, convert, store, compute metrics
  GET  /lidar/scans/{road_id}
  GET  /lidar/metrics/{scan_id}
  GET  /lidar/viewer/{scan_id}
  POST /lidar/verify-repair
  GET  /workorders
  GET  /workorders/{id}
  GET  /budget/simulate
  GET  /dashboard/kpis
  GET  /dashboard/alerts
  GET  /dashboard/critical-segments

Run: uvicorn main:app --host 0.0.0.0 --port 8001 --reload
"""
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import LIDAR_API_PORT
from models.base import init_db
from api.lidar_routes import router as lidar_router
from api.workorder_routes import router as workorder_router
from api.budget_routes import router as budget_router
from api.dashboard_routes import router as dashboard_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("lidar.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("LiDAR Road Condition API — Starting")
    await init_db()
    logger.info("Database initialized")
    yield
    logger.info("Shutting down")


app = FastAPI(
    title="LiDAR Road Condition Intelligence API",
    description="Ingest LiDAR scans, compute distress metrics, generate work orders, verify repairs.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:3000",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lidar_router)
app.include_router(workorder_router)
app.include_router(budget_router)
app.include_router(dashboard_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "lidar-road-condition"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=LIDAR_API_PORT,
        reload=True,
    )
