// ─── Road Registry Types (Updated for ultimate_dataset.csv) ────

export interface RoadRecord {
  // Identity
  road_id: string;
  name: string;
  geojson_id: string;
  highway_ref: string;
  segment_number: number;
  highway_type: string;
  oneway: string;
  lanes: string;
  maxspeed: string;
  condition: "good" | "average" | "very_bad";

  // Geometry
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  segment_start_km: number;
  segment_end_km: number;

  // Admin
  jurisdiction: string;
  category: string;
  length_km: number;
  lane_count: number;
  surface_type: "concrete" | "bitumen" | "gravel" | "earthen";
  year_constructed: number;
  last_major_rehab_year: number | null;
  status: string;

  // Geography
  state: string;
  district: string;
  taluka: string;
  region_type: string;
  terrain_type: string;
  slope_category: string;
  monsoon_rainfall_category: "high" | "medium" | "low";
  landslide_prone: boolean;
  flood_prone: boolean;
  ghat_section_flag: boolean;
  tourism_route_flag: boolean;
  elevation_m: number;

  // Traffic
  avg_daily_traffic: number;
  truck_percentage: number;
  peak_hour_traffic: number;
  traffic_weight: number;
  seasonal_variation: string;

  // ─── Distress Metrics (from field surveys) ───────────────
  potholes_per_km: number;
  pothole_avg_depth_cm: number;
  cracks_longitudinal_pct: number;
  cracks_transverse_per_km: number;
  alligator_cracking_pct: number;
  rutting_depth_mm: number;
  raveling_pct: number;
  edge_breaking_pct: number;
  patches_per_km: number;

  // ─── Measured Condition Scores ───────────────────────────
  iri_value: number;   // International Roughness Index
  pci_score: number;   // Pavement Condition Index (0-100)
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

/**
 * ML backend response from POST /score (Road CIBIL API).
 * All scoring authority lives here — no client-side computation.
 */
export interface ConditionParameters {
  PCI: number;      // Pavement Condition Index (0-100) — from field data
  IRI: number;      // IRI normalised to 0-100
  DISTRESS: number; // Weighted distress index (0-100)
  RSL: number;      // Remaining Structural Life (0-100)
  DRN: number;      // Drainage Condition (0-100)
}

export interface HealthScore {
  // ── ML hybrid outputs ──────────────────────────────────────
  finalCibilScore:    number;   // 0-100  Hybrid = 0.7×Pseudo + 0.3×ML
  conditionCategory:  string;   // "Good" | "Fair" | "Poor" | "Critical"
  pdi:                number;   // Pavement Distress Index (0-100)
  pseudoCibil:        number;   // Deterministic PDI-based score
  mlPredictedCibil:   number;   // RandomForest prediction
  modelVersion:       string;   // e.g. "v1.0"
  latencyMs:          number;   // Inference latency

  // ── Derived / display helpers ──────────────────────────────
  parameters:       ConditionParameters; // kept for UI bar charts
  conditionScore:   number;   // alias of finalCibilScore  (0-100)
  rating:           number;   // 0-1000  = conditionScore × 10
  band:             Band;     // A+ … E
  bandLabel:        string;   // "Excellent" … "Critical"
  bandColor:        string;   // hex colour for UI
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

// ─── Citizen Complaint Hotline Types ───────────────────────────

export type ComplaintType =
  | "pothole"
  | "crack"
  | "waterlogging"
  | "debris"
  | "missing_signage"
  | "guardrail_damage"
  | "road_collapse"
  | "other";

export type ComplaintSeverity = "low" | "medium" | "high" | "critical";
export type ComplaintStatus = "new" | "acknowledged" | "in-progress" | "resolved" | "closed";
export type ComplaintSource = "ivr_voice" | "ivr_keypad" | "web_form" | "telegram" | "twilio_ivr" | "browser_voice";

export interface Complaint {
  id: string;
  timestamp: string;

  // Location
  road_id?: string;
  road_name?: string;
  highway_ref?: string;
  district: string;
  taluka?: string;
  location_description: string;
  lat?: number;
  lon?: number;

  // Issue
  complaint_type: ComplaintType;
  severity: ComplaintSeverity;
  description: string;

  // Citizen
  citizen_name: string;
  citizen_phone: string;
  citizen_language?: "en" | "hi" | "mr";

  // Source & tracking
  source: ComplaintSource;
  status: ComplaintStatus;
  assigned_to?: string;
  resolution_notes?: string;
  resolved_at?: string;

  // Audio (for IVR calls)
  voice_transcript?: string;
}
