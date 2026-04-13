// ============================================================
// Office Locations Management (director only)
// Uses OpenStreetMap Nominatim for place search — no API key needed
// ============================================================

var _locSearchTimer = null;
var _locSelected = null; // { lat, lng, address, displayName }
var _locSearchResults = []; // cache raw Nominatim results for safe onclick reference

function debounceLocSearch() {
    clearTimeout(_locSearchTimer);
    _locSearchTimer = setTimeout(runLocSearch, 400);
}

async function runLocSearch() {
    var q = (document.getElementById('loc-search-input').value || '').trim();
    var results = document.getElementById('loc-search-results');
    var spinner = document.getElementById('loc-search-spinner');
    if (q.length < 3) { results.classList.add('hidden'); return; }
    spinner.classList.remove('hidden');
    try {
        var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=IN&q=' + encodeURIComponent(q);
        var res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        var data = await res.json();
        spinner.classList.add('hidden');
        if (!data || data.length === 0) {
            results.innerHTML = '<p class="px-4 py-3 text-gray-400 text-xs">No results found</p>';
            results.classList.remove('hidden');
            return;
        }
        _locSearchResults = data;
        results.innerHTML = data.map(function (r, i) {
            var name = r.display_name || '';
            var short = name.length > 80 ? name.substring(0, 80) + '…' : name;
            return '<button type="button" class="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"'
                + ' onclick="selectLocResult(' + i + ')">'
                + '<span class="text-sm text-gray-800">' + esc(short) + '</span>'
                + '<span class="block text-xs text-gray-400">' + parseFloat(r.lat).toFixed(5) + ', ' + parseFloat(r.lon).toFixed(5) + '</span>'
                + '</button>';
        }).join('');
        results.classList.remove('hidden');
    } catch (e) {
        spinner.classList.add('hidden');
        results.innerHTML = '<p class="px-4 py-3 text-red-400 text-xs">Search failed. Check internet connection.</p>';
        results.classList.remove('hidden');
    }
}

function selectLocResult(index) {
    var r = _locSearchResults[index];
    if (!r) return;
    var displayName = r.display_name || '';
    _locSelected = { lat: parseFloat(r.lat), lng: parseFloat(r.lon), address: displayName, displayName: displayName };
    document.getElementById('loc-search-results').classList.add('hidden');
    document.getElementById('loc-search-input').value = '';
    showLocPreview(_locSelected);
}

function useCurrentLocation() {
    if (!navigator.geolocation) { showToast('Geolocation not supported by your browser', 'error'); return; }
    showToast('Getting your location…', 'info');
    navigator.geolocation.getCurrentPosition(async function (pos) {
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        // Reverse geocode
        try {
            var res = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng);
            var data = await res.json();
            var addr = data.display_name || (lat.toFixed(5) + ', ' + lng.toFixed(5));
            _locSelected = { lat: lat, lng: lng, address: addr, displayName: addr };
            showLocPreview(_locSelected);
        } catch (e) {
            _locSelected = { lat: lat, lng: lng, address: lat.toFixed(5) + ', ' + lng.toFixed(5), displayName: 'Current Location' };
            showLocPreview(_locSelected);
        }
    }, function (err) {
        showToast('Could not get location: ' + err.message, 'error');
    }, { enableHighAccuracy: true, timeout: 10000 });
}

function showLocPreview(loc) {
    document.getElementById('loc-preview-name').textContent = loc.displayName.split(',')[0];
    document.getElementById('loc-preview-addr').textContent = loc.address;
    document.getElementById('loc-preview-coords').textContent = loc.lat.toFixed(6) + ', ' + loc.lng.toFixed(6);
    document.getElementById('loc-name-input').value = loc.displayName.split(',')[0];
    document.getElementById('loc-selected-preview').classList.remove('hidden');
}

function clearLocSelection() {
    _locSelected = null;
    document.getElementById('loc-selected-preview').classList.add('hidden');
    document.getElementById('loc-search-input').value = '';
}

