import { RoadWithScore, Band, InspectionRecord } from "./types";
import { getInspectionInterval, estimateRepairCost } from "./scoring";

// ─── Scheduling Types ──────────────────────────────────────────

export type InspectionPriority = "critical" | "high" | "medium" | "low";
export type ActionType =
  | "emergency_repair"
  | "urgent_inspection"
  | "routine_inspection"
  | "preventive_maintenance"
  | "monitoring_only";

export interface ScheduledInspection {
  road: RoadWithScore;
  lastInspection: InspectionRecord | null;
  lastInspectionDate: Date | null;
  baseIntervalDays: number;
  adjustedIntervalDays: number;
  nextDueDate: Date;
  daysUntilDue: number;          // negative = overdue
  isOverdue: boolean;
  overdueDays: number;
  priority: InspectionPriority;
  priorityScore: number;         // higher = more urgent (0–100)
  action: ActionType;
  riskFactors: string[];
  estimatedCostLakhs: number;
  assignedAgency: string;
  quarterLabel: string;          // Q1-2026, Q2-2026, etc.
}

// ─── Constants ─────────────────────────────────────────────────

const TODAY = new Date(2026, 1, 19); // Feb 19, 2026

const AGENCIES = ["NHAI", "MSRDC", "PWD Maharashtra", "ThirdParty"];

// ─── Risk Factor Multiplier ────────────────────────────────────
// More risk factors → shorter inspection interval

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

  // Last rehab was too long ago
  const age = 2026 - road.year_constructed;
  const lifespan = { concrete: 30, bitumen: 20, gravel: 12, earthen: 8 }[road.surface_type] || 15;
  if (age > lifespan * 0.8) {
    factors.push("Near end of design life");
    multiplier *= 0.75;
  }

  // Health score is low
  if (road.healthScore.conditionScore < 25) {
    factors.push("Critical health score");
    multiplier *= 0.6;
  } else if (road.healthScore.conditionScore < 40) {
    factors.push("Poor health score");
    multiplier *= 0.8;
  }

  return { factors, multiplier: Math.max(multiplier, 0.25) }; // floor at 25% of base interval
}

// ─── Get Last Inspection ───────────────────────────────────────

function getLastInspection(inspections: InspectionRecord[]): InspectionRecord | null {
  if (!inspections.length) return null;
  return inspections.reduce((latest, insp) => {
    const d1 = new Date(latest.inspection_date);
    const d2 = new Date(insp.inspection_date);
    return d2 > d1 ? insp : latest;
  });
}

// ─── Determine Action ──────────────────────────────────────────

function determineAction(band: Band, overdue: boolean, overdueDays: number, conditionScore: number): ActionType {
  if (band === "E" || (overdue && overdueDays > 30 && conditionScore < 25)) return "emergency_repair";
  if (band === "D" || (overdue && overdueDays > 15)) return "urgent_inspection";
  if (overdue) return "routine_inspection";
  if (band === "B" || band === "C") return "preventive_maintenance";
  return "monitoring_only";
}

// ─── Priority Score (0–100) ────────────────────────────────────

function computePriorityScore(
  band: Band,
  overdueDays: number,
  conditionScore: number,
  riskFactorCount: number,
  traffic: number,
): number {
  const bandWeights: Record<Band, number> = { E: 30, D: 24, C: 18, B: 12, A: 6, "A+": 0 };
  let score = bandWeights[band];

  // Overdue penalty (max 30 pts)
  score += Math.min(30, Math.max(0, overdueDays) * 0.5);

  // Low condition penalty (max 20 pts)
  score += Math.max(0, (50 - conditionScore) * 0.4);

  // Risk factor bonus (max 12 pts)
  score += Math.min(12, riskFactorCount * 3);

  // Traffic bonus (max 8 pts)
  score += Math.min(8, (traffic / 50000) * 8);

  return Math.min(100, Math.round(score * 10) / 10);
}

// ─── Assign Agency ─────────────────────────────────────────────
// Round-robin based on jurisdiction and action type

