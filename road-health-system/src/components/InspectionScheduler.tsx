"use client";

import { useMemo, useState, useCallback, useRef, Fragment } from "react";
import {
  ScheduledInspection,
  ScheduleSummary,
  InspectionPriority,
  ActionType,
  InspectionType,
  generateInspectionSchedule,
  computeScheduleSummary,
  getMonsoonMultiplier,
  recalculateAfterInspection,
} from "@/lib/scheduler";
import { RoadWithScore, Band, InspectionRecord } from "@/lib/types";
import {
  AlertTriangle, CalendarClock, Clock, ChevronDown, ChevronUp, Search,
  ArrowUpDown, Shield, Droplets, Mountain, CloudRain, MapPin, Activity,
  CheckCircle2, XCircle, Download, CloudLightning, TrendingDown,
  TrendingUp, Minus, CalendarPlus, ClipboardCheck, X, Zap, Eye,
  Wrench, FileWarning, Timer, BarChart3, History, Info,
  Gauge, Truck, Ruler, Layers, ArrowRight,
  User, Building2, Navigation, Send, Calendar, Clipboard, Phone,
  Globe, Thermometer, LocateFixed,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════
   CONSTANTS  
   ════════════════════════════════════════════════════════════════ */

const PRIORITY_CFG: Record<InspectionPriority, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: "Critical", color: "#991b1b", bg: "#fef2f2", border: "#fecaca" },
  high:     { label: "High",     color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  medium:   { label: "Medium",   color: "#a16207", bg: "#fefce8", border: "#fef08a" },
  low:      { label: "Low",      color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
};

const ACTION_CFG: Record<ActionType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  emergency_reconstruction:   { label: "Emergency Reconstruction", icon: <Zap size={12} />,            color: "#7f1d1d", bg: "#fef2f2" },
  emergency_overlay:          { label: "Emergency Overlay",        icon: <AlertTriangle size={12} />,  color: "#dc2626", bg: "#fef2f2" },
  priority_structural_repair: { label: "Priority Structural",      icon: <FileWarning size={12} />,   color: "#c2410c", bg: "#fff7ed" },
  structural_overlay:         { label: "Structural Overlay",       icon: <Layers size={12} />,         color: "#ea580c", bg: "#fff7ed" },
  major_repair:               { label: "Major Repair",             icon: <Wrench size={12} />,         color: "#d97706", bg: "#fffbeb" },
  preventive_risk_mitigation: { label: "Preventive + Risk",        icon: <Shield size={12} />,         color: "#2563eb", bg: "#eff6ff" },
  preventive_maintenance:     { label: "Preventive Maint.",        icon: <Activity size={12} />,       color: "#7c3aed", bg: "#f5f3ff" },
  routine_patching:           { label: "Routine Patching",         icon: <Eye size={12} />,            color: "#0891b2", bg: "#ecfeff" },
  monitoring_only:            { label: "Monitoring Only",          icon: <CheckCircle2 size={12} />,   color: "#059669", bg: "#f0fdf4" },
};

// CIBIL condition color helper
function cibilColor(score: number): string {
  if (score < 25) return "#7f1d1d";
  if (score < 40) return "#dc2626";
  if (score < 55) return "#ea580c";
  if (score < 70) return "#d97706";
  if (score < 85) return "#16a34a";
  return "#059669";
}

function cibilBg(score: number): string {
  if (score < 25) return "#fef2f2";
  if (score < 40) return "#fef2f2";
  if (score < 55) return "#fff7ed";
  if (score < 70) return "#fffbeb";
  if (score < 85) return "#f0fdf4";
  return "#f0fdf4";
}

