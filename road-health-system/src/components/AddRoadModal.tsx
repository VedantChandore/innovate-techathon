"use client";

import { useState } from "react";
import { RoadRecord, RoadWithScore } from "@/lib/types";
import { scoreRoad } from "@/lib/scoring";
import { X } from "lucide-react";

interface AddRoadModalProps {
  onClose: () => void;
  onAdd: (road: RoadWithScore) => void;
}

interface FormData {
  name: string;
  nh_number: string;
  segment_start_km: string;
  segment_end_km: string;
  jurisdiction: string;
  category: string;
  lane_count: string;
  surface_type: string;
  year_constructed: string;
  last_major_rehab_year: string;
  status: string;
  district: string;
  taluka: string;
  region_type: string;
  terrain_type: string;
  slope_category: string;
  monsoon_rainfall_category: string;
  landslide_prone: boolean;
  flood_prone: boolean;
  ghat_section_flag: boolean;
  tourism_route_flag: boolean;
  elevation_m: string;
  avg_daily_traffic: string;
  truck_percentage: string;
  notes: string;
}

const INITIAL: FormData = {
  name: "",
  nh_number: "",
  segment_start_km: "",
  segment_end_km: "",
  jurisdiction: "State PWD",
  category: "Inter-State",
  lane_count: "2",
  surface_type: "bitumen",
  year_constructed: "",
  last_major_rehab_year: "",
  status: "active",
  district: "",
  taluka: "",
  region_type: "coastal",
  terrain_type: "plain",
  slope_category: "flat",
  monsoon_rainfall_category: "medium",
  landslide_prone: false,
  flood_prone: false,
  ghat_section_flag: false,
  tourism_route_flag: false,
  elevation_m: "",
  avg_daily_traffic: "",
  truck_percentage: "",
  notes: "",
};

