"use client";

import { RoadWithScore, Band } from "@/lib/types";
import { estimateRepairCost, getInspectionInterval } from "@/lib/scoring";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle,
  Droplets,
  Mountain,
  TreePine,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Truck,
  Route,
  Clock,
  Gauge,
  Copy,
  X,
  IndianRupee,
  Layers,
} from "lucide-react";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface RegistryTableProps {
  roads: RoadWithScore[];
}

type SortKey =
  | "road_id"
  | "name"
  | "district"
  | "length_km"
  | "surface_type"
  | "conditionScore"
  | "band"
  | "avg_daily_traffic"
  | "lane_count"
  | "jurisdiction"
  | "year_constructed"
  | "status";
type SortDir = "asc" | "desc";

const BAND_COLORS: Record<Band, string> = {
  "A+": "#059669",
  A: "#22c55e",
  B: "#ca8a04",
  C: "#ea580c",
  D: "#dc2626",
  E: "#991b1b",
};

const SURFACE_STYLES: Record<string, { bg: string; text: string }> = {
  concrete: { bg: "#dbeafe", text: "#1e40af" },
  bitumen: { bg: "#ede9fe", text: "#6d28d9" },
  gravel: { bg: "#fef3c7", text: "#92400e" },
  earthen: { bg: "#fce7f3", text: "#9d174d" },
};

function getColor(value: number): string {
  if (value >= 70) return "#059669";
  if (value >= 50) return "#22c55e";
  if (value >= 35) return "#eab308";
  if (value >= 20) return "#f97316";
  return "#ef4444";
}

