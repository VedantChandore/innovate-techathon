/**
 * scoring.ts
 * ==========
 * ML-driven Road CIBIL scoring engine.
 *
 * ALL scoring authority lives in the FastAPI ML backend at http://localhost:8000.
 * This file contains:
 *   1. scoreRoad()     — POST a single road to /score, returns HealthScore
 *   2. scoreBulk()     — Score all roads in parallel (with concurrency cap)
 *   3. getInspectionInterval() — derived from ML condition band
 *   4. estimateRepairCost()    — derived from ML condition category + road props
 *
 * LEGACY REMOVED:
 *   ✗ getPCI()               — deleted
 *   ✗ getIRINormalized()      — deleted
 *   ✗ computeDistressIndex()  — deleted
 *   ✗ computeRSL()            — deleted
 *   ✗ computeDRN()            — deleted
 *   ✗ computeHealthScore()    — replaced by async scoreRoad()
 */

import { RoadRecord, HealthScore, Band } from "./types";

// ─── ML Backend URL ────────────────────────────────────────────
const ML_API = "http://localhost:8000";

// ─── Band mapping from ML 0-100 score ──────────────────────────
// ML returns: Good(80-100) · Fair(60-79) · Poor(40-59) · Critical(0-39)
// Mapped to 6-band A+/A/B/C/D/E display system.

function getBandFromScore(score: number): { band: Band; bandLabel: string; bandColor: string } {
  if (score >= 90) return { band: "A+", bandLabel: "Excellent", bandColor: "#059669" };
  if (score >= 75) return { band: "A",  bandLabel: "Good",      bandColor: "#22c55e" };
  if (score >= 60) return { band: "B",  bandLabel: "Fair",      bandColor: "#eab308" };
  if (score >= 45) return { band: "C",  bandLabel: "Poor",      bandColor: "#f97316" };
  if (score >= 30) return { band: "D",  bandLabel: "Very Poor", bandColor: "#ef4444" };
  return              { band: "E",  bandLabel: "Critical",  bandColor: "#991b1b" };
}

// ─── Map ML API response → HealthScore ────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToHealthScore(mlResponse: any): HealthScore {
  const score = mlResponse.final_cibil_score as number;
  const { band, bandLabel, bandColor } = getBandFromScore(score);
  const pdi    = mlResponse.pdi          as number;
  const pseudo = mlResponse.pseudo_cibil as number;

  return {
    // ML hybrid outputs
    finalCibilScore:   score,
    conditionCategory: mlResponse.condition_category as string,
    pdi,
    pseudoCibil:       pseudo,
    mlPredictedCibil:  mlResponse.ml_predicted_cibil as number,
    modelVersion:      mlResponse.model_version      as string,
    latencyMs:         mlResponse.latency_ms         as number,
    // Display helpers
    parameters: {
      PCI:     Math.round(pseudo),
      IRI:     Math.round(Math.max(0, 100 - pdi * 0.8)),
      DISTRESS:Math.round(Math.max(0, 100 - pdi)),
      RSL:     Math.round(pseudo * 0.9),
      DRN:     Math.round(pseudo * 0.85),
    },
    conditionScore: score,
    rating:         Math.round(score * 10),
    band,
    bandLabel,
    bandColor,
  };
}

// ─── Fallback when ML API is unreachable ───────────────────────
export function fallbackScore(road: RoadRecord): HealthScore {
  const pciRaw  = road.pci_score ?? 50;
  const iriNorm = Math.max(0, 100 - (road.iri_value ?? 5) * 8);
  const deductions =
    Math.min(1, (road.potholes_per_km           ?? 0) / 30) * 20 +
    Math.min(1, (road.alligator_cracking_pct    ?? 0) / 50) * 18 +
    Math.min(1, (road.rutting_depth_mm          ?? 0) / 40) * 15 +
    Math.min(1, (road.cracks_longitudinal_pct   ?? 0) / 50) * 12 +
    Math.min(1, (road.cracks_transverse_per_km  ?? 0) / 30) * 10 +
    Math.min(1, (road.pothole_avg_depth_cm      ?? 0) / 20) * 8  +
    Math.min(1, (road.raveling_pct              ?? 0) / 50) * 7  +
    Math.min(1, (road.edge_breaking_pct         ?? 0) / 50) * 5  +
    Math.min(1, (road.patches_per_km            ?? 0) / 25) * 5;
  const distress = Math.max(0, Math.min(100, 100 - deductions));
  // Weighted formula — no hardcoded bias so scores spread naturally
  // PCI(30%) + IRI(25%) + Distress(25%) + Surface/Age factor(20%)
  const age = 2026 - (road.year_constructed ?? 2000);
  const lifespan: Record<string, number> = { concrete: 30, bitumen: 20, gravel: 12, earthen: 8 };
  const designLife = lifespan[road.surface_type ?? "bitumen"] ?? 15;
  const ageScore = Math.max(0, Math.min(100, 100 - (age / designLife) * 100));
  const score = Math.round(0.30 * pciRaw + 0.25 * iriNorm + 0.25 * distress + 0.20 * ageScore);
  const { band, bandLabel, bandColor } = getBandFromScore(score);

  return {
    finalCibilScore:   score,
    conditionCategory: score >= 80 ? "Good" : score >= 60 ? "Fair" : score >= 40 ? "Poor" : "Critical",
    pdi:               Math.max(0, 100 - score),
    pseudoCibil:       score,
    mlPredictedCibil:  score,
    modelVersion:      "fallback",
    latencyMs:         0,
    parameters: {
      PCI:     Math.round(pciRaw),
      IRI:     Math.round(iriNorm),
      DISTRESS:Math.round(distress),
      RSL:     60,
      DRN:     60,
    },
    conditionScore: score,
    rating:         score * 10,
    band,
    bandLabel,
    bandColor,
  };
}

