"use client";

/**
 * ReportsPage.tsx
 * ────────────────
 * AI-powered Reports module for the Road Health Monitoring System.
 *
 * FLOW:
 *   1. User selects report type
 *   2. User applies optional filters (basic + advanced)
 *   3. User clicks "Generate Report"
 *   4. Client calls POST /api/reports/aggregate (filter + compute stats)
 *   5. Client calls POST /api/reports/generate (Gemini narrative)
 *   6. Client calls POST /api/reports/pdf (styled HTML)
 *   7. Preview renders in right panel
 *   8. User downloads PDF via jsPDF + html2canvas
 *
 * ARCHITECTURE RULES:
 *   - All numbers come from the aggregate route (never from AI)
 *   - AI only writes the narrative text
 *   - PDF is generated client-side from the styled HTML
 */

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  Filter,
  ChevronDown,
  Download,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Globe,
  MapPin,
  AlertTriangle,
  ClipboardList,
  TrendingUp,
  X,
  Sparkles,
} from "lucide-react";
import { ReportSummary, ReportType } from "@/lib/reportAggregator";

// ─── Report Type Config ──────────────────────────────────────

const REPORT_TYPES: Array<{
  id: ReportType;
  label: string;
  description: string;
  icon: React.FC<{ size?: number; className?: string }>;
  color: string;
  bg: string;
}> = [
    {
      id: "network_overview",
      label: "Network Overview",
      description: "Full network health assessment across all 16,312 road segments",
      icon: Globe,
      color: "#1d4ed8",
      bg: "#eff6ff",
    },
    {
      id: "district_level",
      label: "District-Level Report",
      description: "Comparative analysis across districts with rankings",
      icon: MapPin,
      color: "#7c3aed",
      bg: "#f5f3ff",
    },
    {
      id: "critical_intervention",
      label: "Critical Intervention",
      description: "Emergency action priorities for worst-condition roads",
      icon: AlertTriangle,
      color: "#dc2626",
      bg: "#fef2f2",
    },
    {
      id: "inspection_audit",
      label: "Inspection Audit",
      description: "Compliance status, overdue inspections, and scheduling gaps",
      icon: ClipboardList,
      color: "#0891b2",
      bg: "#ecfeff",
    },
    {
      id: "budget_planning",
      label: "Budget & Planning",
      description: "Cost estimates, phased repair budgets, and ROI analysis",
      icon: TrendingUp,
      color: "#059669",
      bg: "#ecfdf5",
    },
  ];

// ─── Filter State ────────────────────────────────────────────

interface FilterState {
  district: string;
  highway: string;
  conditionBand: string;
  priorityLevel: string;
  inspectionStatus: string;
  cibilMin: string;
  cibilMax: string;
  constructionYearMin: string;
  constructionYearMax: string;
  inspectionDateFrom: string;
  inspectionDateTo: string;
}

const EMPTY_FILTERS: FilterState = {
  district: "", highway: "", conditionBand: "", priorityLevel: "",
  inspectionStatus: "", cibilMin: "", cibilMax: "",
  constructionYearMin: "", constructionYearMax: "",
  inspectionDateFrom: "", inspectionDateTo: "",
};

// ─── Component ───────────────────────────────────────────────

