import Papa from "papaparse";
import { RoadRecord, InspectionRecord, RoadWithScore } from "./types";
import { fallbackScore } from "./scoring";

function parseBool(val: string): boolean {
  return val === "TRUE" || val === "true" || val === "1";
}

function parseNum(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function parseNullNum(val: string): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

export async function loadRoadRegistry(): Promise<RoadWithScore[]> {
  const [registryRes, inspectionRes] = await Promise.all([
    fetch("/road_registry.csv"),
    fetch("/inspection_history.csv"),
  ]);

  const registryText = await registryRes.text();
  const inspectionText = await inspectionRes.text();

  // Parse road registry
  const registryResult = Papa.parse(registryText, { header: true, skipEmptyLines: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roads: RoadRecord[] = registryResult.data.map((row: any) => ({
    // Identity
    road_id: row.road_id || "",
    name: row.name || "",
    geojson_id: row.geojson_id || "",
    highway_ref: row.highway_ref || row.nh_number || "",
    segment_number: parseNum(row.segment_number),
    highway_type: row.highway_type || "secondary",
    oneway: row.oneway || "no",
    lanes: row.lanes || "2",
    maxspeed: row.maxspeed || "60",
    condition: (row.condition || "average") as RoadRecord["condition"],
    // Geometry
    start_lat: parseNum(row.start_lat),
    start_lon: parseNum(row.start_lon),
    end_lat: parseNum(row.end_lat),
    end_lon: parseNum(row.end_lon),
    segment_start_km: parseNum(row.segment_start_km),
    segment_end_km: parseNum(row.segment_end_km),
    // Admin
    jurisdiction: row.jurisdiction || "",
    category: row.category || "",
    length_km: parseNum(row.length_km),
    lane_count: parseNum(row.lane_count),
    surface_type: (row.surface_type || "bitumen") as RoadRecord["surface_type"],
    year_constructed: parseNum(row.year_constructed),
    last_major_rehab_year: parseNullNum(row.last_major_rehab_year),
    status: row.status || "active",
    // Geography
    state: row.state || "Maharashtra",
    district: row.district || "",
    taluka: row.taluka || "",
    region_type: row.region_type || "",
    terrain_type: row.terrain_type || "plain",
    slope_category: row.slope_category || "flat",
    monsoon_rainfall_category: (row.monsoon_rainfall_category || "medium") as RoadRecord["monsoon_rainfall_category"],
    landslide_prone: parseBool(row.landslide_prone),
    flood_prone: parseBool(row.flood_prone),
    ghat_section_flag: parseBool(row.ghat_section_flag),
    tourism_route_flag: parseBool(row.tourism_route_flag),
    elevation_m: parseNum(row.elevation_m),
    // Traffic
    avg_daily_traffic: parseNum(row.avg_daily_traffic),
    truck_percentage: parseNum(row.truck_percentage),
    peak_hour_traffic: parseNum(row.peak_hour_traffic),
    traffic_weight: parseNum(row.traffic_weight),
    seasonal_variation: row.seasonal_variation || "",
    // Distress metrics
    potholes_per_km: parseNum(row.potholes_per_km),
    pothole_avg_depth_cm: parseNum(row.pothole_avg_depth_cm),
    cracks_longitudinal_pct: parseNum(row.cracks_longitudinal_pct),
    cracks_transverse_per_km: parseNum(row.cracks_transverse_per_km),
    alligator_cracking_pct: parseNum(row.alligator_cracking_pct),
    rutting_depth_mm: parseNum(row.rutting_depth_mm),
    raveling_pct: parseNum(row.raveling_pct),
    edge_breaking_pct: parseNum(row.edge_breaking_pct),
    patches_per_km: parseNum(row.patches_per_km),
    // Measured condition
    iri_value: parseNum(row.iri_value) || 3,
    pci_score: parseNum(row.pci_score) || 60,
  }));

  // Parse inspection history
  const inspectionResult = Papa.parse(inspectionText, { header: true, skipEmptyLines: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inspections: InspectionRecord[] = inspectionResult.data.map((row: any) => ({
    inspection_id: row.inspection_id || "",
    road_id: row.road_id || "",
    inspection_date: row.inspection_date || "",
    inspector_agency: row.inspector_agency || "",
    condition_score: parseNum(row.condition_score),
    surface_damage_pct: parseNum(row.surface_damage_pct),
    waterlogging_flag: parseBool(row.waterlogging_flag),
    drainage_status: row.drainage_status || "",
    remarks: row.remarks || "",
  }));

  // Group inspections by road_id (exact) AND by segment suffix (e.g. "0001" from "MA-RD-SEG-0001")
  // This handles the ID format mismatch between inspection history (MA-RD-SEG-XXXX)
  // and the new road registry (MA--SEG-XXXX, MA-6-SEG-XXXX, MA-NH 361-SEG-XXXX, etc.)
  const inspectionMap = new Map<string, InspectionRecord[]>();
  const inspectionBySegNum = new Map<string, InspectionRecord[]>();

  function extractSegNum(road_id: string): string | null {
    const m = road_id.match(/SEG-(\d+)$/i);
    return m ? m[1] : null;
  }

  inspections.forEach((insp) => {
    // Exact match index
    const existing = inspectionMap.get(insp.road_id) || [];
    existing.push(insp);
    inspectionMap.set(insp.road_id, existing);

    // Segment-number fallback index
    const segNum = extractSegNum(insp.road_id);
    if (segNum) {
      const byNum = inspectionBySegNum.get(segNum) || [];
      byNum.push(insp);
      inspectionBySegNum.set(segNum, byNum);
    }
  });

  // Score all roads instantly using deterministic fallback formula.
  // The ML API (scoreRoad) is reserved for single-road detail views —
  // calling it 16k times would take ~50 minutes.
  const roadsWithScores: RoadWithScore[] = roads.map((road) => {
    // Try exact match first, then fall back to segment-number match
    let roadInspections = inspectionMap.get(road.road_id);
    if (!roadInspections || roadInspections.length === 0) {
      const segNum = extractSegNum(road.road_id);
      if (segNum) roadInspections = inspectionBySegNum.get(segNum);
    }
    return {
      ...road,
      healthScore: fallbackScore(road),
      inspections: roadInspections || [],
    };
  });

  return roadsWithScores;
}

// ─── Utility: Get unique values for filters ────────────────────

export function getUniqueValues(roads: RoadWithScore[], key: keyof RoadRecord): string[] {
  const set = new Set<string>();
  roads.forEach((r) => {
    const val = String(r[key]);
    if (val) set.add(val);
  });
  return Array.from(set).sort();
}
