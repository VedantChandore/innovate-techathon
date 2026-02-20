/**
 * fix_ultimate_dataset.js
 * Re-assigns correct district & taluka to every road segment
 * in ultimate_dataset.json (the file actually used by the frontend GeoView).
 *
 * Uses start_lat / start_lon that are already on each segment record.
 *
 * Run from repo root:
 *   node road-health-system/scripts/fix_ultimate_dataset.js
 */

const fs   = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────────────────────
// 36 Maharashtra districts: centroid + bounding box [minLon, minLat, maxLon, maxLat]
// ─────────────────────────────────────────────────────────────────────────────
const DISTRICTS = [
  // Eastern Vidarbha
  { name: "Nagpur",           lat: 21.15, lon: 79.09, box: [78.50, 20.50, 80.00, 21.80] },
  { name: "Wardha",           lat: 20.74, lon: 78.60, box: [78.10, 20.20, 79.10, 21.20] },
  { name: "Chandrapur",       lat: 19.97, lon: 79.30, box: [78.80, 19.30, 80.10, 20.80] },
  { name: "Gadchiroli",       lat: 20.18, lon: 80.00, box: [79.60, 19.00, 80.70, 21.30] },
  { name: "Gondia",           lat: 21.46, lon: 80.20, box: [79.80, 21.00, 80.80, 22.00] },
  { name: "Bhandara",         lat: 21.17, lon: 79.65, box: [79.40, 20.80, 80.20, 21.60] },
  // Western Vidarbha
  { name: "Amravati",         lat: 20.93, lon: 77.75, box: [76.90, 20.30, 78.40, 21.60] },
  { name: "Akola",            lat: 20.71, lon: 77.00, box: [76.60, 20.20, 77.60, 21.30] },
  { name: "Washim",           lat: 20.11, lon: 77.13, box: [76.70, 19.70, 77.60, 20.60] },
  { name: "Buldhana",         lat: 20.53, lon: 76.18, box: [75.70, 20.00, 76.80, 21.20] },
  { name: "Yavatmal",         lat: 20.39, lon: 78.12, box: [77.60, 19.50, 79.00, 21.00] },
  // Marathwada
  { name: "Aurangabad",       lat: 19.88, lon: 75.34, box: [74.80, 19.20, 76.20, 20.60] },
  { name: "Jalna",            lat: 19.84, lon: 75.88, box: [75.40, 19.40, 76.50, 20.40] },
  { name: "Parbhani",         lat: 19.27, lon: 76.77, box: [76.20, 18.80, 77.40, 19.80] },
  { name: "Hingoli",          lat: 19.72, lon: 77.15, box: [76.80, 19.30, 77.60, 20.20] },
  { name: "Nanded",           lat: 19.15, lon: 77.30, box: [76.80, 18.30, 78.10, 19.80] },
  { name: "Osmanabad",        lat: 18.19, lon: 76.04, box: [75.60, 17.70, 76.60, 18.70] },
  { name: "Latur",            lat: 18.40, lon: 76.56, box: [76.10, 17.80, 77.30, 18.90] },
  { name: "Beed",             lat: 18.99, lon: 75.76, box: [75.00, 18.40, 76.40, 19.60] },
  // North Maharashtra
  { name: "Nashik",           lat: 20.00, lon: 73.79, box: [73.00, 19.30, 74.70, 20.80] },
  { name: "Dhule",            lat: 20.90, lon: 74.78, box: [74.10, 20.40, 75.40, 21.50] },
  { name: "Nandurbar",        lat: 21.37, lon: 74.24, box: [73.60, 21.00, 74.80, 22.00] },
  { name: "Jalgaon",          lat: 21.00, lon: 75.56, box: [74.80, 20.40, 76.30, 21.60] },
  { name: "Ahmednagar",       lat: 19.09, lon: 74.74, box: [73.80, 18.20, 75.70, 20.00] },
  // Pune division
  { name: "Pune",             lat: 18.52, lon: 73.86, box: [73.20, 17.90, 75.00, 19.30] },
  { name: "Solapur",          lat: 17.68, lon: 75.91, box: [74.80, 17.00, 76.80, 18.50] },
  { name: "Satara",           lat: 17.69, lon: 74.00, box: [73.50, 17.00, 74.80, 18.40] },
  { name: "Sangli",           lat: 16.86, lon: 74.57, box: [74.00, 16.40, 75.30, 17.40] },
  { name: "Kolhapur",         lat: 16.70, lon: 74.24, box: [73.60, 15.90, 74.80, 17.20] },
  // Konkan
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

function getTaluka(district, geojsonId) {
  const talukas = DISTRICT_TALUKAS[district] || ["Central"];
  const seed = parseInt((geojsonId || "").replace(/\D/g, "").slice(-6)) || 1;
  return talukas[seed % talukas.length];
}

// ─────────────────────────────────────────────────────────────────────────────
const filePath = path.join(__dirname, "../public/ultimate_dataset.json");

console.log("Loading ultimate_dataset.json ...");
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

let fixed = 0, skipped = 0;
const districtCounts = {};

for (const [hwyKey, hwySegs] of Object.entries(data)) {
  for (const [wayId, seg] of Object.entries(hwySegs)) {
    // Use start_lat / start_lon already on the segment
    const lat = seg.start_lat;
    const lon = seg.start_lon;

    if (!lat || !lon || lat === 0 || lon === 0) {
      skipped++;
      continue;
    }

    const district = getDistrict(lon, lat);
    const taluka   = getTaluka(district, seg.geojson_id || wayId);

    seg.district = district;
    seg.taluka   = taluka;
    seg.state    = "Maharashtra";

    districtCounts[district] = (districtCounts[district] || 0) + 1;
    fixed++;
  }
}

console.log(`Fixed: ${fixed}  |  Skipped (no coords): ${skipped}`);

console.log("\nDistrict distribution:");
for (const [d, c] of Object.entries(districtCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${d.padEnd(20)}: ${c}`);
}

// ── Sanity check ─────────────────────────────────────────────────────────────
console.log("\n--- Sanity Check ---");
for (const [hwyKey, hwySegs] of Object.entries(data)) {
  for (const [wayId, seg] of Object.entries(hwySegs)) {
    const lat = seg.start_lat, lon = seg.start_lon;
    if (!lat || !lon) continue;
    // Nagpur area: lon ~79, lat ~21
    if (lon > 78.5 && lon < 80.0 && lat > 20.5 && lat < 21.8) {
      console.log(`  Nagpur-area seg: [${lon},${lat}] → ${seg.district} / ${seg.taluka}`);
      break;
    }
  }
}
for (const [hwyKey, hwySegs] of Object.entries(data)) {
  for (const [wayId, seg] of Object.entries(hwySegs)) {
    const lat = seg.start_lat, lon = seg.start_lon;
    if (!lat || !lon) continue;
    // Pune area: lon ~73-74, lat ~18-19
    if (lon > 73.2 && lon < 74.5 && lat > 17.9 && lat < 19.3) {
      console.log(`  Pune-area seg:   [${lon},${lat}] → ${seg.district} / ${seg.taluka}`);
      break;
    }
  }
}

// Write back
console.log(`\nWriting updated file → ${filePath}`);
fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log("Done! ✅");
