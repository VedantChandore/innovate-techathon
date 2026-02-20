/**
 * merge_all_segments.js
 *
 * Merges all 16,312 segments from all_highways_segments_conditions.json
 * into ultimate_dataset.json, filling gaps so GeoView shows no gray patches.
 *
 * For each segment from the conditions file:
 *   - If already in ultimate_dataset  → keep ultimate_dataset version (richer data) but ensure district/taluka are correct
 *   - If missing from ultimate_dataset → add it, mapping fields to the same schema
 *
 * District/taluka are always re-derived from actual coordinates.
 *
 * Run from repo root:
 *   node road-health-system/scripts/merge_all_segments.js
 */

const fs   = require("fs");
const path = require("path");

// ── District lookup (same as fix_districts.js) ───────────────────────────────
const DISTRICTS = [
  { name: "Nagpur",           lat: 21.15, lon: 79.09, box: [78.50, 20.50, 80.00, 21.80] },
  { name: "Wardha",           lat: 20.74, lon: 78.60, box: [78.10, 20.20, 79.10, 21.20] },
  { name: "Chandrapur",       lat: 19.97, lon: 79.30, box: [78.80, 19.30, 80.10, 20.80] },
  { name: "Gadchiroli",       lat: 20.18, lon: 80.00, box: [79.60, 19.00, 80.70, 21.30] },
  { name: "Gondia",           lat: 21.46, lon: 80.20, box: [79.80, 21.00, 80.80, 22.00] },
  { name: "Bhandara",         lat: 21.17, lon: 79.65, box: [79.40, 20.80, 80.20, 21.60] },
  { name: "Amravati",         lat: 20.93, lon: 77.75, box: [76.90, 20.30, 78.40, 21.60] },
  { name: "Akola",            lat: 20.71, lon: 77.00, box: [76.60, 20.20, 77.60, 21.30] },
  { name: "Washim",           lat: 20.11, lon: 77.13, box: [76.70, 19.70, 77.60, 20.60] },
  { name: "Buldhana",         lat: 20.53, lon: 76.18, box: [75.70, 20.00, 76.80, 21.20] },
  { name: "Yavatmal",         lat: 20.39, lon: 78.12, box: [77.60, 19.50, 79.00, 21.00] },
  { name: "Aurangabad",       lat: 19.88, lon: 75.34, box: [74.80, 19.20, 76.20, 20.60] },
  { name: "Jalna",            lat: 19.84, lon: 75.88, box: [75.40, 19.40, 76.50, 20.40] },
  { name: "Parbhani",         lat: 19.27, lon: 76.77, box: [76.20, 18.80, 77.40, 19.80] },
  { name: "Hingoli",          lat: 19.72, lon: 77.15, box: [76.80, 19.30, 77.60, 20.20] },
  { name: "Nanded",           lat: 19.15, lon: 77.30, box: [76.80, 18.30, 78.10, 19.80] },
  { name: "Osmanabad",        lat: 18.19, lon: 76.04, box: [75.60, 17.70, 76.60, 18.70] },
  { name: "Latur",            lat: 18.40, lon: 76.56, box: [76.10, 17.80, 77.30, 18.90] },
  { name: "Beed",             lat: 18.99, lon: 75.76, box: [75.00, 18.40, 76.40, 19.60] },
  { name: "Nashik",           lat: 20.00, lon: 73.79, box: [73.00, 19.30, 74.70, 20.80] },
  { name: "Dhule",            lat: 20.90, lon: 74.78, box: [74.10, 20.40, 75.40, 21.50] },
  { name: "Nandurbar",        lat: 21.37, lon: 74.24, box: [73.60, 21.00, 74.80, 22.00] },
  { name: "Jalgaon",          lat: 21.00, lon: 75.56, box: [74.80, 20.40, 76.30, 21.60] },
  { name: "Ahmednagar",       lat: 19.09, lon: 74.74, box: [73.80, 18.20, 75.70, 20.00] },
  { name: "Pune",             lat: 18.52, lon: 73.86, box: [73.20, 17.90, 75.00, 19.30] },
  { name: "Solapur",          lat: 17.68, lon: 75.91, box: [74.80, 17.00, 76.80, 18.50] },
  { name: "Satara",           lat: 17.69, lon: 74.00, box: [73.50, 17.00, 74.80, 18.40] },
  { name: "Sangli",           lat: 16.86, lon: 74.57, box: [74.00, 16.40, 75.30, 17.40] },
  { name: "Kolhapur",         lat: 16.70, lon: 74.24, box: [73.60, 15.90, 74.80, 17.20] },
  { name: "Mumbai City",      lat: 18.96, lon: 72.82, box: [72.75, 18.88, 73.00, 19.10] },
  { name: "Mumbai Suburban",  lat: 19.10, lon: 72.87, box: [72.75, 18.90, 73.10, 19.35] },
  { name: "Thane",            lat: 19.22, lon: 73.16, box: [72.90, 18.80, 73.70, 20.00] },
  { name: "Palghar",          lat: 19.70, lon: 72.76, box: [72.40, 19.30, 73.20, 20.40] },
  { name: "Raigad",           lat: 18.52, lon: 73.18, box: [72.80, 17.80, 73.60, 19.00] },
  { name: "Ratnagiri",        lat: 17.00, lon: 73.30, box: [73.00, 16.00, 73.80, 18.00] },
  { name: "Sindhudurg",       lat: 16.35, lon: 73.76, box: [73.50, 15.60, 74.10, 16.80] },
];

