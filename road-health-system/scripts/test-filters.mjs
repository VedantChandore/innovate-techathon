/**
 * Comprehensive filter combination test for /api/reports/aggregate
 * Tests every filter individually + key combinations
 * Run with: node scripts/test-filters.mjs
 */

const BASE = "http://localhost:3000";

let passed = 0,
  failed = 0,
  empty = 0;
const errors = [];

async function test(label, payload) {
  try {
    const res = await fetch(`${BASE}/api/reports/aggregate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok && data.error !== "empty_dataset") {
      failed++;
      errors.push({
        label,
        status: res.status,
        error: data.error || data.message,
      });
      console.log(
        `  ❌ FAIL  [${res.status}] ${label} → ${data.error || data.message}`,
      );
      return;
    }

    if (data.error === "empty_dataset") {
      empty++;
      console.log(`  ⚪ EMPTY  ${label} → no roads match (valid empty result)`);
      return;
    }

    // Validate required fields exist
    const required = [
      "totalFilteredRoads",
      "avgCibilScore",
      "avgPciScore",
      "conditionBreakdown",
      "conditionPercents",
      "priorityBreakdown",
      "inspection",
      "estimatedTotalCostCrores",
      "districtBreakdown",
      "top10WorstByPci",
      "top10WorstByCibil",
      "surfaceBreakdown",
      "terrainBreakdown",
      "floodProneCount",
      "highDecayCount",
    ];
    const missing = required.filter((k) => !(k in data));
    if (missing.length > 0) {
      failed++;
      errors.push({ label, error: `Missing fields: ${missing.join(", ")}` });
      console.log(
        `  ❌ FAIL  ${label} → missing fields: ${missing.join(", ")}`,
      );
      return;
    }

    // Validate no NaN / undefined values in key numeric fields
    const numFields = [
      "avgCibilScore",
      "avgPciScore",
      "estimatedTotalCostCrores",
      "avgDecayRate",
      "coveragePercent",
    ];
    const nanFields = numFields.filter((k) => !isFinite(data[k]));
    if (nanFields.length > 0) {
      failed++;
      errors.push({ label, error: `NaN/Infinity in: ${nanFields.join(", ")}` });
      console.log(`  ❌ FAIL  ${label} → NaN in: ${nanFields.join(", ")}`);
      return;
    }

    passed++;
    console.log(
      `  ✅ PASS  ${label} → ${data.totalFilteredRoads} roads, PCI=${data.avgPciScore}, CIBIL=${data.avgCibilScore}, Cost=₹${data.estimatedTotalCostCrores}Cr`,
    );
  } catch (err) {
    failed++;
    errors.push({ label, error: err.message });
    console.log(`  💥 ERROR ${label} → ${err.message}`);
  }
}

// ── Also test the generate endpoint for a couple of cases ─────────────────────
async function testGenerate(label, summary) {
  try {
    const res = await fetch(`${BASE}/api/reports/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(summary),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      failed++;
      errors.push({ label, error: data.error });
      console.log(`  ❌ FAIL  generate ${label} → ${data.error}`);
      return;
    }
    if (!data.narrative || data.narrative.length < 100) {
      failed++;
      errors.push({ label, error: "narrative too short" });
      console.log(
        `  ❌ FAIL  generate ${label} → narrative too short (${data.narrative?.length} chars)`,
      );
      return;
    }
    passed++;
    console.log(
      `  ✅ PASS  generate ${label} → ${data.narrative.length} chars, fallback=${data.usedFallback}`,
    );
  } catch (err) {
    failed++;
    errors.push({ label, error: err.message });
    console.log(`  💥 ERROR generate ${label} → ${err.message}`);
  }
}