export default function RegistryTable({ roads }: RegistryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("road_id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(20);
  const [hoveredRoad, setHoveredRoad] = useState<RoadWithScore | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const handleRowEnter = useCallback((road: RoadWithScore, e: React.MouseEvent<HTMLTableRowElement>) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    // Capture rect synchronously — e.currentTarget is null after the timeout
    const rect = e.currentTarget.getBoundingClientRect();
    hoverTimeout.current = setTimeout(() => {
      setCardPos({ top: rect.top, left: rect.right + 8 });
      setHoveredRoad(road);
    }, 250);
  }, []);

  const handleRowLeave = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredRoad(null), 200);
  }, []);

  const handleCardEnter = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  }, []);

  const handleCardLeave = useCallback(() => {
    setHoveredRoad(null);
  }, []);

  const sorted = useMemo(() => {
    const copy = [...roads];
    copy.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortKey === "conditionScore") {
        va = a.healthScore.conditionScore;
        vb = b.healthScore.conditionScore;
      } else if (sortKey === "band") {
        const order = { "A+": 6, A: 5, B: 4, C: 3, D: 2, E: 1 };
        va = order[a.healthScore.band] || 0;
        vb = order[b.healthScore.band] || 0;
      } else {
        va = a[sortKey] as string | number;
        vb = b[sortKey] as string | number;
      }
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return copy;
  }, [roads, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / perPage);
  const paginated = sorted.slice(page * perPage, (page + 1) * perPage);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown size={12} className="text-gray-300" />;
    return sortDir === "asc" ? (
      <ChevronUp size={12} className="text-orange-600" />
    ) : (
      <ChevronDown size={12} className="text-orange-600" />
    );
  };

  if (roads.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
        <p className="text-gray-400 text-sm">No road segments match your filters.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-md shadow-gray-200/50" ref={tableRef}>
      {/* Table */}
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <ThSort label="Road ID" col="road_id" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="road_id" />} />
              <ThSort label="Road Name" col="name" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="name" />} />
              <ThSort label="District" col="district" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="district" />} />
              <ThSort label="Length" col="length_km" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="length_km" />} />
              <ThSort label="Surface" col="surface_type" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="surface_type" />} />
              <th>Lanes</th>
              <ThSort label="ADT" col="avg_daily_traffic" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="avg_daily_traffic" />} />
              <ThSort label="Built" col="year_constructed" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="year_constructed" />} />
              <ThSort label="Jurisdiction" col="jurisdiction" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="jurisdiction" />} />
              <ThSort label="Band" col="band" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="band" />} />
              <ThSort label="Score" col="conditionScore" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="conditionScore" />} />
              <th>Status</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((road, i) => {
              const band = road.healthScore.band;
              const score = road.healthScore.conditionScore;
              const surf = SURFACE_STYLES[road.surface_type] || { bg: "#f3f4f6", text: "#6b7280" };

              return (
                <tr
                  key={road.road_id}
                  onMouseEnter={(e) => handleRowEnter(road, e)}
                  onMouseLeave={handleRowLeave}
                  className={hoveredRoad?.road_id === road.road_id ? "!bg-orange-50/60" : ""}
                >
                  <td className="text-gray-400 text-[11px] font-mono">
                    {page * perPage + i + 1}
                  </td>
                  <td>
                    <span className="font-mono text-[12px] text-orange-600 font-semibold">
                      {road.road_id}
                    </span>
                  </td>
                  <td>
                    <span className="font-medium text-gray-800 text-[13px] max-w-[200px] truncate block">
                      {road.name}
                    </span>
                  </td>
                  <td>
                    <div className="text-[13px]">
                      <span className="text-gray-700">{road.district}</span>
                      <span className="text-gray-400 text-[11px] ml-1">/ {road.taluka}</span>
                    </div>
                  </td>
                  <td className="text-gray-600 text-[13px] font-medium tabular-nums">
                    {road.length_km} km
                  </td>
                  <td>
                    <span
                      className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize"
                      style={{ background: surf.bg, color: surf.text }}
                    >
                      {road.surface_type}
                    </span>
                  </td>
                  <td className="text-center text-gray-600 text-[13px]">
                    {road.lane_count}
                  </td>
                  <td className="text-gray-600 text-[13px] tabular-nums">
                    {road.avg_daily_traffic.toLocaleString()}
                  </td>
                  <td className="text-gray-500 text-[13px] tabular-nums">
                    {road.year_constructed}
                  </td>
                  <td>
                    <span className="text-[11px] text-gray-500 font-medium">
                      {road.jurisdiction}
                    </span>
                  </td>
                  <td>
                    <span
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-bold text-white"
                      style={{ background: BAND_COLORS[band] }}
                    >
                      {band}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${score}%`,
                            background: BAND_COLORS[band],
                          }}
                        />
                      </div>
                      <span className="text-[12px] font-semibold tabular-nums" style={{ color: BAND_COLORS[band] }}>
                        {score}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                        road.status === "active"
                          ? "bg-green-50 text-green-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {road.status === "active" ? "Active" : "Construction"}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-0.5">
                      {road.landslide_prone && <Mountain size={13} className="text-amber-500" />}
                      {road.flood_prone && <Droplets size={13} className="text-blue-500" />}
                      {road.ghat_section_flag && <AlertTriangle size={13} className="text-orange-500" />}
                      {road.tourism_route_flag && <TreePine size={13} className="text-emerald-500" />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Hover Info Card (portal to body to escape overflow:hidden) ── */}
      {hoveredRoad && createPortal(
        <>
          {/* Backdrop overlay — dims & blurs background to focus user on card */}
          <div
            className="fixed inset-0 z-[998] bg-black/20 backdrop-blur-[2px] animate-overlay-in"
            style={{ pointerEvents: "auto" }}
            onMouseEnter={handleCardLeave}
          />
          <HoverInfoCard
            road={hoveredRoad}
            top={cardPos.top}
            left={cardPos.left}
            onMouseEnter={handleCardEnter}
            onMouseLeave={handleCardLeave}
          />
        </>,
        document.body,
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <p className="text-[12px] text-gray-500">
            <span className="font-semibold text-gray-700">
              {page * perPage + 1}–{Math.min((page + 1) * perPage, sorted.length)}
            </span>{" "}
            of {sorted.length}
          </p>
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(0);
            }}
            className="h-7 px-2 rounded-md border border-gray-200 text-[11px] text-gray-600 bg-white cursor-pointer"
          >
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            disabled={page === 0}
            onClick={() => setPage(0)}
            className="h-8 px-2 text-[11px] rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            First
          </button>
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft size={14} />
          </button>

          {getPageNumbers(page, totalPages).map((pn, i) =>
            pn === -1 ? (
              <span key={`dot-${i}`} className="text-gray-400 text-xs px-1">…</span>
            ) : (
              <button
                key={pn}
                onClick={() => setPage(pn)}
                className={`h-8 w-8 text-[12px] font-medium rounded-lg border transition ${
                  page === pn
                    ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {pn + 1}
              </button>
            )
          )}

          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronRight size={14} />
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(totalPages - 1)}
            className="h-8 px-2 text-[11px] rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Sortable Th helper ───────────────────────────── */
function ThSort({
  label,
  col,
  sortKey,
  onSort,
  icon,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  onSort: (key: SortKey) => void;
  icon: React.ReactNode;
}) {
  return (
    <th
      onClick={() => onSort(col)}
      className={`cursor-pointer select-none hover:text-gray-900 transition-colors ${
        sortKey === col ? "text-orange-700" : ""
      }`}
    >
      <div className="flex items-center gap-1">
        {label} {icon}
      </div>
    </th>
  );
}

/* ─── Page number helper ────────────────────────────── */
function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (current < 3) return [0, 1, 2, 3, -1, total - 1];
  if (current > total - 4) return [0, -1, total - 4, total - 3, total - 2, total - 1];
  return [0, -1, current - 1, current, current + 1, -1, total - 1];
}

