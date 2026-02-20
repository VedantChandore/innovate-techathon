/**
 * rebuild_dataset.js
 *
 * Rebuilds ultimate_dataset.json by matching CSV rows to GeoJSON features
 * using GEOGRAPHIC PROXIMITY of start coordinates, not feature IDs.
 *
 * Each CSV row has:  highway_ref, start_lat, start_lon  (real OSM coords)
 * Each GeoJSON feature has:  ref (highway_ref), coordinates (real geometry)
 *
 * Match strategy:
 *   1. Group CSV rows by highway_ref
 *   2. Group GeoJSON features by highway_ref
 *   3. For each CSV row, find the nearest GeoJSON feature (by start coord)
 *   4. Assign the CSV row's metadata to that feature's ID
 *
 * Output: public/ultimate_dataset.json (replaces existing)
 */

const fs = require("fs");
const path = require("path");

const CSV_PATH   = path.resolve(__dirname, "../../all_highways_segments_conditions.csv");
const GEO_PATH   = path.resolve(__dirname, "../public/NH.geojson");
const OUT_PATH   = path.resolve(__dirname, "../public/ultimate_dataset.json");

// ── Haversine distance (km) ──────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Get first coordinate of a GeoJSON feature as [lat, lon] ─────────────────
function getFeatureStartLatLon(feature) {
  const geom = feature.geometry;
  let coords;
  if (geom.type === "LineString") {
    coords = geom.coordinates;
  } else if (geom.type === "MultiLineString") {
    coords = geom.coordinates[0];
  } else {
    return null;
  }
  if (!coords || coords.length === 0) return null;
  return [coords[0][1], coords[0][0]]; // [lat, lon]
}

// ── Parse CSV (handles quoted fields with commas) ────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
    } else if (c === "," && !inQuote) {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseBool(v) {
  if (v === "True" || v === "true" || v === "1") return true;
  if (v === "False" || v === "false" || v === "0") return false;
  return undefined;
}

function parseNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}

