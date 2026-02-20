"use client";

import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Filter,
} from "lucide-react";
import { ReportSummary, ReportType } from "@/lib/reportAggregator";

// ─── Report types ────────────────────────────────────────────
const REPORT_TYPES: Array<{
  id: ReportType; label: string; short: string;
  icon: string; color: string; bg: string;
}> = [
  { id: "network_overview",      label: "Network Overview",      short: "Full network health assessment",     icon: "🌐", color: "#1d4ed8", bg: "#eff6ff" },
  { id: "district_level",        label: "District-Level",        short: "Comparative district analysis",      icon: "🏛️", color: "#7c3aed", bg: "#f5f3ff" },
  { id: "critical_intervention", label: "Critical Intervention", short: "Emergency action priorities",        icon: "🚨", color: "#dc2626", bg: "#fef2f2" },
  { id: "inspection_audit",      label: "Inspection Audit",      short: "Compliance & scheduling gaps",       icon: "📋", color: "#0891b2", bg: "#ecfeff" },
  { id: "budget_planning",       label: "Budget & Planning",     short: "Cost estimates & ROI analysis",      icon: "💰", color: "#059669", bg: "#ecfdf5" },
];

// ─── Filter state ─────────────────────────────────────────────
interface FilterState {
  district: string; highway: string; conditionBand: string;
  priorityLevel: string; inspectionStatus: string;
  cibilMin: string; cibilMax: string;
  constructionYearMin: string; constructionYearMax: string;
  inspectionDateFrom: string; inspectionDateTo: string;
}
const EMPTY_FILTERS: FilterState = {
  district: "", highway: "", conditionBand: "", priorityLevel: "",
  inspectionStatus: "", cibilMin: "", cibilMax: "",
  constructionYearMin: "", constructionYearMax: "",
  inspectionDateFrom: "", inspectionDateTo: "",
};