/* ─── Hover Info Card ───────────────────────────────── */
function HoverInfoCard({
  road,
  top,
  left,
  onMouseEnter,
  onMouseLeave,
}: {
  road: RoadWithScore;
  top: number;
  left: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const bandColor = BAND_COLORS[road.healthScore.band];
  const { PCI, RSL, DRN, RQL } = road.healthScore.parameters;
  const params = [
    { key: "PCI", value: PCI },
    { key: "RSL", value: RSL },
    { key: "DRN", value: DRN },
    { key: "RQL", value: RQL },
  ];
  const repairCost = estimateRepairCost(road);
  const inspDays = getInspectionInterval(road.healthScore.band);
  const roadAge = 2026 - road.year_constructed;

  // Clamp card so it stays within the viewport
  const cardW = 340;
  const cardH = 420;
  const pad = 12;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;

  // Vertical: keep card fully visible
  let clampedTop = Math.max(pad, Math.min(top, vh - cardH - pad));

  // Horizontal: prefer right of row, flip to left if it overflows
  let clampedLeft = left;
  if (left + cardW + pad > vw) {
    clampedLeft = Math.max(pad, left - cardW - 24);
  }
  // Final right-edge clamp
  if (clampedLeft + cardW > vw - pad) {
    clampedLeft = vw - cardW - pad;
  }

  return (
    <div
      className="fixed z-[999] w-[340px] bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-black/10 overflow-hidden animate-scale-in"
      style={{ top: clampedTop, left: clampedLeft }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[11px] text-orange-600 font-bold">{road.road_id}</span>
            <h3 className="text-[14px] font-bold text-gray-900 truncate mt-0.5">{road.name}</h3>
            <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-400">
              <MapPin size={10} />
              <span>{road.district}, {road.taluka}</span>
              <span className="text-gray-300">•</span>
              <span>{road.nh_number}</span>
            </div>
          </div>
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-extrabold text-sm shrink-0"
            style={{ background: bandColor }}
          >
            {road.healthScore.band}
          </div>
        </div>
      </div>

      {/* Score + Params */}
      <div className="px-4 py-3 space-y-3">
        {/* Rating bar */}
        <div>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-xl font-extrabold tabular-nums" style={{ color: bandColor }}>
              {road.healthScore.rating}
            </span>
            <span className="text-[11px] text-gray-400">/ 1000</span>
            <span className="text-[10px] ml-auto font-medium" style={{ color: bandColor }}>
              {road.healthScore.bandLabel}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gradient-to-r from-red-800 via-red-500 via-orange-400 via-yellow-400 via-green-400 to-emerald-600 relative">
            <div
              className="absolute top-1/2 w-3 h-3 rounded-full bg-white border-2 shadow"
              style={{
                left: `${(road.healthScore.rating / 1000) * 100}%`,
                borderColor: bandColor,
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
        </div>

        {/* 4 param bars */}
        <div className="space-y-1.5">
          {params.map((p) => (
            <div key={p.key} className="flex items-center gap-2">
              <span className="w-7 text-[10px] font-bold text-gray-500">{p.key}</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${p.value}%`, background: getColor(p.value) }}
                />
              </div>
              <span className="w-6 text-right text-[11px] font-bold tabular-nums" style={{ color: getColor(p.value) }}>
                {p.value}
              </span>
            </div>
          ))}
        </div>

        {/* Quick details grid */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <MiniStat icon={<Route size={11} />} label="Length" value={`${road.length_km} km`} />
          <MiniStat icon={<Truck size={11} />} label="ADT" value={road.avg_daily_traffic.toLocaleString()} />
          <MiniStat icon={<Layers size={11} />} label="Surface" value={road.surface_type} />
          <MiniStat icon={<Clock size={11} />} label="Age" value={`${roadAge} yrs`} />
          <MiniStat icon={<IndianRupee size={11} />} label="Repair" value={`₹${repairCost}L`} />
          <MiniStat icon={<Gauge size={11} />} label="Inspect" value={`${inspDays}d`} />
        </div>

        {/* Risk flags */}
        {(road.landslide_prone || road.flood_prone || road.ghat_section_flag || road.tourism_route_flag) && (
          <div className="flex flex-wrap gap-1 pt-1">
            {road.landslide_prone && <MiniTag icon={<Mountain size={10} />} label="Landslide" color="#f59e0b" />}
            {road.flood_prone && <MiniTag icon={<Droplets size={10} />} label="Flood" color="#3b82f6" />}
            {road.ghat_section_flag && <MiniTag icon={<AlertTriangle size={10} />} label="Ghat" color="#f97316" />}
            {road.tourism_route_flag && <MiniTag icon={<TreePine size={10} />} label="Tourism" color="#22c55e" />}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
      <div className="flex items-center gap-1 text-gray-400 mb-0.5">
        {icon}
        <span className="text-[9px] font-semibold uppercase">{label}</span>
      </div>
      <p className="text-[12px] font-bold text-gray-700 capitalize truncate">{value}</p>
    </div>
  );
}

function MiniTag({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium"
      style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
    >
      {icon}
      {label}
    </span>
  );
}