function assignAgency(road: RoadWithScore, action: ActionType): string {
  if (action === "emergency_repair" || action === "urgent_inspection") {
    return road.jurisdiction === "NHAI" ? "NHAI" : "PWD Maharashtra";
  }
  if (road.jurisdiction === "NHAI") return "NHAI";
  if (road.jurisdiction === "State_Highway") return "MSRDC";
  return "PWD Maharashtra";
}

// ─── Quarter Label ─────────────────────────────────────────────

function getQuarterLabel(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `Q${q}-${date.getFullYear()}`;
}

// ─── Main Scheduler ────────────────────────────────────────────

export function generateInspectionSchedule(roads: RoadWithScore[]): ScheduledInspection[] {
  const schedule: ScheduledInspection[] = roads.map((road) => {
    const lastInsp = getLastInspection(road.inspections);
    const lastDate = lastInsp ? new Date(lastInsp.inspection_date) : null;

    const baseInterval = getInspectionInterval(road.healthScore.band);
    const { factors, multiplier } = computeRiskFactors(road);
    const adjustedInterval = Math.round(baseInterval * multiplier);

    let nextDue: Date;
    if (lastDate) {
      nextDue = new Date(lastDate.getTime() + adjustedInterval * 24 * 60 * 60 * 1000);
    } else {
      // No inspection ever — immediately due
      nextDue = new Date(TODAY.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const diffMs = nextDue.getTime() - TODAY.getTime();
    const daysUntilDue = Math.round(diffMs / (24 * 60 * 60 * 1000));
    const isOverdue = daysUntilDue < 0;
    const overdueDays = isOverdue ? Math.abs(daysUntilDue) : 0;

    const priorityScore = computePriorityScore(
      road.healthScore.band,
      overdueDays,
      road.healthScore.conditionScore,
      factors.length,
      road.avg_daily_traffic,
    );

    let priority: InspectionPriority;
    if (priorityScore >= 60) priority = "critical";
    else if (priorityScore >= 40) priority = "high";
    else if (priorityScore >= 20) priority = "medium";
    else priority = "low";

    const action = determineAction(
      road.healthScore.band, isOverdue, overdueDays, road.healthScore.conditionScore,
    );

    return {
      road,
      lastInspection: lastInsp,
      lastInspectionDate: lastDate,
      baseIntervalDays: baseInterval,
      adjustedIntervalDays: adjustedInterval,
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
    };
  });

  // Sort by priority score descending (most urgent first)
  schedule.sort((a, b) => b.priorityScore - a.priorityScore);

  return schedule;
}

// ─── Summary Stats ─────────────────────────────────────────────

export interface ScheduleSummary {
  total: number;
  overdue: number;
  dueSoon: number;        // within 30 days
  critical: number;
  high: number;
  medium: number;
  low: number;
  totalEstimatedCost: number;
  byAction: Record<ActionType, number>;
  byQuarter: Record<string, number>;
  byAgency: Record<string, number>;
}

export function computeScheduleSummary(schedule: ScheduledInspection[]): ScheduleSummary {
  const byAction: Record<ActionType, number> = {
    emergency_repair: 0,
    urgent_inspection: 0,
    routine_inspection: 0,
    preventive_maintenance: 0,
    monitoring_only: 0,
  };
  const byQuarter: Record<string, number> = {};
  const byAgency: Record<string, number> = {};

  let overdue = 0;
  let dueSoon = 0;
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let totalCost = 0;

  for (const item of schedule) {
    if (item.isOverdue) overdue++;
    if (!item.isOverdue && item.daysUntilDue <= 30) dueSoon++;
    if (item.priority === "critical") critical++;
    else if (item.priority === "high") high++;
    else if (item.priority === "medium") medium++;
    else low++;

    totalCost += item.estimatedCostLakhs;
    byAction[item.action]++;
    byQuarter[item.quarterLabel] = (byQuarter[item.quarterLabel] || 0) + 1;
    byAgency[item.assignedAgency] = (byAgency[item.assignedAgency] || 0) + 1;
  }

  return {
    total: schedule.length,
    overdue,
    dueSoon,
    critical,
    high,
    medium,
    low,
    totalEstimatedCost: totalCost,
    byAction,
    byQuarter,
    byAgency,
  };
}