// ── Also test the pdf endpoint ────────────────────────────────────────────────
async function testPdf(label, summary, narrative) {
  try {
    const res = await fetch(`${BASE}/api/reports/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrative, summary, reportTitle: "Test Report" }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      failed++;
      errors.push({ label, error: data.error });
      console.log(`  ❌ FAIL  pdf ${label} → ${data.error}`);
      return;
    }
    if (!data.html || data.html.length < 500) {
      failed++;
      errors.push({ label, error: "html too short" });
      console.log(`  ❌ FAIL  pdf ${label} → HTML too short`);
      return;
    }
    // Check for JS errors in html (NaN, undefined, null visible)
    const nanCount = (data.html.match(/\bNaN\b/g) || []).length;
    const undefinedCount = (data.html.match(/\bundefined\b/g) || []).length;
    if (nanCount > 0 || undefinedCount > 0) {
      failed++;
      errors.push({
        label,
        error: `HTML contains NaN×${nanCount} undefined×${undefinedCount}`,
      });
      console.log(
        `  ❌ FAIL  pdf ${label} → NaN×${nanCount} undefined×${undefinedCount} in HTML`,
      );
      return;
    }
    passed++;
    console.log(
      `  ✅ PASS  pdf ${label} → HTML ${data.html.length} chars, clean`,
    );
  } catch (err) {
    failed++;
    errors.push({ label, error: err.message });
    console.log(`  💥 ERROR pdf ${label} → ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("  REPORT FILTER COMPREHENSIVE TEST SUITE");
console.log("══════════════════════════════════════════\n");

// ── 1. All 5 report types, no filters ─────────────────────────────────────────
console.log("── 1. Report types (no filters) ──");
await test("network_overview / no filters", { reportType: "network_overview" });
await test("district_level / no filters", { reportType: "district_level" });
await test("critical_intervention / no filters", {
  reportType: "critical_intervention",
});
await test("inspection_audit / no filters", { reportType: "inspection_audit" });
await test("budget_planning / no filters", { reportType: "budget_planning" });

// ── 2. District filter (all 9 real districts) ─────────────────────────────────
console.log("\n── 2. District filter (each real district) ──");
for (const d of [
  "Dhule",
  "Kolhapur",
  "Nagpur",
  "Nashik",
  "Pune",
  "Raigad",
  "Satara",
  "Sindhudurg",
  "Solapur",
]) {
  await test(`district=${d}`, { reportType: "network_overview", district: d });
}

// ── 3. Highway ref filter (various formats — normalisation test) ───────────────
console.log("\n── 3. Highway ref filter (format normalisation) ──");
await test("highway=NH60 (raw)", {
  reportType: "network_overview",
  highway: "NH60",
});
await test("highway=NH-60 (hyphen)", {
  reportType: "network_overview",
  highway: "NH-60",
});
await test("highway=nh 60 (space+lower)", {
  reportType: "network_overview",
  highway: "nh 60",
});
await test("highway=NH 61", {
  reportType: "network_overview",
  highway: "NH 61",
});
await test("highway=NH-61", {
  reportType: "network_overview",
  highway: "NH-61",
});
await test("highway=NH130D", {
  reportType: "network_overview",
  highway: "NH130D",
});
await test("highway=NH-130-D", {
  reportType: "network_overview",
  highway: "NH-130-D",
});
await test("highway=NH160", {
  reportType: "network_overview",
  highway: "NH160",
});
await test("highway=NH-160", {
  reportType: "network_overview",
  highway: "NH-160",
});
await test("highway=NONEXISTENT", {
  reportType: "network_overview",
  highway: "NONEXISTENT",
}); // should be empty

// ── 4. Condition band filter ───────────────────────────────────────────────────
console.log("\n── 4. Condition band filter ──");
await test("conditionBand=Critical", {
  reportType: "critical_intervention",
  conditionBand: "Critical",
});
await test("conditionBand=Poor", {
  reportType: "network_overview",
  conditionBand: "Poor",
});
await test("conditionBand=Fair", {
  reportType: "network_overview",
  conditionBand: "Fair",
});
await test("conditionBand=Good", {
  reportType: "network_overview",
  conditionBand: "Good",
});

// ── 5. Priority level filter ───────────────────────────────────────────────────
console.log("\n── 5. Priority level filter ──");
await test("priorityLevel=Critical", {
  reportType: "critical_intervention",
  priorityLevel: "Critical",
});
await test("priorityLevel=High", {
  reportType: "network_overview",
  priorityLevel: "High",
});
await test("priorityLevel=Medium", {
  reportType: "network_overview",
  priorityLevel: "Medium",
});
await test("priorityLevel=Low", {
  reportType: "network_overview",
  priorityLevel: "Low",
});

// ── 6. Inspection status filter ───────────────────────────────────────────────
console.log("\n── 6. Inspection status filter ──");
await test("inspectionStatus=overdue", {
  reportType: "inspection_audit",
  inspectionStatus: "overdue",
});
await test("inspectionStatus=due_soon", {
  reportType: "inspection_audit",
  inspectionStatus: "due_soon",
});
await test("inspectionStatus=recently_inspected", {
  reportType: "inspection_audit",
  inspectionStatus: "recently_inspected",
});

// ── 7. CIBIL min/max filter ───────────────────────────────────────────────────
console.log("\n── 7. CIBIL range filter ──");
await test("cibilMin=0 cibilMax=100", {
  reportType: "network_overview",
  cibilMin: 0,
  cibilMax: 100,
});
await test("cibilMin=0 cibilMax=30", {
  reportType: "network_overview",
  cibilMin: 0,
  cibilMax: 30,
});
await test("cibilMin=30 cibilMax=50", {
  reportType: "network_overview",
  cibilMin: 30,
  cibilMax: 50,
});
await test("cibilMin=50 cibilMax=70", {
  reportType: "network_overview",
  cibilMin: 50,
  cibilMax: 70,
});
await test("cibilMin=70 cibilMax=100", {
  reportType: "network_overview",
  cibilMin: 70,
  cibilMax: 100,
});
await test("cibilMin=99 cibilMax=100", {
  reportType: "network_overview",
  cibilMin: 99,
  cibilMax: 100,
}); // may be empty

// ── 8. Construction year filter ───────────────────────────────────────────────
console.log("\n── 8. Construction year filter ──");
await test("year 1990-2000", {
  reportType: "network_overview",
  constructionYearMin: 1990,
  constructionYearMax: 2000,
});
await test("year 2000-2010", {
  reportType: "network_overview",
  constructionYearMin: 2000,
  constructionYearMax: 2010,
});
await test("year 2010-2020", {
  reportType: "network_overview",
  constructionYearMin: 2010,
  constructionYearMax: 2020,
});
await test("year 2020-2026", {
  reportType: "network_overview",
  constructionYearMin: 2020,
  constructionYearMax: 2026,
});
await test("year 1800-1850", {
  reportType: "network_overview",
  constructionYearMin: 1800,
  constructionYearMax: 1850,
}); // should be empty

// ── 9. Inspection date filter ─────────────────────────────────────────────────
console.log("\n── 9. Inspection date filter ──");
await test("inspFrom=2020-01-01", {
  reportType: "inspection_audit",
  inspectionDateFrom: "2020-01-01",
});
await test("inspFrom=2024-01-01", {
  reportType: "inspection_audit",
  inspectionDateFrom: "2024-01-01",
});
await test("inspTo=2023-12-31", {
  reportType: "inspection_audit",
  inspectionDateTo: "2023-12-31",
});
await test("inspFrom=2024-01-01 inspTo=2025-12-31", {
  reportType: "inspection_audit",
  inspectionDateFrom: "2024-01-01",
  inspectionDateTo: "2025-12-31",
});
await test("inspFrom=2030-01-01 (future — empty)", {
  reportType: "inspection_audit",
  inspectionDateFrom: "2030-01-01",
});

// ── 10. Multi-filter combinations ─────────────────────────────────────────────
console.log("\n── 10. Multi-filter combinations ──");
await test("Pune + NH-60", {
  reportType: "district_level",
  district: "Pune",
  highway: "NH-60",
});
await test("Nagpur + Critical", {
  reportType: "critical_intervention",
  district: "Nagpur",
  conditionBand: "Critical",
});
await test("Nashik + Poor + High priority", {
  reportType: "budget_planning",
  district: "Nashik",
  conditionBand: "Poor",
  priorityLevel: "High",
});
await test("Solapur + overdue inspection", {
  reportType: "inspection_audit",
  district: "Solapur",
  inspectionStatus: "overdue",
});
await test("conditionBand=Critical + cibil<30", {
  reportType: "critical_intervention",
  conditionBand: "Critical",
  cibilMax: 30,
});
await test("conditionBand=Good + cibil>=70", {
  reportType: "network_overview",
  conditionBand: "Good",
  cibilMin: 70,
});
await test("Pune + Fair + year 2000-2015", {
  reportType: "budget_planning",
  district: "Pune",
  conditionBand: "Fair",
  constructionYearMin: 2000,
  constructionYearMax: 2015,
});
await test("NH60 + overdue + cibil<50", {
  reportType: "inspection_audit",
  highway: "NH60",
  inspectionStatus: "overdue",
  cibilMax: 50,
});
await test("Kolhapur + Good + Low priority", {
  reportType: "network_overview",
  district: "Kolhapur",
  conditionBand: "Good",
  priorityLevel: "Low",
});
await test("all filters combined (narrow)", {
  reportType: "budget_planning",
  district: "Pune",
  highway: "NH60",
  conditionBand: "Poor",
  priorityLevel: "High",
  cibilMin: 30,
  cibilMax: 60,
  constructionYearMin: 2000,
  constructionYearMax: 2020,
});

// ── 11. Edge cases ────────────────────────────────────────────────────────────
console.log("\n── 11. Edge cases ──");
await test("district with trailing space", {
  reportType: "network_overview",
  district: "Pune ",
});
await test("highway lowercase", {
  reportType: "network_overview",
  highway: "nh61",
});
await test("highway with spaces only", {
  reportType: "network_overview",
  highway: "   ",
}); // should match all or empty
await test("cibilMin=cibilMax=50 (exact)", {
  reportType: "network_overview",
  cibilMin: 50,
  cibilMax: 50,
});
await test("year min > max (impossible range)", {
  reportType: "network_overview",
  constructionYearMin: 2020,
  constructionYearMax: 2000,
}); // should be empty
await test("inspDate from > to (impossible)", {
  reportType: "inspection_audit",
  inspectionDateFrom: "2025-01-01",
  inspectionDateTo: "2020-01-01",
}); // should be empty
await test("missing reportType", { district: "Pune" }); // should return 400

// ── 12. Full pipeline test (aggregate → generate → pdf) ───────────────────────
console.log("\n── 12. Full pipeline test ──");
// First get a real summary
const pipeSummary = await fetch(`${BASE}/api/reports/aggregate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reportType: "network_overview" }),
}).then((r) => r.json());

if (!pipeSummary.error) {
  await testGenerate("network_overview full pipeline", pipeSummary);
  // Use a minimal test narrative for PDF (avoid waiting for real AI)
  const testNarrative = `## Executive Summary\nTest report.\n## Statistical Snapshot\n${pipeSummary.totalFilteredRoads} roads.\n## Condition Analysis\nCritical: ${pipeSummary.conditionBreakdown.Critical}\n## Risk Assessment\nHigh risk.\n## Intervention Strategy\nFix roads.\n## Budget Implications\n₹${pipeSummary.estimatedTotalCostCrores} Cr\n## Inspection & Compliance Status\nOverdue: ${pipeSummary.inspection.overdueCount}\n## Recommendations\nAct now.\n## Disclaimer\nTest.`;
  await testPdf("network_overview full pipeline", pipeSummary, testNarrative);

  // Test PDF with a district-only summary
  const distSummary = await fetch(`${BASE}/api/reports/aggregate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportType: "district_level", district: "Nagpur" }),
  }).then((r) => r.json());
  if (!distSummary.error) {
    await testPdf("district_level Nagpur PDF", distSummary, testNarrative);
  }

  // Test PDF with critical intervention filter
  const critSummary = await fetch(`${BASE}/api/reports/aggregate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reportType: "critical_intervention",
      conditionBand: "Critical",
    }),
  }).then((r) => r.json());
  if (!critSummary.error) {
    await testPdf(
      "critical_intervention conditionBand=Critical PDF",
      critSummary,
      testNarrative,
    );
  }
} else {
  console.log("  ⚠️  Skipping pipeline test — aggregate failed");
}

// ════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log(
  `  RESULTS: ✅ ${passed} passed  ❌ ${failed} failed  ⚪ ${empty} empty`,
);
console.log("══════════════════════════════════════════");

if (errors.length > 0) {
  console.log("\n── FAILURES ──");
  errors.forEach((e, i) =>
    console.log(`  ${i + 1}. [${e.label}] → ${e.error}`),
  );
}

process.exit(failed > 0 ? 1 : 0);
