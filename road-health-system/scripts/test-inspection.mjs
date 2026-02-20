import { readFileSync } from "fs";

const BASE = "http://localhost:3000/api/reports/aggregate";

async function post(body) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function test(label, body) {
  const d = await post(body);
  if (d.error === "empty_dataset") {
    console.log(`⚪ EMPTY  ${label}`);
  } else if (d.error) {
    console.log(`❌ ERROR  ${label} → ${d.error}`);
  } else {
    console.log(`✅ PASS   ${label} → ${d.totalFilteredRoads} roads`);
  }
}

// ── Inspection status tests ──────────────────────────────
await test("inspectionStatus=overdue", {
  reportType: "condition_overview",
  inspectionStatus: "overdue",
});
await test("inspectionStatus=due_soon", {
  reportType: "condition_overview",
  inspectionStatus: "due_soon",
});
await test("inspectionStatus=recently_inspected", {
  reportType: "condition_overview",
  inspectionStatus: "recently_inspected",
});

// ── Inspection date range tests ──────────────────────────
await test("inspectionDateFrom=2023-01-01", {
  reportType: "condition_overview",
  inspectionDateFrom: "2023-01-01",
});
await test("inspectionDateTo=2024-12-31", {
  reportType: "condition_overview",
  inspectionDateTo: "2024-12-31",
});
await test("inspectionDate range 2023-2024", {
  reportType: "condition_overview",
  inspectionDateFrom: "2023-01-01",
  inspectionDateTo: "2024-12-31",
});
await test("inspectionDate range 2024-2025", {
  reportType: "condition_overview",
  inspectionDateFrom: "2024-01-01",
  inspectionDateTo: "2025-12-31",
});

// ── Combined filters ─────────────────────────────────────
await test("Pune + due_soon", {
  reportType: "condition_overview",
  district: "Pune",
  inspectionStatus: "due_soon",
});
await test("Nagpur + overdue", {
  reportType: "condition_overview",
  district: "Nagpur",
  inspectionStatus: "overdue",
});
await test("Critical band + date range", {
  reportType: "condition_overview",
  conditionBand: "Critical",
  inspectionDateFrom: "2022-01-01",
  inspectionDateTo: "2025-12-31",
});

console.log("\nDone.");
