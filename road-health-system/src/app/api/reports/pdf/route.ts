/**
 * POST /api/reports/pdf
 * ─────────────────────
 * Receives { narrative, summary, reportTitle } and returns a
 * professionally styled HTML string that the client converts to PDF
 * using jsPDF + html2canvas.
 *
 * FEATURES:
 *   - Proper Government of India / Maharashtra PWD header with Ashoka Chakra SVG
 *   - Tricolor stripe (saffron / white / green)
 *   - A4-structured page containers with proper margins — no overflow
 *   - Inline SVG charts: condition donut, priority bars, district bars, budget pie
 *   - Page-break aware CSS so each section starts cleanly
 */

import { NextRequest, NextResponse } from "next/server";
import { ReportSummary } from "@/lib/reportAggregator";

interface PdfRequest {
  narrative: string;
  summary: ReportSummary;
  reportTitle: string;
}

// ─── Markdown → HTML converter ──────────────────────────────
function mdToHtml(md: string): string {
  return md
    .replace(/^## (.+)$/gm, '</div><div class="page-section"><h2 class="sh">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="ssh">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.slice(1,-1).split('|');
      return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
    })
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[^\n]*<\/li>\n?)+/gm, '<ul class="rl">$&</ul>')
    .replace(/\n\n+/g, '</p><p class="bt">')
    .replace(/^(?!<[hupdt\/])(.+)$/gm, '<p class="bt">$1</p>')
    .replace(/<p class="bt"><\/p>/g, '')
    .replace(/<p class="bt">(<\/div>)/g, '$1')
    .trim();
}

