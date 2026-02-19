// ─── Road Registry Types ───────────────────────────────────────

export interface RoadRecord {
  road_id: string;
  name: string;
  nh_number: string;
  segment_start_km: number;
  segment_end_km: number;
  jurisdiction: string;
  category: string;
  length_km: number;
  lane_count: number;
  surface_type: "concrete" | "bitumen" | "gravel" | "earthen";
  year_constructed: number;
  last_major_rehab_year: number | null;
  status: "active" | "under_construction";
  geometry: string;
  notes: string;
  state: string;
  district: string;
  taluka: string;
  region_type: string;
  terrain_type: "steep" | "hilly" | "plain";
  slope_category: "steep" | "moderate" | "flat";
  monsoon_rainfall_category: "high" | "medium" | "low";
  landslide_prone: boolean;
  flood_prone: boolean;
  ghat_section_flag: boolean;
  tourism_route_flag: boolean;
  elevation_m: number;
  avg_daily_traffic: number;
  truck_percentage: number;
  peak_hour_traffic: number;
  traffic_weight: number;
  seasonal_variation: string;
}

export interface InspectionRecord {
  inspection_id: string;
  road_id: string;
  inspection_date: string;
  inspector_agency: string;
  condition_score: number;
  surface_damage_pct: number;
  waterlogging_flag: boolean;
  drainage_status: string;
  remarks: string;
}

// ─── Scoring Types ─────────────────────────────────────────────

export interface ConditionParameters {
  PCI: number;   // Pavement Condition Index (0-100)
  RSL: number;   // Remaining Structural Life (0-100)
  DRN: number;   // Drainage Condition (0-100)
  RQL: number;   // Ride Quality (0-100)
}

export interface HealthScore {
  parameters: ConditionParameters;
  conditionScore: number;   // 0-100
  rating: number;           // 0-1000
  band: Band;
  bandLabel: string;
  bandColor: string;
}

export type Band = "A+" | "A" | "B" | "C" | "D" | "E";

export interface RoadWithScore extends RoadRecord {
  healthScore: HealthScore;
  inspections: InspectionRecord[];
}

// ─── Filter Types ──────────────────────────────────────────────

export interface RegistryFilters {
  search: string;
  district: string;
  surfaceType: string;
  jurisdiction: string;
  category: string;
  status: string;
  band: string;
}