export default function ReportsPage() {
  const [selectedType, setSelectedType] = useState<ReportType>("network_overview");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Generation state
  const [step, setStep] = useState<"idle" | "aggregating" | "generating" | "building_pdf" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [narrative, setNarrative] = useState("");
  const [usedFallback, setUsedFallback] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [downloading, setDownloading] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  // ── Filter helpers ──────────────────────────────────────
  const activeFilterCount = Object.values(filters).filter(v => v !== "").length;

  const buildFilterPayload = useCallback(() => {
    const payload: Record<string, unknown> = { reportType: selectedType };
    if (filters.district) payload.district = filters.district;
    if (filters.highway) payload.highway = filters.highway;
    if (filters.conditionBand) payload.conditionBand = filters.conditionBand;
    if (filters.priorityLevel) payload.priorityLevel = filters.priorityLevel;
    if (filters.inspectionStatus) payload.inspectionStatus = filters.inspectionStatus;
    if (filters.cibilMin) payload.cibilMin = parseFloat(filters.cibilMin);
    if (filters.cibilMax) payload.cibilMax = parseFloat(filters.cibilMax);
    if (filters.constructionYearMin) payload.constructionYearMin = parseInt(filters.constructionYearMin);
    if (filters.constructionYearMax) payload.constructionYearMax = parseInt(filters.constructionYearMax);
    if (filters.inspectionDateFrom) payload.inspectionDateFrom = filters.inspectionDateFrom;
    if (filters.inspectionDateTo) payload.inspectionDateTo = filters.inspectionDateTo;
    return payload;
  }, [filters, selectedType]);

  // ── Main generation flow ────────────────────────────────
  const handleGenerate = async () => {
    setStep("aggregating");
    setErrorMsg("");
    setSummary(null);
    setNarrative("");
    setUsedFallback(false);
    setHtmlContent("");

    try {
      // Step 1: Aggregate
      const aggRes = await fetch("/api/reports/aggregate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildFilterPayload()),
      });
      const aggData = await aggRes.json();

      if (!aggRes.ok || aggData.error) {
        setErrorMsg(aggData.message || aggData.error || "Aggregation failed");
        setStep("error");
        return;
      }

      const aggSummary = aggData as ReportSummary;
      setSummary(aggSummary);

      // Step 2: Generate AI narrative
      setStep("generating");
      const genRes = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aggSummary),
      });
      const genData = await genRes.json();

      if (!genRes.ok || genData.error) {
        setErrorMsg(genData.error || "AI narrative generation failed");
        setStep("error");
        return;
      }

      const aiNarrative = genData.narrative as string;
      const title = genData.reportTitle as string;
      setNarrative(aiNarrative);
      setUsedFallback(!!genData.usedFallback);
      setReportTitle(title);

      // Step 3: Build PDF HTML
      setStep("building_pdf");
      const pdfRes = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ narrative: aiNarrative, summary: aggSummary, reportTitle: title }),
      });
      const pdfData = await pdfRes.json();

      if (!pdfRes.ok || pdfData.error) {
        setErrorMsg(pdfData.error || "PDF preparation failed");
        setStep("error");
        return;
      }

      setHtmlContent(pdfData.html);
      setStep("done");
    } catch (err) {
      console.error("Report generation error:", err);
      setErrorMsg("Network error. Please ensure the server is running.");
      setStep("error");
    }
  };

  // ── PDF Download ────────────────────────────────────────
  const handleDownloadPdf = async () => {
    if (!htmlContent) return;
    setDownloading(true);

    try {
      // Dynamically import jsPDF + html2canvas to avoid SSR issues
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      // A4 dimensions: 794px wide at 96dpi = 210mm
      const A4_PX_WIDTH = 794;
      const A4_MM_WIDTH = 210;
      const A4_MM_HEIGHT = 297;

      // Render HTML in a hidden iframe sized exactly to A4 width
      const iframe = document.createElement("iframe");
      iframe.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${A4_PX_WIDTH}px;border:none;visibility:hidden;`;
      document.body.appendChild(iframe);

      await new Promise<void>((resolve) => {
        iframe.onload = () => resolve();
        iframe.contentDocument!.open();
        iframe.contentDocument!.write(htmlContent);
        iframe.contentDocument!.close();
        // Fallback in case onload doesn't fire for srcdoc writes
        setTimeout(resolve, 1500);
      });

      // Expand iframe to full content height so nothing is clipped
      const body = iframe.contentDocument!.body;
      const fullHeight = Math.max(body.scrollHeight, body.offsetHeight);
      iframe.style.height = `${fullHeight}px`;

      // Extra settle time for SVG charts and web fonts
      await new Promise(r => setTimeout(r, 400));

      // Capture at 2× scale for crisp text (retina quality)
      const canvas = await html2canvas(body, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: A4_PX_WIDTH,
        height: fullHeight,
        windowWidth: A4_PX_WIDTH,
        backgroundColor: "#ffffff",
      });

      document.body.removeChild(iframe);

      // Build PDF – smart page slicing that avoids cutting through content
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      // How many canvas pixels = one A4 page (at 2× scale, canvas.width = 794*2 = 1588)
      const pageHeightPx = Math.round((A4_MM_HEIGHT / A4_MM_WIDTH) * canvas.width);

      /**
       * Find the best Y cut-point near `idealY` by scanning upward
       * for a row of mostly-white pixels (a natural gap between content blocks).
       * Uses two passes: first a strict whitespace check (~90%), then a
       * lenient one (~70%) as a fallback for gradient/colored backgrounds.
       * Scans up to ~300px upward (enough to skip past chart blocks at 2× scale).
       */
      function findBestCut(ctx2d: CanvasRenderingContext2D, idealY: number, canvasWidth: number): number {
        const scanRange = Math.min(300, Math.floor(pageHeightPx * 0.15)); // up to 300px look-back

        // Pass 1: strict — look for a mostly-white row (>= 88% white)
        for (let dy = 0; dy <= scanRange; dy++) {
          const y = idealY - dy;
          if (y <= 0) break;
          const row = ctx2d.getImageData(0, y, canvasWidth, 1).data;
          let whitePixels = 0;
          for (let x = 0; x < row.length; x += 4) {
            const r = row[x], g = row[x + 1], b = row[x + 2];
            if (r > 235 && g > 235 && b > 235) whitePixels++;
          }
          if (whitePixels / canvasWidth > 0.88) return y;
        }

        // Pass 2: lenient — look for a lighter row (>= 70% light pixels)
        // This catches gaps near chart boxes with light backgrounds
        for (let dy = 0; dy <= scanRange; dy++) {
          const y = idealY - dy;
          if (y <= 0) break;
          const row = ctx2d.getImageData(0, y, canvasWidth, 1).data;
          let lightPixels = 0;
          for (let x = 0; x < row.length; x += 4) {
            const r = row[x], g = row[x + 1], b = row[x + 2];
            if (r > 200 && g > 200 && b > 200) lightPixels++;
          }
          if (lightPixels / canvasWidth > 0.70) return y;
        }

        return idealY; // no gap found, cut at ideal position
      }

      // Build a scratch canvas to sample pixel rows for cut detection
      const scratchCtx = (() => {
        const sc = document.createElement("canvas");
        sc.width = canvas.width; sc.height = canvas.height;
        sc.getContext("2d")!.drawImage(canvas, 0, 0);
        return sc.getContext("2d")!;
      })();

      const cuts: number[] = [0]; // start positions for each page (in canvas px)
      while (true) {
        const last = cuts[cuts.length - 1];
        const next = last + pageHeightPx;
        if (next >= canvas.height) break;
        cuts.push(findBestCut(scratchCtx, next, canvas.width));
      }
      cuts.push(canvas.height); // sentinel end

      for (let i = 0; i < cuts.length - 1; i++) {
        if (i > 0) pdf.addPage();

        const srcY = cuts[i];
        const srcH = cuts[i + 1] - srcY;

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = pageHeightPx; // always full A4 height
        const ctx = pageCanvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

        const sliceData = pageCanvas.toDataURL("image/jpeg", 0.97);
        pdf.addImage(sliceData, "JPEG", 0, 0, A4_MM_WIDTH, A4_MM_HEIGHT);
      }

      const filename = `${(reportTitle || "Road_Health_Report").replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error("PDF download error:", err);
      alert("PDF download failed. Please try again.");
    }

    setDownloading(false);
  };

  // ── Step progress label ─────────────────────────────────
  const stepLabel = {
    idle: "",
    aggregating: "Step 1/3 — Aggregating road data…",
    generating: "Step 2/3 — Generating AI narrative…",
    building_pdf: "Step 3/3 — Building report…",
    done: "",
    error: "",
  }[step];

  const isLoading = step === "aggregating" || step === "generating" || step === "building_pdf";

  return (
    <div className="min-h-screen" style={{ background: "#f8f9fc" }}>

      {/* ── Page Header (light, matching Scheduler) ──────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="px-8 pt-6 pb-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div
              whileHover={{ scale: 1.06, rotate: 2 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
            >
              <Sparkles size={22} className="text-white" />
            </motion.div>
            <div>
              <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight leading-tight">AI-Powered Reports</h1>
              <p className="text-[13px] text-gray-400 mt-0.5">
                Generate professional governance reports with Gemini AI
                <span className="ml-2 px-2 py-0.5 rounded-md text-[10px] font-bold text-orange-600" style={{ background: "rgba(249,115,22,0.1)" }}>Gemini AI</span>
                <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-cyan-600" style={{ background: "rgba(6,182,212,0.1)" }}>v1.0</span>
              </p>
            </div>
          </div>

          {/* Download button (visible when report is ready) */}
          {step === "done" && htmlContent && (
            <motion.button
              onClick={handleDownloadPdf}
              disabled={downloading}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={downloading ? {} : { scale: 1.03 }}
              whileTap={downloading ? {} : { scale: 0.97 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-bold text-white border-none transition-all"
              style={{
                cursor: downloading ? "not-allowed" : "pointer",
                background: downloading ? "#94a3b8" : "linear-gradient(135deg, #0f172a, #1d3557)",
                boxShadow: downloading ? "none" : "0 4px 15px rgba(29,53,87,0.25)",
              }}
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {downloading ? "Preparing PDF…" : "Download PDF"}
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* ── Horizontal Filter Bar (matching Registry/Scheduler) ─ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mx-8 mb-5 rounded-2xl bg-white border border-gray-200/60 shadow-sm overflow-hidden"
      >
        <div className="px-5 py-4">
          {/* Top row: filters + generate button */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 rounded-full" style={{ background: "linear-gradient(180deg, #f97316, #ea580c)" }} />
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}>
                    {activeFilterCount} active
                  </span>
                )}
                {activeFilterCount > 0 && (
                  <button onClick={() => setFilters(EMPTY_FILTERS)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-red-500 hover:bg-red-50 transition-all" style={{ background: "none", border: "1px solid #fecaca", cursor: "pointer" }}>
                    <X size={9} /> Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                <FilterSelect label="District" value={filters.district} onChange={v => setFilters(f => ({ ...f, district: v }))}
                  options={["Dhule", "Kolhapur", "Nagpur", "Nashik", "Pune", "Raigad", "Satara", "Sindhudurg", "Solapur"]} />
                <FilterInput label="Highway Ref" placeholder="e.g. NH60, NH 61" value={filters.highway}
                  onChange={v => setFilters(f => ({ ...f, highway: v }))} />
                <FilterSelect label="Condition Band" value={filters.conditionBand} onChange={v => setFilters(f => ({ ...f, conditionBand: v }))}
                  options={["Critical", "Poor", "Fair", "Good"]} />
                <FilterSelect label="Priority Level" value={filters.priorityLevel} onChange={v => setFilters(f => ({ ...f, priorityLevel: v }))}
                  options={["Critical", "High", "Medium", "Low"]} />
                <FilterSelect label="Inspection Status" value={filters.inspectionStatus} onChange={v => setFilters(f => ({ ...f, inspectionStatus: v }))}
                  options={[
                    { value: "overdue", label: "Overdue / Never" },
                    { value: "due_soon", label: "Due Soon" },
                    { value: "recently_inspected", label: "Recently Inspected" },
                  ]} />
              </div>
            </div>

            {/* Generate button in filter bar */}
            <motion.button
              onClick={handleGenerate}
              disabled={isLoading}
              whileHover={isLoading ? {} : { scale: 1.03, boxShadow: "0 8px 25px rgba(249,115,22,0.35)" }}
              whileTap={isLoading ? {} : { scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="shrink-0 flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold text-white border-none transition-all"
              style={{
                cursor: isLoading ? "not-allowed" : "pointer",
                background: isLoading ? "#94a3b8" : "linear-gradient(135deg, #f97316, #ea580c)",
                boxShadow: isLoading ? "none" : "0 4px 20px rgba(249,115,22,0.3)",
              }}
            >
              {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {isLoading ? "Generating…" : "Generate Report"}
            </motion.button>
          </div>

          {/* Advanced filters toggle */}
          <div className="mt-3 pt-2 border-t border-gray-100">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all"
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              <Filter size={12} className="text-gray-300 group-hover:text-orange-500 transition-colors" />
              Advanced Filters
              <motion.span animate={{ rotate: showAdvanced ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={12} />
              </motion.span>
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-2.5 p-3 rounded-xl" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <FilterInput label="CIBIL Min" placeholder="0" type="number" value={filters.cibilMin} onChange={v => setFilters(f => ({ ...f, cibilMin: v }))} />
                    <FilterInput label="CIBIL Max" placeholder="100" type="number" value={filters.cibilMax} onChange={v => setFilters(f => ({ ...f, cibilMax: v }))} />
                    <FilterInput label="Built From" placeholder="2000" type="number" value={filters.constructionYearMin} onChange={v => setFilters(f => ({ ...f, constructionYearMin: v }))} />
                    <FilterInput label="Built To" placeholder="2024" type="number" value={filters.constructionYearMax} onChange={v => setFilters(f => ({ ...f, constructionYearMax: v }))} />
                    <FilterInput label="Inspection From" type="date" value={filters.inspectionDateFrom} onChange={v => setFilters(f => ({ ...f, inspectionDateFrom: v }))} />
                    <FilterInput label="Inspection To" type="date" value={filters.inspectionDateTo} onChange={v => setFilters(f => ({ ...f, inspectionDateTo: v }))} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Progress bar (shows inside filter bar when loading) */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-5 pb-4"
            >
              <div className="flex items-center gap-3 mb-2">
                {[
                  { key: "aggregating", num: 1, label: "Data" },
                  { key: "generating", num: 2, label: "AI" },
                  { key: "building_pdf", num: 3, label: "Build" },
                ].map((s, i) => {
                  const done = (step === "generating" && i === 0) || (step === "building_pdf" && i <= 1);
                  const active = step === s.key;
                  return (
                    <div key={s.key} className="flex items-center" style={{ flex: i < 2 ? 1 : "none" }}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center transition-all" style={{
                          background: done ? "#22c55e" : active ? "linear-gradient(135deg,#f97316,#ea580c)" : "#e2e8f0",
                          color: done || active ? "#fff" : "#94a3b8",
                          boxShadow: active ? "0 0 0 3px rgba(249,115,22,0.2)" : "none",
                        }}>
                          {done ? "✓" : s.num}
                        </div>
                        <span className="text-[10px] font-semibold" style={{ color: active ? "#f97316" : done ? "#16a34a" : "#94a3b8" }}>{s.label}</span>
                      </div>
                      {i < 2 && <div className="flex-1 h-0.5 mx-2 rounded-full transition-all" style={{ background: done ? "#22c55e" : "#e2e8f0" }} />}
                    </div>
                  );
                })}
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  background: "linear-gradient(90deg, #f97316, #ea580c, #dc2626)",
                  backgroundSize: "200% 100%",
                  width: step === "aggregating" ? "30%" : step === "generating" ? "65%" : "92%",
                  transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                  animation: "shimmer 1.5s linear infinite",
                }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 text-center font-medium">{stepLabel}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error/Success inline feedback */}
        {step === "error" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-5 mb-4 p-3 rounded-xl flex gap-2.5 items-start" style={{ background: "linear-gradient(135deg, #fef2f2, #fff1f2)", border: "1.5px solid #fecaca" }}>
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <div className="text-[11px] text-red-600 leading-relaxed">{errorMsg}</div>
          </motion.div>
        )}
        {step === "done" && summary && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-5 mb-4 p-3 rounded-xl flex items-center justify-between" style={{ background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)", border: "1.5px solid #bbf7d0" }}>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#22c55e" }}><CheckCircle2 size={11} className="text-white" /></div>
              <span className="text-[11px] font-bold text-green-800">Report ready{usedFallback ? " (template)" : " (AI)"}</span>
              <span className="text-[10px] text-green-600 ml-1">{summary.totalFilteredRoads.toLocaleString()} roads • {summary.coveragePercent}% coverage</span>
            </div>
            <button onClick={handleGenerate} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-green-700 hover:bg-green-100 transition-all" style={{ background: "none", border: "1px solid #bbf7d0", cursor: "pointer" }}>
              <RefreshCw size={10} /> Regenerate
            </button>
          </motion.div>
        )}
      </motion.div>

      {/* ── FULL-WIDTH Content Area ──────────────────────── */}
      <div className="px-8 pb-8">

        {/* Idle state */}
        {step === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg mb-6"
              style={{ background: "linear-gradient(135deg, #fff7ed, #ffedd5)", border: "1.5px solid #fed7aa" }}
            >
              <FileText size={36} className="text-orange-400" />
            </motion.div>

            <h2 className="text-[22px] font-extrabold text-gray-900 tracking-tight mb-2">Generate Your First Report</h2>
            <p className="text-[13px] text-gray-400 max-w-[480px] text-center leading-relaxed mb-6">
              Apply optional filters above, then click &quot;Generate Report&quot; to create a professional AI-written governance report with charts, tables, and analysis.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg w-full">
              {[
                { icon: Sparkles, label: "AI Narrative", desc: "Gemini-written analysis", color: "#f97316" },
                { icon: ClipboardList, label: "Data Tables", desc: "Verified from backend", color: "#2563eb" },
                { icon: Download, label: "PDF Export", desc: "Government-style format", color: "#059669" },
              ].map((feat, i) => (
                <motion.div
                  key={feat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-gray-200/60 shadow-sm"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${feat.color}12` }}>
                    <feat.icon size={15} style={{ color: feat.color }} />
                  </div>
                  <div>
                    <div className="text-[12px] font-bold text-gray-800">{feat.label}</div>
                    <div className="text-[10px] text-gray-400">{feat.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Loading state */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="relative mb-8">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
                <Sparkles size={34} className="text-white" />
              </div>
              <div className="absolute inset-0 -m-1.5 rounded-3xl border-2 border-orange-300/30 animate-pulse" />
              <div className="absolute inset-0 -m-3 rounded-3xl border-2 border-orange-200/15 animate-pulse" style={{ animationDelay: "0.5s" }} />
            </div>
            <h2 className="text-[18px] font-bold text-gray-900 mb-1.5">
              {step === "aggregating" && "Crunching Road Data"}
              {step === "generating" && "Writing AI Report"}
              {step === "building_pdf" && "Assembling Document"}
            </h2>
            <p className="text-[13px] text-gray-400 text-center mb-8 max-w-md">
              {step === "aggregating" && "Computing statistics across the Maharashtra road network…"}
              {step === "generating" && "Gemini AI is crafting your formal governance report…"}
              {step === "building_pdf" && "Styling charts, tables and government header…"}
            </p>

            <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
              {[
                { key: "aggregating", icon: "📊", title: "Data Aggregation", desc: "Computing PCI, CIBIL, inspection metrics" },
                { key: "generating", icon: "✨", title: "AI Narrative", desc: "Gemini generating formal analysis text" },
                { key: "building_pdf", icon: "📄", title: "Report Assembly", desc: "Building styled government PDF document" },
              ].map((s, i) => {
                const done = (i === 0 && (step === "generating" || step === "building_pdf")) || (i === 1 && step === "building_pdf");
                const active = step === s.key;
                const waiting = !done && !active;
                return (
                  <div key={s.key} className="flex items-start gap-3 mb-3 last:mb-0 relative">
                    {i < 2 && <div className="absolute left-4 top-9 w-0.5 h-4 transition-colors" style={{ background: done ? "#22c55e" : "#e2e8f0" }} />}
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-sm transition-all" style={{
                      background: done ? "#f0fdf4" : active ? "#fff7ed" : "#f8fafc",
                      border: `2px solid ${done ? "#22c55e" : active ? "#f97316" : "#e2e8f0"}`,
                      boxShadow: active ? "0 0 0 4px rgba(249,115,22,0.1)" : "none",
                    }}>
                      {done ? "✓" : s.icon}
                    </div>
                    <div className="pt-1">
                      <div className="text-[12px] font-semibold transition-colors" style={{ color: done ? "#16a34a" : active ? "#ea580c" : "#94a3b8" }}>
                        {s.title}
                        {active && <span className="ml-2 text-[9px] bg-orange-500 text-white rounded-full px-2 py-0.5 font-bold">RUNNING</span>}
                        {done && <span className="ml-2 text-[9px] bg-emerald-500 text-white rounded-full px-2 py-0.5 font-bold">DONE</span>}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: waiting ? "#cbd5e1" : "#64748b" }}>{s.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          </motion.div>
        )}

        {/* Error state */}
        {step === "error" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: "linear-gradient(135deg, #fef2f2, #fff1f2)", border: "2px solid #fecaca" }}
            >
              <AlertCircle size={28} className="text-red-500" />
            </motion.div>
            <h2 className="text-[17px] font-bold text-gray-900">Generation Failed</h2>
            <p className="text-[13px] text-gray-400 max-w-[400px] text-center leading-relaxed mt-1">{errorMsg}</p>
          </motion.div>
        )}

        {/* Preview content */}
        {step === "done" && (
          <div ref={previewRef} style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>

            {/* Summary stat cards */}
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-7">
                {[
                  { label: "Roads Analysed", value: summary.totalFilteredRoads.toLocaleString(), from: "from-blue-500", to: "to-blue-600", shadow: "shadow-blue-500/20" },
                  { label: "Network Coverage", value: `${summary.coveragePercent}%`, from: "from-violet-500", to: "to-purple-600", shadow: "shadow-violet-500/20" },
                  { label: "Critical Roads", value: summary.conditionBreakdown.Critical.toLocaleString(), from: "from-red-500", to: "to-rose-600", shadow: "shadow-red-500/20" },
                  { label: "Est. Repair Cost", value: `₹${summary.estimatedTotalCostCrores.toLocaleString()} Cr`, from: "from-amber-500", to: "to-orange-600", shadow: "shadow-amber-500/20" },
                  { label: "Avg CIBIL Score", value: summary.avgCibilScore.toString(), from: "from-cyan-500", to: "to-teal-600", shadow: "shadow-cyan-500/20" },
                  { label: "Avg PCI Score", value: summary.avgPciScore.toString(), from: "from-emerald-500", to: "to-green-600", shadow: "shadow-emerald-500/20" },
                  { label: "Overdue Insp.", value: summary.inspection.overdueCount.toLocaleString(), from: "from-orange-500", to: "to-orange-600", shadow: "shadow-orange-500/20" },
                  { label: "High Decay Roads", value: summary.highDecayCount.toLocaleString(), from: "from-rose-500", to: "to-red-600", shadow: "shadow-rose-500/20" },
                ].map((card, i) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.35, ease: "easeOut" }}
                    whileHover={{ y: -4, scale: 1.02 }}
                    className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.from} ${card.to} text-white shadow-lg ${card.shadow} cursor-default`}
                  >
                    <div className="relative z-10 px-4 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/70 mb-1">{card.label}</p>
                      <p className="text-[22px] font-extrabold tabular-nums leading-none">{card.value}</p>
                    </div>
                    {/* Decorative watermark */}
                    <div className="absolute -bottom-2 -right-2 text-white/[0.08]">
                      <Sparkles size={48} strokeWidth={1.5} />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* AI Narrative */}
            {narrative && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-2xl overflow-hidden shadow-sm mb-6"
                style={{ background: "#fff", border: "1px solid #e2e8f0" }}
              >
                <div className="px-7 py-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, #0f172a, #1d3557)", borderBottom: "3px solid #f97316" }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(249,115,22,0.2)" }}>
                    <Sparkles size={15} className="text-orange-400" />
                  </div>
                  <div>
                    <div className="text-[14px] font-bold text-white">{reportTitle}</div>
                    <div className="text-[10px] text-gray-400">AI-generated narrative • All numbers verified against backend data</div>
                  </div>
                </div>
                <div className="report-narrative px-7 py-6" style={{ fontSize: 13, lineHeight: 1.75, color: "#334155" }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{narrative}</ReactMarkdown>
                </div>
              </motion.div>
            )}

            {/* Condition table */}
            {summary && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="rounded-2xl overflow-hidden shadow-sm mb-6" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
                <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg, #dc2626, #ea580c)" }} />
                  <h3 className="text-[13px] font-bold text-gray-800 uppercase tracking-wide">Condition Distribution</h3>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "linear-gradient(135deg, #0f172a, #1d3557)" }}>
                      {["Condition Band", "Roads", "Percentage", "Implication"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", color: "#fff", textAlign: "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.3px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { band: "Critical (PCI < 40)", count: summary.conditionBreakdown.Critical, pct: summary.conditionPercents.Critical, color: "#dc2626", note: "Emergency action required" },
                      { band: "Poor (PCI 40–59)", count: summary.conditionBreakdown.Poor, pct: summary.conditionPercents.Poor, color: "#ea580c", note: "Major repair needed" },
                      { band: "Fair (PCI 60–74)", count: summary.conditionBreakdown.Fair, pct: summary.conditionPercents.Fair, color: "#ca8a04", note: "Preventive maintenance" },
                      { band: "Good (PCI ≥ 75)", count: summary.conditionBreakdown.Good, pct: summary.conditionPercents.Good, color: "#16a34a", note: "Routine monitoring" },
                    ].map((row, i) => (
                      <tr key={row.band} className="transition-colors hover:bg-blue-50/40" style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 600 }}>{row.band}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>{row.count.toLocaleString()}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: row.color }}>{row.pct}%</td>
                        <td style={{ padding: "10px 14px", color: "#64748b" }}>{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}

            {/* Top 10 worst roads */}
            {summary && summary.top10WorstByPci.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-2xl overflow-hidden shadow-sm mb-6" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
                <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg, #ef4444, #dc2626)" }} />
                  <h3 className="text-[13px] font-bold text-gray-800 uppercase tracking-wide">Top 10 Priority Roads — Immediate Attention Required</h3>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "linear-gradient(135deg, #0f172a, #1d3557)" }}>
                      {["#", "Road ID", "District", "PCI", "CIBIL", "Surface", "Length"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", color: "#fff", textAlign: h === "#" || h === "PCI" || h === "CIBIL" || h === "Length" ? "center" : "left", fontSize: 10, fontWeight: 600, letterSpacing: "0.3px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.top10WorstByPci.map((road, i) => (
                      <tr key={road.road_id} className="transition-colors hover:bg-red-50/40" style={{ background: i % 2 === 0 ? "#fef2f2" : "#fff" }}>
                        <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, color: "#dc2626" }}>{i + 1}</td>
                        <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 10, color: "#475569" }}>{road.road_id}</td>
                        <td style={{ padding: "9px 12px", color: "#334155" }}>{road.district}</td>
                        <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, color: road.pci_score < 40 ? "#dc2626" : "#ea580c" }}>{road.pci_score}</td>
                        <td style={{ padding: "9px 12px", textAlign: "center" }}>{road.cibil_score}</td>
                        <td style={{ padding: "9px 12px", color: "#64748b", textTransform: "capitalize" }}>{road.surface_type}</td>
                        <td style={{ padding: "9px 12px", textAlign: "center" }}>{road.length_km} km</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}

            {/* District breakdown */}
            {summary && summary.districtBreakdown.length > 1 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="rounded-2xl overflow-hidden shadow-sm mb-6" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
                <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg, #7c3aed, #2563eb)" }} />
                  <h3 className="text-[13px] font-bold text-gray-800 uppercase tracking-wide">District Breakdown</h3>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "linear-gradient(135deg, #0f172a, #1d3557)" }}>
                      {["District", "Roads", "Avg PCI", "Avg CIBIL", "Critical", "Length", "Est. Cost"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", color: "#fff", textAlign: "left", fontSize: 10, fontWeight: 600, letterSpacing: "0.3px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.districtBreakdown.slice(0, 15).map((d, i) => (
                      <tr key={d.district} className="transition-colors hover:bg-blue-50/40" style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                        <td style={{ padding: "9px 12px", fontWeight: 600 }}>{d.district}</td>
                        <td style={{ padding: "9px 12px" }}>{d.totalRoads.toLocaleString()}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: d.avgPci < 40 ? "#dc2626" : d.avgPci < 60 ? "#ea580c" : "#16a34a" }}>{d.avgPci}</td>
                        <td style={{ padding: "9px 12px" }}>{d.avgCibil}</td>
                        <td style={{ padding: "9px 12px", color: d.criticalCount > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{d.criticalCount}</td>
                        <td style={{ padding: "9px 12px" }}>{d.totalLengthKm} km</td>
                        <td style={{ padding: "9px 12px" }}>₹{d.estimatedCostLakhs.toLocaleString()} L</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}

            {/* AI disclaimer */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="rounded-xl overflow-hidden mb-6" style={{ background: "linear-gradient(135deg, #fffbeb, #fff7ed)", border: "1px solid #fed7aa" }}>
              <div className="flex">
                <div className="w-1.5 shrink-0" style={{ background: "linear-gradient(180deg, #f97316, #ea580c)" }} />
                <div className="p-4 text-[11px] text-amber-900 leading-relaxed">
                  <strong>⚠ AI Assistance Disclaimer:</strong> This report was generated using the Road-CIBIL Intelligence System v1.0.
                  All numerical values are derived from backend analysis of field survey data.
                  Gemini AI was used solely for narrative composition.
                  Data source: {summary?.dataTimestamp}.
                  Model: {summary?.modelVersion}.
                  Generated: {summary && new Date(summary.generatedAt).toLocaleString("en-IN")}.
                </div>
              </div>
            </motion.div>

          </div>
        )}
      </div>

      {/* ── Tailwind prose overrides for ReactMarkdown ── */}
      <style>{`
        .report-narrative h2 { font-size: 14px; font-weight: 700; color: #1d3557; margin: 20px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #1d3557; text-transform: uppercase; letter-spacing: 0.4px; }
        .report-narrative h3 { font-size: 13px; font-weight: 600; color: #334155; margin: 14px 0 6px; }
        .report-narrative p { margin-bottom: 10px; }
        .report-narrative ul, .report-narrative ol { padding-left: 20px; margin-bottom: 10px; }
        .report-narrative li { margin-bottom: 4px; }
        .report-narrative strong { color: #1e293b; }
        .report-narrative table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 12px; }
        .report-narrative th { background: #1d3557; color: #fff; padding: 6px 10px; text-align: left; font-size: 11px; }
        .report-narrative td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
        .report-narrative tr:nth-child(even) td { background: #f8fafc; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Small reusable filter components ────────────────────────

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[] | Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 block mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-gray-200/60 text-[12px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 transition-all cursor-pointer font-medium"
        style={{ color: value ? "#1e293b" : "#94a3b8" }}
      >
        <option value="">All</option>
        {options.map(opt =>
          typeof opt === "string"
            ? <option key={opt} value={opt}>{opt}</option>
            : <option key={opt.value} value={opt.value}>{opt.label}</option>
        )}
      </select>
    </div>
  );
}

function FilterInput({
  label, value, onChange, placeholder = "", type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex-1">
      <label className="text-[11px] font-semibold text-gray-500 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl border border-gray-200/60 text-[12px] text-gray-900 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 transition-all placeholder:text-gray-300"
      />
    </div>
  );
}
