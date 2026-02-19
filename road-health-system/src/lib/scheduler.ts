import { RoadWithScore, Band, InspectionRecord } from "./types";
import { getInspectionInterval, estimateRepairCost, computeHealthScore } from "./scoring";

// ─── Scheduling Types ──────────────────────────────────────────

export type InspectionPriority = "critical" | "high" | "medium" | "low";
export type ActionType =
  | "emergency_repair"
  | "urgent_inspection"
  | "routine_inspection"
  | "preventive_maintenance"
  | "monitoring_only";

export type InspectionType = "full" | "quick" | "monsoon_special";

export interface ScheduledInspection {
  road: RoadWithScore;
  lastInspection: InspectionRecord | null;
  lastInspectionDate: Date | null;
  baseIntervalDays: number;
  adjustedIntervalDays: number;
  nextDueDate: Date;
  daysUntilDue: number;
  isOverdue: boolean;
  overdueDays: number;
  priority: InspectionPriority;
  priorityScore: number;
  action: ActionType;
  riskFactors: string[];
  estimatedCostLakhs: number;
  assignedAgency: string;
  quarterLabel: string;
  decayRate: number;            // condition score loss per day
  decayTrend: "accelerating" | "stable" | "improving";
  distressSeverity: number;     // 0-100 composite distress score
  // Mutable scheduling state
  isScheduled: boolean;
  scheduledDate: Date | null;
  scheduledAgency: string | null;
  scheduledType: InspectionType | null;
}

export interface ScheduleSummary {
  total: number;
  overdue: number;
  dueSoon: number;
  dueThisWeek: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  totalEstimatedCost: number;
  avgDecayRate: number;
  byAction: Record<ActionType, number>;
  byQuarter: Record<string, number>;
  byAgency: Record<string, number>;
}

// ─── Constants ─────────────────────────────────────────────────

const TODAY = new Date(2026, 1, 19); // Feb 19, 2026

const MONSOON_MONTHS = [5, 6, 7, 8]; // Jun–Sep (0-indexed)

// ─── Risk Factor Computation ───────────────────────────────────

function computeRiskFactors(road: RoadWithScore): { factors: string[]; multiplier: number } {
  const factors: string[] = [];
  let multiplier = 1.0;

  if (road.flood_prone) {
    factors.push("Flood-prone zone");
    multiplier *= 0.7;
  }
  if (road.landslide_prone) {
    factors.push("Landslide-prone area");
    multiplier *= 0.7;
  }
  if (road.ghat_section_flag) {
    factors.push("Ghat section");
    multiplier *= 0.8;
  }
  if (road.monsoon_rainfall_category === "high") {
    factors.push("High rainfall zone");
    multiplier *= 0.8;
  }
  if (road.avg_daily_traffic > 30000) {
    factors.push("Heavy traffic (ADT > 30k)");
    multiplier *= 0.8;
  }
  if (road.truck_percentage > 30) {
    factors.push("High truck % (> 30%)");
    multiplier *= 0.85;
  }
  if (road.terrain_type === "steep") {
    factors.push("Steep terrain");
    multiplier *= 0.85;
  }
  if (road.surface_type === "gravel" || road.surface_type === "earthen") {
    factors.push("Unpaved surface");
    multiplier *= 0.75;
  }
  if (road.tourism_route_flag) {
    factors.push("Tourism route");
    multiplier *= 0.9;
  }

  // Distress-based risk
  if (road.potholes_per_km > 15) {
    factors.push(`High potholes (${road.potholes_per_km}/km)`);
    multiplier *= 0.7;
  }
  if (road.alligator_cracking_pct > 20) {
    factors.push(`Severe alligator cracking (${road.alligator_cracking_pct}%)`);
    multiplier *= 0.75;
  }
  if (road.rutting_depth_mm > 20) {
    factors.push(`Deep rutting (${road.rutting_depth_mm}mm)`);
    multiplier *= 0.8;
  }
  if (road.iri_value > 8) {
    factors.push(`Very rough ride (IRI ${road.iri_value})`);
    multiplier *= 0.8;
  }

  // Age-based risk
  const age = 2026 - road.year_constructed;
  const lifespan = { concrete: 30, bitumen: 20, gravel: 12, earthen: 8 }[road.surface_type] || 15;
  if (age > lifespan * 0.8) {
    factors.push("Near end of design life");
    multiplier *= 0.75;
  }

  // Health score risk
  if (road.healthScore.conditionScore < 25) {
    factors.push("Critical health score");
    multiplier *= 0.6;
  } else if (road.healthScore.conditionScore < 40) {
    factors.push("Poor health score");
    multiplier *= 0.8;
  }

  return { factors, multiplier: Math.max(multiplier, 0.15) };
}

