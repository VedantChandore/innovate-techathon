import { RoadRecord, ConditionParameters, HealthScore, Band } from "./types";

// ─── Road Health Scoring Engine (v2 — Data-Driven) ─────────────
// Uses REAL PCI & IRI from field surveys + 9 distress metrics
// Formula: 0.30×PCI + 0.20×IRI_norm + 0.20×DISTRESS + 0.15×RSL + 0.15×DRN

const CURRENT_YEAR = 2026;

const SURFACE_LIFESPANS: Record<string, number> = {
  concrete: 30,
  bitumen: 20,
  gravel: 12,
  earthen: 8,
};

const clamp = (v: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(v * 10) / 10));

// ─── PCI: Direct from data (0-100) ────────────────────────────

function getPCI(road: RoadRecord): number {
  return clamp(road.pci_score);
}

// ─── IRI: Normalize to 0-100 (lower IRI = better road) ────────
// IRI range: 0-2 (excellent) to 12+ (very bad)
// We invert: IRI_norm = max(0, 100 - IRI × 8)

function getIRINormalized(road: RoadRecord): number {
  return clamp(100 - road.iri_value * 8);
}

// ─── DISTRESS INDEX: Weighted from 9 distress columns ──────────
// Each metric is normalized to 0-100 deduction, then combined.
// Higher raw value = more damage = lower score.

function computeDistressIndex(road: RoadRecord): number {
  // Normalize each: deduction = (value / max_expected) × weight × 100
  // Then: DISTRESS = 100 - totalDeduction

  const deductions = [
    // potholes_per_km: 0-30 range, weight 0.20
    Math.min(1, road.potholes_per_km / 30) * 20,
    // alligator_cracking_pct: 0-50%, weight 0.18
    Math.min(1, road.alligator_cracking_pct / 50) * 18,
    // rutting_depth_mm: 0-40mm, weight 0.15
    Math.min(1, road.rutting_depth_mm / 40) * 15,
    // cracks_longitudinal_pct: 0-50%, weight 0.12
    Math.min(1, road.cracks_longitudinal_pct / 50) * 12,
    // cracks_transverse_per_km: 0-30, weight 0.10
    Math.min(1, road.cracks_transverse_per_km / 30) * 10,
    // pothole_avg_depth_cm: 0-20cm, weight 0.08
    Math.min(1, road.pothole_avg_depth_cm / 20) * 8,
    // raveling_pct: 0-50%, weight 0.07
    Math.min(1, road.raveling_pct / 50) * 7,
    // edge_breaking_pct: 0-50%, weight 0.05
    Math.min(1, road.edge_breaking_pct / 50) * 5,
    // patches_per_km: 0-25, weight 0.05
    Math.min(1, road.patches_per_km / 25) * 5,
  ];

  const totalDeduction = deductions.reduce((s, d) => s + d, 0);
  return clamp(100 - totalDeduction);
}

// ─── RSL: Remaining Structural Life (modeled) ──────────────────

function computeRSL(road: RoadRecord): number {
  const designCycles: Record<string, number> = {
    concrete: 10_000_000,
    bitumen: 5_000_000,
    gravel: 1_000_000,
    earthen: 300_000,
  };
  const age = CURRENT_YEAR - road.year_constructed;
  const dc = designCycles[road.surface_type] || 2_000_000;
  const truckEsalFactor = 1 + (road.truck_percentage / 100) * 3.5;
  let consumed = road.avg_daily_traffic * truckEsalFactor * age * 365;

  if (road.last_major_rehab_year) {
    consumed *= 0.4;
  }

  const laneCount = road.lane_count || 2;
  const laneBonus = laneCount >= 6 ? 1.3 : laneCount >= 4 ? 1.1 : 1.0;

  return clamp(100 * Math.max(0, 1 - consumed / (dc * laneBonus)));
}

// ─── DRN: Drainage Condition (modeled) ─────────────────────────

function computeDRN(road: RoadRecord): number {
  const slopeBase: Record<string, number> = {
    steep: 85,
    moderate: 70,
    flat: 50,
  };
  const rainFactor = road.monsoon_rainfall_category === "high" ? 1.0
    : road.monsoon_rainfall_category === "medium" ? 0.5 : 0.0;

  let drn = slopeBase[road.slope_category] || 60;
  drn -= rainFactor * 20;
  drn -= road.flood_prone ? 25 : 0;
  drn -= road.landslide_prone ? 8 : 0;
  drn -= road.region_type === "coastal" ? 10 : 0;
  drn -= road.elevation_m < 100 ? 10 : 0;

  return clamp(drn);
}

// ─── Band Mapping ──────────────────────────────────────────────

interface BandInfo {
  band: Band;
  label: string;
  color: string;
}

function getBandInfo(score: number): BandInfo {
  if (score >= 80) return { band: "A+", label: "Excellent", color: "#059669" };
  if (score >= 65) return { band: "A", label: "Good", color: "#22c55e" };
  if (score >= 50) return { band: "B", label: "Fair", color: "#eab308" };
  if (score >= 35) return { band: "C", label: "Poor", color: "#f97316" };
  if (score >= 20) return { band: "D", label: "Very Poor", color: "#ef4444" };
  return { band: "E", label: "Critical", color: "#991b1b" };
}

// ─── Main Scoring Function ─────────────────────────────────────
// NEW: 0.30×PCI + 0.20×IRI_norm + 0.20×DISTRESS + 0.15×RSL + 0.15×DRN

export function computeHealthScore(road: RoadRecord): HealthScore {
  const parameters: ConditionParameters = {
    PCI: getPCI(road),
    IRI: getIRINormalized(road),
    DISTRESS: computeDistressIndex(road),
    RSL: computeRSL(road),
    DRN: computeDRN(road),
  };

  const conditionScore = Math.round(
    (0.30 * parameters.PCI +
      0.20 * parameters.IRI +
      0.20 * parameters.DISTRESS +
      0.15 * parameters.RSL +
      0.15 * parameters.DRN) *
      100
  ) / 100;

  const clamped = Math.max(0, Math.min(100, conditionScore));
  const rating = Math.round(clamped * 10);
  const { band, label, color } = getBandInfo(clamped);

  return {
    parameters,
    conditionScore: clamped,
    rating,
    band,
    bandLabel: label,
    bandColor: color,
  };
}

// ─── Utility: Inspection interval in days ──────────────────────

export function getInspectionInterval(band: Band): number {
  const intervals: Record<Band, number> = {
    "A+": 180,
    A: 120,
    B: 60,
    C: 30,
    D: 15,
    E: 7,
  };
  return intervals[band];
}

// ─── Utility: Estimated repair cost (₹ lakhs) ─────────────────

export function estimateRepairCost(road: RoadRecord): number {
  const costPerKm: Record<string, number> = {
    concrete: 120,
    bitumen: 60,
    gravel: 30,
    earthen: 15,
  };
  return Math.round((costPerKm[road.surface_type] || 40) * road.length_km);
}
