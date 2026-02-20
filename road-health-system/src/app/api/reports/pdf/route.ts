/**
 * POST /api/reports/pdf
 * ─────────────────────
 * Receives { narrative, summary, reportTitle } and returns a
 * professionally styled HTML string that the client converts to PDF
 * using jsPDF + html2canvas.
 *
 * Why HTML-in-response instead of server-side PDF:
 *   - Puppeteer is too heavy for Vercel/edge deploys
 *   - jsPDF on client gives full control over styling
 *   - HTML is reviewable / debuggable before PDF rendering
 *
 * The HTML uses print-safe CSS that renders as a government-style document.
 */

import { NextRequest, NextResponse } from "next/server";
import { ReportSummary } from "@/lib/reportAggregator";

interface PdfRequest {
  narrative: string;
  summary: ReportSummary;
  reportTitle: string;
}

function markdownToHtmlSections(md: string): string {
  // Convert markdown headings and paragraphs to styled HTML
  return md
    .replace(/^## (.+)$/gm, '<h2 class="section-heading">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="sub-heading">$1</h3>')
    .replace(/^\*\*(.+?)\*\*/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul class="report-list">$&</ul>')
    .replace(/\n\n/g, '</p><p class="body-text">')
    .replace(/^(?!<[hul])(.+)$/gm, '<p class="body-text">$1</p>')
    .replace(/<p class="body-text"><\/p>/g, '');
}

function buildConditionTable(summary: ReportSummary): string {
  const { conditionBreakdown, conditionPercents } = summary;
  const rows = [
    ["Critical (PCI < 40)", conditionBreakdown.Critical, conditionPercents.Critical, "#dc2626"],
    ["Poor (PCI 40–59)", conditionBreakdown.Poor, conditionPercents.Poor, "#ea580c"],
    ["Fair (PCI 60–74)", conditionBreakdown.Fair, conditionPercents.Fair, "#ca8a04"],
    ["Good (PCI ≥ 75)", conditionBreakdown.Good, conditionPercents.Good, "#16a34a"],
  ] as const;

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Condition Band</th>
          <th>Road Segments</th>
          <th>Percentage</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([label, count, pct, color]) => `
          <tr>
            <td><strong>${label}</strong></td>
            <td style="text-align:right">${(count as number).toLocaleString()}</td>
            <td style="text-align:right">${pct}%</td>
            <td><span style="color:${color};font-weight:700">${(count as number) > 0 ? "⚠ Requires Attention" : "✓ Acceptable"}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function buildTop10Table(summary: ReportSummary): string {
  const roads = summary.top10WorstByPci;
  if (!roads || roads.length === 0) return "<p>No critical roads in filtered dataset.</p>";

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Road ID</th>
          <th>Name</th>
          <th>District</th>
          <th>PCI</th>
          <th>CIBIL</th>
          <th>Length (km)</th>
        </tr>
      </thead>
      <tbody>
        ${roads.map((r, i) => `
          <tr>
            <td style="text-align:center">${i + 1}</td>
            <td><code style="font-size:10px">${r.road_id}</code></td>
            <td>${r.name || "—"}</td>
            <td>${r.district}</td>
            <td style="text-align:right;color:#dc2626;font-weight:700">${r.pci_score}</td>
            <td style="text-align:right">${r.cibil_score}</td>
            <td style="text-align:right">${r.length_km}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function buildDistrictTable(summary: ReportSummary): string {
  if (!summary.districtBreakdown || summary.districtBreakdown.length <= 1) return "";
  const top = summary.districtBreakdown.slice(0, 15);

  return `
    <h2 class="section-heading">District-Level Breakdown</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th>District</th>
          <th>Roads</th>
          <th>Avg PCI</th>
          <th>Avg CIBIL</th>
          <th>Critical</th>
          <th>Length (km)</th>
          <th>Est. Cost (₹ Lakhs)</th>
        </tr>
      </thead>
      <tbody>
        ${top.map(d => `
          <tr>
            <td><strong>${d.district}</strong></td>
            <td style="text-align:right">${d.totalRoads.toLocaleString()}</td>
            <td style="text-align:right;color:${d.avgPci < 40 ? "#dc2626" : d.avgPci < 60 ? "#ea580c" : "#16a34a"}">${d.avgPci}</td>
            <td style="text-align:right">${d.avgCibil}</td>
            <td style="text-align:right;color:${d.criticalCount > 0 ? "#dc2626" : "#16a34a"}">${d.criticalCount}</td>
            <td style="text-align:right">${d.totalLengthKm}</td>
            <td style="text-align:right">₹ ${d.estimatedCostLakhs.toLocaleString()}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function buildKpiCards(summary: ReportSummary): string {
  const cards = [
    { label: "Total Roads Analysed", value: summary.totalFilteredRoads.toLocaleString(), color: "#1d4ed8" },
    { label: "Network Coverage", value: `${summary.coveragePercent}%`, color: "#7c3aed" },
    { label: "Avg CIBIL Score", value: summary.avgCibilScore.toString(), color: "#0891b2" },
    { label: "Avg PCI Score", value: summary.avgPciScore.toString(), color: "#059669" },
    { label: "Total Length", value: `${summary.totalLengthKm.toLocaleString()} km`, color: "#0891b2" },
    { label: "Critical Roads", value: summary.conditionBreakdown.Critical.toLocaleString(), color: "#dc2626" },
    { label: "Overdue Inspections", value: summary.inspection.overdueCount.toLocaleString(), color: "#ea580c" },
    { label: "Est. Repair Cost", value: `₹ ${summary.estimatedTotalCostCrores.toLocaleString()} Cr`, color: "#d97706" },
  ];

  return `
    <div class="kpi-grid">
      ${cards.map(c => `
        <div class="kpi-card">
          <div class="kpi-label">${c.label}</div>
          <div class="kpi-value" style="color:${c.color}">${c.value}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function buildFiltersApplied(summary: ReportSummary): string {
  const f = summary.filtersApplied;
  const active: string[] = [];
  if (f.district) active.push(`District: ${f.district}`);
  if (f.highway) active.push(`Highway: ${f.highway}`);
  if (f.conditionBand) active.push(`Condition: ${f.conditionBand}`);
  if (f.priorityLevel) active.push(`Priority: ${f.priorityLevel}`);
  if (f.inspectionStatus) active.push(`Inspection Status: ${f.inspectionStatus}`);
  if (f.cibilMin !== undefined) active.push(`CIBIL Min: ${f.cibilMin}`);
  if (f.cibilMax !== undefined) active.push(`CIBIL Max: ${f.cibilMax}`);
  if (f.constructionYearMin) active.push(`Year From: ${f.constructionYearMin}`);
  if (f.constructionYearMax) active.push(`Year To: ${f.constructionYearMax}`);
  if (f.inspectionDateFrom) active.push(`Inspection From: ${f.inspectionDateFrom}`);
  if (f.inspectionDateTo) active.push(`Inspection To: ${f.inspectionDateTo}`);

  if (active.length === 0) return `<p class="filter-badge">No filters applied — Full network report</p>`;
  return `<div class="filter-badges">${active.map(a => `<span class="filter-badge">${a}</span>`).join(" ")}</div>`;
}

export async function POST(req: NextRequest) {
  let body: PdfRequest;
  try {
    body = await req.json() as PdfRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { narrative, summary, reportTitle } = body;
  if (!narrative || !summary) {
    return NextResponse.json({ error: "narrative and summary are required" }, { status: 400 });
  }

  const formattedDate = new Date(summary.generatedAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "short",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${reportTitle} — Road Health System</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', 'Arial', sans-serif;
      font-size: 13px;
      color: #1a1a2e;
      background: #ffffff;
      line-height: 1.65;
    }

    /* ─── GOV HEADER ─── */
    .gov-header {
      background: linear-gradient(135deg, #1d3557 0%, #1a1a2e 60%, #2c3e50 100%);
      color: white;
      padding: 24px 40px;
      display: flex;
      align-items: center;
      gap: 20px;
      border-bottom: 4px solid #e67e22;
    }
    .gov-emblem {
      width: 56px; height: 56px;
      background: rgba(255,255,255,0.15);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; flex-shrink: 0;
    }
    .gov-header-text { flex: 1; }
    .gov-title { font-size: 19px; font-weight: 700; letter-spacing: 0.5px; }
    .gov-subtitle { font-size: 11px; opacity: 0.75; margin-top: 3px; letter-spacing: 1px; text-transform: uppercase; }
    .gov-header-right { text-align: right; font-size: 10px; opacity: 0.7; line-height: 1.8; }

    /* ─── REPORT TITLE BAND ─── */
    .title-band {
      background: #f8f9fa;
      border-bottom: 2px solid #dee2e6;
      padding: 18px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .report-title { font-size: 16px; font-weight: 700; color: #1d3557; }
    .report-meta { font-size: 10px; color: #6c757d; text-align: right; line-height: 1.8; }
    .report-id { font-family: monospace; background: #e9ecef; padding: 2px 6px; border-radius: 3px; }

    /* ─── FILTERS SECTION ─── */
    .filters-section {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 10px 40px;
      font-size: 11px;
      color: #856404;
    }
    .filters-section strong { color: #533f03; }
    .filter-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .filter-badge {
      background: #fff;
      border: 1px solid #ffc107;
      border-radius: 12px;
      padding: 2px 10px;
      font-size: 10px;
      color: #533f03;
    }

    /* ─── MAIN CONTENT ─── */
    .main-content { padding: 28px 40px; }

    /* ─── KPI GRID ─── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 28px;
    }
    .kpi-card {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #6c757d; font-weight: 600; }
    .kpi-value { font-size: 20px; font-weight: 700; margin-top: 4px; }

    /* ─── SECTIONS ─── */
    .section-heading {
      font-size: 14px;
      font-weight: 700;
      color: #1d3557;
      margin: 24px 0 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #1d3557;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .sub-heading {
      font-size: 12px;
      font-weight: 600;
      color: #343a40;
      margin: 14px 0 6px;
    }
    .body-text {
      font-size: 12px;
      color: #343a40;
      margin-bottom: 10px;
      text-align: justify;
    }
    .report-list { padding-left: 20px; margin-bottom: 10px; }
    .report-list li { font-size: 12px; color: #343a40; margin-bottom: 4px; }

    /* ─── TABLES ─── */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 11px;
    }
    .data-table th {
      background: #1d3557;
      color: white;
      padding: 8px 10px;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    .data-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #e9ecef;
      color: #343a40;
    }
    .data-table tr:nth-child(even) td { background: #f8f9fa; }
    .data-table tr:hover td { background: #e8f0fe; }

    /* ─── DISCLAIMER BOX ─── */
    .disclaimer-box {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      border-left: 4px solid #dc3545;
      border-radius: 4px;
      padding: 12px 16px;
      margin-top: 28px;
      font-size: 10px;
      color: #721c24;
      line-height: 1.6;
    }

    /* ─── FOOTER ─── */
    .gov-footer {
      background: #1a1a2e;
      color: rgba(255,255,255,0.6);
      padding: 14px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      letter-spacing: 0.5px;
      margin-top: 40px;
    }
    .footer-left { line-height: 1.8; }
    .footer-center { text-align: center; color: rgba(255,255,255,0.4); }
    .footer-right { text-align: right; line-height: 1.8; }

    /* ─── DIVIDER ─── */
    .section-divider { border: none; border-top: 1px solid #dee2e6; margin: 20px 0; }

    @media print {
      body { font-size: 11px; }
      .kpi-grid { grid-template-columns: repeat(4, 1fr); }
      .section-heading { page-break-after: avoid; }
      .data-table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- GOV HEADER -->
  <div class="gov-header">
    <div class="gov-emblem">🛣️</div>
    <div class="gov-header-text">
      <div class="gov-title">Government of Maharashtra — Public Works Department</div>
      <div class="gov-subtitle">Road Health Intelligence System &nbsp;|&nbsp; Maharashtra Road Network Monitoring</div>
    </div>
    <div class="gov-header-right">
      CONFIDENTIAL — OFFICIAL USE ONLY<br/>
      Maharashtra PWD &nbsp;|&nbsp; Road-CIBIL System<br/>
      Techathon 2026
    </div>
  </div>

  <!-- REPORT TITLE BAND -->
  <div class="title-band">
    <div>
      <div class="report-title">${reportTitle}</div>
      <div style="font-size:11px;color:#6c757d;margin-top:3px">
        Maharashtra State Road Network — Comprehensive Field Data Analysis
      </div>
    </div>
    <div class="report-meta">
      Generated: ${formattedDate}<br/>
      <span class="report-id">RPT-${Date.now().toString(36).toUpperCase()}</span><br/>
      Model: ${summary.modelVersion}
    </div>
  </div>

  <!-- FILTERS APPLIED -->
  <div class="filters-section">
    <strong>Filters Applied:</strong> &nbsp;
    ${buildFiltersApplied(summary)}
    &nbsp;|&nbsp; <strong>Dataset:</strong> ${summary.totalFilteredRoads.toLocaleString()} of ${summary.totalNetworkRoads.toLocaleString()} roads (${summary.coveragePercent}% of network)
  </div>

  <!-- MAIN CONTENT -->
  <div class="main-content">

    <!-- KPI CARDS -->
    ${buildKpiCards(summary)}

    <hr class="section-divider" />

    <!-- AI NARRATIVE -->
    <div id="narrative-content">
      ${markdownToHtmlSections(narrative)}
    </div>

    <hr class="section-divider" />

    <!-- CONDITION DISTRIBUTION TABLE -->
    <h2 class="section-heading">Condition Distribution — Statistical Breakdown</h2>
    ${buildConditionTable(summary)}

    <!-- TOP 10 WORST ROADS -->
    <h2 class="section-heading">Top 10 Priority Roads Requiring Immediate Attention</h2>
    <p class="body-text">The following road segments have been identified as highest priority based on lowest Pavement Condition Index (PCI) scores within the filtered dataset:</p>
    ${buildTop10Table(summary)}

    <!-- DISTRICT BREAKDOWN (if multi-district) -->
    ${buildDistrictTable(summary)}

    <hr class="section-divider" />

    <!-- INSPECTION SUMMARY -->
    <h2 class="section-heading">Inspection & Compliance Summary</h2>
    <table class="data-table">
      <tr><th>Metric</th><th>Count</th><th>Notes</th></tr>
      <tr><td>Roads with Inspection History</td><td style="text-align:right">${summary.inspection.totalWithHistory.toLocaleString()}</td><td>Historical data available for decay analysis</td></tr>
      <tr><td>Roads Never Inspected</td><td style="text-align:right;color:#dc2626">${summary.inspection.totalWithoutHistory.toLocaleString()}</td><td>Requires immediate baseline inspection</td></tr>
      <tr><td>Overdue Inspections</td><td style="text-align:right;color:#ea580c">${summary.inspection.overdueCount.toLocaleString()}</td><td>Last inspection > 365 days or never inspected</td></tr>
      <tr><td>Due Soon</td><td style="text-align:right;color:#ca8a04">${summary.inspection.dueSoonCount.toLocaleString()}</td><td>Inspection required within 6 months</td></tr>
      <tr><td>Recently Inspected</td><td style="text-align:right;color:#16a34a">${summary.inspection.recentlyInspectedCount.toLocaleString()}</td><td>Inspected within last 180 days</td></tr>
      <tr><td>Avg. Days Since Last Inspection</td><td style="text-align:right">${summary.inspection.avgDaysSinceInspection}</td><td>For roads with inspection history</td></tr>
    </table>

  </div>

  <!-- FOOTER -->
  <div class="gov-footer">
    <div class="footer-left">
      Road Health Intelligence System — Maharashtra PWD<br/>
      Model: ${summary.modelVersion}
    </div>
    <div class="footer-center">
      CONFIDENTIAL — NOT FOR PUBLIC DISTRIBUTION<br/>
      Page 1 of 1
    </div>
    <div class="footer-right">
      Data Source: ${summary.dataTimestamp}<br/>
      Generated: ${formattedDate}
    </div>
  </div>

</body>
</html>`;

  return NextResponse.json({ html, reportTitle, generatedAt: summary.generatedAt });
}
