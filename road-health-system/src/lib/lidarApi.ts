/**
 * lidarApi.ts - Client for LiDAR Road Condition Intelligence API
 * Backend runs on port 8001
 */

// Use /api/lidar proxy (Next.js) or direct LIDAR_API for dev
const LIDAR_API = process.env.NEXT_PUBLIC_LIDAR_API || "";
const API_BASE = LIDAR_API ? `${LIDAR_API.replace(/\/$/, "")}` : "";

export interface LidarScan {
  scan_id: string;
  lidar_source: string;
  upload_timestamp: string | null;
  survey_date: string | null;
  status: string;
  potree_url: string | null;
}

export interface LidarMetrics {
  scan_id: string;
  road_id: string;
  pothole_count: number;
  pothole_total_volume_m3: number;
  avg_pothole_depth_mm: number;
  max_pothole_depth_mm: number;
  avg_rut_depth_mm: number;
  max_rut_depth_mm: number;
  roughness_proxy: number;
  damaged_area_percent: number;
  point_density_pts_per_m2: number;
  lidar_quality_score: number;
}

export interface LidarScansResponse {
  road_id: string;
  scans: LidarScan[];
}

export async function fetchLidarScans(roadId: string): Promise<LidarScansResponse | null> {
  try {
    const base = API_BASE ? `${API_BASE}/lidar` : "/api/lidar";
    const res = await fetch(`${base}/scans/${encodeURIComponent(roadId)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchLidarMetrics(scanId: string): Promise<LidarMetrics | null> {
  try {
    const base = API_BASE ? `${API_BASE}/lidar` : "/api/lidar";
    const res = await fetch(`${base}/metrics/${encodeURIComponent(scanId)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Returns Potree viewer URL - use scan.potree_url when available for actual 3D content */
export function getPotreeViewerUrl(scanId: string, potreeUrlFromScan?: string | null): string {
  if (potreeUrlFromScan) return potreeUrlFromScan;
  const base = API_BASE ? `${API_BASE}/lidar` : "/api/lidar";
  return `${base}/viewer/${scanId}`;
}

/** URL to download the .laz point cloud file for a scan */
export function getPointCloudDownloadUrl(scanId: string): string {
  if (API_BASE) return `${API_BASE}/lidar/pointcloud/${encodeURIComponent(scanId)}`;
  return `/api/lidar-pointcloud/${encodeURIComponent(scanId)}`;
}

const BACKEND_BASE = API_BASE || "/api/lidar-backend";

export interface DashboardKpis {
  km_scanned_this_month: number;
  total_pothole_volume_statewide_m3: number;
  roads_safe_condition_percent: number;
  contractor_avg_quality_score: number;
  sla_compliance_rate_percent: number;
}

export interface WorkOrder {
  id: string;
  road_id: string;
  scan_id: string;
  severity: string;
  status: string;
  estimated_repair_volume_m3: number;
  estimated_cost: number;
  recommended_action: string;
  sla_days: number;
  created_at: string | null;
}

export interface BudgetSimulation {
  budget: number;
  spent: number;
  remaining: number;
  work_orders_count: number;
  recommended_roads: string[];
  work_orders: { work_order_id: string; road_id: string; severity: string; estimated_cost: number; recommended_action: string }[];
}

export async function fetchDashboardKpis(): Promise<DashboardKpis | null> {
  try {
    const res = await fetch(`${BACKEND_BASE}/dashboard/kpis`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchAlerts(): Promise<{ items: { id: number; road_id: string; work_order_id: string | null; alert_type: string; message: string; created_at: string | null }[] } | null> {
  try {
    const res = await fetch(`${BACKEND_BASE}/dashboard/alerts`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchCriticalSegments(): Promise<{ road_ids: string[] } | null> {
  try {
    const res = await fetch(`${BACKEND_BASE}/dashboard/critical-segments`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchWorkOrders(params?: { road_id?: string; status?: string; severity?: string }): Promise<{ items: WorkOrder[] } | null> {
  try {
    const q = new URLSearchParams();
    if (params?.road_id) q.set("road_id", params.road_id);
    if (params?.status) q.set("status", params.status);
    if (params?.severity) q.set("severity", params.severity);
    const res = await fetch(`${BACKEND_BASE}/workorders?${q.toString()}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchBudgetSimulate(budget: number): Promise<BudgetSimulation | null> {
  try {
    const res = await fetch(`${BACKEND_BASE}/budget/simulate?budget=${budget}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function uploadLidar(roadId: string, file: File, lidarSource: string, surveyDate?: string): Promise<{ scan_id: string; road_id: string; status: string; las_filename: string; potree_url: string | null } | null> {
  try {
    const form = new FormData();
    form.append("road_id", roadId);
    form.append("lidar_source", lidarSource);
    form.append("pointcloud_file", file);
    if (surveyDate) form.append("survey_date", surveyDate);
    const base = API_BASE ? `${API_BASE}/lidar` : "/api/lidar";
    const res = await fetch(`${base}/upload`, { method: "POST", body: form });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
