"use client";

import { useMemo, useState } from "react";
import {
  ScheduledInspection,
  ScheduleSummary,
  InspectionPriority,
  ActionType,
  generateInspectionSchedule,
  computeScheduleSummary,
} from "@/lib/scheduler";
import { RoadWithScore, Band } from "@/lib/types";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  ArrowUpDown,
  Shield,
  Truck,
  Droplets,
  Mountain,
  CloudRain,
  MapPin,
  Activity,
  CheckCircle2,
  XCircle,
  Download,
} from "lucide-react";

/* ─── Constants & Helpers ─────────────────────────────────────── */

const PRIORITY_CONFIG: Record<
  InspectionPriority,
  { label: string; color: string; bg: string; border: string }
> = {
  critical: { label: "Critical", color: "#991b1b", bg: "#fef2f2", border: "#fecaca" },
  high: { label: "High", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  medium: { label: "Medium", color: "#a16207", bg: "#fefce8", border: "#fef08a" },
  low: { label: "Low", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
};

const ACTION_CONFIG: Record<
  ActionType,
  { label: string; icon: string; color: string }
> = {
  emergency_repair: { label: "Emergency Repair", icon: "🚨", color: "#dc2626" },
  urgent_inspection: { label: "Urgent Inspection", icon: "⚠️", color: "#ea580c" },
  routine_inspection: { label: "Routine Inspection", icon: "🔍", color: "#2563eb" },
  preventive_maintenance: { label: "Preventive Maintenance", icon: "🔧", color: "#7c3aed" },
  monitoring_only: { label: "Monitoring Only", icon: "👁️", color: "#059669" },
};

const BAND_COLORS: Record<Band, string> = {
  "A+": "#059669",
  A: "#22c55e",
  B: "#eab308",
  C: "#f97316",
  D: "#ef4444",
  E: "#991b1b",
};

function formatDate(d: Date | null): string {
  if (!d) return "Never";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function daysLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/* ─── Props ───────────────────────────────────────────────────── */

interface InspectionSchedulerProps {
  roads: RoadWithScore[];
}

/* ─── Stat Card ───────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  bg,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 border transition-all hover:shadow-md"
      style={{ background: bg, borderColor: `${color}25` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}15`, color }}
        >
          {icon}
        </div>
      </div>
      <p className="text-2xl font-extrabold tabular-nums" style={{ color }}>
        {value}
      </p>
      <p className="text-[12px] font-semibold text-gray-600 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────── */

export default function InspectionScheduler({ roads }: InspectionSchedulerProps) {
  const schedule = useMemo(() => generateInspectionSchedule(roads), [roads]);
  const summary = useMemo(() => computeScheduleSummary(schedule), [schedule]);

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<InspectionPriority | "all">("all");
  const [actionFilter, setActionFilter] = useState<ActionType | "all">("all");
  const [agencyFilter, setAgencyFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"priority" | "dueDate" | "band" | "cost">("priority");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  /* Filtered & sorted list */
  const filtered = useMemo(() => {
    let list = schedule;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.road.road_id.toLowerCase().includes(q) ||
          s.road.name.toLowerCase().includes(q) ||
          s.road.district.toLowerCase().includes(q)
      );
    }
    if (priorityFilter !== "all") list = list.filter((s) => s.priority === priorityFilter);
    if (actionFilter !== "all") list = list.filter((s) => s.action === actionFilter);
    if (agencyFilter !== "all") list = list.filter((s) => s.assignedAgency === agencyFilter);

    const sorted = [...list];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "priority":
          cmp = b.priorityScore - a.priorityScore;
          break;
        case "dueDate":
          cmp = a.daysUntilDue - b.daysUntilDue;
          break;
        case "band": {
          const order: Band[] = ["E", "D", "C", "B", "A", "A+"];
          cmp = order.indexOf(a.road.healthScore.band) - order.indexOf(b.road.healthScore.band);
          break;
        }
        case "cost":
          cmp = b.estimatedCostLakhs - a.estimatedCostLakhs;
          break;
      }
      return sortAsc ? -cmp : cmp;
    });

    return sorted;
  }, [schedule, search, priorityFilter, actionFilter, agencyFilter, sortKey, sortAsc]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  /* Unique agencies for filter */
  const agencies = useMemo(() => {
    const set = new Set(schedule.map((s) => s.assignedAgency));
    return Array.from(set).sort();
  }, [schedule]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  /* Export Schedule CSV */
  const handleExport = () => {
    const headers = [
      "Road ID", "Name", "District", "Band", "Health Score", "Priority",
      "Priority Score", "Last Inspection", "Next Due", "Days Until Due",
      "Overdue", "Action", "Assigned Agency", "Risk Factors",
      "Est. Cost (₹L)", "Quarter",
    ];
    const rows = [headers.join(",")];
    filtered.forEach((s) => {
      rows.push([
        s.road.road_id,
        `"${s.road.name}"`,
        s.road.district,
        s.road.healthScore.band,
        s.road.healthScore.conditionScore,
        s.priority,
        s.priorityScore,
        s.lastInspectionDate ? s.lastInspectionDate.toISOString().split("T")[0] : "Never",
        s.nextDueDate.toISOString().split("T")[0],
        s.daysUntilDue,
        s.isOverdue ? "Yes" : "No",
        ACTION_CONFIG[s.action].label,
        s.assignedAgency,
        `"${s.riskFactors.join("; ")}"`,
        s.estimatedCostLakhs,
        s.quarterLabel,
      ].join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspection_schedule_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ───────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total Roads"
          value={summary.total}
          icon={<MapPin size={18} />}
          color="#2563eb"
          bg="#eff6ff"
        />
        <StatCard
          label="Overdue"
          value={summary.overdue}
          sub="Need immediate action"
          icon={<XCircle size={18} />}
          color="#dc2626"
          bg="#fef2f2"
        />
        <StatCard
          label="Due in 30 days"
          value={summary.dueSoon}
          icon={<CalendarClock size={18} />}
          color="#ea580c"
          bg="#fff7ed"
        />
        <StatCard
          label="Critical Priority"
          value={summary.critical}
          icon={<AlertTriangle size={18} />}
          color="#991b1b"
          bg="#fef2f2"
        />
        <StatCard
          label="High Priority"
          value={summary.high}
          icon={<Activity size={18} />}
          color="#c2410c"
          bg="#fff7ed"
        />
        <StatCard
          label="Est. Total Cost"
          value={`₹${(summary.totalEstimatedCost / 100).toFixed(0)}Cr`}
          sub={`₹${summary.totalEstimatedCost.toLocaleString()}L`}
          icon={<Shield size={18} />}
          color="#7c3aed"
          bg="#f5f3ff"
        />
      </div>

      {/* ── Action Breakdown Bar ────────────── */}
      <div className="rounded-2xl bg-white border border-gray-200 p-5">
        <h3 className="text-[13px] font-bold text-gray-700 mb-3">Action Distribution</h3>
        <div className="flex rounded-xl overflow-hidden h-8">
          {(Object.keys(summary.byAction) as ActionType[]).map((action) => {
            const count = summary.byAction[action];
            if (!count) return null;
            const pct = (count / summary.total) * 100;
            const cfg = ACTION_CONFIG[action];
            return (
              <div
                key={action}
                className="flex items-center justify-center text-white text-[10px] font-bold transition-all"
                style={{ width: `${pct}%`, background: cfg.color, minWidth: pct > 3 ? 0 : 2 }}
                title={`${cfg.label}: ${count}`}
              >
                {pct > 8 && `${cfg.icon} ${count}`}
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 flex-wrap">
          {(Object.keys(summary.byAction) as ActionType[]).map((action) => {
            const count = summary.byAction[action];
            if (!count) return null;
            const cfg = ACTION_CONFIG[action];
            return (
              <div key={action} className="flex items-center gap-1.5 text-[11px]">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: cfg.color }} />
                <span className="text-gray-600 font-medium">{cfg.label}</span>
                <span className="text-gray-400 font-bold">({count})</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Filters & Search ────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search road ID, name, or district…"
              className="w-full pl-9 pr-3 h-9 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value as InspectionPriority | "all"); setPage(0); }}
            className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 bg-white focus:outline-none focus:border-orange-400"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Action filter */}
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value as ActionType | "all"); setPage(0); }}
            className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 bg-white focus:outline-none focus:border-orange-400"
          >
            <option value="all">All Actions</option>
            {(Object.keys(ACTION_CONFIG) as ActionType[]).map((a) => (
              <option key={a} value={a}>{ACTION_CONFIG[a].label}</option>
            ))}
          </select>

          {/* Agency filter */}
          <select
            value={agencyFilter}
            onChange={(e) => { setAgencyFilter(e.target.value); setPage(0); }}
            className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 bg-white focus:outline-none focus:border-orange-400"
          >
            <option value="all">All Agencies</option>
            {agencies.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Export */}
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-medium hover:bg-gray-50 transition-all"
          >
            <Download size={14} />
            Export Schedule
          </button>

          <div className="text-[11px] text-gray-400 font-medium">
            {filtered.length} of {schedule.length} roads
          </div>
        </div>
      </div>

      {/* ── Schedule Table ──────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th>Road</th>
                <th>District</th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("band")}
                >
                  <span className="inline-flex items-center gap-1">
                    Band
                    <ArrowUpDown size={11} className="text-gray-400" />
                  </span>
                </th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("priority")}
                >
                  <span className="inline-flex items-center gap-1">
                    Priority
                    <ArrowUpDown size={11} className="text-gray-400" />
                  </span>
                </th>
                <th>Last Inspection</th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("dueDate")}
                >
                  <span className="inline-flex items-center gap-1">
                    Next Due
                    <ArrowUpDown size={11} className="text-gray-400" />
                  </span>
                </th>
                <th>Status</th>
                <th>Action</th>
                <th>Agency</th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("cost")}
                >
                  <span className="inline-flex items-center gap-1">
                    Est. Cost
                    <ArrowUpDown size={11} className="text-gray-400" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item) => {
                const pCfg = PRIORITY_CONFIG[item.priority];
                const aCfg = ACTION_CONFIG[item.action];
                const expanded = expandedRow === item.road.road_id;

                return (
                  <>
                    <tr
                      key={item.road.road_id}
                      onClick={() => setExpandedRow(expanded ? null : item.road.road_id)}
                      className="group"
                    >
                      <td className="text-center">
                        {expanded ? (
                          <ChevronUp size={14} className="text-gray-400 mx-auto" />
                        ) : (
                          <ChevronDown size={14} className="text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td>
                        <div>
                          <p className="text-[13px] font-semibold text-gray-900 truncate max-w-[200px]">
                            {item.road.name}
                          </p>
                          <p className="text-[11px] text-gray-400">{item.road.road_id}</p>
                        </div>
                      </td>
                      <td className="text-[12px] text-gray-600">{item.road.district}</td>
                      <td>
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[11px] font-bold text-white"
                          style={{ background: BAND_COLORS[item.road.healthScore.band] }}
                        >
                          {item.road.healthScore.band}
                        </span>
                      </td>
                      <td>
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
                          style={{ color: pCfg.color, background: pCfg.bg, border: `1px solid ${pCfg.border}` }}
                        >
                          {item.priorityScore.toFixed(0)}
                          <span className="text-[10px] font-semibold opacity-70">{pCfg.label}</span>
                        </span>
                      </td>
                      <td className="text-[12px] text-gray-500">
                        {formatDate(item.lastInspectionDate)}
                      </td>
                      <td className="text-[12px] font-medium">
                        <span className={item.isOverdue ? "text-red-600" : "text-gray-700"}>
                          {formatDate(item.nextDueDate)}
                        </span>
                      </td>
                      <td>
                        {item.isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[11px] font-bold text-red-700">
                            <XCircle size={11} />
                            {daysLabel(item.overdueDays)} overdue
                          </span>
                        ) : item.daysUntilDue <= 30 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700">
                            <Clock size={11} />
                            In {daysLabel(item.daysUntilDue)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-[11px] font-bold text-green-700">
                            <CheckCircle2 size={11} />
                            In {daysLabel(item.daysUntilDue)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="text-[11px] font-semibold" style={{ color: aCfg.color }}>
                          {aCfg.icon} {aCfg.label}
                        </span>
                      </td>
                      <td className="text-[12px] text-gray-600 font-medium">
                        {item.assignedAgency}
                      </td>
                      <td className="text-[12px] font-semibold text-gray-700 tabular-nums">
                        ₹{item.estimatedCostLakhs}L
                      </td>
                    </tr>

                    {/* Expansion row */}
                    {expanded && (
                      <tr key={`${item.road.road_id}-detail`} className="!bg-gray-50/80">
                        <td colSpan={11} className="!py-4 !px-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Scheduling Details */}
                            <div>
                              <h4 className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-2">
                                Scheduling Details
                              </h4>
                              <div className="space-y-1.5 text-[12px]">
                                <p>
                                  <span className="text-gray-400">Base Interval:</span>{" "}
                                  <span className="font-semibold text-gray-700">{item.baseIntervalDays} days</span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Adjusted (risk):</span>{" "}
                                  <span className="font-semibold text-gray-700">{item.adjustedIntervalDays} days</span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Health Score:</span>{" "}
                                  <span className="font-semibold" style={{ color: item.road.healthScore.bandColor }}>
                                    {item.road.healthScore.conditionScore} / 100
                                  </span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Rating:</span>{" "}
                                  <span className="font-semibold text-gray-700">{item.road.healthScore.rating} / 1000</span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Quarter:</span>{" "}
                                  <span className="font-semibold text-gray-700">{item.quarterLabel}</span>
                                </p>
                              </div>
                            </div>

                            {/* Risk Factors */}
                            <div>
                              <h4 className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-2">
                                Risk Factors ({item.riskFactors.length})
                              </h4>
                              {item.riskFactors.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {item.riskFactors.map((rf) => (
                                    <span
                                      key={rf}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 text-[11px] font-medium text-gray-600"
                                    >
                                      {rf.includes("Flood") && <Droplets size={10} className="text-blue-500" />}
                                      {rf.includes("Landslide") && <Mountain size={10} className="text-amber-600" />}
                                      {rf.includes("rainfall") && <CloudRain size={10} className="text-indigo-500" />}
                                      {rf.includes("traffic") && <Truck size={10} className="text-gray-500" />}
                                      {rf.includes("truck") && <Truck size={10} className="text-gray-500" />}
                                      {rf.includes("Ghat") && <Mountain size={10} className="text-green-600" />}
                                      {rf.includes("terrain") && <Mountain size={10} className="text-stone-500" />}
                                      {rf.includes("Unpaved") && <AlertTriangle size={10} className="text-orange-500" />}
                                      {rf.includes("design life") && <Clock size={10} className="text-red-500" />}
                                      {rf.includes("health") && <Activity size={10} className="text-red-500" />}
                                      {rf}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[12px] text-gray-400 italic">No additional risk factors</p>
                              )}
                            </div>

                            {/* Road Info */}
                            <div>
                              <h4 className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-2">
                                Road Info
                              </h4>
                              <div className="space-y-1.5 text-[12px]">
                                <p>
                                  <span className="text-gray-400">Surface:</span>{" "}
                                  <span className="font-semibold text-gray-700 capitalize">{item.road.surface_type}</span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Length:</span>{" "}
                                  <span className="font-semibold text-gray-700">{item.road.length_km} km</span>
                                </p>
                                <p>
                                  <span className="text-gray-400">ADT:</span>{" "}
                                  <span className="font-semibold text-gray-700">{item.road.avg_daily_traffic.toLocaleString()}</span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Truck %:</span>{" "}
                                  <span className="font-semibold text-gray-700">{item.road.truck_percentage}%</span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Built:</span>{" "}
                                  <span className="font-semibold text-gray-700">{item.road.year_constructed}</span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Last Rehab:</span>{" "}
                                  <span className="font-semibold text-gray-700">
                                    {item.road.last_major_rehab_year ?? "Never"}
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-[12px] text-gray-400">
              Page {page + 1} of {totalPages} ({filtered.length} results)
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page < 3 ? i : page - 2 + i;
                if (p >= totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-[12px] font-semibold transition-all ${
                      p === page
                        ? "bg-orange-500 text-white shadow-sm"
                        : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {p + 1}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
