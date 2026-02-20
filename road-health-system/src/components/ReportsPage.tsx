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

      // Render HTML in a hidden iframe
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1200px;height:800px;";
      document.body.appendChild(iframe);
      iframe.contentDocument!.open();
      iframe.contentDocument!.write(htmlContent);
      iframe.contentDocument!.close();

      await new Promise(r => setTimeout(r, 1200)); // wait for fonts/images

      const canvas = await html2canvas(iframe.contentDocument!.body, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: 1200,
        backgroundColor: "#ffffff",
      });

      document.body.removeChild(iframe);

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = pdfHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= 297;

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= 297;
      }

      const filename = `${reportTitle.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
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

          {/* Report Type Selector */}
          <div className="mb-6">
            <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#64748b", marginBottom: 12 }}>
              1. Select Report Type
            </h3>
            <div className="flex flex-col gap-2">
              {REPORT_TYPES.map(rt => {
                const Icon = rt.icon;
                const active = selectedType === rt.id;
                return (
                  <button
                    key={rt.id}
                    onClick={() => setSelectedType(rt.id)}
                    style={{
                      border: `2px solid ${active ? rt.color : "#e2e8f0"}`,
                      background: active ? rt.bg : "#fff",
                      borderRadius: 10, padding: "10px 14px",
                      display: "flex", alignItems: "center", gap: 12,
                      textAlign: "left", cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: active ? rt.color : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={15} className={active ? "text-white" : "text-gray-400"} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active ? rt.color : "#1e293b" }}>{rt.label}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{rt.description}</div>
                    </div>
                    {active && <CheckCircle2 size={14} style={{ marginLeft: "auto", color: rt.color, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Basic Filters */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#64748b" }}>
                2. Filters
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
                options={["Nagpur", "Pune", "Mumbai", "Nashik", "Aurangabad", "Solapur", "Kolhapur", "Amravati", "Akola", "Latur", "Chandrapur", "Yavatmal", "Nandurbar", "Buldhana"]} />

              <FilterInput label="Highway Ref" placeholder="e.g. NH-6, SH-72" value={filters.highway}
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

          {/* Progress Bar */}
          {isLoading && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, textAlign: "center" }}>{stepLabel}</div>
              <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  background: "linear-gradient(90deg, #2563eb, #7c3aed)",
                  width: step === "aggregating" ? "33%" : step === "generating" ? "66%" : "90%",
                  transition: "width 0.4s ease",
                }} />
              </div>
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
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 200px)", gap: 20 }}>
              <div style={{ position: "relative" }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #1d3557, #2563eb)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={28} className="text-white" />
                </div>
                <Loader2 size={16} style={{ position: "absolute", bottom: -4, right: -4, color: "#2563eb", animation: "spin 1s linear infinite" }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>{stepLabel}</p>
                <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  {step === "aggregating" && "Computing statistics across road network…"}
                  {step === "generating" && "Gemini is writing your formal report…"}
                  {step === "building_pdf" && "Assembling styled government document…"}
                </p>
              </div>
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
