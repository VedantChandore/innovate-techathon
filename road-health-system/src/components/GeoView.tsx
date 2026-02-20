"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Map, Search, X, ChevronDown, Layers, BarChart2, Sun, Moon, AlertTriangle, Activity } from "lucide-react";

/* ── Types ─────────────────────────────────────────────── */
interface SegmentData {
  // Identity
  segment_number: number;
  condition: "good" | "average" | "very_bad";
  name?: string;
  length_km?: number;
  segment_start_km?: number;
  segment_end_km?: number;
  // Geometry (start/end coords from CSV; full coords come from GeoJSON)
  start_lat?: number;
  start_lon?: number;
  end_lat?: number;
  end_lon?: number;
  // Road metadata
  highway_type?: string;
  lane_count?: number;
  surface_type?: string;
  year_constructed?: number;
  last_major_rehab_year?: number;
  status?: string;
  district?: string;
  taluka?: string;
  jurisdiction?: string;
  region_type?: string;
  // Terrain & environment
  terrain_type?: string;
  slope_category?: string;
  monsoon_rainfall_category?: string;
  landslide_prone?: boolean;
  flood_prone?: boolean;
  ghat_section_flag?: boolean;
  tourism_route_flag?: boolean;
  elevation_m?: number;
  // Traffic
  avg_daily_traffic?: number;
  truck_percentage?: number;
  peak_hour_traffic?: number;
  traffic_weight?: number;
  // Defects
  potholes_per_km?: number;
  pothole_avg_depth_cm?: number;
  cracks_longitudinal_pct?: number;
  cracks_transverse_per_km?: number;
  alligator_cracking_pct?: number;
  rutting_depth_mm?: number;
  raveling_pct?: number;
  edge_breaking_pct?: number;
  patches_per_km?: number;
  iri_value?: number;
  pci_score?: number;
}

interface AllHighwaysData {
  [nh: string]: { [featureId: string]: SegmentData };
}

interface SearchSegment {
  id: string;
  nh: string;
  segmentNumber: number;
  condition: string;
  district?: string;
  taluka?: string;
  name?: string;
}

interface Stats {
  total: number;
  good: number;
  average: number;
  very_bad: number;
  highways: number;
}

interface RiskStats {
  total: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
  hotspots: number;
  riskyTurns: number;
}

type LayerMode = "conditions" | "risk";

/* ── Constants ──────────────────────────────────────────── */
const CONDITION_COLORS: Record<string, string> = {
  good: "#22c55e",
  average: "#eab308",
  very_bad: "#ef4444",
  default: "#9ca3af",
};
const CONDITION_LABELS: Record<string, string> = {
  good: "Good", average: "Average", very_bad: "Poor", default: "Unknown",
};

const RISK_COLORS = { critical: "#dc2626", high: "#f97316", medium: "#facc15" };
const RISK_LABELS = { critical: "Critical Zone", high: "High Risk", medium: "Watch Zone" };

/* ── Risk Flag System ──────────────────────────────────────
   Anchored to actual dataset p90/p95 percentiles:
     PCI  p90=92  p95=96  → extreme low = <10, bad = <20
     IRI  p90=8.4 p95=9.2 → extreme high = >9,  bad = >8.4
     Poth p90=25  p95=28  → extreme = >27
     Rut  p90=32.6        → extreme = >36
   A segment earns "flags". Only segments with 2+ flags are
   shown as markers. This keeps risk points to the real ~5–10%.
──────────────────────────────────────────────────────────── */
function computeRiskFlags(seg: SegmentData): number {
  let flags = 0;
  // PCI extremes (p95 = <5, p90 = <10, bad = <20)
  if (seg.pci_score != null) {
    if (seg.pci_score < 5)       flags += 3;
    else if (seg.pci_score < 10) flags += 2;
    else if (seg.pci_score < 20) flags += 1;
  }
  // IRI extremes (p95 = >9.2, p90 = >8.4)
  if (seg.iri_value != null) {
    if (seg.iri_value > 9.5)     flags += 3;
    else if (seg.iri_value > 9)  flags += 2;
    else if (seg.iri_value > 8.4) flags += 1;
  }
  // Potholes extremes (p95 = >28)
  if (seg.potholes_per_km != null) {
    if (seg.potholes_per_km > 28) flags += 2;
    else if (seg.potholes_per_km > 25) flags += 1;
  }
  // Rutting extreme (p90 = >32.6)
  if ((seg.rutting_depth_mm ?? 0) > 36) flags += 1;
  return flags;
}

// Only segments with flags >= 2 are plotted as markers
// flags 5+ = critical, 3-4 = high, 2 = medium
function getFlagLevel(flags: number): "critical" | "high" | "medium" | null {
  if (flags >= 5) return "critical";
  if (flags >= 3) return "high";
  if (flags >= 2) return "medium";
  return null; // not risky enough to show
}

/* ── Sharp turn detector ─────────────────────────────────── */
// Only flags genuine hairpin bends using a meaningful segment-length
// filter — skips tiny coord pairs that cause false positives.
function hasSharpTurn(coords: number[][]): boolean {
  if (!coords || coords.length < 3) return false;
  for (let i = 1; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i - 1];
    const [x2, y2] = coords[i];
    const [x3, y3] = coords[i + 1];
    // Skip if segment legs are too short (coord noise)
    const d1 = Math.hypot(x2 - x1, y2 - y1);
    const d2 = Math.hypot(x3 - x2, y3 - y2);
    if (d1 < 0.002 || d2 < 0.002) continue; // ~200m minimum
    const b1 = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
    const b2 = Math.atan2(y3 - y2, x3 - x2) * (180 / Math.PI);
    let diff = Math.abs(b2 - b1);
    if (diff > 180) diff = 360 - diff;
    if (diff > 100) return true; // genuine hairpin
  }
  return false;
}