// ─── Monsoon Multiplier ───────────────────────────────────────

export function getMonsoonMultiplier(road: RoadWithScore, monsoonMode: boolean): number {
  if (!monsoonMode) return 1.0;

  let mult = 1.0;
  if (road.monsoon_rainfall_category === "high") mult *= 0.65;
  if (road.flood_prone) mult *= 0.75;
  if (road.landslide_prone) mult *= 0.7;
  if (road.ghat_section_flag) mult *= 0.75;
  if (road.region_type === "coastal") mult *= 0.85;

  return Math.max(mult, 0.3);
}

// ─── Decay Rate Computation ────────────────────────────────────

function computeDecayRate(inspections: InspectionRecord[]): { rate: number; trend: "accelerating" | "stable" | "improving" } {
  if (inspections.length < 2) return { rate: 0, trend: "stable" };

  const sorted = [...inspections].sort(
    (a, b) => new Date(a.inspection_date).getTime() - new Date(b.inspection_date).getTime()
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const daysBetween = (new Date(last.inspection_date).getTime() - new Date(first.inspection_date).getTime()) / (1000 * 60 * 60 * 24);

  if (daysBetween <= 0) return { rate: 0, trend: "stable" };

  const rate = Math.max(0, (first.condition_score - last.condition_score) / daysBetween);

  // Trend: compare first-half decay vs second-half decay
  const mid = Math.floor(sorted.length / 2);
  if (mid > 0 && sorted.length > 2) {
    const midInsp = sorted[mid];
    const firstHalfDays = (new Date(midInsp.inspection_date).getTime() - new Date(first.inspection_date).getTime()) / (1000 * 60 * 60 * 24);
    const secondHalfDays = (new Date(last.inspection_date).getTime() - new Date(midInsp.inspection_date).getTime()) / (1000 * 60 * 60 * 24);

    const firstHalfRate = firstHalfDays > 0 ? (first.condition_score - midInsp.condition_score) / firstHalfDays : 0;
    const secondHalfRate = secondHalfDays > 0 ? (midInsp.condition_score - last.condition_score) / secondHalfDays : 0;

    if (secondHalfRate > firstHalfRate * 1.3) return { rate, trend: "accelerating" };
    if (secondHalfRate < firstHalfRate * 0.7) return { rate, trend: "improving" };
  }

  return { rate, trend: "stable" };
}

// ─── Distress Severity Score ───────────────────────────────────

function computeDistressSeverity(road: RoadWithScore): number {
  const score =
    (road.potholes_per_km / 30) * 20 +
    (road.alligator_cracking_pct / 50) * 18 +
    (road.rutting_depth_mm / 40) * 15 +
    (road.cracks_longitudinal_pct / 50) * 12 +
    (road.cracks_transverse_per_km / 30) * 10 +
    (road.pothole_avg_depth_cm / 20) * 8 +
    (road.raveling_pct / 50) * 7 +
    (road.edge_breaking_pct / 50) * 5 +
    (road.patches_per_km / 25) * 5;

  return Math.min(100, Math.round(score * 10) / 10);
}

// ─── Action & Priority ─────────────────────────────────────────

function getLastInspection(inspections: InspectionRecord[]): InspectionRecord | null {
  if (!inspections.length) return null;
  return inspections.reduce((latest, insp) => {
    return new Date(insp.inspection_date) > new Date(latest.inspection_date) ? insp : latest;
  });
}

function determineAction(band: Band, overdue: boolean, overdueDays: number, conditionScore: number, distressSeverity: number): ActionType {
  if (band === "E" || (overdue && overdueDays > 30 && conditionScore < 25)) return "emergency_repair";
  if (band === "D" || (overdue && overdueDays > 15) || distressSeverity > 70) return "urgent_inspection";
  if (overdue || distressSeverity > 50) return "routine_inspection";
  if (band === "B" || band === "C") return "preventive_maintenance";
  return "monitoring_only";
}

function computePriorityScore(
  band: Band,
  overdueDays: number,
  conditionScore: number,
  riskFactorCount: number,
  traffic: number,
  decayRate: number,
  distressSeverity: number,
): number {
  const bandWeights: Record<Band, number> = { E: 30, D: 24, C: 18, B: 12, A: 6, "A+": 0 };
  let score = bandWeights[band];

  score += Math.min(25, Math.max(0, overdueDays) * 0.5);
  score += Math.max(0, (50 - conditionScore) * 0.3);
  score += Math.min(10, riskFactorCount * 2.5);
  score += Math.min(8, (traffic / 50000) * 8);
  score += Math.min(12, decayRate * 200);
  score += Math.min(15, distressSeverity * 0.15);

  return Math.min(100, Math.round(score * 10) / 10);
}

function assignAgency(road: RoadWithScore, action: ActionType): string {
  if (action === "emergency_repair" || action === "urgent_inspection") {
    if (road.jurisdiction === "NHAI") return "NHAI";
    return "State PWD";
  }
  if (road.jurisdiction === "NHAI") return "NHAI";
  if (road.jurisdiction === "PMGSY") return "PMGSY";
  if (road.jurisdiction === "Municipality") return "Municipality";
  return "State PWD";
}

function getQuarterLabel(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `Q${q}-${date.getFullYear()}`;
}

// ─── Main Scheduler ────────────────────────────────────────────

export function generateInspectionSchedule(
  roads: RoadWithScore[],
  monsoonMode = false,
): ScheduledInspection[] {
  return roads.map((road) => {
    const lastInsp = getLastInspection(road.inspections);
    const lastDate = lastInsp ? new Date(lastInsp.inspection_date) : null;

    const baseInterval = getInspectionInterval(road.healthScore.band);
    const { factors, multiplier } = computeRiskFactors(road);
    const monsoonMult = getMonsoonMultiplier(road, monsoonMode);
    const adjustedInterval = Math.max(3, Math.round(baseInterval * multiplier * monsoonMult));

    const { rate: decayRate, trend: decayTrend } = computeDecayRate(road.inspections);

    // If decay is fast, further reduce interval
    const decayMultiplier = decayRate > 0.08 ? 0.7 : decayRate > 0.04 ? 0.85 : 1.0;
    const finalInterval = Math.max(3, Math.round(adjustedInterval * decayMultiplier));

    let nextDue: Date;
    if (lastDate) {
      nextDue = new Date(lastDate.getTime() + finalInterval * 24 * 60 * 60 * 1000);
    } else {
      nextDue = new Date(TODAY.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const diffMs = nextDue.getTime() - TODAY.getTime();
    const daysUntilDue = Math.round(diffMs / (24 * 60 * 60 * 1000));
    const isOverdue = daysUntilDue < 0;
    const overdueDays = isOverdue ? Math.abs(daysUntilDue) : 0;

    const distressSeverity = computeDistressSeverity(road);

    const priorityScore = computePriorityScore(
      road.healthScore.band,
      overdueDays,
      road.healthScore.conditionScore,
      factors.length,
      road.avg_daily_traffic,
      decayRate,
      distressSeverity,
    );

    let priority: InspectionPriority;
    if (priorityScore >= 60) priority = "critical";
    else if (priorityScore >= 40) priority = "high";
    else if (priorityScore >= 20) priority = "medium";
    else priority = "low";

    const action = determineAction(
      road.healthScore.band, isOverdue, overdueDays,
      road.healthScore.conditionScore, distressSeverity,
    );

    return {
      road,
      lastInspection: lastInsp,
      lastInspectionDate: lastDate,
      baseIntervalDays: baseInterval,
      adjustedIntervalDays: finalInterval,
      nextDueDate: nextDue,
      daysUntilDue,
      isOverdue,
      overdueDays,
      priority,
      priorityScore,
      action,
      riskFactors: factors,
      estimatedCostLakhs: estimateRepairCost(road),
      assignedAgency: assignAgency(road, action),
      quarterLabel: getQuarterLabel(nextDue),
      decayRate,
      decayTrend,
      distressSeverity,
      isScheduled: false,
      scheduledDate: null,
      scheduledAgency: null,
      scheduledType: null,
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore);
}

// ─── Summary Stats ─────────────────────────────────────────────

export function computeScheduleSummary(schedule: ScheduledInspection[]): ScheduleSummary {
  const byAction: Record<ActionType, number> = {
    emergency_repair: 0, urgent_inspection: 0,
    routine_inspection: 0, preventive_maintenance: 0, monitoring_only: 0,
  };
  const byQuarter: Record<string, number> = {};
  const byAgency: Record<string, number> = {};

  let overdue = 0, dueSoon = 0, dueThisWeek = 0;
  let critical = 0, high = 0, medium = 0, low = 0;
  let totalCost = 0, totalDecay = 0;

  for (const item of schedule) {
    if (item.isOverdue) overdue++;
    if (!item.isOverdue && item.daysUntilDue <= 30) dueSoon++;
    if (!item.isOverdue && item.daysUntilDue <= 7) dueThisWeek++;
    if (item.priority === "critical") critical++;
    else if (item.priority === "high") high++;
    else if (item.priority === "medium") medium++;
    else low++;

    totalCost += item.estimatedCostLakhs;
    totalDecay += item.decayRate;
    byAction[item.action]++;
    byQuarter[item.quarterLabel] = (byQuarter[item.quarterLabel] || 0) + 1;
    byAgency[item.assignedAgency] = (byAgency[item.assignedAgency] || 0) + 1;
  }

  return {
    total: schedule.length,
    overdue, dueSoon, dueThisWeek,
    critical, high, medium, low,
    totalEstimatedCost: totalCost,
    avgDecayRate: schedule.length > 0 ? Math.round((totalDecay / schedule.length) * 1000) / 1000 : 0,
    byAction, byQuarter, byAgency,
  };
}

// ─── Recalculate after inspection entry ────────────────────────

export function recalculateAfterInspection(
  road: RoadWithScore,
  newScore: number,
  newSurfaceDamage: number,
  newWaterlogging: boolean,
  newDrainage: string,
  newRemarks: string,
  agency: string,
): { updatedRoad: RoadWithScore; oldScore: number; newHealthScore: number; oldBand: Band; newBand: Band } {
  const oldScore = road.healthScore.conditionScore;
  const oldBand = road.healthScore.band;

  // Create a new inspection record
  const newInspection: InspectionRecord = {
    inspection_id: `INSP-NEW-${Date.now()}`,
    road_id: road.road_id,
    inspection_date: TODAY.toISOString().split("T")[0],
    inspector_agency: agency,
    condition_score: newScore,
    surface_damage_pct: newSurfaceDamage,
    waterlogging_flag: newWaterlogging,
    drainage_status: newDrainage,
    remarks: newRemarks,
  };

  // Update road's PCI score based on new condition
  const updatedRoadRecord = {
    ...road,
    pci_score: newScore,
    inspections: [...road.inspections, newInspection],
  };

  // Recompute health score
  const newHealthScoreObj = computeHealthScore(updatedRoadRecord);

  const updatedRoad: RoadWithScore = {
    ...updatedRoadRecord,
    healthScore: newHealthScoreObj,
  };

  return {
    updatedRoad,
    oldScore,
    newHealthScore: newHealthScoreObj.conditionScore,
    oldBand,
    newBand: newHealthScoreObj.band,
  };
}
