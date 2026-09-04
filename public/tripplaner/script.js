let map;
let markers = [];
let routeLines = []; // keep track of colored segments
let routingControl = null;
const segmentColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E'];
let routeLine = null;
let currentItinerary = [];
let sortableList;
let startCoords = {lat: 16.4322, lng: 102.8236};
let endCoords = null;

// Mobile view switcher logic
window.switchMobileView = function(view) {
    const container = document.querySelector('.planner-container');
    if (!container) return;
    container.classList.remove('view-form', 'view-map', 'view-result');
    container.classList.add('view-' + view);

    document.querySelectorAll('.mobile-tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById('tabBtn' + view.charAt(0).toUpperCase() + view.slice(1));
    if (targetBtn) targetBtn.classList.add('active');

    if (view === 'map' && map) {
        setTimeout(() => map.invalidateSize(), 150);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();

    // Populate time dropdowns (24h format)
    const startHourSelect = document.getElementById('start-hour');
    const endHourSelect = document.getElementById('end-hour');
    if(startHourSelect && endHourSelect) {
        let hourOptions = '';
        for(let h=5; h<=23; h++) {
            let hourStr = String(h).padStart(2, '0');
            hourOptions += `<option value="${hourStr}">${hourStr}</option>`;
        }
        startHourSelect.innerHTML = hourOptions;
        endHourSelect.innerHTML = hourOptions;
        startHourSelect.value = '09';
        endHourSelect.value = '18';
        
        const syncTimeInputs = () => {
            const sh = document.getElementById('start-hour').value;
            const sm = document.getElementById('start-minute').value;
            const eh = document.getElementById('end-hour').value;
            const em = document.getElementById('end-minute').value;
            document.getElementById('start-time').value = `${sh}:${sm}`;
            document.getElementById('end-time').value = `${eh}:${em}`;
        };
        
        document.getElementById('start-hour').addEventListener('change', syncTimeInputs);
        document.getElementById('start-minute').addEventListener('change', syncTimeInputs);
        document.getElementById('end-hour').addEventListener('change', syncTimeInputs);
        document.getElementById('end-minute').addEventListener('change', syncTimeInputs);
        
        syncTimeInputs();
    }

    document.getElementById('trip-form').addEventListener('submit', function(e) {
        e.preventDefault();
        generatePlan();
    });

    // Initialize Sortable for drag-and-drop
    const itineraryEl = document.getElementById('itinerary-list');
    if (itineraryEl) {
        sortableList = new Sortable(itineraryEl, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function() {
                // Reorder array based on DOM
                updateItineraryOrderFromDOM();
            }
        });
    }

    // Autocomplete logic
    const startInput = document.getElementById('start-location');
    const autocompleteList = document.getElementById('autocomplete-list');

    startInput.addEventListener('input', function() {
        const val = this.value;
        autocompleteList.innerHTML = '';
        if (!val) {
            autocompleteList.style.display = 'none';
            return;
        }
        
        const allPlaces = getPlaces();
        const matches = allPlaces.filter(p => p.name.toLowerCase().includes(val.toLowerCase()));
        
        if (matches.length > 0) {
            autocompleteList.style.display = 'block';
            matches.forEach(place => {
                const div = document.createElement('div');
                div.innerHTML = `<strong>${place.name}</strong> <span style="font-size:0.8rem; color:var(--text-muted); margin-left:0.5rem;">(${place.category})</span>`;
                div.addEventListener('click', function() {
                    startInput.value = place.name;
                    startCoords = { lat: place.lat, lng: place.lng };
                    autocompleteList.style.display = 'none';
                    updateMap();
                    map.setView([place.lat, place.lng], 14);
                });
                autocompleteList.appendChild(div);
            });
        } else {
            autocompleteList.style.display = 'none';
        }
    });

    // End Location Autocomplete
    const endInput = document.getElementById('end-location');
    const endAutocompleteList = document.getElementById('end-autocomplete-list');

    endInput.addEventListener('input', function() {
        const val = this.value;
        endAutocompleteList.innerHTML = '';
        if (!val) {
            endAutocompleteList.style.display = 'none';
            endCoords = null;
            return;
        }
        
        const allPlaces = getPlaces();
        const matches = allPlaces.filter(p => p.name.toLowerCase().includes(val.toLowerCase()));
        
        if (matches.length > 0) {
            endAutocompleteList.style.display = 'block';
            matches.forEach(place => {
                const div = document.createElement('div');
                div.innerHTML = `<strong>${place.name}</strong> <span style="font-size:0.8rem; color:var(--text-muted); margin-left:0.5rem;">(${place.category})</span>`;
                div.addEventListener('click', function() {
                    endInput.value = place.name;
                    endCoords = { lat: place.lat, lng: place.lng };
                    endAutocompleteList.style.display = 'none';
                    updateMap();
                    map.setView([place.lat, place.lng], 14);
                });
                endAutocompleteList.appendChild(div);
            });
        } else {
            endAutocompleteList.style.display = 'none';
        }
    });

    document.addEventListener('click', function(e) {
        if (e.target !== startInput) {
            autocompleteList.style.display = 'none';
        }
        if (e.target !== endInput) {
            endAutocompleteList.style.display = 'none';
        }
    });
});

window.clearEndLocation = function() {
    document.getElementById('end-location').value = '';
    endCoords = null;
    updateMap();
};

