"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Map, Search, X, ChevronDown, Layers, BarChart2, Sun, Moon } from "lucide-react";

/* ── Types ─────────────────────────────────────────────── */
interface SegmentData {
  segment_number: number;
  condition: "good" | "average" | "very_bad";
  coordinates: number[][];
  district?: string;
  taluka?: string;
  surface_type?: string;
  lane_count?: number;
  terrain_type?: string;
  jurisdiction?: string;
  avg_daily_traffic?: number;
  elevation_m?: number;
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
  coordinates: number[][];
  district?: string;
  taluka?: string;
}

interface Stats {
  total: number;
  good: number;
  average: number;
  very_bad: number;
  highways: number;
}

const CONDITION_COLORS: Record<string, string> = {
  good: "#22c55e",
  average: "#eab308",
  very_bad: "#ef4444",
  default: "#9ca3af",
};

const CONDITION_LABELS: Record<string, string> = {
  good: "Good",
  average: "Average",
  very_bad: "Poor",
  default: "Unknown",
};

function getHighwayColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/* ── Main Component ─────────────────────────────────────── */
export default function GeoView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const highwayLayersRef = useRef<Record<string, L.GeoJSON>>({});
  const highwayColorsRef = useRef<Record<string, string>>({});
  const allHighwaysDataRef = useRef<AllHighwaysData>({});
  const isDarkRef = useRef(false); // mirrors isDark for use inside closures

  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("Initialising map…");
  const [isDark, setIsDark] = useState(false);
  const [activeNH, setActiveNH] = useState("ALL");
  const [nhKeys, setNhKeys] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, good: 0, average: 0, very_bad: 0, highways: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchSegment[]>([]);
  const [searchIndex, setSearchIndex] = useState<SearchSegment[]>([]);
  const [nhSelectorOpen, setNhSelectorOpen] = useState(false);

  /* ── Theme-derived shortcuts ── */
  // Keep ref in sync so Leaflet closures (built once) can read current theme
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);
  const panelBg    = isDark ? "rgba(15,23,42,0.90)"  : "rgba(255,255,255,0.92)";
  const panelBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const textPrimary  = isDark ? "#f9fafb"  : "#111827";
  const textSecondary = isDark ? "rgba(255,255,255,0.50)" : "#6b7280";
  const textMuted    = isDark ? "rgba(255,255,255,0.30)" : "#9ca3af";
  const inputBg     = isDark ? "transparent" : "transparent";
  const hoverBg     = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const statCellBg  = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const statCellBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const barTrackBg  = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const scrollColor = isDark ? "#374151 transparent" : "#d1d5db transparent";
  const nhBtnInactive = isDark
    ? "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10"
    : "bg-black/5 text-gray-600 hover:bg-black/10 hover:text-gray-900 border border-black/10";

  /* ── Compute stats for selected NH ── */
  const computeStats = useCallback((nh: string) => {
    const data = allHighwaysDataRef.current;
    const highways = nh === "ALL" ? Object.keys(data) : [nh];
    let total = 0, good = 0, average = 0, very_bad = 0;
    highways.forEach((h) => {
      Object.values(data[h] || {}).forEach((seg) => {
        total++;
        if (seg.condition === "good") good++;
        else if (seg.condition === "average") average++;
        else if (seg.condition === "very_bad") very_bad++;
      });
    });
    setStats({ total, good, average, very_bad, highways: nh === "ALL" ? Object.keys(data).length : 1 });
  }, []);

  /* ── Update map visibility & fly to bounds ── */
  const updateMapView = useCallback((nh: string) => {
    const map = mapInstanceRef.current;
    const layers = highwayLayersRef.current;
    if (!map) return;

    Object.entries(layers).forEach(([key, layer]) => {
      if (nh === "ALL" || key === nh) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      }
    });

    if (nh !== "ALL" && layers[nh]) {
      const bounds = layers[nh].getBounds();
      if (bounds.isValid()) map.flyToBounds(bounds, { padding: [60, 60], duration: 1.2 });
    } else {
      const allBounds: L.LatLngBounds[] = [];
      Object.values(layers).forEach((layer) => {
        const b = layer.getBounds();
        if (b.isValid()) allBounds.push(b);
      });
      if (allBounds.length > 0) {
        let combined = allBounds[0];
        allBounds.forEach((b) => combined.extend(b));
        map.flyToBounds(combined, { padding: [60, 60], duration: 1.2 });
      }
    }
  }, []);

  const selectNH = useCallback(
    (nh: string) => {
      setActiveNH(nh);
      setNhSelectorOpen(false);
      computeStats(nh);
      updateMapView(nh);
    },
    [computeStats, updateMapView]
  );

  /* ── Toggle map tile theme ── */
  const toggleTheme = useCallback(async () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const L = (await import("leaflet")).default;
    setIsDark((prev) => {
      const next = !prev;
      // Remove current tile layer
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }
      const tileUrl = next
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
      const newTile = L.tileLayer(tileUrl, {
        attribution: "&copy; CartoDB &copy; OpenStreetMap",
        maxZoom: 19,
      });
      newTile.addTo(map);
      // Move tile beneath road layers
      newTile.bringToBack();
      tileLayerRef.current = newTile;
      return next;
    });
  }, []);

  /* ── Search ── */
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const q = searchTerm.toLowerCase();
    const matches = searchIndex
      .filter(
        (s) =>
          s.segmentNumber.toString().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.nh.toLowerCase().includes(q) ||
          (s.district?.toLowerCase().includes(q)) ||
          (s.taluka?.toLowerCase().includes(q))
      )
      .slice(0, 10);
    setSearchResults(matches);
  }, [searchTerm, searchIndex]);

  const zoomToSegment = useCallback((seg: SearchSegment) => {
    const map = mapInstanceRef.current;
    if (!map || !seg.coordinates?.length) return;
    const latLngs = seg.coordinates.map((c) => [c[1], c[0]] as [number, number]);
    map.flyToBounds(latLngs, { padding: [50, 50], maxZoom: 15, duration: 1.5 });
    setSearchTerm("");
    setSearchResults([]);

    // Open popup after fly
    setTimeout(() => {
      map.eachLayer((layer) => {
        const gl = layer as L.GeoJSON & { feature?: GeoJSON.Feature };
        if (gl.feature?.id === seg.id && (layer as L.Path).getPopup) {
          (layer as L.Path).openPopup();
        }
      });
    }, 1800);
  }, []);

  /* ── Init Map ── */
  useEffect(() => {
    if (mapInstanceRef.current) return; // already initialised

    let cancelled = false;

    async function init() {
      if (!mapRef.current) return;

      // Dynamic import so SSR is avoided
      const L = (await import("leaflet")).default;
      // Import Leaflet CSS via link tag to avoid TS type error
      if (typeof document !== "undefined" && !document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (cancelled || mapInstanceRef.current) return;

      setLoadingMsg("Loading highway data…");

      // Create map
      const map = L.map(mapRef.current, { zoomControl: false }).setView([18.5, 74.0], 8);
      mapInstanceRef.current = map;

      // Light tile layer by default (CartoDB light)
      const tile = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; CartoDB &copy; OpenStreetMap",
        maxZoom: 19,
      });
      tile.addTo(map);
      tileLayerRef.current = tile;

      // Custom zoom control — bottom right
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Load highway data JSON
      let allData: AllHighwaysData = {};
      try {
        const res = await fetch("/all_highways_segments_conditions.json");
        allData = await res.json();
      } catch (e) {
        console.error("Failed to load highway data", e);
      }

      allHighwaysDataRef.current = allData;
      const keys = Object.keys(allData);
      keys.forEach((nh) => { highwayColorsRef.current[nh] = getHighwayColor(nh); });

      setNhKeys(keys);
      setLoadingMsg("Rendering highways on map…");

      // Load GeoJSON
      try {
        const geoRes = await fetch("/NH.geojson");
        const geojson: GeoJSON.FeatureCollection = await geoRes.json();

        // Index features by primary ref
        const featuresByRef: Record<string, GeoJSON.Feature[]> = {};
        geojson.features.forEach((feat) => {
          const ref = (feat.properties?.ref as string) || "";
          if (!ref) return;
          const primary = ref.split(";")[0].trim();
          if (!featuresByRef[primary]) featuresByRef[primary] = [];
          featuresByRef[primary].push(feat);
        });

        keys.forEach((nh) => {
          const nhData = allData[nh] || {};
          const nhFeatures = featuresByRef[nh] || [];
          if (!nhFeatures.length) return;

          const miniGeoJSON: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: nhFeatures };

          const layer = L.geoJSON(miniGeoJSON, {
            style: (feature) => {
              const fid = feature?.id as string;
              const condition = nhData[fid]?.condition || "default";
              if (feature) {
                feature.properties = {
                  ...feature.properties,
                  roadCondition: condition,
                  matchedNH: nh,
                  segmentNumber: nhData[fid]?.segment_number ?? "N/A",
                  segmentData: nhData[fid] ?? null,
                };
              }
              return {
                color: CONDITION_COLORS[condition],
                weight: 6,
                opacity: 0.85,
                lineJoin: "round",
                lineCap: "round",
              };
            },
            onEachFeature: (feature, lyr) => {
              const ref = (feature.properties?.matchedNH as string) || (feature.properties?.ref as string) || "Unknown";
              const condition = (feature.properties?.roadCondition as string) || "default";
              const segmentNum = feature.properties?.segmentNumber;
              const segData: SegmentData | null = feature.properties?.segmentData ?? null;
              const condColor = CONDITION_COLORS[condition] || CONDITION_COLORS.default;
              const accentColor = highwayColorsRef.current[ref] || "#6b7280";

              lyr.on("click", function () {
                const dark = isDarkRef.current;
                const popupBg    = dark ? "#1f2937" : "#ffffff";
                const popupText  = dark ? "white"   : "#111827";
                const popupMuted = dark ? "#9ca3af" : "#6b7280";
                const popupBorder = dark ? "#374151" : "#e5e7eb";
                const popupClass  = dark ? "dark-popup" : "light-popup";

                const detailRowsThemed = segData
                  ? (
                      [
                        ["District", segData.district],
                        ["Taluka", segData.taluka],
                        ["Surface", segData.surface_type],
                        ["Lanes", segData.lane_count],
                        ["Terrain", segData.terrain_type],
                        ["Jurisdiction", segData.jurisdiction],
                        ["Traffic", segData.avg_daily_traffic ? `${Number(segData.avg_daily_traffic).toLocaleString()} vehicles/day` : null],
                        ["Elevation", segData.elevation_m ? `${segData.elevation_m} m` : null],
                      ] as [string, string | number | null | undefined][]
                    )
                      .filter(([, v]) => v != null)
                      .map(([k, v]) => `<tr><td style="color:${popupMuted};padding:2px 8px 2px 0;font-size:12px;">${k}</td><td style="color:${popupText};font-size:12px;font-weight:500;">${v}</td></tr>`)
                      .join("")
                  : "";

                const defectRowsThemed = segData
                  ? (
                      [
                        ["Potholes", segData.potholes_per_km, "/km"],
                        ["Pothole Depth", segData.pothole_avg_depth_cm, " cm"],
                        ["Long. Cracks", segData.cracks_longitudinal_pct, "%"],
                        ["Trans. Cracks", segData.cracks_transverse_per_km, "/km"],
                        ["Alligator Crack", segData.alligator_cracking_pct, "%"],
                        ["Rutting", segData.rutting_depth_mm, " mm"],
                        ["Raveling", segData.raveling_pct, "%"],
                        ["Edge Breaking", segData.edge_breaking_pct, "%"],
                        ["Patches", segData.patches_per_km, "/km"],
                        ["IRI", segData.iri_value, " m/km"],
                        ["PCI Score", segData.pci_score, "/100"],
                      ] as [string, number | undefined, string][]
                    )
                      .filter(([, v]) => v != null)
                      .map(([k, v, unit]) => {
                        let valColor = popupText;
                        if (k === "PCI Score" && v != null) valColor = v >= 70 ? "#22c55e" : v >= 40 ? "#eab308" : "#ef4444";
                        else if (k === "IRI" && v != null) valColor = v <= 2.5 ? "#22c55e" : v <= 4.5 ? "#eab308" : "#ef4444";
                        else if (k === "Potholes" && v != null) valColor = v <= 2 ? "#22c55e" : v <= 10 ? "#eab308" : "#ef4444";
                        return `<tr><td style="color:${popupMuted};padding:2px 8px 2px 0;font-size:12px;">${k}</td><td style="color:${valColor};font-size:12px;font-weight:600;">${v}${unit}</td></tr>`;
                      })
                      .join("")
                  : "";

                const themedPopup = `
                  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;min-width:240px;background:${popupBg};color:${popupText};padding:16px;border-radius:10px;margin:-14px -20px;box-shadow:0 8px 32px rgba(0,0,0,0.18);">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                      <span style="background:${accentColor};color:white;padding:3px 10px;border-radius:4px;font-size:13px;font-weight:600;">${ref}</span>
                      <span style="font-size:13px;color:${popupMuted};">Segment #${segmentNum}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;padding:8px 12px;background:${condColor}22;border-radius:6px;border-left:3px solid ${condColor};">
                      <span style="color:${condColor};font-weight:600;font-size:14px;">${CONDITION_LABELS[condition]}</span>
                    </div>
                    ${detailRowsThemed ? `<table style="width:100%">${detailRowsThemed}</table>` : ""}
                    ${defectRowsThemed ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid ${popupBorder};"><div style="font-size:11px;color:${popupMuted};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:6px;">Surface Defects & Roughness</div><table style="width:100%">${defectRowsThemed}</table></div>` : ""}
                    <div style="margin-top:8px;font-size:10px;color:${popupMuted};">ID: ${feature.id}</div>
                  </div>`;

                (lyr as L.Path).unbindPopup();
                (lyr as L.Path).bindPopup(themedPopup, { className: popupClass, closeButton: true, maxWidth: 300 });
                (lyr as L.Path).openPopup();
              });
              lyr.on("mouseover", function (this: L.Path) { this.setStyle({ weight: 10, opacity: 1 }); });
              lyr.on("mouseout", function (this: L.Path) { this.setStyle({ weight: 6, opacity: 0.85, color: CONDITION_COLORS[condition] }); });
            },
          });

          layer.addTo(map);
          highwayLayersRef.current[nh] = layer;
        });

        // Fit to all highways
        const allBounds: L.LatLngBounds[] = [];
        Object.values(highwayLayersRef.current).forEach((l) => {
          const b = l.getBounds();
          if (b.isValid()) allBounds.push(b);
        });
        if (allBounds.length > 0) {
          let combined = allBounds[0];
          allBounds.forEach((b) => combined.extend(b));
          map.fitBounds(combined, { padding: [60, 60] });
        }
      } catch (e) {
        console.error("Failed to load GeoJSON", e);
      }

      // Build search index
      const idx: SearchSegment[] = [];
      Object.entries(allData).forEach(([nh, nhData]) => {
        Object.entries(nhData).forEach(([id, seg]) => {
          idx.push({ id, nh, segmentNumber: seg.segment_number, condition: seg.condition, coordinates: seg.coordinates, district: seg.district, taluka: seg.taluka });
        });
      });
      setSearchIndex(idx);

      // Compute initial stats
      let total = 0, good = 0, average = 0, very_bad = 0;
      Object.values(allData).forEach((nhData) => {
        Object.values(nhData).forEach((seg) => {
          total++;
          if (seg.condition === "good") good++;
          else if (seg.condition === "average") average++;
          else if (seg.condition === "very_bad") very_bad++;
        });
      });
      setStats({ total, good, average, very_bad, highways: keys.length });
      setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, []);

  /* ── Sorted NH keys: priority first ── */
  const sortedNHKeys = (() => {
    const priority = ["NH48", "NH60", "NH65", "NH160"];
    const pSet = new Set(priority);
    const rest = nhKeys.filter((k) => !pSet.has(k)).sort();
    return priority.filter((k) => nhKeys.includes(k)).concat(rest);
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

      {/* ── Side Panel ── */}
      <aside
        className="absolute left-3 top-3 z-1000 flex flex-col gap-3 overflow-y-auto"
        style={{
          width: 300,
          maxHeight: "calc(100% - 24px)",
          scrollbarWidth: "none",
        }}
      >

        {/* Header card */}
        <div
          className="rounded-xl p-4 backdrop-blur-xl"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.10)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center shadow-md shadow-orange-500/30">
                <Map size={14} className="text-white" />
              </div>
              <span className="font-bold text-[15px]" style={{ color: textPrimary }}>GeoView</span>
            </div>

            {/* Dark / Light toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? "Switch to Light Map" : "Switch to Dark Map"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-200 text-[11px] font-semibold"
              style={{
                background: isDark ? "rgba(249,115,22,0.15)" : "rgba(0,0,0,0.07)",
                color: isDark ? "#fb923c" : "#374151",
                border: `1px solid ${isDark ? "rgba(249,115,22,0.30)" : "rgba(0,0,0,0.12)"}`,
              }}
            >
              {isDark ? <Sun size={12} /> : <Moon size={12} />}
              {isDark ? "Light" : "Dark"}
            </button>
          </div>
          <p className="text-[11px] mt-1" style={{ color: textMuted }}>Maharashtra National Highways</p>
        </div>

        {/* NH Selector */}
        <div
          className="rounded-xl backdrop-blur-xl overflow-hidden"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.10)" }}
        >
          <button
            onClick={() => setNhSelectorOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors"
            style={{ color: textSecondary }}
          >
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
                <button
                  onClick={() => selectNH("ALL")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                    activeNH === "ALL"
                      ? "bg-orange-500 text-white shadow-md shadow-orange-500/30"
                      : nhBtnInactive
                  }`}
                >
                  All
                </button>
                {sortedNHKeys.map((nh) => (
                  <button
                    key={nh}
                    onClick={() => selectNH(nh)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                      activeNH === nh
                        ? "bg-orange-500 text-white shadow-md shadow-orange-500/30"
                        : nhBtnInactive
                    }`}
                  >
                    {nh}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div
          className="rounded-xl backdrop-blur-xl"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.10)" }}
        >
          <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: `1px solid ${panelBorder}` }}>
            <Search size={13} className="shrink-0" style={{ color: textMuted }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search segment, district…"
              className="flex-1 text-[12px] outline-none"
              style={{ background: inputBg, color: textPrimary }}
            />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(""); setSearchResults([]); }}>
                <X size={12} style={{ color: textMuted }} />
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-44 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: scrollColor }}>
              {searchResults.map((seg) => (
                <button
                  key={seg.id}
                  onClick={() => zoomToSegment(seg)}
                  className="w-full text-left px-3 py-2 transition-colors"
                  style={{ borderBottom: `1px solid ${panelBorder}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold" style={{ color: textPrimary }}>Segment #{seg.segmentNumber}</span>
                    <span className="text-[10px]" style={{ color: textMuted }}>{seg.nh}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: CONDITION_COLORS[seg.condition] }} />
                    <span className="text-[11px]" style={{ color: CONDITION_COLORS[seg.condition] }}>{CONDITION_LABELS[seg.condition]}</span>
                    {seg.district && <span className="text-[11px]" style={{ color: textMuted }}>· {seg.district}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchTerm && searchResults.length === 0 && (
            <p className="text-[12px] text-center py-3" style={{ color: textMuted }}>No results found</p>
          )}
        </div>

        {/* Stats */}
        <div
          className="rounded-xl backdrop-blur-xl p-4"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.10)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={13} className="text-orange-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: textSecondary }}>Statistics</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg p-3 text-center" style={{ background: statCellBg, border: `1px solid ${statCellBorder}` }}>
              <div className="text-[22px] font-bold leading-none" style={{ color: textPrimary }}>{stats.total.toLocaleString()}</div>
              <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: textMuted }}>Segments</div>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: statCellBg, border: `1px solid ${statCellBorder}` }}>
              <div className="text-[22px] font-bold leading-none" style={{ color: textPrimary }}>{stats.highways}</div>
              <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: textMuted }}>Highways</div>
            </div>
          </div>

          {/* Condition bars */}
          {[
            { label: "Good", key: "good" as const, color: "#22c55e" },
            { label: "Average", key: "average" as const, color: "#eab308" },
            { label: "Poor", key: "very_bad" as const, color: "#ef4444" },
          ].map(({ label, key, color }) => {
            const count = stats[key];
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return (
              <div key={key} className="mb-2 last:mb-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-[11px]" style={{ color: textSecondary }}>{label}</span>
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color: textPrimary }}>{count.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: barTrackBg }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* How to use */}
        <div
          className="rounded-xl backdrop-blur-xl p-4"
          style={{ background: panelBg, border: `1px solid ${panelBorder}`, boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.10)" }}
        >
          <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: textMuted }}>How to Use</p>
          {[
            "Select a highway or view all",
            "Click any segment for details",
            "Search by segment or district",
            "Scroll to zoom · drag to pan",
          ].map((tip) => (
            <p key={tip} className="text-[11px] leading-relaxed" style={{ color: textMuted }}>· {tip}</p>
          ))}
        </div>
      </aside>

      {/* ── Map ── */}
      <div ref={mapRef} className="flex-1 w-full h-full" style={{ minHeight: "calc(100vh - 67px)" }} />

      {/* Leaflet popup + control styles — adapt to theme */}
      <style>{`
        .dark-popup .leaflet-popup-content-wrapper { background: transparent; box-shadow: none; border-radius: 10px; padding: 0; }
        .dark-popup .leaflet-popup-content { margin: 0; }
        .dark-popup .leaflet-popup-tip { background: #1f2937; }
        .dark-popup .leaflet-popup-close-button { color: #9ca3af !important; font-size: 18px !important; padding: 6px 8px !important; }
        .light-popup .leaflet-popup-content-wrapper { background: transparent; box-shadow: none; border-radius: 10px; padding: 0; }
        .light-popup .leaflet-popup-content { margin: 0; }
        .light-popup .leaflet-popup-tip { background: #ffffff; }
        .light-popup .leaflet-popup-close-button { color: #6b7280 !important; font-size: 18px !important; padding: 6px 8px !important; }
        .leaflet-control-zoom a { background: ${isDark ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.95)"} !important; color: ${isDark ? "white" : "#374151"} !important; border-color: ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)"} !important; }
        .leaflet-control-zoom a:hover { background: rgba(249,115,22,0.85) !important; color: white !important; }
        .leaflet-control-attribution { background: ${isDark ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.8)"} !important; color: ${isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.4)"} !important; }
        .leaflet-control-attribution a { color: ${isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.5)"} !important; }
        input::placeholder { color: ${isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)"}; }
      `}</style>
    </div>
  );
}