function conditionCfg(cat: string): { color: string; bg: string; border: string } {
  if (cat === "Critical") return { color: "#991b1b", bg: "#fef2f2", border: "#fecaca" };
  if (cat === "Poor")     return { color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" };
  if (cat === "Fair")     return { color: "#a16207", bg: "#fefce8", border: "#fef08a" };
  return                         { color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" };
}

const BAND_COLORS: Record<Band, string> = {
  "A+": "#059669", A: "#22c55e", B: "#eab308", C: "#f97316", D: "#ef4444", E: "#991b1b",
};

function fmt(d: Date | null): string {
  if (!d) return "Never";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function pctBar(val: number, max: number, color: string) {
  const pct = Math.min(100, (val / max) * 100);
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#e5e7eb" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono tabular-nums text-gray-500 w-8 text-right">{val}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STAT CARD  
   ════════════════════════════════════════════════════════════════ */

function StatCard({ label, value, sub, icon, color, bg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div className="rounded-2xl p-4 border transition-all hover:shadow-md"
      style={{ background: bg, borderColor: `${color}20` }}>
      <div className="flex items-start justify-between mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}15`, color }}>{icon}</div>
      </div>
      <p className="text-2xl font-extrabold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[11px] font-semibold text-gray-600 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SCHEDULE MODAL — Book an inspection  
   ════════════════════════════════════════════════════════════════ */

function ScheduleModal({ item, onClose, onConfirm }: {
  item: ScheduledInspection;
  onClose: () => void;
  onConfirm: (date: string, agency: string, type: InspectionType, team: string, notes: string) => void;
}) {
  const suggestedDate = new Date();
  suggestedDate.setDate(suggestedDate.getDate() + (item.isOverdue ? 1 : Math.min(item.daysUntilDue, 3)));
  const [date, setDate] = useState(suggestedDate.toISOString().split("T")[0]);
  const [agency, setAgency] = useState(item.assignedAgency);
  const [type, setType] = useState<InspectionType>("full");
  const [teamLead, setTeamLead] = useState("");
  const [teamSize, setTeamSize] = useState("3");
  const [notes, setNotes] = useState("");

  // AI recommendations based on road conditions
  const equipmentNeeded: string[] = [];
  if (item.road.potholes_per_km > 10) equipmentNeeded.push("Pothole measuring wheel");
  if (item.road.rutting_depth_mm > 15) equipmentNeeded.push("Rut depth gauge");
  if (item.road.iri_value > 6) equipmentNeeded.push("Profilometer");
  if (item.road.alligator_cracking_pct > 15) equipmentNeeded.push("Crack survey kit");
  if (item.road.flood_prone) equipmentNeeded.push("Drainage testing equipment");
  if (equipmentNeeded.length === 0) equipmentNeeded.push("Standard survey kit");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"
          style={{ background: "linear-gradient(135deg, #fff7ed, #fffbeb)" }}>
          <div>
            <h3 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <CalendarPlus size={16} className="text-orange-500" /> Schedule Inspection
            </h3>
            <p className="text-[11px] text-gray-400">{item.road.road_id} — {item.road.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/70 transition">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Road Snapshot */}
          <div className="flex gap-3">
            {[
              { label: "CIBIL", val: item.finalCibilScore.toFixed(0), color: cibilColor(item.finalCibilScore) },
              { label: "Condition", val: item.conditionCategory, color: conditionCfg(item.conditionCategory).color },
              { label: "PDI", val: item.pdi.toFixed(0), color: item.pdi < 30 ? "#dc2626" : "#374151" },
              { label: "Priority", val: item.priorityScore.toFixed(0), color: PRIORITY_CFG[item.priority].color },
            ].map((s) => (
              <div key={s.label} className="flex-1 rounded-xl p-3" style={{ background: "#f8fafc" }}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase">{s.label}</p>
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* AI Recommendation */}
          <div className="rounded-xl border border-orange-200 p-4" style={{ background: "#fffbeb" }}>
            <p className="text-[11px] font-bold text-orange-700 mb-1 flex items-center gap-1">
              <Zap size={12} /> CIBIL-Driven Recommendation
            </p>
            <p className="text-[12px] text-orange-900 leading-relaxed">
              {item.isOverdue
                ? `⚠️ This road is ${item.overdueDays} days overdue. CIBIL: ${item.finalCibilScore.toFixed(0)} (${item.conditionCategory}). Recommend immediate ${type} inspection.${item.decayRate > 0.05 ? ` Deteriorating at ${item.decayRate.toFixed(3)}/day.` : ""}`
                : item.daysUntilDue <= 7
                  ? `Due in ${item.daysUntilDue} days. CIBIL ${item.finalCibilScore.toFixed(0)} — ${item.conditionCategory}. Schedule this week.`
                  : `Due in ${item.daysUntilDue} days. CIBIL ${item.finalCibilScore.toFixed(0)} — ${item.conditionCategory}. Interval driven by score tier.`
              }
            </p>
            {item.trendAlert && (
              <p className="text-[11px] text-red-700 mt-1 font-semibold">⚡ {item.trendAlert}</p>
            )}
            {item.riskFactors.length > 0 && (
              <p className="text-[11px] text-orange-700 mt-1">
                Risk factors: {item.riskFactors.slice(0, 3).join(", ")}
              </p>
            )}
          </div>

          {/* Equipment Recommendation */}
          <div className="rounded-xl border border-blue-200 p-4" style={{ background: "#eff6ff" }}>
            <p className="text-[11px] font-bold text-blue-700 mb-2">🛠️ Recommended Equipment</p>
            <div className="flex flex-wrap gap-1.5">
              {equipmentNeeded.map((eq) => (
                <span key={eq} className="px-2 py-1 rounded-md bg-white border border-blue-200 text-[10px] font-medium text-blue-700">
                  {eq}
                </span>
              ))}
            </div>
          </div>

          {/* Scheduling Form */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Inspection Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Assign Agency *</label>
              <select value={agency} onChange={(e) => setAgency(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-[13px] bg-white focus:outline-none focus:border-orange-400">
                <option>NHAI</option><option>State PWD</option><option>Municipality</option><option>PMGSY</option><option>ThirdParty</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Team Lead Name</label>
              <input type="text" value={teamLead} onChange={(e) => setTeamLead(e.target.value)}
                placeholder="e.g. Eng. Patil"
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Team Size</label>
              <select value={teamSize} onChange={(e) => setTeamSize(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-[13px] bg-white focus:outline-none focus:border-orange-400">
                {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} members</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-2 block">Inspection Type *</label>
            <div className="flex gap-2">
              {([
                { key: "full" as InspectionType, label: "Full Inspection", desc: "Complete survey with all equipment" },
                { key: "quick" as InspectionType, label: "Quick Check", desc: "Visual inspection + key metrics" },
                { key: "monsoon_special" as InspectionType, label: "Monsoon Special", desc: "Drainage + waterlogging focus" },
              ]).map((t) => (
                <button key={t.key} onClick={() => setType(t.key)}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-left border transition-all ${type === t.key ? "border-orange-300 shadow-sm" : "border-gray-200 hover:bg-gray-50"}`}
                  style={type === t.key ? { background: "#fff7ed" } : undefined}>
                  <p className={`text-[12px] font-semibold ${type === t.key ? "text-orange-700" : "text-gray-600"}`}>{t.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Notes / Instructions</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Special instructions for the inspection team..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400 resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100"
          style={{ background: "#fafafa" }}>
          <p className="text-[10px] text-gray-400">Est. cost: ₹{item.estimatedCostLakhs}L</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition">Cancel</button>
            <button onClick={() => onConfirm(date, agency, type, `${teamLead} (${teamSize} members)`, notes)}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:shadow-lg"
              style={{ background: "#f97316" }}>
              <CalendarPlus size={14} className="inline mr-1.5 -mt-0.5" />Confirm Schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   RECORD INSPECTION MODAL — Multi-step distress entry + preview
   ════════════════════════════════════════════════════════════════ */

function RecordModal({ item, onClose, onSubmit }: {
  item: ScheduledInspection;
  onClose: () => void;
  onSubmit: (data: RecordData) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — General condition
  const [conditionScore, setConditionScore] = useState(50);
  const [surfaceDmg, setSurfaceDmg] = useState(5);
  const [waterlog, setWaterlog] = useState(false);
  const [drainage, setDrainage] = useState("good");
  const [agency, setAgency] = useState(item.scheduledAgency || item.assignedAgency);
  const [inspector, setInspector] = useState("");

  // Step 2 — Distress details
  const [potholes, setPotholes] = useState(item.road.potholes_per_km);
  const [potholeDepth, setPotholeDepth] = useState(item.road.pothole_avg_depth_cm);
  const [cracksLong, setCracksLong] = useState(item.road.cracks_longitudinal_pct);
  const [cracksTrans, setCracksTrans] = useState(item.road.cracks_transverse_per_km);
  const [alligator, setAlligator] = useState(item.road.alligator_cracking_pct);
  const [rutting, setRutting] = useState(item.road.rutting_depth_mm);
  const [raveling, setRaveling] = useState(item.road.raveling_pct);
  const [edgeBreak, setEdgeBreak] = useState(item.road.edge_breaking_pct);
  const [patches, setPatches] = useState(item.road.patches_per_km);

  // Step 3 — Remarks
  const [remarks, setRemarks] = useState("");

  // Live score preview — deterministic fallback formula (no async API call needed for preview)
  const previewScore = useMemo(() => {
    const pciRaw  = conditionScore;
    const iriNorm = Math.max(0, 100 - (item.road.iri_value ?? 5) * 8);
    const deductions =
      Math.min(1, potholes           / 30) * 20 +
      Math.min(1, alligator          / 50) * 18 +
      Math.min(1, rutting            / 40) * 15 +
      Math.min(1, cracksLong         / 50) * 12 +
      Math.min(1, cracksTrans        / 30) * 10 +
      Math.min(1, potholeDepth       / 20) * 8  +
      Math.min(1, raveling           / 50) * 7  +
      Math.min(1, edgeBreak          / 50) * 5  +
      Math.min(1, patches            / 25) * 5;
    const distress = Math.max(0, Math.min(100, 100 - deductions));
    const score    = Math.round(0.30 * pciRaw + 0.20 * iriNorm + 0.20 * distress + 0.30 * 60);
    const getBand = (s: number): Band => {
      if (s >= 90) return "A+"; if (s >= 75) return "A";
      if (s >= 60) return "B";  if (s >= 45) return "C";
      if (s >= 30) return "D";  return "E";
    };
    const bandColors: Record<Band, string> = {
      "A+": "#059669", A: "#22c55e", B: "#eab308", C: "#f97316", D: "#ef4444", E: "#991b1b",
    };
    const band = getBand(score);
    return {
      ...item.road.healthScore,
      finalCibilScore:   score,
      conditionScore:    score,
      rating:            score * 10,
      band,
      bandColor:         bandColors[band],
      conditionCategory: score >= 80 ? "Good" : score >= 60 ? "Fair" : score >= 40 ? "Poor" : "Critical",
    };
  }, [conditionScore, potholes, potholeDepth, cracksLong, cracksTrans, alligator, rutting, raveling, edgeBreak, patches, item.road]);

  const scoreDelta = previewScore.finalCibilScore - item.road.healthScore.finalCibilScore;

  const stepTitles = ["General Condition", "Distress Metrics", "Review & Submit"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"
          style={{ background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)" }}>
          <div>
            <h3 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <ClipboardCheck size={16} className="text-green-600" /> Record Inspection Results
            </h3>
            <p className="text-[11px] text-gray-400">{item.road.road_id} — {item.road.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/70 transition">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 border-b border-gray-100" style={{ background: "#fafafa" }}>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <Fragment key={s}>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  s === step ? "text-white shadow-sm" : s < step ? "text-green-700 bg-green-50" : "text-gray-400"
                }`} style={s === step ? { background: "#059669" } : undefined}>
                  {s < step ? <CheckCircle2 size={11} /> : <span className="w-4 text-center">{s}</span>}
                  {stepTitles[s - 1]}
                </div>
                {s < 3 && <ArrowRight size={12} className="text-gray-300" />}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Live Score Preview Bar */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between"
          style={{ background: "#f8fafc" }}>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Current CIBIL</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[22px] font-black tabular-nums leading-none"
                  style={{ color: cibilColor(item.road.healthScore.finalCibilScore) }}>
                  {item.road.healthScore.finalCibilScore.toFixed(1)}
                </span>
                <span className="text-[10px] text-gray-400 font-semibold self-end pb-0.5">/100</span>
                <span className="ml-1 px-2 py-0.5 rounded-full text-[9px] font-bold border"
                  style={conditionCfg(item.road.healthScore.conditionCategory)}>
                  {item.road.healthScore.conditionCategory}
                </span>
              </div>
            </div>
            <ArrowRight size={16} className="text-gray-300" />
            <div>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Live Preview</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[22px] font-black tabular-nums leading-none"
                  style={{ color: cibilColor(previewScore.finalCibilScore) }}>
                  {previewScore.finalCibilScore.toFixed(1)}
                </span>
                <span className="text-[10px] text-gray-400 font-semibold self-end pb-0.5">/100</span>
                <span className="ml-1 px-2 py-0.5 rounded-full text-[9px] font-bold border"
                  style={conditionCfg(previewScore.conditionCategory)}>
                  {previewScore.conditionCategory}
                </span>
                {scoreDelta !== 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 ${scoreDelta > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {scoreDelta > 0 ? "↑" : "↓"}{Math.abs(scoreDelta).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">PDI</p>
            <p className="text-[18px] font-black tabular-nums" style={{ color: cibilColor(previewScore.finalCibilScore) }}>
              {previewScore.pdi?.toFixed(1) ?? "—"}
            </p>
            <p className="text-[9px] text-gray-400">distress index</p>
          </div>
        </div>

        {/* ── Step 1: General Condition ── */}
        {step === 1 && (
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
                  Condition Score (PCI) * <span className="text-gray-400">(0–100)</span>
                </label>
                <input type="range" min={0} max={100} value={conditionScore}
                  onChange={(e) => setConditionScore(Number(e.target.value))}
                  className="w-full accent-orange-500" />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>Critical (0)</span>
                  <span className="font-bold text-[14px]" style={{ color: conditionScore < 30 ? "#dc2626" : conditionScore < 50 ? "#ea580c" : conditionScore < 65 ? "#eab308" : "#22c55e" }}>
                    {conditionScore}
                  </span>
                  <span>Excellent (100)</span>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
                  Surface Damage % * <span className="text-gray-400">(0–100)</span>
                </label>
                <input type="range" min={0} max={100} value={surfaceDmg}
                  onChange={(e) => setSurfaceDmg(Number(e.target.value))}
                  className="w-full accent-orange-500" />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>None (0%)</span>
                  <span className="font-bold text-[14px]" style={{ color: surfaceDmg > 40 ? "#dc2626" : surfaceDmg > 20 ? "#ea580c" : "#22c55e" }}>
                    {surfaceDmg}%
                  </span>
                  <span>Severe (100%)</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Inspector / Agency *</label>
                <select value={agency} onChange={(e) => setAgency(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-[13px] bg-white focus:outline-none focus:border-orange-400">
                  <option>NHAI</option><option>State PWD</option><option>Municipality</option><option>PMGSY</option><option>ThirdParty</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Inspector Name</label>
                <input type="text" value={inspector} onChange={(e) => setInspector(e.target.value)}
                  placeholder="e.g. Eng. Deshmukh"
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Drainage Status *</label>
                <div className="flex gap-2">
                  {["good", "partial", "blocked"].map((s) => (
                    <button key={s} onClick={() => setDrainage(s)}
                      className={`flex-1 py-2 rounded-lg text-[12px] font-semibold border transition-all ${drainage === s ? "border-green-300 shadow-sm" : "border-gray-200"}`}
                      style={drainage === s ? { background: "#f0fdf4", color: "#15803d" } : { color: "#6b7280" }}>
                      {s === "good" ? "✅ Good" : s === "partial" ? "⚠️ Partial" : "🚫 Blocked"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-2 block">Waterlogging Observed</label>
                <div className="flex items-center gap-3 mt-1">
                  <button onClick={() => setWaterlog(!waterlog)}
                    className={`relative w-12 h-6 rounded-full transition-all ${waterlog ? "bg-red-500" : "bg-gray-300"}`}>
                    <span className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
                      style={{ left: waterlog ? 26 : 4 }} />
                  </button>
                  <span className={`text-[12px] font-semibold ${waterlog ? "text-red-600" : "text-gray-500"}`}>
                    {waterlog ? "Yes — Waterlogging found" : "No waterlogging"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Distress Metrics ── */}
        {step === 2 && (
          <div className="px-6 py-5 space-y-3">
            <p className="text-[11px] text-gray-400 mb-2">Enter measured distress values from field inspection. Previous values are pre-filled.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Potholes per km", val: potholes, set: setPotholes, max: 30, icon: <FileWarning size={12} /> },
                { label: "Pothole Avg Depth (cm)", val: potholeDepth, set: setPotholeDepth, max: 20, icon: <Ruler size={12} /> },
                { label: "Longitudinal Cracks %", val: cracksLong, set: setCracksLong, max: 50, icon: <Layers size={12} /> },
                { label: "Transverse Cracks /km", val: cracksTrans, set: setCracksTrans, max: 30, icon: <Layers size={12} /> },
                { label: "Alligator Cracking %", val: alligator, set: setAlligator, max: 50, icon: <AlertTriangle size={12} /> },
                { label: "Rutting Depth (mm)", val: rutting, set: setRutting, max: 40, icon: <Gauge size={12} /> },
                { label: "Raveling %", val: raveling, set: setRaveling, max: 50, icon: <Activity size={12} /> },
                { label: "Edge Breaking %", val: edgeBreak, set: setEdgeBreak, max: 50, icon: <Mountain size={12} /> },
                { label: "Patches per km", val: patches, set: setPatches, max: 25, icon: <Wrench size={12} /> },
              ].map((d) => (
                <div key={d.label} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center gap-1.5 mb-2 text-gray-500">{d.icon}
                    <span className="text-[10px] font-semibold">{d.label}</span>
                  </div>
                  <input type="number" min={0} max={d.max} step={0.1} value={d.val}
                    onChange={(e) => d.set(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 text-[13px] font-semibold focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  <div className="mt-1.5">{pctBar(d.val, d.max, d.val / d.max > 0.7 ? "#dc2626" : d.val / d.max > 0.4 ? "#ea580c" : "#22c55e")}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Review & Submit ── */}
        {step === 3 && (
          <div className="px-6 py-5 space-y-5">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl p-3 border-2 flex flex-col gap-1"
                style={{ background: cibilBg(previewScore.finalCibilScore), borderColor: cibilColor(previewScore.finalCibilScore) + "40" }}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">CIBIL Score</p>
                <div className="flex items-end gap-1">
                  <p className="text-3xl font-black tabular-nums leading-none"
                    style={{ color: cibilColor(previewScore.finalCibilScore) }}>
                    {previewScore.finalCibilScore.toFixed(1)}
                  </p>
                  <p className="text-[11px] text-gray-400 mb-0.5">/100</p>
                </div>
              </div>
              <div className="rounded-xl p-3 border border-gray-200" style={{ background: "#f8fafc" }}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Surface Damage</p>
                <p className="text-xl font-bold mt-1"
                  style={{ color: surfaceDmg > 40 ? "#dc2626" : surfaceDmg > 20 ? "#ea580c" : "#22c55e" }}>
                  {surfaceDmg}%
                </p>
              </div>
              <div className="rounded-xl p-3 border-2 flex flex-col gap-1"
                style={conditionCfg(previewScore.conditionCategory)}>
                <p className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: conditionCfg(previewScore.conditionCategory).color, opacity: 0.7 }}>
                  Condition
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-2.5 py-1 rounded-full text-[12px] font-bold border-2"
                    style={conditionCfg(previewScore.conditionCategory)}>
                    {previewScore.conditionCategory}
                  </span>
                </div>
                <p className="text-[9px] text-gray-400 mt-0.5">PDI: {previewScore.pdi?.toFixed(1) ?? "—"}</p>
              </div>
            </div>

            {/* Parameters Breakdown */}
            <div className="rounded-xl border border-gray-200 p-4">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Predicted Parameter Scores</h4>
              <div className="space-y-2">
                {[
                  { k: "PCI", v: previewScore.parameters.PCI, w: "30%", c: "#22c55e" },
                  { k: "IRI", v: previewScore.parameters.IRI, w: "20%", c: "#3b82f6" },
                  { k: "DISTRESS", v: previewScore.parameters.DISTRESS, w: "20%", c: "#eab308" },
                  { k: "RSL", v: previewScore.parameters.RSL, w: "15%", c: "#8b5cf6" },
                  { k: "DRN", v: previewScore.parameters.DRN, w: "15%", c: "#0891b2" },
                ].map((p) => (
                  <div key={p.k} className="flex items-center gap-3">
                    <span className="text-[11px] font-semibold text-gray-600 w-16">{p.k} ({p.w})</span>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "#e5e7eb" }}>
                      <div className="h-full rounded-full" style={{ width: `${p.v}%`, background: p.c }} />
                    </div>
                    <span className="text-[11px] font-bold tabular-nums w-8 text-right" style={{ color: p.c }}>{p.v.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Inspector Remarks</label>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3}
                placeholder="Overall observations, maintenance recommendations, photos taken..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400 resize-none" />
            </div>

            {/* Score Change Preview */}
            <div className="rounded-xl p-4 border-2 transition-all"
              style={{
                borderColor: scoreDelta > 0 ? "#bbf7d0" : scoreDelta < 0 ? "#fecaca" : "#e5e7eb",
                background: scoreDelta > 0 ? "#f0fdf4" : scoreDelta < 0 ? "#fef2f2" : "#f8fafc"
              }}>
              <p className="text-[11px] font-bold text-gray-600 mb-3">🔄 Predicted CIBIL Impact After Submission</p>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Before</p>
                  <p className="text-2xl font-black tabular-nums leading-none"
                    style={{ color: cibilColor(item.road.healthScore.finalCibilScore) }}>
                    {item.road.healthScore.finalCibilScore.toFixed(1)}
                  </p>
                  <span className="mt-1 inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border"
                    style={conditionCfg(item.road.healthScore.conditionCategory)}>
                    {item.road.healthScore.conditionCategory}
                  </span>
                </div>
                <ArrowRight size={20} className="text-gray-300" />
                <div className="text-center">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">After</p>
                  <p className="text-2xl font-black tabular-nums leading-none"
                    style={{ color: cibilColor(previewScore.finalCibilScore) }}>
                    {previewScore.finalCibilScore.toFixed(1)}
                  </p>
                  <span className="mt-1 inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border"
                    style={conditionCfg(previewScore.conditionCategory)}>
                    {previewScore.conditionCategory}
                  </span>
                </div>
                <div className={`ml-auto px-3 py-2 rounded-xl text-[13px] font-black ${scoreDelta > 0 ? "bg-green-100 text-green-700" : scoreDelta < 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                  {scoreDelta > 0 ? `↑ +${scoreDelta.toFixed(1)}` : scoreDelta < 0 ? `↓ ${scoreDelta.toFixed(1)}` : "No change"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100"
          style={{ background: "#fafafa" }}>
          <button onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3) : onClose()}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition">
            {step === 1 ? "Cancel" : "← Back"}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep((step + 1) as 1 | 2 | 3)}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white transition-all"
              style={{ background: "#059669" }}>
              Next Step →
            </button>
          ) : (
            <button onClick={() => onSubmit({
              conditionScore, surfaceDmg, waterlog, drainage, agency, inspector, remarks,
              potholes, potholeDepth, cracksLong, cracksTrans, alligator, rutting, raveling, edgeBreak, patches,
            })}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:shadow-lg"
              style={{ background: "#059669" }}>
              <ClipboardCheck size={14} className="inline mr-1.5 -mt-0.5" />Submit Inspection
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface RecordData {
  conditionScore: number; surfaceDmg: number; waterlog: boolean; drainage: string;
  agency: string; inspector: string; remarks: string;
  potholes: number; potholeDepth: number; cracksLong: number; cracksTrans: number;
  alligator: number; rutting: number; raveling: number; edgeBreak: number; patches: number;
}

/* ════════════════════════════════════════════════════════════════
   RECALC TOAST  
   ════════════════════════════════════════════════════════════════ */

function RecalcToast({ oldScore, newScore, oldBand, newBand, roadName, onClose }: {
  oldScore: number; newScore: number; oldBand: Band; newBand: Band; roadName: string; onClose: () => void;
}) {
  const improved = newScore > oldScore;
  const oldCondition = oldScore >= 80 ? "Good" : oldScore >= 60 ? "Fair" : oldScore >= 40 ? "Poor" : "Critical";
  const newCondition = newScore >= 80 ? "Good" : newScore >= 60 ? "Fair" : newScore >= 40 ? "Poor" : "Critical";
  return (
    <div className="fixed top-24 right-6 z-50" style={{ animation: "slideInRight 0.4s ease-out" }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 w-[340px]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-bold text-gray-900">
            <CheckCircle2 size={14} className="inline mr-1 text-green-500 -mt-0.5" />
            Inspection Recorded!
          </p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
        <p className="text-[11px] text-gray-400 mb-3 truncate">{roadName}</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">CIBIL Score</span>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold" style={{ color: cibilColor(oldScore) }}>{oldScore.toFixed(1)}</span>
              <span className="text-[11px] text-gray-400">→</span>
              <span className="text-[13px] font-bold" style={{ color: cibilColor(newScore) }}>
                {newScore.toFixed(1)}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${improved ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {improved ? "↑" : "↓"} {Math.abs(newScore - oldScore).toFixed(1)}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Condition</span>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border"
                style={conditionCfg(oldCondition)}>{oldCondition}</span>
              <span className="text-[11px] text-gray-400">→</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border"
                style={conditionCfg(newCondition)}>{newCondition}</span>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-3">Queue re-sorted. Next inspection auto-scheduled.</p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   EXPANDED ROW — Tabbed detail view  
   ════════════════════════════════════════════════════════════════ */

function ExpandedDetail({ item }: { item: ScheduledInspection }) {
  const [tab, setTab] = useState<"overview" | "distress" | "risk" | "history">("overview");
  const road = item.road;

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: <Info size={11} /> },
    { key: "distress" as const, label: "Distress Analysis", icon: <BarChart3 size={11} /> },
    { key: "risk" as const,     label: "Risk Factors", icon: <Shield size={11} /> },
    { key: "history" as const,  label: "Inspection History", icon: <History size={11} /> },
  ];

  return (
    <div style={{ background: "#f8fafc", padding: "16px 20px" }}>
      {/* Tab Bar */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 pb-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-[11px] font-semibold transition-all ${tab === t.key ? "text-orange-700 border-b-2 border-orange-500" : "text-gray-400 hover:text-gray-600"}`}
            style={tab === t.key ? { background: "white" } : undefined}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div>
            <h4 className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2">Scheduling</h4>
            <div className="space-y-1.5 text-[11px]">
              <p><span className="text-gray-400 w-24 inline-block">Base Interval:</span> <span className="font-semibold text-gray-700">{item.baseIntervalDays}d</span></p>
              <p><span className="text-gray-400 w-24 inline-block">Adjusted:</span> <span className="font-semibold text-gray-700">{item.adjustedIntervalDays}d</span></p>
              <p><span className="text-gray-400 w-24 inline-block">Last Inspection:</span> <span className="font-semibold text-gray-700">{fmt(item.lastInspectionDate)}</span></p>
              <p><span className="text-gray-400 w-24 inline-block">Agency:</span> <span className="font-semibold text-gray-700">{item.assignedAgency}</span></p>
              <p><span className="text-gray-400 w-24 inline-block">Quarter:</span> <span className="font-semibold text-gray-700">{item.quarterLabel}</span></p>
            </div>
          </div>
          <div>
            <h4 className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2">Condition</h4>
            <div className="space-y-1.5 text-[11px]">
              <p><span className="text-gray-400 w-24 inline-block">CIBIL:</span> <span className="font-bold" style={{ color: cibilColor(road.healthScore.finalCibilScore) }}>{road.healthScore.finalCibilScore.toFixed(0)}</span></p>
              <p><span className="text-gray-400 w-24 inline-block">Category:</span> <span className="font-semibold text-gray-700">{road.healthScore.conditionCategory}</span></p>
              <p><span className="text-gray-400 w-24 inline-block">PDI:</span> <span className="font-semibold text-gray-700">{road.healthScore.pdi.toFixed(1)}</span></p>
              <p><span className="text-gray-400 w-24 inline-block">IRI:</span> <span className="font-semibold text-gray-700">{road.iri_value}</span></p>
              <p><span className="text-gray-400 w-24 inline-block">Distress:</span> <span className="font-semibold">{item.distressSeverity.toFixed(1)}%</span></p>
            </div>
          </div>
          <div>
            <h4 className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2">Road Info</h4>
            <div className="space-y-1.5 text-[11px]">
              <p><span className="text-gray-400">Ref:</span> <span className="font-semibold">{road.highway_ref}</span></p>
              <p><span className="text-gray-400">Surface:</span> <span className="font-semibold">{road.surface_type}</span></p>
              <p><span className="text-gray-400">Lanes:</span> <span className="font-semibold">{road.lane_count}</span></p>
              <p><span className="text-gray-400">Terrain:</span> <span className="font-semibold">{road.terrain_type} / {road.slope_category}</span></p>
              <p><span className="text-gray-400">Built:</span> <span className="font-semibold">{road.year_constructed} ({2026 - road.year_constructed}yr old)</span></p>
            </div>
          </div>
          <div>
            <h4 className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2">Traffic</h4>
            <div className="space-y-1.5 text-[11px]">
              <p><span className="text-gray-400">ADT:</span> <span className="font-semibold">{road.avg_daily_traffic.toLocaleString()}</span></p>
              <p><span className="text-gray-400">Trucks:</span> <span className="font-semibold">{road.truck_percentage}%</span></p>
              <p><span className="text-gray-400">Rainfall:</span> <span className="font-semibold">{road.monsoon_rainfall_category}</span></p>
              <p><span className="text-gray-400">Tourism:</span> <span className="font-semibold">{road.tourism_route_flag ? "Yes" : "No"}</span></p>
              <p><span className="text-gray-400">Cost Est:</span> <span className="font-semibold">₹{item.estimatedCostLakhs}L</span></p>
            </div>
          </div>
        </div>
      )}

      {/* Distress Tab */}
      {tab === "distress" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Potholes /km", val: road.potholes_per_km, max: 30, critical: 15, icon: <FileWarning size={12} className="text-red-500" /> },
            { label: "Pothole Depth (cm)", val: road.pothole_avg_depth_cm, max: 20, critical: 10, icon: <Ruler size={12} className="text-orange-500" /> },
            { label: "Longitudinal Cracks %", val: road.cracks_longitudinal_pct, max: 50, critical: 25, icon: <Layers size={12} className="text-yellow-600" /> },
            { label: "Transverse Cracks /km", val: road.cracks_transverse_per_km, max: 30, critical: 15, icon: <Layers size={12} className="text-yellow-600" /> },
            { label: "Alligator Cracking %", val: road.alligator_cracking_pct, max: 50, critical: 20, icon: <AlertTriangle size={12} className="text-red-600" /> },
            { label: "Rutting Depth (mm)", val: road.rutting_depth_mm, max: 40, critical: 20, icon: <Gauge size={12} className="text-red-500" /> },
            { label: "Raveling %", val: road.raveling_pct, max: 50, critical: 25, icon: <Activity size={12} className="text-purple-500" /> },
            { label: "Edge Breaking %", val: road.edge_breaking_pct, max: 50, critical: 25, icon: <Mountain size={12} className="text-amber-600" /> },
            { label: "Patches /km", val: road.patches_per_km, max: 25, critical: 12, icon: <Wrench size={12} className="text-blue-500" /> },
          ].map((d) => {
            const pct = (d.val / d.max) * 100;
            const isCritical = d.val >= d.critical;
            return (
              <div key={d.label} className="rounded-xl border p-3"
                style={{ borderColor: isCritical ? "#fecaca" : "#e5e7eb", background: isCritical ? "#fef2f2" : "white" }}>
                <div className="flex items-center gap-1.5 mb-2">{d.icon}
                  <span className="text-[10px] font-semibold text-gray-600">{d.label}</span>
                  {isCritical && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-red-100 text-red-700">CRITICAL</span>}
                </div>
                <p className="text-[18px] font-bold tabular-nums" style={{ color: isCritical ? "#dc2626" : "#374151" }}>{d.val}</p>
                <div className="mt-1.5 h-2 rounded-full overflow-hidden" style={{ background: "#e5e7eb" }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, pct)}%`, background: pct > 70 ? "#dc2626" : pct > 40 ? "#ea580c" : "#22c55e" }} />
                </div>
                <p className="text-[9px] text-gray-400 mt-1">Threshold: {d.critical} / Max: {d.max}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Risk Tab */}
      {tab === "risk" && (
        <div className="space-y-4">
          {item.riskFactors.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {item.riskFactors.map((rf) => {
                  let icon = <AlertTriangle size={12} className="text-orange-500" />;
                  let bg = "#fff7ed";
                  let border = "#fed7aa";
                  if (rf.includes("Flood")) { icon = <Droplets size={12} className="text-blue-500" />; bg = "#eff6ff"; border = "#bfdbfe"; }
                  if (rf.includes("Landslide") || rf.includes("Ghat")) { icon = <Mountain size={12} className="text-amber-600" />; bg = "#fffbeb"; border = "#fde68a"; }
                  if (rf.includes("rainfall")) { icon = <CloudRain size={12} className="text-indigo-500" />; bg = "#eef2ff"; border = "#c7d2fe"; }
                  if (rf.includes("pothole") || rf.includes("crack")) { icon = <FileWarning size={12} className="text-red-500" />; bg = "#fef2f2"; border = "#fecaca"; }
                  if (rf.includes("truck") || rf.includes("traffic")) { icon = <Truck size={12} className="text-gray-600" />; bg = "#f8fafc"; border = "#e2e8f0"; }
                  return (
                    <div key={rf} className="flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-medium"
                      style={{ background: bg, borderColor: border }}>
                      {icon}<span className="text-gray-700">{rf}</span>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Risk Impact on Schedule</p>
                <div className="text-[11px] text-gray-600 space-y-1">
                  <p>• Base interval: <strong>{item.baseIntervalDays} days</strong></p>
                  <p>• Adjusted interval: <strong>{item.adjustedIntervalDays} days</strong> ({Math.round((1 - item.adjustedIntervalDays / item.baseIntervalDays) * 100)}% reduction due to risks)</p>
                  <p>• Decay rate: <strong>{item.decayRate.toFixed(4)}/day</strong> ({item.decayTrend})</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-gray-400 italic py-4">No additional risk factors identified for this road.</p>
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div>
          {road.inspections.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-400">Date</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-400">Agency</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-400">Score</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-400">Damage %</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-400">Drainage</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-400">Water</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-400">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {road.inspections
                    .sort((a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime())
                    .map((insp) => (
                      <tr key={insp.inspection_id} className="border-b border-gray-100 hover:bg-white/50">
                        <td className="py-2 px-2 font-medium">{new Date(insp.inspection_date).toLocaleDateString("en-IN")}</td>
                        <td className="py-2 px-2">{insp.inspector_agency}</td>
                        <td className="py-2 px-2 font-bold" style={{ color: insp.condition_score < 30 ? "#dc2626" : insp.condition_score < 50 ? "#ea580c" : "#22c55e" }}>
                          {insp.condition_score}
                        </td>
                        <td className="py-2 px-2">{insp.surface_damage_pct}%</td>
                        <td className="py-2 px-2">{insp.drainage_status}</td>
                        <td className="py-2 px-2">{insp.waterlogging_flag ? "🔴 Yes" : "🟢 No"}</td>
                        <td className="py-2 px-2 text-gray-500 max-w-[200px] truncate">{insp.remarks}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <History size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-[12px] text-gray-400">No previous inspections recorded.</p>
              <p className="text-[10px] text-gray-300 mt-1">Click "Record" to enter the first inspection data.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   INSPECTOR DETAIL CARD — Inline detail + scheduling panel
   ════════════════════════════════════════════════════════════════ */

function InspectorDetailCard({
  item,
  onClose,
  onSchedule,
  onRecord,
}: {
  item: ScheduledInspection;
  onClose: () => void;
  onSchedule: (item: ScheduledInspection, date: string, agency: string, type: InspectionType) => void;
  onRecord: (item: ScheduledInspection) => void;
}) {
  const road = item.road;
  const [activeTab, setActiveTab] = useState<"overview" | "distress" | "risk" | "history" | "schedule">("overview");

  // Schedule form state
  const suggestedDate = new Date();
  suggestedDate.setDate(suggestedDate.getDate() + (item.isOverdue ? 1 : Math.min(item.daysUntilDue, 3)));
  const [schedDate, setSchedDate] = useState(suggestedDate.toISOString().split("T")[0]);
  const [schedAgency, setSchedAgency] = useState(item.assignedAgency);
  const [schedType, setSchedType] = useState<InspectionType>("full");
  const [schedTeamLead, setSchedTeamLead] = useState("");
  const [schedTeamSize, setSchedTeamSize] = useState("3");
  const [schedContact, setSchedContact] = useState("");
  const [schedNotes, setSchedNotes] = useState("");
  const [schedSubmitted, setSchedSubmitted] = useState(false);

  // Equipment recommendations
  const equipmentNeeded: string[] = [];
  if (road.potholes_per_km > 10) equipmentNeeded.push("Pothole measuring wheel");
  if (road.rutting_depth_mm > 15) equipmentNeeded.push("Rut depth gauge");
  if (road.iri_value > 6) equipmentNeeded.push("Profilometer");
  if (road.alligator_cracking_pct > 15) equipmentNeeded.push("Crack survey kit");
  if (road.flood_prone) equipmentNeeded.push("Drainage testing equipment");
  if (road.surface_type === "gravel" || road.surface_type === "earthen") equipmentNeeded.push("Soil compaction tester");
  if (equipmentNeeded.length === 0) equipmentNeeded.push("Standard survey kit");

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: <Info size={13} /> },
    { key: "distress" as const, label: "Distress Analysis", icon: <BarChart3 size={13} /> },
    { key: "risk" as const, label: "Risk Factors", icon: <Shield size={13} /> },
    { key: "history" as const, label: "Inspection History", icon: <History size={13} /> },
    { key: "schedule" as const, label: "Schedule Inspection", icon: <CalendarPlus size={13} /> },
  ];

  const pCfg = PRIORITY_CFG[item.priority];
  const aCfg = ACTION_CFG[item.action];

  return (
    <div className="rounded-2xl bg-white border-2 border-orange-200 shadow-xl overflow-hidden" style={{ animation: "fadeSlideUp 0.35s ease-out" }}>
      {/* ── Card Header ── */}
      <div className="relative" style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)" }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url('data:image/svg+xml,...')" }} />
        <div className="relative px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl text-[11px] font-bold text-white shadow-lg"
                  style={{ background: BAND_COLORS[road.healthScore.band] }}>{road.healthScore.band}</span>
                <div>
                  <h2 className="text-[17px] font-bold text-white leading-tight">{road.name}</h2>
                  <p className="text-[11px] text-gray-400">{road.road_id} • {road.highway_ref} • {road.district}, {road.taluka}</p>
                </div>
              </div>
              {/* Quick Metric Pills */}
              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  { label: "CIBIL Score", val: road.healthScore.finalCibilScore.toFixed(0) + "/100", color: cibilColor(road.healthScore.finalCibilScore) },
                  { label: "Condition", val: item.conditionCategory, color: conditionCfg(item.conditionCategory).color },
                  { label: "PDI", val: item.pdi.toFixed(0), color: item.pdi < 30 ? "#ef4444" : "#e2e8f0" },
                  { label: "Trend", val: item.trendAlert ? "⚡ Alert" : "Stable", color: item.trendAlert ? "#dc2626" : "#059669" },
                  { label: "Priority", val: `${item.priorityScore.toFixed(0)} ${pCfg.label}`, color: pCfg.color },
                  { label: "Decay", val: `${item.decayRate.toFixed(3)}/d`, color: item.decayRate > 0.05 ? "#ef4444" : "#94a3b8" },
                ].map((m) => (
                  <div key={m.label} className="px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <p className="text-[9px] font-semibold text-gray-400 uppercase">{m.label}</p>
                    <p className="text-[14px] font-bold" style={{ color: m.color }}>{m.val}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onRecord(item)}
                className="px-3 py-2 rounded-lg text-[11px] font-semibold transition-all hover:shadow-lg"
                style={{ background: "#059669", color: "white" }}>
                <ClipboardCheck size={13} className="inline mr-1 -mt-0.5" />Record Result
              </button>
              <button onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Status Bar */}
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/10">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: aCfg.color }}>  
                {aCfg.icon}{aCfg.label}
              </span>
            </div>
            <div className="w-px h-3 bg-white/20" />
            <span className="text-[10px] text-gray-400">Last: <strong className="text-gray-300">{fmt(item.lastInspectionDate)}</strong></span>
            <div className="w-px h-3 bg-white/20" />
            <span className="text-[10px] text-gray-400">Next Due: <strong className={item.isOverdue ? "text-red-400" : "text-gray-300"}>{fmt(item.nextDueDate)}</strong></span>
            <div className="w-px h-3 bg-white/20" />
            {item.isOverdue ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-[10px] font-bold text-red-400">
                <XCircle size={10} />{item.overdueDays}d overdue
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-[10px] font-bold text-green-400">
                <CheckCircle2 size={10} />{item.daysUntilDue}d remaining
              </span>
            )}
            {item.isScheduled && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-400">
                <Calendar size={10} />Scheduled: {fmt(item.scheduledDate)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="px-6 pt-3 pb-0 border-b border-gray-200" style={{ background: "#fafafa" }}>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-[12px] font-semibold transition-all ${
                activeTab === t.key
                  ? "text-orange-700 bg-white border border-b-0 border-gray-200 -mb-px"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100/50"
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="p-6">
        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Scheduling Info */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <h4 className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 flex items-center gap-1.5">
                  <CalendarClock size={12} className="text-blue-500" />Scheduling
                </h4>
                <div className="space-y-2.5 text-[12px]">
                  <div className="flex justify-between"><span className="text-gray-400">Base Interval</span><span className="font-semibold text-gray-700">{item.baseIntervalDays} days</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Adjusted</span><span className="font-semibold text-gray-700">{item.adjustedIntervalDays} days</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Last Inspection</span><span className="font-semibold text-gray-700">{fmt(item.lastInspectionDate)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Agency</span><span className="font-semibold text-gray-700">{item.assignedAgency}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Quarter</span><span className="font-semibold text-gray-700">{item.quarterLabel}</span></div>
                </div>
              </div>
              {/* Condition Info */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <h4 className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 flex items-center gap-1.5">
                  <Activity size={12} className="text-green-500" />CIBIL Breakdown
                </h4>
                <div className="space-y-2.5 text-[12px]">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Final CIBIL</span>
                    <span className="font-bold text-lg" style={{ color: cibilColor(item.finalCibilScore) }}>{item.finalCibilScore.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-400">Condition</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: conditionCfg(item.conditionCategory).bg, color: conditionCfg(item.conditionCategory).color }}>
                      {item.conditionCategory}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-400">PDI-CIBIL (0.7×)</span><span className="font-semibold text-gray-700">{item.pseudoCibil.toFixed(1)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">ML-CIBIL (0.3×)</span><span className="font-semibold text-gray-700">{item.mlPredictedCibil.toFixed(1)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">PDI</span><span className="font-semibold text-gray-700">{item.pdi.toFixed(1)}</span></div>
                </div>
                {item.trendAlert && (
                  <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-[10px] font-bold text-red-700">⚡ {item.trendAlert}</p>
                  </div>
                )}
              </div>
              {/* Road Info */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <h4 className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 flex items-center gap-1.5">
                  <Navigation size={12} className="text-indigo-500" />Road Info
                </h4>
                <div className="space-y-2.5 text-[12px]">
                  <div className="flex justify-between"><span className="text-gray-400">Hwy Ref</span><span className="font-semibold text-gray-700">{road.highway_ref}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Surface</span><span className="font-semibold text-gray-700 capitalize">{road.surface_type}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Lanes</span><span className="font-semibold text-gray-700">{road.lane_count}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Terrain</span><span className="font-semibold text-gray-700 capitalize">{road.terrain_type} / {road.slope_category}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Built</span><span className="font-semibold text-gray-700">{road.year_constructed} ({2026 - road.year_constructed}yr)</span></div>
                </div>
              </div>
              {/* Traffic & Environment */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <h4 className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 flex items-center gap-1.5">
                  <Truck size={12} className="text-amber-500" />Traffic & Env.
                </h4>
                <div className="space-y-2.5 text-[12px]">
                  <div className="flex justify-between"><span className="text-gray-400">Avg Daily</span><span className="font-semibold text-gray-700">{road.avg_daily_traffic.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Trucks</span><span className="font-semibold text-gray-700">{road.truck_percentage}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Rainfall</span><span className="font-semibold text-gray-700 capitalize">{road.monsoon_rainfall_category}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Tourism</span><span className="font-semibold text-gray-700">{road.tourism_route_flag ? "Yes" : "No"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Est. Cost</span><span className="font-semibold text-orange-600">{"\u20B9"}{item.estimatedCostLakhs}L</span></div>
                </div>
              </div>
            </div>

            {/* Geographic & Flags */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                { label: "Flood Prone", val: road.flood_prone, icon: <Droplets size={14} />, color: "#3b82f6" },
                { label: "Landslide", val: road.landslide_prone, icon: <Mountain size={14} />, color: "#f59e0b" },
                { label: "Ghat Section", val: road.ghat_section_flag, icon: <Globe size={14} />, color: "#8b5cf6" },
                { label: "Tourism Route", val: road.tourism_route_flag, icon: <MapPin size={14} />, color: "#ec4899" },
                { label: "Region", val: road.region_type, icon: <LocateFixed size={14} />, color: "#0891b2" },
                { label: "Elevation", val: `${road.elevation_m}m`, icon: <Thermometer size={14} />, color: "#059669" },
              ].map((f) => (
                <div key={f.label} className="rounded-xl border border-gray-200 p-3 text-center bg-white hover:shadow-sm transition-all">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-1.5" style={{ background: `${f.color}12`, color: f.color }}>{f.icon}</div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">{f.label}</p>
                  <p className="text-[13px] font-bold capitalize" style={{ color: typeof f.val === "boolean" ? (f.val ? "#dc2626" : "#22c55e") : "#374151" }}>
                    {typeof f.val === "boolean" ? (f.val ? "Yes" : "No") : f.val}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Distress Tab */}
        {activeTab === "distress" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-bold text-gray-700">Distress Severity: <span style={{ color: item.distressSeverity > 50 ? "#dc2626" : item.distressSeverity > 30 ? "#ea580c" : "#22c55e" }}>{item.distressSeverity.toFixed(1)}%</span></p>
              <p className="text-[11px] text-gray-400">Threshold values trigger accelerated scheduling</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Potholes /km", val: road.potholes_per_km, max: 30, critical: 15, icon: <FileWarning size={14} className="text-red-500" /> },
                { label: "Pothole Depth (cm)", val: road.pothole_avg_depth_cm, max: 20, critical: 10, icon: <Ruler size={14} className="text-orange-500" /> },
                { label: "Longitudinal Cracks %", val: road.cracks_longitudinal_pct, max: 50, critical: 25, icon: <Layers size={14} className="text-yellow-600" /> },
                { label: "Transverse Cracks /km", val: road.cracks_transverse_per_km, max: 30, critical: 15, icon: <Layers size={14} className="text-yellow-600" /> },
                { label: "Alligator Cracking %", val: road.alligator_cracking_pct, max: 50, critical: 20, icon: <AlertTriangle size={14} className="text-red-600" /> },
                { label: "Rutting Depth (mm)", val: road.rutting_depth_mm, max: 40, critical: 20, icon: <Gauge size={14} className="text-red-500" /> },
                { label: "Raveling %", val: road.raveling_pct, max: 50, critical: 25, icon: <Activity size={14} className="text-purple-500" /> },
                { label: "Edge Breaking %", val: road.edge_breaking_pct, max: 50, critical: 25, icon: <Mountain size={14} className="text-amber-600" /> },
                { label: "Patches /km", val: road.patches_per_km, max: 25, critical: 12, icon: <Wrench size={14} className="text-blue-500" /> },
              ].map((d) => {
                const pct = (d.val / d.max) * 100;
                const isCritical = d.val >= d.critical;
                return (
                  <div key={d.label} className="rounded-xl border p-4 transition-all hover:shadow-sm"
                    style={{ borderColor: isCritical ? "#fecaca" : "#e5e7eb", background: isCritical ? "#fef2f2" : "white" }}>
                    <div className="flex items-center gap-2 mb-2">{d.icon}
                      <span className="text-[11px] font-semibold text-gray-600">{d.label}</span>
                      {isCritical && <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700">CRITICAL</span>}
                    </div>
                    <p className="text-[22px] font-bold tabular-nums" style={{ color: isCritical ? "#dc2626" : "#374151" }}>{d.val}</p>
                    <div className="mt-2 h-2.5 rounded-full overflow-hidden" style={{ background: "#e5e7eb" }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, pct)}%`, background: pct > 70 ? "#dc2626" : pct > 40 ? "#ea580c" : "#22c55e" }} />
                    </div>
                    <p className="text-[9px] text-gray-400 mt-1">Threshold: {d.critical} | Max: {d.max}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Risk Tab */}
        {activeTab === "risk" && (
          <div className="space-y-5">
            {item.riskFactors.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {item.riskFactors.map((rf) => {
                    let icon = <AlertTriangle size={13} className="text-orange-500" />;
                    let bg = "#fff7ed"; let border = "#fed7aa";
                    if (rf.includes("Flood")) { icon = <Droplets size={13} className="text-blue-500" />; bg = "#eff6ff"; border = "#bfdbfe"; }
                    if (rf.includes("Landslide") || rf.includes("Ghat")) { icon = <Mountain size={13} className="text-amber-600" />; bg = "#fffbeb"; border = "#fde68a"; }
                    if (rf.includes("rainfall")) { icon = <CloudRain size={13} className="text-indigo-500" />; bg = "#eef2ff"; border = "#c7d2fe"; }
                    if (rf.includes("pothole") || rf.includes("crack")) { icon = <FileWarning size={13} className="text-red-500" />; bg = "#fef2f2"; border = "#fecaca"; }
                    if (rf.includes("truck") || rf.includes("traffic")) { icon = <Truck size={13} className="text-gray-600" />; bg = "#f8fafc"; border = "#e2e8f0"; }
                    return (
                      <div key={rf} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[12px] font-medium"
                        style={{ background: bg, borderColor: border }}>
                        {icon}<span className="text-gray-700">{rf}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="rounded-xl border border-gray-200 p-5 bg-white">
                  <p className="text-[11px] font-bold text-gray-400 uppercase mb-3">Risk Impact on Schedule</p>
                  <div className="text-[12px] text-gray-600 space-y-2">
                    <p>{"\u2022"} Base interval: <strong>{item.baseIntervalDays} days</strong></p>
                    <p>{"\u2022"} Adjusted interval: <strong>{item.adjustedIntervalDays} days</strong> ({Math.round((1 - item.adjustedIntervalDays / item.baseIntervalDays) * 100)}% reduction)</p>
                    <p>{"\u2022"} Decay rate: <strong>{item.decayRate.toFixed(4)}/day</strong> (<span className={`font-semibold ${item.decayTrend === "accelerating" ? "text-red-600" : item.decayTrend === "improving" ? "text-green-600" : "text-gray-600"}`}>{item.decayTrend}</span>)</p>
                    <p>{"\u2022"} Priority score: <strong>{item.priorityScore.toFixed(1)}</strong> ({pCfg.label})</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-10">
                <Shield size={36} className="text-green-300 mx-auto mb-2" />
                <p className="text-[13px] text-gray-400">No additional risk factors identified.</p>
                <p className="text-[11px] text-gray-300 mt-1">This road has standard scheduling parameters.</p>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div>
            {road.inspections.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-3 font-bold text-gray-500 uppercase text-[10px]">Date</th>
                      <th className="text-left py-3 px-3 font-bold text-gray-500 uppercase text-[10px]">Agency</th>
                      <th className="text-left py-3 px-3 font-bold text-gray-500 uppercase text-[10px]">Score</th>
                      <th className="text-left py-3 px-3 font-bold text-gray-500 uppercase text-[10px]">Damage %</th>
                      <th className="text-left py-3 px-3 font-bold text-gray-500 uppercase text-[10px]">Drainage</th>
                      <th className="text-left py-3 px-3 font-bold text-gray-500 uppercase text-[10px]">Water</th>
                      <th className="text-left py-3 px-3 font-bold text-gray-500 uppercase text-[10px]">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {road.inspections
                      .sort((a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime())
                      .map((insp) => (
                        <tr key={insp.inspection_id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                          <td className="py-3 px-3 font-medium">{new Date(insp.inspection_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                          <td className="py-3 px-3">{insp.inspector_agency}</td>
                          <td className="py-3 px-3 font-bold" style={{ color: insp.condition_score < 30 ? "#dc2626" : insp.condition_score < 50 ? "#ea580c" : "#22c55e" }}>
                            {insp.condition_score}
                          </td>
                          <td className="py-3 px-3">{insp.surface_damage_pct}%</td>
                          <td className="py-3 px-3 capitalize">{insp.drainage_status}</td>
                          <td className="py-3 px-3">{insp.waterlogging_flag ? "\ud83d\udd34 Yes" : "\ud83d\udfe2 No"}</td>
                          <td className="py-3 px-3 text-gray-500 max-w-[250px] truncate">{insp.remarks}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <History size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-[14px] font-semibold text-gray-500">No Previous Inspections</p>
                <p className="text-[12px] text-gray-400 mt-1">Click \"Record Result\" to enter the first inspection data.</p>
              </div>
            )}
          </div>
        )}

        {/* Schedule Tab — Inspector Form */}
        {activeTab === "schedule" && (
          <div className="space-y-6">
            {schedSubmitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} className="text-green-600" />
                </div>
                <h3 className="text-[18px] font-bold text-gray-900">Inspection Scheduled Successfully!</h3>
                <p className="text-[13px] text-gray-500 mt-2">Road: {road.name}</p>
                <p className="text-[12px] text-gray-400 mt-1">Date: {new Date(schedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })} | Agency: {schedAgency} | Type: {schedType}</p>
                <button onClick={() => { setSchedSubmitted(false); setActiveTab("overview"); }}
                  className="mt-5 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition">
                  Back to Overview
                </button>
              </div>
            ) : (
              <>
                {/* AI Recommendation Banner */}
                <div className="rounded-xl border-2 border-orange-200 p-5" style={{ background: "linear-gradient(135deg, #fffbeb, #fff7ed)" }}>
                  <p className="text-[12px] font-bold text-orange-800 mb-2 flex items-center gap-1.5">
                    <Zap size={14} className="text-orange-500" /> CIBIL-Driven Scheduling Recommendation
                  </p>
                  <p className="text-[13px] text-orange-900 leading-relaxed">
                    {item.isOverdue
                      ? `⚠️ This road is ${item.overdueDays} days overdue. CIBIL: ${item.finalCibilScore.toFixed(0)} (${item.conditionCategory}). PDI: ${item.pdi.toFixed(0)}. Recommend immediate inspection within 1-2 days.${item.decayRate > 0.05 ? ` Deteriorating at ${item.decayRate.toFixed(3)}/day — delay risks structural failure.` : ""}`
                      : item.daysUntilDue <= 7
                        ? `Due in ${item.daysUntilDue} days. CIBIL ${item.finalCibilScore.toFixed(0)} — ${item.conditionCategory}. Schedule this week to maintain compliance.`
                        : `Due in ${item.daysUntilDue} days. CIBIL ${item.finalCibilScore.toFixed(0)} — ${item.conditionCategory}. CIBIL-tier interval: ${item.cibilDrivenDueDays} days.`
                    }
                  </p>
                  {item.trendAlert && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-red-100 border border-red-300">
                      <p className="text-[11px] font-bold text-red-800">⚡ Trend Alert: {item.trendAlert}</p>
                    </div>
                  )}
                  {item.riskFactors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {item.riskFactors.slice(0, 4).map((rf) => (
                        <span key={rf} className="px-2 py-1 rounded-md bg-orange-100 border border-orange-200 text-[10px] font-medium text-orange-700">{rf}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Equipment Needed */}
                <div className="rounded-xl border border-blue-200 p-4" style={{ background: "#eff6ff" }}>
                  <p className="text-[12px] font-bold text-blue-700 mb-2 flex items-center gap-1.5">
                    <Wrench size={13} /> Recommended Equipment
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {equipmentNeeded.map((eq) => (
                      <span key={eq} className="px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 text-[11px] font-medium text-blue-700 shadow-sm">{eq}</span>
                    ))}
                  </div>
                </div>

                {/* Inspector Details Form */}
                <div className="rounded-xl border border-gray-200 p-5 bg-white">
                  <h4 className="text-[13px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <User size={15} className="text-orange-500" /> Inspector / Engineer Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Team Lead Name *</label>
                      <div className="relative">
                        <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" value={schedTeamLead} onChange={(e) => setSchedTeamLead(e.target.value)}
                          placeholder="e.g. Eng. Rajesh Patil"
                          className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Contact Number</label>
                      <div className="relative">
                        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="tel" value={schedContact} onChange={(e) => setSchedContact(e.target.value)}
                          placeholder="e.g. +91 98765 43210"
                          className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Assign Agency *</label>
                      <div className="relative">
                        <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <select value={schedAgency} onChange={(e) => setSchedAgency(e.target.value)}
                          className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 text-[13px] bg-white focus:outline-none focus:border-orange-400 appearance-none cursor-pointer">
                          <option>NHAI</option><option>State PWD</option><option>Municipality</option><option>PMGSY</option><option>ThirdParty</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Team Size</label>
                      <select value={schedTeamSize} onChange={(e) => setSchedTeamSize(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[13px] bg-white focus:outline-none focus:border-orange-400 appearance-none cursor-pointer">
                        {[2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} members</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Schedule Details Form */}
                <div className="rounded-xl border border-gray-200 p-5 bg-white">
                  <h4 className="text-[13px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Calendar size={15} className="text-blue-500" /> Schedule Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Inspection Date *</label>
                      <input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Estimated Duration</label>
                      <select className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[13px] bg-white focus:outline-none focus:border-orange-400">
                        <option>Half Day (4 hours)</option><option>Full Day (8 hours)</option><option>2 Days</option><option>3+ Days</option>
                      </select>
                    </div>
                  </div>

                  {/* Inspection Type Selection */}
                  <div className="mb-4">
                    <label className="text-[11px] font-semibold text-gray-500 mb-2 block">Inspection Type *</label>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { key: "full" as InspectionType, label: "Full Inspection", desc: "Complete survey with all equipment. All 9 distress metrics measured.", icon: <Clipboard size={18} /> },
                        { key: "quick" as InspectionType, label: "Quick Check", desc: "Visual inspection + PCI & IRI. Key metrics only.", icon: <Eye size={18} /> },
                        { key: "monsoon_special" as InspectionType, label: "Monsoon Special", desc: "Drainage, waterlogging & flood damage focus.", icon: <CloudRain size={18} /> },
                      ]).map((t) => (
                        <button key={t.key} onClick={() => setSchedType(t.key)}
                          className={`p-4 rounded-xl text-left border-2 transition-all ${schedType === t.key ? "border-orange-400 shadow-md" : "border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}
                          style={schedType === t.key ? { background: "#fff7ed" } : undefined}>
                          <div className={`mb-2 ${schedType === t.key ? "text-orange-500" : "text-gray-400"}`}>{t.icon}</div>
                          <p className={`text-[12px] font-bold ${schedType === t.key ? "text-orange-700" : "text-gray-600"}`}>{t.label}</p>
                          <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">{t.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Special Instructions / Notes</label>
                    <textarea value={schedNotes} onChange={(e) => setSchedNotes(e.target.value)} rows={3}
                      placeholder="Any special instructions for the inspection team, access routes, safety precautions, or specific areas to focus on..."
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none transition" />
                  </div>
                </div>

                {/* Summary & Submit */}
                <div className="rounded-xl border-2 border-orange-200 p-5" style={{ background: "#fffbeb" }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-[13px] font-bold text-gray-800 mb-3">Schedule Summary</h4>
                      <div className="text-[12px] text-gray-600 space-y-1.5">
                        <p><strong>Road:</strong> {road.name} ({road.road_id})</p>
                        <p><strong>Date:</strong> {new Date(schedDate).toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
                        <p><strong>Type:</strong> {schedType === "full" ? "Full Inspection" : schedType === "quick" ? "Quick Check" : "Monsoon Special"}</p>
                        <p><strong>Agency:</strong> {schedAgency} | <strong>Team:</strong> {schedTeamLead || "TBD"} ({schedTeamSize} members)</p>
                        <p><strong>Est. Cost:</strong> {"\u20B9"}{item.estimatedCostLakhs}L</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onSchedule(item, schedDate, schedAgency, schedType);
                        setSchedSubmitted(true);
                      }}
                      className="px-6 py-3 rounded-xl text-[14px] font-bold text-white shadow-lg hover:shadow-xl transition-all"
                      style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
                      <Send size={15} className="inline mr-2 -mt-0.5" />
                      Confirm & Schedule
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT  
   ════════════════════════════════════════════════════════════════ */

interface Props {
  roads: RoadWithScore[];
}

export default function InspectionScheduler({ roads }: Props) {
  const [monsoonMode, setMonsoonMode] = useState(false);
  const [localRoads, setLocalRoads] = useState(roads);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<InspectionPriority | "all">("all");
  const [actionFilter, setActionFilter] = useState<ActionType | "all">("all");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "overdue" | "this_week" | "this_month">("all");
  const [conditionFilter, setConditionFilter] = useState<"all" | "Critical" | "Poor" | "Fair" | "Good">("all");
  const [sortKey, setSortKey] = useState<"priority" | "dueDate" | "cibil" | "decay" | "pci">("priority");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [scheduleModal, setScheduleModal] = useState<ScheduledInspection | null>(null);
  const [recordModal, setRecordModal] = useState<ScheduledInspection | null>(null);
  const [toast, setToast] = useState<{ oldScore: number; newScore: number; oldBand: Band; newBand: Band; roadName: string } | null>(null);
  const [selectedItem, setSelectedItem] = useState<ScheduledInspection | null>(null);
  const detailCardRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  // Generate schedule
  const schedule = useMemo(() => generateInspectionSchedule(localRoads, monsoonMode), [localRoads, monsoonMode]);
  const summary = useMemo(() => computeScheduleSummary(schedule), [schedule]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = schedule;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.road.road_id.toLowerCase().includes(q) ||
        s.road.name.toLowerCase().includes(q) ||
        s.road.district.toLowerCase().includes(q) ||
        s.road.highway_ref.toLowerCase().includes(q)
      );
    }
    if (priorityFilter !== "all") list = list.filter((s) => s.priority === priorityFilter);
    if (actionFilter !== "all") list = list.filter((s) => s.action === actionFilter);
    if (conditionFilter !== "all") list = list.filter((s) => s.conditionCategory === conditionFilter);
    if (urgencyFilter === "overdue") list = list.filter((s) => s.isOverdue);
    else if (urgencyFilter === "this_week") list = list.filter((s) => s.isOverdue || s.daysUntilDue <= 7);
    else if (urgencyFilter === "this_month") list = list.filter((s) => s.isOverdue || s.daysUntilDue <= 30);

    const sorted = [...list];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "priority": cmp = b.priorityScore - a.priorityScore; break;
        case "dueDate": cmp = a.daysUntilDue - b.daysUntilDue; break;
        case "cibil": cmp = a.finalCibilScore - b.finalCibilScore; break;
        case "decay": cmp = b.decayRate - a.decayRate; break;
        case "pci": cmp = a.road.pci_score - b.road.pci_score; break;
      }
      return sortAsc ? -cmp : cmp;
    });
    return sorted;
  }, [schedule, search, priorityFilter, actionFilter, conditionFilter, urgencyFilter, sortKey, sortAsc]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  // Schedule handler
  const handleScheduleConfirm = useCallback((date: string, agency: string, type: InspectionType, _team: string, _notes: string) => {
    if (!scheduleModal) return;
    scheduleModal.isScheduled = true;
    scheduleModal.scheduledDate = new Date(date);
    scheduleModal.scheduledAgency = agency;
    scheduleModal.scheduledType = type;
    setScheduleModal(null);
  }, [scheduleModal]);

  // Record inspection handler  
  const handleRecordSubmit = useCallback((data: RecordData) => {
    if (!recordModal) return;

    // Update distress metrics on the road before recalculating
    const updatedRoadWithDistress: RoadWithScore = {
      ...recordModal.road,
      potholes_per_km: data.potholes,
      pothole_avg_depth_cm: data.potholeDepth,
      cracks_longitudinal_pct: data.cracksLong,
      cracks_transverse_per_km: data.cracksTrans,
      alligator_cracking_pct: data.alligator,
      rutting_depth_mm: data.rutting,
      raveling_pct: data.raveling,
      edge_breaking_pct: data.edgeBreak,
      patches_per_km: data.patches,
    };

    const result = recalculateAfterInspection(
      updatedRoadWithDistress, data.conditionScore, data.surfaceDmg,
      data.waterlog, data.drainage, data.remarks, data.agency
    );

    setLocalRoads((prev) =>
      prev.map((r) => r.road_id === result.updatedRoad.road_id ? result.updatedRoad : r)
    );

    setRecordModal(null);
    setToast({
      oldScore: result.oldScore, newScore: result.newHealthScore,
      oldBand: result.oldBand, newBand: result.newBand, roadName: recordModal.road.name,
    });
    setTimeout(() => setToast(null), 6000);
  }, [recordModal]);

  // Export
  const handleExport = () => {
    const headers = ["Road ID","Name","District","CIBIL Score","Condition","PDI","Priority Score","Priority","Last Inspection","Next Due","Days","Overdue","Action","Agency","Decay Rate","Trend Alert","Risk Factors","Est Cost (₹L)"];
    const rows = [headers.join(",")];
    filtered.forEach((s) => {
      rows.push([
        s.road.road_id, `"${s.road.name}"`, s.road.district,
        s.finalCibilScore.toFixed(1), s.conditionCategory, s.pdi.toFixed(1),
        s.priorityScore.toFixed(0), s.priority,
        s.lastInspectionDate ? s.lastInspectionDate.toISOString().split("T")[0] : "Never",
        s.nextDueDate.toISOString().split("T")[0], s.daysUntilDue, s.isOverdue ? "Yes" : "No",
        ACTION_CFG[s.action].label, s.assignedAgency, s.decayRate.toFixed(4),
        `"${s.trendAlert || "None"}"`,
        `"${s.riskFactors.join("; ")}"`, s.estimatedCostLakhs,
      ].join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `inspection_schedule_${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && <RecalcToast {...toast} onClose={() => setToast(null)} />}

      {/* ═══ SUMMARY DASHBOARD ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Roads"    value={summary.total.toLocaleString()}           icon={<MapPin size={16} />}       color="#2563eb" bg="#eff6ff" />
        <StatCard label="Overdue"        value={summary.overdue.toLocaleString()}          sub="Need immediate action"  icon={<XCircle size={16} />}      color="#dc2626" bg="#fef2f2" />
        <StatCard label="Due This Week"  value={summary.dueThisWeek.toLocaleString()}      icon={<Timer size={16} />}        color="#ea580c" bg="#fff7ed" />
        <StatCard label="Avg CIBIL"      value={summary.avgCibilScore.toFixed(0)}          sub="Fleet health score"     icon={<Gauge size={16} />}         color={cibilColor(summary.avgCibilScore)} bg={cibilBg(summary.avgCibilScore)} />
        <StatCard label="Critical + Poor" value={(( summary.byCondition["Critical"] || 0) + (summary.byCondition["Poor"] || 0)).toLocaleString()} sub="Need intervention" icon={<AlertTriangle size={16} />} color="#991b1b" bg="#fef2f2" />
        <StatCard label="Est. Cost"      value={`₹${(summary.totalEstimatedCost / 100).toFixed(0)}Cr`} sub={`₹${summary.totalEstimatedCost.toLocaleString()}L`} icon={<Shield size={16} />} color="#0891b2" bg="#ecfeff" />
      </div>

      {/* ═══ CIBIL CONDITION BREAKDOWN ═══ */}
      <div className="grid grid-cols-4 gap-3">
        {(["Critical","Poor","Fair","Good"] as const).map((cat) => {
          const cfg = conditionCfg(cat);
          const count = summary.byCondition[cat] || 0;
          const pct = summary.total > 0 ? ((count / summary.total) * 100).toFixed(1) : "0";
          return (
            <div key={cat} className="rounded-2xl border-2 p-4 flex items-center gap-4 hover:shadow-md transition-all"
              style={{ borderColor: cfg.border, background: cfg.bg }}>
              <div className="flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{cat}</p>
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: cfg.color }}>{count.toLocaleString()}</p>
                <p className="text-[10px] font-semibold text-gray-400 mt-0.5">{pct}% of fleet</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${cfg.color}18`, color: cfg.color }}>
                {cat === "Critical" ? <Zap size={18} /> : cat === "Poor" ? <AlertTriangle size={18} /> : cat === "Fair" ? <Activity size={18} /> : <CheckCircle2 size={18} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ ACTION BAR + MONSOON TOGGLE ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Action Distribution */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-gray-200 p-4">
          <h3 className="text-[12px] font-bold text-gray-600 mb-3 uppercase tracking-wider">Action Distribution</h3>
          <div className="flex rounded-xl overflow-hidden h-7">
            {(Object.keys(summary.byAction) as ActionType[]).map((action) => {
              const count = summary.byAction[action];
              if (!count) return null;
              const pct = (count / summary.total) * 100;
              return (
                <div key={action}
                  className="flex items-center justify-center text-white text-[9px] font-bold cursor-pointer transition-all hover:opacity-80"
                  onClick={() => setActionFilter(actionFilter === action ? "all" : action)}
                  style={{ width: `${pct}%`, background: ACTION_CFG[action].color, minWidth: pct > 3 ? 0 : 2 }}
                  title={`${ACTION_CFG[action].label}: ${count} — Click to filter`}>
                  {pct > 10 && count}
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-2.5 flex-wrap">
            {(Object.keys(summary.byAction) as ActionType[]).map((action) => {
              const count = summary.byAction[action];
              if (!count) return null;
              const isActive = actionFilter === action;
              return (
                <button key={action} onClick={() => setActionFilter(isActive ? "all" : action)}
                  className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md transition-all ${isActive ? "ring-2 ring-orange-400 bg-orange-50" : "hover:bg-gray-50"}`}>
                  <div className="w-2 h-2 rounded-sm" style={{ background: ACTION_CFG[action].color }} />
                  <span className="text-gray-500 font-medium">{ACTION_CFG[action].label}</span>
                  <span className="text-gray-400 font-bold">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Monsoon Toggle */}
        <div className="rounded-2xl border p-4 transition-all" style={{
          background: monsoonMode ? "linear-gradient(135deg, #0c4a6e, #164e63)" : "#ffffff",
          borderColor: monsoonMode ? "#06b6d4" : "#e5e7eb",
        }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CloudLightning size={18} className={monsoonMode ? "text-cyan-300" : "text-gray-400"} />
              <h3 className={`text-[13px] font-bold ${monsoonMode ? "text-white" : "text-gray-700"}`}>Monsoon Mode</h3>
            </div>
            <button onClick={() => { setMonsoonMode(!monsoonMode); setPage(0); }}
              className={`relative w-12 h-6 rounded-full transition-all ${monsoonMode ? "bg-cyan-400" : "bg-gray-300"}`}>
              <span className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
                style={{ left: monsoonMode ? 26 : 4 }} />
            </button>
          </div>
          <p className={`text-[11px] leading-relaxed ${monsoonMode ? "text-cyan-200" : "text-gray-400"}`}>
            {monsoonMode
              ? "Active — High-rainfall, flood-prone & ghat roads get accelerated schedules. Queue re-prioritized."
              : "Activate to simulate monsoon-season scheduling with tightened inspection intervals."
            }
          </p>
          {monsoonMode && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.1)" }}>
                <p className="text-[10px] text-cyan-300 font-semibold">Affected Roads</p>
                <p className="text-[15px] font-bold text-white">
                  {schedule.filter((s) => getMonsoonMultiplier(s.road, true) < 0.9).length}
                </p>
              </div>
              <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.1)" }}>
                <p className="text-[10px] text-cyan-300 font-semibold">New Overdue</p>
                <p className="text-[15px] font-bold text-white">{summary.overdue}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ FILTERS ═══ */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search road ID, name, district, highway ref…"
              className="w-full pl-9 pr-3 h-9 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
          </div>
          <div className="flex gap-1">
            {([["all", "All"], ["overdue", "Overdue"], ["this_week", "This Week"], ["this_month", "This Month"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => { setUrgencyFilter(val); setPage(0); }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${urgencyFilter === val ? "bg-orange-50 border-orange-300 text-orange-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                {label}
              </button>
            ))}
          </div>
          <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value as InspectionPriority | "all"); setPage(0); }}
            className="h-9 px-3 rounded-lg border border-gray-200 text-[11px] font-medium text-gray-600 bg-white focus:outline-none focus:border-orange-400">
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option><option value="high">High</option>
            <option value="medium">Medium</option><option value="low">Low</option>
          </select>
          <select value={conditionFilter} onChange={(e) => { setConditionFilter(e.target.value as typeof conditionFilter); setPage(0); }}
            className="h-9 px-3 rounded-lg border border-gray-200 text-[11px] font-medium text-gray-600 bg-white focus:outline-none focus:border-orange-400">
            <option value="all">All Conditions</option>
            <option value="Critical">🔴 Critical</option>
            <option value="Poor">🟠 Poor</option>
            <option value="Fair">🟡 Fair</option>
            <option value="Good">🟢 Good</option>
          </select>
          <button onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-gray-200 bg-white text-gray-500 text-[11px] font-medium hover:bg-gray-50 transition-all">
            <Download size={13} />Export
          </button>
          <span className="text-[10px] text-gray-400 font-medium">{filtered.length.toLocaleString()} of {schedule.length.toLocaleString()}</span>
        </div>
      </div>

      {/* ═══ PRIORITY QUEUE TABLE ═══ */}
      <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="registry-table w-full">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th style={{ width: 32 }} />
                <th>Road</th>
                <th>District</th>
                <th className="cursor-pointer select-none" onClick={() => toggleSort("cibil")}>
                  <span className="inline-flex items-center gap-1">CIBIL <ArrowUpDown size={10} className="text-gray-400" /></span>
                </th>
                <th>Condition</th>
                <th className="cursor-pointer select-none" onClick={() => toggleSort("priority")}>
                  <span className="inline-flex items-center gap-1">Priority <ArrowUpDown size={10} className="text-gray-400" /></span>
                </th>
                <th className="cursor-pointer select-none" onClick={() => toggleSort("dueDate")}>
                  <span className="inline-flex items-center gap-1">Next Due <ArrowUpDown size={10} className="text-gray-400" /></span>
                </th>
                <th>Status</th>
                <th className="cursor-pointer select-none" onClick={() => toggleSort("decay")}>
                  <span className="inline-flex items-center gap-1">Decay <ArrowUpDown size={10} className="text-gray-400" /></span>
                </th>
                <th>Action</th>
                <th>Inspector Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item, idx) => {
                const pCfg = PRIORITY_CFG[item.priority];
                const aCfg = ACTION_CFG[item.action];
                const expanded = expandedRow === item.road.road_id;
                const rank = page * PAGE_SIZE + idx + 1;

                return (
                  <Fragment key={item.road.road_id}>
                    <tr onClick={() => {
                      setExpandedRow(expanded ? null : item.road.road_id);
                      setSelectedItem(item);
                      setTimeout(() => detailCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                    }}
                      className={`group cursor-pointer ${selectedItem?.road.road_id === item.road.road_id ? "ring-2 ring-orange-400 ring-inset" : ""}`}
                      style={item.isScheduled ? { background: "#f0fdf4" } : selectedItem?.road.road_id === item.road.road_id ? { background: "#fff7ed" } : undefined}>
                      <td className="text-[11px] font-bold text-gray-400 text-center">{rank}</td>
                      <td className="text-center">
                        {expanded
                          ? <ChevronUp size={13} className="text-orange-500 mx-auto" />
                          : <ChevronDown size={13} className="text-gray-400 mx-auto group-hover:text-orange-400 transition" />}
                      </td>
                      <td>
                        <p className="text-[12px] font-semibold text-gray-900 truncate max-w-[180px]">{item.road.name}</p>
                        <p className="text-[10px] text-gray-400">{item.road.road_id}</p>
                      </td>
                      <td className="text-[11px] text-gray-600">{item.road.district}</td>
                      <td>
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="text-[15px] font-extrabold tabular-nums leading-tight"
                            style={{ color: cibilColor(item.finalCibilScore) }}>{item.finalCibilScore.toFixed(0)}</span>
                          <span className="text-[9px] font-semibold text-gray-400">/ 100</span>
                        </div>
                      </td>
                      <td>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: conditionCfg(item.conditionCategory).bg, color: conditionCfg(item.conditionCategory).color,
                            border: `1px solid ${conditionCfg(item.conditionCategory).border}` }}>
                          {item.conditionCategory}
                        </span>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ color: pCfg.color, background: pCfg.bg, border: `1px solid ${pCfg.border}` }}>
                          {item.priorityScore.toFixed(0)} {pCfg.label}
                        </span>
                      </td>
                      <td className="text-[11px] font-medium">
                        <span className={item.isOverdue ? "text-red-600" : "text-gray-600"}>{fmt(item.nextDueDate)}</span>
                      </td>
                      <td>
                        {item.isScheduled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-[10px] font-bold text-green-700">
                            <CheckCircle2 size={10} />Scheduled
                          </span>
                        ) : item.isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[10px] font-bold text-red-700">
                            <XCircle size={10} />{item.overdueDays}d overdue
                          </span>
                        ) : item.daysUntilDue <= 7 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-700">
                            <Clock size={10} />{item.daysUntilDue}d
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-[10px] font-bold text-green-700">
                            <CheckCircle2 size={10} />{item.daysUntilDue}d
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {item.decayTrend === "accelerating" ? <TrendingDown size={12} className="text-red-500" />
                            : item.decayTrend === "improving" ? <TrendingUp size={12} className="text-green-500" />
                            : <Minus size={12} className="text-gray-400" />}
                          <span className="text-[11px] font-mono tabular-nums"
                            style={{ color: item.decayRate > 0.05 ? "#dc2626" : item.decayRate > 0.02 ? "#ea580c" : "#6b7280" }}>
                            {item.decayRate.toFixed(3)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: aCfg.color }}>
                          {aCfg.icon}{aCfg.label}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1.5">
                          <button onClick={() => setScheduleModal(item)}
                            className="px-2.5 py-1.5 rounded-md text-[10px] font-semibold border transition-all hover:shadow-sm"
                            style={{ borderColor: "#fed7aa", color: "#c2410c", background: "#fff7ed" }}
                            title="Schedule an inspection for this road">
                            <CalendarPlus size={11} className="inline mr-0.5 -mt-0.5" />Schedule
                          </button>
                          <button onClick={() => setRecordModal(item)}
                            className="px-2.5 py-1.5 rounded-md text-[10px] font-semibold border transition-all hover:shadow-sm"
                            style={{ borderColor: "#bbf7d0", color: "#15803d", background: "#f0fdf4" }}
                            title="Record inspection results with distress metrics">
                            <ClipboardCheck size={11} className="inline mr-0.5 -mt-0.5" />Record
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Row */}
                    {expanded && (
                      <tr key={`${item.road.road_id}-detail`}>
                        <td colSpan={12} style={{ padding: 0 }}>
                          <ExpandedDetail item={item} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-[11px] text-gray-400">Page {page + 1} of {totalPages} ({filtered.length.toLocaleString()} results)</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Prev</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page < 3 ? i : page - 2 + i;
                if (p >= totalPages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded-lg text-[11px] font-semibold transition-all ${p === page ? "text-white shadow-sm" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    style={p === page ? { background: "#f97316" } : undefined}>{p + 1}</button>
                );
              })}
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page === totalPages - 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ INSPECTOR DETAIL CARD ═══ */}
      {selectedItem && (
        <div ref={detailCardRef} className="scroll-mt-24">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#fff7ed" }}>
              <User size={18} className="text-orange-500" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Inspector / Engineer Panel</h2>
              <p className="text-[11px] text-gray-400">Select a road from the table above to view details and schedule inspection</p>
            </div>
          </div>
          <InspectorDetailCard
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSchedule={(it, date, agency, type) => {
              it.isScheduled = true;
              it.scheduledDate = new Date(date);
              it.scheduledAgency = agency;
              it.scheduledType = type;
            }}
            onRecord={(it) => setRecordModal(it)}
          />
        </div>
      )}

      {/* ═══ MODALS ═══ */}
      {scheduleModal && <ScheduleModal item={scheduleModal} onClose={() => setScheduleModal(null)} onConfirm={handleScheduleConfirm} />}
      {recordModal && <RecordModal item={recordModal} onClose={() => setRecordModal(null)} onSubmit={handleRecordSubmit} />}

      {/* Inline Keyframes */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
