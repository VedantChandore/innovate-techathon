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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  Filter,
  ChevronDown,
  ChevronUp,
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
       * Find the best Y cut-point near `idealY` by scanning up to 60px upward
       * for a row of mostly-white pixels (a natural gap between content blocks).
       * Falls back to idealY if no whitespace gap found.
       */
      function findBestCut(ctx2d: CanvasRenderingContext2D, idealY: number, canvasWidth: number): number {
        const scanRange = Math.min(60, Math.floor(pageHeightPx * 0.06)); // up to 60px look-back
        for (let dy = 0; dy <= scanRange; dy++) {
          const y = idealY - dy;
          if (y <= 0) break;
          const row = ctx2d.getImageData(0, y, canvasWidth, 1).data;
          let whitePixels = 0;
          for (let x = 0; x < row.length; x += 4) {
            const r = row[x], g = row[x + 1], b = row[x + 2];
            if (r > 240 && g > 240 && b > 240) whitePixels++;
          }
          const whitePct = whitePixels / (canvasWidth);
          if (whitePct > 0.92) return y; // found a natural whitespace row
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

      {/* ── Page Header ─────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #1d3557 0%, #1a1a2e 100%)", padding: "32px 40px" }}>
        <div className="flex items-center gap-4 mb-2">
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 10 }}>
            <Sparkles size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-2xl tracking-tight">AI-Powered Reports</h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 }}>
              Generate professional governance reports with Gemini AI • Maharashtra Road Health System
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-0" style={{ minHeight: "calc(100vh - 120px)" }}>

        {/* ── LEFT PANEL: Config ──────────────────────── */}
        <div style={{
          width: 400, flexShrink: 0, borderRight: "1px solid #e2e8f0",
          background: "#fff", padding: "28px 24px", overflowY: "auto",
          maxHeight: "calc(100vh - 120px)", position: "sticky", top: 0,
        }}>

          {/* Basic Filters */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#64748b" }}>
                Filters
              </h3>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <span style={{ fontSize: 10, background: "#3b82f6", color: "#fff", borderRadius: 10, padding: "1px 7px", fontWeight: 600 }}>
                    {activeFilterCount} active
                  </span>
                )}
                {activeFilterCount > 0 && (
                  <button onClick={() => setFilters(EMPTY_FILTERS)} style={{ fontSize: 10, color: "#ef4444", cursor: "pointer", background: "none", border: "none", display: "flex", alignItems: "center", gap: 2 }}>
                    <X size={10} /> Clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <FilterSelect label="District" value={filters.district} onChange={v => setFilters(f => ({ ...f, district: v }))}
                options={["Dhule", "Kolhapur", "Nagpur", "Nashik", "Pune", "Raigad", "Satara", "Sindhudurg", "Solapur"]} />

              <FilterInput label="Highway Ref" placeholder="e.g. NH60, NH 61, NH130D" value={filters.highway}
                onChange={v => setFilters(f => ({ ...f, highway: v }))} />

              <FilterSelect label="Condition Band" value={filters.conditionBand} onChange={v => setFilters(f => ({ ...f, conditionBand: v }))}
                options={["Critical", "Poor", "Fair", "Good"]} />

              <FilterSelect label="Priority Level" value={filters.priorityLevel} onChange={v => setFilters(f => ({ ...f, priorityLevel: v }))}
                options={["Critical", "High", "Medium", "Low"]} />

              <FilterSelect label="Inspection Status" value={filters.inspectionStatus} onChange={v => setFilters(f => ({ ...f, inspectionStatus: v }))}
                options={[
                  { value: "overdue", label: "Overdue / Never Inspected" },
                  { value: "due_soon", label: "Due Soon (6–12 months)" },
                  { value: "recently_inspected", label: "Recently Inspected" },
                ]} />
            </div>

            {/* Advanced Filters Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
            >
              <Filter size={12} />
              Advanced Filters
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showAdvanced && (
              <div className="flex flex-col gap-2.5 mt-3 p-3 rounded-lg" style={{ background: "#f8f9fc", border: "1px solid #e2e8f0" }}>
                <div className="flex gap-2">
                  <FilterInput label="CIBIL Min" placeholder="0" type="number" value={filters.cibilMin} onChange={v => setFilters(f => ({ ...f, cibilMin: v }))} />
                  <FilterInput label="CIBIL Max" placeholder="100" type="number" value={filters.cibilMax} onChange={v => setFilters(f => ({ ...f, cibilMax: v }))} />
                </div>
                <div className="flex gap-2">
                  <FilterInput label="Built From" placeholder="2000" type="number" value={filters.constructionYearMin} onChange={v => setFilters(f => ({ ...f, constructionYearMin: v }))} />
                  <FilterInput label="Built To" placeholder="2024" type="number" value={filters.constructionYearMax} onChange={v => setFilters(f => ({ ...f, constructionYearMax: v }))} />
                </div>
                <FilterInput label="Inspection From" type="date" value={filters.inspectionDateFrom} onChange={v => setFilters(f => ({ ...f, inspectionDateFrom: v }))} />
                <FilterInput label="Inspection To" type="date" value={filters.inspectionDateTo} onChange={v => setFilters(f => ({ ...f, inspectionDateTo: v }))} />
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            style={{
              width: "100%", padding: "13px", borderRadius: 10,
              background: isLoading ? "#94a3b8" : "linear-gradient(135deg, #1d3557, #2563eb)",
              color: "#fff", fontWeight: 700, fontSize: 14,
              border: "none", cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: isLoading ? "none" : "0 4px 15px rgba(37,99,235,0.3)",
              transition: "all 0.2s ease", marginTop: 8,
            }}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isLoading ? "Generating…" : "Generate Report"}
          </button>

          {/* Progress Steps */}
          {isLoading && (
            <div style={{ marginTop: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
              {/* Step dots */}
              <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                {[
                  { key: "aggregating", num: 1, label: "Data" },
                  { key: "generating",  num: 2, label: "AI" },
                  { key: "building_pdf",num: 3, label: "Build" },
                ].map((s, i) => {
                  const done = (step === "generating" && i === 0) || (step === "building_pdf" && i <= 1);
                  const active = step === s.key;
                  return (
                    <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : "none" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: "50%",
                          background: done ? "#22c55e" : active ? "linear-gradient(135deg,#2563eb,#7c3aed)" : "#e2e8f0",
                          color: done || active ? "#fff" : "#94a3b8",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700,
                          boxShadow: active ? "0 0 0 3px rgba(37,99,235,0.2)" : "none",
                          transition: "all 0.3s ease",
                        }}>
                          {done ? "✓" : s.num}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 600, color: active ? "#2563eb" : done ? "#16a34a" : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          {s.label}
                        </span>
                      </div>
                      {i < 2 && (
                        <div style={{ flex: 1, height: 2, margin: "0 4px", marginBottom: 14, background: done ? "#22c55e" : "#e2e8f0", transition: "background 0.4s ease", borderRadius: 1 }} />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Animated bar */}
              <div style={{ height: 5, background: "#e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 10,
                  background: "linear-gradient(90deg, #2563eb, #7c3aed, #06b6d4)",
                  backgroundSize: "200% 100%",
                  width: step === "aggregating" ? "30%" : step === "generating" ? "65%" : "92%",
                  transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                  animation: "shimmer 1.5s linear infinite",
                }} />
              </div>
              <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
              <p style={{ fontSize: 10, color: "#64748b", marginTop: 7, textAlign: "center", fontWeight: 500 }}>{stepLabel}</p>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertCircle size={14} style={{ color: "#dc2626", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 11, color: "#dc2626" }}>{errorMsg}</div>
            </div>
          )}

          {/* Success stats */}
          {step === "done" && summary && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <CheckCircle2 size={13} style={{ color: "#16a34a" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#166534" }}>Report ready{usedFallback ? " (template)" : " (AI)"}</span>
              </div>
              <div style={{ fontSize: 10, color: "#4ade80", lineHeight: 1.8 }}>
                {summary.totalFilteredRoads.toLocaleString()} roads analysed &nbsp;•&nbsp;
                {summary.coveragePercent}% network coverage<br />
                Avg CIBIL: {summary.avgCibilScore} &nbsp;•&nbsp; Avg PCI: {summary.avgPciScore}
              </div>
              <button
                onClick={handleGenerate}
                style={{ marginTop: 6, fontSize: 10, color: "#166534", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <RefreshCw size={10} /> Regenerate
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL: Preview ────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* Preview toolbar */}
          {step === "done" && htmlContent && (
            <div style={{
              position: "sticky", top: 0, zIndex: 10,
              background: "#fff", borderBottom: "1px solid #e2e8f0",
              padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileText size={15} style={{ color: "#1d4ed8" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{reportTitle}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>— Preview</span>
              </div>
              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 18px", borderRadius: 8, cursor: downloading ? "not-allowed" : "pointer",
                  background: downloading ? "#94a3b8" : "#1d3557", color: "#fff",
                  fontSize: 12, fontWeight: 600, border: "none",
                  boxShadow: "0 2px 8px rgba(29,53,87,0.25)",
                }}
              >
                {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                {downloading ? "Preparing PDF…" : "Download PDF"}
              </button>
            </div>
          )}

          {/* Idle state */}
          {step === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 200px)", gap: 16, padding: 40 }}>
              <div style={{ width: 72, height: 72, borderRadius: 16, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FileText size={32} style={{ color: "#94a3b8" }} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>No Report Generated Yet</h2>
              <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", maxWidth: 400 }}>
                Select a report type, apply optional filters, then click &quot;Generate Report&quot; to create a professional AI-written governance report.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
                {["AI-generated narrative", "Structured tables", "Professional PDF", "No hallucinated numbers"].map(tag => (
                  <span key={tag} style={{ fontSize: 11, background: "#f1f5f9", color: "#475569", borderRadius: 20, padding: "4px 12px", border: "1px solid #e2e8f0" }}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 200px)", gap: 0, padding: "0 48px" }}>

              {/* Animated icon */}
              <div style={{ position: "relative", marginBottom: 32 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 22,
                  background: "linear-gradient(135deg, #1d3557 0%, #2563eb 60%, #7c3aed 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 8px 32px rgba(37,99,235,0.35)",
                }}>
                  <Sparkles size={34} className="text-white" />
                </div>
                {/* Pulsing ring */}
                <div style={{
                  position: "absolute", inset: -6, borderRadius: 28,
                  border: "2px solid rgba(37,99,235,0.25)",
                  animation: "pulse-ring 2s ease-in-out infinite",
                }} />
                <div style={{
                  position: "absolute", inset: -13, borderRadius: 34,
                  border: "2px solid rgba(37,99,235,0.1)",
                  animation: "pulse-ring 2s ease-in-out infinite 0.4s",
                }} />
              </div>

              {/* Heading */}
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", marginBottom: 6, textAlign: "center" }}>
                {step === "aggregating" && "Crunching Road Data"}
                {step === "generating"  && "Writing AI Report"}
                {step === "building_pdf" && "Assembling Document"}
              </h2>
              <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 36, lineHeight: 1.6 }}>
                {step === "aggregating" && "Computing statistics across the Maharashtra road network…"}
                {step === "generating"  && "Gemini AI is crafting your formal governance report…"}
                {step === "building_pdf" && "Styling charts, tables and government header…"}
              </p>

              {/* Step tracker */}
              <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "20px 24px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
                {[
                  { key: "aggregating",  icon: "📊", title: "Data Aggregation",    desc: "Computing PCI, CIBIL, inspection metrics" },
                  { key: "generating",   icon: "✨", title: "AI Narrative",        desc: "Gemini generating formal analysis text" },
                  { key: "building_pdf", icon: "📄", title: "Report Assembly",     desc: "Building styled government PDF document" },
                ].map((s, i) => {
                  const done   = (i === 0 && (step === "generating" || step === "building_pdf"))
                               || (i === 1 && step === "building_pdf");
                  const active = step === s.key;
                  const waiting = !done && !active;
                  return (
                    <div key={s.key} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: i < 2 ? 16 : 0, position: "relative" }}>
                      {/* Connector line */}
                      {i < 2 && (
                        <div style={{
                          position: "absolute", left: 16, top: 36, width: 2, height: 16,
                          background: done ? "#22c55e" : "#e2e8f0", transition: "background 0.4s",
                        }} />
                      )}
                      {/* Circle */}
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        background: done ? "#f0fdf4" : active ? "linear-gradient(135deg,#eff6ff,#f5f3ff)" : "#f8fafc",
                        border: `2px solid ${done ? "#22c55e" : active ? "#2563eb" : "#e2e8f0"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15,
                        boxShadow: active ? "0 0 0 4px rgba(37,99,235,0.12)" : "none",
                        transition: "all 0.3s ease",
                      }}>
                        {done ? "✓" : s.icon}
                      </div>
                      {/* Text */}
                      <div style={{ paddingTop: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: done ? "#16a34a" : active ? "#1e40af" : "#94a3b8", transition: "color 0.3s" }}>
                          {s.title}
                          {active && <span style={{ marginLeft: 8, fontSize: 10, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", borderRadius: 20, padding: "1px 8px", fontWeight: 700, verticalAlign: "middle" }}>RUNNING</span>}
                          {done   && <span style={{ marginLeft: 8, fontSize: 10, background: "#22c55e", color: "#fff", borderRadius: 20, padding: "1px 8px", fontWeight: 700, verticalAlign: "middle" }}>DONE</span>}
                        </div>
                        <div style={{ fontSize: 11, color: waiting ? "#cbd5e1" : "#64748b", marginTop: 1 }}>{s.desc}</div>
                      </div>
                    </div>
                  );
                })}

                {/* Progress bar */}
                <div style={{ marginTop: 20, height: 6, background: "#f1f5f9", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 10,
                    background: "linear-gradient(90deg, #2563eb, #7c3aed, #06b6d4)",
                    backgroundSize: "200% 100%",
                    width: step === "aggregating" ? "30%" : step === "generating" ? "65%" : "93%",
                    transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
                    animation: "shimmer 1.8s linear infinite",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Step {step === "aggregating" ? 1 : step === "generating" ? 2 : 3} of 3
                  </span>
                  <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600 }}>
                    {step === "aggregating" ? "30" : step === "generating" ? "65" : "93"}%
                  </span>
                </div>
              </div>

              <style>{`
                @keyframes pulse-ring {
                  0%   { opacity: 0.8; transform: scale(1); }
                  50%  { opacity: 0.3; transform: scale(1.05); }
                  100% { opacity: 0.8; transform: scale(1); }
                }
                @keyframes shimmer {
                  0%   { background-position: 200% 0; }
                  100% { background-position: -200% 0; }
                }
              `}</style>
            </div>
          )}

          {/* Error state */}
          {step === "error" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 200px)", gap: 16 }}>
              <div style={{ width: 60, height: 60, borderRadius: 50, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertCircle size={28} style={{ color: "#dc2626" }} />
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Generation Failed</h2>
              <p style={{ fontSize: 13, color: "#94a3b8", maxWidth: 400, textAlign: "center" }}>{errorMsg}</p>
            </div>
          )}

          {/* Preview content */}
          {step === "done" && (
            <div ref={previewRef} style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>

              {/* Summary stat cards */}
              {summary && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                  {[
                    { label: "Roads Analysed", value: summary.totalFilteredRoads.toLocaleString(), color: "#1d4ed8" },
                    { label: "Network Coverage", value: `${summary.coveragePercent}%`, color: "#7c3aed" },
                    { label: "Critical Roads", value: summary.conditionBreakdown.Critical.toLocaleString(), color: "#dc2626" },
                    { label: "Est. Repair Cost", value: `₹${summary.estimatedTotalCostCrores.toLocaleString()} Cr`, color: "#d97706" },
                    { label: "Avg CIBIL Score", value: summary.avgCibilScore.toString(), color: "#0891b2" },
                    { label: "Avg PCI Score", value: summary.avgPciScore.toString(), color: "#059669" },
                    { label: "Overdue Insp.", value: summary.inspection.overdueCount.toLocaleString(), color: "#ea580c" },
                    { label: "High Decay Roads", value: summary.highDecayCount.toLocaleString(), color: "#dc2626" },
                  ].map(card => (
                    <div key={card.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 600 }}>{card.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: card.color, marginTop: 4 }}>{card.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* AI Narrative */}
              {narrative && (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "24px 28px", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 14, borderBottom: "2px solid #1d3557" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: "#1d3557", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Sparkles size={14} style={{ color: "#fff" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1d3557" }}>{reportTitle}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>AI-generated narrative • All numbers verified against backend data</div>
                    </div>
                  </div>
                  <div className="report-narrative" style={{ fontSize: 13, lineHeight: 1.75, color: "#334155" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{narrative}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Condition table */}
              {summary && (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1d3557", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.5px" }}>Condition Distribution</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#1d3557" }}>
                        {["Condition Band", "Roads", "Percentage", "Implication"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", color: "#fff", textAlign: "left", fontSize: 11, fontWeight: 600 }}>{h}</th>
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
                        <tr key={row.band} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{row.band}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right" }}>{row.count.toLocaleString()}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: row.color }}>{row.pct}%</td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{row.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Top 10 worst roads */}
              {summary && summary.top10WorstByPci.length > 0 && (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1d3557", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Top 10 Priority Roads — Immediate Attention Required
                  </h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#1d3557" }}>
                        {["#", "Road ID", "District", "PCI", "CIBIL", "Surface", "Length"].map(h => (
                          <th key={h} style={{ padding: "7px 10px", color: "#fff", textAlign: h === "#" || h === "PCI" || h === "CIBIL" || h === "Length" ? "center" : "left", fontSize: 10 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.top10WorstByPci.map((road, i) => (
                        <tr key={road.road_id} style={{ background: i % 2 === 0 ? "#fef2f2" : "#fff" }}>
                          <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 700, color: "#dc2626" }}>{i + 1}</td>
                          <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: 10, color: "#475569" }}>{road.road_id}</td>
                          <td style={{ padding: "7px 10px", color: "#334155" }}>{road.district}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 700, color: road.pci_score < 40 ? "#dc2626" : "#ea580c" }}>{road.pci_score}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center" }}>{road.cibil_score}</td>
                          <td style={{ padding: "7px 10px", color: "#64748b", textTransform: "capitalize" }}>{road.surface_type}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center" }}>{road.length_km} km</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* District breakdown */}
              {summary && summary.districtBreakdown.length > 1 && (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1d3557", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.5px" }}>District Breakdown</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#1d3557" }}>
                        {["District", "Roads", "Avg PCI", "Avg CIBIL", "Critical", "Length", "Est. Cost"].map(h => (
                          <th key={h} style={{ padding: "7px 10px", color: "#fff", textAlign: "left", fontSize: 10 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.districtBreakdown.slice(0, 15).map((d, i) => (
                        <tr key={d.district} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                          <td style={{ padding: "7px 10px", fontWeight: 600 }}>{d.district}</td>
                          <td style={{ padding: "7px 10px" }}>{d.totalRoads.toLocaleString()}</td>
                          <td style={{ padding: "7px 10px", fontWeight: 700, color: d.avgPci < 40 ? "#dc2626" : d.avgPci < 60 ? "#ea580c" : "#16a34a" }}>{d.avgPci}</td>
                          <td style={{ padding: "7px 10px" }}>{d.avgCibil}</td>
                          <td style={{ padding: "7px 10px", color: d.criticalCount > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{d.criticalCount}</td>
                          <td style={{ padding: "7px 10px" }}>{d.totalLengthKm} km</td>
                          <td style={{ padding: "7px 10px" }}>₹{d.estimatedCostLakhs.toLocaleString()} L</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* AI disclaimer */}
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderLeft: "4px solid #f97316", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "#9a3412", lineHeight: 1.7 }}>
                  <strong>⚠ AI Assistance Disclaimer:</strong> This report was generated using the Road-CIBIL Intelligence System v1.0.
                  All numerical values are derived from backend analysis of field survey data.
                  Gemini AI was used solely for narrative composition.
                  Data source: {summary?.dataTimestamp}.
                  Model: {summary?.modelVersion}.
                  Generated: {summary && new Date(summary.generatedAt).toLocaleString("en-IN")}.
                </div>
              </div>

            </div>
          )}
        </div>
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
      <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 3 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 12, color: value ? "#1e293b" : "#94a3b8", background: "#fff", outline: "none" }}
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
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 3 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 12, color: "#1e293b", background: "#fff", outline: "none" }}
      />
    </div>
  );
}
