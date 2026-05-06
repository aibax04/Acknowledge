// ============================================
// ATTENDANCE CLOCK IN/OUT WIDGET + MONTHLY VIEW
// ============================================
var attendanceTodayData = null;
var clockIntervalId = null;
var attendanceMonthDate = new Date();
var _geoStatus = null; // { allowed, location_name, distance, detail } — cached per page load

function startLiveClock() {
    var el = document.getElementById('live-clock');
    if (!el) return;
    function update() {
        var now = new Date();
        el.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    }
    update();
    clockIntervalId = setInterval(update, 1000);
}

function getUserLocation() {
    return new Promise(function (resolve) {
        if (!navigator.geolocation) { resolve({ latitude: null, longitude: null, address: 'Location not available' }); return; }
        navigator.geolocation.getCurrentPosition(
            function (pos) { resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, address: pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4) }); },
            function () { resolve({ latitude: null, longitude: null, address: 'Location denied' }); },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

/** Check geofence and cache result. Returns { allowed, location_name, distance, detail } */
async function checkGeoFence() {
    var loc = await getUserLocation();
    if (loc.latitude === null) {
        _geoStatus = { allowed: false, detail: 'Location access denied. Please enable GPS/location permissions.' };
        return _geoStatus;
    }
    try {
        var res = await Api.get('/attendance/office-locations/check?lat=' + loc.latitude + '&lng=' + loc.longitude);
        _geoStatus = Object.assign({ lat: loc.latitude, lng: loc.longitude }, res);
        return _geoStatus;
    } catch (e) {
        // If endpoint fails (e.g. no locations configured), allow clock-in
        _geoStatus = { allowed: true, location_name: null, distance: null };
        return _geoStatus;
    }
}

function _geoStatusBadge(geo) {
    if (!geo) return '';
    if (geo.allowed) {
        var txt = geo.location_name ? '📍 ' + geo.location_name + (geo.distance != null ? ' (' + geo.distance + 'm)' : '') : '📍 Location OK';
        return '<div class="text-[10px] text-green-600 bg-green-50 border border-green-100 rounded-lg px-2 py-1 mt-1">' + txt + '</div>';
    } else {
        var msg = geo.detail || 'You are outside the allowed area.';
        return '<div class="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1 mt-1">' + msg + '</div>';
    }
}

async function loadTodayAttendance() {
    try { attendanceTodayData = await Api.get('/attendance/today'); }
    catch (e) { console.error('Failed to load today attendance:', e); }
    // Check geofence in parallel with rendering — update widget once done
    renderClockWidget();
    checkGeoFence().then(function() { renderClockWidget(); });
}

function renderClockWidget() {
    var c = document.getElementById('clock-widget');
    if (!c) return;
    var d = attendanceTodayData;
    if (!d) { c.innerHTML = '<p class="text-xs text-gray-400">Loading...</p>'; return; }
    if (d.status === 'no_office') { c.innerHTML = '<div class="text-center"><p class="text-xs text-amber-600 font-medium mb-1">Office not set</p><button onclick="openOfficeSetupModal()" class="text-xs bg-primary text-white px-3 py-1 rounded-lg hover:bg-primary-hover">Set Office</button></div>'; return; }
    if (d.status === 'weekly_off') { c.innerHTML = '<div class="text-center"><div class="text-xs font-bold text-blue-600 bg-blue-50 rounded-lg px-3 py-2">Weekly Off</div></div>'; return; }
    if (d.status === 'holiday') { c.innerHTML = '<div class="text-center"><div class="text-xs font-bold text-purple-600 bg-purple-50 rounded-lg px-3 py-2">' + (d.message || 'Holiday') + '</div></div>'; return; }

    var geoOk = !_geoStatus || _geoStatus.allowed;
    var isRemote = d.is_remote || false;
    var h = '<div class="text-center space-y-2"><div id="live-clock" class="text-lg font-bold text-gray-800 tabular-nums"></div>';

    // Remote badge
    if (isRemote) {
        h += '<div class="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1">🏠 Working Remotely</div>';
    }

    if (d.clock_in && d.clock_out) {
        var ti = new Date(d.clock_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        var to = new Date(d.clock_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        h += '<div class="text-[10px] text-green-600 font-medium bg-green-50 rounded-lg px-2 py-1.5"><span class="block">In: ' + ti + '</span><span class="block">Out: ' + to + '</span></div>';
    } else if (d.clock_in && !d.clock_out) {
        var ti2 = new Date(d.clock_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        h += '<div class="text-[10px] text-green-600 font-medium">Clocked in: ' + ti2 + '</div>';
        if (geoOk) {
            h += '<button onclick="handleClockOut()" id="btn-clock-out" class="w-full text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 font-medium transition-colors">Clock Out</button>';
        } else {
            h += '<button disabled class="w-full text-xs bg-gray-200 text-gray-400 px-3 py-1.5 rounded-lg font-medium cursor-not-allowed">Clock Out</button>';
            h += '<button onclick="handleRemoteClockOut()" class="w-full text-xs bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600 font-medium transition-colors mt-1">🏠 Clock Out Remotely</button>';
        }
        h += _geoStatusBadge(_geoStatus);
    } else {
        if (geoOk) {
            h += '<button onclick="handleClockIn()" id="btn-clock-in" class="w-full text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-hover font-medium transition-colors">Clock In</button>';
        } else {
            h += '<button disabled class="w-full text-xs bg-gray-200 text-gray-400 px-3 py-1.5 rounded-lg font-medium cursor-not-allowed">Clock In</button>';
            if (!isRemote) {
                h += '<button onclick="handleMarkRemote()" class="w-full text-xs bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600 font-medium transition-colors mt-1">🏠 Working Remotely</button>';
            }
        }
        h += _geoStatusBadge(_geoStatus);
    }
    h += '</div>';
    c.innerHTML = h;
    startLiveClock();
}

async function handleClockIn() {
    var btn = document.getElementById('btn-clock-in');
    if (!confirm('Are you sure you want to Clock In now?')) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Getting location...'; }
    try {
        var loc = await getUserLocation();
        if (btn) btn.textContent = 'Clocking in...';
        await Api.post('/attendance/clock-in', { latitude: loc.latitude, longitude: loc.longitude, address: loc.address });
        if (typeof showToast === 'function') showToast('Clocked in successfully!', 'success');
        _geoStatus = null;
        await loadTodayAttendance();
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Failed to clock in', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Clock In'; }
    }
}

async function handleClockOut() {
    var btn = document.getElementById('btn-clock-out');
    if (!confirm('Are you sure you want to Clock Out now?')) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Getting location...'; }
    try {
        var loc = await getUserLocation();
        if (btn) btn.textContent = 'Clocking out...';
        await Api.post('/attendance/clock-out', { latitude: loc.latitude, longitude: loc.longitude, address: loc.address });
        if (typeof showToast === 'function') showToast('Clocked out successfully!', 'success');
        _geoStatus = null;
        await loadTodayAttendance();
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Failed to clock out', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Clock Out'; }
    }
}

async function handleMarkRemote() {
    if (!confirm('Mark yourself as working remotely today? This will clock you in and note that you are working from a remote location.')) return;
    try {
        await Api.post('/attendance/mark-remote', {});
        if (typeof showToast === 'function') showToast('Marked as working remotely!', 'success');
        _geoStatus = null;
        await loadTodayAttendance();
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Failed to mark remote', 'error');
    }
}

async function handleRemoteClockOut() {
    if (!confirm('Clock out remotely? This will record your clock-out from a remote location.')) return;
    try {
        var loc = await getUserLocation();
        await Api.post('/attendance/clock-out', { latitude: loc.latitude, longitude: loc.longitude, address: loc.address, remote: true });
        if (typeof showToast === 'function') showToast('Clocked out remotely!', 'success');
        _geoStatus = null;
        await loadTodayAttendance();
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Failed to clock out', 'error');
    }
}

var _selectedOfficeType = null;

function openOfficeSetupModal() {
    _selectedOfficeType = null;
    var m = document.getElementById('office-setup-modal'); if (!m) return;
    // Reset UI
    m.querySelectorAll('.office-type-btn').forEach(function(b) { b.classList.remove('border-primary', 'bg-primary/5'); });
    var locSection = document.getElementById('office-location-section');
    var confirmRow = document.getElementById('office-setup-confirm-row');
    if (locSection) locSection.classList.add('hidden');
    if (confirmRow) confirmRow.classList.add('hidden');
    m.classList.remove('hidden');
    // Load office locations into dropdown
    _loadOfficeLocationDropdown();
}

var _officeLocations = []; // cached list of active office locations

async function _loadOfficeLocationDropdown() {
    var container = document.getElementById('office-location-cards');
    if (!container) return;
    container.innerHTML = '<p class="text-xs text-gray-400 py-2">Loading locations...</p>';
    try {
        var locs = await Api.get('/attendance/office-locations');
        _officeLocations = (locs || []).filter(function(l) { return l.is_active; });
        if (_officeLocations.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 py-2">No office locations configured.</p>';
            return;
        }
        container.innerHTML = _officeLocations.map(function(l) {
            var addr = l.address ? l.address.split(',').slice(0,2).join(',') : '';
            return '<button type="button" onclick="pickOfficeLocation(' + l.id + ', this)"'
                + ' class="office-loc-card w-full text-left p-3 border border-gray-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors">'
                + '<p class="font-medium text-sm text-gray-800">' + _escHtml(l.name) + '</p>'
                + (addr ? '<p class="text-xs text-gray-400 mt-0.5 truncate">' + _escHtml(addr) + '</p>' : '')
                + '</button>';
        }).join('');
    } catch(e) {
        container.innerHTML = '<p class="text-xs text-red-400 py-2">Failed to load locations.</p>';
    }
}

function _escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function selectOfficeType(office, btn) {
    _selectedOfficeType = office;
    document.querySelectorAll('.office-type-btn').forEach(function(b) {
        b.classList.remove('border-primary', 'bg-primary/5');
    });
    btn.classList.add('border-primary', 'bg-primary/5');
    var locSection = document.getElementById('office-location-section');
    if (locSection) locSection.classList.remove('hidden');
    // If there are no locations, show save button directly
    var cards = document.getElementById('office-location-cards');
    var hasLocations = cards && cards.querySelectorAll('.office-loc-card').length > 0;
    var confirmRow = document.getElementById('office-setup-confirm-row');
    if (confirmRow) confirmRow.classList.toggle('hidden', hasLocations);
}

async function pickOfficeLocation(locationId, btn) {
    if (!_selectedOfficeType) { if (typeof showToast === 'function') showToast('Please select an office type first', 'error'); return; }
    // Highlight selected card
    document.querySelectorAll('.office-loc-card').forEach(function(b) {
        b.classList.remove('border-primary', 'bg-primary/5');
    });
    btn.classList.add('border-primary', 'bg-primary/5');
    // Auto-save immediately
    await _doSaveOfficeSetup(_selectedOfficeType, locationId);
}

async function confirmOfficeSetup() {
    if (!_selectedOfficeType) { if (typeof showToast === 'function') showToast('Please select an office type first', 'error'); return; }
    await _doSaveOfficeSetup(_selectedOfficeType, null);
}

async function _doSaveOfficeSetup(office, locationId) {
    try {
        var payload = { office: office, office_location_id: locationId ? locationId : 0 };
        await Api.post('/auth/me', payload);
        if (typeof showToast === 'function') showToast('Office saved!', 'success');
        var m = document.getElementById('office-setup-modal'); if (m) m.classList.add('hidden');
        if (typeof currentUser !== 'undefined' && currentUser) {
            currentUser.office = office;
            currentUser.office_location_id = locationId || null;
        }
        _geoStatus = null;
        await loadTodayAttendance();
    } catch (e) { if (typeof showToast === 'function') showToast(e.message || 'Failed', 'error'); }
}

async function saveOffice(office) {
    try {
        await Api.post('/auth/me', { office: office });
        if (typeof showToast === 'function') showToast('Office set!', 'success');
        var m = document.getElementById('office-setup-modal'); if (m) m.classList.add('hidden');
        if (typeof currentUser !== 'undefined' && currentUser) currentUser.office = office;
        await loadTodayAttendance();
    } catch (e) { if (typeof showToast === 'function') showToast(e.message || 'Failed', 'error'); }
}

// MONTHLY VIEW
var _attendanceData = null; // cached for update modal

async function loadAttendanceTab() {
    var container = document.getElementById('attendance-monthly-view');
    if (!container) return;
    var yr = attendanceMonthDate.getFullYear(), mo = attendanceMonthDate.getMonth() + 1;
    container.innerHTML = '<div class="text-center py-8"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>';
    try {
        var data = await Api.get('/attendance/monthly?year=' + yr + '&month=' + mo);
        _attendanceData = data;
        renderAttendanceMonthly(data);
    } catch (e) { container.innerHTML = '<div class="text-center py-8 text-red-500">' + (e.message || 'Failed') + '</div>'; }
}

function renderAttendanceMonthly(data) {
    var container = document.getElementById('attendance-monthly-view');
    if (!container) return;
    var label = document.getElementById('attendance-month-label');
    if (label) { var dd = new Date(data.year, data.month - 1); label.textContent = dd.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
    var sc = { present: 'bg-green-100 text-green-800', absent: 'bg-red-100 text-red-800', weekly_off: 'bg-gray-100 text-gray-500', holiday: 'bg-purple-100 text-purple-700', on_leave: 'bg-yellow-100 text-yellow-800', future: 'bg-gray-50 text-gray-300' };
    var sl = { present: 'Present', absent: 'Absent', weekly_off: 'Weekly Off', holiday: 'Holiday', on_leave: 'On Leave', future: '-' };
    var pc = 0, ac = 0, wc = 0, hc = 0, lc = 0, rc = 0;
    data.attendance.forEach(function (a) {
        if (a.status === 'present') pc++;
        else if (a.status === 'absent') ac++;
        else if (a.status === 'weekly_off') wc++;
        else if (a.status === 'holiday') hc++;
        else if (a.status === 'on_leave') lc++;
        if (a.is_remote) rc++;
    });
    var h = '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">';
    h += '<div class="text-center p-3 bg-green-50 rounded-lg border border-green-100"><p class="text-2xl font-bold text-green-700">' + pc + '</p><p class="text-[10px] text-green-600 font-medium">Present</p></div>';
    h += '<div class="text-center p-3 bg-red-50 rounded-lg border border-red-100"><p class="text-2xl font-bold text-red-700">' + ac + '</p><p class="text-[10px] text-red-600 font-medium">Absent</p></div>';
    h += '<div class="text-center p-3 bg-indigo-50 rounded-lg border border-indigo-100"><p class="text-2xl font-bold text-indigo-700">' + rc + '</p><p class="text-[10px] text-indigo-600 font-medium">Remote</p></div>';
    h += '<div class="text-center p-3 bg-gray-50 rounded-lg border border-gray-200"><p class="text-2xl font-bold text-gray-500">' + wc + '</p><p class="text-[10px] text-gray-500 font-medium">Weekly Off</p></div>';
    h += '<div class="text-center p-3 bg-purple-50 rounded-lg border border-purple-100"><p class="text-2xl font-bold text-purple-700">' + hc + '</p><p class="text-[10px] text-purple-600 font-medium">Holidays</p></div>';
    h += '<div class="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-100"><p class="text-2xl font-bold text-yellow-700">' + lc + '</p><p class="text-[10px] text-yellow-600 font-medium">On Leave</p></div></div>';
    h += '<div class="overflow-x-auto w-full"><table class="min-w-full divide-y divide-gray-200 text-sm w-full"><thead class="bg-gray-50"><tr><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Day</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Clock In</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Clock Out</th></tr></thead><tbody class="bg-white divide-y divide-gray-100">';
    var dn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var today = new Date().toISOString().split('T')[0];
    data.attendance.forEach(function (a) {
        var dd2 = new Date(a.date + 'T00:00:00'), dayN = dn[dd2.getDay()], cc = sc[a.status] || 'bg-gray-100 text-gray-600', sLabel = a.holiday_name || sl[a.status] || a.status;
        var ci = a.clock_in ? new Date(a.clock_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '-';
        var co = a.clock_out ? new Date(a.clock_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '-';
        var isT = a.date === today;
        // Today with clock_in but no clock_out is still in-progress, not fully present
        var displayStatus = a.status, displayLabel = sLabel, displayCc = cc;
        if (isT && a.status === 'present' && a.clock_in && !a.clock_out) {
            displayStatus = 'in_progress';
            displayLabel = 'In Progress';
            displayCc = 'bg-blue-100 text-blue-700';
        }
        h += '<tr class="' + (isT ? 'bg-primary/5 font-medium' : '') + '">';
        h += '<td class="px-4 py-2 whitespace-nowrap">' + fmtDate(a.date) + (isT ? ' <span class="text-xs text-primary">(Today)</span>' : '') + '</td>';
        h += '<td class="px-4 py-2 whitespace-nowrap">' + dayN + '</td>';
        var remoteBadge = a.is_remote ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-600">Remote</span>' : '';
        h += '<td class="px-4 py-2 whitespace-nowrap"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + displayCc + '">' + displayLabel + '</span>' + remoteBadge + '</td>';
        h += '<td class="px-4 py-2 whitespace-nowrap text-gray-600">' + ci + '</td>';
        h += '<td class="px-4 py-2 whitespace-nowrap text-gray-600">' + co + '</td>';
        h += '</tr>';
    });
    h += '</tbody></table></div>';
    container.innerHTML = h;
}

function attendancePrevMonth() { attendanceMonthDate.setMonth(attendanceMonthDate.getMonth() - 1); loadAttendanceTab(); }
function attendanceNextMonth() { attendanceMonthDate.setMonth(attendanceMonthDate.getMonth() + 1); loadAttendanceTab(); }

async function openAttendanceUpdateModal(dateStr) {
    var modal = document.getElementById('attendance-update-modal'); if (!modal) return;
    document.getElementById('update-att-reason').value = '';
    var ciE = document.getElementById('update-att-clock-in'), coE = document.getElementById('update-att-clock-out');
    var ciCb = document.getElementById('update-att-clock-in-enable'), coCb = document.getElementById('update-att-clock-out-enable');
    if (ciE) { ciE.value = '09:00'; ciE.disabled = false; }
    if (coE) { coE.value = '18:00'; coE.disabled = false; }
    if (ciCb) ciCb.checked = true;
    if (coCb) coCb.checked = true;

    // Set max on "other date" input to yesterday
    var otherDateInput = document.getElementById('update-att-other-date');
    if (otherDateInput) {
        var yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        otherDateInput.max = yesterday.toISOString().split('T')[0];
        otherDateInput.value = '';
    }

    // Populate date dropdown with absent dates and dates missing clock-out
    var dateSel = document.getElementById('update-att-date');
    if (dateSel) {
        var today = new Date().toISOString().split('T')[0];
        var actionableDates = [];
        if (_attendanceData && _attendanceData.attendance) {
            _attendanceData.attendance.forEach(function (a) {
                if (a.date >= today) return; // skip today and future
                if (a.status === 'weekly_off' || a.status === 'holiday' || a.status === 'on_leave') return;
                var needsUpdate = a.status === 'absent' || (a.clock_in && !a.clock_out);
                if (needsUpdate) actionableDates.push(a);
            });
        }
        dateSel.innerHTML = '<option value="">Select date...</option>';
        actionableDates.forEach(function (a) {
            var label = fmtDate(a.date) + (a.status === 'absent' ? ' — Absent' : ' — Missing Clock Out');
            dateSel.innerHTML += '<option value="' + a.date + '">' + label + '</option>';
        });
        // Add a separator and "other date" option to allow any past date
        if (actionableDates.length > 0) {
            dateSel.innerHTML += '<option disabled>──────────</option>';
        }
        dateSel.innerHTML += '<option value="__other__">Other date...</option>';

        // Pre-select the passed date if provided and actionable
        if (dateStr) {
            var found = actionableDates.find(function (a) { return a.date === dateStr; });
            dateSel.value = found ? dateStr : (dateStr !== today ? '__other__' : '');
        }
        _handleOtherDateOption(dateSel.value);
        dateSel.onchange = function () { _handleOtherDateOption(this.value); };
    }

    try {
        var mgrs = await Api.get('/attendance/managers');
        var sel = document.getElementById('update-att-manager');
        var myId = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : null;
        sel.innerHTML = '<option value="">Select Manager...</option>';
        (mgrs || []).forEach(function (m) {
            if (myId != null && m.id === myId) return;
            sel.innerHTML += '<option value="' + m.id + '">' + m.full_name + ' (' + m.role + ')</option>';
        });
    } catch (e) { console.error(e); }
    modal.classList.remove('hidden');
}

function _handleOtherDateOption(val) {
    var otherRow = document.getElementById('update-att-other-date-row');
    if (!otherRow) return;
    otherRow.classList.toggle('hidden', val !== '__other__');
}

async function submitAttendanceUpdate() {
    var dateSel = document.getElementById('update-att-date');
    var dv = dateSel && dateSel.value === '__other__'
        ? (document.getElementById('update-att-other-date') || {}).value || ''
        : (dateSel ? dateSel.value : '');
    if (!dv) { showToast('Please select a date', 'error'); return; }
    var r = document.getElementById('update-att-reason').value.trim(), mi = document.getElementById('update-att-manager').value;
    var ciCb = document.getElementById('update-att-clock-in-enable'), coCb = document.getElementById('update-att-clock-out-enable');
    var ciEnabled = !ciCb || ciCb.checked, coEnabled = !coCb || coCb.checked;
    var ci = ciEnabled ? document.getElementById('update-att-clock-in').value : null;
    var co = coEnabled ? document.getElementById('update-att-clock-out').value : null;
    if (!ciEnabled && !coEnabled) { showToast('Please enable at least one field to update', 'error'); return; }
    if (!r) { showToast('Please provide a reason', 'error'); return; }
    if (!mi) { showToast('Please select a manager', 'error'); return; }
    var mid = parseInt(mi, 10);
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.id === mid) {
        showToast('You cannot select yourself as manager. Pick another approver.', 'error');
        return;
    }
    try {
        await Api.post('/attendance/update-request', { date: dv, requested_clock_in: ci ? dv + 'T' + ci + ':00' : null, requested_clock_out: co ? dv + 'T' + co + ':00' : null, reason: r, manager_id: mid });
        showToast('Update request submitted!', 'success');
        document.getElementById('attendance-update-modal').classList.add('hidden');
        loadAttendanceTab();
    }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}

async function loadPendingAttendanceRequests() {
    var c = document.getElementById('pending-attendance-requests'); if (!c) return;
    try {
        var reqs = await Api.get('/attendance/update-requests/pending'); if (!reqs || reqs.length === 0) { c.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No pending requests</p>'; return; }
        c.innerHTML = reqs.map(function (r) { return '<div class="bg-white border border-gray-200 rounded-lg p-4 mb-3"><div class="flex justify-between items-start mb-2"><div><p class="font-medium text-gray-900">' + (r.user_name || 'User') + '</p><p class="text-xs text-gray-500">Date: ' + fmtDate(r.date) + '</p></div><span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Pending</span></div><p class="text-sm text-gray-600 mb-2"><strong>Reason:</strong> ' + r.reason + '</p><div class="flex gap-2 mt-3"><button onclick="reviewAttendanceRequest(' + r.id + ',\'approved\')" class="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">Approve</button><button onclick="reviewAttendanceRequest(' + r.id + ',\'rejected\')" class="text-xs bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">Reject</button></div></div>'; }).join('');
    }
    catch (e) { c.innerHTML = '<p class="text-sm text-red-500">Failed to load</p>'; }
}

async function reviewAttendanceRequest(rid, status) {
    try { await Api.put('/attendance/update-requests/' + rid + '/review', { status: status }); showToast('Request ' + status + '!', 'success'); loadPendingAttendanceRequests(); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}

function initAttendanceClock() { loadTodayAttendance(); }
