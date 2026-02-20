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
  IndianRupee,
  Layers,
  LayoutGrid,
  LayoutList,
  Eye,
  X,
  Activity,
  Shield,
  TrendingDown,
  Navigation,
  Thermometer,
  Wrench,
  Calendar,
  Copy,
} from "lucide-react";
import { useState, useMemo, useRef, useCallback, Fragment } from "react";

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
type ViewMode = "table" | "cards";

const BAND_COLORS: Record<Band, string> = {
  "A+": "#059669",
  A: "#22c55e",
  B: "#ca8a04",
  C: "#ea580c",
  D: "#dc2626",
  E: "#991b1b",
};

const BAND_LABELS: Record<Band, string> = {
  "A+": "Excellent",
  A: "Good",
  B: "Fair",
  C: "Poor",
  D: "Very Poor",
  E: "Critical",
};

const SURFACE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  concrete: { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
  bitumen: { bg: "#ede9fe", text: "#6d28d9", border: "#c4b5fd" },
  gravel: { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
  earthen: { bg: "#fce7f3", text: "#9d174d", border: "#f9a8d4" },
};

function getColor(value: number): string {
  if (value >= 70) return "#059669";
  if (value >= 50) return "#22c55e";
  if (value >= 35) return "#eab308";
  if (value >= 20) return "#f97316";
  return "#ef4444";
}

export default function RegistryTable({ roads }: RegistryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("conditionScore");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedRoad, setSelectedRoad] = useState<RoadWithScore | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    const copy = [...roads];
    copy.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortKey === "conditionScore") {
        va = a.healthScore.finalCibilScore;
        vb = b.healthScore.finalCibilScore;
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
      return sortDir === "asc"
        ? (va as number) - (vb as number)
        : (vb as number) - (va as number);
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

  const handleRowClick = useCallback(
    (road: RoadWithScore) => {
      if (selectedRoad?.road_id === road.road_id) {
        setSelectedRoad(null);
      } else {
        setSelectedRoad(road);
        setTimeout(() => {
          detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      }
    },
    [selectedRoad]
  );

  // Summary stats
  const stats = useMemo(() => {
    const bandCounts: Record<Band, number> = { "A+": 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
    let totalScore = 0;
    let critical = 0;
    roads.forEach((r) => {
      bandCounts[r.healthScore.band]++;
      totalScore += r.healthScore.finalCibilScore;
      if (r.healthScore.band === "D" || r.healthScore.band === "E") critical++;
    });
    return {
      bandCounts,
      avgScore: roads.length ? Math.round(totalScore / roads.length) : 0,
      critical,
      totalKm: Math.round(roads.reduce((s, r) => s + r.length_km, 0)),
      districts: new Set(roads.map((r) => r.district)).size,
    };
  }, [roads]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return <ChevronsUpDown size={12} className="text-gray-300" />;
    return sortDir === "asc" ? (
      <ChevronUp size={12} className="text-orange-600" />
    ) : (
      <ChevronDown size={12} className="text-orange-600" />
    );
  };

  if (roads.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <Route size={28} className="text-gray-300" />
        </div>
        <p className="text-gray-500 text-sm font-medium">No road segments match your filters.</p>
        <p className="text-gray-400 text-xs mt-1">Try adjusting your search or filter criteria.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Summary Stats Bar ──────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={<Route size={16} />}
          label="Total Roads"
          value={roads.length.toLocaleString()}
          color="#3b82f6"
        />
        <StatCard
          icon={<Navigation size={16} />}
          label="Total Length"
          value={`${stats.totalKm.toLocaleString()} km`}
          color="#8b5cf6"
        />
        <StatCard
          icon={<Activity size={16} />}
          label="Avg Health Score"
          value={String(stats.avgScore)}
          color={getColor(stats.avgScore)}
          suffix="/100"
        />
        <StatCard
          icon={<AlertTriangle size={16} />}
          label="Critical Roads"
          value={String(stats.critical)}
          color="#dc2626"
          suffix={`(${roads.length > 0 ? ((stats.critical / roads.length) * 100).toFixed(1) : 0}%)`}
        />
        <StatCard
          icon={<MapPin size={16} />}
          label="Districts"
          value={String(stats.districts)}
          color="#0ea5e9"
        />
        {/* Health Band Distribution mini chart */}
        <div className="bg-white rounded-xl border border-gray-200/80 px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Band Distribution
          </p>
          <div className="flex items-end gap-0.5 h-7">
            {(["A+", "A", "B", "C", "D", "E"] as Band[]).map((band) => {
              const count = stats.bandCounts[band];
              const pct = roads.length > 0 ? (count / roads.length) * 100 : 0;
              return (
                <div
                  key={band}
                  className="flex-1 rounded-t-sm transition-all"
                  style={{
                    height: `${Math.max(pct * 2, 3)}px`,
                    maxHeight: "28px",
                    background: BAND_COLORS[band],
                    opacity: count > 0 ? 1 : 0.2,
                  }}
                  title={`${band}: ${count} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div className="flex gap-0.5 mt-0.5">
            {(["A+", "A", "B", "C", "D", "E"] as Band[]).map((band) => (
              <span key={band} className="flex-1 text-center text-[8px] text-gray-400 font-medium">
                {band}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Controls Bar ───────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("table")}
            className={`h-8 w-8 flex items-center justify-center rounded-lg border transition-all ${
              viewMode === "table"
                ? "bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/20"
                : "border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300"
            }`}
          >
            <LayoutList size={15} />
          </button>
          <button
            onClick={() => setViewMode("cards")}
            className={`h-8 w-8 flex items-center justify-center rounded-lg border transition-all ${
              viewMode === "cards"
                ? "bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/20"
                : "border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300"
            }`}
          >
            <LayoutGrid size={15} />
          </button>
          <span className="text-[11px] text-gray-400 ml-1">
            Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, sorted.length)} of{" "}
            <span className="font-semibold text-gray-700">{sorted.length.toLocaleString()}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(0);
            }}
            className="h-8 px-2 rounded-lg border border-gray-200 text-[11px] text-gray-600 bg-white cursor-pointer"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={200}>200 / page</option>
          </select>
        </div>
      </div>

      {/* ── Table View ─────────────────────────────── */}
      {viewMode === "table" && (
        <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-md shadow-gray-200/50">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-380px)]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-gray-50 to-slate-50">
                  <th className="sticky top-0 z-10 bg-gradient-to-r from-gray-50 to-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-left border-b-2 border-gray-200/80 w-[44px]">
                    #
                  </th>
                  <ThSort label="Road ID" col="road_id" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="road_id" />} />
                  <ThSort label="Road Name" col="name" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="name" />} />
                  <ThSort label="District" col="district" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="district" />} />
                  <ThSort label="Length" col="length_km" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="length_km" />} />
                  <ThSort label="Surface" col="surface_type" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="surface_type" />} />
                  <th className="sticky top-0 z-10 bg-gradient-to-r from-gray-50 to-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-left border-b-2 border-gray-200/80">
                    Lanes
                  </th>
                  <ThSort label="ADT" col="avg_daily_traffic" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="avg_daily_traffic" />} />
                  <ThSort label="Built" col="year_constructed" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="year_constructed" />} />
                  <ThSort label="Jurisdiction" col="jurisdiction" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="jurisdiction" />} />
                  <ThSort label="Band" col="band" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="band" />} />
                  <ThSort label="CIBIL Score" col="conditionScore" sortKey={sortKey} onSort={toggleSort} icon={<SortIcon col="conditionScore" />} />
                  <th className="sticky top-0 z-10 bg-gradient-to-r from-gray-50 to-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-left border-b-2 border-gray-200/80">
                    Status
                  </th>
                  <th className="sticky top-0 z-10 bg-gradient-to-r from-gray-50 to-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-left border-b-2 border-gray-200/80">
                    Flags
                  </th>
                  <th className="sticky top-0 z-10 bg-gradient-to-r from-gray-50 to-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center border-b-2 border-gray-200/80 w-[44px]">
                    <Eye size={12} className="mx-auto" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((road, i) => {
                  const band = road.healthScore.band;
                  const score = road.healthScore.finalCibilScore;
                  const conditionCategory = road.healthScore.conditionCategory;
                  const surf = SURFACE_STYLES[road.surface_type] || {
                    bg: "#f3f4f6",
                    text: "#6b7280",
                    border: "#d1d5db",
                  };
                  const isSelected = selectedRoad?.road_id === road.road_id;

                  return (
                    <Fragment key={road.road_id}>
                      <tr
                        onClick={() => handleRowClick(road)}
                        className={`cursor-pointer transition-all duration-150 border-l-[3px] ${
                          isSelected
                            ? "bg-orange-50/70 border-l-orange-500"
                            : "border-l-transparent hover:bg-gray-50/80 hover:border-l-gray-300"
                        }`}
                      >
                        <td className="px-3 py-2.5 text-gray-400 text-[11px] font-mono border-b border-gray-50">
                          {page * perPage + i + 1}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50">
                          <span className="font-mono text-[12px] text-orange-600 font-semibold">
                            {road.road_id}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50">
                          <span className="font-medium text-gray-800 text-[13px] max-w-[200px] truncate block">
                            {road.name}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50">
                          <div className="text-[13px]">
                            <span className="text-gray-700">{road.district}</span>
                            <span className="text-gray-400 text-[11px] ml-1">/ {road.taluka}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50 text-gray-600 text-[13px] font-medium tabular-nums">
                          {road.length_km} km
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50">
                          <span
                            className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize border"
                            style={{ background: surf.bg, color: surf.text, borderColor: surf.border }}
                          >
                            {road.surface_type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50 text-center text-gray-600 text-[13px]">
                          {road.lane_count}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50 text-gray-600 text-[13px] tabular-nums">
                          {road.avg_daily_traffic.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50 text-gray-500 text-[13px] tabular-nums">
                          {road.year_constructed}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50">
                          <span className="text-[11px] text-gray-500 font-medium">
                            {road.jurisdiction}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50">
                          <span
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[11px] font-bold text-white shadow-sm"
                            style={{ background: BAND_COLORS[band] }}
                            title={BAND_LABELS[band]}
                          >
                            {band}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${score}%`,
                                    background: `linear-gradient(90deg, ${BAND_COLORS[band]}cc, ${BAND_COLORS[band]})`,
                                  }}
                                />
                              </div>
                              <span className="text-[13px] font-extrabold tabular-nums" style={{ color: BAND_COLORS[band] }}>
                                {score}
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold" style={{
                              color: conditionCategory === "Good" ? "#15803d"
                                   : conditionCategory === "Fair" ? "#a16207"
                                   : conditionCategory === "Poor" ? "#c2410c"
                                   : "#b91c1c"
                            }}>
                              {conditionCategory}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50">
                          <span
                            className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${
                              road.status === "active"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {road.status === "active" ? "Active" : "Construction"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50">
                          <div className="flex items-center gap-1">
                            {road.landslide_prone && (
                              <span className="w-5 h-5 flex items-center justify-center rounded bg-amber-50 border border-amber-200" title="Landslide Prone">
                                <Mountain size={11} className="text-amber-600" />
                              </span>
                            )}
                            {road.flood_prone && (
                              <span className="w-5 h-5 flex items-center justify-center rounded bg-blue-50 border border-blue-200" title="Flood Prone">
                                <Droplets size={11} className="text-blue-600" />
                              </span>
                            )}
                            {road.ghat_section_flag && (
                              <span className="w-5 h-5 flex items-center justify-center rounded bg-orange-50 border border-orange-200" title="Ghat Section">
                                <AlertTriangle size={11} className="text-orange-600" />
                              </span>
                            )}
                            {road.tourism_route_flag && (
                              <span className="w-5 h-5 flex items-center justify-center rounded bg-emerald-50 border border-emerald-200" title="Tourism Route">
                                <TreePine size={11} className="text-emerald-600" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-50 text-center">
                          <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-orange-600 transition">
                            <Eye size={13} />
                          </button>
                        </td>
                      </tr>

                      {/* ── Inline Detail Row ── */}
                      {isSelected && (
                        <tr>
                          <td colSpan={15} className="p-0">
                            <div ref={detailRef}>
                              <InlineDetailCard road={road} onClose={() => setSelectedRoad(null)} />
                            </div>
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
          <PaginationBar
            page={page}
            totalPages={totalPages}
            perPage={perPage}
            total={sorted.length}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* ── Cards View ─────────────────────────────── */}
      {viewMode === "cards" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginated.map((road) => (
              <RoadCard
                key={road.road_id}
                road={road}
                isSelected={selectedRoad?.road_id === road.road_id}
                onClick={() => handleRowClick(road)}
              />
            ))}
          </div>

          {/* Selected card detail */}
          {selectedRoad && (
            <div ref={detailRef}>
              <InlineDetailCard road={selectedRoad} onClose={() => setSelectedRoad(null)} />
            </div>
          )}

          <div className="flex justify-center">
            <PaginationBar
              page={page}
              totalPages={totalPages}
              perPage={perPage}
              total={sorted.length}
              onPageChange={setPage}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ROAD CARD (Grid view)
   ═══════════════════════════════════════════════════════ */
function RoadCard({
  road,
  isSelected,
  onClick,
}: {
  road: RoadWithScore;
  isSelected: boolean;
  onClick: () => void;
}) {
  const band = road.healthScore.band;
  const score = road.healthScore.finalCibilScore;
  const conditionCategory = road.healthScore.conditionCategory;
  const pdi = Math.round(road.healthScore.pdi);
  const pseudoCibil = Math.round(road.healthScore.pseudoCibil);
  const mlCibil = Math.round(road.healthScore.mlPredictedCibil);
  const bandColor = BAND_COLORS[band];
  const surf = SURFACE_STYLES[road.surface_type] || {
    bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db",
  };

  const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    Good:     { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
    Fair:     { bg: "#fef9c3", text: "#a16207", border: "#fde047" },
    Poor:     { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" },
    Critical: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  };
  const catStyle = categoryColors[conditionCategory] ?? { bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db" };

  return (
    <div
      onClick={onClick}
      className={`group bg-white rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-gray-200/60 hover:-translate-y-0.5 ${
        isSelected
          ? "border-orange-300 shadow-lg shadow-orange-100/50 ring-2 ring-orange-200/50"
          : "border-gray-200/80"
      }`}
    >
      {/* Header bar with band color */}
      <div
        className="h-1.5 w-full"
        style={{ background: `linear-gradient(90deg, ${bandColor}, ${bandColor}88)` }}
      />

      <div className="p-4 space-y-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-[11px] text-orange-600 font-bold">{road.road_id}</span>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize border"
                style={{ background: surf.bg, color: surf.text, borderColor: surf.border }}
              >
                {road.surface_type}
              </span>
            </div>
            <h3 className="text-[14px] font-bold text-gray-900 truncate">{road.name}</h3>
            <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
              <MapPin size={10} />
              <span>{road.district}, {road.taluka}</span>
            </div>
          </div>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold text-sm shrink-0 shadow-sm"
            style={{ background: bandColor }}
          >
            {band}
          </div>
        </div>

        {/* CIBIL Score + Condition */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Road CIBIL Score</span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{ background: catStyle.bg, color: catStyle.text, borderColor: catStyle.border }}
            >
              {conditionCategory}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-1.5">
            <span className="text-[22px] font-extrabold tabular-nums leading-none" style={{ color: bandColor }}>
              {score}
            </span>
            <span className="text-[11px] text-gray-400 font-normal">/100</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${score}%`,
                background: `linear-gradient(90deg, ${bandColor}cc, ${bandColor})`,
              }}
            />
          </div>
        </div>

        {/* PDI + Score breakdown */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="bg-gray-50 rounded-xl py-1.5 px-1">
            <div className="text-[8px] font-bold text-gray-400 mb-0.5">PDI</div>
            <div className="text-[12px] font-bold tabular-nums" style={{ color: pdi > 60 ? "#ef4444" : pdi > 30 ? "#f97316" : "#22c55e" }}>
              {pdi}
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl py-1.5 px-1">
            <div className="text-[8px] font-bold text-gray-400 mb-0.5">PDI-CIBIL</div>
            <div className="text-[12px] font-bold tabular-nums text-blue-600">{pseudoCibil}</div>
          </div>
          <div className="bg-gray-50 rounded-xl py-1.5 px-1">
            <div className="text-[8px] font-bold text-gray-400 mb-0.5">ML-CIBIL</div>
            <div className="text-[12px] font-bold tabular-nums text-purple-600">{mlCibil}</div>
          </div>
        </div>

        {/* Details row */}
        <div className="flex items-center gap-3 text-[11px] text-gray-500 pt-1 border-t border-gray-100">
          <span className="flex items-center gap-1">
            <Route size={10} className="text-gray-400" />
            {road.length_km} km
          </span>
          <span className="flex items-center gap-1">
            <Truck size={10} className="text-gray-400" />
            {road.avg_daily_traffic.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={10} className="text-gray-400" />
            {road.year_constructed}
          </span>
          <div className="ml-auto flex gap-0.5">
            {road.landslide_prone && <Mountain size={11} className="text-amber-500" />}
            {road.flood_prone && <Droplets size={11} className="text-blue-500" />}
            {road.ghat_section_flag && <AlertTriangle size={11} className="text-orange-500" />}
            {road.tourism_route_flag && <TreePine size={11} className="text-emerald-500" />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   INLINE DETAIL CARD
   ═══════════════════════════════════════════════════════ */
function InlineDetailCard({
  road,
  onClose,
}: {
  road: RoadWithScore;
  onClose: () => void;
}) {
  const band = road.healthScore.band;
  const bandColor = BAND_COLORS[band];
  const finalCibil = road.healthScore.finalCibilScore;
  const conditionCategory = road.healthScore.conditionCategory;
  const pdi = Math.round(road.healthScore.pdi);
  const pseudoCibil = Math.round(road.healthScore.pseudoCibil);
  const mlCibil = Math.round(road.healthScore.mlPredictedCibil);
  const { PCI, IRI, DISTRESS, RSL, DRN } = road.healthScore.parameters;
  const repairCost = estimateRepairCost(road, conditionCategory);
  const inspDays = getInspectionInterval(road.healthScore.band);
  const roadAge = 2026 - road.year_constructed;

  const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    Good:     { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
    Fair:     { bg: "#fef9c3", text: "#a16207", border: "#fde047" },
    Poor:     { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" },
    Critical: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  };
  const catStyle = categoryColors[conditionCategory] ?? { bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db" };

  const params = [
    { key: "PCI", label: "Pavement Condition Index", value: PCI, weight: "30%" },
    { key: "IRI", label: "International Roughness Index", value: IRI, weight: "20%" },
    { key: "DISTRESS", label: "Composite Distress Index", value: DISTRESS, weight: "20%" },
    { key: "RSL", label: "Residual Structural Life", value: RSL, weight: "15%" },
    { key: "DRN", label: "Drainage Quality", value: DRN, weight: "15%" },
  ];
  const weakest = params.reduce((min, p) => (p.value < min.value ? p : min));

  return (
    <div
      className="border-t-2 border-t-orange-300 bg-gradient-to-b from-orange-50/40 via-white to-white"
      style={{ animation: "fadeSlideUp 0.3s ease-out" }}
    >
      <div className="max-w-[1500px] mx-auto px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono text-[13px] text-orange-600 font-bold">{road.road_id}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(road.road_id);
                }}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                title="Copy ID"
              >
                <Copy size={12} />
              </button>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-white"
                style={{ background: bandColor }}
              >
                Band {band} — {BAND_LABELS[band]}
              </span>
            </div>
            <h3 className="text-[18px] font-bold text-gray-900">{road.name}</h3>
            <div className="flex items-center gap-2 mt-1 text-[12px] text-gray-400">
              <MapPin size={12} />
              <span>{road.district}, {road.taluka}, {road.state}</span>
              <span className="text-gray-300">•</span>
              <span>{road.highway_ref}</span>
              <span className="text-gray-300">•</span>
              <span>KM {road.segment_start_km} → {road.segment_end_km}</span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Score card ── */}
          <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Gauge size={13} className="text-blue-600" />
              Health Assessment
            </h4>

            {/* CIBIL Score + Band + Condition */}
            <div className="flex items-center gap-4 mb-3">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-extrabold text-xl shadow-sm"
                style={{ background: bandColor }}
              >
                {band}
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold tabular-nums" style={{ color: bandColor }}>
                    {finalCibil}
                  </span>
                  <span className="text-sm text-gray-400">/ 100</span>
                </div>
                <span
                  className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full border mt-0.5"
                  style={{ background: catStyle.bg, color: catStyle.text, borderColor: catStyle.border }}
                >
                  {conditionCategory}
                </span>
              </div>
            </div>

            {/* CIBIL bar */}
            <div className="mb-4">
              <div className="h-2.5 rounded-full bg-gradient-to-r from-red-800 via-red-500 via-orange-400 via-yellow-400 via-green-400 to-emerald-600 relative">
                <div
                  className="absolute top-1/2 w-4 h-4 rounded-full bg-white border-2 shadow-md"
                  style={{
                    left: `${finalCibil}%`,
                    borderColor: bandColor,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-gray-400 mt-1 px-0.5">
                <span>Critical</span><span>Poor</span><span>Fair</span><span>Good</span>
              </div>
            </div>

            {/* CIBIL score breakdown */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-gray-50 rounded-xl p-2 text-center">
                <div className="text-[9px] font-bold text-gray-400 mb-0.5">PDI</div>
                <div className="text-[14px] font-extrabold tabular-nums" style={{ color: pdi > 60 ? "#ef4444" : pdi > 30 ? "#f97316" : "#22c55e" }}>
                  {pdi}
                </div>
                <div className="text-[8px] text-gray-400">Distress Index</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-2 text-center">
                <div className="text-[9px] font-bold text-blue-400 mb-0.5">PDI-CIBIL</div>
                <div className="text-[14px] font-extrabold tabular-nums text-blue-700">{pseudoCibil}</div>
                <div className="text-[8px] text-blue-400">0.7× weight</div>
              </div>
              <div className="bg-purple-50 rounded-xl p-2 text-center">
                <div className="text-[9px] font-bold text-purple-400 mb-0.5">ML-CIBIL</div>
                <div className="text-[14px] font-extrabold tabular-nums text-purple-700">{mlCibil}</div>
                <div className="text-[8px] text-purple-400">0.3× weight</div>
              </div>
            </div>

            {/* Sub-parameters */}
            <div className="space-y-2">
              {params.map((p) => {
                const c = getColor(p.value);
                return (
                  <div key={p.key}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-semibold text-gray-500">
                        {p.key} <span className="text-gray-300 font-normal">({p.weight})</span>
                      </span>
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: c }}>
                        {p.value}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${p.value}%`, background: c }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {weakest.value < 40 && (
              <div className="mt-3 px-3 py-2 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2">
                <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-600 font-medium leading-tight">
                  <strong>{weakest.label}</strong> is critically low at {weakest.value}/100 — immediate attention recommended
                </p>
              </div>
            )}
          </div>

          {/* ── Road Details ── */}
          <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Route size={13} className="text-violet-600" />
              Road Details
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <DetailCell icon={<Route size={12} />} label="Length" value={`${road.length_km} km`} sub={`KM ${road.segment_start_km} → ${road.segment_end_km}`} />
              <DetailCell icon={<Layers size={12} />} label="Surface" value={road.surface_type} sub={`${road.lane_count}-lane`} />
              <DetailCell icon={<Calendar size={12} />} label="Constructed" value={String(road.year_constructed)} sub={`${roadAge} yrs old`} />
              <DetailCell icon={<Wrench size={12} />} label="Last Rehab" value={road.last_major_rehab_year ? String(road.last_major_rehab_year) : "Never"} sub={road.last_major_rehab_year ? `${2026 - road.last_major_rehab_year} yrs ago` : "—"} />
              <DetailCell icon={<Truck size={12} />} label="ADT" value={road.avg_daily_traffic.toLocaleString()} sub={`${road.truck_percentage}% trucks`} />
              <DetailCell icon={<Clock size={12} />} label="Inspection" value={`Every ${inspDays}d`} sub={`Band ${band}`} />
              <DetailCell icon={<IndianRupee size={12} />} label="Est. Repair" value={`₹${repairCost} L`} sub={`${road.length_km} km × ${road.surface_type}`} />
              <DetailCell icon={<Thermometer size={12} />} label="Elevation" value={`${road.elevation_m}m`} sub={road.terrain_type} />
            </div>
          </div>

          {/* ── Risk & Distress ── */}
          <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm space-y-4">
            <div>
              <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Shield size={13} className="text-red-600" />
                Risk Factors
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {road.landslide_prone && <RiskTag icon={<Mountain size={11} />} label="Landslide Prone" color="#f59e0b" />}
                {road.flood_prone && <RiskTag icon={<Droplets size={11} />} label="Flood Prone" color="#3b82f6" />}
                {road.ghat_section_flag && <RiskTag icon={<AlertTriangle size={11} />} label="Ghat Section" color="#f97316" />}
                {road.tourism_route_flag && <RiskTag icon={<TreePine size={11} />} label="Tourism Route" color="#22c55e" />}
                <RiskTag label={road.terrain_type} />
                <RiskTag label={road.slope_category} />
                <RiskTag label={`${road.monsoon_rainfall_category} rainfall`} />
                <RiskTag label={road.region_type} />
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingDown size={13} className="text-orange-600" />
                Distress Metrics
              </h4>
              <div className="space-y-1.5">
                <DistressRow label="Potholes" value={`${road.potholes_per_km}/km`} severity={Math.min(road.potholes_per_km * 10, 100)} />
                <DistressRow label="Pothole Depth" value={`${road.pothole_avg_depth_cm} cm`} severity={Math.min(road.pothole_avg_depth_cm * 5, 100)} />
                <DistressRow label="Long. Cracks" value={`${road.cracks_longitudinal_pct}%`} severity={road.cracks_longitudinal_pct} />
                <DistressRow label="Trans. Cracks" value={`${road.cracks_transverse_per_km}/km`} severity={Math.min(road.cracks_transverse_per_km * 5, 100)} />
                <DistressRow label="Alligator Crack" value={`${road.alligator_cracking_pct}%`} severity={road.alligator_cracking_pct} />
                <DistressRow label="Rutting" value={`${road.rutting_depth_mm} mm`} severity={Math.min(road.rutting_depth_mm * 4, 100)} />
                <DistressRow label="Raveling" value={`${road.raveling_pct}%`} severity={road.raveling_pct} />
                <DistressRow label="Edge Breaking" value={`${road.edge_breaking_pct}%`} severity={road.edge_breaking_pct} />
                <DistressRow label="Patches" value={`${road.patches_per_km}/km`} severity={Math.min(road.patches_per_km * 10, 100)} />
              </div>
            </div>

            {/* Inspection History */}
            {road.inspections.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock size={13} className="text-indigo-600" />
                  Inspection History ({road.inspections.length})
                </h4>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                  {road.inspections
                    .sort((a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime())
                    .map((insp) => (
                      <div
                        key={insp.inspection_id}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gray-50 border border-gray-100"
                      >
                        <div
                          className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ background: getColor(insp.condition_score) }}
                        >
                          {Math.round(insp.condition_score)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-semibold text-gray-700">
                            {new Date(insp.inspection_date).toLocaleDateString("en-IN", {
                              day: "numeric", month: "short", year: "numeric",
                            })}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-1.5">{insp.inspector_agency}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════ */

function StatCard({
  icon,
  label,
  value,
  color,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/80 px-3 py-2.5 shadow-sm hover:shadow-md hover:shadow-gray-100/60 transition-shadow">
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color }} className="opacity-70">{icon}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[18px] font-extrabold tabular-nums" style={{ color }}>{value}</span>
        {suffix && <span className="text-[10px] text-gray-400">{suffix}</span>}
      </div>
    </div>
  );
}

function DetailCell({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
      <div className="flex items-center gap-1 text-gray-400 mb-0.5">
        {icon}
        <span className="text-[9px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-[13px] font-bold text-gray-800 capitalize">{value}</p>
      <p className="text-[10px] text-gray-400">{sub}</p>
    </div>
  );
}

function RiskTag({
  icon,
  label,
  color,
}: {
  icon?: React.ReactNode;
  label: string;
  color?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium capitalize"
      style={{
        background: color ? `${color}12` : "#f3f4f6",
        color: color || "#6b7280",
        border: `1px solid ${color ? `${color}30` : "#e5e7eb"}`,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function DistressRow({
  label,
  value,
  severity,
}: {
  label: string;
  value: string;
  severity: number;
}) {
  const c = severity > 60 ? "#ef4444" : severity > 30 ? "#f97316" : "#22c55e";
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-[10px] text-gray-500 font-medium shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(severity, 100)}%`, background: c }}
        />
      </div>
      <span className="w-12 text-right text-[10px] font-bold tabular-nums" style={{ color: c }}>
        {value}
      </span>
    </div>
  );
}

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
      className={`sticky top-0 z-10 bg-gradient-to-r from-gray-50 to-slate-50 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none border-b-2 border-gray-200/80 whitespace-nowrap transition-colors ${
        sortKey === col ? "text-orange-700" : "text-gray-400 hover:text-gray-600"
      }`}
    >
      <div className="flex items-center gap-1">
        {label} {icon}
      </div>
    </th>
  );
}

function PaginationBar({
  page,
  totalPages,
  perPage,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  perPage: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
      <p className="text-[12px] text-gray-500">
        <span className="font-semibold text-gray-700">
          {page * perPage + 1}–{Math.min((page + 1) * perPage, total)}
        </span>{" "}
        of <span className="font-semibold text-gray-700">{total.toLocaleString()}</span> roads
      </p>

      <div className="flex items-center gap-1">
        <button
          disabled={page === 0}
          onClick={() => onPageChange(0)}
          className="h-8 px-2 text-[11px] rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          First
        </button>
        <button
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
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
              onClick={() => onPageChange(pn)}
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
          onClick={() => onPageChange(page + 1)}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronRight size={14} />
        </button>
        <button
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(totalPages - 1)}
          className="h-8 px-2 text-[11px] rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          Last
        </button>
      </div>
    </div>
  );
}

function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (current < 3) return [0, 1, 2, 3, -1, total - 1];
  if (current > total - 4) return [0, -1, total - 4, total - 3, total - 2, total - 1];
  return [0, -1, current - 1, current, current + 1, -1, total - 1];
}