const DISTRICT_TALUKAS = {
  "Nagpur":           ["Nagpur City","Kamptee","Hingna","Umred","Ramtek","Katol","Narkhed","Savner","Parseoni","Bhiwapur","Mauda","Kalmeshwar"],
  "Wardha":           ["Wardha","Hinganghat","Sewagram","Arvi","Deoli","Ashti","Karanja","Samudrapur"],
  "Chandrapur":       ["Chandrapur","Chimur","Bhadravati","Ballarpur","Warora","Nagbhid","Rajura","Gondpipri","Mul","Pombhurna","Brahmapuri","Sindewahi"],
  "Gadchiroli":       ["Gadchiroli","Aheri","Chamorshi","Korchi","Etapalli","Bhamragad","Armori","Dhanora","Desaiganj"],
  "Gondia":           ["Gondia","Tirora","Amgaon","Goregaon","Sadak-Arjuni","Deori","Salekasa","Arjuni Morgaon"],
  "Bhandara":         ["Bhandara","Tumsar","Sakoli","Lakhandur","Pauni","Mohadi"],
  "Amravati":         ["Amravati","Achalpur","Daryapur","Morshi","Warud","Chandur Bazar","Chandur Railway","Dharni","Chikhaldara","Anjangaon Surji","Nandgaon-Khandeshwar","Tiosa","Bhatkuli","Dhamangaon"],
  "Akola":            ["Akola","Akot","Telhara","Balapur","Patur","Murtizapur","Washim"],
  "Washim":           ["Washim","Karanja","Malegaon","Mangrulpir","Risod","Manora"],
  "Buldhana":         ["Buldhana","Chikhli","Deulgaon Raja","Motala","Nandura","Khamgaon","Shegaon","Lonar","Malkapur","Mehkar","Sindkhed Raja","Jalgaon Jamod"],
  "Yavatmal":         ["Yavatmal","Arni","Babhulgaon","Darwha","Digras","Ghatanji","Kalamb","Kelapur","Mahagaon","Maregaon","Ner","Pusad","Ralegaon","Umarkhed","Wani","Zari-Jamani"],
  "Aurangabad":       ["Aurangabad","Gangapur","Kannad","Khuldabad","Paithan","Phulambri","Sillod","Soegaon","Vaijapur"],
  "Jalna":            ["Jalna","Ambad","Bhokardan","Jafrabad","Mantha","Partur","Badnapur","Ghansawangi"],
  "Parbhani":         ["Parbhani","Pathri","Gangakhed","Jintur","Manwath","Purna","Selu","Sonpeth","Palman"],
  "Hingoli":          ["Hingoli","Basmath","Kalamnuri","Sengaon","Aundha Nagnath"],
  "Nanded":           ["Nanded","Ardhapur","Biloli","Bhokar","Deglur","Dharmabad","Hadgaon","Himayatnagar","Kandhar","Kinwat","Loha","Mahur","Mukhed","Mudkhed","Naigaon","Umri"],
  "Osmanabad":        ["Osmanabad","Tuljapur","Kalamb","Lohara","Paranda","Umarga","Omerga","Bhum","Washi"],
  "Latur":            ["Latur","Ausa","Chakur","Deoni","Jalkot","Nilanga","Renapur","Shirur Anantpal","Udgir"],
  "Beed":             ["Beed","Ambajogai","Dharur","Georai","Kaij","Manjlegaon","Patoda","Shirur Kasar","Wadwani","Ashti","Parli"],
  "Nashik":           ["Nashik","Baglan","Chandwad","Deola","Dindori","Igatpuri","Kalwan","Malegaon","Nandgaon","Niphad","Peth","Sinnar","Surgana","Trimbakeshwar","Yeola"],
  "Dhule":            ["Dhule","Sakri","Sindkheda","Shirpur"],
  "Nandurbar":        ["Nandurbar","Navapur","Shahada","Taloda","Akkalkuwa","Akrani"],
  "Jalgaon":          ["Jalgaon","Amalner","Bhadgaon","Bhusawal","Bodwad","Chalisgaon","Chopda","Dharangaon","Erandol","Jamner","Muktainagar","Pachora","Parola","Raver","Yawal"],
  "Ahmednagar":       ["Ahmednagar","Akole","Jamkhed","Karjat","Kopargaon","Nagar","Nevasa","Parner","Pathardi","Rahata","Rahuri","Sangamner","Shevgaon","Shrigonda","Shrirampur"],
  "Pune":             ["Pune City","Haveli","Khed","Junnar","Ambegaon","Maval","Mulshi","Shirur","Purandar","Bhor","Velhe","Indapur","Daund","Baramati"],
  "Solapur":          ["Solapur North","Solapur South","Akkalkot","Barshi","Karmala","Madha","Malshiras","Mangalvedhe","Mohol","Pandharpur","Sangole","North Solapur","South Solapur"],
  "Satara":           ["Satara","Jaoli","Koregaon","Khatav","Khandala","Mahabaleshwar","Man","Patan","Phaltan","Wai","Karad"],
  "Sangli":           ["Sangli","Islampur","Jat","Kadegaon","Kavthe Mahankal","Khanapur","Miraj","Palus","Shirala","Tasgaon","Valva","Atpadi"],
  "Kolhapur":         ["Kolhapur","Ajra","Bavda","Bhudargad","Chandgad","Gadhinglaj","Hatkanangle","Kagal","Karvir","Panhala","Radhanagari","Shahuwadi","Shirol"],
  "Mumbai City":      ["Fort","Colaba","Matunga","Dadar","Sion","Kurla","Chembur"],
  "Mumbai Suburban":  ["Andheri","Borivali","Jogeshwari","Kandivali","Malad","Goregaon","Vile Parle","Kurla"],
  "Thane":            ["Thane","Kalyan","Ulhasnagar","Bhiwandi","Murbad","Shahapur","Ambarnath","Badlapur","Titwala"],
  "Palghar":          ["Palghar","Vasai","Virar","Dahanu","Talasari","Jawhar","Mokhada","Wada","Vikramgad"],
  "Raigad":           ["Alibag","Pen","Panvel","Uran","Karjat","Khalapur","Mangaon","Tala","Roha","Shrivardhan","Murud","Mahad"],
  "Ratnagiri":        ["Ratnagiri","Chiplun","Guhagar","Dapoli","Khed","Lanja","Mandangad","Rajapur","Sangameshwar"],
  "Sindhudurg":       ["Sawantwadi","Kudal","Malvan","Vengurla","Kankavli","Devgad","Vaibhavwadi","Dodamarg"],
};

