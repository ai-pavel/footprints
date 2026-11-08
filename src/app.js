// --- DATA (loaded from data.json) ---
let travelData, flightData, aviationIcons;

d3.json("data/data.json").then((data) => {
    travelData = { travels: data.travels };
    flightData = data.flightData;
    aviationIcons = data.aviationIcons;

    // --- HELPERS ---
    // Custom Flag Mapper
    const iso3toFlag = {
        // Standard
        "HKG": "🇭🇰", "MAC": "🇲🇴", "QAT": "🇶🇦", "ARG": "🇦🇷", "SRB": "🇷🇸", "TUR": "🇹🇷", "CHN": "🇨🇳",
        "USA": "🇺🇸", "SYC": "🇸🇨", "GEO": "🇬🇪", "ITA": "🇮🇹", "JOR": "🇯🇴", "EGY": "🇪🇬", "MUS": "🇲🇺", 
        "MAR": "🇲🇦", "MDV": "🇲🇻", "ESP": "🇪🇸", "FRA": "🇫🇷", "MCO": "🇲🇨", "IRL": "🇮🇪", "ARE": "🇦🇪", 
        "RUS": "🇷🇺", "CYP": "🇨🇾", "NLD": "🇳🇱", "GRC": "🇬🇷", "DEU": "🇩🇪", "BEL": "🇧🇪", "PSE": "🇵🇸", 
        "ISR": "🇮🇱", "BHR": "🇧🇭", "FIN": "🇫🇮", "CZE": "🇨🇿", "NOR": "🇳🇴", "DNK": "🇩🇰", "UKR": "🇺🇦", 
        "KOR": "🇰🇷", "CHE": "🇨🇭", "LTU": "🇱🇹", "MLT": "🇲🇹",
        // UK Subdivisions
        "ENG": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "SCT": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "WLS": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "NIR": "🇬🇧", "GBR": "🇬🇧",
        // Special
        "NCY": "🏴‍☠️"
    };

    function getFlag(code) {
        return iso3toFlag[code] || "🏳️";
    }

    const companionTypes = {
        "solo":    { emoji: "👤", label: "Solo" },
        "partner": { emoji: "👥", label: "Couple" },
        "family":  { emoji: "👨‍👩‍👧", label: "Family" }
    };

    function getCompanion(type) {
        return companionTypes[type] || companionTypes["solo"];
    }

    const continentTotals = {
        "Europe": 44, "Asia": 48, "Africa": 54,
        "North America": 23, "South America": 12, "Oceania": 14
    };

    // --- GLOBAL VARS ---
    let svg, g, zoom, width, height, projection, pathGenerator;
    let loadedFeatures = null;
    let sortedTravels = [];
    let timelineSteps = []; // Stores unique YYYY-MM strings
    let playInterval = null;
    let currentFilterDate = new Date(); // Defaults to now
    let currentCompanionFilter = "all"; // Companion filter: "all" | "solo" | "partner" | "family"

    function initMap() {
        const container = document.getElementById('map-container');
        width = container.clientWidth;
        height = container.clientHeight;

        svg = d3.select("#map-container").append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("preserveAspectRatio", "xMidYMid slice");
            
        g = svg.append("g");
        
        g.append("g").attr("id", "country-layer"); // Layer 1
        g.append("g").attr("id", "dot-layer");     // Layer 2
        g.append("g").attr("id", "aviation-layer").style("display", "none"); // Layer 3

        // Setup Zoom
        zoom = d3.zoom().scaleExtent([1, 15])
            .translateExtent([[-100, -100], [width + 100, height + 100]])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
                g.selectAll("path").style("stroke-width", 0.5 / event.transform.k + "px");
                
                zoomCircles(g, event.transform.k);
            });

        svg.call(zoom);

        // Load Data
        const worldUrl = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
        d3.json(worldUrl).then((worldData) => {
            loadedFeatures = processWorldData(worldData);
            processTravelData();
            initTimeline(); 
            updateProjection();
            renderStats();
            zoomCircles(g, 1);
        });
    }

    function zoomCircles(g, coeffient) {
        const baseRadius = 5;

        g.selectAll("circle")
            .attr("r", baseRadius / coeffient)
            .style("stroke-width", (1 / coeffient) + "px");

        g.selectAll("text.aviation-icon")
            .style("font-size", (14 / coeffient) + "px")
            .attr("dy", (-12 / coeffient));
    }
    
    // --- TIMELINE LOGIC ---
    function initTimeline() {
        const dateSet = new Set();
        const now = new Date();
        const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        // Always include "Now" so the slider can reach the end
        dateSet.add(currentYM);

        travelData.travels.forEach(t => {
            if (t.exclude_from_stats) return; // Skip Birth Place
            t.visits.forEach(v => {
                if (v.date) {
                    // Extract YYYY-MM
                    const ym = v.date.substring(0, 7);
                    dateSet.add(ym);
                }
            });
        });

        // Convert to array and sort chronologically
        timelineSteps = Array.from(dateSet).sort();
        
        // Add one month prior to start to animate the first appearance
        if (timelineSteps.length > 0) {
            const firstYM = timelineSteps[0];
            const [y, m] = firstYM.split('-').map(Number);
            const prevDate = new Date(y, m - 2); // m is 1-based, JS Date month is 0-based. So m-1 is current, m-2 is prev.
            const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
            timelineSteps.unshift(prevYM);
        }
        
        const slider = document.getElementById("time-slider");
        slider.min = 0;
        slider.max = timelineSteps.length - 1;
        slider.value = timelineSteps.length - 1; // Default to end
        
        // Initial set
        handleSliderChange();
    }

    function handleSliderChange() {
        const sliderVal = parseInt(document.getElementById("time-slider").value);
        const ymStr = timelineSteps[sliderVal];
        
        // Set filter date to end of that month to include trips IN that month
        const [year, month] = ymStr.split('-').map(Number);
        const newDate = new Date(year, month, 0); // Last day of month
        
        currentFilterDate = newDate;
        zoomCircles(g, 1);
        updateTimelineLabel(newDate); // Pass the date object for formatting
        updateProjection();
    }

    function updateTimelineLabel(date) {
        const options = { year: 'numeric', month: 'long' };
        document.getElementById("current-date-label").textContent = date.toLocaleDateString('en-US', options);
    }

    function togglePlay() {
        const btn = document.getElementById("play-pause-btn");
        const slider = document.getElementById("time-slider");
        
        if (playInterval) {
            // Pause
            clearInterval(playInterval);
            playInterval = null;
            btn.textContent = "▶";
        } else {
            // Play
            btn.textContent = "⏸";
            
            // If already at end, restart
            if (parseInt(slider.value) >= parseInt(slider.max)) {
                slider.value = 0;
            }

            playInterval = setInterval(() => {
                let val = parseInt(slider.value);
                if (val < slider.max) {
                    slider.value = val + 1;
                    handleSliderChange();
                } else {
                    clearInterval(playInterval);
                    playInterval = null;
                    btn.textContent = "▶";
                }
            }, 600); // Slower speed so jumps are visible (600ms)
        }
    }

    // --- MAP LOGIC ---

    function processWorldData(worldData) {
        const france = worldData.features.find(f => f.id === "FRA");
        const guianaFeatures = [];

        if (france && france.geometry.type === "MultiPolygon") {
            const franceCoords = [];
            const guianaCoords = [];

            france.geometry.coordinates.forEach(polygon => {
                const [lon, lat] = polygon[0][0];
                if (lat < 10 && lon < -40) guianaCoords.push(polygon);
                else franceCoords.push(polygon);
            });

            france.geometry.coordinates = franceCoords; 

            if (guianaCoords.length > 0) {
                guianaFeatures.push({
                    type: "Feature",
                    id: "GUF",
                    properties: { name: "French Guiana" },
                    geometry: { type: "MultiPolygon", coordinates: guianaCoords }
                });
            }
        }
        return [...worldData.features, ...guianaFeatures];
    }

    function processTravelData() {
        const cityGroups = {};
        travelData.travels.forEach(t => {
            if(!t.coordinates) return;
            const key = `${t.city}|${t.country_name}`;
            
            if (!cityGroups[key]) {
                cityGroups[key] = { ...t, visits: [] };
            }
            
            t.visits.forEach(v => {
                cityGroups[key].visits.push({
                    ...v, type: t.type, code: t.country_code, badge_label: t.badge_label, companion: t.companion
                });
            });

            const priorities = { 'residence': 3, 'trip': 2, 'layover': 1 };
            const currentPriority = priorities[cityGroups[key].type] || 0;
            const newPriority = priorities[t.type] || 0;
            if (newPriority > currentPriority) cityGroups[key].type = t.type;
        });

        sortedTravels = Object.values(cityGroups).sort((a, b) => {
            if (a.type === 'residence') return 1;
            if (b.type === 'residence') return -1;
            return 0;
        });
    }

    // --- PROJECTION SWITCHER & RENDERER ---
    function updateProjection() {
        if (!loadedFeatures) return;

        const type = document.getElementById("projection-select").value;

        if (type === 'mercator') {
            projection = d3.geoMercator()
                .scale(width / 6.5)
                .translate([width / 2, height / 1.5]); 
        } else if (type === 'flat') {
            projection = d3.geoAzimuthalEquidistant()
                .scale(width / 6.5)
                .translate([width / 2, height / 2])
                .rotate([0, -90]) 
        } else {
            projection = d3.geoNaturalEarth1()
                .scale(width / 5.5)
                .translate([width / 2, height / 2]);
        }

        pathGenerator = d3.geoPath().projection(projection);

        // FILTER DATA BASED ON TIMELINE
        const limitDateStr = currentFilterDate.toISOString().split('T')[0];
        const companionFilter = currentCompanionFilter;
        const companionActive = companionFilter !== "all";

        // 1. Filter Dots
        const activeTravels = sortedTravels.filter(t => {
            // Check if any visit in this city happened before limitDate
            return t.visits.some(v => v.date <= limitDateStr);
        }).filter(t => !companionActive || t.companion === companionFilter);

        // 2. Determine Active Country Codes
        const activeCountryCodes = new Set();
        const countryTypeMap = new Map(); // Store best type (residence > trip) per country
        const priorities = { 'residence': 3, 'trip': 2, 'layover': 1, 'none': 0 };

        travelData.travels.forEach(t => {
            // Skip if companion filter active and this entry doesn't match
            if (companionActive && t.companion !== companionFilter) return;
            // Check visits for this country entry
            const hasPastVisit = t.visits.some(v => v.date <= limitDateStr);
            if (hasPastVisit) {
                activeCountryCodes.add(t.country_code);
                
                // Determine priority type
                const currentBest = countryTypeMap.get(t.country_code) || 'none';
                if ((priorities[t.type] || 0) > (priorities[currentBest] || 0)) {
                    countryTypeMap.set(t.country_code, t.type);
                }

                // UK Logic
                if (['ENG','SCT','WLS','NIR'].includes(t.country_code)) {
                    activeCountryCodes.add('GBR');
                    const currentGBR = countryTypeMap.get('GBR') || 'none';
                    // If the specific UK country type (e.g., residence) is higher priority than what GBR currently is, upgrade GBR.
                    if ((priorities[t.type] || 0) > (priorities[currentGBR] || 0)) {
                        countryTypeMap.set('GBR', t.type);
                    }
                }
            }
        });

        // Helper for Country Class
        const getDynamicClass = (d) => {
            if (!activeCountryCodes.has(d.id)) return "country";
            const type = countryTypeMap.get(d.id);
            if (type === 'residence') return "country residence";
            if (type === 'trip') return "country visited";
            if (type === 'layover') return "country layover";
            return "country";
        };

        // Update Paths (Countries)
        const countrySelection = g.select("#country-layer").selectAll("path")
            .data(loadedFeatures, d => d.id || d.properties.name);

        countrySelection.join(
            enter => enter.append("path")
                .attr("class", d => getDynamicClass(d))
                .attr("d", pathGenerator)
                .on("mouseover", (e, d) => showTooltip(e, d.properties.name))
                .on("mouseout", hideTooltip)
                .on("click", handleCountryClick),
            update => update
                .attr("class", d => getDynamicClass(d)) // Update class based on time
                .transition().duration(200).attr("d", pathGenerator) // Smoother transition for play mode
        );

        // Update Dots
        const dotSelection = g.select("#dot-layer").selectAll("circle")
            .data(activeTravels, d => `${d.city}-${d.country_name}`); // Key function for stability

        dotSelection.join(
            enter => enter.append("circle")
                .attr("class", d => `location-dot dot-${d.type === 'residence' ? 'residence' : d.type === 'layover' ? 'layover' : 'visit'}`)
                .attr("r", 0) // Animate in from 0
                .attr("cx", d => projection(d.coordinates)[0])
                .attr("cy", d => projection(d.coordinates)[1])
                .on("mouseover", (e, d) => showTooltip(e, `${d.city}, ${d.country_name}`))
                .on("mouseout", hideTooltip)
                .on("click", handleDotClick)
                .call(enter => enter.transition().duration(500).attr("r", 5)),
            update => update.transition().duration(200)
                .attr("cx", d => projection(d.coordinates)[0])
                .attr("cy", d => projection(d.coordinates)[1]),
            exit => exit.transition().duration(200).attr("r", 0).remove()
        );

        renderAviation();
    }

    // --- AVIATION LAYER ---
    function renderAviation() {
        if (!projection) return;
        const layer = g.select("#aviation-layer");

        const items = [];
        flightData.forEach(f => {
            const label = f.types.map(t => aviationIcons[t.mode]).join('');
            items.push({ ...f, label });
        });

        const sel = layer.selectAll("text.aviation-icon")
            .data(items, d => d.city);

        sel.join(
            enter => enter.append("text")
                .attr("class", "aviation-icon")
                .attr("x", d => projection(d.coordinates)[0])
                .attr("y", d => projection(d.coordinates)[1])
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "central")
                .attr("dy", "-12")
                .style("font-size", "14px")
                .style("pointer-events", "all")
                .style("cursor", "pointer")
                .text(d => d.label)
                .on("mouseover", (e, d) => {
                    const details = d.types.map(t => {
                        const dt = new Date(t.date + 'T00:00:00');
                        const dateStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                        return `${t.mode === 'heli' ? 'Helicopter' : 'Plane'} (${dateStr})`;
                    }).join(', ');
                    showTooltip(e, `${d.city} — ${details}`);
                })
                .on("mouseout", hideTooltip),
            update => update
                .attr("x", d => projection(d.coordinates)[0])
                .attr("y", d => projection(d.coordinates)[1])
        );
    }

    function toggleAviation() {
        const visible = document.getElementById('aviation-toggle').checked;
        g.select("#aviation-layer").style("display", visible ? null : "none");
        if (visible) renderAviation();
    }

    function changeCompanionFilter() {
        currentCompanionFilter = document.getElementById("companion-filter").value;
        updateProjection();
    }

    function toggleControls() {
        const body = document.getElementById("controls-body");
        const header = document.getElementById("controls-trigger");
        body.classList.toggle("open");
        header.classList.toggle("open");
    }

    // --- CLICK HANDLERS ---
    function handleCountryClick(e, d) {
        const countryCode = d.id;
        let relevantTravels = [];
        let overrideTitle = null;
        let overrideCode = null;

        if (countryCode === 'GBR') {
            relevantTravels = travelData.travels.filter(t => ['ENG','SCT','WLS','NIR','GBR'].includes(t.country_code));
            overrideTitle = "Great Britain";
            overrideCode = "GBR";
        } else {
            relevantTravels = travelData.travels.filter(t => t.country_code === countryCode);
        }
        
        if (relevantTravels.length > 0) {
            const aggregatedVisits = [];
            relevantTravels.forEach(t => {
                t.visits.forEach(v => {
                    aggregatedVisits.push({
                        ...v, city: t.city, country: t.country_name, code: t.country_code,
                        type: t.type, custom_date_label: t.custom_date_label, badge_label: t.badge_label,
                        companion: t.companion, approximate: v.approximate
                    });
                });
            });
            aggregatedVisits.sort((a, b) => new Date(b.date) - new Date(a.date));
            openSidebar({ 
                type: 'country_aggregation', 
                country_name: overrideTitle || relevantTravels[0].country_name, 
                country_code: overrideCode,
                visits: aggregatedVisits 
            });
            e.stopPropagation();
        }
    }

    function handleDotClick(e, d) {
        d.visits.sort((a, b) => new Date(b.date) - new Date(a.date));
        openSidebar({ ...d, visits: d.visits.map(v => ({...v, city: d.city, country: d.country_name, code: d.country_code || d.code, type: v.type, custom_date_label: d.custom_date_label, badge_label: d.badge_label }))});
        e.stopPropagation();
    }

    window.addEventListener('resize', () => { d3.select("svg").remove(); initMap(); });
    initMap();

    // --- UI ---
    const tooltip = document.getElementById('tooltip');
    function showTooltip(event, text) {
        if(!text) return;
        tooltip.textContent = text;
        tooltip.style.opacity = 1;
        tooltip.style.left = (event.pageX + 10) + 'px';
        tooltip.style.top = (event.pageY - 20) + 'px';
    }
    function hideTooltip() { tooltip.style.opacity = 0; }
    
    function openSidebar(data) {
        const sb = document.getElementById('sidebar');
        const title = document.getElementById('sidebar-title');
        const body = document.getElementById('sidebar-body');
        
        const countryName = data.country_name || data.country; 
        const titleText = data.type === 'country_aggregation' ? countryName : `${data.city}, ${countryName}`;
        
        const code = data.country_code || (data.visits && data.visits[0] ? data.visits[0].code : null);
        
        title.textContent = `${getFlag(code)} ${titleText}`;
        sb.classList.add('open');
        
        let html = '';
        data.visits.forEach(v => {
            const badgeClass = v.type; 
            const badgeLabel = v.badge_label || (v.type.charAt(0).toUpperCase() + v.type.slice(1));
            const cityHtml = data.type === 'country_aggregation' ? `<span class="city-label">${v.city}</span>` : '';
            
            let dateDisplay = v.custom_date_label 
                ? v.custom_date_label 
                : `${v.date} ${v.end_date ? '- ' + v.end_date : ''}`;

            if (v.approximate) {
                dateDisplay += ' <span title="Approximate" style="cursor:help; font-size:0.8em; opacity:0.7">❓</span>';
            }

            const comp = getCompanion(v.companion);
            html += `
                <div class="visit-card">
                    ${cityHtml}
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;">
                        <strong>${dateDisplay}</strong>
                        <span class="badge ${badgeClass}">${badgeLabel}</span>
                    </div>
                    <div style="font-size:0.85rem; color:var(--text-light);">${comp.emoji} ${comp.label}</div>
                </div>
            `;
        });
        body.innerHTML = html;
        document.getElementById('stats-overlay').classList.remove('visible');
    }
    
    function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); }
    function toggleStatsPanel() { document.getElementById('stats-overlay').classList.toggle('visible'); closeSidebar(); }
    d3.select("#map-container").on("click", () => { closeSidebar(); document.getElementById('stats-overlay').classList.remove('visible'); });

    // Set initial theme based on system preference
    (function() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.setAttribute('data-theme', 'dark');
            document.getElementById('theme-toggle-icon').textContent = '🌞';
        }
    })();

    function toggleTheme() {
        const body = document.body;
        const isDark = body.getAttribute('data-theme') === 'dark';
        body.setAttribute('data-theme', isDark ? 'light' : 'dark');

        // Update Icon
        const icon = document.getElementById('theme-toggle-icon');
        // If it was dark (isDark is true), we are now light -> Show Moon (to toggle back to dark)
        // If it was light (isDark is false), we are now dark -> Show Sun (to toggle back to light)
        icon.textContent = isDark ? '🌚' : '🌞';
    }

    // --- STATS ---
    function renderStats() {
        const travels = travelData.travels;
        const uniqueCountries = new Set(travels.map(t => t.country_name));
        const totalTrips = travels.filter(t => t.type !== 'residence').reduce((acc, t) => acc + t.visits.length, 0);
        
        // UPDATED: Calculate Unique Years INCLUDING residences
        const uniqueYears = new Set();
        travels.forEach(t => {
            if (t.exclude_from_stats) return; 
            
            t.visits.forEach(v => {
                if (v.date) uniqueYears.add(v.date.split('-')[0]);
            });
        });

        const totalWorldCountries = 195;
        const percentage = ((uniqueCountries.size / totalWorldCountries) * 100).toFixed(1);

        document.getElementById('stat-countries').textContent = uniqueCountries.size;
        document.getElementById('stat-trips').textContent = totalTrips;
        document.getElementById('stat-percentage').textContent = percentage + "%";
        document.getElementById('stat-years').textContent = uniqueYears.size; // Update new stat

        // -- Companion Stats --
        const companionCounts = { solo: 0, partner: 0, family: 0 };
        travels.forEach(t => {
            if (t.exclude_from_stats) return;
            const comp = t.companion || "solo";
            const visitCount = t.type !== 'residence' ? t.visits.length : 0;
            companionCounts[comp] = (companionCounts[comp] || 0) + visitCount;
        });
        const companionTotal = Object.values(companionCounts).reduce((a, b) => a + b, 0);
        const compContainer = document.getElementById('companion-stats');
        compContainer.innerHTML = Object.entries(companionTypes).map(([key, info]) => {
            const count = companionCounts[key] || 0;
            const pct = companionTotal ? ((count / companionTotal) * 100).toFixed(0) : 0;
            return `<div style="text-align:center;">
                <div style="font-size:1.8rem;">${info.emoji}</div>
                <div style="font-size:1.2rem; font-weight:700; color:var(--text-color);">${count}</div>
                <div style="font-size:0.8rem; color:var(--text-light);">${info.label} (${pct}%)</div>
            </div>`;
        }).join('');

        // -- Companion Country Stats --
        const companionCountries = { solo: new Set(), partner: new Set(), family: new Set() };
        travels.forEach(t => {
            if (t.exclude_from_stats || t.type === 'residence') return;
            const comp = t.companion || "solo";
            companionCountries[comp].add(t.country_code);
        });
        const companionCountryTotal = new Set([...companionCountries.solo, ...companionCountries.partner, ...companionCountries.family]).size;
        const compCountryContainer = document.getElementById('companion-country-stats');
        compCountryContainer.innerHTML = Object.entries(companionTypes).map(([key, info]) => {
            const count = companionCountries[key].size;
            const pct = companionCountryTotal ? ((count / companionCountryTotal) * 100).toFixed(0) : 0;
            return `<div style="text-align:center;">
                <div style="font-size:1.8rem;">${info.emoji}</div>
                <div style="font-size:1.2rem; font-weight:700; color:var(--text-color);">${count}</div>
                <div style="font-size:0.8rem; color:var(--text-light);">${info.label} (${pct}%)</div>
            </div>`;
        }).join('');

        // -- Cardinal Extremes Logic --
        let maxLat = -90, minLat = 90, maxLon = -180, minLon = 180;
        let northPlace, southPlace, eastPlace, westPlace;

        travels.forEach(t => {
            const [lon, lat] = t.coordinates;
            if (lat > maxLat) { maxLat = lat; northPlace = t; }
            if (lat < minLat) { minLat = lat; southPlace = t; }
            if (lon > maxLon) { maxLon = lon; eastPlace = t; }
            if (lon < minLon) { minLon = lon; westPlace = t; }
        });

        const formatCoord = (val, type) => {
            if (type === 'lat') return Math.abs(val).toFixed(2) + '° ' + (val >= 0 ? 'N' : 'S');
            return Math.abs(val).toFixed(2) + '° ' + (val >= 0 ? 'E' : 'W');
        };

        // Grid Area classes (cardinal-north, cardinal-south, etc.)
        const extremeHtml = `
            <div class="cardinal-item cardinal-north">
                <div class="cardinal-label">Northernmost ⬆️</div>
                <div class="cardinal-val">${getFlag(northPlace.country_code)} ${northPlace.city}, ${northPlace.country_name}</div>
                <div class="cardinal-coords">${formatCoord(maxLat, 'lat')}, ${formatCoord(northPlace.coordinates[0], 'lon')}</div>
            </div>
            <div class="cardinal-item cardinal-south">
                <div class="cardinal-label">Southernmost ⬇️</div>
                <div class="cardinal-val">${getFlag(southPlace.country_code)} ${southPlace.city}, ${southPlace.country_name}</div>
                <div class="cardinal-coords">${formatCoord(minLat, 'lat')}, ${formatCoord(southPlace.coordinates[0], 'lon')}</div>
            </div>
            <div class="cardinal-item cardinal-east">
                <div class="cardinal-label">Easternmost ➡️</div>
                <div class="cardinal-val">${getFlag(eastPlace.country_code)} ${eastPlace.city}, ${eastPlace.country_name}</div>
                <div class="cardinal-coords">${formatCoord(maxLon, 'lon')}, ${formatCoord(eastPlace.coordinates[1], 'lat')}</div>
            </div>
            <div class="cardinal-item cardinal-west">
                <div class="cardinal-label">Westernmost ⬅️</div>
                <div class="cardinal-val">${getFlag(westPlace.country_code)} ${westPlace.city}, ${westPlace.country_name}</div>
                <div class="cardinal-coords">${formatCoord(minLon, 'lon')}, ${formatCoord(westPlace.coordinates[1], 'lat')}</div>
            </div>
        `;
        document.getElementById('cardinal-stats').innerHTML = extremeHtml;

        // -- Aviation Log --
        const flightCodeMap = { "Larnaca": "CYP", "New York": "USA", "Mauritius": "MUS", "Headcorn": "ENG" };
        const flightContainer = document.getElementById('flight-stats');
        const allFlights = flightData.flatMap(f => f.types.map(t => ({ city: f.city, ...t })));
        allFlights.sort((a, b) => a.date.localeCompare(b.date));
        flightContainer.innerHTML = allFlights.map(t => {
            const code = flightCodeMap[t.city] || "";
            const d = new Date(t.date + 'T00:00:00');
            const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            return `<div class="location-tag" style="justify-content:space-between;">
                <span>${getFlag(code)} ${t.city} ${aviationIcons[t.mode]} ${t.mode === 'heli' ? 'Helicopter' : 'Plane'}</span>
                <span style="font-size:0.8rem; color:var(--text-light);">${dateStr}</span>
            </div>`;
        }).join('');

        // -- Yearly Breakdown --
        const tripsByYear = {};
        travels.forEach(t => {
            if (t.exclude_from_stats) return; 
            
            t.visits.forEach(v => {
                const year = v.date.split('-')[0];
                if(year === 'Present') return;
                if (!tripsByYear[year]) tripsByYear[year] = [];
                tripsByYear[year].push({ city: t.city, country: t.country_name, code: t.country_code, date: v.date, type: t.type, custom_date_label: t.custom_date_label, approximate: v.approximate });
            });
        });

        const yearStatsContainer = document.getElementById('year-stats');
        yearStatsContainer.innerHTML = '';
        Object.keys(tripsByYear).sort().reverse().forEach((year) => {
            const trips = tripsByYear[year];
            trips.sort((a, b) => new Date(b.date) - new Date(a.date));
            const wrapper = document.createElement('div');
            wrapper.className = 'accordion-item';
            const innerList = trips.map(t => {
                let dateText = t.custom_date_label ? t.custom_date_label : t.date;
                if (t.approximate) {
                    dateText = ' <span title="Approximate" style="cursor:help; opacity:0.7">❓</span>' + dateText;
                }
                return `
                <div class="trip-entry"><span>${getFlag(t.code)} ${t.city}, ${t.country}</span><span style="font-size:0.8rem; opacity:0.7">${dateText}</span></div>
            `}).join('');
            wrapper.innerHTML = `
                <div class="accordion-header" onclick="toggleAccordion('year-${year}')"><span>${year}</span><span>${trips.length} trips</span></div>
                <div id="year-${year}" class="accordion-body">${innerList}</div>
            `;
            yearStatsContainer.appendChild(wrapper);
        });

        // -- Continents --
        const continents = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'];
        const contStats = document.getElementById('continent-stats');
        contStats.innerHTML = '';
        continents.forEach((cont, i) => {
            const continentTravels = travels.filter(t => t.continent === cont);
            const uniqueMap = new Map();
            continentTravels.forEach(t => {
                if(!uniqueMap.has(t.country_name)) {
                    uniqueMap.set(t.country_name, t.country_code);
                }
            });
            
            const sortedCountries = Array.from(uniqueMap.entries())
                .map(([name, code]) => ({ name, code }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const listHtml = sortedCountries.map(c => {
                return `<div class="location-tag">${getFlag(c.code)} ${c.name}</div>`;
            }).join('');

            const div = document.createElement('div');
            div.className = 'accordion-item';
            div.innerHTML = `
                <div class="accordion-header" onclick="toggleAccordion('cont-${i}')">
                    <span>${cont}</span>
                    <span class="accordion-header-sub">Visited ${sortedCountries.length} of ${continentTotals[cont]}</span>
                </div>
                <div id="cont-${i}" class="accordion-body">
                    ${sortedCountries.length ? listHtml : '<span style="opacity:0.6">No visits</span>'}
                </div>
            `;
            contStats.appendChild(div);
        });
    }

    window.toggleAccordion = (id) => { document.getElementById(id).classList.toggle('show'); }

    // Expose handlers referenced by inline onclick/oninput/onchange attributes in index.html
    window.toggleTheme = toggleTheme;
    window.togglePlay = togglePlay;
    window.handleSliderChange = handleSliderChange;
    window.toggleAviation = toggleAviation;
    window.changeCompanionFilter = changeCompanionFilter;
    window.toggleControls = toggleControls;
    window.updateProjection = updateProjection;
    window.toggleStatsPanel = toggleStatsPanel;
    window.closeSidebar = closeSidebar;
});