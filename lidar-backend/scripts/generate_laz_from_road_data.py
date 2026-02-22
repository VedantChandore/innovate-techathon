"""
generate_laz_from_road_data.py

Generate synthetic .laz (LiDAR point cloud) files from road data.

Inputs:
  - Road data CSV (e.g. maharashtra_lidar_metrics_500 .csv), or
  - Single road: road_id, length_m, width_m, and optional distress params

Output:
  - One .laz file per road/scan in storage/las/ (or --output-dir).

Usage:
  # Generate LAZ for all roads in the metrics CSV (first N rows)
  python -m scripts.generate_laz_from_road_data --csv "D:/RoadRaksha/innovate-techathon/maharashtra_lidar_metrics_500 .csv" --limit 10

  # Generate a single LAZ from explicit parameters
  python -m scripts.generate_laz_from_road_data --road-id MA-NH48-SEG-0001 --length 1000 --width 7 --scan-id custom-scan-001

  # Output to custom directory
  python -m scripts.generate_laz_from_road_data --csv path/to/metrics.csv --output-dir ./output_laz
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import numpy as np

# Add project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    import laspy
except ImportError:
    print("Install laspy: pip install laspy")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Synthetic point cloud generation
# ---------------------------------------------------------------------------

def generate_road_point_cloud(
    length_m: float = 100.0,
    width_m: float = 7.0,
    points_per_m2: float = 50.0,
    origin_x: float = 0.0,
    origin_y: float = 0.0,
    origin_z: float = 0.0,
    pothole_count: int = 0,
    pothole_depth_mm: float = 80.0,
    rut_depth_mm: float = 5.0,
    seed: int | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate synthetic LiDAR points for a road segment.

    Returns:
        xyz: (N, 3) float64 array in metres (local coordinates).
        intensity: (N,) uint16 array 0-65535.
    """
    if seed is not None:
        np.random.seed(seed)

    area_m2 = length_m * width_m
    n = max(1000, int(area_m2 * points_per_m2))
    n = min(n, 5_000_000)  # cap for memory

    # Uniform grid with jitter for natural look
    u = np.random.uniform(0, 1, n)
    v = np.random.uniform(0, 1, n)
    x = v * width_m - (width_m / 2)
    z = u * length_m
    y = np.zeros(n, dtype=np.float64)

    # Road surface: slight crown (higher at center)
    y -= 0.02 * (x ** 2)
    # Add micro roughness
    y += np.random.normal(0, 0.005, n)

    # Potholes: Gaussian depressions
    depth_m = pothole_depth_mm / 1000.0
    for _ in range(pothole_count):
        cx = np.random.uniform(-width_m * 0.3, width_m * 0.3)
        cz = np.random.uniform(length_m * 0.2, length_m * 0.8)
        radius = np.random.uniform(0.3, 1.2)
        dist_sq = (x - cx) ** 2 + (z - cz) ** 2
        y -= depth_m * np.exp(-dist_sq / (2 * radius ** 2))

    # Rutting: sinusoidal grooves along length
    rut_m = rut_depth_mm / 1000.0
    y -= rut_m * 0.5 * (np.sin(z * 0.05) ** 2) * (np.abs(x) < width_m * 0.4)

    # Intensity: higher for elevated points (simulate reflectivity)
    intensity_raw = np.clip(100 + (y - y.min()) * 500, 0, 65535)
    intensity = intensity_raw.astype(np.uint16)

    # Stack XYZ and translate to origin
    xyz = np.column_stack([
        origin_x + x,
        origin_y + y,
        origin_z + z,
    ]).astype(np.float64)

    return xyz, intensity