// ─── Build ML API payload from RoadRecord ─────────────────────
function buildPayload(road: RoadRecord): Record<string, unknown> {
  const boolToInt = (v: boolean | undefined | null) => (v ? 1 : 0);

  const surfaceMap: Record<string, string> = {
    concrete: "concrete", bitumen: "bitumen", gravel: "gravel",
    earthen: "earthen", asphalt: "bitumen", wbm: "gravel",
  };
  const terrainMap: Record<string, string> = {
    plain: "plain", flat: "plain", valley: "plain",
    hilly: "hilly", undulating: "hilly",
    steep: "steep", mountainous: "steep",
  };
  const regionMap: Record<string, string> = {
    rural: "rural", "semi-urban": "semi-urban", urban: "urban",
    coastal: "rural", "western ghats": "rural", "deccan plateau": "rural", inland: "rural",
  };

  return {
    iri_value:                road.iri_value                ?? 2.5,
    alligator_cracking_pct:   road.alligator_cracking_pct   ?? 5.0,
    potholes_per_km:          road.potholes_per_km          ?? 3.0,
    rutting_depth_mm:         road.rutting_depth_mm         ?? 5.0,
    cracks_longitudinal_pct:  road.cracks_longitudinal_pct  ?? 5.0,
    cracks_transverse_per_km: road.cracks_transverse_per_km ?? 3.0,
    raveling_pct:             road.raveling_pct             ?? 5.0,
    edge_breaking_pct:        road.edge_breaking_pct        ?? 5.0,
    patches_per_km:           road.patches_per_km           ?? 2.0,
    pothole_avg_depth_cm:     road.pothole_avg_depth_cm     ?? 2.0,
    pci_score:                road.pci_score                ?? 70.0,
    lane_count:               road.lane_count               ?? 2.0,
    length_km:                road.length_km                ?? 1.0,
    year_constructed:         road.year_constructed         ?? 2010,
    last_major_rehab_year:    road.last_major_rehab_year    ?? road.year_constructed ?? 2015,
    avg_daily_traffic:        road.avg_daily_traffic        ?? 5000,
    truck_percentage:         road.truck_percentage         ?? 15,
    peak_hour_traffic:        road.peak_hour_traffic        ?? 500,
    traffic_weight:           road.traffic_weight           ?? 5,
    elevation_m:              road.elevation_m              ?? 200,
    surface_type:             surfaceMap[(road.surface_type ?? "bitumen").toLowerCase()]  ?? "bitumen",
    slope_category:           road.slope_category           ?? "flat",
    monsoon_rainfall_category:road.monsoon_rainfall_category ?? "medium",
    terrain_type:             terrainMap[(road.terrain_type ?? "plain").toLowerCase()]   ?? "plain",
    region_type:              regionMap[(road.region_type  ?? "rural").toLowerCase()]    ?? "rural",
    landslide_prone:          boolToInt(road.landslide_prone),
    flood_prone:              boolToInt(road.flood_prone),
    ghat_section_flag:        boolToInt(road.ghat_section_flag),
    tourism_route_flag:       boolToInt(road.tourism_route_flag),
  };
}

// ─── Single road scoring ──────────────────────────────────────
export async function scoreRoad(road: RoadRecord): Promise<HealthScore> {
  try {
    const res = await fetch(`${ML_API}/score`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(buildPayload(road)),
    });
    if (!res.ok) {
      console.warn(`[scoring] ML API ${res.status} for ${road.road_id} — fallback`);
      return fallbackScore(road);
    }
    return mapToHealthScore(await res.json());
  } catch (err) {
    console.warn(`[scoring] ML API unreachable for ${road.road_id} — fallback`, err);
    return fallbackScore(road);
  }
}

// ─── Bulk scoring with concurrency cap ───────────────────────
export async function scoreBulk(roads: RoadRecord[]): Promise<HealthScore[]> {
  const CONCURRENCY = 10;
  const results: HealthScore[] = new Array(roads.length);
  for (let i = 0; i < roads.length; i += CONCURRENCY) {
    const batch  = roads.slice(i, i + CONCURRENCY);
    const scores = await Promise.all(batch.map((r) => scoreRoad(r)));
    scores.forEach((s, j) => { results[i + j] = s; });
  }
  return results;
}

// ─── Inspection interval — from ML band ──────────────────────
export function getInspectionInterval(band: Band): number {
  const intervals: Record<Band, number> = {
    "A+": 180, A: 120, B: 60, C: 30, D: 15, E: 7,
  };
  return intervals[band];
}

// ─── Repair cost — from ML condition category ─────────────────
export function estimateRepairCost(road: RoadRecord, conditionCategory?: string): number {
  const baseCostPerKm: Record<string, number> = {
    concrete: 150, bitumen: 80, gravel: 35, earthen: 18,
  };
  const conditionMultiplier: Record<string, number> = {
    Critical: 3.5, Poor: 2.0, Fair: 1.2, Good: 0.4,
  };
  const base = baseCostPerKm[road.surface_type ?? "bitumen"] ?? 60;
  const mult = conditionMultiplier[conditionCategory ?? "Fair"] ?? 1.2;
  return Math.round(base * mult * road.length_km);
}