window.useStartLocationAsEnd = function() {
    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');
    
    if (startInput.value && startCoords) {
        endInput.value = startInput.value;
        endCoords = { lat: startCoords.lat, lng: startCoords.lng };
        updateMap();
    } else {
        alert("กรุณาระบุจุดเริ่มต้นก่อนครับ");
    }
};

let drawnItems;
let selectedPolygon = null;

function isPointInPolygon(lat, lng, polygon) {
    // Ray-casting algorithm
    let isInside = false;
    const x = parseFloat(lat);
    const y = parseFloat(lng);
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = parseFloat(polygon[i].lat), yi = parseFloat(polygon[i].lng);
        const xj = parseFloat(polygon[j].lat), yj = parseFloat(polygon[j].lng);

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

function initMap() {
    // Center at Khon Kaen
    map = L.map('map').setView([16.4322, 102.8236], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Initialize Leaflet Draw
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    
    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polygon: {
                allowIntersection: false,
                drawError: { color: '#e1e100', message: '<strong>เกิดข้อผิดพลาด:</strong> ไม่สามารถวาดเส้นตัดกันได้!' },
                shapeOptions: { color: '#3B82F6' }
            },
            polyline: false,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false
        }
    });
    map.addControl(drawControl);
    
    map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers(); // Only one polygon at a time
        const layer = e.layer;
        drawnItems.addLayer(layer);
        selectedPolygon = layer.getLatLngs()[0];
        document.getElementById('travel-distance').disabled = true;
    });
    
    map.on(L.Draw.Event.DELETED, function () {
        selectedPolygon = null;
        document.getElementById('travel-distance').disabled = false;
    });
    
    map.on(L.Draw.Event.EDITED, function (e) {
        e.layers.eachLayer(function (layer) {
            selectedPolygon = layer.getLatLngs()[0];
        });
        document.getElementById('travel-distance').disabled = true;
    });
}

function useCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                document.getElementById('start-location').value = `ตำแหน่งปัจจุบัน (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                startCoords = { lat: lat, lng: lng };
                updateMap();
                map.setView([lat, lng], 14);
            },
            () => {
                alert('ไม่สามารถดึงตำแหน่งปัจจุบันได้');
            }
        );
    } else {
        alert('เบราว์เซอร์ของคุณไม่รองรับ Geolocation');
    }
}

let generatedPlans = [[], [], []];
let currentPlanIndex = 0;
let globalMinRating = 0;

function generatePlan() {
    // 1. Get Form Values
    const startTimeStr = document.getElementById('start-time').value; // "09:00"
    const endTimeStr = document.getElementById('end-time').value; // "18:00"
    
    const checkboxes = document.querySelectorAll('input[name="category"]:checked');
    const categories = Array.from(checkboxes).map(cb => cb.value);
    
    globalMinRating = parseFloat(document.getElementById('min-rating').value) || 0;
    const timePerPlaceSelection = 'auto';
    const placeCountSelection = document.getElementById('place-count').value;
    const travelDistanceSelection = document.getElementById('travel-distance').value;
    
    // 2. Filter Places from Data and Deep Clone to avoid mutating global state
    const allPlaces = getPlaces();
    let eligiblePlaces = allPlaces.filter(p => {
        const r = p.rating ? parseFloat(p.rating) : 4.0;
        
        let inPolygon = true;
        if (selectedPolygon) {
            inPolygon = isPointInPolygon(p.lat, p.lng, selectedPolygon);
        }

        let inDistance = true;
        // If polygon is drawn, it overrides distance filter
        if (!selectedPolygon && travelDistanceSelection !== 'unlimited' && startCoords) {
            const maxDist = parseInt(travelDistanceSelection);
            const R = 6371;
            const dLat = (p.lat - startCoords.lat) * Math.PI / 180;
            const dLng = (p.lng - startCoords.lng) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(startCoords.lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) * 
                      Math.sin(dLng/2) * Math.sin(dLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
            const distanceKm = R * c; 
            inDistance = distanceKm <= maxDist;
        }
        return categories.includes(p.category) && r >= globalMinRating && inPolygon && inDistance;
    }).map(p => ({...p}));
    
    // Calculate max places based on time and pace
    const globalTimeSpent = timePerPlaceSelection === 'auto' ? 60 : parseInt(timePerPlaceSelection);
    
    const [sH, sM] = startTimeStr.split(':').map(Number);
    const [eH, eM] = endTimeStr.split(':').map(Number);
    let totalMinutes = (eH * 60 + eM) - (sH * 60 + sM);
    if (totalMinutes <= 0) totalMinutes = 24 * 60 + totalMinutes; // Handle overnight
    
    const mealsChoice = document.getElementById('meals') ? document.getElementById('meals').value : 'none';
    let mealCount = 0;
    if (mealsChoice === 'lunch' || mealsChoice === 'dinner') mealCount = 1;
    if (mealsChoice === 'both') mealCount = 2;

    // Calculate max places
    const mode = document.getElementById('transport-mode').value;
    const minTravel = 5; // Assume short travel to generate excess places
    const timePerStop = globalTimeSpent + minTravel;
    
    let maxPlaces = 1;
    if (placeCountSelection !== 'auto') {
        maxPlaces = parseInt(placeCountSelection);
    } else {
        maxPlaces = Math.max(1, Math.ceil(totalMinutes / timePerStop) + 4); // Buffer of 4 extra places
        maxPlaces = Math.max(1, maxPlaces - mealCount); // Reserve slots for meals
    }
    
    generatedPlans = [[], [], []];
    currentPlanIndex = 0;

    for (let planIdx = 0; planIdx < 3; planIdx++) {
        // Pick random places
        let nonRestPlaces = eligiblePlaces.filter(p => p.category !== 'ร้านอาหาร');
        if (nonRestPlaces.length < maxPlaces) {
            nonRestPlaces = eligiblePlaces; // fallback to include restaurants if short on places
        }
        
        nonRestPlaces = nonRestPlaces.sort(() => 0.5 - Math.random());
        let actualMax = Math.min(maxPlaces, nonRestPlaces.length);
        let pickedPlaces = nonRestPlaces.slice(0, actualMax);
        
        let planItinerary = [];
        if (startCoords && pickedPlaces.length > 0) {
            let unvisited = [...pickedPlaces];
            let optimized = [];
            let currentLoc = startCoords;
            
            while (unvisited.length > 0) {
                let nearestIdx = 0;
                let minDist = Infinity;
                
                for (let i = 0; i < unvisited.length; i++) {
                    const p = unvisited[i];
                    const dLat = currentLoc.lat - p.lat;
                    const dLng = currentLoc.lng - p.lng;
                    const dist = dLat*dLat + dLng*dLng;
                    if (dist < minDist) {
                        minDist = dist;
                        nearestIdx = i;
                    }
                }
                
                currentLoc = unvisited[nearestIdx];
                optimized.push(currentLoc);
                unvisited.splice(nearestIdx, 1);
            }
            if (timePerPlaceSelection !== 'auto') {
                optimized.forEach(p => p.timeSpent = parseInt(timePerPlaceSelection));
            }
            planItinerary = injectMeals(optimized, mealsChoice, sH, sM);
        } else {
            if (timePerPlaceSelection !== 'auto') {
                pickedPlaces.forEach(p => p.timeSpent = parseInt(timePerPlaceSelection));
            }
            planItinerary = injectMeals(pickedPlaces, mealsChoice, sH, sM);
        }
        
        if (endCoords) {
            planItinerary.push({
                id: 'end_' + Date.now() + Math.random(),
                name: document.getElementById('end-location').value || 'จุดสิ้นสุดการเดินทาง',
                lat: endCoords.lat,
                lng: endCoords.lng,
                timeSpent: 0,
                isEndLocation: true,
                category: 'จุดสิ้นสุด'
            });
        }
        
        generatedPlans[planIdx] = planItinerary;
    }
    
    currentItinerary = generatedPlans[0];
    
    // 3. Render UI
    document.getElementById('sidebar-result').style.display = 'flex';
    
    // Show mobile result tab button and switch view on mobile
    const tabResultBtn = document.getElementById('tabBtnResult');
    if (tabResultBtn) {
        tabResultBtn.style.display = 'flex';
    }
    if (window.innerWidth <= 820) {
        switchMobileView('result');
    }
    
    document.getElementById('itinerary-list').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังคำนวณเวลาเดินทางจริง...</div>';
    
    currentRouteCoords = null;
    currentRouteIndices = null;
    
    updateScheduleWithRealTimes(true).then(() => {
        updateMap();
    }).catch(err => {
        console.error("Schedule error:", err);
        // Force render fallback
        renderItineraryList();
        updateMap();
    });
}

function switchPlan(index) {
    if (index === currentPlanIndex) return; // Already on this plan
    
    // Update tabs UI
    document.querySelectorAll('.plan-tab').forEach((tab, i) => {
        if (i === index) tab.classList.add('active');
        else tab.classList.remove('active');
    });
    
    currentPlanIndex = index;
    currentItinerary = generatedPlans[index];
    
    document.getElementById('itinerary-list').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังคำนวณเวลาเดินทางจริง...</div>';
    currentRouteCoords = null;
    currentRouteIndices = null;
    
    updateScheduleWithRealTimes(true).then(() => {
        updateMap();
    }).catch(err => {
        console.error("Schedule error:", err);
        renderItineraryList();
        updateMap();
    });
}

function renderItineraryList() {
    const list = document.getElementById('itinerary-list');
    if (!list) return; // safeguard
    list.innerHTML = '';
    
    if (currentItinerary.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">ไม่พบสถานที่ กรุณาเลือกหมวดหมู่ใหม่</div>';
        updateSummary();
        return;
    }
    
    try {
        let startTimeStr = document.getElementById('start-time').value || '09:00';
        
        // Update the badge in the UI
        const badge = document.getElementById('start-time-badge');
        if (badge) badge.innerText = startTimeStr;
        const startText = document.getElementById('start-point-text');
        if (startText) startText.innerText = startTimeStr;
        
        let [hours, minutes] = startTimeStr.split(':').map(Number);
        if (isNaN(hours)) hours = 9;
        if (isNaN(minutes)) minutes = 0;
        
        let prevLoc = startCoords;
        const mode = document.getElementById('transport-mode').value;
        
        currentItinerary.forEach((place, index) => {
            const timeToSpend = place.timeSpent !== undefined ? place.timeSpent : 60;
            
            // Add travel time from previous location
            let travelMins = 0;
            if (index === 0 && !startCoords) {
                travelMins = 0;
            } else if (place.realTravelMins !== undefined) {
                travelMins = place.realTravelMins;
            } else if (prevLoc) {
                travelMins = getTravelTime(prevLoc, place, mode);
            }
            
            if (isNaN(travelMins)) travelMins = 15;
            minutes += travelMins;
            hours += Math.floor(minutes / 60);
            minutes %= 60;
            
            const currentStartTime = formatTime(hours, minutes);
            
            minutes += timeToSpend;
            hours += Math.floor(minutes / 60);
            minutes %= 60;
            
            place.startTime = currentStartTime;
            place.endTime = formatTime(hours, minutes);
            
            prevLoc = place;
            
            // Render HTML
            const item = document.createElement('div');
            item.className = 'itinerary-item';
            item.dataset.id = place.id || ('temp_' + index);
            const mealBadge = place.isMeal ? '<span style="background:#EF4444; color:white; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:5px;">แวะทานอาหาร</span>' : '';
            item.innerHTML = `
                <div class="item-time">${place.startTime}</div>
                <div class="item-details">
                    <h4>${place.name || 'สถานที่'} ${mealBadge}</h4>
                    <p style="display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-hourglass-half"></i> 
                        <input type="number" value="${place.timeSpent}" min="5" step="5" style="width: 60px; padding: 2px 5px; border-radius: 4px; border: 1px solid #ccc; font-family: inherit;" onchange="updatePlaceTime('${place.id}', this.value)"> นาที
                    </p>
                    <p>
                        <span style="margin-right: 10px;"><i class="fa-solid fa-tag"></i> ${place.category || '-'}</span>
                        <span style="color: #F59E0B; font-weight: 500;"><i class="fa-solid fa-star"></i> ${place.rating || '4.5'} <span style="color: var(--text-muted); font-weight: normal; font-size: 0.8rem;">(${place.reviews || '10'})</span></span>
                    </p>
                </div>
                <div class="item-actions">
                    <i class="fa-solid fa-xmark action-icon" onclick="removePlace('${place.id}')"></i>
                </div>
            `;
            list.appendChild(item);
        });
        
        updateMap();
        updateSummary();
    } catch (e) {
        console.error("Render error:", e);
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #EF4444;">เกิดข้อผิดพลาดในการแสดงผล กรุณาลองใหม่</div>';
    }
}

window.updatePlaceTime = function(id, newTime) {
    const time = parseInt(newTime);
    if (isNaN(time) || time < 5) return;
    
    const targetId = String(id);
    const place = currentItinerary.find(p => String(p.id) === targetId);
    if (place) {
        place.timeSpent = time;
        // Re-render to update the calculated times without trimming places
        renderItineraryList();
    }
};

function formatTime(h, m) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function updateItineraryOrderFromDOM() {
    const listItems = document.querySelectorAll('.itinerary-item');
    const newOrder = [];
    listItems.forEach(item => {
        const id = String(item.dataset.id);
        const place = currentItinerary.find(p => String(p.id) === id);
        if (place) newOrder.push(place);
    });
    currentItinerary = newOrder;
    document.getElementById('itinerary-list').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังคำนวณเวลาเดินทางจริง...</div>';
    updateScheduleWithRealTimes().then(() => {
        updateMap();
    });
}

function removePlace(id) {
    const targetId = String(id);
    currentItinerary = currentItinerary.filter(p => String(p.id) !== targetId);
    renderItineraryList();
}

function updateMap() {
    // Clear existing
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    routeLines.forEach(l => map.removeLayer(l));
    routeLines = [];
    if (routingControl) map.removeControl(routingControl);
    
    const latlngs = [];
    
    if (startCoords) {
        const startLatLng = [startCoords.lat, startCoords.lng];
        latlngs.push(startLatLng);
        
        const startMarker = L.marker(startLatLng, {
            icon: L.divIcon({
                className: 'start-marker-container',
                html: '<div class="start-marker-pin"><i class="fa-solid fa-flag"></i></div>',
                iconSize: [34, 34],
                iconAnchor: [17, 34] // Anchor at the bottom tip of the pin
            })
        }).addTo(map).bindPopup(`<b>จุดเริ่มต้น</b>`);
        markers.push(startMarker);
    }

    if (currentItinerary.length === 0) return;
    
    currentItinerary.forEach((place, index) => {
        const latlng = [place.lat, place.lng];
        latlngs.push(latlng);
        
        let markerHtml = '';
        let iconSize = [44, 44];
        let iconAnchor = [22, 22];

        if (place.isEndLocation) {
            const isSameAsStart = startCoords && (Math.abs(startCoords.lat - place.lat) < 0.0001 && Math.abs(startCoords.lng - place.lng) < 0.0001);
            if (isSameAsStart) return; // Skip rendering the end marker entirely
            
            markerHtml = `
                <div class="end-marker-pin">
                    <i class="fa-solid fa-flag-checkered"></i>
                </div>
            `;
            iconSize = [40, 40];
            iconAnchor = [20, 40];
        } else {
            markerHtml = `
                <div class="place-marker">
                    <div class="place-marker-img" style="background-image: url('${place.image || 'https://via.placeholder.com/150'}')"></div>
                    <div class="place-marker-num">${index + 1}</div>
                </div>
            `;
        }
        
        const marker = L.marker(latlng, {
            icon: L.divIcon({
                className: 'place-marker-container',
                html: markerHtml,
                iconSize: iconSize,
                iconAnchor: iconAnchor
            })
        }).addTo(map)
            .bindPopup(`<b>${place.isEndLocation ? 'จุดสิ้นสุด: ' : index + 1 + '. '}${place.name}</b><br>${place.startTime || ''} - ${place.endTime || ''}`);
        markers.push(marker);
    });
    
    // Draw actual route along roads
    if (currentRouteCoords && currentRouteIndices && currentRouteIndices.length > 0) {
        for (let i = 0; i < currentRouteIndices.length - 1; i++) {
            const startIdx = currentRouteIndices[i];
            const endIdx = currentRouteIndices[i + 1];
            const segmentCoords = currentRouteCoords.slice(startIdx, endIdx + 1).map(c => [c.lat, c.lng]);
            
            const color = segmentColors[i % segmentColors.length];
            
            const segmentLine = L.polyline(segmentCoords, {
                color: color,
                weight: 6,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);
            
            routeLines.push(segmentLine);
        }
        
        // Draw dashed lines for any remaining markers that don't have an OSRM route
        for (let i = currentRouteIndices.length - 1; i < latlngs.length - 1; i++) {
            const color = segmentColors[i % segmentColors.length];
            const segmentLine = L.polyline([latlngs[i], latlngs[i+1]], {
                color: color,
                weight: 5,
                opacity: 0.8,
                dashArray: '10, 10'
            }).addTo(map);
            routeLines.push(segmentLine);
        }
    } else {
        // Fallback: draw straight lines if OSRM failed
        for (let i = 0; i < latlngs.length - 1; i++) {
            const color = segmentColors[i % segmentColors.length];
            const segmentLine = L.polyline([latlngs[i], latlngs[i+1]], {
                color: color,
                weight: 5,
                opacity: 0.8,
                dashArray: '10, 10'
            }).addTo(map);
            routeLines.push(segmentLine);
        }
    }
    
    // Zoom map to fit all markers and routes
    if (markers.length > 0) {
        const group = new L.featureGroup([...markers, ...routeLines]);
        if (group.getBounds().isValid()) {
            map.invalidateSize();
            map.fitBounds(group.getBounds(), { padding: [70, 70] });
        }
    }
}

function updateSummary() {
    // Very rough estimation based on 1 deg ~ 111km
    let distance = 0;
    let waypointsForDist = [];
    if (startCoords) waypointsForDist.push(startCoords);
    currentItinerary.forEach(p => waypointsForDist.push(p));
    
    for (let i = 0; i < waypointsForDist.length - 1; i++) {
        const p1 = waypointsForDist[i];
        const p2 = waypointsForDist[i+1];
        const dLat = p1.lat - p2.lat;
        const dLng = p1.lng - p2.lng;
        distance += Math.sqrt(dLat*dLat + dLng*dLng) * 111;
    }
    
    let startTimeStr = document.getElementById('start-time').value || '09:00';
    let [sH, sM] = startTimeStr.split(':').map(Number);
    if (isNaN(sH)) sH = 9;
    if (isNaN(sM)) sM = 0;
    
    const startStr = currentItinerary.length > 0 ? formatTime(sH, sM) : '--';
    const endStr = currentItinerary.length > 0 ? currentItinerary[currentItinerary.length-1].endTime : '--';
    
    document.getElementById('summary-time').innerText = `${startStr} - ${endStr}`;
    document.getElementById('summary-distance').innerText = `~ ${distance.toFixed(1)} กม.`;
}

function resetForm() {
    document.getElementById('sidebar-result').style.display = 'none';
    document.getElementById('sidebar-form').style.display = 'flex';
    if (window.innerWidth <= 820) {
        switchMobileView('form');
    }
    if (currentItinerary.length > 0) {
        document.getElementById('view-current-plan-btn').style.display = 'block';
    } else {
        document.getElementById('view-current-plan-btn').style.display = 'none';
    }
}

function showCurrentPlan() {
    document.getElementById('sidebar-form').style.display = 'none';
    document.getElementById('sidebar-result').style.display = 'flex';
    if (window.innerWidth <= 820) {
        switchMobileView('result');
    }
    document.getElementById('itinerary-list').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังปรับปรุงแผน...</div>';
    
    // We do NOT clear currentRouteCoords here so it can try to reuse them
    updateScheduleWithRealTimes(true).then(() => {
        updateMap();
    }).catch(err => {
        console.error("Schedule error:", err);
        renderItineraryList();
        updateMap();
    });
}

function recalculateRoute() {
    // TSP (Traveling Salesperson) solver using closest-neighbor heuristic from start point
    if (currentItinerary.length < 2) return;
    
    let unvisited = [...currentItinerary];
    let optimized = [];
    let currentLoc = startCoords ? startCoords : unvisited[0];
    
    while(unvisited.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;
        
        for(let i=0; i<unvisited.length; i++) {
            const p = unvisited[i];
            const dLat = currentLoc.lat - p.lat;
            const dLng = currentLoc.lng - p.lng;
            const dist = dLat*dLat + dLng*dLng;
            if(dist < minDist) {
                minDist = dist;
                nearestIdx = i;
            }
        }
        
        currentLoc = unvisited[nearestIdx];
        optimized.push(currentLoc);
        unvisited.splice(nearestIdx, 1);
    }
    
    currentItinerary = optimized;
    document.getElementById('itinerary-list').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังคำนวณเวลาเดินทางจริง...</div>';
    updateScheduleWithRealTimes().then(() => {
        updateMap();
    });
}

// Add Place Modal Logic
const modal = document.getElementById('addPlaceModal');

function openAddPlaceModal() {
    const allPlaces = getPlaces();
    // Filter out places already in itinerary
    const currentIds = currentItinerary.map(p => String(p.id));
    const available = allPlaces.filter(p => !currentIds.includes(String(p.id)));
    
    const list = document.getElementById('available-places');
    list.innerHTML = '';
    
    if(available.length === 0) {
        list.innerHTML = '<p>ไม่มีสถานที่ให้เพิ่มแล้ว</p>';
    } else {
        available.forEach(place => {
            const placeIdStr = String(place.id);
            const item = document.createElement('div');
            item.className = 'add-place-item';
            item.innerHTML = `
                <div>
                    <h4>${place.name}</h4>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">
                        <span style="margin-right: 10px;">${place.category}</span>
                        <span style="color: #F59E0B; font-weight: 500;"><i class="fa-solid fa-star"></i> ${place.rating || '4.5'} <span style="color: var(--text-muted); font-weight: normal; font-size: 0.75rem;">(${place.reviews || '10'})</span></span>
                    </p>
                </div>
                <button class="btn btn-primary small-btn" onclick="addPlaceToItinerary('${placeIdStr}')">เพิ่ม</button>
            `;
            list.appendChild(item);
        });
    }
    
    modal.style.display = 'block';
}

function closeAddPlaceModal() {
    modal.style.display = 'none';
}

function addPlaceToItinerary(id) {
    const allPlaces = getPlaces();
    const targetId = String(id);
    const place = allPlaces.find(p => String(p.id) === targetId);
    if(place) {
        const placeClone = {...place, id: String(place.id)};
        const globalTimeSpent = parseInt(document.getElementById('time-per-place').value) || 60;
        placeClone.timeSpent = globalTimeSpent;
        currentItinerary.push(placeClone);
        renderItineraryList();
    }
    closeAddPlaceModal();
}

window.onclick = function(event) {
    if (event.target == modal) {
        closeAddPlaceModal();
    }
}

let currentRouteCoords = null;
let currentRouteIndices = null;

// OSRM Real Travel Time Fetcher
async function getRealTravelTimes(waypoints, mode, retries = 3, useRadiuses = false) {
    if (waypoints.length < 2) return null;
    
    const profile = 'driving';
    const coordString = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    
    let url = `https://router.project-osrm.org/route/v1/${profile}/${coordString}?overview=full&geometries=geojson`;
    if (useRadiuses) {
        // Add 10km radius search to snap random off-road coordinates to the nearest road
        const radiusesString = waypoints.map(() => '10000').join(';');
        url += `&radiuses=${radiusesString}`;
    }
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 429 && retries > 0) {
                console.warn("OSRM Rate limit hit, retrying in 1.2s...");
                await new Promise(r => setTimeout(r, 1200));
                return getRealTravelTimes(waypoints, mode, retries - 1, useRadiuses);
            }
            return null; // Don't try to parse json if it's an error we can't retry (like 400 Bad Request)
        }
        
        const data = await response.json();
        
        if (data.code === 'Ok') {
            let coords = null;
            let indices = null;
            
            if (data.routes[0].geometry && data.routes[0].geometry.coordinates) {
                coords = data.routes[0].geometry.coordinates.map(c => ({lat: c[1], lng: c[0]}));
                
                indices = [0];
                for (let i = 1; i < waypoints.length - 1; i++) {
                    let wp = waypoints[i];
                    let closestIdx = indices[i-1];
                    let minDist = Infinity;
                    for (let j = indices[i-1]; j < coords.length; j++) {
                        let c = coords[j];
                        let dLat = c.lat - wp.lat;
                        let dLng = c.lng - wp.lng;
                        let d = dLat*dLat + dLng*dLng;
                        if (d < minDist) {
                            minDist = d;
                            closestIdx = j;
                        }
                    }
                    indices.push(closestIdx);
                }
                indices.push(coords.length - 1);
            }
            
            const legs = data.routes[0].legs; 
            let times = legs.map(leg => Math.round(leg.duration / 60));
            if (mode === 'motorcycle') {
                times = times.map(t => Math.max(1, Math.round(t * 0.8))); 
            }
            times = times.map(t => t + (mode === 'motorcycle' ? 2 : 5));
            return { times, coords, indices };
        } else if (data.code === 'NoRoute' && !useRadiuses && retries > 0) {
            // If it failed to find a route because points are too far off-road, retry with expanded radiuses!
            return getRealTravelTimes(waypoints, mode, retries - 1, true);
        }
    } catch(err) {
        console.error("OSRM fetch error:", err);
    }
    return null;
}