def write_laz(
    xyz: np.ndarray,
    intensity: np.ndarray,
    out_path: Path,
    point_format: int = 3,
    scale: tuple[float, float, float] = (0.001, 0.001, 0.001),
) -> None:
    """
    Write point cloud to LAZ (or uncompressed LAS if no LazBackend).
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    header = laspy.LasHeader(point_format=point_format, version="1.4")
    header.offsets = np.floor(xyz.min(axis=0))
    header.scales = np.array(scale, dtype=np.float64)

    record = laspy.ScaleAwarePointRecord.zeros(len(xyz), header=header)
    record.x = xyz[:, 0]
    record.y = xyz[:, 1]
    record.z = xyz[:, 2]
    if hasattr(record, "intensity"):
        record.intensity = intensity

    try:
        with laspy.open(out_path, mode="w", header=header, do_compress=True) as writer:
            writer.write_points(record)
        return
    except laspy.errors.LaspyException:
        pass
    # No LazBackend (lazperf/laszip); write uncompressed .las
    fallback = out_path.with_suffix(".las")
    with laspy.open(fallback, mode="w", header=header, do_compress=False) as writer:
        writer.write_points(record)


# ---------------------------------------------------------------------------
# CLI: from CSV or from single-road args
# ---------------------------------------------------------------------------

def run_from_csv(csv_path: Path, output_dir: Path, limit: int | None) -> None:
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if limit is not None:
        rows = rows[:limit]

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    for i, row in enumerate(rows):
        road_id = row.get("road_id", "").strip()
        if not road_id:
            continue
        scan_id = row.get("scan_id", "").strip() or f"gen-{road_id}-{i}"
        try:
            pothole_count = int(float(row.get("pothole_count", 0)))
        except (ValueError, TypeError):
            pothole_count = 0
        try:
            avg_depth_mm = float(row.get("avg_pothole_depth_mm", 80))
        except (ValueError, TypeError):
            avg_depth_mm = 80
        try:
            avg_rut_mm = float(row.get("avg_rut_depth_mm", 5))
        except (ValueError, TypeError):
            avg_rut_mm = 5
        try:
            density = float(row.get("point_density_pts_per_m2", 50))
        except (ValueError, TypeError):
            density = 50

        length_m = 1000.0  # 1 km segment
        width_m = 7.0

        xyz, intensity = generate_road_point_cloud(
            length_m=length_m,
            width_m=width_m,
            points_per_m2=density,
            pothole_count=pothole_count,
            pothole_depth_mm=avg_depth_mm,
            rut_depth_mm=avg_rut_mm,
            seed=hash(scan_id) % (2 ** 32),
        )
        out_file = output_dir / f"{scan_id}.laz"
        write_laz(xyz, intensity, out_file)
        # May have written .las if LAZ compression not available
        written = out_file if out_file.exists() else output_dir / f"{scan_id}.las"
        print(f"Wrote {written.name} ({len(xyz)} pts) for {road_id}")


def run_single(
    road_id: str,
    scan_id: str,
    length_m: float,
    width_m: float,
    pothole_count: int,
    pothole_depth_mm: float,
    rut_depth_mm: float,
    points_per_m2: float,
    output_dir: Path,
) -> None:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    xyz, intensity = generate_road_point_cloud(
        length_m=length_m,
        width_m=width_m,
        points_per_m2=points_per_m2,
        pothole_count=pothole_count,
        pothole_depth_mm=pothole_depth_mm,
        rut_depth_mm=rut_depth_mm,
        seed=hash(scan_id) % (2 ** 32),
    )
    out_file = output_dir / f"{scan_id}.laz"
    write_laz(xyz, intensity, out_file)
    written = out_file if out_file.exists() else output_dir / f"{scan_id}.las"
    print(f"Wrote {written} ({len(xyz)} points)")


def main() -> None:
    try:
        from config import LAS_DIR
    except ImportError:
        LAS_DIR = PROJECT_ROOT / "storage" / "las"

    ap = argparse.ArgumentParser(description="Generate .laz from road data")
    ap.add_argument("--csv", type=Path, help="Road/metrics CSV path")
    ap.add_argument("--limit", type=int, default=None, help="Max rows from CSV")
    ap.add_argument("--output-dir", type=Path, default=LAS_DIR, help="Output directory for .laz")
    ap.add_argument("--road-id", type=str, help="Single road: road ID")
    ap.add_argument("--scan-id", type=str, help="Single road: scan ID for filename")
    ap.add_argument("--length", type=float, default=1000, help="Segment length (m)")
    ap.add_argument("--width", type=float, default=7, help="Road width (m)")
    ap.add_argument("--potholes", type=int, default=0, help="Number of potholes to simulate")
    ap.add_argument("--pothole-depth-mm", type=float, default=80, help="Avg pothole depth (mm)")
    ap.add_argument("--rut-depth-mm", type=float, default=5, help="Rut depth (mm)")
    ap.add_argument("--density", type=float, default=50, help="Points per m²")
    args = ap.parse_args()

    if args.csv is not None:
        if not args.csv.exists():
            print(f"CSV not found: {args.csv}")
            sys.exit(1)
        run_from_csv(args.csv, args.output_dir, args.limit)
        return

    if args.road_id and args.scan_id:
        run_single(
            road_id=args.road_id,
            scan_id=args.scan_id,
            length_m=args.length,
            width_m=args.width,
            pothole_count=args.potholes,
            pothole_depth_mm=args.pothole_depth_mm,
            rut_depth_mm=args.rut_depth_mm,
            points_per_m2=args.density,
            output_dir=args.output_dir,
        )
        return

    print("Use --csv <path> or --road-id + --scan-id. See --help.")
    sys.exit(1)


if __name__ == "__main__":
    main()
