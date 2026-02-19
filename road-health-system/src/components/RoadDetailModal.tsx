"use client";

import { RoadWithScore, Band } from "@/lib/types";
import { estimateRepairCost, getInspectionInterval } from "@/lib/scoring";
import {
  X,
  MapPin,
  Calendar,
  Truck,
  Route,
  Wrench,
  AlertTriangle,
  Droplets,
  Mountain,
  TreePine,
  Clock,
  IndianRupee,
  Layers,
  Gauge,
  Copy,
  ExternalLink,
} from "lucide-react";

interface RoadDetailModalProps {
  road: RoadWithScore;
  onClose: () => void;
}

const BAND_COLORS: Record<Band, string> = {
  "A+": "#059669", A: "#22c55e", B: "#ca8a04", C: "#ea580c", D: "#dc2626", E: "#991b1b",
};

export default function RoadDetailModal({ road, onClose }: RoadDetailModalProps) {
  const repairCost = estimateRepairCost(road);
  const inspDays = getInspectionInterval(road.healthScore.band);
  const roadAge = 2026 - road.year_constructed;
  const { PCI, IRI, DISTRESS, RSL, DRN } = road.healthScore.parameters;
  const bandColor = BAND_COLORS[road.healthScore.band];

  const paramInfo = [
    { key: "PCI", label: "Pavement Condition", value: PCI, weight: "30%" },
    { key: "IRI", label: "Roughness Index", value: IRI, weight: "20%" },
    { key: "DISTRESS", label: "Distress Index", value: DISTRESS, weight: "20%" },
    { key: "RSL", label: "Structural Life", value: RSL, weight: "15%" },
    { key: "DRN", label: "Drainage", value: DRN, weight: "15%" },
  ];

  const weakest = paramInfo.reduce((min, p) => (p.value < min.value ? p : min));

  const copyId = () => navigator.clipboard.writeText(road.road_id);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 modal-backdrop animate-overlay-in" onClick={onClose} />

      <div className="relative w-full max-w-lg h-screen bg-white shadow-2xl overflow-hidden animate-slide-right flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] text-blue-600 font-bold">{road.road_id}</span>
                <button onClick={copyId} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                  <Copy size={12} />
                </button>
              </div>
              <h2 className="text-[16px] font-bold text-gray-900 mt-0.5 truncate">{road.name}</h2>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
                <MapPin size={12} />
                <span>{road.district}, {road.taluka}</span>
                <span className="text-gray-300">•</span>
                <span>{road.highway_ref}</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Health Score Card */}
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Health Rating</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-3xl font-extrabold tabular-nums" style={{ color: bandColor }}>
                    {road.healthScore.rating}
                  </span>
                  <span className="text-sm text-gray-400 font-medium">/ 1000</span>
                </div>
                <p className="text-xs font-medium mt-0.5" style={{ color: bandColor }}>
                  {road.healthScore.bandLabel}
                </p>
              </div>
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg shadow-sm"
                style={{ background: bandColor }}
              >
                {road.healthScore.band}
              </div>
            </div>

            {/* Score gradient bar */}
            <div className="mt-3">
              <div className="h-2 rounded-full bg-gradient-to-r from-red-800 via-red-500 via-orange-400 via-yellow-400 via-green-400 to-emerald-600 relative">
                <div
                  className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 shadow-md"
                  style={{
                    left: `${(road.healthScore.rating / 1000) * 100}%`,
                    borderColor: bandColor,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                <span>E</span><span>D</span><span>C</span><span>B</span><span>A</span><span>A+</span>
              </div>
            </div>
          </div>

          {/* 4 Parameters */}
          <div>
            <h3 className="text-[12px] font-bold text-gray-800 mb-2.5 flex items-center gap-1.5">
              <Gauge size={13} className="text-blue-600" />
              Condition Parameters
            </h3>
            <div className="space-y-2">
              {paramInfo.map((p) => {
                const color = getColor(p.value);
                return (
                  <div key={p.key} className="flex items-center gap-3">
                    <div className="w-8 text-[11px] font-bold text-gray-500">{p.key}</div>
                    <div className="flex-1">
                      <div className="param-bar-bg">
                        <div className="param-bar-fill" style={{ width: `${p.value}%`, background: color }} />
                      </div>
                    </div>
                    <span className="w-8 text-right text-[12px] font-bold tabular-nums" style={{ color }}>
                      {p.value}
                    </span>
                    <span className="w-8 text-[10px] text-gray-400">{p.weight}</span>
                  </div>
                );
              })}
            </div>
            {weakest.value < 40 && (
              <div className="mt-2.5 px-3 py-2 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2">
                <AlertTriangle size={13} className="text-red-500 shrink-0" />
                <p className="text-[11px] text-red-600 font-medium">
                  {weakest.label} is critically low ({weakest.value}/100)
                </p>
              </div>
            )}
          </div>

          {/* Road Details Grid */}
          <div>
            <h3 className="text-[12px] font-bold text-gray-800 mb-2.5">Road Details</h3>
            <div className="grid grid-cols-2 gap-2">
              <DetailItem icon={<Route size={13} />} label="Length" value={`${road.length_km} km`} sub={`KM ${road.segment_start_km} → ${road.segment_end_km}`} />
              <DetailItem icon={<Layers size={13} />} label="Surface" value={road.surface_type} sub={`${road.lane_count}-lane`} />
              <DetailItem icon={<Calendar size={13} />} label="Constructed" value={String(road.year_constructed)} sub={`${roadAge} yrs old`} />
              <DetailItem icon={<Wrench size={13} />} label="Last Rehab" value={road.last_major_rehab_year ? String(road.last_major_rehab_year) : "Never"} sub={road.last_major_rehab_year ? `${2026 - road.last_major_rehab_year} yrs ago` : "—"} />
              <DetailItem icon={<Truck size={13} />} label="ADT" value={road.avg_daily_traffic.toLocaleString()} sub={`${road.truck_percentage}% trucks`} />
              <DetailItem icon={<Clock size={13} />} label="Inspection" value={`Every ${inspDays}d`} sub={`Band ${road.healthScore.band}`} />
              <DetailItem icon={<IndianRupee size={13} />} label="Repair Cost" value={`₹${repairCost} L`} sub={road.surface_type} />
              <DetailItem icon={<MapPin size={13} />} label="Elevation" value={`${road.elevation_m}m`} sub={road.terrain_type} />
            </div>
          </div>

          {/* Risk Flags */}
          <div>
            <h3 className="text-[12px] font-bold text-gray-800 mb-2.5">Risk & Environment</h3>
            <div className="flex flex-wrap gap-1.5">
              {road.landslide_prone && <Tag icon={<Mountain size={11} />} label="Landslide" color="#f59e0b" />}
              {road.flood_prone && <Tag icon={<Droplets size={11} />} label="Flood" color="#3b82f6" />}
              {road.ghat_section_flag && <Tag icon={<AlertTriangle size={11} />} label="Ghat" color="#f97316" />}
              {road.tourism_route_flag && <Tag icon={<TreePine size={11} />} label="Tourism" color="#22c55e" />}
              <Tag label={road.terrain_type} />
              <Tag label={road.slope_category} />
              <Tag label={`${road.monsoon_rainfall_category} rain`} />
              <Tag label={road.region_type} />
            </div>
          </div>

          {/* Inspection History */}
          {road.inspections.length > 0 && (
            <div>
              <h3 className="text-[12px] font-bold text-gray-800 mb-2.5">
                Inspection History ({road.inspections.length})
              </h3>
              <div className="space-y-1.5">
                {road.inspections
                  .sort((a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime())
                  .map((insp) => (
                    <div key={insp.inspection_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ background: getColor(insp.condition_score) }}
                      >
                        {Math.round(insp.condition_score)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-semibold text-gray-700">
                            {new Date(insp.inspection_date).toLocaleDateString("en-IN", {
                              day: "numeric", month: "short", year: "numeric",
                            })}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">
                            {insp.inspector_agency}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                          <span>Damage: {insp.surface_damage_pct}%</span>
                          <span>Drainage: {insp.drainage_status}</span>
                          {insp.waterlogging_flag && <span className="text-blue-500 font-medium">Waterlogged</span>}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────── */

function DetailItem({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
      <div className="flex items-center gap-1 text-gray-400 mb-0.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-[13px] font-bold text-gray-800 capitalize">{value}</p>
      <p className="text-[10px] text-gray-400">{sub}</p>
    </div>
  );
}

function Tag({ icon, label, color }: { icon?: React.ReactNode; label: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium capitalize"
      style={{
        background: color ? `${color}15` : "#f3f4f6",
        color: color || "#6b7280",
        border: `1px solid ${color ? `${color}30` : "#e5e7eb"}`,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function getColor(value: number): string {
  if (value >= 70) return "#059669";
  if (value >= 50) return "#22c55e";
  if (value >= 35) return "#eab308";
  if (value >= 20) return "#f97316";
  return "#ef4444";
}
