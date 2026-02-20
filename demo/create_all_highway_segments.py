import pandas as pd
import json
import random
import math

random.seed(42)

# ── Highways with REAL maha.xlsx data ──
MAHA_HIGHWAYS = ['NH48', 'NH60', 'NH65', 'NH160']

# Read the NH.geojson file
print("Reading NH.geojson...")
with open('NH.geojson', 'r', encoding='utf-8') as f:
    geojson_data = json.load(f)
print(f"Total features in GeoJSON: {len(geojson_data['features'])}")

# Read the maha.xlsx file
print("Reading maha.xlsx...")
maha_df = pd.read_excel('maha.xlsx')
maha_df = maha_df[maha_df['nh_number'].isin(MAHA_HIGHWAYS)].reset_index(drop=True)
print(f"maha.xlsx rows (after filtering SH roads): {len(maha_df)}")

# ── Collect ALL highway refs from GeoJSON ──
# For compound refs like "NH48;NH166", assign to PRIMARY (first) ref
highway_features = {}
for feature in geojson_data['features']:
    ref = feature['properties'].get('ref', '')
    if not ref:
        continue
    primary_ref = ref.split(';')[0].strip()
    if primary_ref not in highway_features:
        highway_features[primary_ref] = []
    highway_features[primary_ref].append(feature)

all_highway_names = sorted(highway_features.keys())
print(f"\nFound {len(all_highway_names)} unique primary highway refs in GeoJSON")
total_features = sum(len(f) for f in highway_features.values())
print(f"Total features across all highways: {total_features}")

# ── Build lookup from maha.xlsx per highway ──
maha_by_nh = {}
for nh in MAHA_HIGHWAYS:
    maha_by_nh[nh] = maha_df[maha_df['nh_number'] == nh].reset_index(drop=True)

# ── Gather all real districts/talukas for synthetic pool ──
all_districts = maha_df['district'].dropna().unique().tolist()
all_talukas = maha_df['taluka'].dropna().unique().tolist()

districts_by_nh = {}
talukas_by_nh = {}
for nh in MAHA_HIGHWAYS:
    sub = maha_by_nh[nh]
    districts_by_nh[nh] = sub['district'].dropna().tolist()
    talukas_by_nh[nh] = sub['taluka'].dropna().tolist()

jurisdictions = ['State PWD', 'NHAI', 'Municipality', 'PMGSY']
categories = ['Inter-State', 'State', 'Urban', 'National']
surface_types = ['earthen', 'gravel', 'bitumen', 'concrete']
statuses = ['active', 'under_construction']
region_types = ['coastal', 'urban_corridor', 'plateau', 'ghat', 'plain']
terrain_types = ['hilly', 'plain', 'steep']
slope_categories = ['moderate', 'flat', 'steep']
rainfall_categories = ['high', 'medium', 'low']

maha_columns = [
    'road_id', 'name', 'segment_start_km', 'segment_end_km',
    'jurisdiction', 'category', 'length_km', 'lane_count', 'surface_type',
    'year_constructed', 'last_major_rehab_year', 'status',
    'state', 'district', 'taluka', 'region_type', 'terrain_type',
    'slope_category', 'monsoon_rainfall_category',
    'landslide_prone', 'flood_prone', 'ghat_section_flag', 'tourism_route_flag',
    'elevation_m', 'avg_daily_traffic', 'truck_percentage',
    'peak_hour_traffic', 'traffic_weight', 'seasonal_variation'
]

# ── Surface Defect + Roughness columns (NEW) ──
surface_defect_columns = [
    'potholes_per_km',           # count per km
    'pothole_avg_depth_cm',      # cm
    'cracks_longitudinal_pct',   # % of surface
    'cracks_transverse_per_km',  # count per km
    'alligator_cracking_pct',    # % of surface
    'rutting_depth_mm',          # mm
    'raveling_pct',              # % of surface loss
    'edge_breaking_pct',         # % of edge
    'patches_per_km',            # count per km
    'iri_value',                 # International Roughness Index (m/km)
    'pci_score',                 # Pavement Condition Index (0-100)
]

