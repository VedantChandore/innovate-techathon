"""
lidar_routes.py - LiDAR upload, metrics, verification, viewer
"""
import uuid
import logging
from datetime import datetime

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from models.base import get_db
from models.lidar_models import LidarScan, LidarMetrics
from models.workorder_models import Alert
from models.road_health import RoadHealthScore
from config import MAX_UPLOAD_SIZE_MB, MIN_POINT_DENSITY, STORAGE_ROOT, LAS_DIR
from lidar.ingestion import save_raw_file, convert_xyz_to_las, ensure_dirs
from lidar.metrics import compute_metrics_from_dict, compute_road_health_adjustment
from lidar.workorder_engine import create_work_order_if_needed
from lidar.verification import verify_repair, is_contractor_flagged
from lidar.visualization import get_potree_viewer_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lidar", tags=["LiDAR"])


class UploadResponse(BaseModel):
    scan_id: str
    road_id: str
    status: str
    las_filename: str
    potree_url: str | None


class VerifyRepairRequest(BaseModel):
    road_id: str = Field(..., description="Road segment ID")
    before_scan_id: str = Field(..., description="Scan ID before repair")
    after_scan_id: str = Field(..., description="Scan ID after repair")
    contractor_id: str | None = None
    verified_by: str | None = None


@router.post("/upload", response_model=UploadResponse)
async def upload_lidar(
    road_id: str = Form(...),
    lidar_source: str = Form("mobile", description="mobile | drone | phone"),
    pointcloud_file: UploadFile = File(...),
    survey_date: str | None = Form(None),
    session: AsyncSession = Depends(get_db),
):
    """
    Upload LiDAR point cloud, convert XYZ→LAS, store metadata, compute metrics.
    """
    ensure_dirs()
    content = await pointcloud_file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_UPLOAD_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File size {size_mb:.1f}MB exceeds limit {MAX_UPLOAD_SIZE_MB}MB",
        )

    ext = (pointcloud_file.filename or "").split(".")[-1].lower()
    if ext not in ("xyz", "las", "laz"):
        raise HTTPException(status_code=400, detail="Only .xyz, .las, .laz supported")

    scan_id = str(uuid.uuid4())
    raw_path = save_raw_file(content, pointcloud_file.filename or "upload.xyz", scan_id)

    las_path = None
    if ext == "xyz":
        las_path = convert_xyz_to_las(raw_path, scan_id)
    else:
        las_filename = f"{scan_id}.laz"
        las_full = STORAGE_ROOT / "las" / las_filename
        las_full.parent.mkdir(parents=True, exist_ok=True)
        las_full.write_bytes(content)
        las_path = las_full

    if las_path is None:
        raise HTTPException(status_code=500, detail="LAS conversion failed")

    # Mock metrics from file (in production, run PDAL pipeline)
    # For now use default density; CSV seed will have real values
    point_density = 100.0  # placeholder
    if point_density < MIN_POINT_DENSITY:
        raise HTTPException(
            status_code=422,
            detail=f"Point density {point_density} below minimum {MIN_POINT_DENSITY} pts/m²",
        )

    scan = LidarScan(
        id=scan_id,
        road_id=road_id,
        lidar_source=lidar_source,
        original_filename=pointcloud_file.filename or "upload",
        las_filename=las_path.name,
        point_density=point_density,
        survey_date=datetime.fromisoformat(survey_date.replace("Z", "+00:00")).date() if survey_date else None,
        status="processing",
    )
    session.add(scan)
    await session.flush()

    # Compute metrics (mock - from placeholder)
    metrics_dict = {
        "pothole_count": 0,
        "pothole_total_volume_m3": 0,
        "avg_pothole_depth_mm": 0,
        "max_pothole_depth_mm": 0,
        "avg_rut_depth_mm": 0,
        "max_rut_depth_mm": 0,
        "roughness_proxy": 0,
        "damaged_area_percent": 0,
        "point_density_pts_per_m2": point_density,
        "lidar_quality_score": 50,
    }
    metrics = LidarMetrics(
        road_id=road_id,
        scan_id=scan_id,
        **metrics_dict,
    )
    session.add(metrics)
    scan.status = "completed"
    scan.potree_url = get_potree_viewer_url(scan_id)

    wo = create_work_order_if_needed(session, road_id, scan_id, metrics)
    if wo:
        session.add(Alert(
            road_id=road_id,
            work_order_id=wo.id,
            alert_type="work_order_created",
            message=f"Work order {wo.severity} created for {road_id}",
        ))

    await session.commit()
    await session.refresh(scan)

    return UploadResponse(
        scan_id=scan_id,
        road_id=road_id,
        status=scan.status,
        las_filename=scan.las_filename,
        potree_url=scan.potree_url,
    )