function getMidpoint(coords: number[][]): [number, number] | null {
  if (!coords || coords.length === 0) return null;
  const mid = coords[Math.floor(coords.length / 2)];
  return [mid[1], mid[0]]; // [lat, lng]
}

function getHighwayColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
}

/* ── Main Component ─────────────────────────────────────── */
export default function GeoView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const highwayLayersRef = useRef<Record<string, L.GeoJSON>>({});     // conditions layer
  const riskLayersRef    = useRef<Record<string, L.GeoJSON>>({});     // risk layer
  const hotspotLayerRef  = useRef<L.LayerGroup | null>(null);         // accident hotspot markers
  const turnLayerRef     = useRef<L.LayerGroup | null>(null);         // risky turn markers
  const highwayColorsRef = useRef<Record<string, string>>({});
  const allHighwaysDataRef = useRef<AllHighwaysData>({});
  const isDarkRef = useRef(false);
  const layerModeRef = useRef<LayerMode>("conditions");

  const [loading, setLoading]         = useState(true);
  const [loadingMsg, setLoadingMsg]   = useState("Initialising map…");
  const [isDark, setIsDark]           = useState(false);
  const [layerMode, setLayerMode]     = useState<LayerMode>("conditions");
  const [activeNH, setActiveNH]       = useState("ALL");
  const [nhKeys, setNhKeys]           = useState<string[]>([]);
  const [stats, setStats]             = useState<Stats>({ total: 0, good: 0, average: 0, very_bad: 0, highways: 0 });
  const [riskStats, setRiskStats]     = useState<RiskStats>({ total: 0, low: 0, medium: 0, high: 0, critical: 0, hotspots: 0, riskyTurns: 0 });
  const [searchTerm, setSearchTerm]   = useState("");
  const [searchResults, setSearchResults] = useState<SearchSegment[]>([]);
  const [searchIndex, setSearchIndex] = useState<SearchSegment[]>([]);
  const [nhSelectorOpen, setNhSelectorOpen] = useState(false);

  /* ── Theme derived ── */
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);
  const panelBg      = isDark ? "rgba(15,23,42,0.90)"        : "rgba(255,255,255,0.92)";
  const panelBorder  = isDark ? "rgba(255,255,255,0.10)"     : "rgba(0,0,0,0.10)";
  const textPrimary  = isDark ? "#f9fafb"                    : "#111827";
  const textSecondary= isDark ? "rgba(255,255,255,0.50)"     : "#6b7280";
  const textMuted    = isDark ? "rgba(255,255,255,0.30)"     : "#9ca3af";
  const hoverBg      = isDark ? "rgba(255,255,255,0.05)"     : "rgba(0,0,0,0.04)";
  const statCellBg   = isDark ? "rgba(255,255,255,0.04)"     : "rgba(0,0,0,0.04)";
  const statCellBorder = isDark ? "rgba(255,255,255,0.06)"   : "rgba(0,0,0,0.08)";
  const barTrackBg   = isDark ? "rgba(255,255,255,0.06)"     : "rgba(0,0,0,0.08)";
  const scrollColor  = isDark ? "#374151 transparent"        : "#d1d5db transparent";
  const nhBtnInactive = isDark
    ? "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10"
    : "bg-black/5 text-gray-600 hover:bg-black/10 hover:text-gray-900 border border-black/10";
  const panelShadow  = isDark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.10)";

  /* ── Switch layers on mode change ── */
  const applyLayerMode = useCallback((mode: LayerMode, nh: string) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    layerModeRef.current = mode;

    const condLayers = highwayLayersRef.current;
    const riskLyrMap = riskLayersRef.current;
    const hotLayer   = hotspotLayerRef.current;
    const turnLayer  = turnLayerRef.current;
    const nhsToShow  = nh === "ALL" ? Object.keys(condLayers) : [nh];

    if (mode === "conditions") {
      Object.entries(condLayers).forEach(([k, l]) => {
        if (nhsToShow.includes(k)) { if (!map.hasLayer(l)) l.addTo(map); }
        else { if (map.hasLayer(l)) map.removeLayer(l); }
      });
      Object.values(riskLyrMap).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
      if (hotLayer  && map.hasLayer(hotLayer))  map.removeLayer(hotLayer);
      if (turnLayer && map.hasLayer(turnLayer)) map.removeLayer(turnLayer);
    } else {
      Object.values(condLayers).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
      Object.entries(riskLyrMap).forEach(([k, l]) => {
        if (nhsToShow.includes(k)) { if (!map.hasLayer(l)) l.addTo(map); }
        else { if (map.hasLayer(l)) map.removeLayer(l); }
      });
      if (hotLayer)  { if (!map.hasLayer(hotLayer))  hotLayer.addTo(map); }
      if (turnLayer) { if (!map.hasLayer(turnLayer)) turnLayer.addTo(map); }
    }
  }, []);

  /* ── Compute condition stats ── */
  const computeStats = useCallback((nh: string) => {
    const data = allHighwaysDataRef.current;
    const highways = nh === "ALL" ? Object.keys(data) : [nh];
    let total = 0, good = 0, average = 0, very_bad = 0;
    highways.forEach(h => Object.values(data[h] || {}).forEach(seg => {
      total++;
      if (seg.condition === "good") good++;
      else if (seg.condition === "average") average++;
      else if (seg.condition === "very_bad") very_bad++;
    }));
    setStats({ total, good, average, very_bad, highways: nh === "ALL" ? Object.keys(data).length : 1 });
  }, []);

  /* ── Compute risk stats ── */
  const computeRiskStats = useCallback((nh: string) => {
    const data = allHighwaysDataRef.current;
    const highways = nh === "ALL" ? Object.keys(data) : [nh];
    let total = 0, medium = 0, high = 0, critical = 0, hotspots = 0, riskyTurns = 0;
    highways.forEach(h => Object.values(data[h] || {}).forEach(seg => {
      total++;
      const fl = getFlagLevel(computeRiskFlags(seg));
      if (fl === "medium") medium++;
      else if (fl === "high") high++;
      else if (fl === "critical") critical++;
      if (fl === "critical" || fl === "high") hotspots++;
      // riskyTurns counted separately during map build (needs GeoJSON geometry)
    }));
    setRiskStats({ total, low: total - medium - high - critical, medium, high, critical, hotspots, riskyTurns: 0 });
  }, []);

  /* ── Map fly to NH ── */
  const updateMapView = useCallback((nh: string) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const mode = layerModeRef.current;
    const srcLayers = mode === "conditions" ? highwayLayersRef.current : riskLayersRef.current;

    if (nh !== "ALL" && srcLayers[nh]) {
      const bounds = srcLayers[nh].getBounds();
      if (bounds.isValid()) map.flyToBounds(bounds, { padding: [60, 60], duration: 1.2 });
    } else {
      const allB: L.LatLngBounds[] = [];
      Object.values(srcLayers).forEach(l => { const b = l.getBounds(); if (b.isValid()) allB.push(b); });
      if (allB.length) {
        let combined = allB[0];
        allB.forEach(b => combined.extend(b));
        map.flyToBounds(combined, { padding: [60, 60], duration: 1.2 });
      }
    }
  }, []);

  const selectNH = useCallback((nh: string) => {
    setActiveNH(nh);
    setNhSelectorOpen(false);
    computeStats(nh);
    computeRiskStats(nh);
    applyLayerMode(layerModeRef.current, nh);
    updateMapView(nh);
  }, [computeStats, computeRiskStats, applyLayerMode, updateMapView]);

  const switchLayer = useCallback((mode: LayerMode) => {
    setLayerMode(mode);
    applyLayerMode(mode, activeNH);
  }, [applyLayerMode, activeNH]);

  /* ── Toggle map tile theme ── */
  const toggleTheme = useCallback(async () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const L = (await import("leaflet")).default;
    setIsDark(prev => {
      const next = !prev;
      if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
      const tileUrl = next
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
      const newTile = L.tileLayer(tileUrl, { attribution: "&copy; CartoDB &copy; OpenStreetMap", maxZoom: 19 });
      newTile.addTo(map);
      newTile.bringToBack();
      tileLayerRef.current = newTile;
      return next;
    });
  }, []);

  /* ── Search ── */
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const q = searchTerm.toLowerCase();
    setSearchResults(
      searchIndex.filter(s =>
        s.segmentNumber.toString().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.nh.toLowerCase().includes(q) ||
        s.district?.toLowerCase().includes(q) ||
        s.taluka?.toLowerCase().includes(q)
      ).slice(0, 10)
    );
  }, [searchTerm, searchIndex]);

  const zoomToSegment = useCallback((seg: SearchSegment) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    // Look up the full data to get start coords
    const fullSeg = allHighwaysDataRef.current[seg.nh]?.[seg.id];
    if (fullSeg?.start_lat && fullSeg?.start_lon) {
      map.flyTo([fullSeg.start_lat, fullSeg.start_lon], 14, { duration: 1.5 });
    }
    setSearchTerm(""); setSearchResults([]);
  }, []);

  /* ── Init Map ── */
  useEffect(() => {
    if (mapInstanceRef.current) return;
    let cancelled = false;

    async function init() {
      if (!mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (typeof document !== "undefined" && !document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (cancelled || mapInstanceRef.current) return;

      setLoadingMsg("Loading highway data…");
      const map = L.map(mapRef.current, { zoomControl: false }).setView([18.5, 74.0], 8);
      mapInstanceRef.current = map;

      const tile = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; CartoDB &copy; OpenStreetMap", maxZoom: 19,
      });
      tile.addTo(map);
      tileLayerRef.current = tile;
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // ── Load data ──
      let allData: AllHighwaysData = {};
      try {
        const res = await fetch("/ultimate_dataset.json");
        allData = await res.json();
      } catch (e) { console.error("Failed to load highway data", e); }

      allHighwaysDataRef.current = allData;
      const keys = Object.keys(allData);
      keys.forEach(nh => { highwayColorsRef.current[nh] = getHighwayColor(nh); });
      setNhKeys(keys);
      setLoadingMsg("Rendering highways…");

      // ── Load GeoJSON ──
      try {
        const geoRes  = await fetch("/NH.geojson");
        const geojson: GeoJSON.FeatureCollection = await geoRes.json();

        const featuresByRef: Record<string, GeoJSON.Feature[]> = {};
        geojson.features.forEach(feat => {
          const ref = ((feat.properties?.ref as string) || "").split(";")[0].trim();
          if (!ref) return;
          if (!featuresByRef[ref]) featuresByRef[ref] = [];
          featuresByRef[ref].push(feat);
        });

        // Hotspot & turn marker groups
        const hotspotGroup = L.layerGroup();
        const turnGroup    = L.layerGroup();
        hotspotLayerRef.current = hotspotGroup;
        turnLayerRef.current    = turnGroup;

        let riskLow = 0, riskMed = 0, riskHigh = 0, riskCrit = 0, hotspots = 0, risky = 0;

        keys.forEach(nh => {
          const nhData    = allData[nh] || {};
          const nhFeatures = featuresByRef[nh] || [];
          if (!nhFeatures.length) return;

          const miniGeo: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: nhFeatures };

          /* ── CONDITIONS LAYER ── */
          const condLayer = L.geoJSON(miniGeo, {
            style: feature => {
              const fid = feature?.id as string;
              const seg = nhData[fid];
              const condition = seg?.condition || "default";
              if (feature) {
                feature.properties = {
                  ...feature.properties,
                  roadCondition: condition,
                  matchedNH: nh,
                  segmentNumber: seg?.segment_number ?? "N/A",
                  segmentData: seg ?? null,
                };
              }
              return { color: CONDITION_COLORS[condition], weight: 6, opacity: 0.85, lineJoin: "round", lineCap: "round" };
            },
            onEachFeature: (feature, lyr) => {
              const ref       = (feature.properties?.matchedNH as string) || (feature.properties?.ref as string) || "Unknown";
              const condition = (feature.properties?.roadCondition as string) || "default";
              const segmentNum = feature.properties?.segmentNumber;
              const segData: SegmentData | null = feature.properties?.segmentData ?? null;
              const condColor  = CONDITION_COLORS[condition] || CONDITION_COLORS.default;
              const accentColor = highwayColorsRef.current[ref] || "#6b7280";

              lyr.on("click", function () {
                const dark = isDarkRef.current;
                const bg = dark ? "#1f2937" : "#fff";
                const txt = dark ? "white" : "#111827";
                const muted = dark ? "#9ca3af" : "#6b7280";
                const border = dark ? "#374151" : "#e5e7eb";
                const cls = dark ? "dark-popup" : "light-popup";

                const rows = segData ? ([
                  ["District", segData.district], ["Taluka", segData.taluka],
                  ["Surface", segData.surface_type], ["Lanes", segData.lane_count],
                  ["Terrain", segData.terrain_type], ["Slope", segData.slope_category],
                  ["Jurisdiction", segData.jurisdiction], ["Region", segData.region_type],
                  ["Traffic", segData.avg_daily_traffic ? `${Number(segData.avg_daily_traffic).toLocaleString()} veh/day` : null],
                  ["Peak Hour", segData.peak_hour_traffic ? `${Number(segData.peak_hour_traffic).toLocaleString()} veh/hr` : null],
                  ["Truck %", segData.truck_percentage ? `${segData.truck_percentage}%` : null],
                  ["Elevation", segData.elevation_m ? `${segData.elevation_m} m` : null],
                  ["Rainfall", segData.monsoon_rainfall_category],
                  ["Built", segData.year_constructed], ["Last Rehab", segData.last_major_rehab_year],
                  ["Length", segData.length_km ? `${segData.length_km} km` : null],
                ] as [string, string | number | null | undefined][])
                  .filter(([, v]) => v != null)
                  .map(([k, v]) => `<tr><td style="color:${muted};padding:2px 8px 2px 0;font-size:12px;white-space:nowrap">${k}</td><td style="color:${txt};font-size:12px;font-weight:500">${v}</td></tr>`)
                  .join("") : "";

                // Hazard badges
                const hazards = [
                  segData?.ghat_section_flag   ? `<span style="background:#7c3aed;color:white;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600">⛰ Ghat</span>`       : "",
                  segData?.landslide_prone      ? `<span style="background:#92400e;color:white;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600">🏔 Landslide</span>` : "",
                  segData?.flood_prone          ? `<span style="background:#1d4ed8;color:white;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600">🌊 Flood</span>`     : "",
                  segData?.tourism_route_flag   ? `<span style="background:#0f766e;color:white;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600">📍 Tourism</span>`   : "",
                ].filter(Boolean).join(" ");

                const defects = segData ? ([
                  ["Potholes", segData.potholes_per_km, "/km"], ["Pothole Depth", segData.pothole_avg_depth_cm, " cm"],
                  ["Long. Cracks", segData.cracks_longitudinal_pct, "%"], ["Trans. Cracks", segData.cracks_transverse_per_km, "/km"],
                  ["Alligator", segData.alligator_cracking_pct, "%"], ["Rutting", segData.rutting_depth_mm, " mm"],
                  ["Raveling", segData.raveling_pct, "%"], ["Edge Breaking", segData.edge_breaking_pct, "%"],
                  ["Patches", segData.patches_per_km, "/km"], ["IRI", segData.iri_value, " m/km"],
                  ["PCI Score", segData.pci_score, "/100"],
                ] as [string, number | undefined, string][])
                  .filter(([, v]) => v != null)
                  .map(([k, v, u]) => {
                    let vc = txt;
                    if (k === "PCI Score" && v != null) vc = v >= 70 ? "#22c55e" : v >= 40 ? "#eab308" : "#ef4444";
                    else if (k === "IRI" && v != null) vc = v <= 2.5 ? "#22c55e" : v <= 4.5 ? "#eab308" : "#ef4444";
                    else if (k === "Potholes" && v != null) vc = v <= 2 ? "#22c55e" : v <= 10 ? "#eab308" : "#ef4444";
                    return `<tr><td style="color:${muted};padding:2px 8px 2px 0;font-size:12px;white-space:nowrap">${k}</td><td style="color:${vc};font-size:12px;font-weight:600">${v}${u}</td></tr>`;
                  }).join("") : "";

                const html = `<div style="font-family:-apple-system,sans-serif;min-width:260px;background:${bg};color:${txt};padding:16px;border-radius:10px;margin:-14px -20px;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                    <span style="background:${accentColor};color:white;padding:3px 10px;border-radius:4px;font-size:13px;font-weight:600">${ref}</span>
                    <span style="font-size:13px;color:${muted}">Seg #${segmentNum}</span>
                  </div>
                  <div style="padding:8px 12px;background:${condColor}22;border-radius:6px;border-left:3px solid ${condColor};margin-bottom:${hazards ? 8 : 10}px">
                    <span style="color:${condColor};font-weight:600;font-size:14px">${CONDITION_LABELS[condition]}</span>
                  </div>
                  ${hazards ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">${hazards}</div>` : ""}
                  ${rows ? `<table style="width:100%">${rows}</table>` : ""}
                  ${defects ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid ${border}"><div style="font-size:11px;color:${muted};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:6px">Defects & Roughness</div><table style="width:100%">${defects}</table></div>` : ""}
                </div>`;
                (lyr as L.Path).unbindPopup();
                (lyr as L.Path).bindPopup(html, { className: cls, closeButton: true, maxWidth: 320 });
                (lyr as L.Path).openPopup();
              });
              lyr.on("mouseover", function (this: L.Path) { this.setStyle({ weight: 10, opacity: 1 }); });
              lyr.on("mouseout", function (this: L.Path) { this.setStyle({ weight: 6, opacity: 0.85, color: CONDITION_COLORS[condition] }); });
            },
          });
          condLayer.addTo(map);
          highwayLayersRef.current[nh] = condLayer;

          /* ── RISK LAYER ──
             In risk mode the highway is drawn in neutral gray.
             Only genuinely dangerous segments (flags ≥ 2) get
             a coloured circle marker placed at their midpoint.
             This means only ~15–20% of segments are highlighted,
             and only the worst ~5% get a critical marker.
          ── */
          const riskLayer = L.geoJSON(miniGeo, {
            style: () => ({
              color: "#94a3b8",   // neutral slate — highway outline only
              weight: 4,
              opacity: 0.5,
              lineJoin: "round" as const,
              lineCap: "round" as const,
            }),
          });
          riskLayersRef.current[nh] = riskLayer;
          // Don't add risk layer yet (conditions is default)

          // ── Build risk point markers using GeoJSON feature geometry ──
          miniGeo.features.forEach(feature => {
            const featureId = feature.id as string;
            const seg = nhData[featureId];
            if (!seg) return;

            // Extract coordinates from GeoJSON geometry
            const geomCoords: number[][] =
              feature.geometry.type === "LineString"
                ? (feature.geometry as GeoJSON.LineString).coordinates
                : feature.geometry.type === "MultiLineString"
                  ? (feature.geometry as GeoJSON.MultiLineString).coordinates.flat()
                  : [];

            const flags = computeRiskFlags(seg);
            const fl    = getFlagLevel(flags);
            const mid   = getMidpoint(geomCoords);
            if (!mid) return;

            // Risky turn marker — uses actual GeoJSON geometry
            const isTurn = hasSharpTurn(geomCoords);
            if (isTurn) {
              risky++;
              const turnHtml = `<div style="
                width:20px;height:20px;border-radius:50%;
                background:#f59e0b;border:2.5px solid white;
                box-shadow:0 2px 6px rgba(245,158,11,0.6);
                display:flex;align-items:center;justify-content:center;
                font-size:11px;color:white;font-weight:700;line-height:1;
              ">↺</div>`;
              const icon = L.divIcon({ html: turnHtml, className: "", iconSize: [20, 20], iconAnchor: [10, 10] });
              const marker = L.marker(mid, { icon });
              marker.bindTooltip(
                `<b>↺ Risky Turn</b><br/>${seg.district ?? ""} · ${seg.taluka ?? ""}`,
                { direction: "top", offset: [0, -12] }
              );
              turnGroup.addLayer(marker);
            }

            // Risk zone marker — only for genuinely bad segments (flags ≥ 2)
            if (!fl) return;

            const rColor = RISK_COLORS[fl];
            const rLabel = RISK_LABELS[fl];
            const isCritical = fl === "critical";

            // Build factors list
            const factors: string[] = [];
            if (seg.pci_score != null && seg.pci_score < 20)    factors.push(`PCI ${seg.pci_score} (critical)`);
            if (seg.iri_value != null && seg.iri_value > 8.4)   factors.push(`IRI ${seg.iri_value} m/km`);
            if ((seg.potholes_per_km ?? 0) > 25)                factors.push(`${seg.potholes_per_km} potholes/km`);
            if ((seg.rutting_depth_mm ?? 0) > 36)               factors.push(`Rutting ${seg.rutting_depth_mm} mm`);
            if (seg.landslide_prone)                             factors.push("Landslide prone");
            if (seg.flood_prone)                                 factors.push("Flood prone");
            if (seg.ghat_section_flag)                          factors.push("Ghat section");
            if (isTurn)                                          factors.push("Sharp turn");

            const size = isCritical ? 26 : fl === "high" ? 20 : 16;
            const markerHtml = `<div style="
              width:${size}px;height:${size}px;border-radius:50%;
              background:${rColor};border:${isCritical ? 3 : 2}px solid white;
              box-shadow:0 2px 8px ${rColor}99${isCritical ? `,0 0 0 4px ${rColor}44` : ""};
              ${isCritical ? "animation:pulse-hotspot 1.8s ease-in-out infinite;" : ""}
              display:flex;align-items:center;justify-content:center;
              font-size:${isCritical ? 13 : 10}px;color:white;font-weight:800;line-height:1;
            ">${isCritical ? "!" : "▲"}</div>`;

            const icon = L.divIcon({ html: markerHtml, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
            const marker = L.marker(mid, { icon });

            marker.bindPopup((() => {
              const dark = isDarkRef.current;
              const bg   = dark ? "#1f2937" : "#fff";
              const txt  = dark ? "white"   : "#111827";
              const muted = dark ? "#9ca3af" : "#6b7280";
              const cls  = dark ? "dark-popup" : "light-popup";
              const extraBadges = [
                seg.ghat_section_flag   ? `<span style="background:#7c3aed;color:white;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600">⛰ Ghat</span>`       : "",
                seg.landslide_prone     ? `<span style="background:#92400e;color:white;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600">🏔 Landslide</span>` : "",
                seg.flood_prone         ? `<span style="background:#1d4ed8;color:white;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600">🌊 Flood</span>`     : "",
              ].filter(Boolean).join(" ");
              return L.popup({ className: cls, closeButton: true, maxWidth: 310 }).setContent(
                `<div style="font-family:-apple-system,sans-serif;min-width:240px;background:${bg};color:${txt};padding:16px;border-radius:10px;margin:-14px -20px;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                    <span style="background:${highwayColorsRef.current[nh]||"#6b7280"};color:white;padding:3px 10px;border-radius:4px;font-size:13px;font-weight:600">${nh}</span>
                    <span style="font-size:12px;color:${muted}">Seg #${seg.segment_number}${seg.name ? ` · ${seg.name}` : ""}</span>
                  </div>
                  <div style="padding:8px 12px;background:${rColor}22;border-radius:6px;border-left:3px solid ${rColor};margin-bottom:${extraBadges ? 8 : 0}px">
                    <span style="color:${rColor};font-weight:700;font-size:14px">${rLabel}</span>
                  </div>
                  ${extraBadges ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">${extraBadges}</div>` : ""}
                  ${factors.length ? `<div style="font-size:11px;font-weight:700;color:${muted};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">Risk Factors</div>${factors.map(f=>`<div style="font-size:12px;color:${txt};padding:1px 0">• ${f}</div>`).join("")}` : ""}
                  <div style="margin-top:10px;font-size:11px;color:${muted}">${seg.district ?? ""}${seg.taluka ? ` · ${seg.taluka}` : ""}${seg.avg_daily_traffic ? ` · ${seg.avg_daily_traffic.toLocaleString()} veh/day` : ""}${seg.terrain_type ? ` · ${seg.terrain_type}` : ""}</div>
                </div>`
              );
            })());

            hotspotGroup.addLayer(marker);
            if (isCritical) hotspots++;

            // count for stats
            if (fl === "medium") riskMed++;
            else if (fl === "high") riskHigh++;
            else riskCrit++;
          });
        });

        // Fit to all highways
        const allBounds: L.LatLngBounds[] = [];
        Object.values(highwayLayersRef.current).forEach(l => { const b = l.getBounds(); if (b.isValid()) allBounds.push(b); });
        if (allBounds.length) {
          let combined = allBounds[0];
          allBounds.forEach(b => combined.extend(b));
          map.fitBounds(combined, { padding: [60, 60] });
        }

        const total = riskLow + riskMed + riskHigh + riskCrit;
        setRiskStats({ total, low: riskLow, medium: riskMed, high: riskHigh, critical: riskCrit, hotspots, riskyTurns: risky });
      } catch (e) { console.error("Failed to load GeoJSON", e); }

      // Build search index + condition stats
      const idx: SearchSegment[] = [];
      let t = 0, g = 0, a = 0, vb = 0;
      Object.entries(allData).forEach(([nh, nhData]) => {
        Object.entries(nhData).forEach(([id, seg]) => {
          idx.push({ id, nh, segmentNumber: seg.segment_number, condition: seg.condition, district: seg.district, taluka: seg.taluka, name: seg.name });
          t++; if (seg.condition === "good") g++; else if (seg.condition === "average") a++; else if (seg.condition === "very_bad") vb++;
        });
      });
      setSearchIndex(idx);
      setStats({ total: t, good: g, average: a, very_bad: vb, highways: keys.length });
      setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const sortedNHKeys = (() => {
    const priority = ["NH48", "NH60", "NH65", "NH160"];
    const pSet = new Set(priority);
    return priority.filter(k => nhKeys.includes(k)).concat(nhKeys.filter(k => !pSet.has(k)).sort());
  })();

  /* ── Render ── */
  return (
    <div className="flex h-full w-full relative" style={{ minHeight: "calc(100vh - 67px)" }}>

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="absolute inset-0 z-2000 flex items-center justify-center" style={{ background: "rgba(248,250,252,0.92)", backdropFilter: "blur(8px)" }}>
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-orange-500/30">
              <Map size={28} className="text-white" />
            </div>
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin mx-auto mb-3" />
            <p className="text-gray-800 font-semibold text-[15px]">{loadingMsg}</p>
            <p className="text-gray-400 text-[12px] mt-1">Maharashtra National Highways</p>
          </div>
        </div>
      )}

      {/* ── Layer Mode Toggle — top centre ── */}
      {!loading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-1000 flex rounded-xl overflow-hidden"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: panelShadow }}>
          <button
            onClick={() => switchLayer("conditions")}
            className="flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold transition-all"
            style={{
              background: layerMode === "conditions" ? "#f97316" : "transparent",
              color: layerMode === "conditions" ? "white" : textSecondary,
            }}
          >
            <Activity size={13} />
            Road Conditions
          </button>
          <button
            onClick={() => switchLayer("risk")}
            className="flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold transition-all"
            style={{
              background: layerMode === "risk" ? "#ef4444" : "transparent",
              color: layerMode === "risk" ? "white" : textSecondary,
            }}
          >
            <AlertTriangle size={13} />
            Risk Analysis
          </button>
        </div>
      )}

      {/* ── Side Panel ── */}
      <aside className="absolute left-3 top-3 z-1000 flex flex-col gap-3 overflow-y-auto"
        style={{ width: 300, maxHeight: "calc(100% - 24px)", scrollbarWidth: "none" }}>

        {/* Header */}
        <div className="rounded-xl p-4 backdrop-blur-xl"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: panelShadow }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center shadow-md shadow-orange-500/30">
                <Map size={14} className="text-white" />
              </div>
              <span className="font-bold text-[15px]" style={{ color: textPrimary }}>GeoView</span>
            </div>
            <button onClick={toggleTheme} title={isDark ? "Switch to Light" : "Switch to Dark"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-200 text-[11px] font-semibold"
              style={{ background: isDark ? "rgba(249,115,22,0.15)" : "rgba(0,0,0,0.07)", color: isDark ? "#fb923c" : "#374151", border: `1px solid ${isDark ? "rgba(249,115,22,0.30)" : "rgba(0,0,0,0.12)"}` }}>
              {isDark ? <Sun size={12} /> : <Moon size={12} />}
              {isDark ? "Light" : "Dark"}
            </button>
          </div>
          <p className="text-[11px] mt-1" style={{ color: textMuted }}>Maharashtra National Highways</p>
        </div>

        {/* NH Selector */}
        <div className="rounded-xl backdrop-blur-xl overflow-hidden"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: panelShadow }}>
          <button onClick={() => setNhSelectorOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors"
            style={{ color: textSecondary }}>
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-orange-400" />
              <span className="text-[13px] font-semibold" style={{ color: textPrimary }}>
                {activeNH === "ALL" ? `All Highways (${stats.highways})` : activeNH}
              </span>
            </div>
            <ChevronDown size={14} className={`transition-transform ${nhSelectorOpen ? "rotate-180" : ""}`} />
          </button>
          {nhSelectorOpen && (
            <div className="px-3 pb-3 max-h-52 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: scrollColor }}>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => selectNH("ALL")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${activeNH === "ALL" ? "bg-orange-500 text-white shadow-md shadow-orange-500/30" : nhBtnInactive}`}>All</button>
                {sortedNHKeys.map(nh => (
                  <button key={nh} onClick={() => selectNH(nh)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${activeNH === nh ? "bg-orange-500 text-white shadow-md shadow-orange-500/30" : nhBtnInactive}`}>{nh}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="rounded-xl backdrop-blur-xl"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: panelShadow }}>
          <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: `1px solid ${panelBorder}` }}>
            <Search size={13} className="shrink-0" style={{ color: textMuted }} />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search segment, district…"
              className="flex-1 text-[12px] outline-none bg-transparent"
              style={{ color: textPrimary }} />
            {searchTerm && <button onClick={() => { setSearchTerm(""); setSearchResults([]); }}><X size={12} style={{ color: textMuted }} /></button>}
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-44 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: scrollColor }}>
              {searchResults.map(seg => (
                <button key={seg.id} onClick={() => zoomToSegment(seg)}
                  className="w-full text-left px-3 py-2 transition-colors"
                  style={{ borderBottom: `1px solid ${panelBorder}` }}
                  onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold" style={{ color: textPrimary }}>Segment #{seg.segmentNumber}</span>
                    <span className="text-[10px]" style={{ color: textMuted }}>{seg.nh}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: CONDITION_COLORS[seg.condition] }} />
                    <span className="text-[11px]" style={{ color: CONDITION_COLORS[seg.condition] }}>{CONDITION_LABELS[seg.condition]}</span>
                    {seg.district && <span className="text-[11px]" style={{ color: textMuted }}>· {seg.district}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchTerm && !searchResults.length && <p className="text-[12px] text-center py-3" style={{ color: textMuted }}>No results found</p>}
        </div>

        {/* Stats — switches between conditions & risk */}
        <div className="rounded-xl backdrop-blur-xl p-4"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: panelShadow }}>
          <div className="flex items-center gap-2 mb-3">
            {layerMode === "conditions"
              ? <Activity size={13} className="text-orange-400" />
              : <AlertTriangle size={13} className="text-red-400" />}
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: textSecondary }}>
              {layerMode === "conditions" ? "Condition Stats" : "Risk Stats"}
            </span>
          </div>

          {layerMode === "conditions" ? (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[{ label: "Segments", val: stats.total }, { label: "Highways", val: stats.highways }].map(({ label, val }) => (
                  <div key={label} className="rounded-lg p-3 text-center" style={{ background: statCellBg, border: `1px solid ${statCellBorder}` }}>
                    <div className="text-[22px] font-bold leading-none" style={{ color: textPrimary }}>{val.toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: textMuted }}>{label}</div>
                  </div>
                ))}
              </div>
              {[{ label: "Good", key: "good" as const, color: "#22c55e" }, { label: "Average", key: "average" as const, color: "#eab308" }, { label: "Poor", key: "very_bad" as const, color: "#ef4444" }].map(({ label, key, color }) => {
                const count = stats[key]; const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={key} className="mb-2 last:mb-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: color }} /><span className="text-[11px]" style={{ color: textSecondary }}>{label}</span></div>
                      <span className="text-[11px] font-semibold" style={{ color: textPrimary }}>{count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: barTrackBg }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              {/* Risk hotspot summary cards */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-lg p-3 text-center" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <div className="text-[22px] font-bold leading-none text-red-500">{riskStats.hotspots}</div>
                  <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: textMuted }}>Hotspots</div>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <div className="text-[22px] font-bold leading-none text-amber-500">{riskStats.riskyTurns}</div>
                  <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: textMuted }}>Risky Turns</div>
                </div>
              </div>
              {[
                { label: "Watch Zone", key: "medium" as const, color: RISK_COLORS.medium },
                { label: "High Risk", key: "high" as const, color: RISK_COLORS.high },
                { label: "Critical Zone", key: "critical" as const, color: RISK_COLORS.critical },
              ].map(({ label, key, color }) => {
                const count = riskStats[key];
                // use hotspot total (high + critical) as denominator so bars fill meaningfully
                const denom = riskStats.hotspots || 1;
                const pct = Math.round((count / denom) * 100);
                return (
                  <div key={key} className="mb-2 last:mb-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: color }} /><span className="text-[11px]" style={{ color: textSecondary }}>{label}</span></div>
                      <span className="text-[11px] font-semibold" style={{ color: textPrimary }}>{count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: barTrackBg }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
              {/* Legend */}
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${panelBorder}` }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: textMuted }}>Map Legend</p>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full bg-red-500 shadow shadow-red-500/50" style={{ animation: "pulse 1.5s infinite" }} />
                  <span className="text-[11px]" style={{ color: textSecondary }}>Accident Hotspot</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-[11px]" style={{ color: textSecondary }}>Risky Turn</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* How to use */}
        <div className="rounded-xl backdrop-blur-xl p-4"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: panelShadow }}>
          <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: textMuted }}>How to Use</p>
          {["Toggle between Road Conditions / Risk Analysis", "Select a highway or view all", "Click any segment for details", "Scroll to zoom · drag to pan"].map(tip => (
            <p key={tip} className="text-[11px] leading-relaxed" style={{ color: textMuted }}>· {tip}</p>
          ))}
        </div>
      </aside>

      {/* ── Map ── */}
      <div ref={mapRef} className="flex-1 w-full h-full" style={{ minHeight: "calc(100vh - 67px)" }} />

      <style>{`
        .dark-popup .leaflet-popup-content-wrapper,.light-popup .leaflet-popup-content-wrapper { background:transparent;box-shadow:none;border-radius:10px;padding:0; }
        .dark-popup .leaflet-popup-content,.light-popup .leaflet-popup-content { margin:0; }
        .dark-popup .leaflet-popup-tip { background:#1f2937; }
        .light-popup .leaflet-popup-tip { background:#fff; }
        .dark-popup .leaflet-popup-close-button { color:#9ca3af !important; font-size:18px !important; padding:6px 8px !important; }
        .light-popup .leaflet-popup-close-button { color:#6b7280 !important; font-size:18px !important; padding:6px 8px !important; }
        .leaflet-control-zoom a { background:${isDark ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.95)"} !important; color:${isDark ? "white" : "#374151"} !important; border-color:${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)"} !important; }
        .leaflet-control-zoom a:hover { background:rgba(249,115,22,0.85) !important; color:white !important; }
        .leaflet-control-attribution { background:${isDark ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.8)"} !important; color:${isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.4)"} !important; }
        .leaflet-control-attribution a { color:${isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.5)"} !important; }
        input::placeholder { color:${isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)"}; }
        @keyframes pulse-hotspot { 0%,100%{box-shadow:0 0 0 3px #ef4444,0 0 12px #ef4444} 50%{box-shadow:0 0 0 6px rgba(239,68,68,0.3),0 0 20px #ef4444} }
      `}</style>
    </div>
  );
}
