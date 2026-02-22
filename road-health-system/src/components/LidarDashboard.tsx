"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Box, Upload, Loader2, Move, ZoomIn, Info } from "lucide-react";

const PotreeViewer = dynamic(() => import("@/components/PotreeViewer"), { ssr: false });
import { uploadLidar } from "@/lib/lidarApi";

const DEMO_ROAD_METRICS = {
  pothole_count: 9,
  pothole_total_volume_m3: 2.84,
  avg_pothole_depth_mm: 195,
  max_pothole_depth_mm: 300,
  avg_rut_depth_mm: 35,
  max_rut_depth_mm: 42,
  roughness_proxy: 2.8,
  damaged_area_percent: 4.2,
  point_density_pts_per_m2: 237.5,
  lidar_quality_score: 62,
  crack_count_longitudinal: 7,
  crack_count_transverse: 6,
  alligator_patch: 1,
  block_crack_patch: 1,
};

export default function LidarDashboard() {
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [roadId, setRoadId] = useState("");
  const [lidarSource, setLidarSource] = useState<"mobile" | "drone" | "phone">("mobile");
  const [file, setFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!roadId.trim() || !file) {
      setUploadError("Enter road ID and select a file");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    const res = await uploadLidar(roadId.trim(), file, lidarSource);
    setUploading(false);
    if (res) {
      setUploadSuccess(`Scan uploaded. ID: ${res.scan_id}`);
      setFile(null);
    } else {
      setUploadError("Upload failed. Ensure LiDAR backend is running on port 8001.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page intro */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Road LiDAR</h1>
        <p className="text-sm text-gray-500 mt-1">
          View a 3D scan of road surface and its condition metrics. Upload your own scan or explore the demo below.
        </p>
      </div>

      {/* 1. Upload (optional) */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">1</span>
          <h2 className="text-base font-semibold text-gray-800">Upload a scan (optional)</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4 ml-8">Add a new point cloud for any road. Use .xyz, .las, or .laz.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Road ID</label>
            <input
              type="text"
              placeholder="e.g. MA-NH48-SEG-0001"
              value={roadId}
              onChange={(e) => setRoadId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              aria-label="Road ID"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
            <select
              value={lidarSource}
              onChange={(e) => setLidarSource(e.target.value as "mobile" | "drone" | "phone")}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              aria-label="LiDAR source"
            >
              <option value="mobile">Mobile</option>
              <option value="drone">Drone</option>
              <option value="phone">Phone</option>
            </select>
          </div>
          <div className="lg:col-span-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Point cloud file</label>
            <label className="flex items-center gap-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
              <Upload size={14} className="text-gray-400 shrink-0" />
              <span className="truncate text-gray-700">{file ? file.name : "Choose .xyz, .las or .laz"}</span>
              <input
                type="file"
                accept=".xyz,.las,.laz"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="lg:col-span-3 flex items-end">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
        {uploadSuccess && <p className="text-sm text-green-600 mt-3 ml-8">{uploadSuccess}</p>}
        {uploadError && <p className="text-sm text-red-600 mt-3 ml-8">{uploadError}</p>}
      </section>

      {/* 2. 3D Viewer */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">2</span>
          <h2 className="text-base font-semibold text-gray-800">Explore the 3D road scan</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3 ml-8">Drag to rotate, scroll to zoom. Colors show damage type and depth.</p>
        <div className="flex flex-wrap items-center gap-4 mb-3 ml-8">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <Move size={12} /> Drag — rotate
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <ZoomIn size={12} /> Scroll — zoom
          </span>
        </div>
        <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <PotreeViewer height={340} className="rounded-xl" />
        </div>
        <div className="mt-3 ml-8 flex flex-wrap gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#2d5016]" aria-hidden /> Good surface
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#c27a12]" aria-hidden /> Cracks
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#d1610d]" aria-hidden /> Potholes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#b81d0d]" aria-hidden /> Deep damage
          </span>
        </div>
      </section>

      {/* 3. What this scan shows — glassmorphism, theme-aligned */}
      <section
        className="rounded-2xl overflow-hidden shadow-lg"
        style={{
          background: "rgba(255, 255, 255, 0.45)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.6)",
          boxShadow: "0 8px 32px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
        }}
      >
        <div className="p-5 md:p-6">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white shadow-md"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
            >
              3
            </span>
            <h2 className="text-base font-semibold" style={{ color: "var(--foreground, #0f172a)" }}>
              What this scan shows
            </h2>
          </div>
          <p
            className="text-xs mb-5 ml-9 flex items-center gap-1.5"
            style={{ color: "var(--secondary, #64748b)" }}
          >
            <Info size={12} className="opacity-80" />
            Numbers below match the 3D scene above.
          </p>

          <div className="ml-9 space-y-5">
            <MetricGroup title="Potholes" icon="🕳️" tone="potholes">
              <MetricRow label="Count" value={String(DEMO_ROAD_METRICS.pothole_count)} />
              <MetricRow label="Total volume" value={`${DEMO_ROAD_METRICS.pothole_total_volume_m3} m³`} />
              <MetricRow label="Avg depth" value={`${DEMO_ROAD_METRICS.avg_pothole_depth_mm} mm`} />
              <MetricRow label="Max depth" value={`${DEMO_ROAD_METRICS.max_pothole_depth_mm} mm`} />
            </MetricGroup>
            <MetricGroup title="Ruts (wheel tracks)" tone="ruts">
              <MetricRow label="Avg depth" value={`${DEMO_ROAD_METRICS.avg_rut_depth_mm} mm`} />
              <MetricRow label="Max depth" value={`${DEMO_ROAD_METRICS.max_rut_depth_mm} mm`} />
            </MetricGroup>
            <MetricGroup title="Cracks" tone="cracks">
              <MetricRow label="Along road" value={String(DEMO_ROAD_METRICS.crack_count_longitudinal)} />
              <MetricRow label="Across road" value={String(DEMO_ROAD_METRICS.crack_count_transverse)} />
              <MetricRow label="Alligator (fatigue) patches" value={String(DEMO_ROAD_METRICS.alligator_patch)} />
              <MetricRow label="Block crack patches" value={String(DEMO_ROAD_METRICS.block_crack_patch)} />
            </MetricGroup>
            <MetricGroup title="Surface & quality" tone="surface">
              <MetricRow label="Damaged area" value={`${DEMO_ROAD_METRICS.damaged_area_percent}%`} />
              <MetricRow label="Roughness" value={String(DEMO_ROAD_METRICS.roughness_proxy)} />
              <MetricRow label="Point density" value={`${DEMO_ROAD_METRICS.point_density_pts_per_m2} pts/m²`} />
              <MetricRow label="Scan quality score" value={`${DEMO_ROAD_METRICS.lidar_quality_score} / 100`} />
            </MetricGroup>
          </div>
        </div>
      </section>
    </div>
  );
}

type MetricTone = "potholes" | "ruts" | "cracks" | "surface";

function MetricGroup({ title, icon, tone, children }: { title: string; icon?: string; tone: MetricTone; children: React.ReactNode }) {
  const tint =
    tone === "potholes"
      ? "rgba(248, 113, 22, 0.10)" // orange
      : tone === "ruts"
      ? "rgba(14, 165, 233, 0.10)" // cyan / accent
      : tone === "cracks"
      ? "rgba(234, 179, 8, 0.10)" // amber
      : "rgba(59, 130, 246, 0.10)"; // blue for surface/quality

  const borderTint =
    tone === "potholes"
      ? "rgba(248, 113, 22, 0.35)"
      : tone === "ruts"
      ? "rgba(14, 165, 233, 0.35)"
      : tone === "cracks"
      ? "rgba(234, 179, 8, 0.35)"
      : "rgba(59, 130, 246, 0.35)";

  return (
    <div
      className="rounded-xl p-3 md:p-4"
      style={{
        background: `linear-gradient(135deg, ${tint}, rgba(255,255,255,0.35))`,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `1px solid ${borderTint}`,
        boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)",
      }}
    >
      <h3
        className="text-sm font-medium mb-3 flex items-center gap-2"
        style={{ color: "var(--foreground, #0f172a)" }}
      >
        {icon && <span aria-hidden>{icon}</span>}
        <span style={{ color: "#c2410c" }}>{title}</span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">{children}</div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 transition-colors hover:opacity-90"
      style={{
        background: "rgba(255, 255, 255, 0.5)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(255, 255, 255, 0.6)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
      }}
    >
      <div
        className="text-[10px] font-medium uppercase tracking-wide mb-0.5"
        style={{ color: "var(--muted, #94a3b8)" }}
      >
        {label}
      </div>
      <div
        className="text-sm font-semibold"
        style={{ color: "var(--foreground, #0f172a)" }}
      >
        {value}
      </div>
    </div>
  );
}