async function updateScheduleWithRealTimes(trimToFit = false) {
    if (currentItinerary.length === 0) {
        renderItineraryList(); // Ensures UI updates even if empty
        return;
    }
    
    const waypoints = [];
    if (startCoords) waypoints.push(startCoords);
    currentItinerary.forEach(p => waypoints.push(p));
    
    const mode = document.getElementById('transport-mode').value;
    const result = await getRealTravelTimes(waypoints, mode);
    
    if (result && result.times && result.times.length >= currentItinerary.length) {
        if (result.coords && result.indices) {
            currentRouteCoords = result.coords;
            currentRouteIndices = result.indices;
        }
        
        // Safe assignment
        const offset = result.times.length - currentItinerary.length;
        currentItinerary.forEach((p, i) => {
            p.realTravelMins = result.times[i + offset] || 15; 
        });
    } else {
        // Fallback
        let prev = startCoords;
        currentItinerary.forEach(p => {
            p.realTravelMins = getTravelTime(prev, p, mode);
            prev = p;
        });
    }
    
    if (trimToFit) {
        let startTimeStr = document.getElementById('start-time').value || '09:00';
        let endTimeStr = document.getElementById('end-time').value || '18:00';
        let [sH, sM] = startTimeStr.split(':').map(Number);
        let [eH, eM] = endTimeStr.split(':').map(Number);
        let startTotalMins = sH * 60 + sM;
        let endTotalMins = eH * 60 + eM;
        if (endTotalMins <= startTotalMins) endTotalMins += 24 * 60;
        
        let accumulatedMins = startTotalMins;
        let validItinerary = [];
        
        const originalLength = currentItinerary.length;
        
        // Extract end location if any
        let endLocPlace = null;
        if (currentItinerary.length > 0 && currentItinerary[currentItinerary.length - 1].isEndLocation) {
            endLocPlace = currentItinerary.pop(); // Remove it temporarily for the trim loop
        }
        
        for (let i = 0; i < currentItinerary.length; i++) {
            const p = currentItinerary[i];
            const travelMins = p.realTravelMins !== undefined ? p.realTravelMins : 15;
            const timeToSpend = p.timeSpent !== undefined ? p.timeSpent : 60;
            
            let projectedEnd = accumulatedMins + travelMins + timeToSpend;
            
            if (projectedEnd <= endTotalMins) {
                // Fits perfectly or leaves a gap
                validItinerary.push(p);
                accumulatedMins = projectedEnd;
            } else {
                // Overshoots! Let's see if we can reduce its time to fit
                let overshoot = projectedEnd - endTotalMins;
                let adjustedTime = timeToSpend - overshoot;
                
                if (adjustedTime >= 15) {
                    // It fits and is not less than 15 mins! Add it and adjust its time.
                    p.timeSpent = adjustedTime;
                    p.isOptional = true; // Mark as optional/adjusted place
                    validItinerary.push(p);
                    accumulatedMins = endTotalMins;
                } else {
                    // Cannot add this place because it would drop below 15 mins.
                    // We stop here and will absorb the gap into the PREVIOUS place.
                }
                break;
            }
        }
        
        // Now append the end location back and reserve its travel time!
        if (endLocPlace) {
            const prevLoc = validItinerary.length > 0 ? validItinerary[validItinerary.length - 1] : startCoords;
            const mode = document.getElementById('transport-mode').value;
            const travelToEnd = getTravelTime(prevLoc, endLocPlace, mode);
            
            endLocPlace.realTravelMins = travelToEnd;
            validItinerary.push(endLocPlace);
            accumulatedMins += travelToEnd;
        }
        
        // If there's still a gap to fill, absorb it into the LAST NON-MEAL place to ensure the trip ends exactly on time
        if (accumulatedMins < endTotalMins && validItinerary.length > 0) {
            let gap = endTotalMins - accumulatedMins;
            for (let j = validItinerary.length - 1; j >= 0; j--) {
                if (!validItinerary[j].isMeal && !validItinerary[j].isEndLocation) {
                    validItinerary[j].timeSpent += gap;
                    break;
                }
            }
        } else if (accumulatedMins > endTotalMins && validItinerary.length > 0) {
            // We overshot because of travel time to end location. We must squish previous places!
            let overshoot = accumulatedMins - endTotalMins;
            for (let j = validItinerary.length - 1; j >= 0; j--) {
                if (!validItinerary[j].isMeal && !validItinerary[j].isEndLocation) {
                    if (validItinerary[j].timeSpent > overshoot + 5) { // Must leave at least 5 mins
                        validItinerary[j].timeSpent -= overshoot;
                        break;
                    }
                }
            }
        }
        
        const keepCount = validItinerary.length;
        
        currentItinerary = validItinerary;
        generatedPlans[currentPlanIndex] = currentItinerary;
        
        // If we shrunk the itinerary, re-fetch the route from OSRM so we get a perfect solid line 
        // connecting to the end location, instead of falling back to dashed straight lines.
        if (keepCount !== originalLength) {
            
            const newWaypoints = [];
            if (startCoords) newWaypoints.push(startCoords);
            validItinerary.forEach(p => newWaypoints.push(p));
            
            const mode = document.getElementById('transport-mode').value;
            const finalResult = await getRealTravelTimes(newWaypoints, mode);
            if (finalResult && finalResult.coords && finalResult.indices) {
                currentRouteCoords = finalResult.coords;
                currentRouteIndices = finalResult.indices;
            } else {
                currentRouteCoords = null;
                currentRouteIndices = null;
            }
        }
    }
    
    renderItineraryList();
}