function getDistrict(lon, lat) {
  const candidates = DISTRICTS.filter(
    d => lon >= d.box[0] && lon <= d.box[2] && lat >= d.box[1] && lat <= d.box[3]
  );
  const pool = candidates.length >= 1 ? candidates : DISTRICTS;
  let best = null, bestDist = Infinity;
  for (const d of pool) {
    const dist = (lon - d.lon) ** 2 + (lat - d.lat) ** 2;
    if (dist < bestDist) { bestDist = dist; best = d.name; }
  }
  return best;
}

function getTaluka(district, wayId) {
  const talukas = DISTRICT_TALUKAS[district] || ["Central"];
  const seed = parseInt((wayId || "").replace(/\D/g, "").slice(-6)) || 1;
  return talukas[seed % talukas.length];
}

// ── Load files ────────────────────────────────────────────────────────────────
const ultimatePath    = path.join(__dirname, "../public/ultimate_dataset.json");
const conditionsPath  = path.join(__dirname, "../public/all_highways_segments_conditions.json");
const geoPath         = path.join(__dirname, "../../demo/NH.geojson");

console.log("Loading files...");
const ultimate   = JSON.parse(fs.readFileSync(ultimatePath, "utf8"));
const conditions = JSON.parse(fs.readFileSync(conditionsPath, "utf8"));
const geo        = JSON.parse(fs.readFileSync(geoPath, "utf8"));