async function saveOfficeLocation() {
    if (!_locSelected) { showToast('Please search and select a location first', 'error'); return; }
    var name = (document.getElementById('loc-name-input').value || '').trim();
    var radius = parseFloat(document.getElementById('loc-radius-input').value) || 50;
    if (!name) { showToast('Please enter a name for this location', 'error'); return; }
    try {
        await Api.post('/attendance/office-locations', {
            name: name,
            address: _locSelected.address,
            latitude: _locSelected.lat,
            longitude: _locSelected.lng,
            radius_meters: radius,
        });
        showToast('Location added!', 'success');
        clearLocSelection();
        loadOfficeLocations();
    } catch (e) {
        showToast(e.message || 'Failed to save location', 'error');
    }
}

async function loadOfficeLocations() {
    var c = document.getElementById('office-locations-list');
    if (!c) return;
    try {
        var locs = await Api.get('/attendance/office-locations');
        if (!locs || locs.length === 0) {
            c.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No office locations added yet.<br>Add one above to restrict clock-in to specific areas.</p>';
            return;
        }
        var h = '<table class="min-w-full text-sm divide-y divide-gray-100"><thead class="bg-gray-50"><tr>'
            + '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>'
            + '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Address</th>'
            + '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Coordinates</th>'
            + '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Radius</th>'
            + '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>'
            + '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>'
            + '</tr></thead><tbody class="divide-y divide-gray-50">';
        locs.forEach(function (l) {
            var statusBadge = l.is_active
                ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>'
                : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>';
            var toggleLabel = l.is_active ? 'Disable' : 'Enable';
            var addr = l.address ? (l.address.length > 50 ? l.address.substring(0, 50) + '…' : l.address) : '—';
            h += '<tr class="hover:bg-gray-50/60">'
                + '<td class="px-4 py-3 font-medium text-gray-800">' + esc(l.name) + '</td>'
                + '<td class="px-4 py-3 text-gray-500 max-w-xs" title="' + esc(l.address || '') + '">' + esc(addr) + '</td>'
                + '<td class="px-4 py-3 text-gray-500 font-mono text-xs">' + parseFloat(l.latitude).toFixed(5) + ', ' + parseFloat(l.longitude).toFixed(5) + '</td>'
                + '<td class="px-4 py-3 text-gray-600">' + l.radius_meters + 'm</td>'
                + '<td class="px-4 py-3">' + statusBadge + '</td>'
                + '<td class="px-4 py-3 flex items-center gap-2 flex-wrap">'
                + '<button onclick="assignLocationToAll(' + l.id + ',' + JSON.stringify(l.name) + ')" class="text-xs text-emerald-600 hover:text-emerald-800 font-semibold whitespace-nowrap">Assign to all</button>'
                + '<span class="text-gray-200">|</span>'
                + '<button onclick="toggleOfficeLocation(' + l.id + ',' + l.is_active + ')" class="text-xs text-blue-600 hover:text-blue-800 font-medium">' + toggleLabel + '</button>'
                + '<span class="text-gray-200">|</span>'
                + '<button onclick="deleteOfficeLocation(' + l.id + ')" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>'
                + '</td></tr>';
        });
        h += '</tbody></table>';
        c.innerHTML = h;
    } catch (e) {
        c.innerHTML = '<p class="text-sm text-red-400 text-center py-6">Failed to load locations</p>';
    }
}

async function toggleOfficeLocation(id, isActive) {
    try {
        await Api.patch('/attendance/office-locations/' + id, { is_active: !isActive });
        loadOfficeLocations();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
}

async function assignLocationToAll(id, name) {
    if (!confirm('Assign "' + name + '" as the clock-in location for ALL employees, managers, and interns? This will overwrite their current location setting.')) return;
    try {
        var res = await Api.post('/attendance/office-locations/' + id + '/assign-all', {});
        showToast(res.message || 'Location assigned to all users!', 'success');
    } catch (e) { showToast(e.message || 'Failed to assign', 'error'); }
}

async function deleteOfficeLocation(id) {
    if (!confirm('Delete this office location? Employees will no longer be restricted to it.')) return;
    try {
        await Api.delete('/attendance/office-locations/' + id);
        showToast('Location deleted', 'success');
        loadOfficeLocations();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
}

function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