// Helper functions for meals and travel
function getTravelTime(loc1, loc2, mode = 'car') {
    if (!loc1 || !loc2) return 15;
    
    // Haversine formula for distance
    const R = 6371; // km
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLng = (loc2.lng - loc1.lng) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) * 
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distanceKm = R * c; 
    
    let timeMins = 0;
    let bufferMins = 0;
    
    if (mode === 'motorcycle') {
        // Motorcycle: ~40 km/h (1.5 mins per km), easy parking
        timeMins = Math.round(distanceKm * 1.5);
        bufferMins = 2;
    } else {
        // Car: ~30 km/h (2 mins per km), harder parking
        timeMins = Math.round(distanceKm * 2);
        bufferMins = 5;
    }
    
    return Math.max(5, Math.min(60, timeMins + bufferMins));
}

function findClosest(places, targetLoc, excludeList) {
    let best = null;
    let minDist = Infinity;
    const excludeIds = excludeList.map(p => p.id);
    
    places.forEach(p => {
        if (excludeIds.includes(p.id)) return;
        const dLat = p.lat - targetLoc.lat;
        const dLng = p.lng - targetLoc.lng;
        const dist = dLat*dLat + dLng*dLng;
        if (dist < minDist) {
            minDist = dist;
            best = p;
        }
    });
    
    return best ? {...best} : null;
}

