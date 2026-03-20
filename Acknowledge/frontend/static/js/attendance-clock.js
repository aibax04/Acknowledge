// ============================================
// ATTENDANCE CLOCK IN/OUT WIDGET + MONTHLY VIEW
// ============================================
var attendanceTodayData = null;
var clockIntervalId = null;
var attendanceMonthDate = new Date();

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
            { timeout: 10000 }
        );
    });
}

async function loadTodayAttendance() {
    try { attendanceTodayData = await Api.get('/attendance/today'); renderClockWidget(); }
    catch (e) { console.error('Failed to load today attendance:', e); }
}

function renderClockWidget() {
    var c = document.getElementById('clock-widget');
    if (!c) return;
    var d = attendanceTodayData;
    if (!d) { c.innerHTML = '<p class="text-xs text-gray-400">Loading...</p>'; return; }
    if (d.status === 'no_office') { c.innerHTML = '<div class="text-center"><p class="text-xs text-amber-600 font-medium mb-1">Office not set</p><button onclick="openOfficeSetupModal()" class="text-xs bg-primary text-white px-3 py-1 rounded-lg hover:bg-primary-hover">Set Office</button></div>'; return; }
    if (d.status === 'weekly_off') { c.innerHTML = '<div class="text-center"><div class="text-xs font-bold text-blue-600 bg-blue-50 rounded-lg px-3 py-2">Weekly Off</div></div>'; return; }
    if (d.status === 'holiday') { c.innerHTML = '<div class="text-center"><div class="text-xs font-bold text-purple-600 bg-purple-50 rounded-lg px-3 py-2">' + (d.message || 'Holiday') + '</div></div>'; return; }
    var h = '<div class="text-center space-y-2"><div id="live-clock" class="text-lg font-bold text-gray-800 tabular-nums"></div>';
    if (d.clock_in && d.clock_out) {
        var ti = new Date(d.clock_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        var to = new Date(d.clock_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        h += '<div class="text-[10px] text-green-600 font-medium bg-green-50 rounded-lg px-2 py-1.5"><span class="block">In: ' + ti + '</span><span class="block">Out: ' + to + '</span></div>';
    } else if (d.clock_in && !d.clock_out) {
        var ti2 = new Date(d.clock_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        h += '<div class="text-[10px] text-green-600 font-medium">Clocked in: ' + ti2 + '</div>';
        h += '<button onclick="handleClockOut()" id="btn-clock-out" class="w-full text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 font-medium transition-colors">Clock Out</button>';
    } else {
        h += '<button onclick="handleClockIn()" id="btn-clock-in" class="w-full text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-hover font-medium transition-colors">Clock In</button>';
    }
    h += '</div>';
    c.innerHTML = h;
    startLiveClock();
}

async function handleClockIn() {
    var btn = document.getElementById('btn-clock-in');
    if (btn) { btn.disabled = true; btn.textContent = 'Getting location...'; }
    try {
        var loc = await getUserLocation();
        if (btn) btn.textContent = 'Clocking in...';
        await Api.post('/attendance/clock-in', { latitude: loc.latitude, longitude: loc.longitude, address: loc.address });
        if (typeof showToast === 'function') showToast('Clocked in successfully!', 'success');
        await loadTodayAttendance();
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Failed to clock in', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Clock In'; }
    }
}

async function handleClockOut() {
    var btn = document.getElementById('btn-clock-out');
    if (btn) { btn.disabled = true; btn.textContent = 'Getting location...'; }
    try {
        var loc = await getUserLocation();
        if (btn) btn.textContent = 'Clocking out...';
        await Api.post('/attendance/clock-out', { latitude: loc.latitude, longitude: loc.longitude, address: loc.address });
        if (typeof showToast === 'function') showToast('Clocked out successfully!', 'success');
        await loadTodayAttendance();
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Failed to clock out', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Clock Out'; }
    }
}

function openOfficeSetupModal() { var m = document.getElementById('office-setup-modal'); if (m) m.classList.remove('hidden'); }

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
async function loadAttendanceTab() {
    var container = document.getElementById('attendance-monthly-view');
    if (!container) return;
    var yr = attendanceMonthDate.getFullYear(), mo = attendanceMonthDate.getMonth() + 1;
    container.innerHTML = '<div class="text-center py-8"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>';
    try {
        var data = await Api.get('/attendance/monthly?year=' + yr + '&month=' + mo);
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
    var pc = 0, ac = 0, wc = 0, hc = 0, lc = 0;
    data.attendance.forEach(function (a) { if (a.status === 'present') pc++; else if (a.status === 'absent') ac++; else if (a.status === 'weekly_off') wc++; else if (a.status === 'holiday') hc++; else if (a.status === 'on_leave') lc++; });
    var h = '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">';
    h += '<div class="text-center p-3 bg-green-50 rounded-lg border border-green-100"><p class="text-2xl font-bold text-green-700">' + pc + '</p><p class="text-[10px] text-green-600 font-medium">Present</p></div>';
    h += '<div class="text-center p-3 bg-red-50 rounded-lg border border-red-100"><p class="text-2xl font-bold text-red-700">' + ac + '</p><p class="text-[10px] text-red-600 font-medium">Absent</p></div>';
    h += '<div class="text-center p-3 bg-gray-50 rounded-lg border border-gray-200"><p class="text-2xl font-bold text-gray-500">' + wc + '</p><p class="text-[10px] text-gray-500 font-medium">Weekly Off</p></div>';
    h += '<div class="text-center p-3 bg-purple-50 rounded-lg border border-purple-100"><p class="text-2xl font-bold text-purple-700">' + hc + '</p><p class="text-[10px] text-purple-600 font-medium">Holidays</p></div>';
    h += '<div class="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-100 sm:col-span-3 md:col-span-1"><p class="text-2xl font-bold text-yellow-700">' + lc + '</p><p class="text-[10px] text-yellow-600 font-medium">On Leave</p></div></div>';
    h += '<div class="overflow-x-auto w-full"><table class="min-w-full divide-y divide-gray-200 text-sm w-full"><thead class="bg-gray-50"><tr><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Day</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Clock In</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Clock Out</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th></tr></thead><tbody class="bg-white divide-y divide-gray-100">';
    var dn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var today = new Date().toISOString().split('T')[0];
    data.attendance.forEach(function (a) {
        var dd2 = new Date(a.date + 'T00:00:00'), dayN = dn[dd2.getDay()], cc = sc[a.status] || 'bg-gray-100 text-gray-600', sLabel = a.holiday_name || sl[a.status] || a.status;
        var ci = a.clock_in ? new Date(a.clock_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '-';
        var co = a.clock_out ? new Date(a.clock_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '-';
        var isT = a.date === today, canReq = a.status === 'absent' && a.date < today;
        h += '<tr class="' + (isT ? 'bg-primary/5 font-medium' : '') + '">';
        h += '<td class="px-4 py-2 whitespace-nowrap">' + a.date + (isT ? ' <span class="text-xs text-primary">(Today)</span>' : '') + '</td>';
        h += '<td class="px-4 py-2 whitespace-nowrap">' + dayN + '</td>';
        h += '<td class="px-4 py-2 whitespace-nowrap"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + cc + '">' + sLabel + '</span></td>';
        h += '<td class="px-4 py-2 whitespace-nowrap text-gray-600">' + ci + '</td>';
        h += '<td class="px-4 py-2 whitespace-nowrap text-gray-600">' + co + '</td>';
        h += '<td class="px-4 py-2 whitespace-nowrap">';
        if (canReq) h += '<button onclick="openAttendanceUpdateModal(\'' + a.date + '\')" class="text-xs text-primary hover:text-primary-hover font-medium">Request Update</button>';
        h += '</td></tr>';
    });
    h += '</tbody></table></div>';
    container.innerHTML = h;
}

function attendancePrevMonth() { attendanceMonthDate.setMonth(attendanceMonthDate.getMonth() - 1); loadAttendanceTab(); }
function attendanceNextMonth() { attendanceMonthDate.setMonth(attendanceMonthDate.getMonth() + 1); loadAttendanceTab(); }

async function openAttendanceUpdateModal(dateStr) {
    var modal = document.getElementById('attendance-update-modal'); if (!modal) return;
    document.getElementById('update-att-date').value = dateStr;
    document.getElementById('update-att-reason').value = '';
    var ciE = document.getElementById('update-att-clock-in'), coE = document.getElementById('update-att-clock-out');
    if (ciE) ciE.value = '09:00'; if (coE) coE.value = '18:00';
    try { var mgrs = await Api.get('/attendance/managers'); var sel = document.getElementById('update-att-manager'); sel.innerHTML = '<option value="">Select Manager...</option>'; mgrs.forEach(function (m) { sel.innerHTML += '<option value="' + m.id + '">' + m.full_name + ' (' + m.role + ')</option>'; }); } catch (e) { console.error(e); }
    modal.classList.remove('hidden');
}

async function submitAttendanceUpdate() {
    var dv = document.getElementById('update-att-date').value, r = document.getElementById('update-att-reason').value.trim(), mi = document.getElementById('update-att-manager').value;
    var ci = document.getElementById('update-att-clock-in').value, co = document.getElementById('update-att-clock-out').value;
    if (!r) { showToast('Please provide a reason', 'error'); return; } if (!mi) { showToast('Please select a manager', 'error'); return; }
    try { await Api.post('/attendance/update-request', { date: dv, requested_clock_in: ci ? dv + 'T' + ci + ':00' : null, requested_clock_out: co ? dv + 'T' + co + ':00' : null, reason: r, manager_id: parseInt(mi) }); showToast('Update request submitted!', 'success'); document.getElementById('attendance-update-modal').classList.add('hidden'); loadAttendanceTab(); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}

async function loadPendingAttendanceRequests() {
    var c = document.getElementById('pending-attendance-requests'); if (!c) return;
    try {
        var reqs = await Api.get('/attendance/update-requests/pending'); if (!reqs || reqs.length === 0) { c.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No pending requests</p>'; return; }
        c.innerHTML = reqs.map(function (r) { return '<div class="bg-white border border-gray-200 rounded-lg p-4 mb-3"><div class="flex justify-between items-start mb-2"><div><p class="font-medium text-gray-900">' + (r.user_name || 'User') + '</p><p class="text-xs text-gray-500">Date: ' + r.date + '</p></div><span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Pending</span></div><p class="text-sm text-gray-600 mb-2"><strong>Reason:</strong> ' + r.reason + '</p><div class="flex gap-2 mt-3"><button onclick="reviewAttendanceRequest(' + r.id + ',\'approved\')" class="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">Approve</button><button onclick="reviewAttendanceRequest(' + r.id + ',\'rejected\')" class="text-xs bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">Reject</button></div></div>'; }).join('');
    }
    catch (e) { c.innerHTML = '<p class="text-sm text-red-500">Failed to load</p>'; }
}

async function reviewAttendanceRequest(rid, status) {
    try { await Api.put('/attendance/update-requests/' + rid + '/review', { status: status }); showToast('Request ' + status + '!', 'success'); loadPendingAttendanceRequests(); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}

function initAttendanceClock() { loadTodayAttendance(); }