# Ranges per condition: (min, max) for each parameter
DEFECT_RANGES = {
    'good': {
        'potholes_per_km':         (0, 2),
        'pothole_avg_depth_cm':    (0.0, 2.0),
        'cracks_longitudinal_pct': (0.0, 5.0),
        'cracks_transverse_per_km':(0, 3),
        'alligator_cracking_pct':  (0.0, 1.0),
        'rutting_depth_mm':        (0.0, 5.0),
        'raveling_pct':            (0.0, 5.0),
        'edge_breaking_pct':       (0.0, 5.0),
        'patches_per_km':          (0, 2),
        'iri_value':               (1.5, 2.5),
        'pci_score':               (70, 100),
    },
    'average': {
        'potholes_per_km':         (3, 10),
        'pothole_avg_depth_cm':    (2.0, 5.0),
        'cracks_longitudinal_pct': (5.0, 20.0),
        'cracks_transverse_per_km':(3, 10),
        'alligator_cracking_pct':  (1.0, 10.0),
        'rutting_depth_mm':        (5.0, 15.0),
        'raveling_pct':            (5.0, 15.0),
        'edge_breaking_pct':       (5.0, 20.0),
        'patches_per_km':          (3, 8),
        'iri_value':               (2.5, 4.5),
        'pci_score':               (40, 69),
    },
    'very_bad': {
        'potholes_per_km':         (11, 30),
        'pothole_avg_depth_cm':    (5.0, 15.0),
        'cracks_longitudinal_pct': (20.0, 60.0),
        'cracks_transverse_per_km':(10, 25),
        'alligator_cracking_pct':  (10.0, 40.0),
        'rutting_depth_mm':        (15.0, 40.0),
        'raveling_pct':            (15.0, 45.0),
        'edge_breaking_pct':       (20.0, 50.0),
        'patches_per_km':          (8, 20),
        'iri_value':               (4.5, 10.0),
        'pci_score':               (0, 39),
    },
}


def generate_surface_defect_data(condition):
    """Generate surface defect and roughness values based on road condition."""
    ranges = DEFECT_RANGES[condition]
    data = {}
    for col in surface_defect_columns:
        lo, hi = ranges[col]
        if isinstance(lo, int) and isinstance(hi, int):
            data[col] = random.randint(lo, hi)
        else:
            data[col] = round(random.uniform(lo, hi), 1)
    return data


def generate_synthetic_maha_row(nh, seg_idx):
    """Generate realistic synthetic data matching maha.xlsx structure."""
    seg_start = round(random.uniform(0.1, 199.8), 1)
    seg_length = round(random.uniform(5.0, 25.0), 1)
    year_built = random.randint(1998, 2022)
    has_rehab = random.random() > 0.4
    lane = random.choice([2, 2, 4, 4, 6])
    terrain = random.choice(terrain_types)
    is_ghat = terrain == 'steep' or random.random() < 0.3
    is_hilly = terrain in ['hilly', 'steep']

    months = {}
    for m in range(1, 13):
        months[f"M{m}"] = round(random.uniform(0.75, 1.25), 2)

    district_pool = districts_by_nh.get(nh, all_districts)
    taluka_pool = talukas_by_nh.get(nh, all_talukas)

    return {
        'road_id': f"MA-{nh}-SEG-{seg_idx:04d}",
        'name': f"{nh} Segment {seg_idx}",
        'segment_start_km': seg_start,
        'segment_end_km': round(seg_start + seg_length, 1),
        'jurisdiction': random.choice(jurisdictions),
        'category': random.choice(categories),
        'length_km': seg_length,
        'lane_count': lane,
        'surface_type': random.choice(surface_types),
        'year_constructed': year_built,
        'last_major_rehab_year': random.randint(2008, 2023) if has_rehab else None,
        'status': random.choices(statuses, weights=[0.85, 0.15])[0],
        'state': 'Maharashtra',
        'district': random.choice(district_pool),
        'taluka': random.choice(taluka_pool),
        'region_type': random.choice(region_types),
        'terrain_type': terrain,
        'slope_category': 'steep' if terrain == 'steep' else random.choice(slope_categories),
        'monsoon_rainfall_category': random.choice(rainfall_categories),
        'landslide_prone': is_hilly and random.random() < 0.45,
        'flood_prone': not is_hilly and random.random() < 0.2,
        'ghat_section_flag': is_ghat,
        'tourism_route_flag': random.random() < 0.45,
        'elevation_m': round(random.uniform(0.8, 1189.1), 1),
        'avg_daily_traffic': random.randint(2007, 29389),
        'truck_percentage': round(random.uniform(10.1, 45.0), 1),
        'peak_hour_traffic': random.randint(132, 3368),
        'traffic_weight': round(random.choice([0.5, 1.0, 1.5, 2.0]), 1),
        'seasonal_variation': json.dumps(months),
    }


# ── Process ALL highways ──
all_road_segments = []
highway_stats = {}

print(f"\nProcessing {len(all_highway_names)} highways...\n")

