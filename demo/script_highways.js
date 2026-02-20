// Initialize the map
let map;
let allHighwaysData = {};
let dataLoaded = false;
let activeHighway = 'ALL';
let highwayLayers = {};

// Color mapping for road conditions
const roadConditionColors = {
    'good': '#22c55e',
    'average': '#eab308',
    'very_bad': '#ef4444',
    'default': '#9ca3af'
};

// Generate a consistent color for any highway name
function getHighwayColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return 'hsl(' + hue + ', 65%, 55%)';
}

// Highway display colors (auto-generated for all)
const highwayAccentColors = {};

// Hide loading screen
function hideLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }
}

// Initialize map when page loads
document.addEventListener('DOMContentLoaded', function () {
    console.log('Page loaded, initializing map...');

    // Create map centered on Maharashtra
    map = L.map('map').setView([18.5, 74.0], 8);

    // Dark theme tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB &copy; OpenStreetMap',
        maxZoom: 19
    }).addTo(map);

    console.log('Map initialized, loading highway data...');
    loadAllHighwaysData();
});

// Load the JSON data for all highways
function loadAllHighwaysData() {
    if (dataLoaded) return;

    fetch('all_highways_segments_conditions.json')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load all_highways_segments_conditions.json');
            return response.json();
        })
        .then(data => {
            allHighwaysData = data;
            dataLoaded = true;
            const nhKeys = Object.keys(allHighwaysData);
            console.log('Highways loaded:', nhKeys.length);

            // Generate accent colors for every highway
            nhKeys.forEach(nh => {
                highwayAccentColors[nh] = getHighwayColor(nh);
            });

            // Build highway selector buttons dynamically
            buildHighwaySelector(nhKeys);

            // Update stats
            updateStats('ALL');

            // Load GeoJSON and render
            loadHighwaysFromGeoJSON();
        })
        .catch(error => {
            console.error('Error loading highway data:', error);
            dataLoaded = true;
            loadHighwaysFromGeoJSON();
        });
}

