import { RoadWithScore, Band, InspectionRecord } from "./types";
import { getInspectionInterval, estimateRepairCost } from "./scoring";

// ─── Scheduling Types ──────────────────────────────────────────

export type InspectionPriority = "critical" | "high" | "medium" | "low";

export type ActionType =
  | "emergency_reconstruction"
  | "emergency_overlay"
  | "priority_structural_repair"
  | "structural_overlay"
  | "major_repair"
  | "preventive_risk_mitigation"
  | "preventive_maintenance"
  | "routine_patching"
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
  decayRate: number;
  decayTrend: "accelerating" | "stable" | "improving";
  distressSeverity: number;
  // CIBIL-specific fields
  finalCibilScore: number;
  conditionCategory: string;
  pdi: number;
  pseudoCibil: number;
  mlPredictedCibil: number;
  trendAlert: string | null;
  cibilDrivenDueDays: number;
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
  avgCibilScore: number;
  byAction: Record<ActionType, number>;
  byCondition: Record<string, number>;
  byQuarter: Record<string, number>;
  byAgency: Record<string, number>;
}

// ─── Constants ─────────────────────────────────────────────────

const TODAY = new Date(2026, 1, 19); // Feb 19, 2026

// CIBIL score tiers → base due days
const CIBIL_DUE_DAYS: { maxScore: number; days: number }[] = [
  { maxScore: 20,  days: 7   },
  { maxScore: 30,  days: 14  },
  { maxScore: 40,  days: 21  },
  { maxScore: 50,  days: 30  },
  { maxScore: 60,  days: 45  },
  { maxScore: 70,  days: 60  },
  { maxScore: 80,  days: 90  },
  { maxScore: 90,  days: 180 },
  { maxScore: 101, days: 365 },
];

// ─── CIBIL → Priority ─────────────────────────────────────────

function cibilToPriority(score: number, isOverdue: boolean, overdueDays: number): InspectionPriority {
  if (score < 25 || (isOverdue && overdueDays > 30)) return "critical";
  if (score < 45 || (isOverdue && overdueDays > 7)) return "high";
  if (score < 65 || isOverdue) return "medium";
  return "low";
}

// ─── CIBIL → Action (9-tier fine-grained thresholds) ─────────

function getCibilActionType(
  finalCibilScore: number,
  pdi: number,
  riskFlags: { flood: boolean; landslide: boolean; ghat: boolean },
): ActionType {
  const highRisk = riskFlags.flood || riskFlags.landslide || riskFlags.ghat;
  if (finalCibilScore < 15) return "emergency_reconstruction";
  if (finalCibilScore < 25) return highRisk ? "emergency_reconstruction" : "emergency_overlay";
  if (finalCibilScore < 35) return pdi < 25 ? "priority_structural_repair" : "emergency_overlay";
  if (finalCibilScore < 45) return pdi < 40 ? "priority_structural_repair" : "structural_overlay";
  if (finalCibilScore < 55) return highRisk ? "structural_overlay" : "major_repair";
  if (finalCibilScore < 65) return highRisk ? "preventive_risk_mitigation" : "major_repair";
  if (finalCibilScore < 75) return highRisk ? "preventive_risk_mitigation" : "preventive_maintenance";
  if (finalCibilScore < 88) return pdi < 70 ? "routine_patching" : "preventive_maintenance";
  return "monitoring_only";
}

// ─── CIBIL → Priority Score (0–100) ──────────────────────────

function computeCibilPriorityScore(
  cibilScore: number,
  overdueDays: number,
  riskFactorCount: number,
  traffic: number,
  decayRate: number,
  distressSeverity: number,
  pdi: number,
  trendAlert: string | null,
): number {
  let score = Math.max(0, 100 - cibilScore) * 0.40;
  score += Math.min(20, Math.max(0, overdueDays) * 0.4);
  score += Math.min(10, riskFactorCount * 2.5);
  score += Math.min(6, (traffic / 50000) * 6);
  score += Math.min(10, decayRate * 150);
  score += Math.min(10, distressSeverity * 0.10);
  score += Math.min(6, Math.max(0, (50 - pdi) * 0.12));
  if (trendAlert) score += 8;
  return Math.min(100, Math.round(score * 10) / 10);
}

