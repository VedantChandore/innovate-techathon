# LiDAR Road Condition Intelligence Module

FastAPI backend for LiDAR-based road surface assessment, integrated with the Maharashtra Central Road Registry.

## Features

- **File Ingestion**: `POST /lidar/upload` - Upload .xyz/.las/.laz, convert to LAS, store metadata
- **Processing**: PDAL pipeline (optional), metrics extraction
- **Work Orders**: Automated creation when `max_pothole_depth_mm > 80` OR `damaged_area_percent > 2%` OR `avg_rut_depth_mm > 12`
- **Verification**: `POST /lidar/verify-repair` - Compare before/after scans, contractor quality
- **Budget**: `GET /budget/simulate?budget=50000000` - Rank work orders, recommend allocation
- **Dashboard**: `GET /dashboard/kpis` - KPIs (km scanned, pothole volume, SLA, etc.)
- **3D Viewer**: Potree URL per scan for Road Registry integration

## Quick Start

```bash
cd lidar-backend
pip install -r requirements.txt
python main.py
# Or: uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

## Seed from CSV

```bash
python -m scripts.seed_from_csv
```

Uses `maharashtra_lidar_metrics_500 .csv` (path: `LIDAR_CSV_PATH` env or parent dir).

## Database

- Default: SQLite (`lidar.db`) for local dev
- Production: Set `DATABASE_URL=postgresql+asyncpg://user:pass@host/db`

## Tests

```bash
pytest tests/ -v
```

## API Docs

- Swagger: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc
