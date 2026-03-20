// ============================================
// HOLIDAYS MANAGEMENT (shared)
// ============================================

var allHolidays = [];
var _holidaysLastOffice = null;

async function loadHolidays(filterOffice) {
    if (filterOffice !== undefined) _holidaysLastOffice = filterOffice;
    var office = _holidaysLastOffice || (typeof currentUser !== 'undefined' && currentUser ? currentUser.office : null);
    try {
        var url = '/holidays/';
        var yr = new Date().getFullYear();
        url += '?year=' + yr;
        if (office && office !== 'all') url += '&office=' + office;
        allHolidays = await Api.get(url);
        renderHolidaysList();
    } catch (e) { console.error('Failed to load holidays:', e); }
}

function renderHolidaysList() {
    var c = document.getElementById('holidays-list');
    if (!c) return;
    if (!allHolidays || allHolidays.length === 0) {
        c.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No holidays added yet</p>';
        return;
    }
    var oc = { eigen: 'bg-blue-100 text-blue-700', igen: 'bg-blue-100 text-blue-700', panscience: 'bg-green-100 text-green-700', both: 'bg-purple-100 text-purple-700' };
    var officeLabel = { eigen: 'Eigen', igen: 'Eigen', panscience: 'Panscience', both: 'Both' };
    var canDelete = typeof currentUser !== 'undefined' && currentUser && (currentUser.role === 'manager' || currentUser.role === 'senior');
    var h = '<div class="overflow-x-auto w-full"><table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50"><tr>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Holiday</th>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Office</th>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Added By</th>';
    if (canDelete) h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>';
    h += '</tr></thead><tbody class="divide-y divide-gray-100">';
    allHolidays.forEach(function (hol) {
        var col = oc[hol.office] || 'bg-gray-100 text-gray-600';
        var dd = new Date(hol.date + 'T00:00:00');
        var dayName = dd.toLocaleDateString('en-US', { weekday: 'short' });
        h += '<tr>';
        h += '<td class="px-4 py-2 whitespace-nowrap">' + hol.date + ' <span class="text-xs text-gray-400">(' + dayName + ')</span></td>';
        h += '<td class="px-4 py-2 font-medium">' + hol.title + '</td>';
        h += '<td class="px-4 py-2"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + col + '">' + (officeLabel[hol.office] || hol.office) + '</span></td>';
        h += '<td class="px-4 py-2 text-gray-500">' + (hol.created_by_name || '-') + '</td>';
        if (canDelete) h += '<td class="px-4 py-2"><button onclick="deleteHoliday(' + hol.id + ')" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button></td>';
        h += '</tr>';
    });
    h += '</tbody></table></div>';
    c.innerHTML = h;
}

function openAddHolidayModal() {
    var m = document.getElementById('add-holiday-modal');
    if (!m) return;
    document.getElementById('holiday-title').value = '';
    document.getElementById('holiday-date').value = '';
    document.getElementById('holiday-office').value = 'both';
    m.classList.remove('hidden');
}

async function submitHoliday() {
    var title = document.getElementById('holiday-title').value.trim();
    var date = document.getElementById('holiday-date').value;
    var office = document.getElementById('holiday-office').value;
    if (!title) { showToast('Enter holiday name', 'error'); return; }
    if (!date) { showToast('Select a date', 'error'); return; }
    try {
        await Api.post('/holidays/', { title: title, date: date, office: office });
        showToast('Holiday added!', 'success');
        document.getElementById('add-holiday-modal').classList.add('hidden');
        loadHolidays();
        if (typeof loadAttendanceTab === 'function') loadAttendanceTab();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
}

async function deleteHoliday(id) {
    if (!confirm('Delete this holiday?')) return;
    try {
        await Api.delete('/holidays/' + id);
        showToast('Holiday deleted', 'success');
        loadHolidays();
        if (typeof loadAttendanceTab === 'function') loadAttendanceTab();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
}
