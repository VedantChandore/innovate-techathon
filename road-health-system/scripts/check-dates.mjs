import { readFileSync } from "fs";

const inspRaw = readFileSync("public/inspection_history.csv", "utf-8");
const lines = inspRaw.replace(/\r/g, "").split("\n").filter(Boolean);
const headers = lines[0].split(",").map((h) => h.trim());
const dateIdx = headers.indexOf("inspection_date");

const dates = [];
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(",");
  const d = cols[dateIdx]?.trim();
  if (d) dates.push(d);
}
dates.sort();
console.log("Total inspection records:", dates.length);
console.log("Earliest 5:", dates.slice(0, 5));
console.log("Latest 5:", dates.slice(-5));
console.log(
  "Dates >= 2025-08-20 (within 180 days of 2026-02-20):",
  dates.filter((d) => d >= "2025-08-20").length,
);
console.log(
  "Dates >= 2025-01-01:",
  dates.filter((d) => d >= "2025-01-01").length,
);
console.log(
  "Dates >= 2024-01-01:",
  dates.filter((d) => d >= "2024-01-01").length,
);
console.log(
  "Dates <= 2024-12-31:",
  dates.filter((d) => d <= "2024-12-31").length,
);