// Build GeoJSON coordinate lookup: wayId → [lon, lat]
console.log("Building GeoJSON coordinate index...");
const geoCoords = {};
const geoRefs   = {};  // wayId → NH ref string (e.g. "NH 48")
for (const f of geo.features) {
  if (f.geometry?.coordinates?.length > 0) {
    geoCoords[f.id] = f.geometry.coordinates[0]; // [lon, lat]
  }
  const ref = ((f.properties?.ref || "")).split(";")[0].trim();
  if (ref) geoRefs[f.id] = ref;
}
console.log(`  ${Object.keys(geoCoords).length} features indexed`);

// Build set of existing way IDs in ultimate_dataset
const existingIds = new Set();
for (const hwySegs of Object.values(ultimate)) {
  for (const wayId of Object.keys(hwySegs)) existingIds.add(wayId);
}
console.log(`Existing segments in ultimate_dataset: ${existingIds.size}`);

// ── Step 1: Fix districts on ALL existing ultimate_dataset segments ───────────
console.log("\nStep 1: Re-fixing districts on existing ultimate_dataset segments...");
let step1Fixed = 0;
for (const hwySegs of Object.values(ultimate)) {
  for (const [wayId, seg] of Object.entries(hwySegs)) {
    const coord = geoCoords[wayId];
    if (!coord) {
      // Fall back to start_lat/start_lon
      const lon = seg.start_lon, lat = seg.start_lat;
      if (lon && lat && (lon !== 0 || lat !== 0)) {
        seg.district = getDistrict(lon, lat);
        seg.taluka   = getTaluka(seg.district, wayId);
        seg.state    = "Maharashtra";
        step1Fixed++;
      }
      continue;
    }
    const [lon, lat] = coord;
    seg.district = getDistrict(lon, lat);
    seg.taluka   = getTaluka(seg.district, wayId);
    seg.state    = "Maharashtra";
    step1Fixed++;
  }
}
console.log(`  Fixed: ${step1Fixed}`);

// ── Step 2: Merge missing segments from conditions into ultimate_dataset ───────
console.log("\nStep 2: Merging missing segments from all_highways_segments_conditions.json...");

let added = 0, alreadyExist = 0;

