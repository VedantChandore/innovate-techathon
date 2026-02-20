/**
 * reportAggregator.ts
 * ====================
 * Pure server-side aggregation engine for the Reports module.
 *
 * RESPONSIBILITIES:
 *   1. Apply combinable filters to the road dataset
 *   2. Compute all numerical summaries (no AI involvement)
 *   3. Return a structured ReportSummary JSON
 *
 * GUARANTEES:
 *   - Never sends raw records to AI
 *   - Single source of truth for all report numbers
 *   - All filters are optional and combinable
 *   - Handles empty result sets gracefully
 */

// ─── Filter Definition ────────────────────────────────────────

export interface ReportFilters {
  // Basic
  district?: string;           // "" = all
  highway?: string;            // highway_ref match
  conditionBand?: string;      // "Critical" | "Poor" | "Fair" | "Good" | ""
  priorityLevel?: string;      // "Critical" | "High" | "Medium" | "Low" | ""
  inspectionStatus?: string;   // "overdue" | "due_soon" | "recently_inspected" | ""

  // Advanced
  cibilMin?: number;           // 0–100
  cibilMax?: number;           // 0–100
  constructionYearMin?: number;
  constructionYearMax?: number;
  inspectionDateFrom?: string; // ISO date string
  inspectionDateTo?: string;   // ISO date string

  // Report metadata
  reportType: ReportType;
}

export type ReportType =
  | "network_overview"
  | "district_level"
  | "critical_intervention"
  | "inspection_audit"
  | "budget_planning";

// ─── Aggregated Output Types ──────────────────────────────────

export interface DistrictBreakdown {
  district: string;
  totalRoads: number;
  avgCibil: number;
  avgPci: number;
  criticalCount: number;
  totalLengthKm: number;
  estimatedCostLakhs: number;
}

export interface TopRoad {
  road_id: string;
  name: string;
  district: string;
  highway_ref: string;
  pci_score: number;
  cibil_score: number;
  condition: string;
  length_km: number;
  year_constructed: number;
  surface_type: string;
}

export interface InspectionSummary {
  totalWithHistory: number;
  totalWithoutHistory: number;
  overdueCount: number;
  dueSoonCount: number;
  recentlyInspectedCount: number;
  avgDaysSinceInspection: number;
}

export interface ReportSummary {
  // Meta
  reportType: ReportType;
  generatedAt: string;         // ISO timestamp
  filtersApplied: ReportFilters;
  dataTimestamp: string;       // "Loaded from road_registry.csv"
  modelVersion: string;

  // Coverage
  totalFilteredRoads: number;
  totalNetworkRoads: number;
  coveragePercent: number;
  totalLengthKm: number;
  totalNetworkLengthKm: number;

  // Condition distribution
  avgCibilScore: number;
  avgPciScore: number;
  conditionBreakdown: {
    Critical: number;
    Poor: number;
    Fair: number;
    Good: number;
  };
  conditionPercents: {
    Critical: number;
    Poor: number;
    Fair: number;
    Good: number;
  };

  // Priority breakdown
  priorityBreakdown: {
    Critical: number;
    High: number;
    Medium: number;
    Low: number;
  };

  // Inspection
  inspection: InspectionSummary;

  // Financial
  estimatedTotalCostLakhs: number;
  estimatedTotalCostCrores: number;

  // Decay
  avgDecayRate: number;
  highDecayCount: number;       // decay > 0.05/d

  // Top 10 worst roads
  top10WorstByPci: TopRoad[];
  top10WorstByCibil: TopRoad[];

  // District breakdown (only populated for multi-district reports)
  districtBreakdown: DistrictBreakdown[];

  // Surface type breakdown
  surfaceBreakdown: Record<string, number>;

  // Terrain breakdown
  terrainBreakdown: Record<string, number>;

  // Risk flags
  floodProneCount: number;
  landslideProneCount: number;
  ghatSectionCount: number;
  highTrafficCount: number;     // avg_daily_traffic > 10000
}

