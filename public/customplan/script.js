let map;
let markers = [];
let routeLines = [];
let routingControl = null;
const segmentColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E'];
let currentItinerary = [];
let sortableList;
let startCoords = {lat: 16.4322, lng: 102.8236};
let endCoords = null;
let currentRouteCoords = null;
let currentRouteIndices = null;

// Mobile view switcher logic
window.switchCustomMobileView = function(view) {
    const container = document.querySelector('.planner-container');
    if (!container) return;
    container.classList.remove('view-plan', 'view-map');
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

    // Populate time dropdowns
    const startHourSelect = document.getElementById('start-hour');
    if(startHourSelect) {
        let hourOptions = '';
        for(let h=5; h<=23; h++) {
            let hourStr = String(h).padStart(2, '0');
            hourOptions += `<option value="${hourStr}">${hourStr}</option>`;
        }
        startHourSelect.innerHTML = hourOptions;
        startHourSelect.value = '09';
        
        const syncTimeInputs = () => {
            const sh = document.getElementById('start-hour').value;
            const sm = document.getElementById('start-minute').value;
            document.getElementById('start-time').value = `${sh}:${sm}`;
            // If we have an itinerary, re-render to update times
            if (currentItinerary.length > 0) {
                renderItineraryList();
            }
        };
        
        startHourSelect.addEventListener('change', syncTimeInputs);
        document.getElementById('start-minute').addEventListener('change', syncTimeInputs);
        syncTimeInputs();
    }

    // Initialize Sortable
    const itineraryEl = document.getElementById('itinerary-list');
    if (itineraryEl) {
        sortableList = new Sortable(itineraryEl, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function() {
                updateItineraryOrderFromDOM();
            }
        });
    }

    // Autocomplete start location
    const startInput = document.getElementById('start-location');
    const autocompleteList = document.getElementById('autocomplete-list');
    startInput.addEventListener('input', function() {
        handleAutocomplete(this.value, autocompleteList, (place) => {
            startInput.value = place.name;
            startCoords = { lat: place.lat, lng: place.lng };
            currentRouteCoords = null;
            currentRouteIndices = null;
            updateMap();
            map.setView([place.lat, place.lng], 14);
            if (currentItinerary.length > 0) renderItineraryList();
        });
    });

    // Autocomplete end location
    const endInput = document.getElementById('end-location');
    const endAutocompleteList = document.getElementById('end-autocomplete-list');
    endInput.addEventListener('input', function() {
        handleAutocomplete(this.value, endAutocompleteList, (place) => {
            endInput.value = place.name;
            endCoords = { lat: place.lat, lng: place.lng };
            currentRouteCoords = null;
            currentRouteIndices = null;
            updateMap();
            map.setView([place.lat, place.lng], 14);
            if (currentItinerary.length > 0) renderItineraryList();
        });
    });

    document.addEventListener('click', function(e) {
        if (e.target !== startInput) autocompleteList.style.display = 'none';
        if (e.target !== endInput) endAutocompleteList.style.display = 'none';
    });

    // Add place modal search
    document.getElementById('modal-search').addEventListener('input', function(e) {
        renderAvailablePlaces(e.target.value);
    });

    // โหลดข้อมูลล่าสุดจาก PostgreSQL API
    if (typeof loadPlaces === 'function') {
        loadPlaces().then(() => {
            renderAvailablePlaces();
        });
    }
    window.addEventListener('placesUpdated', () => {
        renderAvailablePlaces();
    });
});

function handleAutocomplete(val, listEl, onSelect) {
    listEl.innerHTML = '';
    if (!val) {
        listEl.style.display = 'none';
        return;
    }
    const allPlaces = getPlaces();
    const matches = allPlaces.filter(p => p.name.toLowerCase().includes(val.toLowerCase()));
    
    if (matches.length > 0) {
        listEl.style.display = 'block';
        matches.forEach(place => {
            const div = document.createElement('div');
            div.innerHTML = `<strong>${place.name}</strong> <span style="font-size:0.8rem; color:var(--text-muted); margin-left:0.5rem;">(${place.category})</span>`;
            div.addEventListener('click', () => {
                onSelect(place);
                listEl.style.display = 'none';
            });
            listEl.appendChild(div);
        });
    } else {
        listEl.style.display = 'none';
    }
}

window.clearEndLocation = function() {
    document.getElementById('end-location').value = '';
    endCoords = null;
    currentRouteCoords = null;
    currentRouteIndices = null;
    updateMap();
    if (currentItinerary.length > 0) renderItineraryList();
};

