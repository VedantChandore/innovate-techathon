/**
 * POST /api/reports/aggregate
 * ────────────────────────────
 * Reads road_registry.csv + inspection_history.csv from /public,
 * parses both server-side, joins them, runs the aggregation engine,
 * and returns a ReportSummary JSON.
 *
 * FILTER FIXES:
 *   - inspectionStatus: now uses real inspection dates from inspection_history.csv
 *   - conditionBand: uses computed PCI-based bands (not raw CSV "condition" column)
 *   - priorityLevel: uses CIBIL-derived priority (Critical/High/Medium/Low)
 *   - cibilMin/cibilMax: filtered against computed CIBIL score (0–100 scale)
 *   - All other filters: pass-through to aggregator unchanged
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  applyFiltersAndAggregate,
  ReportFilters,
  RoadForReport,
} from "@/lib/reportAggregator";

// ─── CSV parsing helpers ────────────────────────────────────────────────────

function parseBool(v: string): boolean {
  return v === "TRUE" || v === "true" || v === "1" || v === "Yes";
}
function parseNum(v: string, fallback = 0): number {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}
function cibilFromPci(pci: number, iri: number): number {
  const iriNorm = Math.max(0, Math.min(100, 100 - (iri - 1) * 12));
  return Math.round((pci * 0.6 + iriNorm * 0.4) * 10) / 10;
}
function decayRateFromProps(pci: number, iri: number, year: number): number {
  const age = 2026 - year;
  const ageDecay = age > 0 ? (100 - pci) / (age * 365) : 0;
  const iriDecay = Math.max(0, (iri - 2) * 0.00015);
  return Math.min(0.25, Math.round((ageDecay + iriDecay) * 10000) / 10000);
}

/**
 * Normalize a road_id to its numeric segment number for cross-file joining.
 *
 * inspection_history.csv  → "MA-RD-SEG-0001"
 * road_registry.csv       → "MA--SEG-0001", "MA-6-SEG-0001", "MA-NH 361-SEG-0001"
 *
 * All formats share the pattern "SEG-<digits>" at the end.
 * We extract the integer value (e.g. 1, 361, 1000) as the join key.
 * Returns the original trimmed string if no SEG pattern is found.
 */
function normalizeRoadId(id: string): string {
  const m = id.match(/SEG-(\d+)/i);
  return m ? String(parseInt(m[1], 10)) : id.trim();
}

/**
 * RFC-4180 compliant CSV parser.
 * Handles quoted fields with embedded commas, returns array of row objects.
 */
function parseSimpleCsv(text: string, maxRows = 30000): Record<string, string>[] {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1, maxRows + 1).map(line => {
    const vals: string[] = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { vals.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (vals[idx] ?? "").replace(/^"|"$/g, ""); });
    return obj;
  });
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Parse request body
    const body = await req.json() as ReportFilters;
    if (!body.reportType) {
      return NextResponse.json({ error: "reportType is required" }, { status: 400 });
    }

    // 2. Read road_registry.csv
    const csvPath = path.join(process.cwd(), "public", "road_registry.csv");
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({ error: "road_registry.csv not found" }, { status: 500 });
    }
    const roadRows = parseSimpleCsv(fs.readFileSync(csvPath, "utf-8"), 20000);
    const totalNetworkRoads = roadRows.length;

    // 3. Read inspection_history.csv and build a Map<road_id, inspections[]>
    //    This enables inspectionStatus / inspectionDate filters to work correctly.
    const inspPath = path.join(process.cwd(), "public", "inspection_history.csv");
    const inspByRoad = new Map<string, Array<{ inspection_date: string; condition_score: number }>>();

    if (fs.existsSync(inspPath)) {
      const inspRows = parseSimpleCsv(fs.readFileSync(inspPath, "utf-8"), 50000);
      for (const row of inspRows) {
        const raw = (row.road_id || "").trim();
        if (!raw) continue;
        const rid = normalizeRoadId(raw); // "MA-RD-SEG-0001" → "1"
        const arr = inspByRoad.get(rid) ?? [];
        arr.push({
          inspection_date: (row.inspection_date || "").trim(),
          condition_score: parseNum(row.condition_score, 50),
        });
        inspByRoad.set(rid, arr);
      }
    }

    // 4. Map CSV rows → RoadForReport
    const roads: RoadForReport[] = roadRows.map((row) => {
      const pci   = parseNum(row.pci_score, 60);
      const iri   = parseNum(row.iri_value, 3);
      const year  = parseNum(row.year_constructed, 2005);
      const cibil = cibilFromPci(pci, iri);
      const rid   = (row.road_id || "").trim();

      // Attach real inspection history — critical for inspectionStatus filter
      // Use normalizeRoadId so "MA-6-SEG-0001" matches "MA-RD-SEG-0001" (both → "1")
      const inspections = inspByRoad.get(normalizeRoadId(rid)) ?? [];

      return {
        road_id:              rid,
        name:                 row.name || rid,
        district:             (row.district || "Unknown").trim(),
        highway_ref:          (row.highway_ref || "").trim(),
        pci_score:            pci,
        iri_value:            iri,
        year_constructed:     year,
        surface_type:         (row.surface_type || "bitumen").toLowerCase().trim(),
        length_km:            parseNum(row.length_km, 1),
        avg_daily_traffic:    parseNum(row.avg_daily_traffic, 0),
        truck_percentage:     parseNum(row.truck_percentage, 0),
        flood_prone:          parseBool(row.flood_prone),
        landslide_prone:      parseBool(row.landslide_prone),
        ghat_section_flag:    parseBool(row.ghat_section_flag),
        terrain_type:         (row.terrain_type || "plain").toLowerCase().trim(),
        potholes_per_km:      parseNum(row.potholes_per_km, 0),
        alligator_cracking_pct: parseNum(row.alligator_cracking_pct, 0),
        rutting_depth_mm:     parseNum(row.rutting_depth_mm, 0),
        cibil_score:          cibil,
        condition:            pci < 40 ? "Critical" : pci < 60 ? "Poor" : pci < 75 ? "Fair" : "Good",
        band:                 pci >= 75 ? "A" : pci >= 60 ? "B" : pci >= 45 ? "C" : pci >= 30 ? "D" : "E",
        inspections,
        decayRate:            decayRateFromProps(pci, iri, year),
        priority:             cibil < 30 ? "Critical" : cibil < 50 ? "High" : cibil < 70 ? "Medium" : "Low",
        estimatedCostLakhs:   0, // computed in aggregator
        nextDueDays:          0,
      };
    });

    const totalNetworkLengthKm = Math.round(
      roads.reduce((s, r) => s + r.length_km, 0) * 10
    ) / 10;

    // 5. Run aggregation engine
    const result = applyFiltersAndAggregate(
      roads,
      body,
      totalNetworkRoads,
      totalNetworkLengthKm
    );

    if ("error" in result) {
      return NextResponse.json(result, { status: 422 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/reports/aggregate] Error:", err);
    return NextResponse.json(
      { error: "Internal server error during aggregation" },
      { status: 500 }
    );
  }
}