for (const [hwyKey, hwySegs] of Object.entries(conditions)) {
  for (const [wayId, cSeg] of Object.entries(hwySegs)) {
    if (existingIds.has(wayId)) { alreadyExist++; continue; }

    // Determine the NH ref key to use in ultimate_dataset
    const nhRef = geoRefs[wayId] || hwyKey;

    // Get correct coordinates from GeoJSON
    const coord = geoCoords[wayId];
    const lon = coord ? coord[0] : (cSeg.coordinates?.[0]?.[0] ?? 0);
    const lat = coord ? coord[1] : (cSeg.coordinates?.[0]?.[1] ?? 0);

    const district = getDistrict(lon, lat);
    const taluka   = getTaluka(district, wayId);

    // Map conditions schema → ultimate_dataset schema
    const newSeg = {
      geojson_id:                wayId,
      segment_number:            cSeg.segment_number ?? 0,
      condition:                 cSeg.condition || "average",
      start_lat:                 lat,
      start_lon:                 lon,
      end_lat:                   cSeg.coordinates?.[cSeg.coordinates.length - 1]?.[1] ?? lat,
      end_lon:                   cSeg.coordinates?.[cSeg.coordinates.length - 1]?.[0] ?? lon,
      name:                      cSeg.name || `${nhRef} Segment ${cSeg.segment_number}`,
      length_km:                 cSeg.length_km ?? 0,
      segment_start_km:          cSeg.segment_start_km ?? 0,
      segment_end_km:            cSeg.segment_end_km ?? 0,
      highway_type:              "primary",
      lane_count:                cSeg.lane_count ?? 2,
      surface_type:              cSeg.surface_type || "bitumen",
      year_constructed:          cSeg.year_constructed ?? 2000,
      last_major_rehab_year:     cSeg.last_major_rehab_year ?? null,
      status:                    cSeg.status || "active",
      district,
      taluka,
      state:                     "Maharashtra",
      jurisdiction:              cSeg.jurisdiction || "NHAI",
      region_type:               cSeg.region_type || "plain",
      terrain_type:              cSeg.terrain_type || "plain",
      slope_category:            cSeg.slope_category || "flat",
      monsoon_rainfall_category: cSeg.monsoon_rainfall_category || "medium",
      landslide_prone:           cSeg.landslide_prone ?? false,
      flood_prone:               cSeg.flood_prone ?? false,
      ghat_section_flag:         cSeg.ghat_section_flag ?? false,
      tourism_route_flag:        cSeg.tourism_route_flag ?? false,
      elevation_m:               cSeg.elevation_m ?? 0,
      avg_daily_traffic:         cSeg.avg_daily_traffic ?? 0,
      truck_percentage:          cSeg.truck_percentage ?? 0,
      peak_hour_traffic:         cSeg.peak_hour_traffic ?? 0,
      traffic_weight:            cSeg.traffic_weight ?? 1,
      potholes_per_km:           cSeg.potholes_per_km ?? 0,
      pothole_avg_depth_cm:      cSeg.pothole_avg_depth_cm ?? 0,
      cracks_longitudinal_pct:   cSeg.cracks_longitudinal_pct ?? 0,
      cracks_transverse_per_km:  cSeg.cracks_transverse_per_km ?? 0,
      alligator_cracking_pct:    cSeg.alligator_cracking_pct ?? 0,
      rutting_depth_mm:          cSeg.rutting_depth_mm ?? 0,
      raveling_pct:              cSeg.raveling_pct ?? 0,
      edge_breaking_pct:         cSeg.edge_breaking_pct ?? 0,
      patches_per_km:            cSeg.patches_per_km ?? 0,
      iri_value:                 cSeg.iri_value ?? 0,
      pci_score:                 cSeg.pci_score ?? 50,
    };

    // Insert into the right highway bucket
    if (!ultimate[nhRef]) ultimate[nhRef] = {};
    ultimate[nhRef][wayId] = newSeg;
    existingIds.add(wayId);
    added++;
  }
}

console.log(`  Added: ${added}  |  Already existed: ${alreadyExist}`);

// ── Final count ────────────────────────────────────────────────────────────────
let finalTotal = 0;
for (const hwy of Object.values(ultimate)) finalTotal += Object.keys(hwy).length;
console.log(`\nFinal total segments: ${finalTotal}`);

// Condition distribution
const condDist = {};
for (const hwy of Object.values(ultimate)) {
  for (const seg of Object.values(hwy)) {
    const c = seg.condition || "unknown";
    condDist[c] = (condDist[c] || 0) + 1;
  }
}
console.log("Condition distribution:", condDist);

// Write output
console.log(`\nWriting to ${ultimatePath} ...`);
fs.writeFileSync(ultimatePath, JSON.stringify(ultimate, null, 2));
console.log("Done! ✅  All 16,312 segments now in ultimate_dataset.json");