function injectMeals(itinerary, mealsChoice, startH, startM) {
    if (mealsChoice === 'none' || itinerary.length === 0) return itinerary;
    
    let result = [];
    let h = startH, m = startM;
    let lunchAdded = false;
    let dinnerAdded = false;
    const mode = document.getElementById('transport-mode').value;
    
    const travelDistanceSelection = document.getElementById('travel-distance').value;
    const allPlaces = getPlaces();
    const restaurants = allPlaces.filter(p => {
        if (p.category !== 'ร้านอาหาร' && p.category !== 'คาเฟ่/ถ่ายรูป') return false;
        
        if (selectedPolygon) {
            return isPointInPolygon(p.lat, p.lng, selectedPolygon);
        } else if (travelDistanceSelection !== 'unlimited' && startCoords) {
            const maxDist = parseInt(travelDistanceSelection);
            const R = 6371;
            const dLat = (p.lat - startCoords.lat) * Math.PI / 180;
            const dLng = (p.lng - startCoords.lng) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(startCoords.lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) * 
                      Math.sin(dLng/2) * Math.sin(dLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
            const distanceKm = R * c; 
            return distanceKm <= maxDist;
        }
        return true;
    });

    for (let i = 0; i < itinerary.length; i++) {
        const place = itinerary[i];
        
        // Check for Lunch (around 11:00 - 14:00)
        if ((mealsChoice === 'lunch' || mealsChoice === 'both') && !lunchAdded && h >= 11 && h < 14) {
            const prevLoc = result.length > 0 ? result[result.length - 1] : (startCoords || place);
            const bestRest = findClosest(restaurants, prevLoc, result);
            if (bestRest) {
                bestRest.id = 'meal_' + Date.now() + Math.random();
                bestRest.timeSpent = 60; // 1 hr for meal
                bestRest.isMeal = true;
                result.push(bestRest);
                lunchAdded = true;
                
                m += 60 + getTravelTime(prevLoc, bestRest, mode);
                h += Math.floor(m / 60);
                m %= 60;
            }
        }
        
        // Check for Dinner (around 17:00 - 20:00)
        if ((mealsChoice === 'dinner' || mealsChoice === 'both') && !dinnerAdded && h >= 17 && h < 20) {
            const prevLoc = result.length > 0 ? result[result.length - 1] : (startCoords || place);
            const bestRest = findClosest(restaurants, prevLoc, result);
            if (bestRest) {
                bestRest.id = 'meal_' + Date.now() + Math.random();
                bestRest.timeSpent = 60;
                bestRest.isMeal = true;
                result.push(bestRest);
                dinnerAdded = true;
                
                m += 60 + getTravelTime(prevLoc, bestRest, mode);
                h += Math.floor(m / 60);
                m %= 60;
            }
        }
        
        result.push(place);
        
        const nextLoc = (i + 1 < itinerary.length) ? itinerary[i+1] : place;
        m += place.timeSpent + getTravelTime(place, nextLoc, mode);
        h += Math.floor(m / 60);
        m %= 60;
    }
    
    // If lunch/dinner wasn't added because time ended early, append it if requested
    if ((mealsChoice === 'lunch' || mealsChoice === 'both') && !lunchAdded) {
        const prevLoc = result.length > 0 ? result[result.length - 1] : (startCoords || {lat:16.43, lng:102.83});
        const bestRest = findClosest(restaurants, prevLoc, result);
        if (bestRest) {
            bestRest.id = 'meal_' + Date.now() + Math.random();
            bestRest.timeSpent = 60;
            bestRest.isMeal = true;
            result.push(bestRest);
        }
    }
    if ((mealsChoice === 'dinner' || mealsChoice === 'both') && !dinnerAdded) {
        const prevLoc = result.length > 0 ? result[result.length - 1] : (startCoords || {lat:16.43, lng:102.83});
        const bestRest = findClosest(restaurants, prevLoc, result);
        if (bestRest) {
            bestRest.id = 'meal_' + Date.now() + Math.random();
            bestRest.timeSpent = 60;
            bestRest.isMeal = true;
            result.push(bestRest);
        }
    }
    
    return result;
}