export default function AddRoadModal({ onClose, onAdd }: AddRoadModalProps) {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof FormData, value: string | boolean) =>
    setForm((p) => ({ ...p, [key]: value }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Required";
    if (!form.district.trim()) e.district = "Required";
    if (!form.segment_start_km) e.segment_start_km = "Required";
    if (!form.segment_end_km) e.segment_end_km = "Required";
    if (!form.year_constructed) e.year_constructed = "Required";
    if (!form.avg_daily_traffic) e.avg_daily_traffic = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    const startKm = parseFloat(form.segment_start_km);
    const endKm = parseFloat(form.segment_end_km);
    const lengthKm = Math.round((endKm - startKm) * 10) / 10;

    const newId = `MA-NEW-SEG-${String(Date.now()).slice(-4)}`;

    const road: RoadRecord = {
      road_id: newId,
      name: form.name,
      nh_number: form.nh_number || "N/A",
      segment_start_km: startKm,
      segment_end_km: endKm,
      jurisdiction: form.jurisdiction,
      category: form.category,
      length_km: lengthKm > 0 ? lengthKm : 1,
      lane_count: parseInt(form.lane_count) || 2,
      surface_type: form.surface_type as RoadRecord["surface_type"],
      year_constructed: parseInt(form.year_constructed),
      last_major_rehab_year: form.last_major_rehab_year
        ? parseInt(form.last_major_rehab_year)
        : null,
      status: form.status as RoadRecord["status"],
      geometry: "",
      notes: form.notes,
      state: "Maharashtra",
      district: form.district,
      taluka: form.taluka || form.district,
      region_type: form.region_type,
      terrain_type: form.terrain_type as RoadRecord["terrain_type"],
      slope_category: form.slope_category as RoadRecord["slope_category"],
      monsoon_rainfall_category:
        form.monsoon_rainfall_category as RoadRecord["monsoon_rainfall_category"],
      landslide_prone: form.landslide_prone,
      flood_prone: form.flood_prone,
      ghat_section_flag: form.ghat_section_flag,
      tourism_route_flag: form.tourism_route_flag,
      elevation_m: parseFloat(form.elevation_m) || 100,
      avg_daily_traffic: parseInt(form.avg_daily_traffic) || 0,
      truck_percentage: parseFloat(form.truck_percentage) || 15,
      peak_hour_traffic: Math.round((parseInt(form.avg_daily_traffic) || 0) * 0.1),
      traffic_weight: 1,
      seasonal_variation: "",
    };

    const healthScore = await scoreRoad(road);
    const roadWithScore: RoadWithScore = {
      ...road,
      healthScore,
      inspections: [],
    };

    setSubmitting(false);
    onAdd(roadWithScore);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 modal-backdrop animate-overlay-in" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Road Segment</h2>
            <p className="text-xs text-gray-400 mt-0.5">Enter road details to register a new segment</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 space-y-6">
          {/* Basic Info */}
          <Section title="Road Information">
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Road Name *"
                error={errors.name}
                span={2}
              >
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. NH48 Segment 501"
                  className={inputClass(errors.name)}
                />
              </Field>
              <Field label="NH Number">
                <input
                  type="text"
                  value={form.nh_number}
                  onChange={(e) => set("nh_number", e.target.value)}
                  placeholder="e.g. NH48"
                  className={inputClass()}
                />
              </Field>
              <Field label="District *" error={errors.district}>
                <input
                  type="text"
                  value={form.district}
                  onChange={(e) => set("district", e.target.value)}
                  placeholder="e.g. Pune"
                  className={inputClass(errors.district)}
                />
              </Field>
              <Field label="Taluka">
                <input
                  type="text"
                  value={form.taluka}
                  onChange={(e) => set("taluka", e.target.value)}
                  placeholder="e.g. Haveli"
                  className={inputClass()}
                />
              </Field>
              <Field label="Jurisdiction">
                <select value={form.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value)} className={inputClass()}>
                  <option>State PWD</option>
                  <option>NHAI</option>
                  <option>MSRDC</option>
                  <option>MMRDA</option>
                  <option>MSH</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* Segment Details */}
          <Section title="Segment Details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start KM *" error={errors.segment_start_km}>
                <input
                  type="number"
                  step="0.1"
                  value={form.segment_start_km}
                  onChange={(e) => set("segment_start_km", e.target.value)}
                  placeholder="0.0"
                  className={inputClass(errors.segment_start_km)}
                />
              </Field>
              <Field label="End KM *" error={errors.segment_end_km}>
                <input
                  type="number"
                  step="0.1"
                  value={form.segment_end_km}
                  onChange={(e) => set("segment_end_km", e.target.value)}
                  placeholder="0.0"
                  className={inputClass(errors.segment_end_km)}
                />
              </Field>
              <Field label="Surface Type">
                <select value={form.surface_type} onChange={(e) => set("surface_type", e.target.value)} className={inputClass()}>
                  <option value="bitumen">Bitumen</option>
                  <option value="concrete">Concrete</option>
                  <option value="gravel">Gravel</option>
                  <option value="earthen">Earthen</option>
                </select>
              </Field>
              <Field label="Lane Count">
                <select value={form.lane_count} onChange={(e) => set("lane_count", e.target.value)} className={inputClass()}>
                  <option>2</option>
                  <option>4</option>
                  <option>6</option>
                  <option>8</option>
                </select>
              </Field>
              <Field label="Year Constructed *" error={errors.year_constructed}>
                <input
                  type="number"
                  min="1950"
                  max="2026"
                  value={form.year_constructed}
                  onChange={(e) => set("year_constructed", e.target.value)}
                  placeholder="2015"
                  className={inputClass(errors.year_constructed)}
                />
              </Field>
              <Field label="Last Rehab Year">
                <input
                  type="number"
                  min="1950"
                  max="2026"
                  value={form.last_major_rehab_year}
                  onChange={(e) => set("last_major_rehab_year", e.target.value)}
                  placeholder="Optional"
                  className={inputClass()}
                />
              </Field>
              <Field label="Category">
                <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputClass()}>
                  <option>Inter-State</option>
                  <option>Intra-State</option>
                  <option>District Road</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass()}>
                  <option value="active">Active</option>
                  <option value="under_construction">Under Construction</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* Traffic Info */}
          <Section title="Traffic & Environment">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Avg Daily Traffic *" error={errors.avg_daily_traffic}>
                <input
                  type="number"
                  value={form.avg_daily_traffic}
                  onChange={(e) => set("avg_daily_traffic", e.target.value)}
                  placeholder="5000"
                  className={inputClass(errors.avg_daily_traffic)}
                />
              </Field>
              <Field label="Truck %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.truck_percentage}
                  onChange={(e) => set("truck_percentage", e.target.value)}
                  placeholder="15"
                  className={inputClass()}
                />
              </Field>
              <Field label="Terrain">
                <select value={form.terrain_type} onChange={(e) => set("terrain_type", e.target.value)} className={inputClass()}>
                  <option value="plain">Plain</option>
                  <option value="hilly">Hilly</option>
                  <option value="steep">Steep</option>
                </select>
              </Field>
              <Field label="Elevation (m)">
                <input
                  type="number"
                  value={form.elevation_m}
                  onChange={(e) => set("elevation_m", e.target.value)}
                  placeholder="100"
                  className={inputClass()}
                />
              </Field>
              <Field label="Monsoon Rainfall">
                <select value={form.monsoon_rainfall_category} onChange={(e) => set("monsoon_rainfall_category", e.target.value)} className={inputClass()}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </Field>
              <Field label="Region Type">
                <select value={form.region_type} onChange={(e) => set("region_type", e.target.value)} className={inputClass()}>
                  <option value="coastal">Coastal</option>
                  <option value="inland">Inland</option>
                  <option value="western_ghats">Western Ghats</option>
                  <option value="deccan_plateau">Deccan Plateau</option>
                </select>
              </Field>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Toggle label="Landslide Prone" checked={form.landslide_prone} onChange={(v) => set("landslide_prone", v)} />
              <Toggle label="Flood Prone" checked={form.flood_prone} onChange={(v) => set("flood_prone", v)} />
              <Toggle label="Ghat Section" checked={form.ghat_section_flag} onChange={(v) => set("ghat_section_flag", v)} />
              <Toggle label="Tourism Route" checked={form.tourism_route_flag} onChange={(v) => set("tourism_route_flag", v)} />
            </div>
          </Section>

          {/* Notes */}
          <Section title="Additional Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any additional information about this road segment..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
            />
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 h-9 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Scoring…" : "Add Road Segment"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Form Helpers ───────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[13px] font-bold text-gray-800 mb-3 pb-2 border-b border-gray-100">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  span,
  children,
}: {
  label: string;
  error?: string;
  span?: number;
  children: React.ReactNode;
}) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-200"
        }`}
        onClick={() => onChange(!checked)}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
      <span className="text-[12px] font-medium text-gray-600">{label}</span>
    </label>
  );
}

function inputClass(error?: string) {
  return `w-full h-9 px-3 rounded-xl border text-sm text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all ${
    error ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
  }`;
}