function parseIntVal(v) {
  const n = parseInt(v);
  return isNaN(n) ? undefined : n;
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log("Reading CSV...");
const csvText = fs.readFileSync(CSV_PATH, "utf8");
const csvLines = csvText.split("\n").filter(l => l.trim());
const header = parseCSVLine(csvLines[0]);

// Column indices
const col = {};
header.forEach((h, i) => { col[h.trim()] = i; });

console.log("Parsing", csvLines.length - 1, "CSV rows...");

// Group CSV rows by highway_ref
const csvByRef = {};
for (let i = 1; i < csvLines.length; i++) {
  const cells = parseCSVLine(csvLines[i]);
  if (cells.length < 5) continue;

  const ref = (cells[col["highway_ref"]] || "").trim();
  if (!ref) continue;

  const row = {
    geojson_id: cells[col["geojson_id"]]?.trim(),
    segment_number: parseIntVal(cells[col["segment_number"]]),
    condition: (cells[col["condition"]] || "").trim() || "average",
    start_lat: parseNum(cells[col["start_lat"]]),
    start_lon: parseNum(cells[col["start_lon"]]),
    end_lat: parseNum(cells[col["end_lat"]]),
    end_lon: parseNum(cells[col["end_lon"]]),
    name: cells[col["name"]]?.trim() || undefined,
    length_km: parseNum(cells[col["length_km"]]),
    segment_start_km: parseNum(cells[col["segment_start_km"]]),
    segment_end_km: parseNum(cells[col["segment_end_km"]]),
    highway_type: cells[col["highway_type"]]?.trim() || undefined,
    lane_count: parseIntVal(cells[col["lane_count"]]),
    surface_type: cells[col["surface_type"]]?.trim() || undefined,
    year_constructed: parseIntVal(cells[col["year_constructed"]]),
    last_major_rehab_year: parseIntVal(cells[col["last_major_rehab_year"]]) || parseNum(cells[col["last_major_rehab_year"]]),
    status: cells[col["status"]]?.trim() || undefined,
    district: cells[col["district"]]?.trim() || undefined,
    taluka: cells[col["taluka"]]?.trim() || undefined,
    jurisdiction: cells[col["jurisdiction"]]?.trim() || undefined,
    region_type: cells[col["region_type"]]?.trim() || undefined,
    terrain_type: cells[col["terrain_type"]]?.trim() || undefined,
    slope_category: cells[col["slope_category"]]?.trim() || undefined,
    monsoon_rainfall_category: cells[col["monsoon_rainfall_category"]]?.trim() || undefined,
    landslide_prone: parseBool(cells[col["landslide_prone"]]),
    flood_prone: parseBool(cells[col["flood_prone"]]),
    ghat_section_flag: parseBool(cells[col["ghat_section_flag"]]),
    tourism_route_flag: parseBool(cells[col["tourism_route_flag"]]),
    elevation_m: parseNum(cells[col["elevation_m"]]),
    avg_daily_traffic: parseNum(cells[col["avg_daily_traffic"]]),
    truck_percentage: parseNum(cells[col["truck_percentage"]]),
    peak_hour_traffic: parseNum(cells[col["peak_hour_traffic"]]),
    traffic_weight: parseNum(cells[col["traffic_weight"]]),
    potholes_per_km: parseNum(cells[col["potholes_per_km"]]),
    pothole_avg_depth_cm: parseNum(cells[col["pothole_avg_depth_cm"]]),
    cracks_longitudinal_pct: parseNum(cells[col["cracks_longitudinal_pct"]]),
    cracks_transverse_per_km: parseNum(cells[col["cracks_transverse_per_km"]]),
    alligator_cracking_pct: parseNum(cells[col["alligator_cracking_pct"]]),
    rutting_depth_mm: parseNum(cells[col["rutting_depth_mm"]]),
    raveling_pct: parseNum(cells[col["raveling_pct"]]),
    edge_breaking_pct: parseNum(cells[col["edge_breaking_pct"]]),
    patches_per_km: parseNum(cells[col["patches_per_km"]]),
    iri_value: parseNum(cells[col["iri_value"]]),
    pci_score: parseNum(cells[col["pci_score"]]),
  };

  // Remove undefined fields
  Object.keys(row).forEach(k => { if (row[k] === undefined) delete row[k]; });

  if (!csvByRef[ref]) csvByRef[ref] = [];
  csvByRef[ref].push(row);
}

console.log("CSV NHs:", Object.keys(csvByRef).length);

// ── Load GeoJSON ─────────────────────────────────────────────────────────────
console.log("Reading GeoJSON...");
const geojson = JSON.parse(fs.readFileSync(GEO_PATH, "utf8"));

// Group GeoJSON features by highway ref
const geoByRef = {};
geojson.features.forEach(feat => {
  const rawRef = (feat.properties?.ref || "").trim();
  const refs = rawRef.split(";").map(r => r.trim()).filter(Boolean);
  refs.forEach(ref => {
    if (!geoByRef[ref]) geoByRef[ref] = [];
    geoByRef[ref].push(feat);
  });
});

console.log("GeoJSON NHs:", Object.keys(geoByRef).length);

// ── Match CSV rows to GeoJSON features by proximity ──────────────────────────
console.log("Matching segments to GeoJSON features by geographic proximity...");

const output = {}; // { [nh]: { [featureId]: segmentData } }

let totalMatched = 0;
let totalUnmatched = 0;
let totalNHs = 0;

const allNHs = new Set([...Object.keys(csvByRef), ...Object.keys(geoByRef)]);

allNHs.forEach(ref => {
  const csvRows = csvByRef[ref] || [];
  const geoFeatures = geoByRef[ref] || [];

  if (csvRows.length === 0 || geoFeatures.length === 0) {
    // No data or no geometry — skip
    return;
  }

  totalNHs++;

  // Build an array of [feature, startLatLon] pairs
  const featCoords = geoFeatures.map(feat => ({
    feat,
    pos: getFeatureStartLatLon(feat),
  })).filter(x => x.pos !== null);

  // For each CSV row, find the nearest GeoJSON feature
  // Use a greedy nearest-neighbour assignment to avoid duplicate assignments
  // when there are same number of rows and features

  // Build a distance matrix (only if small enough, otherwise use nearest only)
  const usedFeatureIds = new Set();
  const result = {};

  // Sort CSV rows by segment_number for deterministic ordering
  const sortedRows = [...csvRows].sort((a, b) => (a.segment_number || 0) - (b.segment_number || 0));

  sortedRows.forEach(row => {
    if (row.start_lat == null || row.start_lon == null) {
      totalUnmatched++;
      return;
    }

    let bestFeat = null;
    let bestDist = Infinity;

    for (const { feat, pos } of featCoords) {
      if (usedFeatureIds.has(feat.id)) continue;
      const dist = haversine(row.start_lat, row.start_lon, pos[0], pos[1]);
      if (dist < bestDist) {
        bestDist = dist;
        bestFeat = feat;
      }
    }

    if (!bestFeat) {
      // All features used — allow reuse (more CSV rows than GeoJSON features)
      for (const { feat, pos } of featCoords) {
        const dist = haversine(row.start_lat, row.start_lon, pos[0], pos[1]);
        if (dist < bestDist) {
          bestDist = dist;
          bestFeat = feat;
        }
      }
    }

    if (bestFeat) {
      // Only assign if within reasonable distance (50 km)
      if (bestDist <= 50) {
        usedFeatureIds.add(bestFeat.id);
        result[bestFeat.id] = row;
        totalMatched++;
      } else {
        totalUnmatched++;
      }
    }
  });

  if (Object.keys(result).length > 0) {
    output[ref] = result;
  }
});

console.log(`\nResults:`);
console.log(`  NHs with data: ${totalNHs}`);
console.log(`  NHs in output: ${Object.keys(output).length}`);
console.log(`  Segments matched: ${totalMatched}`);
console.log(`  Segments unmatched (too far or no coords): ${totalUnmatched}`);

// Remove "Unknown" NH if present
delete output["Unknown"];

// ── Write output ─────────────────────────────────────────────────────────────
console.log("\nWriting ultimate_dataset.json...");
fs.writeFileSync(OUT_PATH, JSON.stringify(output));
console.log("Done! Output size:", Math.round(fs.statSync(OUT_PATH).size / 1024 / 1024 * 10) / 10, "MB");

// ── Sanity check ─────────────────────────────────────────────────────────────
console.log("\nSanity check (NH160, first 5 segments):");
if (output["NH160"]) {
  Object.entries(output["NH160"]).slice(0, 5).forEach(([id, seg]) => {
    console.log(`  ${id}: district=${seg.district}, start=(${seg.start_lat?.toFixed(3)}, ${seg.start_lon?.toFixed(3)})`);
  });
}
