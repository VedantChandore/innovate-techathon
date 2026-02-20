/**
 * POST /api/reports/pdf
 * ─────────────────────
 * Receives { narrative, summary, reportTitle } and returns a
 * professionally styled HTML string for client-side PDF conversion.
 *
 * DESIGN PRINCIPLES:
 *   - Government of Maharashtra / PWD official header with Ashoka Chakra
 *   - Strict A4 width (794px) with no overflow
 *   - Clean typography — no emoji in section headings
 *   - Executive KPI cards at top
 *   - AI narrative in the middle
 *   - Full analytics dashboard (6 charts + tables) at the end
 *   - print-safe CSS with page-break-inside:avoid on all blocks
 */

import { NextRequest, NextResponse } from "next/server";
import { ReportSummary } from "@/lib/reportAggregator";

interface PdfRequest {
  narrative: string;
  summary: ReportSummary;
  reportTitle: string;
}

// ─── Utility helpers ─────────────────────────────────────────
function fmt(v: number): string {
  return v.toLocaleString("en-IN");
}

// ─── Markdown → clean HTML ───────────────────────────────────
function mdToHtml(md: string): string {
  return md
    .replace(/^## (.+)$/gm, '</div><div class="ns"><h2 class="sh">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="ssh">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^\|(.+)\|$/gm, (m) => {
      const cells = m.slice(1, -1).split("|");
      return "<tr>" + cells.map((c) => `<td>${c.trim()}</td>`).join("") + "</tr>";
    })
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[^\n]*<\/li>\n?)+/gm, '<ul class="rl">$&</ul>')
    .replace(/\n\n+/g, '</p><p class="bt">')
    .replace(/^(?!<[hupdt\/])(.+)$/gm, '<p class="bt">$1</p>')
    .replace(/<p class="bt"><\/p>/g, "")
    .replace(/<p class="bt">(<\/div>)/g, "$1")
    .trim();
}