window.useStartLocationAsEnd = function() {
    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');
    if (startInput.value && startCoords) {
        endInput.value = startInput.value;
        endCoords = { lat: startCoords.lat, lng: startCoords.lng };
        currentRouteCoords = null;
        currentRouteIndices = null;
        updateMap();
        if (currentItinerary.length > 0) renderItineraryList();
    } else {
        alert("กรุณาระบุจุดเริ่มต้นก่อนครับ");
    }
};

function initMap() {
    map = L.map('map').setView([16.4322, 102.8236], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
}

function useCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                document.getElementById('start-location').value = `ตำแหน่งปัจจุบัน (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                startCoords = { lat: lat, lng: lng };
                currentRouteCoords = null;
                currentRouteIndices = null;
                updateMap();
                map.setView([lat, lng], 14);
                if (currentItinerary.length > 0) renderItineraryList();
            },
            () => { alert('ไม่สามารถดึงตำแหน่งปัจจุบันได้'); }
        );
    } else {
        alert('เบราว์เซอร์ของคุณไม่รองรับ Geolocation');
    }
}

// Custom Route Calculation
window.calculateCustomRoute = function() {
    if (currentItinerary.length === 0) {
        alert('กรุณาเพิ่มสถานที่ในแผนก่อนคำนวณเส้นทาง');
        return;
    }
    
    document.getElementById('trip-summary').style.display = 'none';
    
    // Clear route coords before new calculation
    currentRouteCoords = null;
    currentRouteIndices = null;
    
    updateScheduleWithRealTimes(true).then(() => {
        updateMap();
    }).catch(err => {
        console.error("Schedule error:", err);
        renderItineraryList();
        updateMap();
    });
};

function updateItineraryOrderFromDOM() {
    const listItems = document.querySelectorAll('.itinerary-item');
    const newOrder = [];
    listItems.forEach(item => {
        const id = String(item.dataset.id);
        const place = currentItinerary.find(p => String(p.id) === id);
        if (place) newOrder.push(place);
    });
    currentItinerary = newOrder;
    // Remove computed real times as order changed
    currentItinerary.forEach(p => p.realTravelMins = undefined);
    currentRouteCoords = null;
    currentRouteIndices = null;
    renderItineraryList();
    updateMap();
}

function removePlace(id) {
    const targetId = String(id);
    currentItinerary = currentItinerary.filter(p => String(p.id) !== targetId);
    currentRouteCoords = null;
    currentRouteIndices = null;
    if (currentItinerary.length === 0) {
        document.getElementById('itinerary-list').innerHTML = `
            <div id="empty-state" style="text-align: center; color: #6B7280; padding: 2rem 0; font-size: 0.95rem;">
                ยังไม่มีสถานที่ในแผน<br>คลิก "เพิ่มสถานที่" เพื่อเริ่มจัดทริป
            </div>`;
        document.getElementById('trip-summary').style.display = 'none';
    } else {
        renderItineraryList();
    }
    updateMap();
}

function renderItineraryList() {
    const list = document.getElementById('itinerary-list');
    if (!list) return;
    
    if (currentItinerary.length === 0) return;
    
    list.innerHTML = '';
    
    let startTimeStr = document.getElementById('start-time').value || '09:00';
    let [hours, minutes] = startTimeStr.split(':').map(Number);
    if (isNaN(hours)) hours = 9;
    if (isNaN(minutes)) minutes = 0;
    
    let prevLoc = startCoords;
    const mode = document.getElementById('transport-mode').value;
    
    let allWaypointsForList = [...currentItinerary];
    if (endCoords) {
        allWaypointsForList.push({
            id: 'end_point',
            name: document.getElementById('end-location').value || 'จุดสิ้นสุดการเดินทาง',
            lat: endCoords.lat,
            lng: endCoords.lng,
            timeSpent: 0,
            isEndLocation: true,
            category: 'จุดสิ้นสุด'
        });
    }

    allWaypointsForList.forEach((place, index) => {
        const timeToSpend = place.timeSpent !== undefined ? place.timeSpent : 60;
        
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
        
        const item = document.createElement('div');
        item.className = 'itinerary-item';
        item.dataset.id = place.id;
        
        if (place.isEndLocation) {
            item.innerHTML = `
                <div class="item-time" style="color:#1E3A8A;">${place.startTime}</div>
                <div class="item-details">
                    <h4 style="color:#1E3A8A;"><i class="fa-solid fa-flag-checkered"></i> ${place.name}</h4>
                    <p style="color:#6B7280; font-size:0.8rem;">จบการเดินทาง</p>
                </div>
            `;
            item.style.cursor = 'default';
        } else {
            item.innerHTML = `
                <div class="item-time">${place.startTime}</div>
                <div class="item-details">
                    <h4>${place.name}</h4>
                    <p style="display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-hourglass-half"></i> 
                        <input type="number" value="${place.timeSpent}" min="5" step="5" style="width: 60px; padding: 2px 5px; border-radius: 4px; border: 1px solid #ccc;" onchange="updatePlaceTime('${place.id}', this.value)"> นาที
                    </p>
                    <p>
                        <span style="margin-right: 10px;"><i class="fa-solid fa-tag"></i> ${place.category}</span>
                    </p>
                </div>
                <div class="item-actions">
                    <i class="fa-solid fa-xmark action-icon" onclick="removePlace('${place.id}')"></i>
                </div>
            `;
        }
        list.appendChild(item);
    });
    
    updateSummary();
}

window.updatePlaceTime = function(id, newTime) {
    const time = parseInt(newTime);
    if (isNaN(time) || time < 5) return;
    const targetId = String(id);
    const place = currentItinerary.find(p => String(p.id) === targetId);
    if (place) {
        place.timeSpent = time;
        currentRouteCoords = null;
        currentRouteIndices = null;
        renderItineraryList();
    }
};

function formatTime(h, m) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function updateSummary() {
    if (currentItinerary.length === 0 || !currentRouteCoords) {
        document.getElementById('trip-summary').style.display = 'none';
        return;
    }
    document.getElementById('trip-summary').style.display = 'flex';
    
    let totalMins = 0;
    let totalDistKm = 0;
    
    let prevLoc = startCoords;
    const mode = document.getElementById('transport-mode').value;
    
    let allWaypoints = [...currentItinerary];
    if (endCoords) {
        allWaypoints.push({lat: endCoords.lat, lng: endCoords.lng, timeSpent: 0});
    }

    allWaypoints.forEach(place => {
        if (prevLoc) {
            if (place.realTravelMins !== undefined) {
                totalMins += place.realTravelMins;
                totalDistKm += (place.realDistKm || 0);
            } else {
                totalMins += getTravelTime(prevLoc, place, mode);
                totalDistKm += estimateDistanceKm(prevLoc, place);
            }
        }
        totalMins += (place.timeSpent || 0);
        prevLoc = place;
    });
    
    const h = Math.floor(totalMins / 60);
    const m = Math.floor(totalMins % 60);
    document.getElementById('summary-time').innerText = h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
    document.getElementById('summary-distance').innerText = `${totalDistKm.toFixed(1)} กม.`;
}

// Distance estimation fallback
function estimateDistanceKm(p1, p2) {
    const R = 6371;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * 
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c * 1.3; // multiply by 1.3 to roughly estimate road distance vs straight line
}

function getTravelTime(p1, p2, mode) {
    const distKm = estimateDistanceKm(p1, p2);
    let speedKmH = mode === 'motorcycle' ? 40 : 50;
    if (distKm > 15) speedKmH += 20; // faster outside city
    return Math.ceil((distKm / speedKmH) * 60);
}

// Add Place Modal logic
window.openAddPlaceModal = function() {
    const searchInput = document.getElementById('modal-search');
    if (searchInput) searchInput.value = '';
    document.getElementById('addPlaceModal').style.display = 'block';
    renderAvailablePlaces();
};

window.closeAddPlaceModal = function() {
    document.getElementById('addPlaceModal').style.display = 'none';
};

window.onclick = function(event) {
    const modal = document.getElementById('addPlaceModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};

function renderAvailablePlaces(searchQuery = '') {
    const list = document.getElementById('available-places');
    list.innerHTML = '';
    
    let allPlaces = getPlaces();
    if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        allPlaces = allPlaces.filter(p => (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
    }
    
    // Filter out places already in itinerary (เปรียบเทียบแบบ String ป้องกัน Type mismatch)
    const addedIds = currentItinerary.map(p => String(p.id));
    allPlaces = allPlaces.filter(p => !addedIds.includes(String(p.id)));
    
    if (allPlaces.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">ไม่พบสถานที่</div>';
        return;
    }

    // Show top 30 to not overwhelm
    allPlaces.slice(0, 30).forEach(place => {
        const div = document.createElement('div');
        div.className = 'add-place-item';
        const placeIdStr = String(place.id);
        div.innerHTML = `
            <div>
                <h4>${place.name}</h4>
                <p style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-solid fa-tag"></i> ${place.category} | <i class="fa-solid fa-star" style="color:#F59E0B"></i> ${place.rating || '4.5'}</p>
            </div>
            <button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="addPlaceToItinerary('${placeIdStr}')"><i class="fa-solid fa-plus"></i></button>
        `;
        list.appendChild(div);
    });
}

window.addPlaceToItinerary = function(id) {
    const allPlaces = getPlaces();
    const targetId = String(id);
    const place = allPlaces.find(p => String(p.id) === targetId);
    if (place) {
        const placeClone = {...place, id: String(place.id)};
        if(!placeClone.timeSpent) placeClone.timeSpent = 60; // default
        currentItinerary.push(placeClone);
        
        currentRouteCoords = null;
        currentRouteIndices = null;
        
        closeAddPlaceModal();
        renderItineraryList();
        updateMap();
    }
};

// Map and Routing logic
function updateMap() {
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
                iconAnchor: [17, 34]
            })
        }).addTo(map).bindPopup(`<b>จุดเริ่มต้น</b>`);
        markers.push(startMarker);
    }

    if (currentItinerary.length > 0) {
        currentItinerary.forEach((place, index) => {
            const latlng = [place.lat, place.lng];
            latlngs.push(latlng);
            
            const marker = L.marker(latlng, {
                icon: L.divIcon({
                    className: 'place-marker-container',
                    html: `
                        <div class="place-marker">
                            <div class="place-marker-img" style="background-image: url('${place.image || 'https://via.placeholder.com/150'}')"></div>
                            <div class="place-marker-num">${index + 1}</div>
                        </div>
                    `,
                    iconSize: [44, 44],
                    iconAnchor: [22, 22]
                })
            }).addTo(map).bindPopup(`<b>${index + 1}. ${place.name}</b>`);
            markers.push(marker);
        });
    }
    
    if (endCoords) {
        const endLatLng = [endCoords.lat, endCoords.lng];
        latlngs.push(endLatLng);
        
        const isSameAsStart = startCoords && (Math.abs(startCoords.lat - endCoords.lat) < 0.0001 && Math.abs(startCoords.lng - endCoords.lng) < 0.0001);
        if (!isSameAsStart) {
            const endMarker = L.marker(endLatLng, {
                icon: L.divIcon({
                    className: 'place-marker-container',
                    html: `
                        <div class="end-marker-pin">
                            <i class="fa-solid fa-flag-checkered"></i>
                        </div>
                    `,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                })
            }).addTo(map).bindPopup(`<b>จุดสิ้นสุด</b>`);
            markers.push(endMarker);
        }
    }
    
    // Draw route if we calculated it
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
    }
    
    if (latlngs.length > 0) {
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

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
            return null; // Don't try to parse json if it's an error we can't retry
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
            return { times, coords, indices, legs };
        } else if (data.code === 'NoRoute' && !useRadiuses && retries > 0) {
            // If it failed to find a route because points are too far off-road, retry with expanded radiuses!
            return getRealTravelTimes(waypoints, mode, retries - 1, true);
        }
    } catch(err) {
        console.error("OSRM fetch error:", err);
    }
    return null;
}

// True Route Calculation using OSRM
async function updateScheduleWithRealTimes(renderRoute = true) {
    if (!startCoords || currentItinerary.length === 0) {
        renderItineraryList();
        return;
    }
    
    const waypoints = [];
    waypoints.push(startCoords);
    currentItinerary.forEach(p => waypoints.push(p));
    
    if (endCoords) {
        waypoints.push(endCoords);
    }
    
    const mode = document.getElementById('transport-mode').value || 'car';
    const result = await getRealTravelTimes(waypoints, mode);
    
    if (result && result.times && result.times.length > 0) {
        if (renderRoute && result.coords && result.indices) {
            currentRouteCoords = result.coords;
            currentRouteIndices = result.indices;
        }
        
        currentItinerary.forEach((p, i) => {
            p.realTravelMins = result.times[i] || 15;
            if (result.legs && result.legs[i]) {
                p.realDistKm = result.legs[i].distance / 1000;
            }
        });
    } else {
        // Fallback
        let prev = startCoords;
        currentItinerary.forEach(p => {
            p.realTravelMins = getTravelTime(prev, p, mode);
            prev = p;
        });
        if (renderRoute) {
            currentRouteCoords = null;
            currentRouteIndices = null;
        }
    }
    
    renderItineraryList();
}
