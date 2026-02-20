"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RoadWithScore, RegistryFilters, Band } from "@/lib/types";
import { loadRoadRegistry, getUniqueValues } from "@/lib/dataLoader";

import Navbar from "@/components/Navbar";
import LandingPage from "@/components/LandingPage";
import FilterBar from "@/components/FilterBar";
import RegistryTable from "@/components/RegistryTable";
import AddRoadModal from "@/components/AddRoadModal";
import InspectionScheduler from "@/components/InspectionScheduler";
import GeoView from "@/components/GeoView";
import ReportsPage from "@/components/ReportsPage";
import CitizenIVR from "@/components/CitizenIVR";
import ComplaintsDashboard from "@/components/ComplaintsDashboard";
import {
  Loader2, Plus, Download, Upload, Database,
  CalendarClock, Map, FileText, Phone, ListChecks,
} from "lucide-react";

const BAND_ORDER: Band[] = ["A+", "A", "B", "C", "D", "E"];

const EMPTY_FILTERS: RegistryFilters = {
  search: "",
  district: "",
  surfaceType: "",
  jurisdiction: "",
  category: "",
  status: "",
  band: "",
};

type Page = "landing" | "registry" | "scheduling" | "geoview" | "reports" | "complaints";

export default function Home() {
  const [currentPage, setCurrentPage] = useState<Page>("landing");
  const [pendingPage, setPendingPage] = useState<Page | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [roads, setRoads] = useState<RoadWithScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RegistryFilters>(EMPTY_FILTERS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [complaintRefresh, setComplaintRefresh] = useState(0);

  useEffect(() => {
    if (
      (currentPage === "registry" || currentPage === "scheduling") &&
      roads.length === 0 &&
      !loading
    ) {
      setLoading(true);
      loadRoadRegistry()
        .then((data) => { setRoads(data); setLoading(false); })
        .catch((err) => {
          console.error("Data load failed:", err);
          setError("Failed to load road data.");
          setLoading(false);
        });
    }
  }, [currentPage, roads.length, loading]);

  const navigate = (page: Page) => {
    if (page === currentPage) return;
    if (page === "landing") {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setPendingPage(page);
    setTabLoading(true);
    setTimeout(() => {
      setCurrentPage(page);
      setTabLoading(false);
      setPendingPage(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 700);
  };

  const filterOptions = useMemo(
    () => ({
      districts:     getUniqueValues(roads, "district"),
      surfaceTypes:  getUniqueValues(roads, "surface_type"),
      jurisdictions: getUniqueValues(roads, "jurisdiction"),
      categories:    getUniqueValues(roads, "category"),
      statuses:      getUniqueValues(roads, "status"),
      bands:         BAND_ORDER as unknown as string[],
    }),
    [roads]
  );

  const filteredRoads = useMemo(() => {
    let result = roads;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (r) =>
          r.road_id.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.district.toLowerCase().includes(q) ||
          r.taluka.toLowerCase().includes(q) ||
          r.highway_ref.toLowerCase().includes(q)
      );
    }
    if (filters.district)     result = result.filter((r) => r.district    === filters.district);
    if (filters.surfaceType)  result = result.filter((r) => r.surface_type === filters.surfaceType);
    if (filters.jurisdiction) result = result.filter((r) => r.jurisdiction === filters.jurisdiction);
    if (filters.category)     result = result.filter((r) => r.category     === filters.category);
    if (filters.status)       result = result.filter((r) => r.status       === filters.status);
    if (filters.band)         result = result.filter((r) => r.healthScore.band === filters.band);
    return result;
  }, [roads, filters]);

  const totalKm  = useMemo(() => Math.round(roads.reduce((s, r) => s + r.length_km, 0)), [roads]);
  const districts = useMemo(() => new Set(roads.map((r) => r.district)).size, [roads]);

  const handleAddRoad = (newRoad: RoadWithScore) => {
    setRoads((prev) => [newRoad, ...prev]);
    setShowAddModal(false);
  };

  const handleExportCSV = () => {
    const headers = [
      "road_id","name","highway_ref","district","taluka","length_km",
      "surface_type","lane_count","jurisdiction","category","status",
      "year_constructed","last_major_rehab_year","avg_daily_traffic",
      "truck_percentage","terrain_type","elevation_m","pci_score",
      "iri_value","health_band","health_rating","condition_score",
    ];
    const csvRows = [headers.join(",")];
    filteredRoads.forEach((r) => {
      csvRows.push([
        r.road_id, `"${r.name}"`, r.highway_ref, r.district, r.taluka,
        r.length_km, r.surface_type, r.lane_count, r.jurisdiction,
        r.category, r.status, r.year_constructed,
        r.last_major_rehab_year ?? "", r.avg_daily_traffic,
        r.truck_percentage, r.terrain_type, r.elevation_m,
        r.pci_score, r.iri_value,
        r.healthScore.band, r.healthScore.rating, r.healthScore.conditionScore,
      ].join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `road_registry_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabIcon = (page: Page) => {
    switch (page) {
      case "geoview":    return <Map          size={44} className="text-orange-500 animate-bounce" />;
      case "reports":    return <FileText      size={44} className="text-blue-500 animate-pulse"  />;
      case "complaints": return <Phone         size={44} className="text-purple-500 animate-bounce" />;
      case "registry":   return <ListChecks    size={44} className="text-green-500 animate-pulse"  />;
      case "scheduling": return <CalendarClock size={44} className="text-cyan-500 animate-spin"   />;
      default:           return <Loader2       size={44} className="text-gray-400 animate-spin"   />;
    }
  };

  /* ── Landing ───────────────────────────────────────────── */
  if (currentPage === "landing") {
    return <LandingPage onOpenRegistry={() => navigate("geoview")} />;
  }

  /* ── Dashboard content ─────────────────────────────────── */
  let dashboardContent: React.ReactNode = null;

  if (currentPage === "geoview") {
    dashboardContent = (
      <>
        <Navbar currentPage="geoview" onNavigate={navigate} />
        <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#ffffff", zIndex: 0 }}>
          <GeoView />
        </div>
        <CitizenIVR onComplaintSubmitted={() => setComplaintRefresh((n) => n + 1)} />
      </>
    );

  } else if (currentPage === "complaints") {
    dashboardContent = (
      <>
        <Navbar currentPage="complaints" onNavigate={navigate} />
        <main className="min-h-screen pt-22" style={{ background: "var(--bg)" }}>
          <header className="border-b border-gray-200/60 bg-white/80 backdrop-blur-sm">
            <div className="max-w-400 mx-auto flex items-center justify-between h-14 px-6">
              <div>
                <h1 className="text-[16px] font-bold text-gray-900 tracking-tight">📞 Citizen Complaint Hotline</h1>
                <p className="text-[11px] text-gray-400">IVR-powered road complaint system • Voice &amp; keypad enabled</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-[11px] font-semibold">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                IVR Active
              </span>
            </div>
          </header>
          <div className="max-w-400 mx-auto px-6 py-6">
            <ComplaintsDashboard refreshTrigger={complaintRefresh} />
          </div>
        </main>
        <CitizenIVR onComplaintSubmitted={() => setComplaintRefresh((n) => n + 1)} />
      </>
    );

  } else if (currentPage === "reports") {
    dashboardContent = (
      <>
        <Navbar currentPage="reports" onNavigate={navigate} />
        <div style={{ paddingTop: 88, minHeight: "100vh" }}>
          <ReportsPage />
        </div>
      </>
    );

  } else if (currentPage === "scheduling") {
    if (loading) {
      dashboardContent = (
        <>
          <Navbar currentPage="scheduling" onNavigate={navigate} />
          <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg)" }}>
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/25">
                <CalendarClock size={28} className="text-white" />
              </div>
              <Loader2 className="w-5 h-5 text-orange-500 animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">Generating inspection schedule…</p>
              <p className="text-gray-400 text-xs mt-1">Analysing 16,000+ road segments</p>
            </div>
          </div>
        </>
      );
    } else if (error) {
      dashboardContent = (
        <>
          <Navbar currentPage="scheduling" onNavigate={navigate} />
          <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg)" }}>
            <div className="text-center max-w-sm">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-red-600 text-2xl font-bold">!</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Data Load Failed</h2>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          </div>
        </>
      );
    } else {
      dashboardContent = (
        <>
          <Navbar currentPage="scheduling" onNavigate={navigate} />
          <main className="min-h-screen pt-22" style={{ background: "var(--bg)" }}>
            <header className="border-b border-gray-200/60 bg-white/80 backdrop-blur-sm">
              <div className="max-w-400 mx-auto flex items-center justify-between h-14 px-6">
                <div>
                  <h1 className="text-[16px] font-bold text-gray-900 tracking-tight">Automatic Inspection Scheduler</h1>
                  <p className="text-[11px] text-gray-400">AI-driven scheduling based on health scores, risk factors &amp; compliance cycles</p>
                </div>
              </div>
            </header>
            <div className="max-w-400 mx-auto px-6 py-6">
              <InspectionScheduler roads={roads} />
            </div>
          </main>
          <CitizenIVR onComplaintSubmitted={() => setComplaintRefresh((n) => n + 1)} />
        </>
      );
    }

  } else {
    /* registry */
    if (loading) {
      dashboardContent = (
        <>
          <Navbar currentPage="registry" onNavigate={navigate} />
          <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg)" }}>
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/25">
                <Database size={28} className="text-white" />
              </div>
              <Loader2 className="w-5 h-5 text-orange-500 animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">Loading registry data…</p>
              <p className="text-gray-400 text-xs mt-1">16,000+ road segments</p>
            </div>
          </div>
        </>
      );
    } else if (error) {
      dashboardContent = (
        <>
          <Navbar currentPage="registry" onNavigate={navigate} />
          <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg)" }}>
            <div className="text-center max-w-sm">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-red-600 text-2xl font-bold">!</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Data Load Failed</h2>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          </div>
        </>
      );
    } else {
      dashboardContent = (
        <>
          <Navbar currentPage="registry" onNavigate={navigate} />
          <main className="min-h-screen pt-22" style={{ background: "var(--bg)" }}>
            <header className="border-b border-gray-200/60 bg-white/80 backdrop-blur-sm">
              <div className="max-w-400 mx-auto flex items-center justify-between h-14 px-6">
                <div className="flex items-center gap-4">
                  <div>
                    <h1 className="text-[16px] font-bold text-gray-900 tracking-tight">Central Road Registry</h1>
                    <p className="text-[11px] text-gray-400">
                      {roads.length} segments • {totalKm.toLocaleString()} km • {districts} districts
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleExportCSV} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-medium hover:bg-gray-50 hover:border-gray-300 transition-all">
                    <Download size={14} /> Export
                  </button>
                  <button className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-medium hover:bg-gray-50 hover:border-gray-300 transition-all">
                    <Upload size={14} /> Import
                  </button>
                  <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 shadow-sm shadow-orange-500/20 transition-all">
                    <Plus size={15} /> Add Road Segment
                  </button>
                </div>
              </div>
            </header>

            <div className="max-w-400 mx-auto px-6 pt-5 pb-0">
              <FilterBar
                filters={filters}
                onFilterChange={setFilters}
                options={filterOptions}
                totalCount={roads.length}
                filteredCount={filteredRoads.length}
              />
            </div>

            <div className="max-w-400 mx-auto px-6 pb-6 pt-4">
              <RegistryTable roads={filteredRoads} />
            </div>
          </main>

          {showAddModal && (
            <AddRoadModal onClose={() => setShowAddModal(false)} onAdd={handleAddRoad} />
          )}
          <CitizenIVR onComplaintSubmitted={() => setComplaintRefresh((n) => n + 1)} />
        </>
      );
    }
  }

  /* ── Single return ─────────────────────────────────────── */
  return (
    <>
      <AnimatePresence>
        {tabLoading && pendingPage && (
          <motion.div
            key="tab-loader"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.38 }}
            className="fixed inset-0 z-999 flex items-center justify-center bg-white/70 backdrop-blur-sm"
            style={{ pointerEvents: "all" }}
          >
            <div className="rounded-2xl bg-white/80 shadow-lg p-7 flex flex-col items-center border border-gray-200">
              {tabIcon(pendingPage)}
              <span className="mt-3 text-[15px] font-bold text-gray-700 tracking-tight">
                {pendingPage === "geoview"    && "Loading Map..."}
                {pendingPage === "reports"    && "Loading Reports..."}
                {pendingPage === "complaints" && "Loading Complaints..."}
                {pendingPage === "registry"   && "Loading Registry..."}
                {pendingPage === "scheduling" && "Loading Scheduler..."}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {dashboardContent}
    </>
  );
}