// ─── Ashoka Chakra SVG ───────────────────────────────────────
function ashokaChakra(size = 62): string {
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
    spokes.push(
      `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#003580" stroke-width="1.8"/>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${rimR}" fill="none" stroke="#003580" stroke-width="2.5"/>
    <circle cx="${cx}" cy="${cy}" r="${hubR}" fill="#003580"/>
    ${spokes.join("")}
  </svg>`;
}

// ─── SVG Charts ──────────────────────────────────────────────

/** Donut chart — condition distribution */
function donutSvg(summary: ReportSummary): string {
  const { conditionBreakdown, totalFilteredRoads } = summary;
  const total = totalFilteredRoads || 1;
  const data = [
    { label: "Critical", count: conditionBreakdown.Critical, color: "#c0392b" },
    { label: "Poor",     count: conditionBreakdown.Poor,     color: "#e67e22" },
    { label: "Fair",     count: conditionBreakdown.Fair,     color: "#f1c40f" },
    { label: "Good",     count: conditionBreakdown.Good,     color: "#27ae60" },
  ];
  const W = 440, H = 210;
  const cx = 105, cy = 104, outerR = 84, innerR = 50;
  let slices = "";
  let ang = -Math.PI / 2;
  for (const d of data) {
    if (d.count === 0) continue;
    const sweep = (d.count / total) * 2 * Math.PI;
    const end = ang + sweep;
    const x1 = cx + outerR * Math.cos(ang), y1 = cy + outerR * Math.sin(ang);
    const x2 = cx + outerR * Math.cos(end), y2 = cy + outerR * Math.sin(end);
    const ix1 = cx + innerR * Math.cos(end), iy1 = cy + innerR * Math.sin(end);
    const ix2 = cx + innerR * Math.cos(ang), iy2 = cy + innerR * Math.sin(ang);
    const lg = sweep > Math.PI ? 1 : 0;
    slices += `<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${outerR},${outerR} 0 ${lg},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${ix1.toFixed(2)},${iy1.toFixed(2)} A${innerR},${innerR} 0 ${lg},0 ${ix2.toFixed(2)},${iy2.toFixed(2)} Z" fill="${d.color}" stroke="#fff" stroke-width="2"/>`;
    ang = end;
  }
  const legend = data.map((d, i) => {
    const pct = ((d.count / total) * 100).toFixed(1);
    return `<g transform="translate(218,${22 + i * 44})">
      <rect x="0" y="0" width="13" height="13" rx="3" fill="${d.color}"/>
      <text x="20" y="10" font-size="12" font-family="Arial" fill="#1a1a2e" font-weight="600">${d.label}</text>
      <text x="20" y="25" font-size="10" font-family="Arial" fill="#666">${fmt(d.count)} (${pct}%)</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${slices}
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#1a1a2e" font-family="Arial">${fmt(total)}</text>
    <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="8" fill="#888" font-family="Arial" letter-spacing="1">ROADS</text>
    ${legend}
  </svg>`;
}

/** Horizontal bar chart — priority breakdown */
function priorityBarSvg(summary: ReportSummary): string {
  const total = summary.totalFilteredRoads || 1;
  const bars = [
    { label: "Critical", count: summary.priorityBreakdown.Critical, color: "#c0392b" },
    { label: "High",     count: summary.priorityBreakdown.High,     color: "#e67e22" },
    { label: "Medium",   count: summary.priorityBreakdown.Medium,   color: "#f39c12" },
    { label: "Low",      count: summary.priorityBreakdown.Low,      color: "#27ae60" },
  ];
  const W = 440, barH = 26, gap = 16, padT = 12, padL = 72;
  const maxBarW = W - padL - 110;
  const H = bars.length * (barH + gap) + padT * 2;
  const rows = bars.map((b, i) => {
    const w = Math.max(4, (b.count / total) * maxBarW);
    const pct = ((b.count / total) * 100).toFixed(1);
    const y = padT + i * (barH + gap);
    return `<g>
      <text x="${padL - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="12" font-family="Arial" fill="#1a1a2e" font-weight="600">${b.label}</text>
      <rect x="${padL}" y="${y}" width="${w.toFixed(1)}" height="${barH}" rx="4" fill="${b.color}" opacity="0.9"/>
      <text x="${(padL + w + 7).toFixed(1)}" y="${y + barH / 2 + 4}" font-size="10" font-family="Arial" fill="#555">${fmt(b.count)} (${pct}%)</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${rows}
  </svg>`;
}

/** Horizontal bar chart — inspection compliance */
function inspectionBarSvg(summary: ReportSummary): string {
  const { inspection } = summary;
  const total = summary.totalFilteredRoads || 1;
  const bars = [
    { label: "Recently Inspected", count: inspection.recentlyInspectedCount, color: "#27ae60" },
    { label: "Due Soon",            count: inspection.dueSoonCount,           color: "#f39c12" },
    { label: "Overdue",             count: inspection.overdueCount,           color: "#c0392b" },
    { label: "Never Inspected",     count: inspection.totalWithoutHistory,    color: "#7f8c8d" },
  ];
  const W = 440, barH = 26, gap = 16, padT = 12, padL = 128;
  const maxBarW = W - padL - 110;
  const H = bars.length * (barH + gap) + padT * 2;
  const rows = bars.map((b, i) => {
    const w = Math.max(4, (b.count / total) * maxBarW);
    const pct = ((b.count / total) * 100).toFixed(1);
    const y = padT + i * (barH + gap);
    return `<g>
      <text x="${padL - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="11" font-family="Arial" fill="#1a1a2e">${b.label}</text>
      <rect x="${padL}" y="${y}" width="${w.toFixed(1)}" height="${barH}" rx="4" fill="${b.color}" opacity="0.85"/>
      <text x="${(padL + w + 7).toFixed(1)}" y="${y + barH / 2 + 4}" font-size="10" font-family="Arial" fill="#555">${fmt(b.count)} (${pct}%)</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${rows}
  </svg>`;
}

/** Pie chart — estimated budget allocation */
function budgetPieSvg(summary: ReportSummary): string {
  const { conditionBreakdown, estimatedTotalCostCrores } = summary;
  const tierCosts = [
    { label: "Critical", count: conditionBreakdown.Critical, factor: 200, color: "#c0392b" },
    { label: "Poor",     count: conditionBreakdown.Poor,     factor: 100, color: "#e67e22" },
    { label: "Fair",     count: conditionBreakdown.Fair,     factor: 45,  color: "#f1c40f" },
    { label: "Good",     count: conditionBreakdown.Good,     factor: 15,  color: "#27ae60" },
  ];
  const rawVals = tierCosts.map((t) => t.count * t.factor);
  const rawSum = rawVals.reduce((a, b) => a + b, 0) || 1;
  const pieces = tierCosts.map((t, i) => ({ ...t, share: rawVals[i] / rawSum }));
  const W = 440, H = 210;
  const cx = 105, cy = 104, r = 88;
  let slices = "";
  let ang = -Math.PI / 2;
  for (const p of pieces) {
    if (p.share === 0) continue;
    const sweep = p.share * 2 * Math.PI;
    const end = ang + sweep;
    const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const lg = sweep > Math.PI ? 1 : 0;
    slices += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${lg},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${p.color}" stroke="#fff" stroke-width="2"/>`;
    ang = end;
  }
  const legend = pieces.map((p, i) => {
    const costCr = (p.share * estimatedTotalCostCrores).toFixed(1);
    return `<g transform="translate(218,${22 + i * 44})">
      <rect x="0" y="0" width="13" height="13" rx="3" fill="${p.color}"/>
      <text x="20" y="10" font-size="12" font-family="Arial" fill="#1a1a2e" font-weight="600">${p.label}</text>
      <text x="20" y="25" font-size="10" font-family="Arial" fill="#666">Rs. ${costCr} Cr (${(p.share * 100).toFixed(0)}%)</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${slices}
    ${legend}
  </svg>`;
}

/** Vertical bar chart — avg PCI by district */
function districtBarSvg(summary: ReportSummary): string {
  if (!summary.districtBreakdown || summary.districtBreakdown.length <= 1) return "";
  const top = summary.districtBreakdown.slice(0, 9);
  const barW = 58, gap = 10, padL = 36, padT = 14, chartH = 150, padB = 46;
  const W = top.length * (barW + gap) + padL + 20;
  const H = chartH + padT + padB;
  const gridLines = [0, 25, 50, 75, 100].map((v) => {
    const y = padT + chartH - (v / 100) * chartH;
    return `<line x1="${padL}" y1="${y}" x2="${W - 10}" y2="${y}" stroke="${v === 0 ? "#aaa" : "#e0e0e0"}" stroke-width="1" stroke-dasharray="${v === 0 ? "none" : "4,3"}"/>
      <text x="${padL - 5}" y="${y + 4}" text-anchor="end" font-size="9" font-family="Arial" fill="#999">${v}</text>`;
  }).join("");
  const bars = top.map((d, i) => {
    const bh = Math.max(4, (d.avgPci / 100) * chartH);
    const x = padL + i * (barW + gap);
    const y = padT + chartH - bh;
    const color = d.avgPci < 40 ? "#c0392b" : d.avgPci < 60 ? "#e67e22" : d.avgPci < 75 ? "#f1c40f" : "#27ae60";
    const label = d.district.length > 8 ? d.district.slice(0, 7) + "." : d.district;
    return `<g>
      <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${color}" opacity="0.88"/>
      <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" font-family="Arial" fill="#1a1a2e" font-weight="700">${d.avgPci}</text>
      <text x="${x + barW / 2}" y="${padT + chartH + 14}" text-anchor="middle" font-size="9" font-family="Arial" fill="#555">${label}</text>
      <text x="${x + barW / 2}" y="${padT + chartH + 26}" text-anchor="middle" font-size="8" font-family="Arial" fill="#888">${fmt(d.totalRoads)} rds</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${gridLines}
    ${bars}
  </svg>`;
}

/** Vertical bar chart — road count by surface type */
function surfaceBarSvg(summary: ReportSummary): string {
  if (!summary.surfaceBreakdown || Object.keys(summary.surfaceBreakdown).length === 0) return "";
  const items: { surface_type: string; count: number }[] = Object.entries(summary.surfaceBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([surface_type, count]) => ({ surface_type, count: count as number }));
  const maxCount = Math.max(...items.map((s) => s.count), 1);
  const colors = ["#2980b9", "#8e44ad", "#27ae60", "#e67e22", "#c0392b", "#16a085"];
  const barW = 72, gap = 14, padL = 30, padT = 14, chartH = 130, padB = 44;
  const W = items.length * (barW + gap) + padL + 20;
  const H = chartH + padT + padB;
  const bars = items.map((s, i) => {
    const bh = Math.max(4, (s.count / maxCount) * chartH);
    const x = padL + i * (barW + gap);
    const y = padT + chartH - bh;
    const label = s.surface_type.length > 9 ? s.surface_type.slice(0, 8) + "." : s.surface_type;
    return `<g>
      <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${colors[i % colors.length]}" opacity="0.85"/>
      <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="9" font-family="Arial" fill="#1a1a2e" font-weight="600">${fmt(s.count)}</text>
      <text x="${x + barW / 2}" y="${padT + chartH + 14}" text-anchor="middle" font-size="9" font-family="Arial" fill="#555">${label}</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#ccc" stroke-width="1"/>
    <line x1="${padL}" y1="${padT + chartH}" x2="${W - 10}" y2="${padT + chartH}" stroke="#ccc" stroke-width="1"/>
    ${bars}
  </svg>`;
}

// ─── KPI Cards ───────────────────────────────────────────────
function kpiCards(summary: ReportSummary): string {
  const cards = [
    { label: "Roads Analysed",      value: fmt(summary.totalFilteredRoads),      sub: `of ${fmt(summary.totalNetworkRoads)} total`,          accent: "#1d4ed8" },
    { label: "Network Coverage",    value: `${summary.coveragePercent}%`,         sub: `${fmt(summary.totalLengthKm)} km`,                   accent: "#7c3aed" },
    { label: "Avg CIBIL Score",     value: `${summary.avgCibilScore}`,            sub: "out of 100",                                         accent: "#0891b2" },
    { label: "Avg PCI Score",       value: `${summary.avgPciScore}`,              sub: "out of 100",                                         accent: "#059669" },
    { label: "Critical Roads",      value: fmt(summary.conditionBreakdown.Critical), sub: `${summary.conditionPercents.Critical}% of total`, accent: "#dc2626" },
    { label: "High + Critical",     value: fmt(summary.priorityBreakdown.Critical + summary.priorityBreakdown.High), sub: "by priority",    accent: "#ea580c" },
    { label: "Overdue Inspections", value: fmt(summary.inspection.overdueCount),  sub: "> 365 days since last",                              accent: "#b45309" },
    { label: "Est. Repair Cost",    value: `Rs.${fmt(summary.estimatedTotalCostCrores)}Cr`, sub: "total estimated budget",                  accent: "#0f766e" },
  ];
  return `<div class="kpi-grid">${cards
    .map(
      (c) => `
    <div class="kpi-card" style="border-top:3px solid ${c.accent}">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value" style="color:${c.accent}">${c.value}</div>
      <div class="kpi-sub">${c.sub}</div>
    </div>`
    )
    .join("")}</div>`;
}

// ─── Filter scope badges ─────────────────────────────────────
function filterBadges(summary: ReportSummary): string {
  const f = summary.filtersApplied;
  const active: string[] = [];
  if (f.district)            active.push(`District: ${f.district}`);
  if (f.highway)             active.push(`Highway: ${f.highway}`);
  if (f.conditionBand)       active.push(`Condition: ${f.conditionBand}`);
  if (f.priorityLevel)       active.push(`Priority: ${f.priorityLevel}`);
  if (f.inspectionStatus)    active.push(`Inspection: ${f.inspectionStatus}`);
  if (f.cibilMin !== undefined) active.push(`CIBIL &ge; ${f.cibilMin}`);
  if (f.cibilMax !== undefined) active.push(`CIBIL &le; ${f.cibilMax}`);
  if (f.constructionYearMin) active.push(`Year &ge; ${f.constructionYearMin}`);
  if (f.constructionYearMax) active.push(`Year &le; ${f.constructionYearMax}`);
  if (f.inspectionDateFrom)  active.push(`Insp. From: ${f.inspectionDateFrom}`);
  if (f.inspectionDateTo)    active.push(`Insp. To: ${f.inspectionDateTo}`);
  if (active.length === 0)   return `<span class="badge">Full Network &mdash; No Filters Applied</span>`;
  return active.map((a) => `<span class="badge">${a}</span>`).join(" ");
}

// ─── Top-10 roads table ──────────────────────────────────────
function top10Table(summary: ReportSummary): string {
  const roads = summary.top10WorstByPci;
  if (!roads || roads.length === 0)
    return `<p class="bt">No critical roads in the filtered dataset.</p>`;
  return `<div class="tbl-wrap"><table class="dt">
    <thead><tr>
      <th style="width:26px">#</th>
      <th>Road ID</th>
      <th>Name / Segment</th>
      <th>District</th>
      <th style="text-align:right">PCI</th>
      <th style="text-align:right">CIBIL</th>
      <th>Surface</th>
      <th style="text-align:right">Len (km)</th>
    </tr></thead>
    <tbody>${roads
      .map(
        (r, i) => `<tr>
      <td style="text-align:center;color:#888;font-weight:700">${i + 1}</td>
      <td><code class="code">${r.road_id}</code></td>
      <td style="font-size:8.5px">${r.name || "&mdash;"}</td>
      <td>${r.district}</td>
      <td style="text-align:right;font-weight:700;color:${r.pci_score < 40 ? "#c0392b" : "#e67e22"}">${r.pci_score}</td>
      <td style="text-align:right">${r.cibil_score}</td>
      <td style="font-size:8.5px;text-align:center">${r.surface_type}</td>
      <td style="text-align:right">${r.length_km}</td>
    </tr>`
      )
      .join("")}
    </tbody>
  </table></div>`;
}

// ─── District breakdown table ────────────────────────────────
function districtTable(summary: ReportSummary): string {
  if (!summary.districtBreakdown || summary.districtBreakdown.length <= 1) return "";
  return `<div class="tbl-wrap"><table class="dt">
    <thead><tr>
      <th>District</th>
      <th style="text-align:right">Roads</th>
      <th style="text-align:right">Avg PCI</th>
      <th style="text-align:right">Avg CIBIL</th>
      <th style="text-align:right">Critical</th>
      <th style="text-align:right">Length (km)</th>
      <th style="text-align:right">Est. Cost (Rs. Lk)</th>
    </tr></thead>
    <tbody>${summary.districtBreakdown
      .slice(0, 15)
      .map(
        (d) => `<tr>
      <td><strong>${d.district}</strong></td>
      <td style="text-align:right">${fmt(d.totalRoads)}</td>
      <td style="text-align:right;font-weight:700;color:${d.avgPci < 40 ? "#c0392b" : d.avgPci < 60 ? "#e67e22" : "#27ae60"}">${d.avgPci}</td>
      <td style="text-align:right">${d.avgCibil}</td>
      <td style="text-align:right;font-weight:700;color:${d.criticalCount > 0 ? "#c0392b" : "#27ae60"}">${fmt(d.criticalCount)}</td>
      <td style="text-align:right">${d.totalLengthKm}</td>
      <td style="text-align:right">Rs. ${fmt(d.estimatedCostLakhs)}</td>
    </tr>`
      )
      .join("")}
    </tbody>
  </table></div>`;
}

// ─── POST handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: PdfRequest;
  try {
    body = (await req.json()) as PdfRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { narrative, summary, reportTitle } = body;
  if (!narrative || !summary) {
    return NextResponse.json({ error: "narrative and summary are required" }, { status: 400 });
  }

  const formattedDate = new Date(summary.generatedAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short",
  });
  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}`;
  const hasDistricts = (summary.districtBreakdown?.length ?? 0) > 1;
  const distSvg = districtBarSvg(summary);
  const surfSvg = surfaceBarSvg(summary);
  let figNum = 4; // eslint-disable-line @typescript-eslint/no-unused-vars

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${reportTitle}</title>
<style>
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
html, body {
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
  font-size: 11px; color: #1a1a2e; background: #fff;
  width: 794px; line-height: 1.55;
}

/* TRICOLOR */
.tricolor {
  height: 6px;
  background: linear-gradient(to right, #FF9933 33.33%, #fff 33.33% 66.67%, #138808 66.67%);
}

/* GOV HEADER */
.gov-header {
  display: flex; align-items: center; gap: 14px;
  padding: 13px 34px 12px; background: #fff;
  border-bottom: 3px solid #003580;
}
.gov-center { flex: 1; text-align: center; }
.gov-title-main {
  font-size: 14.5px; font-weight: 700; color: #1a1a2e;
  letter-spacing: 1.2px; text-transform: uppercase;
}
.gov-title-dept { font-size: 12px; font-weight: 600; color: #003580; margin-top: 3px; }
.gov-title-sub { font-size: 9px; color: #555; margin-top: 2px; letter-spacing: 0.4px; }
.gov-right {
  flex-shrink: 0; text-align: right; font-size: 8px; color: #555;
  line-height: 1.8; border-left: 1px solid #d1d5db; padding-left: 14px;
}
.conf-stamp {
  display: inline-block; font-size: 8.5px; font-weight: 700;
  color: #c0392b; border: 1.5px solid #c0392b;
  padding: 2px 8px; letter-spacing: 0.8px; margin-bottom: 5px;
}

/* TITLE BAND */
.title-band { background: #003580; color: #fff; padding: 11px 34px; }
.title-band-top { font-size: 13.5px; font-weight: 700; letter-spacing: 0.3px; }
.title-band-meta {
  display: flex; justify-content: space-between; align-items: flex-end; margin-top: 5px;
}
.title-band-sub { font-size: 8.5px; color: rgba(255,255,255,0.7); }
.rpt-id {
  font-family: "Courier New", monospace; font-size: 8px;
  background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.28);
  padding: 1px 8px; border-radius: 2px; letter-spacing: 0.5px; color: #fff;
}

/* SCOPE BAR */
.scope-bar {
  background: #fffbeb; border-bottom: 2px solid #f59e0b;
  padding: 6px 34px; font-size: 9px; color: #78350f;
  display: flex; flex-wrap: wrap; align-items: center; gap: 3px;
}
.badge {
  display: inline-block; background: #fff;
  border: 1px solid #d97706; border-radius: 10px;
  padding: 1px 9px; font-size: 8.5px; color: #92400e; margin: 1px;
}

/* CONTENT */
.content { padding: 20px 34px; }

/* KPI GRID */
.kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 20px; }
.kpi-card {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 5px; padding: 8px 10px;
}
.kpi-label {
  font-size: 7px; text-transform: uppercase; letter-spacing: 0.8px;
  color: #64748b; font-weight: 700; margin-bottom: 3px;
}
.kpi-value { font-size: 15px; font-weight: 800; line-height: 1.2; }
.kpi-sub { font-size: 7.5px; color: #94a3b8; margin-top: 2px; }

/* SECTION HEADING — dark navy background */
.sh {
  font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
  color: #fff; background: #1d3557; padding: 5px 11px;
  margin: 20px 0 9px; border-left: 4px solid #FF9933;
  page-break-after: avoid;
}
.sh-dashboard {
  background: #0f3460; border-left-color: #e94560;
}
.ssh {
  font-size: 10px; font-weight: 700; color: #1d3557;
  margin: 10px 0 5px; padding-left: 7px;
  border-left: 3px solid #003580; page-break-after: avoid;
}
.bt {
  font-size: 10px; color: #374151; margin-bottom: 7px;
  text-align: justify; line-height: 1.6;
}
.rl { padding-left: 16px; margin-bottom: 7px; }
.rl li { font-size: 10px; color: #374151; margin-bottom: 3px; }
.ns { margin-bottom: 5px; }

/* DIVIDER */
hr.div { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }

/* TABLES */
.tbl-wrap { overflow: hidden; margin-bottom: 14px; page-break-inside: avoid; }
.dt { width: 100%; border-collapse: collapse; font-size: 9px; }
.dt th {
  background: #1d3557; color: #fff; padding: 5px 7px;
  text-align: left; font-size: 8px; text-transform: uppercase;
  letter-spacing: 0.4px; font-weight: 700; white-space: nowrap;
}
.dt td { padding: 4px 7px; border-bottom: 1px solid #e9ecef; font-size: 9px; vertical-align: middle; }
.dt tr:nth-child(even) td { background: #f8f9fa; }
.code {
  font-family: "Courier New", monospace; font-size: 7.5px;
  color: #1d3557; background: #eff6ff; padding: 1px 3px; border-radius: 2px;
}
.metric-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; page-break-inside: avoid; }
.metric-table td { padding: 4px 8px; border-bottom: 1px solid #e9ecef; font-size: 9px; }
.metric-table tr:nth-child(even) td { background: #f8f9fa; }
.mth td { background: #f1f5f9 !important; font-weight: 700; font-size: 8px; text-transform: uppercase; letter-spacing: 0.4px; }

/* CHART GRID */
.chart-grid-2 {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  margin: 10px 0 16px; page-break-inside: avoid;
}
.chart-grid-1 {
  display: grid; grid-template-columns: 1fr; margin: 10px 0 16px; page-break-inside: avoid;
}
.chart-box {
  border: 1px solid #e2e8f0; border-radius: 5px;
  padding: 10px 12px; background: #fafafa; overflow: hidden;
}
.chart-box svg { display: block; max-width: 100%; height: auto; }
.chart-label {
  font-size: 8px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.7px; color: #475569; margin-bottom: 8px;
  padding-bottom: 4px; border-bottom: 1px solid #e2e8f0;
}

/* INLINE STAT SPLIT */
.split-2 {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
  margin: 8px 0 14px; page-break-inside: avoid;
}

/* DISCLAIMER */
.disclaimer {
  background: #fff5f5; border: 1px solid #fecaca;
  border-left: 4px solid #c0392b; border-radius: 4px;
  padding: 9px 13px; margin-top: 20px;
  font-size: 8px; color: #7f1d1d; line-height: 1.65;
}

/* FOOTER */
.gov-footer {
  background: #1a1a2e; color: rgba(255,255,255,0.55);
  padding: 8px 34px; display: flex; justify-content: space-between;
  align-items: center; font-size: 7.5px; letter-spacing: 0.3px;
}
.footer-center { text-align: center; font-size: 7.5px; color: rgba(255,255,255,0.38); }

@media print {
  html, body { width: 210mm; }
  .sh, .ssh { page-break-after: avoid; }
  .tbl-wrap, .chart-grid-2, .chart-grid-1, .kpi-grid, .split-2 { page-break-inside: avoid; }
}
</style>
</head>
<body>

<!-- TRICOLOR TOP -->
<div class="tricolor"></div>

<!-- GOV HEADER -->
<div class="gov-header">
  <div style="flex-shrink:0">${ashokaChakra(62)}</div>
  <div class="gov-center">
    <div class="gov-title-main">Government of Maharashtra</div>
    <div class="gov-title-dept">Public Works Department (PWD)</div>
    <div class="gov-title-sub">Road Health Intelligence &amp; Monitoring Directorate &nbsp;&#124;&nbsp; Mantralaya, Mumbai &mdash; 400 032</div>
  </div>
  <div class="gov-right">
    <div class="conf-stamp">CONFIDENTIAL</div><br/>
    Maharashtra PWD<br/>
    Road-CIBIL System v1.0<br/>
    Techathon 2026
  </div>
</div>

<!-- TRICOLOR UNDER HEADER -->
<div class="tricolor"></div>

<!-- TITLE BAND -->
<div class="title-band">
  <div class="title-band-top">${reportTitle}</div>
  <div class="title-band-meta">
    <div class="title-band-sub">Maharashtra State Road Network &mdash; Field Survey &amp; CIBIL-Based Infrastructure Assessment</div>
    <div class="rpt-id">${reportId}</div>
  </div>
</div>

<!-- SCOPE BAR -->
<div class="scope-bar">
  <strong>Scope:</strong>
  ${filterBadges(summary)}
  &nbsp;&#124;&nbsp; <strong>${fmt(summary.totalFilteredRoads)}</strong> of <strong>${fmt(summary.totalNetworkRoads)}</strong> roads
  &bull; ${summary.coveragePercent}% coverage
  &bull; ${formattedDate}
</div>

<!-- CONTENT START -->
<div class="content">

  <!-- ═══ SECTION A — KPI EXECUTIVE SUMMARY ═══ -->
  ${kpiCards(summary)}

  <hr class="div"/>

  <!-- ═══ SECTION B — AI NARRATIVE ═══ -->
  <div>
    ${mdToHtml(narrative)}
  </div>

  <hr class="div"/>

  <!-- ═══ SECTION C — STATISTICAL TABLES ═══ -->
  <h2 class="sh">Statistical Breakdown</h2>

  <div class="split-2">
    <div>
      <div class="ssh">Condition Distribution</div>
      <table class="metric-table">
        <thead class="mth"><tr>
          <td>Band (PCI Range)</td><td style="text-align:right">Segments</td><td style="text-align:right">Share</td>
        </tr></thead>
        <tbody>
          ${[
            ["Critical &lt; 40",  summary.conditionBreakdown.Critical, summary.conditionPercents.Critical, "#c0392b"],
            ["Poor 40&ndash;59",  summary.conditionBreakdown.Poor,     summary.conditionPercents.Poor,     "#e67e22"],
            ["Fair 60&ndash;74",  summary.conditionBreakdown.Fair,     summary.conditionPercents.Fair,     "#ca8a04"],
            ["Good &ge; 75",      summary.conditionBreakdown.Good,     summary.conditionPercents.Good,     "#27ae60"],
          ].map(([lbl, cnt, pct, col]) => `<tr>
            <td><strong>${lbl}</strong></td>
            <td style="text-align:right">${fmt(cnt as number)}</td>
            <td style="text-align:right;font-weight:700;color:${col}">${pct}%</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div>
      <div class="ssh">Priority Distribution</div>
      <table class="metric-table">
        <thead class="mth"><tr>
          <td>Priority Level</td><td style="text-align:right">Segments</td><td style="text-align:right">Share</td>
        </tr></thead>
        <tbody>
          ${[
            ["Critical Priority", summary.priorityBreakdown.Critical, "#c0392b"],
            ["High Priority",     summary.priorityBreakdown.High,     "#e67e22"],
            ["Medium Priority",   summary.priorityBreakdown.Medium,   "#ca8a04"],
            ["Low Priority",      summary.priorityBreakdown.Low,      "#27ae60"],
          ].map(([lbl, cnt, col]) => `<tr>
            <td><strong>${lbl}</strong></td>
            <td style="text-align:right">${fmt(cnt as number)}</td>
            <td style="text-align:right;font-weight:700;color:${col}">${(((cnt as number)/summary.totalFilteredRoads)*100).toFixed(1)}%</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>

  <!-- TOP 10 -->
  <h2 class="sh">Top 10 Priority Roads &mdash; Immediate Intervention Required</h2>
  <p class="bt">The following road segments have the lowest Pavement Condition Index (PCI) within the filtered dataset and require immediate remedial action:</p>
  ${top10Table(summary)}

  <!-- DISTRICT TABLE -->
  ${hasDistricts ? `<h2 class="sh">District-Level Breakdown</h2>${districtTable(summary)}` : ""}

  <!-- INSPECTION SUMMARY -->
  <h2 class="sh">Inspection &amp; Compliance Summary</h2>
  <table class="metric-table">
    <thead class="mth"><tr>
      <td>Metric</td><td style="text-align:right">Count</td><td>Remark</td>
    </tr></thead>
    <tbody>
      <tr><td>Roads with Inspection History</td><td style="text-align:right">${fmt(summary.inspection.totalWithHistory)}</td><td>Decay trend analysis available</td></tr>
      <tr><td>Roads Never Inspected</td><td style="text-align:right;font-weight:700;color:#c0392b">${fmt(summary.inspection.totalWithoutHistory)}</td><td>Baseline inspection required immediately</td></tr>
      <tr><td>Overdue (&gt; 365 days)</td><td style="text-align:right;font-weight:700;color:#e67e22">${fmt(summary.inspection.overdueCount)}</td><td>Priority scheduling required</td></tr>
      <tr><td>Due Soon (180&ndash;365 days)</td><td style="text-align:right;font-weight:700;color:#ca8a04">${fmt(summary.inspection.dueSoonCount)}</td><td>Schedule within 6 months</td></tr>
      <tr><td>Recently Inspected (&lt; 180 days)</td><td style="text-align:right;font-weight:700;color:#27ae60">${fmt(summary.inspection.recentlyInspectedCount)}</td><td>Compliant &mdash; no action required</td></tr>
      <tr><td>Avg. Days Since Last Inspection</td><td style="text-align:right">${summary.inspection.avgDaysSinceInspection}</td><td>For roads with recorded history</td></tr>
    </tbody>
  </table>

  <!-- RISK FLAGS -->
  <h2 class="sh">Environmental &amp; Risk Assessment</h2>
  <table class="metric-table">
    <thead class="mth"><tr>
      <td>Risk Category</td><td style="text-align:right">Segments</td><td>Implication</td>
    </tr></thead>
    <tbody>
      <tr><td>Flood-Prone Segments</td><td style="text-align:right;font-weight:700;color:#1d4ed8">${fmt(summary.floodProneCount)}</td><td>Vulnerable during monsoon; drainage audit required</td></tr>
      <tr><td>Landslide-Prone Segments</td><td style="text-align:right;font-weight:700;color:#7c3aed">${fmt(summary.landslideProneCount)}</td><td>Geo-technical assessment recommended</td></tr>
      <tr><td>Ghat Section Segments</td><td style="text-align:right">${fmt(summary.ghatSectionCount)}</td><td>Specialised maintenance protocol required</td></tr>
      <tr><td>High Traffic (&gt; 10,000 ADT)</td><td style="text-align:right;font-weight:700;color:#e67e22">${fmt(summary.highTrafficCount)}</td><td>Accelerated wear; prioritise resurfacing</td></tr>
    </tbody>
  </table>

  <hr class="div"/>

  <!-- ═══════════════════════════════════════════════════ -->
  <!--     SECTION D — ANALYSIS DASHBOARD (CHARTS)        -->
  <!-- ═══════════════════════════════════════════════════ -->

  <h2 class="sh sh-dashboard">Analysis Dashboard &mdash; Visual Analytics</h2>
  <p class="bt">
    The following charts provide a comprehensive visual overview of the road network covering
    condition distribution, maintenance priorities, inspection compliance, budget allocation${hasDistricts ? ", district-level performance," : ""}
    and surface type composition.
  </p>

  <!-- Figure 1 + 2: Condition Donut & Priority Bars -->
  <div class="chart-grid-2">
    <div class="chart-box">
      <div class="chart-label">Figure 1 &mdash; Condition Distribution</div>
      ${donutSvg(summary)}
    </div>
    <div class="chart-box">
      <div class="chart-label">Figure 2 &mdash; Priority Level Breakdown</div>
      ${priorityBarSvg(summary)}
    </div>
  </div>

  <!-- Figure 3 + 4: Inspection Compliance & Budget Pie -->
  <div class="chart-grid-2">
    <div class="chart-box">
      <div class="chart-label">Figure 3 &mdash; Inspection Compliance Status</div>
      ${inspectionBarSvg(summary)}
    </div>
    <div class="chart-box">
      <div class="chart-label">Figure 4 &mdash; Budget Allocation by Condition Tier</div>
      ${budgetPieSvg(summary)}
    </div>
  </div>

  <!-- Figure 5: District PCI (if multi-district) -->
  ${distSvg ? `
  <div class="chart-grid-1">
    <div class="chart-box">
      <div class="chart-label">Figure 5 &mdash; Average PCI Score by District (top 9)</div>
      ${distSvg}
    </div>
  </div>` : ""}

  <!-- Figure 5/6: Surface Type Distribution -->
  ${surfSvg ? `
  <div class="chart-grid-1">
    <div class="chart-box">
      <div class="chart-label">Figure ${distSvg ? 6 : 5} &mdash; Road Segment Count by Surface Type</div>
      ${surfSvg}
    </div>
  </div>` : ""}

  <hr class="div"/>

  <!-- DISCLAIMER -->
  <div class="disclaimer">
    <strong>DISCLAIMER:</strong> This report has been generated by the Road-CIBIL Intelligence System v1.0
    developed for Maharashtra Public Works Department under Techathon 2026. All numerical values are
    derived from automated analysis of field survey data including PCI measurements, IRI readings, and
    inspection records maintained in the Maharashtra Road Asset Registry. This document is intended for
    <strong>internal government use only</strong>. For official publication, all data must be independently
    verified against primary field records and certified by the Chief Engineer (Roads), Maharashtra PWD.
    &nbsp;&#124;&nbsp; Report ID: <strong>${reportId}</strong>
    &nbsp;&#124;&nbsp; Generated: ${formattedDate}
    &nbsp;&#124;&nbsp; Model: ${summary.modelVersion}
  </div>

</div><!-- /content -->

<!-- TRICOLOR -->
<div class="tricolor"></div>

<!-- FOOTER -->
<div class="gov-footer">
  <div>Road Health Intelligence System<br/>Maharashtra Public Works Department</div>
  <div class="footer-center">CONFIDENTIAL &mdash; NOT FOR PUBLIC DISTRIBUTION<br/>${reportId}</div>
  <div style="text-align:right">${summary.dataTimestamp}<br/>${formattedDate}</div>
</div>

<!-- TRICOLOR BOTTOM -->
<div class="tricolor"></div>

</body>
</html>`;

  return NextResponse.json({ html, reportTitle, generatedAt: summary.generatedAt });
}