for nh in all_highway_names:
    features = highway_features[nh]
    maha_rows = maha_by_nh.get(nh)
    has_real_data = maha_rows is not None and len(maha_rows) > 0
    num_maha = len(maha_rows) if has_real_data else 0

    segment_conditions = {'good': 0, 'average': 0, 'very_bad': 0}
    used_real = 0
    used_synthetic = 0

    for idx, feature in enumerate(features):
        feature_id = feature.get('id', f'{nh}_segment_{idx}')

        condition = random.choice(['good', 'average', 'very_bad'])
        segment_conditions[condition] += 1

        coords = feature['geometry']['coordinates']
        start_coord = coords[0] if coords else [0, 0]
        end_coord = coords[-1] if coords else [0, 0]

        segment_data = {
            'geojson_id': feature_id,
            'highway_ref': nh,
            'segment_number': idx + 1,
            'condition': condition,
            'start_lat': start_coord[1] if len(start_coord) > 1 else 0,
            'start_lon': start_coord[0] if len(start_coord) > 0 else 0,
            'end_lat': end_coord[1] if len(end_coord) > 1 else 0,
            'end_lon': end_coord[0] if len(end_coord) > 0 else 0,
            'highway_type': feature['properties'].get('highway', 'N/A'),
            'oneway': feature['properties'].get('oneway', 'no'),
            'lanes': feature['properties'].get('lanes', 'N/A'),
            'maxspeed': feature['properties'].get('maxspeed', 'N/A'),
        }

        if has_real_data and idx < num_maha:
            maha_row = maha_rows.iloc[idx]
            used_real += 1
            for col in maha_columns:
                val = maha_row[col]
                if isinstance(val, float) and math.isnan(val):
                    segment_data[col] = None
                elif isinstance(val, bool):
                    segment_data[col] = bool(val)
                else:
                    segment_data[col] = val
        else:
            used_synthetic += 1
            synthetic = generate_synthetic_maha_row(nh, idx + 1)
            for col in maha_columns:
                segment_data[col] = synthetic[col]

        # ── Add surface defect + roughness parameters ──
        defect_data = generate_surface_defect_data(condition)
        for col in surface_defect_columns:
            segment_data[col] = defect_data[col]

        all_road_segments.append(segment_data)

    highway_stats[nh] = {
        'total_segments': len(features),
        'conditions': segment_conditions,
        'real_maha_rows': used_real,
        'synthetic_rows': used_synthetic
    }

    tag = f" (real: {used_real}, synth: {used_synthetic})" if has_real_data else ""
    print(f"  {nh}: {len(features)} segments{tag}")

# ── Create DataFrame ──
df = pd.DataFrame(all_road_segments)

# Save CSV
output_file = 'all_highways_segments_conditions.csv'
df.to_csv(output_file, index=False)
print(f"\n--- Output ---")
print(f"CSV: {output_file}")
print(f"  Segments: {len(df)} | Columns: {len(df.columns)}")

# Save JSON (organized by highway ref)
json_mapping = {}
for nh in all_highway_names:
    highway_data = df[df['highway_ref'] == nh]
    json_mapping[nh] = {}

    for _, row in highway_data.iterrows():
        entry = {
            'segment_number': int(row['segment_number']),
            'condition': row['condition'],
            'coordinates': [[row['start_lon'], row['start_lat']], [row['end_lon'], row['end_lat']]],
        }
        for col in maha_columns + surface_defect_columns:
            val = row.get(col)
            if val is None or (isinstance(val, float) and math.isnan(val)):
                entry[col] = None
            elif isinstance(val, bool):
                entry[col] = bool(val)
            elif isinstance(val, (int, float)):
                try:
                    entry[col] = val if not math.isnan(val) else None
                except TypeError:
                    entry[col] = val
            else:
                entry[col] = str(val)
        json_mapping[nh][str(row['geojson_id'])] = entry

json_output_file = 'all_highways_segments_conditions.json'
with open(json_output_file, 'w', encoding='utf-8') as f:
    json.dump(json_mapping, f, indent=2, ensure_ascii=False)
print(f"JSON: {json_output_file}")

# Summary CSV
summary_stats = []
for nh, stats in highway_stats.items():
    total = stats['total_segments']
    if total == 0:
        continue
    summary_stats.append({
        'highway': nh,
        'total_segments': total,
        'good_condition': stats['conditions']['good'],
        'average_condition': stats['conditions']['average'],
        'poor_condition': stats['conditions']['very_bad'],
        'good_pct': round(stats['conditions']['good'] / total * 100, 1),
        'average_pct': round(stats['conditions']['average'] / total * 100, 1),
        'poor_pct': round(stats['conditions']['very_bad'] / total * 100, 1),
        'real_maha_rows': stats['real_maha_rows'],
        'synthetic_rows': stats['synthetic_rows']
    })

summary_df = pd.DataFrame(summary_stats).sort_values('total_segments', ascending=False)
summary_df.to_csv('highway_statistics_summary.csv', index=False)
print(f"Summary: highway_statistics_summary.csv")

# Final report
total_real = sum(s['real_maha_rows'] for s in highway_stats.values())
total_synth = sum(s['synthetic_rows'] for s in highway_stats.values())
print(f"\n--- Final Report ---")
print(f"Total highways: {len(all_highway_names)}")
print(f"Total segments: {len(df)}")
print(f"  Real maha.xlsx data: {total_real}")
print(f"  Synthetic data: {total_synth}")
print(f"Columns per segment: {len(df.columns)}")

print(f"\nTop 15 highways by segment count:")
for _, row in summary_df.head(15).iterrows():
    real = row['real_maha_rows']
    label = f" [has real data]" if real > 0 else ""
    print(f"  {row['highway']}: {row['total_segments']} segments{label}")

print("\nDone!")