// Load GeoJSON and render ALL highways
function loadHighwaysFromGeoJSON() {
    fetch('NH.geojson')
        .then(response => response.json())
        .then(geojsonData => {
            const validNHs = Object.keys(allHighwaysData);

            // Pre-index features by primary ref for fast lookup
            const featuresByRef = {};
            geojsonData.features.forEach(feature => {
                const ref = feature.properties.ref || '';
                if (!ref) return;
                const primary = ref.split(';')[0].trim();
                if (!featuresByRef[primary]) featuresByRef[primary] = [];
                featuresByRef[primary].push(feature);
            });

            validNHs.forEach(nh => {
                const nhData = allHighwaysData[nh] || {};
                const nhFeatures = featuresByRef[nh] || [];
                if (nhFeatures.length === 0) return;

                // Build a mini GeoJSON for this highway
                const miniGeoJSON = { type: 'FeatureCollection', features: nhFeatures };

                const layer = L.geoJSON(miniGeoJSON, {
                    style: function (feature) {
                        const featureId = feature.id;
                        let condition = 'default';

                        if (nhData[featureId]) {
                            condition = nhData[featureId].condition;
                        }

                        feature.properties.roadCondition = condition;
                        feature.properties.matchedNH = nh;
                        feature.properties.segmentNumber = nhData[featureId]?.segment_number || 'N/A';
                        feature.properties.segmentData = nhData[featureId] || null;

                        return {
                            color: roadConditionColors[condition],
                            weight: 6,
                            opacity: 0.85,
                            lineJoin: 'round',
                            lineCap: 'round'
                        };
                    },
                    onEachFeature: function (feature, layer) {
                        const ref = feature.properties.matchedNH || feature.properties.ref || 'Unknown';
                        const condition = feature.properties.roadCondition || 'unknown';
                        const segmentNum = feature.properties.segmentNumber;
                        const segData = feature.properties.segmentData;
                        const conditionColor = roadConditionColors[condition];

                        const conditionLabels = {
                            'good': 'Good',
                            'average': 'Average',
                            'very_bad': 'Poor',
                            'default': 'Unknown'
                        };

                        let detailRows = '';
                        let defectRows = '';
                        if (segData) {
                            const fields = [
                                ['District', segData.district],
                                ['Taluka', segData.taluka],
                                ['Surface', segData.surface_type],
                                ['Lanes', segData.lane_count],
                                ['Terrain', segData.terrain_type],
                                ['Jurisdiction', segData.jurisdiction],
                                ['Traffic', segData.avg_daily_traffic ? Number(segData.avg_daily_traffic).toLocaleString() + ' vehicles/day' : null],
                                ['Elevation', segData.elevation_m ? segData.elevation_m + ' m' : null],
                            ];
                            detailRows = fields
                                .filter(f => f[1] != null)
                                .map(f => '<tr><td style="color:#9ca3af;padding:2px 8px 2px 0;font-size:12px;">' + f[0] + '</td><td style="color:#e5e7eb;font-size:12px;font-weight:500;">' + f[1] + '</td></tr>')
                                .join('');

                            // Surface defect & roughness parameters
                            const defectFields = [
                                ['Potholes', segData.potholes_per_km, '/km'],
                                ['Pothole Depth', segData.pothole_avg_depth_cm, ' cm'],
                                ['Long. Cracks', segData.cracks_longitudinal_pct, '%'],
                                ['Trans. Cracks', segData.cracks_transverse_per_km, '/km'],
                                ['Alligator Crack', segData.alligator_cracking_pct, '%'],
                                ['Rutting', segData.rutting_depth_mm, ' mm'],
                                ['Raveling', segData.raveling_pct, '%'],
                                ['Edge Breaking', segData.edge_breaking_pct, '%'],
                                ['Patches', segData.patches_per_km, '/km'],
                                ['IRI', segData.iri_value, ' m/km'],
                                ['PCI Score', segData.pci_score, '/100'],
                            ];
                            defectRows = defectFields
                                .filter(f => f[1] != null)
                                .map(f => {
                                    let valColor = '#e5e7eb';
                                    // Color-code key metrics
                                    if (f[0] === 'PCI Score') {
                                        valColor = f[1] >= 70 ? '#22c55e' : f[1] >= 40 ? '#eab308' : '#ef4444';
                                    } else if (f[0] === 'IRI') {
                                        valColor = f[1] <= 2.5 ? '#22c55e' : f[1] <= 4.5 ? '#eab308' : '#ef4444';
                                    } else if (f[0] === 'Potholes') {
                                        valColor = f[1] <= 2 ? '#22c55e' : f[1] <= 10 ? '#eab308' : '#ef4444';
                                    }
                                    return '<tr><td style="color:#9ca3af;padding:2px 8px 2px 0;font-size:12px;">' + f[0] + '</td><td style="color:' + valColor + ';font-size:12px;font-weight:600;">' + f[1] + f[2] + '</td></tr>';
                                })
                                .join('');
                        }

                        const popupContent = 
                            '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;min-width:240px;background:#1f2937;color:white;padding:16px;border-radius:10px;margin:-14px -20px;">' +
                                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
                                    '<span style="background:' + (highwayAccentColors[ref] || '#6b7280') + ';padding:3px 10px;border-radius:4px;font-size:13px;font-weight:600;">' + ref + '</span>' +
                                    '<span style="font-size:13px;color:#9ca3af;">Segment #' + segmentNum + '</span>' +
                                '</div>' +
                                '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;padding:8px 12px;background:' + conditionColor + '22;border-radius:6px;border-left:3px solid ' + conditionColor + ';">' +
                                    '<span style="color:' + conditionColor + ';font-weight:600;font-size:14px;">' + conditionLabels[condition] + '</span>' +
                                '</div>' +
                                (detailRows ? '<table style="width:100%">' + detailRows + '</table>' : '') +
                                (defectRows ? '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #374151;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:6px;">Surface Defects & Roughness</div><table style="width:100%">' + defectRows + '</table></div>' : '') +
                                '<div style="margin-top:8px;font-size:10px;color:#6b7280;">ID: ' + feature.id + '</div>' +
                            '</div>';

                        layer.bindPopup(popupContent, {
                            className: 'dark-popup',
                            closeButton: true,
                            maxWidth: 300
                        });

                        layer.on('mouseover', function () {
                            this.setStyle({ weight: 10, opacity: 1 });
                        });

                        layer.on('mouseout', function () {
                            this.setStyle({ weight: 6, opacity: 0.85, color: roadConditionColors[condition] });
                        });
                    }
                });

                layer.addTo(map);
                highwayLayers[nh] = layer;
            });

            console.log('All highways rendered!');
            hideLoading();

            // Fit map to show all highways
            const allBounds = [];
            Object.values(highwayLayers).forEach(layer => {
                const bounds = layer.getBounds();
                if (bounds.isValid()) allBounds.push(bounds);
            });
            if (allBounds.length > 0) {
                let combinedBounds = allBounds[0];
                allBounds.forEach(b => combinedBounds.extend(b));
                map.fitBounds(combinedBounds, { padding: [60, 60] });
            }
        })
        .catch(error => {
            console.error('Error loading GeoJSON:', error);
            hideLoading();
        });
}

