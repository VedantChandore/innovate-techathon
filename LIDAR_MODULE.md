# LiDAR-Based Road Condition Intelligence Module

Full implementation integrated with the Maharashtra Central Road Registry platform.

## Architecture

```
innovate-techathon/
├── lidar-backend/           # FastAPI service (port 8001)
│   ├── main.py
│   ├── config.py
│   ├── models/              # SQLAlchemy (lidar_scans, lidar_metrics, maintenance_work_orders, etc.)
│   ├── api/                 # lidar, workorder, budget, dashboard routes
│   ├── lidar/               # ingestion, metrics, workorder_engine, verification, visualization
│   ├── scripts/seed_from_csv.py
│   └── tests/
├── road-health-system/      # Next.js frontend
│   ├── src/lib/lidarApi.ts
│   ├── src/app/api/lidar/[...path]/route.ts  # Proxy to backend
│   └── src/components/RoadDetailModal.tsx    # "View 3D Scan" + metrics
└── maharashtra_lidar_metrics_500 .csv
```

## Running the System

### 1. LiDAR Backend

```bash
cd innovate-techathon/lidar-backend
pip install -r requirements.txt
python -m scripts.seed_from_csv   # Seed from CSV
python main.py                    # Or: uvicorn main:app --port 8001
```

- API: http://localhost:8001
- Docs: http://localhost:8001/docs

### 2. Road Registry (Next.js)

```bash
cd innovate-techathon/road-health-system
npm install
npm run dev
```

- App: http://localhost:3000
- Set `LIDAR_API_URL=http://localhost:8001` in `.env.local` if using API proxy

### 3. CIBIL ML Backend (optional, for scoring)

```bash
cd road-health-system/Cibil_Score_Model/api
uvicorn main:app --port 8000
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /lidar/upload | Upload point cloud, convert, store, compute metrics |
| GET | /lidar/scans/{road_id} | List scans for a road |
| GET | /lidar/metrics/{scan_id} | Get metrics for a scan |
| GET | /lidar/viewer/{scan_id} | Potree viewer URL |
| POST | /lidar/verify-repair | Contractor verification (before/after) |
| GET | /workorders | List work orders |
| GET | /budget/simulate?budget=X | Budget optimization |
| GET | /dashboard/kpis | Dashboard KPIs |
| GET | /dashboard/critical-segments | Roads needing attention |

## Data Flow

1. **Upload** → Save raw → Convert XYZ→LAS (PDAL) → Store scan metadata → Compute metrics
2. **Work order** → If metrics exceed thresholds → Create `maintenance_work_orders` + alert
3. **Verification** → Compare before/after scans → `contractor_performance_log`
4. **Road Detail** → Frontend fetches scans/metrics → "View 3D Scan" → Potree iframe

## CSV Path

Default: `D:\RoadRaksha\innovate-techathon\maharashtra_lidar_metrics_500 .csv`

Override: `LIDAR_CSV_PATH` environment variable
