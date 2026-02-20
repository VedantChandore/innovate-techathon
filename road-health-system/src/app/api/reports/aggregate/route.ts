/**
 * POST /api/reports/aggregate
 * ────────────────────────────
 * Reads road_registry.csv from /public, parses it server-side,
 * runs the report aggregation engine, and returns a ReportSummary JSON.
 *
 * This route is the ONLY place that touches raw road data for reports.
 * No raw data is ever sent to the AI.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  applyFiltersAndAggregate,
  ReportFilters,
  RoadForReport,
} from "@/lib/reportAggregator";

// ─── CSV parsing helpers ────────────────────────────────────
function parseBool(v: string): boolean {
  return v === "TRUE" || v === "true" || v === "1" || v === "Yes";
}
function parseNum(v: string, fallback = 0): number {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}
function conditionFromPci(pci: number): string {
  if (pci < 40) return "Critical";
  if (pci < 60) return "Poor";
  if (pci < 75) return "Fair";
  return "Good";
}
function cibilFromPci(pci: number, iri: number): number {
  // Deterministic CIBIL score derived from PCI + IRI (mirrors fallbackScore in scoring.ts)
  const iriNorm = Math.max(0, Math.min(100, 100 - (iri - 1) * 12));
  return Math.round((pci * 0.6 + iriNorm * 0.4) * 10) / 10;
}
function decayRateFromProps(pci: number, iri: number, year: number): number {
  const age = 2026 - year;
  const ageDecay = age > 0 ? (100 - pci) / (age * 365) : 0;
  const iriDecay = Math.max(0, (iri - 2) * 0.00015);
  return Math.min(0.25, Math.round((ageDecay + iriDecay) * 10000) / 10000);
}

// ─── Route handler ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Parse request body
    const body = await req.json() as ReportFilters;

    if (!body.reportType) {
      return NextResponse.json({ error: "reportType is required" }, { status: 400 });
    }

    // 2. Read road_registry.csv server-side (from /public)
    const csvPath = path.join(process.cwd(), "public", "road_registry.csv");
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({ error: "road_registry.csv not found" }, { status: 500 });
    }

    const csvText = fs.readFileSync(csvPath, "utf-8");

    // 3. Parse CSV with a simple RFC-4180 compliant parser (cap at 20k rows)
    function parseSimpleCsv(text: string): Record<string, string>[] {
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) return [];
      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      return lines.slice(1, 20001).map(line => {
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
        headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").replace(/^"|"$/g, ""); });
        return obj;
      });
    }

    const rows = parseSimpleCsv(csvText);
    const totalNetworkRoads = rows.length;

    // 4. Map CSV rows → RoadForReport
    const roads: RoadForReport[] = rows.map((row) => {
      const pci = parseNum(row.pci_score, 60);
      const iri = parseNum(row.iri_value, 3);
      const year = parseNum(row.year_constructed, 2005);
      const cibil = cibilFromPci(pci, iri);

      return {
        road_id: row.road_id || "",
        name: row.name || row.road_id || "",
        district: row.district || "Unknown",
        highway_ref: row.highway_ref || "",
        pci_score: pci,
        iri_value: iri,
        year_constructed: year,
        surface_type: row.surface_type || "bitumen",
        length_km: parseNum(row.length_km, 1),
        avg_daily_traffic: parseNum(row.avg_daily_traffic, 0),
        truck_percentage: parseNum(row.truck_percentage, 0),
        flood_prone: parseBool(row.flood_prone),
        landslide_prone: parseBool(row.landslide_prone),
        ghat_section_flag: parseBool(row.ghat_section_flag),
        terrain_type: row.terrain_type || "plain",
        potholes_per_km: parseNum(row.potholes_per_km, 0),
        alligator_cracking_pct: parseNum(row.alligator_cracking_pct, 0),
        rutting_depth_mm: parseNum(row.rutting_depth_mm, 0),
        cibil_score: cibil,
        condition: conditionFromPci(pci),
        band: pci >= 75 ? "A" : pci >= 60 ? "B" : pci >= 45 ? "C" : pci >= 30 ? "D" : "E",
        inspections: [], // Inspection history not used in aggregate (too heavy)
        decayRate: decayRateFromProps(pci, iri, year),
        priority: cibil < 30 ? "Critical" : cibil < 50 ? "High" : cibil < 70 ? "Medium" : "Low",
        estimatedCostLakhs: 0, // computed in aggregator
        nextDueDays: 0,
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