// ─── Ashoka Chakra SVG ───────────────────────────────────────
function ashokaChakraSvg(size = 60): string {
  const r = size / 2;
  const cx = r, cy = r;
  const spokeR = r * 0.82;
  const hubR = r * 0.18;
  const rimR = r * 0.94;
  const spokes: string[] = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i * 15 - 90) * (Math.PI / 180);
    const x1 = cx + hubR * Math.cos(angle);
    const y1 = cy + hubR * Math.sin(angle);
    const x2 = cx + spokeR * Math.cos(angle);
    const y2 = cy + spokeR * Math.sin(angle);
    spokes.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#003580" stroke-width="1.5"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${rimR}" fill="none" stroke="#003580" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${hubR}" fill="#003580"/>
    ${spokes.join('')}
  </svg>`;
}

// ─── Inline SVG Charts ───────────────────────────────────────

/** Donut chart for condition distribution */
function conditionDonutSvg(summary: ReportSummary): string {
  const { conditionBreakdown, totalFilteredRoads } = summary;
  const data = [
    { label: "Critical", count: conditionBreakdown.Critical, color: "#dc2626" },
    { label: "Poor",     count: conditionBreakdown.Poor,     color: "#f97316" },
    { label: "Fair",     count: conditionBreakdown.Fair,     color: "#eab308" },
    { label: "Good",     count: conditionBreakdown.Good,     color: "#22c55e" },
  ];
  const total = totalFilteredRoads || 1;
  const cx = 100, cy = 100, outerR = 80, innerR = 48;
  let slices = "";
  let startAngle = -Math.PI / 2;
  for (const d of data) {
    if (d.count === 0) continue;
    const sweep = (d.count / total) * 2 * Math.PI;
    const endAngle = startAngle + sweep;
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const lg = sweep > Math.PI ? 1 : 0;
    slices += `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${outerR},${outerR} 0 ${lg},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${ix1.toFixed(1)},${iy1.toFixed(1)} A${innerR},${innerR} 0 ${lg},0 ${ix2.toFixed(1)},${iy2.toFixed(1)} Z" fill="${d.color}" stroke="white" stroke-width="1.5"/>`;
    startAngle = endAngle;
  }
  const legendItems = data.map((d, i) => {
    const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : "0";
    return `<g transform="translate(210,${28 + i * 28})">
      <rect x="0" y="-12" width="14" height="14" rx="3" fill="${d.color}"/>
      <text x="20" y="0" font-size="12" fill="#374151" font-family="Arial">${d.label}</text>
      <text x="20" y="14" font-size="11" fill="#6b7280" font-family="Arial">${d.count.toLocaleString()} (${pct}%)</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="200" viewBox="0 0 380 200">
    <text x="100" y="104" text-anchor="middle" font-size="13" font-weight="bold" fill="#1f2937" font-family="Arial">${total.toLocaleString()}</text>
    <text x="100" y="118" text-anchor="middle" font-size="9" fill="#6b7280" font-family="Arial">TOTAL</text>
    ${slices}
    ${legendItems}
  </svg>`;
}

/** Horizontal bar chart for priority breakdown */
function priorityBarSvg(summary: ReportSummary): string {
  const { priorityBreakdown, totalFilteredRoads } = summary;
  const total = totalFilteredRoads || 1;
  const bars = [
    { label: "Critical", count: priorityBreakdown.Critical, color: "#dc2626" },
    { label: "High",     count: priorityBreakdown.High,     color: "#f97316" },
    { label: "Medium",   count: priorityBreakdown.Medium,   color: "#eab308" },
    { label: "Low",      count: priorityBreakdown.Low,      color: "#22c55e" },
  ];
  const maxW = 260;
  const rows = bars.map((b, i) => {
    const w = Math.max(2, (b.count / total) * maxW);
    const pct = ((b.count / total) * 100).toFixed(1);
    return `<g transform="translate(0,${i * 42})">
      <text x="0" y="13" font-size="11" fill="#374151" font-family="Arial" font-weight="600">${b.label}</text>
      <rect x="0" y="18" width="${w.toFixed(1)}" height="16" rx="4" fill="${b.color}"/>
      <text x="${(w + 6).toFixed(1)}" y="30" font-size="11" fill="#6b7280" font-family="Arial">${b.count.toLocaleString()} (${pct}%)</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="185" viewBox="0 0 380 185">
    <g transform="translate(10,10)">${rows}</g>
  </svg>`;
}

/** Vertical bar chart for top districts by avg PCI */
function districtBarSvg(summary: ReportSummary): string {
  if (!summary.districtBreakdown || summary.districtBreakdown.length <= 1) return "";
  const top = summary.districtBreakdown.slice(0, 8);
  const maxPci = 100;
  const barW = 44, gap = 8, h = 140, padL = 36, padB = 40;
  const totalW = top.length * (barW + gap) + padL + 20;
  const bars = top.map((d, i) => {
    const barH = Math.max(4, (d.avgPci / maxPci) * h);
    const x = padL + i * (barW + gap);
    const y = h - barH;
    const color = d.avgPci < 40 ? "#dc2626" : d.avgPci < 60 ? "#f97316" : d.avgPci < 75 ? "#eab308" : "#22c55e";
    const shortName = d.district.length > 7 ? d.district.slice(0, 6) + "…" : d.district;
    return `<g>
      <rect x="${x}" y="${y + padB}" width="${barW}" height="${barH}" rx="4" fill="${color}"/>
      <text x="${x + barW/2}" y="${y + padB - 4}" text-anchor="middle" font-size="10" fill="#374151" font-family="Arial" font-weight="600">${d.avgPci}</text>
      <text x="${x + barW/2}" y="${h + padB + 14}" text-anchor="middle" font-size="9" fill="#6b7280" font-family="Arial">${shortName}</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${h + padB + 30}" viewBox="0 0 ${totalW} ${h + padB + 30}">
    <text x="${padL - 4}" y="${padB + 4}" text-anchor="end" font-size="9" fill="#9ca3af" font-family="Arial">100</text>
    <text x="${padL - 4}" y="${padB + h/2}" text-anchor="end" font-size="9" fill="#9ca3af" font-family="Arial">50</text>
    <line x1="${padL}" y1="${padB}" x2="${padL}" y2="${h + padB}" stroke="#e5e7eb" stroke-width="1"/>
    <line x1="${padL - 4}" y1="${padB + h/2}" x2="${totalW - 10}" y2="${padB + h/2}" stroke="#f3f4f6" stroke-width="1" stroke-dasharray="4,4"/>
    ${bars}
  </svg>`;
}

/** Pie chart for estimated budget by condition tier */
function budgetPieSvg(summary: ReportSummary): string {
  const { conditionBreakdown, estimatedTotalCostCrores, totalFilteredRoads } = summary;
  const total = totalFilteredRoads || 1;
  // Estimate cost split roughly by relative share × average cost per tier
  const tierCosts = [
    { label: "Critical", count: conditionBreakdown.Critical, costFactor: 200, color: "#dc2626" },
    { label: "Poor",     count: conditionBreakdown.Poor,     costFactor: 100, color: "#f97316" },
    { label: "Fair",     count: conditionBreakdown.Fair,     costFactor: 45,  color: "#eab308" },
    { label: "Good",     count: conditionBreakdown.Good,     costFactor: 15,  color: "#22c55e" },
  ];
  const rawTotals = tierCosts.map(t => t.count * t.costFactor);
  const rawSum = rawTotals.reduce((a, b) => a + b, 0) || 1;
  const pieces = tierCosts.map((t, i) => ({
    ...t,
    share: rawTotals[i] / rawSum,
    costCr: (rawTotals[i] / rawSum) * estimatedTotalCostCrores,
  }));

  const cx = 90, cy = 90, r = 78;
  let slices = "";
  let startAngle = -Math.PI / 2;
  for (const p of pieces) {
    if (p.share === 0) continue;
    const sweep = p.share * 2 * Math.PI;
    const endAngle = startAngle + sweep;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const lg = sweep > Math.PI ? 1 : 0;
    slices += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${lg},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${p.color}" stroke="white" stroke-width="1.5"/>`;
    startAngle = endAngle;
  }
  const legendItems = pieces.map((p, i) =>
    `<g transform="translate(195,${20 + i * 30})">
      <rect x="0" y="-12" width="14" height="14" rx="3" fill="${p.color}"/>
      <text x="20" y="0" font-size="11" fill="#374151" font-family="Arial">${p.label}</text>
      <text x="20" y="14" font-size="10" fill="#6b7280" font-family="Arial">₹ ${p.costCr.toFixed(1)} Cr (${(p.share*100).toFixed(0)}%)</text>
    </g>`
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="195" viewBox="0 0 380 195">
    ${slices}
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="#1f2937" font-family="Arial">₹${estimatedTotalCostCrores.toFixed(0)}Cr</text>
    ${legendItems}
  </svg>`;
}

// ─── KPI Cards ───────────────────────────────────────────────
function buildKpiCards(summary: ReportSummary): string {
  const cards = [
    { label: "Roads Analysed",     value: summary.totalFilteredRoads.toLocaleString(),         color: "#1d4ed8", icon: "🛣️" },
    { label: "Network Coverage",   value: `${summary.coveragePercent}%`,                       color: "#7c3aed", icon: "📊" },
    { label: "Avg CIBIL Score",    value: `${summary.avgCibilScore} / 100`,                    color: "#0891b2", icon: "📈" },
    { label: "Avg PCI Score",      value: `${summary.avgPciScore} / 100`,                      color: "#059669", icon: "📉" },
    { label: "Total Length",       value: `${summary.totalLengthKm.toLocaleString()} km`,      color: "#0891b2", icon: "📏" },
    { label: "Critical Roads",     value: summary.conditionBreakdown.Critical.toLocaleString(), color: "#dc2626", icon: "🚨" },
    { label: "Overdue Inspections",value: summary.inspection.overdueCount.toLocaleString(),    color: "#ea580c", icon: "⏰" },
    { label: "Est. Repair Cost",   value: `₹ ${summary.estimatedTotalCostCrores.toLocaleString()} Cr`, color: "#d97706", icon: "💰" },
  ];
  return `<div class="kpi-grid">${cards.map(c => `
    <div class="kpi-card">
      <div class="kpi-icon">${c.icon}</div>
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value" style="color:${c.color}">${c.value}</div>
    </div>`).join("")}</div>`;
}

// ─── Tables ──────────────────────────────────────────────────
function buildTop10Table(summary: ReportSummary): string {
  const roads = summary.top10WorstByPci;
  if (!roads || roads.length === 0) return `<p class="bt">No critical roads in filtered dataset.</p>`;
  return `<table class="dt"><thead><tr>
    <th>#</th><th>Road ID</th><th>Name</th><th>District</th><th>PCI</th><th>CIBIL</th><th>Surface</th><th>Len (km)</th>
  </tr></thead><tbody>${roads.map((r, i) => `<tr>
    <td style="text-align:center;font-weight:700">${i + 1}</td>
    <td><code style="font-size:9px;color:#1d3557">${r.road_id}</code></td>
    <td style="font-size:10px">${r.name || "—"}</td>
    <td>${r.district}</td>
    <td style="text-align:right;color:${r.pci_score < 40 ? "#dc2626" : "#f97316"};font-weight:700">${r.pci_score}</td>
    <td style="text-align:right">${r.cibil_score}</td>
    <td style="text-align:center;font-size:9px">${r.surface_type}</td>
    <td style="text-align:right">${r.length_km}</td>
  </tr>`).join("")}</tbody></table>`;
}

function buildDistrictTable(summary: ReportSummary): string {
  if (!summary.districtBreakdown || summary.districtBreakdown.length <= 1) return "";
  return `<div class="page-section">
  <h2 class="sh">District-Level Breakdown</h2>
  <table class="dt"><thead><tr>
    <th>District</th><th>Roads</th><th>Avg PCI</th><th>Avg CIBIL</th>
    <th>Critical</th><th>Length (km)</th><th>Est. Cost (₹ Lakhs)</th>
  </tr></thead><tbody>
  ${summary.districtBreakdown.slice(0, 15).map(d => `<tr>
    <td><strong>${d.district}</strong></td>
    <td style="text-align:right">${d.totalRoads.toLocaleString()}</td>
    <td style="text-align:right;color:${d.avgPci < 40 ? "#dc2626" : d.avgPci < 60 ? "#f97316" : "#16a34a"};font-weight:700">${d.avgPci}</td>
    <td style="text-align:right">${d.avgCibil}</td>
    <td style="text-align:right;color:${d.criticalCount > 0 ? "#dc2626" : "#16a34a"};font-weight:700">${d.criticalCount}</td>
    <td style="text-align:right">${d.totalLengthKm}</td>
    <td style="text-align:right">₹ ${d.estimatedCostLakhs.toLocaleString()}</td>
  </tr>`).join("")}
  </tbody></table>
  </div>`;
}

function buildFiltersApplied(summary: ReportSummary): string {
  const f = summary.filtersApplied;
  const active: string[] = [];
  if (f.district)           active.push(`District: <strong>${f.district}</strong>`);
  if (f.highway)            active.push(`Highway: <strong>${f.highway}</strong>`);
  if (f.conditionBand)      active.push(`Condition: <strong>${f.conditionBand}</strong>`);
  if (f.priorityLevel)      active.push(`Priority: <strong>${f.priorityLevel}</strong>`);
  if (f.inspectionStatus)   active.push(`Inspection: <strong>${f.inspectionStatus}</strong>`);
  if (f.cibilMin !== undefined) active.push(`CIBIL ≥ <strong>${f.cibilMin}</strong>`);
  if (f.cibilMax !== undefined) active.push(`CIBIL ≤ <strong>${f.cibilMax}</strong>`);
  if (f.constructionYearMin) active.push(`Year ≥ <strong>${f.constructionYearMin}</strong>`);
  if (f.constructionYearMax) active.push(`Year ≤ <strong>${f.constructionYearMax}</strong>`);
  if (f.inspectionDateFrom)  active.push(`Inspection From: <strong>${f.inspectionDateFrom}</strong>`);
  if (f.inspectionDateTo)    active.push(`Inspection To: <strong>${f.inspectionDateTo}</strong>`);
  if (active.length === 0)   return `<span class="fbadge">Full Network — No Filters Applied</span>`;
  return active.map(a => `<span class="fbadge">${a}</span>`).join(" ");
}

// ─── POST handler ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: PdfRequest;
  try { body = await req.json() as PdfRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { narrative, summary, reportTitle } = body;
  if (!narrative || !summary) {
    return NextResponse.json({ error: "narrative and summary are required" }, { status: 400 });
  }

  const formattedDate = new Date(summary.generatedAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short",
  });
  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}`;

  const districtChartSvg  = districtBarSvg(summary);
  const hasDistrictChart   = districtChartSvg !== "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${reportTitle}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: Arial, 'Helvetica Neue', sans-serif;
      font-size: 12px;
      color: #1a1a2e;
      background: #ffffff;
      line-height: 1.6;
      width: 210mm;
    }

    /* ── TRICOLOR STRIPE ── */
    .tricolor {
      height: 8px;
      background: linear-gradient(to right, #FF9933 33.33%, #ffffff 33.33% 66.66%, #138808 66.66%);
      border-bottom: 1px solid #ccc;
    }

    /* ── GOV HEADER ── */
    .gov-header {
      background: #ffffff;
      border-bottom: 3px solid #003580;
      padding: 16px 40px 14px;
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .chakra-wrap {
      flex-shrink: 0;
      width: 64px; height: 64px;
      display: flex; align-items: center; justify-content: center;
    }
    .gov-center { flex: 1; text-align: center; }
    .gov-main-title {
      font-size: 16px; font-weight: 700; color: #1a1a2e;
      letter-spacing: 1px; text-transform: uppercase;
    }
    .gov-dept-line {
      font-size: 13px; font-weight: 600; color: #003580; margin-top: 3px;
    }
    .gov-sub-line {
      font-size: 10px; color: #555; margin-top: 2px; letter-spacing: 0.5px;
    }
    .gov-right {
      flex-shrink: 0; text-align: right;
      font-size: 9px; color: #555; line-height: 1.9;
      border-left: 1px solid #dee2e6; padding-left: 16px;
    }
    .gov-right .conf {
      font-weight: 700; color: #dc2626; font-size: 10px;
      border: 1px solid #dc2626; padding: 2px 8px; display: inline-block;
      letter-spacing: 0.5px; margin-bottom: 4px;
    }

    /* ── BLUE TITLE BAND ── */
    .title-band {
      background: #003580;
      color: white;
      padding: 14px 40px;
    }
    .report-title-text {
      font-size: 15px; font-weight: 700; letter-spacing: 0.3px;
    }
    .report-meta-row {
      display: flex; justify-content: space-between; align-items: flex-end;
      margin-top: 6px;
    }
    .report-subtitle { font-size: 10px; color: rgba(255,255,255,0.75); }
    .report-id-badge {
      font-family: monospace; font-size: 9px;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      color: white; padding: 2px 8px; border-radius: 3px;
    }

    /* ── FILTERS BAR ── */
    .filters-bar {
      background: #fff8e1;
      border-bottom: 2px solid #f59e0b;
      padding: 8px 40px;
      font-size: 10px; color: #78350f;
    }
    .fbadge {
      display: inline-block;
      background: #ffffff;
      border: 1px solid #f59e0b;
      border-radius: 10px;
      padding: 1px 9px;
      margin: 2px 3px;
      font-size: 10px; color: #78350f;
    }

    /* ── PAGE CONTENT WRAPPER ── */
    .page-wrap {
      padding: 24px 40px;
    }

    /* ── KPI GRID ── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: #f8f9fa;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .kpi-icon { font-size: 16px; margin-bottom: 4px; }
    .kpi-label {
      font-size: 8px; text-transform: uppercase;
      letter-spacing: 0.8px; color: #64748b; font-weight: 700;
    }
    .kpi-value { font-size: 17px; font-weight: 800; margin-top: 2px; }

    /* ── SECTION HEADINGS ── */
    .sh {
      font-size: 11px; font-weight: 700;
      color: #ffffff;
      background: #003580;
      padding: 5px 12px;
      margin: 20px 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      border-left: 4px solid #FF9933;
      page-break-after: avoid;
    }
    .ssh {
      font-size: 11px; font-weight: 700; color: #1d3557;
      margin: 12px 0 5px;
      padding-left: 8px;
      border-left: 3px solid #003580;
      page-break-after: avoid;
    }
    .bt {
      font-size: 11px; color: #374151;
      margin-bottom: 8px;
      text-align: justify;
      line-height: 1.65;
    }
    .rl { padding-left: 18px; margin-bottom: 8px; }
    .rl li { font-size: 11px; color: #374151; margin-bottom: 3px; }

    /* ── CHARTS ROW ── */
    .charts-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 16px 0 20px;
      page-break-inside: avoid;
    }
    .chart-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      background: #fafafa;
    }
    .chart-title {
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.7px; color: #64748b; margin-bottom: 8px;
    }

    /* ── DATA TABLES ── */
    .dt {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
      font-size: 10px;
      page-break-inside: avoid;
    }
    .dt th {
      background: #1d3557;
      color: white;
      padding: 6px 8px;
      text-align: left;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .dt td {
      padding: 5px 8px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 10px;
    }
    .dt tr:nth-child(even) td { background: #f8f9fa; }

    /* ── PAGE SECTION (logical block) ── */
    .page-section { page-break-inside: avoid; }

    /* ── DIVIDER ── */
    .div { border:none; border-top: 1px solid #e2e8f0; margin: 18px 0; }

    /* ── DISCLAIMER ── */
    .disclaimer {
      background: #fff5f5;
      border: 1px solid #fecaca;
      border-left: 4px solid #dc2626;
      border-radius: 4px;
      padding: 10px 14px;
      margin-top: 20px;
      font-size: 9px; color: #7f1d1d;
      line-height: 1.6;
    }

    /* ── FOOTER ── */
    .gov-footer {
      background: #1a1a2e;
      color: rgba(255,255,255,0.65);
      padding: 10px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      margin-top: 30px;
      letter-spacing: 0.4px;
    }
    .footer-mid { text-align:center; color: rgba(255,255,255,0.4); font-size: 8px; }

    @media print {
      .sh { page-break-after: avoid; }
      .dt  { page-break-inside: avoid; }
      .charts-row { page-break-inside: avoid; }
      .page-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- TRICOLOR -->
  <div class="tricolor"></div>

  <!-- GOV HEADER -->
  <div class="gov-header">
    <div class="chakra-wrap">${ashokaChakraSvg(64)}</div>
    <div class="gov-center">
      <div class="gov-main-title">Government of Maharashtra</div>
      <div class="gov-dept-line">Public Works Department (PWD)</div>
      <div class="gov-sub-line">Road Health Intelligence &amp; Monitoring Directorate &nbsp;|&nbsp; Mantralaya, Mumbai — 400 032</div>
    </div>
    <div class="gov-right">
      <div class="conf">CONFIDENTIAL</div><br/>
      Maharashtra PWD<br/>
      Road-CIBIL System v1.0<br/>
      Techathon 2026
    </div>
  </div>

  <!-- TRICOLOR (bottom of header) -->
  <div class="tricolor"></div>

  <!-- BLUE TITLE BAND -->
  <div class="title-band">
    <div class="report-title-text">${reportTitle}</div>
    <div class="report-meta-row">
      <div class="report-subtitle">Maharashtra State Road Network — Field Survey &amp; CIBIL-Based Infrastructure Assessment</div>
      <div>
        <span class="report-id-badge">${reportId}</span>
      </div>
    </div>
  </div>

  <!-- FILTERS BAR -->
  <div class="filters-bar">
    <strong>Analysis Scope:</strong> &nbsp;
    ${buildFiltersApplied(summary)}
    &nbsp; | &nbsp;
    <strong>${summary.totalFilteredRoads.toLocaleString()}</strong> of <strong>${summary.totalNetworkRoads.toLocaleString()}</strong> roads &nbsp;•&nbsp;
    ${summary.coveragePercent}% network coverage &nbsp;•&nbsp;
    Generated: ${formattedDate}
  </div>

  <!-- PAGE CONTENT -->
  <div class="page-wrap">

    <!-- KPI CARDS -->
    ${buildKpiCards(summary)}

    <hr class="div"/>

    <!-- CHARTS ROW 1: Condition + Priority -->
    <div class="charts-row">
      <div class="chart-box">
        <div class="chart-title">📊 Condition Distribution</div>
        ${conditionDonutSvg(summary)}
      </div>
      <div class="chart-box">
        <div class="chart-title">🎯 Priority Breakdown</div>
        ${priorityBarSvg(summary)}
      </div>
    </div>

    <!-- CHARTS ROW 2: District + Budget (only if multi-district) -->
    ${hasDistrictChart ? `<div class="charts-row">
      <div class="chart-box">
        <div class="chart-title">🗺️ Avg PCI by District (Worst 8)</div>
        ${districtChartSvg}
      </div>
      <div class="chart-box">
        <div class="chart-title">💰 Budget Allocation by Condition Tier</div>
        ${budgetPieSvg(summary)}
      </div>
    </div>` : `<div class="charts-row" style="grid-template-columns:1fr">
      <div class="chart-box">
        <div class="chart-title">💰 Budget Allocation by Condition Tier</div>
        ${budgetPieSvg(summary)}
      </div>
    </div>`}

    <hr class="div"/>

    <!-- AI / TEMPLATE NARRATIVE -->
    <div class="page-section">
      ${mdToHtml(narrative)}
    </div>

    <hr class="div"/>

    <!-- CONDITION DISTRIBUTION TABLE -->
    <div class="page-section">
      <h2 class="sh">Condition Distribution — Statistical Breakdown</h2>
      <table class="dt"><thead><tr>
        <th>Condition Band</th><th style="text-align:right">Segments</th>
        <th style="text-align:right">Percentage</th><th>Status</th>
      </tr></thead><tbody>
        ${[
          ["🔴 Critical (PCI < 40)", summary.conditionBreakdown.Critical, summary.conditionPercents.Critical, "#dc2626"],
          ["🟠 Poor (PCI 40–59)",    summary.conditionBreakdown.Poor,     summary.conditionPercents.Poor,     "#f97316"],
          ["🟡 Fair (PCI 60–74)",    summary.conditionBreakdown.Fair,     summary.conditionPercents.Fair,     "#eab308"],
          ["🟢 Good (PCI ≥ 75)",     summary.conditionBreakdown.Good,     summary.conditionPercents.Good,     "#16a34a"],
        ].map(([label, count, pct, color]) => `
          <tr>
            <td><strong>${label}</strong></td>
            <td style="text-align:right">${(count as number).toLocaleString()}</td>
            <td style="text-align:right">${pct}%</td>
            <td style="color:${color};font-weight:700">${(count as number) > 0 ? "⚠ Action Required" : "✓ Acceptable"}</td>
          </tr>`).join("")}
      </tbody></table>
    </div>

    <!-- TOP 10 WORST ROADS -->
    <div class="page-section">
      <h2 class="sh">Top 10 Priority Roads — Immediate Intervention Required</h2>
      <p class="bt">The following road segments have been identified as highest priority based on lowest Pavement Condition Index (PCI) within the filtered dataset:</p>
      ${buildTop10Table(summary)}
    </div>

    <!-- DISTRICT BREAKDOWN -->
    ${buildDistrictTable(summary)}

    <!-- INSPECTION SUMMARY -->
    <div class="page-section">
      <h2 class="sh">Inspection &amp; Compliance Summary</h2>
      <table class="dt"><thead><tr>
        <th>Metric</th><th style="text-align:right">Count</th><th>Remarks</th>
      </tr></thead><tbody>
        <tr><td>Roads with Inspection History</td><td style="text-align:right">${summary.inspection.totalWithHistory.toLocaleString()}</td><td>Decay trend analysis available</td></tr>
        <tr><td>Roads Never Inspected</td><td style="text-align:right;color:#dc2626;font-weight:700">${summary.inspection.totalWithoutHistory.toLocaleString()}</td><td>Baseline inspection required immediately</td></tr>
        <tr><td>Overdue Inspections (&gt; 365 days)</td><td style="text-align:right;color:#ea580c;font-weight:700">${summary.inspection.overdueCount.toLocaleString()}</td><td>Priority scheduling required</td></tr>
        <tr><td>Due Soon (180–365 days)</td><td style="text-align:right;color:#ca8a04;font-weight:700">${summary.inspection.dueSoonCount.toLocaleString()}</td><td>Schedule within 6 months</td></tr>
        <tr><td>Recently Inspected (&lt; 180 days)</td><td style="text-align:right;color:#16a34a;font-weight:700">${summary.inspection.recentlyInspectedCount.toLocaleString()}</td><td>Compliant</td></tr>
        <tr><td>Avg. Days Since Last Inspection</td><td style="text-align:right">${summary.inspection.avgDaysSinceInspection}</td><td>For roads with recorded history</td></tr>
      </tbody></table>
    </div>

    <!-- RISK FLAGS -->
    <div class="page-section">
      <h2 class="sh">Environmental &amp; Risk Flags</h2>
      <table class="dt"><thead><tr>
        <th>Risk Category</th><th style="text-align:right">Segments</th><th>Implication</th>
      </tr></thead><tbody>
        <tr><td>🌊 Flood-Prone Segments</td><td style="text-align:right;color:#1d4ed8;font-weight:700">${summary.floodProneCount.toLocaleString()}</td><td>Vulnerable during monsoon; requires drainage audit</td></tr>
        <tr><td>⛰️ Landslide-Prone Segments</td><td style="text-align:right;color:#7c3aed;font-weight:700">${summary.landslideProneCount.toLocaleString()}</td><td>Geo-technical assessment recommended</td></tr>
        <tr><td>🏔️ Ghat Section Segments</td><td style="text-align:right">${summary.ghatSectionCount.toLocaleString()}</td><td>Requires specialised maintenance protocol</td></tr>
        <tr><td>🚛 High Traffic (&gt; 10,000 ADT)</td><td style="text-align:right;color:#ea580c;font-weight:700">${summary.highTrafficCount.toLocaleString()}</td><td>Accelerated wear; prioritise resurfacing</td></tr>
      </tbody></table>
    </div>

    <!-- DISCLAIMER -->
    <div class="disclaimer">
      <strong>DISCLAIMER:</strong> This report has been generated by the Road-CIBIL Intelligence System v1.0, developed for the Maharashtra Public Works Department.
      All numerical values are computed from automated analysis of field survey data including PCI measurements, IRI readings, and inspection records maintained in the Maharashtra Road Asset Registry.
      This document is intended for <strong>internal government use only</strong>. For official publication, all data must be verified against primary field survey records and certified by the Chief Engineer (Roads), Maharashtra PWD.
      Report ID: <strong>${reportId}</strong> &nbsp;|&nbsp; Generated: ${formattedDate} &nbsp;|&nbsp; Model: ${summary.modelVersion}
    </div>

  </div><!-- end page-wrap -->

  <!-- TRICOLOR -->
  <div class="tricolor"></div>

  <!-- GOV FOOTER -->
  <div class="gov-footer">
    <div>
      Road Health Intelligence System<br/>
      Maharashtra Public Works Department
    </div>
    <div class="footer-mid">
      CONFIDENTIAL — NOT FOR PUBLIC DISTRIBUTION<br/>
      ${reportId}
    </div>
    <div style="text-align:right">
      ${summary.dataTimestamp}<br/>
      ${formattedDate}
    </div>
  </div>

  <!-- BOTTOM TRICOLOR -->
  <div class="tricolor"></div>

</body>
</html>`;

  return NextResponse.json({ html, reportTitle, generatedAt: summary.generatedAt });
}

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

