import { readFileSync } from "fs";

// Parse road_registry - find road_id column
const regRaw = readFileSync("public/road_registry.csv", "utf-8");
const regLines = regRaw.replace(/\r/g, "").split("\n").filter(Boolean);
const regHeaders = regLines[0].split(",").map((h) => h.trim());
const ridIdx = regHeaders.indexOf("road_id");
console.log("Registry road_id col index:", ridIdx);

// Simple split (road_id has no commas)
const regIds = new Set();
for (let i = 1; i < regLines.length && regIds.size < 20; i++) {
  const cols = regLines[i].split(",");
  const rid = cols[ridIdx]?.trim();
  if (rid) regIds.add(rid);
}
console.log("Sample REGISTRY road_ids:");
[...regIds].forEach((id) => console.log(" ", id));

// Parse inspection_history
const inspRaw = readFileSync("public/inspection_history.csv", "utf-8");
const inspLines = inspRaw.replace(/\r/g, "").split("\n").filter(Boolean);
const inspHeaders = inspLines[0].split(",").map((h) => h.trim());
const inspRidIdx = inspHeaders.indexOf("road_id");
console.log("\nInspection road_id col index:", inspRidIdx);

const inspIds = new Set();
for (let i = 1; i < inspLines.length && inspIds.size < 20; i++) {
  const cols = inspLines[i].split(",");
  const rid = cols[inspRidIdx]?.trim();
  if (rid) inspIds.add(rid);
}
console.log("Sample INSPECTION road_ids:");
[...inspIds].forEach((id) => console.log(" ", id));

// Try to find overlap
const allRegIds = new Set();
for (let i = 1; i < regLines.length; i++) {
  const cols = regLines[i].split(",");
  const rid = cols[ridIdx]?.trim();
  if (rid) allRegIds.add(rid);
}

let matches = 0;
const inspIdList = new Set();
for (let i = 1; i < inspLines.length; i++) {
  const cols = inspLines[i].split(",");
  const rid = cols[inspRidIdx]?.trim();
  if (rid) inspIdList.add(rid);
}
for (const id of inspIdList) {
  if (allRegIds.has(id)) matches++;
}
console.log(
  `\nDirect matches: ${matches} / ${inspIdList.size} inspection ids found in registry`,
);

// Try SEG suffix matching
function segSuffix(id) {
  const m = id.match(/SEG-(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}
const regBySeg = new Map();
for (const id of allRegIds) {
  const s = segSuffix(id);
  if (s !== null) {
    if (!regBySeg.has(s)) regBySeg.set(s, []);
    regBySeg.get(s).push(id);
  }
}
let segMatches = 0;
for (const id of inspIdList) {
  const s = segSuffix(id);
  if (s !== null && regBySeg.has(s)) segMatches++;
}
console.log(`SEG-number matches: ${segMatches} / ${inspIdList.size}`);
console.log(`(Registry has ${regBySeg.size} unique SEG numbers)`);