// ─── Road shape expected from API ────────────────────────────
// We receive a lightweight version of RoadWithScore over the API
export interface RoadForReport {
  road_id: string;
  name: string;
  district: string;
  highway_ref: string;
  pci_score: number;
  iri_value: number;
  year_constructed: number;
  surface_type: string;
  length_km: number;
  avg_daily_traffic: number;
  truck_percentage: number;
  flood_prone: boolean;
  landslide_prone: boolean;
  ghat_section_flag: boolean;
  terrain_type: string;
  potholes_per_km: number;
  alligator_cracking_pct: number;
  rutting_depth_mm: number;
  cibil_score: number;          // healthScore.finalCibilScore
  condition: string;            // healthScore.conditionCategory
  band: string;                 // healthScore.band
  inspections: Array<{
    inspection_date: string;
    condition_score: number;
  }>;
  decayRate: number;
  priority: string;
  estimatedCostLakhs: number;
  nextDueDays: number;
}

// ─── Date helpers ────────────────────────────────────────────
function daysBetween(d1: Date, d2: Date): number {
  return Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Inspection status classifier ────────────────────────────
function inspectionStatus(road: RoadForReport): "overdue" | "due_soon" | "recently_inspected" | "never" {
  if (!road.inspections || road.inspections.length === 0) return "never";
  const lastDate = new Date(
    road.inspections.reduce((latest, insp) =>
      insp.inspection_date > latest ? insp.inspection_date : latest,
      road.inspections[0].inspection_date
    )
  );
  const today = new Date("2026-02-20");
  const days = daysBetween(lastDate, today);
  if (days > 365) return "overdue";
  if (days > 180) return "due_soon";
  return "recently_inspected";
}

// ─── Condition band classifier ────────────────────────────────
function conditionBandFromPci(pci: number): "Critical" | "Poor" | "Fair" | "Good" {
  if (pci < 40) return "Critical";
  if (pci < 60) return "Poor";
  if (pci < 75) return "Fair";
  return "Good";
}

// ─── Priority from CIBIL ──────────────────────────────────────
function priorityFromCibil(cibil: number): "Critical" | "High" | "Medium" | "Low" {
  if (cibil < 30) return "Critical";
  if (cibil < 50) return "High";
  if (cibil < 70) return "Medium";
  return "Low";
}

// ─── Repair cost estimator ───────────────────────────────────
function estimateRepairCostLakhs(pci: number, lengthKm: number, surfaceType: string): number {
  const costPerKm: Record<string, number[]> = {
    concrete: [200, 120, 60, 20],
    bitumen:  [150, 90,  45, 15],
    gravel:   [80,  50,  25, 8],
    earthen:  [50,  30,  15, 5],
  };
  const tier = pci < 40 ? 0 : pci < 60 ? 1 : pci < 75 ? 2 : 3;
  const base = costPerKm[surfaceType]?.[tier] ?? costPerKm["bitumen"][tier];
  return Math.round(base * lengthKm * 100) / 100;
}

// ─── MAIN FILTER + AGGREGATE FUNCTION ────────────────────────

export function applyFiltersAndAggregate(
  roads: RoadForReport[],
  filters: ReportFilters,
  totalNetworkRoads: number,
  totalNetworkLengthKm: number
): ReportSummary | { error: "empty_dataset"; message: string } {
  const today = new Date("2026-02-20");

  // ── Step 1: Apply filters sequentially ─────────────────────
  let filtered = [...roads];

  if (filters.district) {
    // Case-insensitive, trimmed comparison
    const dist = filters.district.trim().toLowerCase();
    filtered = filtered.filter(r => r.district.trim().toLowerCase() === dist);
  }

  if (filters.highway) {
    // Normalise both sides: remove hyphens, spaces, make lowercase
    // so "NH-60", "NH 60", "nh60" all match the CSV value "NH60"
    const normalise = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
    const hw = normalise(filters.highway);
    filtered = filtered.filter(r => normalise(r.highway_ref).includes(hw));
  }

  if (filters.conditionBand) {
    filtered = filtered.filter(r => conditionBandFromPci(r.pci_score) === filters.conditionBand);
  }

  if (filters.priorityLevel) {
    filtered = filtered.filter(r => priorityFromCibil(r.cibil_score) === filters.priorityLevel);
  }

  if (filters.inspectionStatus) {
    filtered = filtered.filter(r => {
      const status = inspectionStatus(r);
      if (filters.inspectionStatus === "overdue") return status === "overdue" || status === "never";
      if (filters.inspectionStatus === "due_soon") return status === "due_soon";
      if (filters.inspectionStatus === "recently_inspected") return status === "recently_inspected";
      return true;
    });
  }

  if (filters.cibilMin !== undefined) {
    filtered = filtered.filter(r => r.cibil_score >= filters.cibilMin!);
  }
  if (filters.cibilMax !== undefined) {
    filtered = filtered.filter(r => r.cibil_score <= filters.cibilMax!);
  }

  if (filters.constructionYearMin !== undefined) {
    filtered = filtered.filter(r => r.year_constructed >= filters.constructionYearMin!);
  }
  if (filters.constructionYearMax !== undefined) {
    filtered = filtered.filter(r => r.year_constructed <= filters.constructionYearMax!);
  }

  if (filters.inspectionDateFrom) {
    filtered = filtered.filter(r => {
      if (!r.inspections || r.inspections.length === 0) return false;
      const lastInsp = r.inspections.reduce((l, i) => i.inspection_date > l ? i.inspection_date : l, r.inspections[0].inspection_date);
      return lastInsp >= filters.inspectionDateFrom!;
    });
  }
  if (filters.inspectionDateTo) {
    filtered = filtered.filter(r => {
      if (!r.inspections || r.inspections.length === 0) return false;
      const lastInsp = r.inspections.reduce((l, i) => i.inspection_date > l ? i.inspection_date : l, r.inspections[0].inspection_date);
      return lastInsp <= filters.inspectionDateTo!;
    });
  }

  // ── Step 2: Guard against empty result ─────────────────────
  if (filtered.length === 0) {
    return {
      error: "empty_dataset",
      message: "No roads match the selected filters. Please adjust your criteria and try again.",
    };
  }

  // ── Step 3: Compute aggregations ───────────────────────────
  const totalFilteredRoads = filtered.length;
  const totalLengthKm = Math.round(filtered.reduce((s, r) => s + r.length_km, 0) * 10) / 10;
  const avgCibilScore = Math.round(filtered.reduce((s, r) => s + r.cibil_score, 0) / totalFilteredRoads * 10) / 10;
  const avgPciScore = Math.round(filtered.reduce((s, r) => s + r.pci_score, 0) / totalFilteredRoads * 10) / 10;

  // Condition breakdown
  const conditionBreakdown = { Critical: 0, Poor: 0, Fair: 0, Good: 0 };
  filtered.forEach(r => { conditionBreakdown[conditionBandFromPci(r.pci_score)]++; });
  const conditionPercents = {
    Critical: Math.round(conditionBreakdown.Critical / totalFilteredRoads * 1000) / 10,
    Poor: Math.round(conditionBreakdown.Poor / totalFilteredRoads * 1000) / 10,
    Fair: Math.round(conditionBreakdown.Fair / totalFilteredRoads * 1000) / 10,
    Good: Math.round(conditionBreakdown.Good / totalFilteredRoads * 1000) / 10,
  };

  // Priority breakdown
  const priorityBreakdown = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  filtered.forEach(r => { priorityBreakdown[priorityFromCibil(r.cibil_score)]++; });

  // Inspection summary
  const withHistory = filtered.filter(r => r.inspections && r.inspections.length > 0);
  let overdueCount = 0, dueSoonCount = 0, recentCount = 0;
  let totalDaysSince = 0;
  withHistory.forEach(r => {
    const status = inspectionStatus(r);
    if (status === "overdue") overdueCount++;
    else if (status === "due_soon") dueSoonCount++;
    else if (status === "recently_inspected") recentCount++;
    const lastDate = new Date(r.inspections.reduce((l, i) => i.inspection_date > l ? i.inspection_date : l, r.inspections[0].inspection_date));
    totalDaysSince += daysBetween(lastDate, today);
  });
  const neverInspected = filtered.filter(r => !r.inspections || r.inspections.length === 0);
  overdueCount += neverInspected.length; // never inspected = overdue

  const inspection: InspectionSummary = {
    totalWithHistory: withHistory.length,
    totalWithoutHistory: neverInspected.length,
    overdueCount,
    dueSoonCount,
    recentlyInspectedCount: recentCount,
    avgDaysSinceInspection: withHistory.length > 0 ? Math.round(totalDaysSince / withHistory.length) : 0,
  };

  // Financial estimates
  const estimatedTotalCostLakhs = Math.round(
    filtered.reduce((s, r) => s + estimateRepairCostLakhs(r.pci_score, r.length_km, r.surface_type), 0) * 100
  ) / 100;
  const estimatedTotalCostCrores = Math.round(estimatedTotalCostLakhs / 100 * 100) / 100;

  // Decay
  const avgDecayRate = Math.round(filtered.reduce((s, r) => s + (r.decayRate || 0), 0) / totalFilteredRoads * 100000) / 100000;
  const highDecayCount = filtered.filter(r => (r.decayRate || 0) > 0.05).length;

  // Top 10 worst by PCI
  const top10WorstByPci: TopRoad[] = [...filtered]
    .sort((a, b) => a.pci_score - b.pci_score)
    .slice(0, 10)
    .map(r => ({
      road_id: r.road_id,
      name: r.name,
      district: r.district,
      highway_ref: r.highway_ref,
      pci_score: r.pci_score,
      cibil_score: Math.round(r.cibil_score * 10) / 10,
      condition: conditionBandFromPci(r.pci_score),
      length_km: r.length_km,
      year_constructed: r.year_constructed,
      surface_type: r.surface_type,
    }));

  // Top 10 worst by CIBIL
  const top10WorstByCibil: TopRoad[] = [...filtered]
    .sort((a, b) => a.cibil_score - b.cibil_score)
    .slice(0, 10)
    .map(r => ({
      road_id: r.road_id,
      name: r.name,
      district: r.district,
      highway_ref: r.highway_ref,
      pci_score: r.pci_score,
      cibil_score: Math.round(r.cibil_score * 10) / 10,
      condition: conditionBandFromPci(r.pci_score),
      length_km: r.length_km,
      year_constructed: r.year_constructed,
      surface_type: r.surface_type,
    }));

  // District breakdown
  const districtMap = new Map<string, RoadForReport[]>();
  filtered.forEach(r => {
    const arr = districtMap.get(r.district) || [];
    arr.push(r);
    districtMap.set(r.district, arr);
  });
  const districtBreakdown: DistrictBreakdown[] = Array.from(districtMap.entries()).map(([district, roads]) => ({
    district,
    totalRoads: roads.length,
    avgCibil: Math.round(roads.reduce((s, r) => s + r.cibil_score, 0) / roads.length * 10) / 10,
    avgPci: Math.round(roads.reduce((s, r) => s + r.pci_score, 0) / roads.length * 10) / 10,
    criticalCount: roads.filter(r => r.pci_score < 40).length,
    totalLengthKm: Math.round(roads.reduce((s, r) => s + r.length_km, 0) * 10) / 10,
    estimatedCostLakhs: Math.round(roads.reduce((s, r) => s + estimateRepairCostLakhs(r.pci_score, r.length_km, r.surface_type), 0) * 100) / 100,
  })).sort((a, b) => a.avgCibil - b.avgCibil);

  // Surface breakdown
  const surfaceBreakdown: Record<string, number> = {};
  filtered.forEach(r => {
    surfaceBreakdown[r.surface_type] = (surfaceBreakdown[r.surface_type] || 0) + 1;
  });

  // Terrain breakdown
  const terrainBreakdown: Record<string, number> = {};
  filtered.forEach(r => {
    terrainBreakdown[r.terrain_type] = (terrainBreakdown[r.terrain_type] || 0) + 1;
  });

  // Risk flags
  const floodProneCount = filtered.filter(r => r.flood_prone).length;
  const landslideProneCount = filtered.filter(r => r.landslide_prone).length;
  const ghatSectionCount = filtered.filter(r => r.ghat_section_flag).length;
  const highTrafficCount = filtered.filter(r => r.avg_daily_traffic > 10000).length;

  return {
    reportType: filters.reportType,
    generatedAt: new Date().toISOString(),
    filtersApplied: filters,
    dataTimestamp: "Maharashtra Road Health System — Road Registry CSV (February 2026)",
    modelVersion: "Road-CIBIL v1.0 (RandomForest + PDI Hybrid, R²=0.9988)",

    totalFilteredRoads,
    totalNetworkRoads,
    coveragePercent: Math.round(totalFilteredRoads / totalNetworkRoads * 1000) / 10,
    totalLengthKm,
    totalNetworkLengthKm,

    avgCibilScore,
    avgPciScore,
    conditionBreakdown,
    conditionPercents,
    priorityBreakdown,
    inspection,

    estimatedTotalCostLakhs,
    estimatedTotalCostCrores,

    avgDecayRate,
    highDecayCount,

    top10WorstByPci,
    top10WorstByCibil,
    districtBreakdown,
    surfaceBreakdown,
    terrainBreakdown,

    floodProneCount,
    landslideProneCount,
    ghatSectionCount,
    highTrafficCount,
  };
}