// ─── Main component ───────────────────────────────────────────
export default function ReportsPage() {
  const [selectedType,  setSelectedType]  = useState<ReportType>("network_overview");
  const [filters,       setFilters]       = useState<FilterState>(EMPTY_FILTERS);
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [step,          setStep]          = useState<"idle"|"aggregating"|"generating"|"building_pdf"|"done"|"error">("idle");
  const [errorMsg,      setErrorMsg]      = useState("");
  const [summary,       setSummary]       = useState<ReportSummary | null>(null);
  const [narrative,     setNarrative]     = useState("");
  const [usedFallback,  setUsedFallback]  = useState(false);
  const [reportTitle,   setReportTitle]   = useState("");
  const [htmlContent,   setHtmlContent]   = useState("");
  const [downloading,   setDownloading]   = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = Object.values(filters).filter(v => v !== "").length;
  const isLoading = step === "aggregating" || step === "generating" || step === "building_pdf";
  const rt = REPORT_TYPES.find(r => r.id === selectedType)!;

  const setFilter = useCallback((k: keyof FilterState, v: string) =>
    setFilters(f => ({ ...f, [k]: v })), []);

  const buildPayload = useCallback(() => {
    const p: Record<string, unknown> = { reportType: selectedType };
    if (filters.district)            p.district            = filters.district;
    if (filters.highway)             p.highway             = filters.highway;
    if (filters.conditionBand)       p.conditionBand       = filters.conditionBand;
    if (filters.priorityLevel)       p.priorityLevel       = filters.priorityLevel;
    if (filters.inspectionStatus)    p.inspectionStatus    = filters.inspectionStatus;
    if (filters.cibilMin)            p.cibilMin            = parseFloat(filters.cibilMin);
    if (filters.cibilMax)            p.cibilMax            = parseFloat(filters.cibilMax);
    if (filters.constructionYearMin) p.constructionYearMin = parseInt(filters.constructionYearMin);
    if (filters.constructionYearMax) p.constructionYearMax = parseInt(filters.constructionYearMax);
    if (filters.inspectionDateFrom)  p.inspectionDateFrom  = filters.inspectionDateFrom;
    if (filters.inspectionDateTo)    p.inspectionDateTo    = filters.inspectionDateTo;
    return p;
  }, [filters, selectedType]);

  // ── Generation flow ─────────────────────────────────────────
  const handleGenerate = async () => {
    setStep("aggregating"); setErrorMsg(""); setSummary(null);
    setNarrative(""); setUsedFallback(false); setHtmlContent("");
    try {
      // 1 — Aggregate
      const aggRes  = await fetch("/api/reports/aggregate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload()) });
      const aggData = await aggRes.json() as ReportSummary & { error?: string };
      if (!aggRes.ok || aggData.error) { setErrorMsg(aggData.error || "Aggregation failed"); setStep("error"); return; }
      setSummary(aggData);

      // 2 — Narrative
      setStep("generating");
      const genRes  = await fetch("/api/reports/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(aggData) });
      const genData = await genRes.json() as { narrative: string; reportTitle: string; usedFallback?: boolean; error?: string };
      if (!genRes.ok || genData.error) { setErrorMsg(genData.error || "Generation failed"); setStep("error"); return; }
      setNarrative(genData.narrative); setUsedFallback(!!genData.usedFallback); setReportTitle(genData.reportTitle);

      // 3 — PDF HTML
      setStep("building_pdf");
      const pdfRes  = await fetch("/api/reports/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ narrative: genData.narrative, summary: aggData, reportTitle: genData.reportTitle }) });
      const pdfData = await pdfRes.json() as { html: string; error?: string };
      if (!pdfRes.ok || pdfData.error) { setErrorMsg(pdfData.error || "PDF build failed"); setStep("error"); return; }
      setHtmlContent(pdfData.html); setStep("done");
    } catch (err) {
      setErrorMsg("Network error. Please ensure the server is running.");
      setStep("error");
      console.error(err);
    }
  };

  // ── PDF Download ────────────────────────────────────────────
  const handleDownloadPdf = async () => {
    if (!htmlContent) return;
    setDownloading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const A4W = 794, A4MW = 210, A4MH = 297;
      const iframe = document.createElement("iframe");
      iframe.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${A4W}px;border:none;visibility:hidden;`;
      document.body.appendChild(iframe);
      await new Promise<void>(resolve => {
        iframe.onload = () => resolve();
        iframe.contentDocument!.open(); iframe.contentDocument!.write(htmlContent); iframe.contentDocument!.close();
        setTimeout(resolve, 1500);
      });
      const body = iframe.contentDocument!.body;
      const fullH = Math.max(body.scrollHeight, body.offsetHeight);
      iframe.style.height = `${fullH}px`;
      await new Promise(r => setTimeout(r, 400));
      const canvas = await html2canvas(body, { scale: 2, useCORS: true, logging: false, width: A4W, height: fullH, windowWidth: A4W, backgroundColor: "#ffffff" });
      document.body.removeChild(iframe);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageHPx = Math.round((A4MH / A4MW) * canvas.width);
      function findCut(ctx2d: CanvasRenderingContext2D, ideal: number, cw: number): number {
        for (let dy = 0; dy <= 60; dy++) {
          const y = ideal - dy; if (y <= 0) break;
          const row = ctx2d.getImageData(0, y, cw, 1).data;
          let white = 0;
          for (let x = 0; x < row.length; x += 4) if (row[x] > 240 && row[x+1] > 240 && row[x+2] > 240) white++;
          if (white / cw > 0.92) return y;
        }
        return ideal;
      }
      const sc = document.createElement("canvas");
      sc.width = canvas.width; sc.height = canvas.height;
      sc.getContext("2d")!.drawImage(canvas, 0, 0);
      const scratchCtx = sc.getContext("2d")!;
      const cuts = [0];
      while (true) {
        const last = cuts[cuts.length - 1], next = last + pageHPx;
        if (next >= canvas.height) break;
        cuts.push(findCut(scratchCtx, next, canvas.width));
      }
      cuts.push(canvas.height);
      for (let i = 0; i < cuts.length - 1; i++) {
        if (i > 0) pdf.addPage();
        const srcY = cuts[i], srcH = cuts[i+1] - srcY;
        const pc = document.createElement("canvas");
        pc.width = canvas.width; pc.height = pageHPx;
        const ctx = pc.getContext("2d")!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pc.width, pc.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
        pdf.addImage(pc.toDataURL("image/jpeg", 0.97), "JPEG", 0, 0, A4MW, A4MH);
      }
      pdf.save(`${(reportTitle || "Road_Health_Report").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (err) { alert("PDF download failed. Please try again."); console.error(err); }
    setDownloading(false);
  };

  // ── Step helpers ─────────────────────────────────────────────
  const stepIdx = step === "aggregating" ? 0 : step === "generating" ? 1 : step === "building_pdf" ? 2 : -1;
  const STEPS = [
    { key: "aggregating",  emoji: "📊", title: "Data Aggregation", desc: "Computing PCI, CIBIL & inspection metrics" },
    { key: "generating",   emoji: "✨", title: "AI Narrative",     desc: "Gemini crafting your governance report" },
    { key: "building_pdf", emoji: "📄", title: "Report Assembly",  desc: "Building styled government document" },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#f1f5f9", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── Top header bar ──────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0f172a 100%)",
        padding: "14px 28px", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0, borderBottom: "1px solid #1e293b",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${rt.color}, ${rt.color}99)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, transition: "all 0.2s" }}>
            {rt.icon}
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>AI-Powered Reports</div>
            <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 1 }}>
              Maharashtra Road Health System &nbsp;•&nbsp; Gemini AI
            </div>
          </div>
        </div>
        {step === "done" && (
          <button onClick={handleDownloadPdf} disabled={downloading} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "9px 18px",
            background: downloading ? "#64748b" : "linear-gradient(135deg, #10b981, #059669)",
            color: "#fff", border: "none", borderRadius: 9, fontWeight: 600,
            fontSize: 13, cursor: downloading ? "not-allowed" : "pointer",
            boxShadow: "0 4px 14px rgba(16,185,129,0.35)", transition: "all 0.2s",
          }}>
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ══ LEFT PANEL ══════════════════════════════════════ */}
        <div style={{
          width: 292, flexShrink: 0, background: "#fff",
          borderRight: "1px solid #e2e8f0", display: "flex",
          flexDirection: "column", overflow: "hidden",
        }}>
          {/* Scrollable area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 0" }}>

            {/* Report type */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 8 }}>
                Report Type
              </div>
              {REPORT_TYPES.map(r => {
                const active = selectedType === r.id;
                return (
                  <button key={r.id} onClick={() => setSelectedType(r.id)} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px", borderRadius: 9, border: "none",
                    marginBottom: 3, cursor: "pointer", textAlign: "left",
                    background: active ? r.bg : "transparent",
                    outline: active ? `1.5px solid ${r.color}55` : "1.5px solid transparent",
                    transition: "all 0.15s",
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0, fontSize: 14,
                      background: active ? r.color : "#f1f5f9",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                    }}>{r.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: active ? 600 : 500, color: active ? r.color : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.short}</div>
                    </div>
                    {active && <div style={{ width: 5, height: 5, borderRadius: "50%", background: r.color, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>

            <div style={{ height: 1, background: "#f1f5f9", margin: "2px -14px 14px" }} />

            {/* Filters */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.09em", textTransform: "uppercase" }}>Filters</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {activeFilterCount > 0 && (
                    <>
                      <span style={{ background: rt.color, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{activeFilterCount}</span>
                      <button onClick={() => setFilters(EMPTY_FILTERS)} style={{ fontSize: 9, color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}>
                        <X size={8} /> Clear
                      </button>
                    </>
                  )}
                </div>
              </div>

              <FSelect label="District" value={filters.district} onChange={v => setFilter("district", v)}
                options={["Dhule","Kolhapur","Nagpur","Nashik","Pune","Raigad","Satara","Sindhudurg","Solapur"]} />
              <FInput  label="Highway Ref" placeholder="e.g. NH60, SH72" value={filters.highway} onChange={v => setFilter("highway", v)} />
              <FSelect label="Condition Band" value={filters.conditionBand} onChange={v => setFilter("conditionBand", v)}
                options={["Critical","Poor","Fair","Good"]} />
              <FSelect label="Priority Level" value={filters.priorityLevel} onChange={v => setFilter("priorityLevel", v)}
                options={["Critical","High","Medium","Low"]} />
              <FSelect label="Inspection Status" value={filters.inspectionStatus} onChange={v => setFilter("inspectionStatus", v)}
                options={[
                  { value: "overdue", label: "Overdue / Never Inspected" },
                  { value: "due_soon", label: "Due Soon (6–12 months)" },
                  { value: "recently_inspected", label: "Recently Inspected" },
                ]} />

              {/* Advanced toggle */}
              <button onClick={() => setShowAdvanced(s => !s)} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 8px", borderRadius: 7, border: "1px dashed #cbd5e1",
                background: showAdvanced ? "#f8fafc" : "transparent", cursor: "pointer",
                fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 6, marginBottom: 4,
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Filter size={10} /> Advanced</span>
                {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>

              {showAdvanced && (
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 8px 6px", border: "1px solid #e2e8f0", marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <FInput label="CIBIL Min" placeholder="0"    type="number" value={filters.cibilMin} onChange={v => setFilter("cibilMin", v)} />
                    <FInput label="CIBIL Max" placeholder="100"  type="number" value={filters.cibilMax} onChange={v => setFilter("cibilMax", v)} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <FInput label="Year From" placeholder="2000" type="number" value={filters.constructionYearMin} onChange={v => setFilter("constructionYearMin", v)} />
                    <FInput label="Year To"   placeholder="2024" type="number" value={filters.constructionYearMax} onChange={v => setFilter("constructionYearMax", v)} />
                  </div>
                  <FInput label="Insp. From" type="date" value={filters.inspectionDateFrom} onChange={v => setFilter("inspectionDateFrom", v)} />
                  <FInput label="Insp. To"   type="date" value={filters.inspectionDateTo}   onChange={v => setFilter("inspectionDateTo", v)} />
                </div>
              )}
            </div>
          </div>

          {/* ── Sticky bottom: active pills + Generate button ── */}
          <div style={{
            padding: "10px 14px 14px", borderTop: "1px solid #f1f5f9",
            background: "#fff", boxShadow: "0 -4px 16px rgba(0,0,0,0.05)",
          }}>
            {/* Active filter pills */}
            {activeFilterCount > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                {filters.district         && <Pill label={`📍 ${filters.district}`}         onRemove={() => setFilter("district", "")} />}
                {filters.highway          && <Pill label={`🛣 ${filters.highway}`}           onRemove={() => setFilter("highway", "")} />}
                {filters.conditionBand    && <Pill label={`🔵 ${filters.conditionBand}`}     onRemove={() => setFilter("conditionBand", "")} />}
                {filters.priorityLevel    && <Pill label={`⚡ ${filters.priorityLevel}`}     onRemove={() => setFilter("priorityLevel", "")} />}
                {filters.inspectionStatus && <Pill label={`📅 ${filters.inspectionStatus}`}  onRemove={() => setFilter("inspectionStatus", "")} />}
              </div>
            )}

            {/* Generate */}
            <button onClick={handleGenerate} disabled={isLoading} style={{
              width: "100%", padding: "11px", borderRadius: 10, border: "none",
              background: isLoading ? "#94a3b8" : `linear-gradient(135deg, ${rt.color}, ${rt.color}bb)`,
              color: "#fff", fontWeight: 700, fontSize: 13,
              cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: isLoading ? "none" : `0 4px 14px ${rt.color}44`,
              transition: "all 0.2s",
            }}>
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {isLoading ? "Generating…" : "Generate Report"}
            </button>

            {/* Mini progress dots — only while loading */}
            {isLoading && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                  {STEPS.map((s, i) => {
                    const done   = i < stepIdx;
                    const active = i === stepIdx;
                    return (
                      <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : "none" }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                          background: done ? "#22c55e" : active ? rt.color : "#e2e8f0",
                          color: "#fff", display: "flex", alignItems: "center",
                          justifyContent: "center", fontSize: 10, fontWeight: 700,
                          boxShadow: active ? `0 0 0 3px ${rt.color}33` : "none",
                          transition: "all 0.3s",
                        }}>
                          {done ? "✓" : i + 1}
                        </div>
                        {i < 2 && <div style={{ flex: 1, height: 2, margin: "0 3px", background: done ? "#22c55e" : "#e2e8f0", borderRadius: 1, transition: "all 0.4s" }} />}
                      </div>
                    );
                  })}
                </div>
                <div style={{ height: 4, background: "#e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 8, transition: "width 0.6s ease",
                    width: step === "aggregating" ? "28%" : step === "generating" ? "64%" : "92%",
                    background: `linear-gradient(90deg, ${rt.color}, ${rt.color}88)`,
                    backgroundSize: "200% 100%", animation: "shimmerL 1.4s linear infinite",
                  }} />
                </div>
                <p style={{ fontSize: 9, color: "#64748b", marginTop: 5, textAlign: "center" }}>
                  {step === "aggregating" ? "Step 1/3 — Aggregating road data…" : step === "generating" ? "Step 2/3 — Writing AI narrative…" : "Step 3/3 — Assembling document…"}
                </p>
              </div>
            )}

            {/* Success badge */}
            {step === "done" && summary && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <CheckCircle2 size={12} style={{ color: "#16a34a" }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#166534" }}>
                      Report ready {usedFallback ? "(template)" : "(AI)"}
                    </span>
                  </div>
                  <button onClick={handleGenerate} style={{ fontSize: 10, color: "#166534", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                    <RefreshCw size={9} /> Redo
                  </button>
                </div>
                <div style={{ fontSize: 10, color: "#4ade80", marginTop: 4, lineHeight: 1.6 }}>
                  {summary.totalFilteredRoads.toLocaleString()} roads &nbsp;•&nbsp; {summary.coveragePercent}% network<br/>
                  CIBIL: {summary.avgCibilScore} &nbsp;•&nbsp; PCI: {summary.avgPciScore}
                </div>
              </div>
            )}

            {/* Error badge */}
            {step === "error" && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca", display: "flex", gap: 7, alignItems: "flex-start" }}>
                <AlertCircle size={13} style={{ color: "#dc2626", flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 10, color: "#dc2626", lineHeight: 1.5 }}>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* ══ RIGHT PANEL ══════════════════════════════════════ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Toolbar (only when done) */}
          {step === "done" && htmlContent && (
            <div style={{
              background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "10px 20px",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>{rt.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{reportTitle}</span>
                <span style={{ fontSize: 10, background: usedFallback ? "#fef3c7" : "#d1fae5", color: usedFallback ? "#92400e" : "#065f46", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                  {usedFallback ? "Template" : "✓ AI Generated"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleGenerate} style={{
                  fontSize: 12, color: rt.color, background: rt.bg,
                  border: `1px solid ${rt.color}44`, borderRadius: 7,
                  padding: "5px 12px", cursor: "pointer", fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <RefreshCw size={11} /> Regenerate
                </button>
                <button onClick={handleDownloadPdf} disabled={downloading} style={{
                  fontSize: 12, color: "#fff", background: downloading ? "#94a3b8" : "#1d3557",
                  border: "none", borderRadius: 7, padding: "5px 14px",
                  cursor: downloading ? "not-allowed" : "pointer", fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  {downloading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                  {downloading ? "Preparing…" : "Download PDF"}
                </button>
              </div>
            </div>
          )}

          {/* Content area */}
          <div style={{ flex: 1, overflow: "auto" }}>

            {/* ── IDLE ── */}
            {step === "idle" && (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "32px 40px" }}>
                <div style={{ width: 72, height: 72, borderRadius: 18, background: rt.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>
                  {rt.icon}
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Ready to generate</div>
                  <div style={{ fontSize: 13, color: "#64748b", maxWidth: 340, lineHeight: 1.6 }}>
                    Configure your report on the left, then click&nbsp;
                    <strong style={{ color: rt.color }}>Generate Report</strong>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  {[["16,312", "Road Segments"], ["9", "Districts"], ["3", "AI Steps"]].map(([v, l]) => (
                    <div key={l} style={{ textAlign: "center", background: "#fff", borderRadius: 10, padding: "10px 18px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: rt.color }}>{v}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
                  {["AI Narrative", "Verified Data", "Professional PDF", "Export Ready"].map(tag => (
                    <span key={tag} style={{ fontSize: 11, background: "#f1f5f9", color: "#475569", borderRadius: 20, padding: "4px 12px", border: "1px solid #e2e8f0" }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── LOADING ── */}
            {isLoading && (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 40px" }}>
                {/* Pulsing orb */}
                <div style={{ position: "relative" }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: 22, fontSize: 34,
                    background: `linear-gradient(135deg, ${rt.color}, ${rt.color}99)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 8px 32px ${rt.color}44`,
                  }}>{rt.icon}</div>
                  <div style={{ position: "absolute", inset: -7, borderRadius: 28, border: `2px solid ${rt.color}30`, animation: "orbPing 1.8s ease-out infinite" }} />
                  <div style={{ position: "absolute", inset: -14, borderRadius: 34, border: `2px solid ${rt.color}15`, animation: "orbPing 1.8s ease-out infinite 0.5s" }} />
                </div>

                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", marginBottom: 5 }}>
                    {step === "aggregating" ? "Crunching Road Data" : step === "generating" ? "Writing AI Report" : "Assembling Document"}
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
                    {step === "aggregating" ? "Computing statistics across 16,312 Maharashtra road segments…" : step === "generating" ? "Gemini AI is crafting your formal governance narrative…" : "Styling charts, KPI cards and government header…"}
                  </div>
                </div>

                {/* Step cards */}
                <div style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 14, padding: "16px 18px", boxShadow: "0 4px 24px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0" }}>
                  {STEPS.map((s, i) => {
                    const done   = i < stepIdx;
                    const active = i === stepIdx;
                    return (
                      <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 10px", borderRadius: 9, marginBottom: i < 2 ? 4 : 0, transition: "all 0.3s", background: active ? `${rt.color}10` : done ? "#f0fdf4" : "#f8fafc", border: active ? `1px solid ${rt.color}30` : "1px solid transparent" }}>
                        <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: done ? "#10b981" : active ? rt.color : "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: done ? 14 : 17, transition: "all 0.3s" }}>
                          {done ? "✓" : s.emoji}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: done ? "#10b981" : active ? rt.color : "#94a3b8" }}>{s.title}</div>
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{s.desc}</div>
                        </div>
                        {active && <span style={{ fontSize: 9, background: rt.color, color: "#fff", padding: "2px 7px", borderRadius: 8, fontWeight: 700 }}>LIVE</span>}
                        {done   && <span style={{ fontSize: 9, background: "#d1fae5", color: "#065f46", padding: "2px 7px", borderRadius: 8, fontWeight: 700 }}>DONE</span>}
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 14, background: "#f1f5f9", borderRadius: 8, height: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 8, transition: "width 0.7s ease", width: step === "aggregating" ? "28%" : step === "generating" ? "65%" : "93%", background: `linear-gradient(90deg, ${rt.color}, ${rt.color}88)`, backgroundSize: "200% 100%", animation: "shimmerL 1.6s linear infinite" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                    <span style={{ fontSize: 9, color: "#94a3b8" }}>Step {stepIdx + 1} of 3</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: rt.color }}>{step === "aggregating" ? "28%" : step === "generating" ? "65%" : "93%"}</span>
                  </div>
                </div>

                <style>{`
                  @keyframes orbPing { 0% { transform:scale(1); opacity:0.7; } 100% { transform:scale(1.5); opacity:0; } }
                  @keyframes shimmerL { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
                  @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
                `}</style>
              </div>
            )}

            {/* ── ERROR ── */}
            {step === "error" && (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <AlertCircle size={30} style={{ color: "#dc2626" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Generation Failed</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 5, maxWidth: 360 }}>{errorMsg}</div>
                </div>
                <button onClick={handleGenerate} style={{ padding: "9px 22px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 9, fontWeight: 600, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                  <RefreshCw size={13} /> Retry
                </button>
              </div>
            )}

            {/* ── DONE — preview ── */}
            {step === "done" && (
              <div ref={previewRef} style={{ padding: "20px 28px", maxWidth: 1080, margin: "0 auto" }}>

                {/* KPI cards */}
                {summary && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                    {[
                      { label: "Roads Analysed",    value: summary.totalFilteredRoads.toLocaleString(),              color: rt.color },
                      { label: "Network Coverage",  value: `${summary.coveragePercent}%`,                           color: "#7c3aed" },
                      { label: "Critical Roads",     value: summary.conditionBreakdown.Critical.toLocaleString(),    color: "#dc2626" },
                      { label: "Est. Repair Cost",  value: `₹${summary.estimatedTotalCostCrores.toLocaleString()} Cr`, color: "#d97706" },
                      { label: "Avg CIBIL Score",   value: summary.avgCibilScore.toString(),                        color: "#0891b2" },
                      { label: "Avg PCI Score",     value: summary.avgPciScore.toString(),                          color: "#059669" },
                      { label: "Overdue Insp.",     value: summary.inspection.overdueCount.toLocaleString(),        color: "#ea580c" },
                      { label: "High Decay Roads",  value: summary.highDecayCount.toLocaleString(),                 color: "#b45309" },
                    ].map(c => (
                      <div key={c.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", borderTop: `3px solid ${c.color}` }}>
                        <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700 }}>{c.label}</div>
                        <div style={{ fontSize: 21, fontWeight: 800, color: c.color, marginTop: 4, lineHeight: 1.1 }}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI Narrative */}
                {narrative && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 12, borderBottom: `2px solid ${rt.color}` }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: rt.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{rt.icon}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{reportTitle}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>AI-generated • All numbers verified from backend data</div>
                      </div>
                    </div>
                    <div className="rn">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{narrative}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Condition table */}
                {summary && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 22px", marginBottom: 18 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Condition Distribution</h3>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr style={{ background: "#1d3557" }}>
                        {["Condition Band","Roads","Percentage","Implication"].map(h => <th key={h} style={{ padding: "7px 10px", color: "#fff", textAlign: "left", fontSize: 10, fontWeight: 600 }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {[
                          ["Critical (PCI < 40)", summary.conditionBreakdown.Critical, summary.conditionPercents.Critical, "#dc2626", "Emergency action required"],
                          ["Poor (PCI 40–59)",    summary.conditionBreakdown.Poor,     summary.conditionPercents.Poor,     "#ea580c", "Major repair needed"],
                          ["Fair (PCI 60–74)",    summary.conditionBreakdown.Fair,     summary.conditionPercents.Fair,     "#ca8a04", "Preventive maintenance"],
                          ["Good (PCI ≥ 75)",     summary.conditionBreakdown.Good,     summary.conditionPercents.Good,     "#16a34a", "Routine monitoring"],
                        ].map(([band, cnt, pct, col, note], i) => (
                          <tr key={String(band)} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                            <td style={{ padding: "7px 10px", fontWeight: 600 }}>{String(band)}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right" }}>{Number(cnt).toLocaleString()}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: String(col) }}>{String(pct)}%</td>
                            <td style={{ padding: "7px 10px", color: "#64748b" }}>{String(note)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Top 10 roads */}
                {summary && summary.top10WorstByPci.length > 0 && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 22px", marginBottom: 18 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Top 10 Priority Roads</h3>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr style={{ background: "#1d3557" }}>
                        {["#","Road ID","District","PCI","CIBIL","Surface","Length"].map(h => <th key={h} style={{ padding: "6px 10px", color: "#fff", fontSize: 10, textAlign: "left" }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {summary.top10WorstByPci.map((r, i) => (
                          <tr key={r.road_id} style={{ background: i % 2 === 0 ? "#fef2f2" : "#fff" }}>
                            <td style={{ padding: "6px 10px", fontWeight: 700, color: "#dc2626" }}>{i+1}</td>
                            <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 10, color: "#475569" }}>{r.road_id}</td>
                            <td style={{ padding: "6px 10px" }}>{r.district}</td>
                            <td style={{ padding: "6px 10px", fontWeight: 700, color: r.pci_score < 40 ? "#dc2626" : "#ea580c" }}>{r.pci_score}</td>
                            <td style={{ padding: "6px 10px" }}>{r.cibil_score}</td>
                            <td style={{ padding: "6px 10px", color: "#64748b" }}>{r.surface_type}</td>
                            <td style={{ padding: "6px 10px" }}>{r.length_km} km</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* District breakdown */}
                {summary && summary.districtBreakdown.length > 1 && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 22px", marginBottom: 18 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>District Breakdown</h3>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr style={{ background: "#1d3557" }}>
                        {["District","Roads","Avg PCI","Avg CIBIL","Critical","Length","Est. Cost"].map(h => <th key={h} style={{ padding: "6px 10px", color: "#fff", fontSize: 10, textAlign: "left" }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {summary.districtBreakdown.slice(0, 15).map((d, i) => (
                          <tr key={d.district} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                            <td style={{ padding: "6px 10px", fontWeight: 600 }}>{d.district}</td>
                            <td style={{ padding: "6px 10px" }}>{d.totalRoads.toLocaleString()}</td>
                            <td style={{ padding: "6px 10px", fontWeight: 700, color: d.avgPci < 40 ? "#dc2626" : d.avgPci < 60 ? "#ea580c" : "#16a34a" }}>{d.avgPci}</td>
                            <td style={{ padding: "6px 10px" }}>{d.avgCibil}</td>
                            <td style={{ padding: "6px 10px", fontWeight: 600, color: d.criticalCount > 0 ? "#dc2626" : "#16a34a" }}>{d.criticalCount}</td>
                            <td style={{ padding: "6px 10px" }}>{d.totalLengthKm} km</td>
                            <td style={{ padding: "6px 10px" }}>₹{d.estimatedCostLakhs.toLocaleString()} L</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Disclaimer */}
                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderLeft: `4px solid ${rt.color}`, borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
                  <div style={{ fontSize: 10, color: "#9a3412", lineHeight: 1.7 }}>
                    <strong>⚠ AI Assistance Disclaimer:</strong> Generated by the Road-CIBIL Intelligence System v1.0.
                    All numerical values are derived from backend field survey data. Gemini AI was used solely for narrative composition.
                    Data source: {summary?.dataTimestamp}. Model: {summary?.modelVersion}.
                    Generated: {summary && new Date(summary.generatedAt).toLocaleString("en-IN")}.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Global styles ──────────────────────────────────── */}
      <style>{`
        .rn { font-size: 13px; line-height: 1.75; color: #334155; }
        .rn h2 { font-size: 13px; font-weight: 700; color: #1d3557; margin: 18px 0 7px; padding-bottom: 4px; border-bottom: 2px solid #1d3557; text-transform: uppercase; letter-spacing: 0.4px; }
        .rn h3 { font-size: 12px; font-weight: 600; color: #334155; margin: 12px 0 5px; }
        .rn p  { margin-bottom: 9px; }
        .rn ul, .rn ol { padding-left: 18px; margin-bottom: 9px; }
        .rn li { margin-bottom: 3px; }
        .rn strong { color: #1e293b; }
        .rn table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
        .rn th { background: #1d3557; color: #fff; padding: 5px 9px; text-align: left; font-size: 10px; }
        .rn td { padding: 5px 9px; border-bottom: 1px solid #e2e8f0; }
        .rn tr:nth-child(even) td { background: #f8fafc; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Helper components ─────────────────────────────────────────
function FSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[] | Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 3 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "6px 9px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 11, color: value ? "#1e293b" : "#94a3b8", background: "#f8fafc", outline: "none" }}>
        <option value="">All</option>
        {options.map(o => typeof o === "string"
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FInput({ label, value, onChange, placeholder = "", type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div style={{ flex: 1, marginBottom: 8 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 3 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: "6px 9px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 11, color: "#1e293b", background: "#f8fafc", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}

function Pill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#eff6ff", color: "#1d4ed8", fontSize: 9, fontWeight: 600, padding: "3px 7px", borderRadius: 20, border: "1px solid #bfdbfe" }}>
      {label}
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#93c5fd", fontSize: 10, padding: 0, lineHeight: 1 }}>✕</button>
    </span>
  );
}
