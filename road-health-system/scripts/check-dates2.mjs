import { readFileSync } from "fs";

const inspRaw = readFileSync("public/inspection_history.csv", "utf-8");
const lines = inspRaw.replace(/\r/g, "").split("\n").filter(Boolean);
const headers = lines[0].split(",").map((h) => h.trim());
const dateIdx = headers.indexOf("inspection_date");
const ridIdx = headers.indexOf("road_id");

// Build latest-date-per-road map
const latestByRoad = new Map();
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(",");
  const rid = cols[ridIdx]?.trim();
  const d = cols[dateIdx]?.trim();
  if (!rid || !d) continue;
  const cur = latestByRoad.get(rid);
  if (!cur || d > cur) latestByRoad.set(rid, d);
}

let le2024 = 0,
  le2025 = 0,
  ge2025 = 0;
for (const [, d] of latestByRoad) {
  if (d <= "2024-12-31") le2024++;
  if (d <= "2025-12-31") le2025++;
  if (d >= "2025-01-01") ge2025++;
}
console.log("Roads with latest inspection <= 2024-12-31:", le2024);
console.log("Roads with latest inspection <= 2025-12-31:", le2025);
console.log("Roads with latest inspection >= 2025-01-01:", ge2025);
console.log("Total unique roads with inspections:", latestByRoad.size);

// Sample dates
const dates = [...latestByRoad.values()].sort();
console.log("Latest 10:", dates.slice(-10));