// Update statistics in sidebar
function updateStats(highway) {
    activeHighway = highway;
    let totalSegments = 0;
    let stats = { good: 0, average: 0, very_bad: 0 };

    const highways = highway === 'ALL' ? Object.keys(allHighwaysData) : [highway];

    highways.forEach(nh => {
        const nhData = allHighwaysData[nh] || {};
        Object.values(nhData).forEach(seg => {
            totalSegments++;
            stats[seg.condition] = (stats[seg.condition] || 0) + 1;
        });
    });

    // Update DOM
    document.getElementById('total-segments').textContent = totalSegments.toLocaleString();
    document.getElementById('good-count').textContent = stats.good.toLocaleString();
    document.getElementById('average-count').textContent = stats.average.toLocaleString();
    document.getElementById('bad-count').textContent = stats.very_bad.toLocaleString();

    // Update highway count
    const hwCountEl = document.getElementById('highway-count');
    if (hwCountEl) hwCountEl.textContent = highway === 'ALL' ? Object.keys(allHighwaysData).length : '1';

    // Update visibility
    Object.entries(highwayLayers).forEach(([nh, layer]) => {
        if (highway === 'ALL' || nh === highway) {
            if (!map.hasLayer(layer)) layer.addTo(map);
        } else {
            if (map.hasLayer(layer)) map.removeLayer(layer);
        }
    });

    // Fly to highway bounds
    if (highway !== 'ALL' && highwayLayers[highway]) {
        const bounds = highwayLayers[highway].getBounds();
        if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [60, 60], duration: 1.2 });
        }
    } else if (highway === 'ALL') {
        const allBounds = [];
        Object.values(highwayLayers).forEach(layer => {
            const bounds = layer.getBounds();
            if (bounds.isValid()) allBounds.push(bounds);
        });
        if (allBounds.length > 0) {
            let combinedBounds = allBounds[0];
            allBounds.forEach(b => combinedBounds.extend(b));
            map.flyToBounds(combinedBounds, { padding: [60, 60], duration: 1.2 });
        }
    }

    // Update active button
    document.querySelectorAll('.hw-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.nh === highway) btn.classList.add('active');
    });
}

// Build searchable segments list
function buildSearchIndex() {
    const segments = [];
    Object.entries(allHighwaysData).forEach(([nh, nhData]) => {
        Object.entries(nhData).forEach(([id, data]) => {
            segments.push({
                id: id,
                nh: nh,
                segmentNumber: data.segment_number,
                condition: data.condition,
                coordinates: data.coordinates,
                district: data.district,
                taluka: data.taluka
            });
        });
    });
    return segments;
}

// Build highway selector buttons dynamically
function buildHighwaySelector(nhKeys) {
    const container = document.getElementById('hw-selector-container');
    if (!container) return;

    // Sort: put the 4 real-data highways first, then rest alphabetically
    const priority = ['NH48', 'NH60', 'NH65', 'NH160'];
    const prioritySet = new Set(priority);
    const others = nhKeys.filter(k => !prioritySet.has(k)).sort();
    const sorted = priority.concat(others);

    container.innerHTML = '';

    // "All" button
    var allBtn = document.createElement('button');
    allBtn.className = 'hw-btn active';
    allBtn.dataset.nh = 'ALL';
    allBtn.textContent = 'All (' + nhKeys.length + ')';
    allBtn.onclick = function() { updateStats('ALL'); };
    container.appendChild(allBtn);

    sorted.forEach(function(nh) {
        if (!allHighwaysData[nh]) return;
        var btn = document.createElement('button');
        btn.className = 'hw-btn';
        btn.dataset.nh = nh;
        btn.textContent = nh;
        btn.onclick = function() { updateStats(nh); };
        container.appendChild(btn);
    });
}
