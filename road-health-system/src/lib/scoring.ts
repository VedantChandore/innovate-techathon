import { RoadRecord, ConditionParameters, HealthScore, Band } from "./types";

// ─── Road Health Scoring Engine ────────────────────────────────
// 4 Core Civil Engineering Parameters → Condition Score → CIBIL Band

const CURRENT_YEAR = 2026;

const SURFACE_LIFESPANS: Record<string, number> = {
  concrete: 30,
  bitumen: 20,
  gravel: 12,
  earthen: 8,
};

const clamp = (v: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(v * 10) / 10));

function getRehabBonus(lastRehabYear: number | null): number {
  if (!lastRehabYear) return 0;
  const yrs = CURRENT_YEAR - lastRehabYear;
  if (yrs <= 0) return 20;
  return Math.max(0, 20 - yrs * 2);
}

function getRainFactor(cat: string): number {
  return cat === "high" ? 1.0 : cat === "medium" ? 0.5 : 0.0;
}

function getTerrainFactor(t: string): number {
  return t === "steep" ? 1.0 : t === "hilly" ? 0.6 : 0.0;
}

function getSlopeFactor(s: string): number {
  return s === "steep" ? 1.0 : s === "moderate" ? 0.5 : 0.0;
}

// ─── PCI: Pavement Condition Index ─────────────────────────────
// Measures surface distress: cracks, potholes, raveling, rutting
function computePCI(road: RoadRecord): number {
  const baseScores: Record<string, number> = {
    concrete: 92,
    bitumen: 85,
    gravel: 55,
    earthen: 30,
  };
  const age = CURRENT_YEAR - road.year_constructed;
  const lifespan = SURFACE_LIFESPANS[road.surface_type] || 15;
  const ageRatio = Math.min(age / lifespan, 1.5);
  const rain = getRainFactor(road.monsoon_rainfall_category);
  const rehab = getRehabBonus(road.last_major_rehab_year);

  let pci = baseScores[road.surface_type] || 50;
  pci -= ageRatio * 40;
  pci -= rain * 15;
  pci -= road.traffic_weight * 8;
  pci -= road.truck_percentage * 0.3;
  pci += rehab;

  return clamp(pci);
}

// ─── RSL: Remaining Structural Life ────────────────────────────
// Load-bearing capacity & fatigue life based on AASHTO model
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
    consumed *= 0.4; // rehab restores 60% structural capacity
  }

  const laneBonus =
    road.lane_count >= 6 ? 1.3 : road.lane_count >= 4 ? 1.1 : 1.0;

  return clamp(100 * Math.max(0, 1 - consumed / (dc * laneBonus)));
}

// ─── DRN: Drainage Condition ───────────────────────────────────
// Water management: slope, rainfall, flood risk, geography
function computeDRN(road: RoadRecord): number {
  const slopeBase: Record<string, number> = {
    steep: 85,
    moderate: 70,
    flat: 50,
  };
  const rain = getRainFactor(road.monsoon_rainfall_category);

  let drn = slopeBase[road.slope_category] || 60;
  drn -= rain * 20;
  drn -= road.flood_prone ? 25 : 0;
  drn -= road.landslide_prone ? 8 : 0;
  drn -= road.region_type === "coastal" ? 10 : 0;
  drn -= road.elevation_m < 100 ? 10 : 0;

  return clamp(drn);
}

// ─── RQL: Ride Quality ─────────────────────────────────────────
// Smoothness/roughness proxy (IRI-based)
function computeRQL(road: RoadRecord): number {
  const baseScores: Record<string, number> = {
    concrete: 95,
    bitumen: 88,
    gravel: 50,
    earthen: 25,
  };
  const terrain = getTerrainFactor(road.terrain_type);
  const age = CURRENT_YEAR - road.year_constructed;
  const rehab = getRehabBonus(road.last_major_rehab_year);

  let rql = baseScores[road.surface_type] || 50;
  rql -= terrain * 12;
  rql -= Math.min(age * 1.5, 30);
  rql -= road.traffic_weight * 7;
  rql += rehab * 0.8;

  return clamp(rql);
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

export function computeHealthScore(road: RoadRecord): HealthScore {
  const parameters: ConditionParameters = {
    PCI: computePCI(road),
    RSL: computeRSL(road),
    DRN: computeDRN(road),
    RQL: computeRQL(road),
  };

  const conditionScore = Math.round(
    (0.3 * parameters.PCI +
      0.25 * parameters.RSL +
      0.25 * parameters.DRN +
      0.2 * parameters.RQL) *
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