@router.get("/scans/{road_id}")
async def get_scans_for_road(
    road_id: str,
    session: AsyncSession = Depends(get_db),
):
    """List LiDAR scans for a road."""
    from sqlalchemy import select
    r = await session.execute(
        select(LidarScan).where(LidarScan.road_id == road_id).order_by(LidarScan.upload_timestamp.desc())
    )
    scans = r.scalars().all()
    return {
        "road_id": road_id,
        "scans": [
            {
                "scan_id": s.id,
                "lidar_source": s.lidar_source,
                "upload_timestamp": s.upload_timestamp.isoformat() if s.upload_timestamp else None,
                "survey_date": str(s.survey_date) if s.survey_date else None,
                "status": s.status,
                "potree_url": s.potree_url,
            }
            for s in scans
        ],
    }


@router.get("/metrics/{scan_id}")
async def get_metrics_for_scan(
    scan_id: str,
    session: AsyncSession = Depends(get_db),
):
    """Get LiDAR metrics for a scan."""
    from sqlalchemy import select
    r = await session.execute(select(LidarMetrics).where(LidarMetrics.scan_id == scan_id))
    m = r.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Metrics not found")
    return {
        "scan_id": scan_id,
        "road_id": m.road_id,
        "pothole_count": m.pothole_count,
        "pothole_total_volume_m3": m.pothole_total_volume_m3,
        "avg_pothole_depth_mm": m.avg_pothole_depth_mm,
        "max_pothole_depth_mm": m.max_pothole_depth_mm,
        "avg_rut_depth_mm": m.avg_rut_depth_mm,
        "max_rut_depth_mm": m.max_rut_depth_mm,
        "roughness_proxy": m.roughness_proxy,
        "damaged_area_percent": m.damaged_area_percent,
        "point_density_pts_per_m2": m.point_density_pts_per_m2,
        "lidar_quality_score": m.lidar_quality_score,
    }


@router.get("/viewer/{scan_id}")
async def get_viewer_url(scan_id: str):
    """Return Potree viewer URL for a scan."""
    return {"potree_url": get_potree_viewer_url(scan_id)}


@router.get("/pointcloud/{scan_id}", response_class=FileResponse)
async def get_pointcloud_file(scan_id: str, session: AsyncSession = Depends(get_db)):
    """Serve the .laz point cloud file for a scan (for download or external viewer)."""
    result = await session.execute(select(LidarScan).where(LidarScan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    las_path = LAS_DIR / scan.las_filename
    if not las_path.exists():
        # Script may have written uncompressed .las when LAZ backend missing
        las_path = LAS_DIR / f"{scan_id}.las"
    if not las_path.exists():
        raise HTTPException(status_code=404, detail="Point cloud file not found")
    return FileResponse(
        las_path,
        media_type="application/octet-stream",
        filename=las_path.name,
    )


@router.post("/verify-repair")
async def verify_repair_endpoint(
    body: VerifyRepairRequest,
    session: AsyncSession = Depends(get_db),
):
    """
    Compare before/after scans, create contractor performance log.
    If reduction < 90%, flag contractor.
    """
    from sqlalchemy import select

    before = await session.execute(
        select(LidarMetrics).where(LidarMetrics.scan_id == body.before_scan_id)
    )
    after = await session.execute(
        select(LidarMetrics).where(LidarMetrics.scan_id == body.after_scan_id)
    )
    bm = before.scalar_one_or_none()
    am = after.scalar_one_or_none()

    if not bm or not am:
        raise HTTPException(status_code=404, detail="Before or after scan/metrics not found")

    log = verify_repair(
        session,
        body.road_id,
        bm.pothole_total_volume_m3,
        am.pothole_total_volume_m3,
        body.contractor_id,
        body.verified_by,
    )
    await session.commit()
    await session.refresh(log)

    flagged = is_contractor_flagged(log.improvement_percent)

    return {
        "road_id": body.road_id,
        "before_volume_m3": log.before_volume,
        "after_volume_m3": log.after_volume,
        "improvement_percent": round(log.improvement_percent, 2),
        "quality_score": round(log.quality_score, 2),
        "contractor_flagged": flagged,
    }
