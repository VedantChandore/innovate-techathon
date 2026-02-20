/**
 * Converts ultimate_dataset.csv → public/ultimate_dataset.json
 * Keyed as: { [highway_ref]: { [geojson_id]: SegmentData } }
 *
 * Run with: node scripts/convert-csv.js
 */

const fs   = require("fs");
const path = require("path");

const CSV_PATH  = path.resolve(__dirname, "../../ultimate_dataset.csv");
const OUT_PATH  = path.resolve(__dirname, "../public/ultimate_dataset.json");

const raw   = fs.readFileSync(CSV_PATH, "utf8");
const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
const headers = lines[0].split(",");

function idx(name) {
  const i = headers.indexOf(name);
  if (i === -1) throw new Error(`Column not found: ${name}`);
  return i;
}

// Column indices
const I = {
  geojson_id:                idx("geojson_id"),
  highway_ref:               idx("highway_ref"),
  segment_number:            idx("segment_number"),
  condition:                 idx("condition"),
  start_lat:                 idx("start_lat"),
  start_lon:                 idx("start_lon"),
  end_lat:                   idx("end_lat"),
  end_lon:                   idx("end_lon"),
  highway_type:              idx("highway_type"),
  lanes:                     idx("lanes"),
  lane_count:                idx("lane_count"),
  surface_type:              idx("surface_type"),
  year_constructed:          idx("year_constructed"),
  last_major_rehab_year:     idx("last_major_rehab_year"),
  status:                    idx("status"),
  district:                  idx("district"),
  taluka:                    idx("taluka"),
  jurisdiction:              idx("jurisdiction"),
  region_type:               idx("region_type"),
  terrain_type:              idx("terrain_type"),
  slope_category:            idx("slope_category"),
  monsoon_rainfall_category: idx("monsoon_rainfall_category"),
  landslide_prone:           idx("landslide_prone"),
  flood_prone:               idx("flood_prone"),
  ghat_section_flag:         idx("ghat_section_flag"),
  tourism_route_flag:        idx("tourism_route_flag"),
  elevation_m:               idx("elevation_m"),
  avg_daily_traffic:         idx("avg_daily_traffic"),
  truck_percentage:          idx("truck_percentage"),
  peak_hour_traffic:         idx("peak_hour_traffic"),
  traffic_weight:            idx("traffic_weight"),
  potholes_per_km:           idx("potholes_per_km"),
  pothole_avg_depth_cm:      idx("pothole_avg_depth_cm"),
  cracks_longitudinal_pct:   idx("cracks_longitudinal_pct"),
  cracks_transverse_per_km:  idx("cracks_transverse_per_km"),
  alligator_cracking_pct:    idx("alligator_cracking_pct"),
  rutting_depth_mm:          idx("rutting_depth_mm"),
  raveling_pct:              idx("raveling_pct"),
  edge_breaking_pct:         idx("edge_breaking_pct"),
  patches_per_km:            idx("patches_per_km"),
  iri_value:                 idx("iri_value"),
  pci_score:                 idx("pci_score"),
  name:                      idx("name"),
  length_km:                 idx("length_km"),
  segment_start_km:          idx("segment_start_km"),
  segment_end_km:            idx("segment_end_km"),
};

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function bool(v) {
  if (!v) return false;
  return v.trim().toLowerCase() === "true";
}
function str(v) {
  const s = (v || "").trim();
  return s === "" || s === "N/A" || s === "nan" ? null : s;
}

/**
 * CSV rows may contain JSON objects with commas inside quotes.
 * Simple split(",") breaks on those. This parser handles quoted fields.
 */
function parseCsvRow(line) {
  const cols = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

const result = {};
let parsed = 0, skipped = 0;

for (let li = 1; li < lines.length; li++) {
  const cols = parseCsvRow(lines[li]);
  const geojson_id  = str(cols[I.geojson_id]);
  const highway_ref = (str(cols[I.highway_ref]) || "").trim();

  if (!geojson_id || !highway_ref) { skipped++; continue; }

  // Normalise NH ref: "NH160 " → "NH160", bare numbers like "6" → "NH6"
  let nhKey = highway_ref.replace(/\s+/g, "");
  if (/^\d+$/.test(nhKey)) nhKey = "NH" + nhKey;

  if (!result[nhKey]) result[nhKey] = {};

  result[nhKey][geojson_id] = {
    segment_number:            num(cols[I.segment_number]) ?? li,
    condition:                 (str(cols[I.condition]) || "average"),
    start_lat:                 num(cols[I.start_lat]),
    start_lon:                 num(cols[I.start_lon]),
    end_lat:                   num(cols[I.end_lat]),
    end_lon:                   num(cols[I.end_lon]),
    name:                      str(cols[I.name]),
    length_km:                 num(cols[I.length_km]),
    segment_start_km:          num(cols[I.segment_start_km]),
    segment_end_km:            num(cols[I.segment_end_km]),
    highway_type:              str(cols[I.highway_type]),
    lane_count:                num(cols[I.lane_count]),
    surface_type:              str(cols[I.surface_type]),
    year_constructed:          num(cols[I.year_constructed]),
    last_major_rehab_year:     num(cols[I.last_major_rehab_year]),
    status:                    str(cols[I.status]),
    district:                  str(cols[I.district]),
    taluka:                    str(cols[I.taluka]),
    jurisdiction:              str(cols[I.jurisdiction]),
    region_type:               str(cols[I.region_type]),
    terrain_type:              str(cols[I.terrain_type]),
    slope_category:            str(cols[I.slope_category]),
    monsoon_rainfall_category: str(cols[I.monsoon_rainfall_category]),
    landslide_prone:           bool(cols[I.landslide_prone]),
    flood_prone:               bool(cols[I.flood_prone]),
    ghat_section_flag:         bool(cols[I.ghat_section_flag]),
    tourism_route_flag:        bool(cols[I.tourism_route_flag]),
    elevation_m:               num(cols[I.elevation_m]),
    avg_daily_traffic:         num(cols[I.avg_daily_traffic]),
    truck_percentage:          num(cols[I.truck_percentage]),
    peak_hour_traffic:         num(cols[I.peak_hour_traffic]),
    traffic_weight:            num(cols[I.traffic_weight]),
    potholes_per_km:           num(cols[I.potholes_per_km]),
    pothole_avg_depth_cm:      num(cols[I.pothole_avg_depth_cm]),
    cracks_longitudinal_pct:   num(cols[I.cracks_longitudinal_pct]),
    cracks_transverse_per_km:  num(cols[I.cracks_transverse_per_km]),
    alligator_cracking_pct:    num(cols[I.alligator_cracking_pct]),
    rutting_depth_mm:          num(cols[I.rutting_depth_mm]),
    raveling_pct:              num(cols[I.raveling_pct]),
    edge_breaking_pct:         num(cols[I.edge_breaking_pct]),
    patches_per_km:            num(cols[I.patches_per_km]),
    iri_value:                 num(cols[I.iri_value]),
    pci_score:                 num(cols[I.pci_score]),
  };
  parsed++;
}

fs.writeFileSync(OUT_PATH, JSON.stringify(result), "utf8");

const nhCount  = Object.keys(result).length;
const segCount = Object.values(result).reduce((a, v) => a + Object.keys(v).length, 0);
console.log(`✅ Wrote ${OUT_PATH}`);
console.log(`   ${segCount} segments across ${nhCount} highways (${skipped} skipped)`);