// ─── CIBIL → Base Due Days ────────────────────────────────────

function getCibilBaseDueDays(cibilScore: number): number {
  for (const tier of CIBIL_DUE_DAYS) {
    if (cibilScore <= tier.maxScore) return tier.days;
  }
  return 365;
}

// ─── Trend Alert ──────────────────────────────────────────────

function computeTrendAlert(pseudoCibil: number, mlPredictedCibil: number): string | null {
  const gap = pseudoCibil - mlPredictedCibil;
  if (gap > 25) return "Rapid deterioration: ML predicts " + gap.toFixed(0) + " pts lower than base score";
  if (gap > 15) return "Deterioration alert: ML score " + gap.toFixed(0) + " pts below formula score";
  if (gap < -15) return "Recovery signal: ML score " + Math.abs(gap).toFixed(0) + " pts above formula score";
  return null;
}

// ─── Risk Factor Computation ───────────────────────────────────

function computeRiskFactors(road: RoadWithScore): { factors: string[]; multiplier: number } {
  const factors: string[] = [];
  let multiplier = 1.0;

  if (road.flood_prone) { factors.push("Flood-prone zone"); multiplier *= 0.7; }
  if (road.landslide_prone) { factors.push("Landslide-prone area"); multiplier *= 0.7; }
  if (road.ghat_section_flag) { factors.push("Ghat section"); multiplier *= 0.8; }
  if (road.monsoon_rainfall_category === "high") { factors.push("High rainfall zone"); multiplier *= 0.8; }
  if (road.avg_daily_traffic > 30000) { factors.push("Heavy traffic (ADT > 30k)"); multiplier *= 0.8; }
  if (road.truck_percentage > 30) { factors.push("High truck % (> 30%)"); multiplier *= 0.85; }
  if (road.terrain_type === "steep") { factors.push("Steep terrain"); multiplier *= 0.85; }
  if (road.surface_type === "gravel" || road.surface_type === "earthen") {
    factors.push("Unpaved surface"); multiplier *= 0.75;
  }
  if (road.tourism_route_flag) { factors.push("Tourism route"); multiplier *= 0.9; }
  if (road.potholes_per_km > 15) { factors.push("High potholes (" + road.potholes_per_km + "/km)"); multiplier *= 0.7; }
  if (road.alligator_cracking_pct > 20) { factors.push("Severe alligator cracking (" + road.alligator_cracking_pct + "%)"); multiplier *= 0.75; }
  if (road.rutting_depth_mm > 20) { factors.push("Deep rutting (" + road.rutting_depth_mm + "mm)"); multiplier *= 0.8; }
  if (road.iri_value > 8) { factors.push("Very rough ride (IRI " + road.iri_value + ")"); multiplier *= 0.8; }

  const age = 2026 - road.year_constructed;
  const lifespan = ({ concrete: 30, bitumen: 20, gravel: 12, earthen: 8 } as Record<string,number>)[road.surface_type] || 15;
  if (age > lifespan * 0.8) { factors.push("Near end of design life"); multiplier *= 0.75; }

  const cibil = road.healthScore.finalCibilScore;
  if (cibil < 25) { factors.push("Critical CIBIL score"); multiplier *= 0.6; }
  else if (cibil < 40) { factors.push("Poor CIBIL score"); multiplier *= 0.8; }

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
  const daysBetween =
    (new Date(last.inspection_date).getTime() - new Date(first.inspection_date).getTime()) /
    (1000 * 60 * 60 * 24);
  if (daysBetween <= 0) return { rate: 0, trend: "stable" };
  const rate = Math.max(0, (first.condition_score - last.condition_score) / daysBetween);

  const mid = Math.floor(sorted.length / 2);
  if (mid > 0 && sorted.length > 2) {
    const midInsp = sorted[mid];
    const firstHalfDays =
      (new Date(midInsp.inspection_date).getTime() - new Date(first.inspection_date).getTime()) /
      (1000 * 60 * 60 * 24);
    const secondHalfDays =
      (new Date(last.inspection_date).getTime() - new Date(midInsp.inspection_date).getTime()) /
      (1000 * 60 * 60 * 24);
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

function getLastInspection(inspections: InspectionRecord[]): InspectionRecord | null {
  if (!inspections.length) return null;
  return inspections.reduce((latest, insp) =>
    new Date(insp.inspection_date) > new Date(latest.inspection_date) ? insp : latest
  );
}

function assignAgency(road: RoadWithScore, action: ActionType): string {
  if (action === "emergency_reconstruction" || action === "emergency_overlay") {
    if (road.jurisdiction === "NHAI") return "NHAI Emergency Cell";
    return "State PWD Emergency Response";
  }
  if (action === "priority_structural_repair") {
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
  return "Q" + q + "-" + date.getFullYear();
}

// ─── Main CIBIL-Driven Scheduler ─────────────────────────────

export function generateInspectionSchedule(
  roads: RoadWithScore[],
  monsoonMode = false,
): ScheduledInspection[] {
  return roads.map((road) => {
    const hs = road.healthScore;
    const finalCibilScore = hs.finalCibilScore;
    const conditionCategory = hs.conditionCategory;
    const pdi = hs.pdi;
    const pseudoCibil = hs.pseudoCibil;
    const mlPredictedCibil = hs.mlPredictedCibil;

    const trendAlert = computeTrendAlert(pseudoCibil, mlPredictedCibil);
    const { factors, multiplier } = computeRiskFactors(road);
    const monsoonMult = getMonsoonMultiplier(road, monsoonMode);
    const { rate: decayRate, trend: decayTrend } = computeDecayRate(road.inspections);
    const distressSeverity = computeDistressSeverity(road);

    const cibilBaseDays = getCibilBaseDueDays(finalCibilScore);
    const decayMultiplier = decayRate > 0.08 ? 0.7 : decayRate > 0.04 ? 0.85 : 1.0;
    const adjustedInterval = Math.max(3, Math.round(cibilBaseDays * multiplier * monsoonMult * decayMultiplier));

    const lastInsp = getLastInspection(road.inspections);
    const lastDate = lastInsp ? new Date(lastInsp.inspection_date) : null;

    let nextDue: Date;
    if (lastDate) {
      nextDue = new Date(lastDate.getTime() + adjustedInterval * 24 * 60 * 60 * 1000);
    } else {
      // No inspection history — due date is based on road age + CIBIL tier
      // Critical roads (low CIBIL) are due very soon; good roads are due later
      const neverInspectedDays = Math.round(cibilBaseDays * 0.5 * multiplier * monsoonMult);
      nextDue = new Date(TODAY.getTime() + Math.max(1, neverInspectedDays) * 24 * 60 * 60 * 1000);
    }

    const diffMs = nextDue.getTime() - TODAY.getTime();
    const daysUntilDue = Math.round(diffMs / (24 * 60 * 60 * 1000));
    const isOverdue = daysUntilDue < 0;
    const overdueDays = isOverdue ? Math.abs(daysUntilDue) : 0;

    const priority = cibilToPriority(finalCibilScore, isOverdue, overdueDays);
    const action = getCibilActionType(finalCibilScore, pdi, {
      flood: road.flood_prone,
      landslide: road.landslide_prone,
      ghat: road.ghat_section_flag,
    });

    const priorityScore = computeCibilPriorityScore(
      finalCibilScore, overdueDays, factors.length, road.avg_daily_traffic,
      decayRate, distressSeverity, pdi, trendAlert,
    );

    return {
      road,
      lastInspection: lastInsp,
      lastInspectionDate: lastDate,
      baseIntervalDays: cibilBaseDays,
      adjustedIntervalDays: adjustedInterval,
      nextDueDate: nextDue,
      daysUntilDue,
      isOverdue,
      overdueDays,
      priority,
      priorityScore,
      action,
      riskFactors: factors,
      estimatedCostLakhs: estimateRepairCost(road, conditionCategory),
      assignedAgency: assignAgency(road, action),
      quarterLabel: getQuarterLabel(nextDue),
      decayRate,
      decayTrend,
      distressSeverity,
      finalCibilScore,
      conditionCategory,
      pdi,
      pseudoCibil,
      mlPredictedCibil,
      trendAlert,
      cibilDrivenDueDays: cibilBaseDays,
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
    emergency_reconstruction: 0, emergency_overlay: 0,
    priority_structural_repair: 0, structural_overlay: 0, major_repair: 0,
    preventive_risk_mitigation: 0, preventive_maintenance: 0, routine_patching: 0, monitoring_only: 0,
  };
  const byCondition: Record<string, number> = { Critical: 0, Poor: 0, Fair: 0, Good: 0 };
  const byQuarter: Record<string, number> = {};
  const byAgency: Record<string, number> = {};
  let overdue = 0, dueSoon = 0, dueThisWeek = 0;
  let critical = 0, high = 0, medium = 0, low = 0;
  let totalCost = 0, totalDecay = 0, totalCibil = 0;

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
    totalCibil += item.finalCibilScore;
    byAction[item.action]++;
    byCondition[item.conditionCategory] = (byCondition[item.conditionCategory] || 0) + 1;
    byQuarter[item.quarterLabel] = (byQuarter[item.quarterLabel] || 0) + 1;
    byAgency[item.assignedAgency] = (byAgency[item.assignedAgency] || 0) + 1;
  }

  return {
    total: schedule.length,
    overdue, dueSoon, dueThisWeek,
    critical, high, medium, low,
    totalEstimatedCost: totalCost,
    avgDecayRate: schedule.length > 0 ? Math.round((totalDecay / schedule.length) * 1000) / 1000 : 0,
    avgCibilScore: schedule.length > 0 ? Math.round((totalCibil / schedule.length) * 10) / 10 : 0,
    byAction, byCondition, byQuarter, byAgency,
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
  const oldScore = road.healthScore.finalCibilScore;
  const oldBand = road.healthScore.band;

  const newInspection: InspectionRecord = {
    inspection_id: "INSP-NEW-" + Date.now(),
    road_id: road.road_id,
    inspection_date: TODAY.toISOString().split("T")[0],
    inspector_agency: agency,
    condition_score: newScore,
    surface_damage_pct: newSurfaceDamage,
    waterlogging_flag: newWaterlogging,
    drainage_status: newDrainage,
    remarks: newRemarks,
  };

  const updatedRoadRecord = {
    ...road,
    pci_score: newScore,
    inspections: [...road.inspections, newInspection],
  };

  const getBandFromScore = (s: number): Band => {
    if (s >= 90) return "A+";
    if (s >= 75) return "A";
    if (s >= 60) return "B";
    if (s >= 45) return "C";
    if (s >= 30) return "D";
    return "E";
  };

  const newBand = getBandFromScore(newScore);
  const newConditionCategory =
    newScore >= 80 ? "Good" : newScore >= 60 ? "Fair" : newScore >= 40 ? "Poor" : "Critical";

  const newHealthScoreObj = {
    ...road.healthScore,
    finalCibilScore: newScore,
    conditionScore: newScore,
    rating: newScore * 10,
    band: newBand,
    conditionCategory: newConditionCategory,
    pseudoCibil: newScore,
    mlPredictedCibil: newScore,
  };

  const updatedRoad: RoadWithScore = {
    ...updatedRoadRecord,
    healthScore: newHealthScoreObj,
  };

  return { updatedRoad, oldScore, newHealthScore: newHealthScoreObj.finalCibilScore, oldBand, newBand };
}
