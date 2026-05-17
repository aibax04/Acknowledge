// ============================================
// LEAVES TAB - SHARED ACROSS DASHBOARDS
// ============================================

/** @returns {{ month: number|null, year: number }|null} */
function getLeavesFilterParams(prefix) {
    var m = document.getElementById('leaves-month-' + prefix);
    var y = document.getElementById('leaves-year-' + prefix);
    if (!m || !y) return null;
    var month = m.value === '' ? null : parseInt(m.value, 10);
    var year = y.value === '' ? null : parseInt(y.value, 10);
    if (year !== null && (isNaN(year) || year < 2020 || year > 2035)) return null;
    if (month !== null && (isNaN(month) || month < 1 || month > 12)) return null;
    if (month === null && year === null) return null;
    if (month !== null && year === null) year = new Date().getFullYear();
    return { month: month, year: year };
}

function buildLeavesFilterQuery(f) {
    if (!f) return '';
    if (f.month != null) return '?month=' + f.month + '&year=' + f.year;
    return '?year=' + f.year;
}

function fmtDateRange(start, end) {
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var s = new Date(start + 'T00:00:00');
    var e = new Date(end + 'T00:00:00');
    if (start === end) return months[s.getMonth()] + ' ' + s.getDate();
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
        return months[s.getMonth()] + ' ' + s.getDate() + ' – ' + e.getDate();
    }
    return months[s.getMonth()] + ' ' + s.getDate() + ' – ' + months[e.getMonth()] + ' ' + e.getDate();
}

function fmtAppliedAt(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (isNaN(d)) return '';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var datePart = months[d.getMonth()] + ' ' + d.getDate();
    var today = new Date();
    var isToday = d.getDate() === today.getDate() &&
                  d.getMonth() === today.getMonth() &&
                  d.getFullYear() === today.getFullYear();
    if (!isToday) return datePart;
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return datePart + ' · ' + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
}

function toggleReason(btn) {
    var cell = btn.parentElement;
    var shortEl = cell.querySelector('.reason-short');
    var fullEl = cell.querySelector('.reason-full');
    var chevron = btn.querySelector('svg');
    if (fullEl.classList.contains('hidden')) {
        shortEl.classList.add('hidden');
        fullEl.classList.remove('hidden');
        chevron.style.transform = 'rotate(180deg)';
    } else {
        fullEl.classList.add('hidden');
        shortEl.classList.remove('hidden');
        chevron.style.transform = '';
    }
}

function filterLeavesTable(query) {
    var q = (query || '').toLowerCase().trim();
    var rows = document.querySelectorAll('#pending-leaves-list tbody tr');
    rows.forEach(function(row) {
        row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
}

function ensureLeavesFilter(prefix, label) {
    var listId = prefix === 'my' ? 'my-leaves-list' : 'pending-leaves-list';
    var list = document.getElementById(listId);
    if (!list || document.getElementById('leaves-filter-' + prefix)) return;
    var filterId = 'leaves-filter-' + prefix;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var d = new Date();
    var currentYear = d.getFullYear();
    var currentMonth = d.getMonth() + 1;
    var yearOpts = '<option value="">All years</option>';
    for (var y = currentYear - 2; y <= currentYear + 1; y++) yearOpts += '<option value="' + y + '"' + (y === currentYear ? ' selected' : '') + '>' + y + '</option>';
    var monthOpts = '<option value="">All months</option>';
    for (var i = 1; i <= 12; i++) monthOpts += '<option value="' + i + '"' + (i === currentMonth ? ' selected' : '') + '>' + months[i - 1] + '</option>';
    var div = document.createElement('div');
    div.id = filterId;
    div.className = 'px-5 py-3 border-b border-gray-100 flex flex-wrap gap-3 items-center bg-gray-50/60';
    div.innerHTML = '<span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">' + label + '</span>' +
        '<select id="leaves-month-' + prefix + '" class="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition">' + monthOpts + '</select>' +
        '<select id="leaves-year-' + prefix + '" class="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition">' + yearOpts + '</select>' +
        '<button type="button" onclick="applyLeavesFilter(\'' + prefix + '\')" class="bg-primary text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary-hover transition-colors shadow-sm">Apply</button>' +
        '<button type="button" onclick="clearLeavesFilter(\'' + prefix + '\')" class="text-gray-500 hover:text-gray-800 px-2 py-1.5 text-xs font-medium transition-colors">Show all</button>';
    list.parentNode.insertBefore(div, list);
}

function applyLeavesFilter(prefix) {
    if (prefix === 'my') loadMyLeaves();
    else loadPendingLeaves();
}

function clearLeavesFilter(prefix) {
    var m = document.getElementById('leaves-month-' + prefix);
    var y = document.getElementById('leaves-year-' + prefix);
    if (m) m.value = '';
    if (y) y.value = '';
    if (prefix === 'my') loadMyLeaves();
    else loadPendingLeaves();
}

async function loadLeavesTab() {
    // Director role uses separate sub-tab views — skip the combined tab loading
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'senior') return;

    if (document.getElementById('my-leaves-list')) {
        ensureLeavesFilter('my', 'Filter by month:');
        await Promise.all([loadLeaveBalance(), loadMyLeaves()]);
    }


    var sec = document.getElementById('custom-leave-policies-section');
    if (sec && typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'manager') {
        sec.classList.remove('hidden');
        await loadCustomPolicies();
        ensureLeavesFilter('pending', 'Filter by month:');
        loadPendingLeaves();
    } else if (sec && typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'senior') {
        sec.classList.add('hidden');
    }
}

var _cachedTeamLeaves = [];
var _teamLeavesSearchBound = false;
var _teamLeavesStatusBound = false;

function applyTeamLeaveFilter() {
    var searchVal = (document.getElementById('team-leave-search') || {}).value || '';
    var statusVal = (document.getElementById('team-leave-status-filter') || {}).value || '';
    var filtered = _cachedTeamLeaves.filter(function (l) {
        var nameMatch = !searchVal || (l.user_name || '').toLowerCase().indexOf(searchVal.toLowerCase()) > -1;
        var statusMatch = !statusVal || (l.status || '') === statusVal;
        return nameMatch && statusMatch;
    });
    renderTeamLeaves(filtered);
}

/** Case-insensitive sort for Track Employee Balance dropdown */
function _sortUsersForLeaveBalance(users) {
    if (!users || !users.length) return [];
    return users.slice().sort(function (a, b) {
        var an = String(a.full_name || '').toLowerCase();
        var bn = String(b.full_name || '').toLowerCase();
        var cmp = an.localeCompare(bn, undefined, { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return (a.id || 0) - (b.id || 0);
    });
}

function _escapeHtmlAttr(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Show/hide custom combobox dropdown with filtered, alphabetical employee list. */
function renderTeamLeaveBalanceUserSelect() {
    var dropdown = document.getElementById('team-leave-balance-dropdown');
    if (!dropdown || !window._allUsersForLeaveBalance) return;
    var searchEl = document.getElementById('team-leave-balance-search');
    var q = (searchEl && searchEl.value) ? searchEl.value.trim().toLowerCase() : '';
    var users = window._allUsersForLeaveBalance; // already sorted alphabetically
    var filtered = !q ? users : users.filter(function (u) {
        var name = (u.full_name || '').toLowerCase();
        var role = (u.role || '').toLowerCase();
        var office = (u.office || '').toLowerCase();
        return name.indexOf(q) !== -1 || role.indexOf(q) !== -1 || office.indexOf(q) !== -1;
    });

    if (!filtered.length) {
        dropdown.innerHTML = '<div class="px-4 py-6 text-center text-sm text-gray-400">No employees found</div>';
        dropdown.classList.remove('hidden');
        return;
    }

    var roleColors = { senior: 'bg-purple-50 text-purple-700', manager: 'bg-blue-50 text-blue-700', employee: 'bg-gray-100 text-gray-600', intern: 'bg-amber-50 text-amber-700' };
    dropdown.innerHTML = filtered.map(function (u) {
        var initials = (u.full_name || '?').split(' ').map(function (w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
        var role = (u.role || 'employee').toLowerCase();
        var roleClass = roleColors[role] || 'bg-gray-100 text-gray-600';
        var roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
        var office = u.office ? (' · ' + u.office.charAt(0).toUpperCase() + u.office.slice(1)) : '';
        return '<button type="button" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors text-left" onclick="_selectTeamLeaveBalanceUser(' + _escapeHtmlAttr(u.id) + ', \'' + _escapeHtmlAttr(u.full_name) + '\')">' +
            '<div class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">' + initials + '</div>' +
            '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-gray-900 truncate">' + _escapeHtmlAttr(u.full_name || 'User') + '</p>' +
            '<p class="text-xs text-gray-400 truncate">' + _escapeHtmlAttr(office ? roleLabel + office : roleLabel) + '</p>' +
            '</div>' +
            '<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded ' + roleClass + ' shrink-0">' + roleLabel + '</span>' +
            '</button>';
    }).join('');
    dropdown.classList.remove('hidden');
}

function _selectTeamLeaveBalanceUser(userId, name) {
    var hiddenInput = document.getElementById('team-leave-balance-user');
    var searchEl = document.getElementById('team-leave-balance-search');
    var clearBtn = document.getElementById('team-leave-balance-clear');
    var dropdown = document.getElementById('team-leave-balance-dropdown');
    if (hiddenInput) hiddenInput.value = String(userId);
    if (searchEl) { searchEl.value = name; searchEl.blur(); }
    if (clearBtn) clearBtn.classList.remove('hidden');
    if (dropdown) dropdown.classList.add('hidden');
    loadEmployeeLeaveBalance();
}

function clearTeamLeaveBalanceSelection() {
    var hiddenInput = document.getElementById('team-leave-balance-user');
    var searchEl = document.getElementById('team-leave-balance-search');
    var clearBtn = document.getElementById('team-leave-balance-clear');
    var dropdown = document.getElementById('team-leave-balance-dropdown');
    var container = document.getElementById('team-leave-balance-container');
    if (hiddenInput) hiddenInput.value = '';
    if (searchEl) { searchEl.value = ''; searchEl.focus(); }
    if (clearBtn) clearBtn.classList.add('hidden');
    if (dropdown) dropdown.classList.add('hidden');
    if (container) container.classList.add('hidden');
}

function _initTeamLeaveBalanceCombobox() {
    var searchEl = document.getElementById('team-leave-balance-search');
    var dropdown = document.getElementById('team-leave-balance-dropdown');
    if (!searchEl || searchEl.dataset.comboboxBound) return;
    searchEl.dataset.comboboxBound = '1';

    searchEl.addEventListener('input', function () {
        var hiddenInput = document.getElementById('team-leave-balance-user');
        var clearBtn = document.getElementById('team-leave-balance-clear');
        // Clear selection if user edits the text
        if (hiddenInput) hiddenInput.value = '';
        if (clearBtn) clearBtn.classList.add('hidden');
        renderTeamLeaveBalanceUserSelect();
    });

    searchEl.addEventListener('focus', function () {
        if (window._allUsersForLeaveBalance && window._allUsersForLeaveBalance.length) {
            renderTeamLeaveBalanceUserSelect();
        }
    });

    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
        var combobox = document.getElementById('team-leave-balance-combobox');
        if (combobox && !combobox.contains(e.target)) {
            if (dropdown) dropdown.classList.add('hidden');
        }
    }, true);
}

/**
 * Generic reusable searchable user combobox.
 * cfg: { searchId, hiddenId, dropdownId, clearBtnId, users: [], onSelect: fn(uid,name), placeholder }
 * Call once to bind events. To update users afterwards, set cfg.users = newArr and call cfg._render().
 */
function _initCombobox(cfg) {
    var searchEl = document.getElementById(cfg.searchId);
    var hiddenEl = document.getElementById(cfg.hiddenId);
    var dropdownEl = document.getElementById(cfg.dropdownId);
    if (!searchEl || !hiddenEl || !dropdownEl) return;
    if (searchEl.dataset.comboboxBound === '1') { cfg._render && cfg._render(); return; }
    searchEl.dataset.comboboxBound = '1';
    if (cfg.placeholder) searchEl.placeholder = cfg.placeholder;

    var roleColors = { senior: 'bg-purple-50 text-purple-700', manager: 'bg-blue-50 text-blue-700', employee: 'bg-gray-100 text-gray-600', intern: 'bg-amber-50 text-amber-700' };

    function renderDropdown() {
        var q = searchEl.value.trim().toLowerCase();
        var users = cfg.users || [];
        var filtered = !q ? users : users.filter(function (u) {
            return (u.full_name || '').toLowerCase().indexOf(q) !== -1
                || (u.role || '').toLowerCase().indexOf(q) !== -1
                || (u.office || '').toLowerCase().indexOf(q) !== -1;
        });
        if (!filtered.length) {
            dropdownEl.innerHTML = '<div class="px-4 py-5 text-center text-sm text-gray-400">No employees found</div>';
            dropdownEl.classList.remove('hidden');
            return;
        }
        dropdownEl.innerHTML = filtered.map(function (u) {
            var initials = (u.full_name || '?').split(' ').map(function (w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
            var role = (u.role || 'employee').toLowerCase();
            var roleClass = roleColors[role] || 'bg-gray-100 text-gray-600';
            var roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
            var office = u.office ? ' \u00b7 ' + u.office.charAt(0).toUpperCase() + u.office.slice(1) : '';
            return '<button type="button" data-uid="' + u.id + '" data-uname="' + _escapeHtmlAttr(u.full_name || '') + '" ' +
                'class="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors text-left">' +
                '<div class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">' + initials + '</div>' +
                '<div class="flex-1 min-w-0">' +
                '<p class="text-sm font-medium text-gray-900 truncate">' + _escapeHtmlAttr(u.full_name || 'User') + '</p>' +
                '<p class="text-xs text-gray-400">' + _escapeHtmlAttr(roleLabel + office) + '</p>' +
                '</div>' +
                '<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded ' + roleClass + ' shrink-0">' + roleLabel + '</span>' +
                '</button>';
        }).join('');
        dropdownEl.classList.remove('hidden');
    }
    cfg._render = renderDropdown;

    // Result click via delegation
    dropdownEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-uid]');
        if (!btn) return;
        hiddenEl.value = btn.dataset.uid;
        searchEl.value = btn.dataset.uname;
        dropdownEl.classList.add('hidden');
        var clearBtn = cfg.clearBtnId ? document.getElementById(cfg.clearBtnId) : null;
        if (clearBtn) clearBtn.classList.remove('hidden');
        if (typeof cfg.onSelect === 'function') cfg.onSelect(btn.dataset.uid, btn.dataset.uname);
    });

    searchEl.addEventListener('input', function () {
        hiddenEl.value = '';
        var clearBtn = cfg.clearBtnId ? document.getElementById(cfg.clearBtnId) : null;
        if (clearBtn) clearBtn.classList.add('hidden');
        renderDropdown();
    });

    searchEl.addEventListener('focus', function () {
        if (cfg.users && cfg.users.length) renderDropdown();
    });

    document.addEventListener('mousedown', function (e) {
        var parent = dropdownEl.parentElement;
        if (parent && !parent.contains(e.target)) dropdownEl.classList.add('hidden');
    });
}

/** Reset a combobox to empty state (call when opening a modal). */
function _resetCombobox(cfg) {
    var searchEl = document.getElementById(cfg.searchId);
    var hiddenEl = document.getElementById(cfg.hiddenId);
    var dropdownEl = document.getElementById(cfg.dropdownId);
    var clearBtn = cfg.clearBtnId ? document.getElementById(cfg.clearBtnId) : null;
    if (searchEl) searchEl.value = '';
    if (hiddenEl) hiddenEl.value = '';
    if (dropdownEl) dropdownEl.classList.add('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');
}

async function loadTeamLeaves() {
    var c = document.getElementById('team-leaves-list');
    if (!c) return;
    try {
        _initTeamLeaveBalanceCombobox();

        var leaves = await Api.get('/leaves/all');
        _cachedTeamLeaves = leaves || [];
        renderTeamLeaves(_cachedTeamLeaves);

        var hiddenInput = document.getElementById('team-leave-balance-user');
        if (hiddenInput) {
            var users = await Api.get('/auth/all-users');
            window._allUsersForLeaveBalance = _sortUsersForLeaveBalance(users || []);
            // Don't auto-open dropdown on load — wait for user focus/type
        }

        var searchInput = document.getElementById('team-leave-search');
        var statusFilter = document.getElementById('team-leave-status-filter');
        if (searchInput && !_teamLeavesSearchBound) {
            _teamLeavesSearchBound = true;
            searchInput.addEventListener('input', applyTeamLeaveFilter);
        }
        if (statusFilter && !_teamLeavesStatusBound) {
            _teamLeavesStatusBound = true;
            statusFilter.addEventListener('change', applyTeamLeaveFilter);
        }
    } catch (e) {
        c.innerHTML = '<p class="text-red-500 text-sm p-6 bg-red-50/50 rounded-xl border border-red-100 m-6">Failed to load team leaves.</p>';
    }
}

function renderTeamLeaves(leaves) {
    var c = document.getElementById('team-leaves-list');
    if (!c) return;
    if (!leaves || leaves.length === 0) {
        c.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No leave records found.</p>';
        return;
    }

    var h = '<div class="overflow-x-auto w-full"><table class="min-w-full text-sm"><thead><tr class="border-b border-gray-100 bg-gray-50/30">';
    h += '<th class="px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Employee</th>';
    h += '<th class="px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>';
    h += '<th class="px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dates</th>';
    h += '<th class="px-6 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Days</th>';
    h += '<th class="px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Reason</th>';
    h += '<th class="px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>';
    h += '<th class="px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Actions</th>';
    h += '</tr></thead><tbody class="divide-y divide-gray-50 bg-white">';

    function _fmtDate(iso) {
        if (!iso) return '-';
        var p = iso.split('-');
        return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : iso;
    }

    leaves.forEach(function (l) {
        var type = l.custom_policy_title || l.leave_type;
        var dates = l.is_half_day ? _fmtDate(l.start_date) : _fmtDate(l.start_date) + ' to ' + _fmtDate(l.end_date);
        var reasonEsc = (l.reason || '').replace(/"/g, '&quot;');
        var canRevoke = l.status === 'approved' || l.status === 'pending';
        var actionCell = canRevoke
            ? '<button onclick="revokeTeamLeave(' + l.id + ')" class="text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg border border-red-100 transition-colors">Revoke</button>'
            : '<span class="text-xs text-gray-300">—</span>';

        h += '<tr class="hover:bg-gray-50 transition-colors">';
        h += '<td class="px-6 py-4 whitespace-nowrap"><div class="font-medium text-gray-900">' + (l.user_name || 'Unknown') + '</div><div class="text-xs text-gray-400 capitalize">' + (l.user_role || 'employee') + '</div></td>';
        h += '<td class="px-6 py-4 text-gray-700 whitespace-nowrap">' + type + '</td>';
        h += '<td class="px-6 py-4 text-gray-600 whitespace-nowrap">' + dates + '</td>';
        h += '<td class="px-6 py-4 font-semibold text-gray-900 text-center whitespace-nowrap">' + (l.num_days || 0) + (l.is_half_day ? ' ' + _halfDayLabel(l) : '') + '</td>';
        h += '<td class="px-6 py-4 text-gray-500 max-w-[200px] truncate cursor-pointer hover:text-gray-700" title="' + reasonEsc + '" onclick="openLeaveReasonModalFromTitle(this)">' + (l.reason || '—') + '</td>';
        h += '<td class="px-6 py-4">' + _statusBadge(l.status) + '</td>';
        h += '<td class="px-6 py-4">' + actionCell + '</td>';
        h += '</tr>';
    });

    h += '</tbody></table></div>';
    c.innerHTML = h;
}

async function revokeTeamLeave(leaveId) {
    if (!confirm('Revoke this leave? The employee\'s balance will be restored.')) return;
    try {
        await Api.post('/leaves/' + leaveId + '/revoke', {});
        if (typeof showToast === 'function') showToast('Leave revoked', 'success');
        var leaves = await Api.get('/leaves/all');
        _cachedTeamLeaves = leaves || [];
        applyTeamLeaveFilter();
        // Refresh employee balance in tracker if one is selected
        if (typeof loadEmployeeLeaveBalance === 'function') loadEmployeeLeaveBalance();
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Failed to revoke leave', 'error');
    }
}

var _cachedEmployeeLeavesPolicies = {};
async function loadEmployeeLeaveBalance() {
    // If on senior tracker page with full employee data view, use that instead
    if (document.getElementById('leave-history-section')) {
        loadEmployeeLeaveData();
        return;
    }
    var sel = document.getElementById('team-leave-balance-user');
    var userId = sel ? sel.value : null;
    var container = document.getElementById('team-leave-balance-container');
    if (!container) return;
    if (!userId) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    container.innerHTML = '<p class="text-sm text-gray-500 py-4">Loading balance...</p>';
    try {
        // Single authoritative source — backend computes all balances for this employee
        var policiesWithBalance = await Api.get('/leaves/user-policy-balances?user_id=' + encodeURIComponent(userId) + '&_=' + Date.now());
        renderLeaveCards(container, policiesWithBalance || [], [], true, [], null, userId);
    } catch (e) {
        container.innerHTML = '<p class="text-sm text-red-500 py-4">Failed to load balance.</p>';
    }
}

var _cachedMyLeaves = [];
var _cachedPoliciesForApply = [];
var _cachedLeaveAdjustments = [];

function _adjustmentDaysForPolicy(adjustments, policy, policies) {
    if (!adjustments || !adjustments.length) return 0;
    var ids = [policy.id];
    if (policy.policy_group_key && policies && policies.length) {
        policies.forEach(function (p) {
            if (p.policy_group_key === policy.policy_group_key) ids.push(p.id);
        });
        ids = ids.filter(function (id, i, a) { return a.indexOf(id) === i; });
    }
    var sum = 0;
    adjustments.forEach(function (a) {
        if (a.custom_policy_id != null && ids.indexOf(a.custom_policy_id) !== -1) sum += (a.adjustment_days || 0);
    });
    return sum;
}

function _parsePolicyNumberField(v) {
    if (v == null || v === '') return null;
    var x = parseFloat(v);
    return isNaN(x) ? null : x;
}

// Optional positive decimal from form input (max 2 decimal places); empty = null
function _parseOptionalPolicyDecimalInput(el) {
    if (!el) return null;
    var s = (el.value || '').trim();
    if (s === '') return null;
    var x = parseFloat(s);
    if (isNaN(x) || x <= 0) return null;
    return Math.round(x * 100) / 100;
}

// For a policy (or its group), get monthly_allowance or shared_annual_limit from this policy or any in same group
function _limitForPolicyOrGroup(policy, policies) {
    var monthlyAllowance = _parsePolicyNumberField(policy.monthly_allowance);
    var sharedLimit = _parsePolicyNumberField(policy.shared_annual_limit);
    var maxPerMonth = _parsePolicyNumberField(policy.max_days_per_month);
    if (policy.policy_group_key && policies && policies.length) {
        policies.forEach(function (p) {
            if (p.policy_group_key !== policy.policy_group_key) return;
            var ma = _parsePolicyNumberField(p.monthly_allowance);
            var sl = _parsePolicyNumberField(p.shared_annual_limit);
            var mm = _parsePolicyNumberField(p.max_days_per_month);
            if (ma != null && (monthlyAllowance == null || ma > monthlyAllowance)) monthlyAllowance = ma;
            if (sl != null && (sharedLimit == null || sl > sharedLimit)) sharedLimit = sl;
            if (mm != null && (maxPerMonth == null || mm > maxPerMonth)) maxPerMonth = mm;
        });
    }
    return { monthlyAllowance: monthlyAllowance, sharedLimit: sharedLimit, maxPerMonth: maxPerMonth };
}

async function loadLeaveBalance() {
    var c = document.getElementById('leave-balance-container');
    if (!c) return;
    var role = (typeof currentUser !== 'undefined' && currentUser && currentUser.role) ? currentUser.role : '';
    c.innerHTML = '<div class="flex items-center justify-center py-8 text-gray-500 text-sm"><span class="animate-pulse">Loading live balance…</span></div>';
    var ts = '_=' + Date.now();
    try {
        // Single authoritative source — backend computes all balances
        var policiesWithBalance = await Api.get('/leaves/user-policy-balances?' + ts);
        _cachedPoliciesForApply = policiesWithBalance || [];
        var leavesRes = await Api.get('/leaves/my-leaves?' + ts);
        _cachedMyLeaves = leavesRes || [];
        var adjustments = [];
        try {
            var balanceRes = await Api.get('/leaves/balance?' + ts);
            if (balanceRes && balanceRes.adjustments) adjustments = balanceRes.adjustments;
        } catch (e) { /* ignore */ }
        _cachedLeaveAdjustments = adjustments;
        renderLeaveCards(c, _cachedPoliciesForApply, _cachedMyLeaves, false, adjustments);
    } catch (e) {
        c.innerHTML = '<p class="text-gray-500 text-sm">Unable to load leave balance.</p>';
    }
}

/** YYYY-MM-DD for accrual: explicit joining_date, else account created_at (matches backend _resolve_joining_date_for_wallet). */
function _effectiveAccrualJoinDateStrForUser(u) {
    if (!u) return '';
    if (u.joining_date) {
        var sj = String(u.joining_date);
        if (sj.length >= 10) return sj.substring(0, 10);
    }
    if (u.created_at) {
        var sc = String(u.created_at);
        if (sc.length >= 10) return sc.substring(0, 10);
    }
    return '';
}

/**
 * Months credited toward monthly wallet this year (matches backend).
 * Credit on the 1st of each month only if start_date <= that 1st; no future months.
 * joiningDateStrOpt: ISO date (YYYY-MM-DD).
 * If useCurrentUserFallback is not false and joining is missing, uses joining_date then created_at on currentUser.
 * If still unknown, returns 0 (never assume Jan–current-month).
 */
function _walletAccrualMonthsElapsedForYear(currentYear, joiningDateStrOpt, useCurrentUserFallback) {
    var today = new Date();
    var asOfY = today.getFullYear();
    var asOfM = today.getMonth() + 1;
    var asOfD = today.getDate();
    var asOfCap;
    if (asOfY < currentYear) return 0;
    if (asOfY > currentYear) {
        asOfCap = new Date(currentYear, 11, 31);
    } else {
        asOfCap = new Date(currentYear, asOfM - 1, asOfD);
        var yEnd = new Date(currentYear, 11, 31);
        if (asOfCap > yEnd) asOfCap = yEnd;
    }
    var jd = joiningDateStrOpt;
    if ((jd == null || jd === '') && useCurrentUserFallback !== false) {
        jd = _effectiveAccrualJoinDateStrForUser(typeof currentUser !== 'undefined' ? currentUser : null);
    }
    var jStr = (jd && String(jd).length >= 10) ? String(jd).substring(0, 10) : '';
    function parseJoin(s) {
        if (!s || s.length < 10) return null;
        var y = parseInt(s.substring(0, 4), 10);
        var m = parseInt(s.substring(5, 7), 10);
        var d = parseInt(s.substring(8, 10), 10);
        if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
        return new Date(y, m - 1, d);
    }
    var joining = parseJoin(jStr);
    if (!joining) {
        return 0;
    }
    var count = 0;
    for (var m = 1; m <= 12; m++) {
        var monthStart = new Date(currentYear, m - 1, 1);
        if (monthStart > asOfCap) break;
        if (joining <= monthStart) count++;
    }
    return count;
}

function _usedDaysForPolicyOrGroup(leaves, policy, policies) {
    var currentYear = new Date().getFullYear();
    var ids = [policy.id];
    if (policy.policy_group_key && policies && policies.length) {
        policies.forEach(function (p) {
            if (p.policy_group_key === policy.policy_group_key) ids.push(p.id);
        });
        ids = ids.filter(function (id, i, a) { return a.indexOf(id) === i; });
    }
    var used = 0;
    leaves.forEach(function (l) {
        if (l.custom_policy_id == null) return;
        if (ids.indexOf(l.custom_policy_id) === -1) return;
        if (l.status !== 'approved' && l.status !== 'pending') return;
        var y = l.start_date ? parseInt(String(l.start_date).substring(0, 4), 10) : 0;
        if (y === currentYear) used += (l.num_days || 0);
    });
    return used;
}

/** Remaining days for a policy (monthly wallet or shared annual); null if no cap — matches backend apply rules for capped types. */
function _computePolicyRemainingForApply(policy, policies, leaves, adjustments, accrualJoiningDateOpt) {
    // Use backend-computed balance if available (single source of truth)
    if (policy.balance_used !== undefined) {
        return policy.balance_available; // null = no cap, number = remaining
    }
    // Fallback to frontend computation
    var currentYear = new Date().getFullYear();
    var used = _usedDaysForPolicyOrGroup(leaves, policy, policies);
    var adjDays = _adjustmentDaysForPolicy(adjustments || [], policy, policies);
    var limitInfo = _limitForPolicyOrGroup(policy, policies);
    var monthlyAllowance = limitInfo.monthlyAllowance;
    var sharedLimit = limitInfo.sharedLimit;
    if (monthlyAllowance != null && monthlyAllowance > 0) {
        var jForAccrual = accrualJoiningDateOpt;
        if (jForAccrual === undefined) {
            jForAccrual = _effectiveAccrualJoinDateStrForUser(typeof currentUser !== 'undefined' ? currentUser : null) || undefined;
        }
        var monthsElapsed = _walletAccrualMonthsElapsedForYear(currentYear, jForAccrual, true);
        var accrued = monthlyAllowance * monthsElapsed;
        return Math.max(0, accrued - used + adjDays);
    }
    if (sharedLimit != null && sharedLimit >= 0) {
        return Math.max(0, sharedLimit - used + adjDays);
    }
    return null;
}

// ---- LEAVE BALANCE CARDS (employee/intern/manager) ----
function renderLeaveCards(container, policies, leaves, readOnly, adjustments, accrualJoiningDateOpt, targetUserId) {
    if (!container) return;
    adjustments = adjustments || [];
    if (!policies || policies.length === 0) {
        container.innerHTML = '<div class="text-center py-10"><svg class="w-10 h-10 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg><p class="text-gray-400 text-sm font-medium">No leave types available yet</p><p class="text-gray-300 text-xs mt-1">Your director can add custom leave policies.</p></div>';
        return;
    }
    var currentYear = new Date().getFullYear();
    var colors = ['emerald', 'blue', 'violet', 'amber', 'rose', 'teal', 'indigo', 'cyan'];
    var h = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">';
    policies.forEach(function (p, idx) {
        var color = colors[idx % colors.length];
        var limitInfo = _limitForPolicyOrGroup(p, policies);
        var monthlyAllowance = limitInfo.monthlyAllowance;
        var sharedLimit = limitInfo.sharedLimit;
        var maxPerMonth = limitInfo.maxPerMonth;
        var used, adjDays, limit, remaining, monthsElapsed;
        // Use backend-computed balance if available (single source of truth)
        if (p.balance_used !== undefined) {
            used = p.balance_used || 0;
            adjDays = p.balance_adjustments || 0;
            limit = p.balance_limit;
            remaining = p.balance_available;
            monthsElapsed = p.balance_months_elapsed || 0;
        } else {
            // Fallback to frontend computation
            used = _usedDaysForPolicyOrGroup(leaves, p, policies);
            adjDays = _adjustmentDaysForPolicy(adjustments, p, policies);
            limit = null;
            remaining = null;
            monthsElapsed = 0;
            if (monthlyAllowance != null && monthlyAllowance > 0) {
                var jForAccrual = accrualJoiningDateOpt;
                if (jForAccrual === undefined && !readOnly) {
                    jForAccrual = _effectiveAccrualJoinDateStrForUser(typeof currentUser !== 'undefined' ? currentUser : null) || undefined;
                }
                monthsElapsed = _walletAccrualMonthsElapsedForYear(currentYear, jForAccrual, !readOnly);
                var accrued = monthlyAllowance * monthsElapsed;
                limit = accrued;
                remaining = Math.max(0, accrued - used + adjDays);
            } else if (sharedLimit != null && sharedLimit >= 0) {
                limit = sharedLimit;
                remaining = Math.max(0, limit - used + adjDays);
            }
        }
        var pct = (limit != null && limit > 0) ? Math.round((used / limit) * 100) : 0;
        var hasCap = limit != null && limit >= 0;
        var balanceText, balanceLabel;
        if (hasCap) {
            var disp = remaining % 1 === 0 ? remaining : parseFloat(remaining.toFixed(2));
            balanceText = String(disp);
            balanceLabel = (disp === 1 ? 'day' : 'days') + ' available';
        } else {
            balanceText = '—';
            balanceLabel = 'No limit set';
        }
        var policyId = p.id;
        var groupKey = p.policy_group_key || '';

        h += '<div class="group relative bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200">';
        h += '<div class="h-1 bg-' + color + '-500 opacity-80"></div>';
        h += '<div class="p-5">';
        // title + prior chip
        h += '<div class="flex items-start justify-between mb-3">';
        h += '<h3 class="text-sm font-semibold text-gray-800 leading-snug pr-2">' + (p.title || 'Leave') + '</h3>';
        if (p.prior_days > 0) h += '<span class="shrink-0 text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">' + p.prior_days + 'd notice</span>';
        h += '</div>';
        h += '<p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Available balance</p>';
        h += '<div class="flex items-baseline gap-1.5"><span class="text-3xl font-extrabold text-gray-900 tracking-tight">' + balanceText + '</span><span class="text-xs text-gray-400 font-medium">' + balanceLabel + '</span></div>';
        if (!hasCap) {
            if (maxPerMonth != null) {
                h += '<p class="text-[10px] text-gray-400 mt-1">Max ' + maxPerMonth + ' ' + (maxPerMonth === 1 ? 'day' : 'days') + ' per month. Director can set annual limits.</p>';
            } else {
                h += '<p class="text-[10px] text-gray-400 mt-1">Director can set limit in policy to see balance</p>';
            }
        }
        // progress bar + used summary
        if (limit != null && limit > 0) {
            var usedDisp = used % 1 === 0 ? used : parseFloat(used.toFixed(2));
            var limitDisp = (limit != null && limit % 1 !== 0) ? parseFloat(limit.toFixed(2)) : limit;
            h += '<div class="mt-3"><div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden"><div class="bg-' + color + '-500 h-1.5 rounded-full transition-all duration-700 ease-out" style="width:' + Math.min(pct, 100) + '%"></div></div>';
            h += '<p class="text-[10px] text-gray-400 mt-1">Used ' + usedDisp + ' of ' + limitDisp + ' this year \u2192 see Ledger</p>';
            if (monthlyAllowance != null && monthlyAllowance > 0) {
                var allowanceDisp = monthlyAllowance % 1 === 0 ? monthlyAllowance : parseFloat(monthlyAllowance.toFixed(2));
                h += '<p class="text-[10px] text-amber-700/80 mt-0.5">' + (readOnly ? 'Credits on the 1st of each month from joining/start date' : 'Credits on the 1st of each month after you are on roll') + ' (' + monthsElapsed + ' mo \u00d7 ' + allowanceDisp + '/mo this year).</p>';
            }
            h += '</div>';
        }
        // actions
        if (!readOnly) {
            h += '<div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">';
            h += '<button type="button" onclick="openLeaveLogsModal(' + policyId + ',\'' + (groupKey || '').replace(/'/g, "\\'") + '\')" class="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors">Logs</button>';
            h += '<span class="text-gray-200 text-xs">·</span>';
            h += '<button type="button" onclick="openLeaveLedgerModal(' + policyId + ',\'' + (groupKey || '').replace(/'/g, "\\'") + '\')" class="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors">Ledger</button>';
            if (hasCap && remaining != null && remaining <= 0) {
                h += '<span class="ml-auto text-xs font-semibold text-gray-400 bg-gray-100 px-3.5 py-1.5 rounded-lg cursor-not-allowed" title="No days left on this policy">No balance</span>';
            } else {
                h += '<button type="button" onclick="openApplyLeaveModal(' + policyId + ')" class="ml-auto text-xs font-semibold text-white bg-' + color + '-500 hover:bg-' + color + '-600 px-3.5 py-1.5 rounded-lg transition-colors shadow-sm">Request Leave</button>';
            }
            h += '</div>';
        } else {
            // Director/admin read-only view — show Ledger button for the target employee
            var _tuid = (typeof targetUserId !== 'undefined' && targetUserId) ? targetUserId : '';
            h += '<div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">';
            h += '<button type="button" onclick="openLeaveLedgerModal(' + policyId + ',\'' + (groupKey || '').replace(/'/g, "\\'") + '\',' + (_tuid || 'null') + ')" class="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors">Ledger</button>';
            h += '</div>';
        }
        h += '</div></div>';
    });
    h += '</div>';
    container.innerHTML = h;
}

function _leavesForPolicyOrGroup(leaves, policyId, policyGroupKey, policies) {
    if (!leaves || !leaves.length) return [];
    var ids = [policyId];
    if (policyGroupKey && policies && policies.length) {
        policies.forEach(function (p) {
            if (p.policy_group_key === policyGroupKey) ids.push(p.id);
        });
        ids = ids.filter(function (id, i, a) { return a.indexOf(id) === i; });
    }
    return leaves.filter(function (l) {
        return l.custom_policy_id != null && ids.indexOf(l.custom_policy_id) !== -1;
    });
}

// ---- STATUS BADGE HELPER ----
var _statusStyles = {
    pending: 'bg-amber-50 text-amber-700 border border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    rejected: 'bg-red-50 text-red-600 border border-red-200',
    cancelled: 'bg-gray-50 text-gray-500 border border-gray-200'
};
function _statusBadge(status) {
    var cls = _statusStyles[status] || 'bg-gray-50 text-gray-500 border border-gray-200';
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ' + cls + ' capitalize">' + (status || '-') + '</span>';
}

// ---- EMPTY STATE HELPER ----
function _emptyState(text) {
    return '<div class="text-center py-8"><svg class="w-8 h-8 mx-auto text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg><p class="text-gray-400 text-sm">' + text + '</p></div>';
}

// ---- LEAVE LOGS MODAL ----
function openLeaveLogsModal(policyId, policyGroupKey) {
    var modal = document.getElementById('leave-logs-modal');
    var content = document.getElementById('leave-logs-content');
    if (!modal || !content) return;
    var leaves = _leavesForPolicyOrGroup(_cachedMyLeaves, policyId, policyGroupKey, _cachedPoliciesForApply);
    leaves.sort(function (a, b) { return (b.start_date || '').localeCompare(a.start_date || ''); });
    if (leaves.length === 0) {
        content.innerHTML = _emptyState('No leave entries for this type.');
    } else {
        var t = '<div class="overflow-x-auto w-full"><table class="min-w-full text-sm"><thead><tr class="border-b border-gray-100">';
        t += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">From</th>';
        t += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">To</th>';
        t += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Days</th>';
        t += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Reason</th>';
        t += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>';
        t += '</tr></thead><tbody class="divide-y divide-gray-50">';
        leaves.forEach(function (l, i) {
            t += '<tr class="hover:bg-gray-50/80 transition-colors">';
            t += '<td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">' + fmtDate(l.start_date || null) + '</td>';
            t += '<td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">' + fmtDate(l.end_date || null) + '</td>';
            t += '<td class="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">' + (l.num_days || 0) + _halfDayLabel(l) + '</td>';
            t += '<td class="px-4 py-2.5 text-gray-500 max-w-[200px] truncate cursor-pointer hover:text-gray-700" title="' + (l.reason || '').replace(/"/g, '&quot;') + '" onclick="openLeaveReasonModalFromTitle(this)">' + (l.reason || '-') + '</td>';
            t += '<td class="px-4 py-2.5">' + _statusBadge(l.status) + '</td></tr>';
        });
        t += '</tbody></table></div>';
        content.innerHTML = t;
    }
    modal.classList.remove('hidden');
}

// ---- LEAVE LEDGER MODAL ----
function _ledgerWalletStats(policy, leaves, adjustments, policies, accrualJoiningDateOpt) {
    var limitInfo = _limitForPolicyOrGroup(policy, policies || []);
    var monthlyAllowance = limitInfo.monthlyAllowance;
    var sharedLimit = limitInfo.sharedLimit;
    var maxPerMonth = limitInfo.maxPerMonth;
    // Use backend-computed balance if available (single source of truth)
    if (policy.balance_used !== undefined) {
        var accLabel = '';
        if (monthlyAllowance != null && monthlyAllowance > 0) {
            accLabel = 'Accrued (' + (policy.balance_months_elapsed || 0) + ' mo × ' + monthlyAllowance + ')';
        } else if (policy.balance_limit != null) {
            accLabel = 'Annual limit';
        }
        return { used: policy.balance_used || 0, adjDays: policy.balance_adjustments || 0, limit: policy.balance_limit, remaining: policy.balance_available, accruedLabel: accLabel, maxPerMonth: maxPerMonth };
    }
    // Fallback to frontend computation
    var cy = new Date().getFullYear();
    var used = _usedDaysForPolicyOrGroup(leaves, policy, policies);
    var adjDays = _adjustmentDaysForPolicy(adjustments || [], policy, policies);
    var limit = null;
    var remaining = null;
    var accruedLabel = '';
    if (monthlyAllowance != null && monthlyAllowance > 0) {
        var monthsElapsed = _walletAccrualMonthsElapsedForYear(cy, accrualJoiningDateOpt);
        var accrued = monthlyAllowance * monthsElapsed;
        limit = accrued;
        remaining = Math.max(0, accrued - used + adjDays);
        accruedLabel = 'Accrued (' + monthsElapsed + ' mo × ' + monthlyAllowance + ')';
    } else if (sharedLimit != null && sharedLimit >= 0) {
        limit = sharedLimit;
        remaining = Math.max(0, limit - used + adjDays);
        accruedLabel = 'Annual limit';
    }
    return { used: used, adjDays: adjDays, limit: limit, remaining: remaining, accruedLabel: accruedLabel, maxPerMonth: maxPerMonth };
}

async function openLeaveLedgerModal(policyId, policyGroupKey, targetUserId) {
    var modal = document.getElementById('leave-ledger-modal');
    var content = document.getElementById('leave-ledger-content');
    if (!modal || !content) return;

    content.innerHTML = '<div class="flex items-center justify-center py-12 text-gray-500"><span class="animate-pulse">Loading live balance…</span></div>';
    modal.classList.remove('hidden');

    var policies = _cachedPoliciesForApply || [];
    var leaves = _cachedMyLeaves || [];
    var adjustments = [];
    var adjustmentsFull = [];

    // If targetUserId provided (director viewing an employee), use that; otherwise self
    var isAdminView = targetUserId && targetUserId != ((typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null);
    var userId = targetUserId || ((typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : null);
    var currentYear = new Date().getFullYear();

    try {
        var policiesUrl = isAdminView
            ? '/leaves/user-policy-balances?user_id=' + encodeURIComponent(userId)
            : '/leaves/user-policy-balances';
        var leavesUrl = isAdminView
            ? '/leaves/my-leaves?user_id=' + encodeURIComponent(userId)
            : '/leaves/my-leaves';

        var policiesF = Api.get(policiesUrl).then(function (p) {
            policies = p || [];
            if (!isAdminView) _cachedPoliciesForApply = policies;
        });
        var myLeavesF = Api.get(leavesUrl).then(function (l) {
            leaves = l || [];
            if (!isAdminView) _cachedMyLeaves = leaves;
        }).catch(function() { leaves = []; });
        var balanceF = isAdminView
            ? Api.get('/leaves/balance?user_id=' + encodeURIComponent(userId)).then(function (b) {
                adjustments = (b && b.adjustments) ? b.adjustments : [];
            }).catch(function() { adjustments = []; })
            : Api.get('/leaves/balance').then(function (b) {
                adjustments = (b && b.adjustments) ? b.adjustments : [];
                _cachedLeaveAdjustments = adjustments;
            });
        var adjListF = userId ? Api.get('/leaves/adjustments?user_id=' + encodeURIComponent(userId) + '&year=' + currentYear).then(function (list) { adjustmentsFull = list || []; }).catch(function () { adjustmentsFull = []; }) : Promise.resolve();
        await Promise.all([policiesF, myLeavesF, balanceF, adjListF]);
    } catch (e) {
        content.innerHTML = '<p class="text-red-500 text-sm py-6 text-center">Could not load live data. Close and try again.</p>';
        return;
    }

    var policy = policies.find(function (p) { return p.id === parseInt(policyId, 10); });
    if (!policy && policyGroupKey && policies.length) {
        policy = policies.find(function (p) { return (p.policy_group_key || '') === policyGroupKey; });
    }
    var policyLeaves = _leavesForPolicyOrGroup(leaves, policyId, policyGroupKey, policies);
    policyLeaves.sort(function (a, b) { return (b.start_date || '').localeCompare(a.start_date || ''); });

    var policyIdsForAdj = policy ? [policy.id] : [];
    if (policy && policy.policy_group_key && policies.length) {
        policies.forEach(function (p) {
            if (p.policy_group_key === policy.policy_group_key) policyIdsForAdj.push(p.id);
        });
        policyIdsForAdj = policyIdsForAdj.filter(function (id, i, a) { return a.indexOf(id) === i; });
    }
    var policyAdjustments = adjustmentsFull.filter(function (a) {
        return a.custom_policy_id != null && policyIdsForAdj.indexOf(a.custom_policy_id) !== -1;
    });
    policyAdjustments.sort(function (a, b) {
        var da = (a.created_at || '').toString().substring(0, 10);
        var db = (b.created_at || '').toString().substring(0, 10);
        return db.localeCompare(da);
    });

    var html = '';
    if (policy) {
        var stats = _ledgerWalletStats(policy, leaves, adjustments, policies, _effectiveAccrualJoinDateStrForUser(typeof currentUser !== 'undefined' ? currentUser : null) || null);
        var walletBalanceStr = stats.remaining != null ? (stats.remaining % 1 === 0 ? String(stats.remaining) : String(parseFloat(stats.remaining.toFixed(2)))) : '—';
        html += '<div class="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">';
        html += '<p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Leave balance / wallet (live)</p>';
        html += '<p class="text-sm font-semibold text-gray-700 mb-3">Available wallet balance: <span class="text-lg font-bold text-gray-900">' + walletBalanceStr + '</span> days</p>';
        html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">';
        html += '<div><p class="text-2xl font-bold text-gray-900">' + walletBalanceStr + '</p><p class="text-xs text-gray-500 font-medium">Balance (wallet)</p></div>';
        html += '<div><p class="text-2xl font-bold text-gray-700">' + (stats.used % 1 === 0 ? stats.used : parseFloat(stats.used.toFixed(2))) + '</p><p class="text-xs text-gray-500 font-medium">Used this year</p></div>';
        html += '<div><p class="text-2xl font-bold text-gray-700">' + (stats.limit != null ? stats.limit : '—') + '</p><p class="text-xs text-gray-500 font-medium">' + (stats.accruedLabel || 'Limit') + '</p></div>';
        html += '<div><p class="text-2xl font-bold ' + (stats.adjDays >= 0 ? 'text-emerald-600' : 'text-amber-600') + '">' + (stats.adjDays >= 0 ? '+' : '') + (stats.adjDays % 1 === 0 ? stats.adjDays : parseFloat(stats.adjDays.toFixed(2))) + '</p><p class="text-xs text-gray-500 font-medium">Adjustments</p></div>';
        html += '</div></div>';

        if (stats.limit == null && stats.maxPerMonth != null) {
            html += '<p class="text-xs text-amber-600 font-medium mb-4 flex items-center gap-1.5 bg-amber-50 px-3 py-2 rounded border border-amber-100"><svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> This policy has a monthly cap of ' + stats.maxPerMonth + ' ' + (stats.maxPerMonth === 1 ? 'day' : 'days') + ', but no overall wallet/annual limits exist.</p>';
        }
    }

    if (policyAdjustments.length > 0) {
        html += '<div class="mb-6"><p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Balance adjustments (added or reduced by admin)</p>';
        html += '<div class="overflow-x-auto w-full rounded-lg border border-gray-100"><table class="min-w-full text-sm"><thead><tr class="border-b border-gray-100 bg-gray-50/80">';
        html += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>';
        html += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Reason</th>';
        html += '<th class="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Days</th>';
        html += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Type</th></tr></thead><tbody class="divide-y divide-gray-50">';
        policyAdjustments.forEach(function (a) {
            var dateStr = fmtDate(a.created_at || null);
            var reason = (a.reason || 'Balance adjustment').length > 50 ? (a.reason || '').substring(0, 50) + '…' : (a.reason || 'Balance adjustment');
            var days = a.adjustment_days != null ? a.adjustment_days : 0;
            var daysStr = (days >= 0 ? '+' : '') + (days % 1 === 0 ? days : parseFloat(days.toFixed(2)));
            var rowClass = days >= 0 ? 'text-emerald-600' : 'text-amber-600';
            html += '<tr class="hover:bg-gray-50/80 transition-colors">';
            html += '<td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">' + dateStr + '</td>';
            html += '<td class="px-4 py-2.5 text-gray-600">' + reason + '</td>';
            html += '<td class="px-4 py-2.5 font-semibold text-right ' + rowClass + '">' + daysStr + '</td>';
            html += '<td class="px-4 py-2.5 text-gray-500">Adjustment</td></tr>';
        });
        html += '</tbody></table></div></div>';
    }

    html += '<p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Leave requests</p>';
    if (policyLeaves.length === 0 && policyAdjustments.length === 0) {
        html += _emptyState('No ledger entries yet.');
    } else if (policyLeaves.length === 0) {
        html += '<p class="text-gray-400 text-sm py-4">No leave requests for this type yet.</p>';
    } else {
        html += '<div class="overflow-x-auto w-full"><table class="min-w-full text-sm"><thead><tr class="border-b border-gray-100">';
        html += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>';
        html += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>';
        html += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Days</th>';
        html += '<th class="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>';
        html += '</tr></thead><tbody class="divide-y divide-gray-50">';
        policyLeaves.forEach(function (l) {
            var desc = l.is_half_day ? (l.start_date || 'Leave') : ((l.start_date && l.end_date) ? l.start_date + ' – ' + l.end_date : 'Leave');
            if (l.reason) desc += ' · ' + (l.reason.length > 40 ? l.reason.substring(0, 40) + '…' : l.reason);
            html += '<tr class="hover:bg-gray-50/80 transition-colors">';
            html += '<td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">' + fmtDate(l.start_date || null) + '</td>';
            html += '<td class="px-4 py-2.5 text-gray-600">' + desc + '</td>';
            html += '<td class="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">' + (l.num_days || 0) + _halfDayLabel(l) + '</td>';
            html += '<td class="px-4 py-2.5 capitalize text-gray-600">' + (l.status || '-') + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }
    content.innerHTML = html;

    var balanceContainer = document.getElementById('leave-balance-container');
    if (balanceContainer && typeof renderLeaveCards === 'function') {
        renderLeaveCards(balanceContainer, policies, leaves, false, adjustments);
    }
}

function renderLeaveBalance(b) {
    var c = document.getElementById('leave-balance-container');
    if (!c) return;
    c.innerHTML = '';
}

// ---- MY LEAVES LOADER ----
async function loadMyLeaves() {
    var c = document.getElementById('my-leaves-list');
    if (!c) return;
    var f = getLeavesFilterParams('my');
    var q = buildLeavesFilterQuery(f);
    var live = (q ? '&' : '?') + '_=' + Date.now();
    try {
        var leaves = await Api.get('/leaves/my-leaves' + q + live);
        renderMyLeaves(leaves);
    } catch (e) { c.innerHTML = '<p class="text-red-500 text-sm p-6">Failed to load leaves</p>'; }
}

function _halfDayLabel(l) {
    if (!l.is_half_day) return '';
    var period = l.half_day_period === 'first_half' ? '1st half' : '2nd half';
    return '<span class="ml-1 inline-block text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 align-middle">' + period + '</span>';
}

// ---- TABLE ROW ----
function _leaveRow(l, showStatus, showAction) {
    var type = l.custom_policy_title || l.leave_type;
    var reasonEsc = (l.reason || '').replace(/"/g, '&quot;');
    var daysLabel = l.num_days + (l.is_half_day ? '' : '');
    var h = '<tr class="hover:bg-gray-50/60 transition-colors">';
    h += '<td class="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">' + type + '</td>';
    h += '<td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">' + fmtDate(l.start_date) + '</td>';
    h += '<td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">' + fmtDate(l.end_date) + '</td>';
    h += '<td class="px-4 py-3 text-sm font-semibold text-gray-900 text-center whitespace-nowrap">' + daysLabel + _halfDayLabel(l) + '</td>';
    h += '<td class="px-4 py-3 text-sm text-gray-500 max-w-[160px] truncate cursor-pointer hover:text-gray-700" title="' + reasonEsc + '" onclick="openLeaveReasonModalFromTitle(this)">' + (l.reason || '—') + '</td>';
    if (showStatus) h += '<td class="px-4 py-3">' + _statusBadge(l.status) + '</td>';
    h += '<td class="px-4 py-3 text-right">';
    if (showAction && l.status === 'pending') h += '<button onclick="cancelLeave(' + l.id + ')" class="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-md font-medium transition-colors">Cancel</button>';
    if (l.reviewer_notes) h += '<span class="text-xs text-gray-400 ml-1.5 cursor-help" title="' + (l.reviewer_notes || '').replace(/"/g, '&quot;') + '">💬</span>';
    h += '</td></tr>';
    return h;
}

// ---- TABLE WRAPPER ----
function _leavesTable(leaves, showStatus, showAction) {
    if (!leaves || leaves.length === 0) return '<p class="text-gray-300 text-sm text-center py-6">No entries</p>';
    var h = '<div class="overflow-x-auto w-full -mx-0.5"><table class="min-w-full text-sm"><thead><tr class="border-b border-gray-100">';
    h += '<th class="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>';
    h += '<th class="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">From</th>';
    h += '<th class="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">To</th>';
    h += '<th class="px-4 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Days</th>';
    h += '<th class="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Reason</th>';
    if (showStatus) h += '<th class="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>';
    h += '<th class="px-4 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider"></th>';
    h += '</tr></thead><tbody class="divide-y divide-gray-50">';
    leaves.forEach(function (l) { h += _leaveRow(l, showStatus, showAction); });
    h += '</tbody></table></div>';
    return h;
}

// ---- MY LEAVES RENDERER ----
function _switchMyLeavesTab(tab) {
    var tabs = ['pending', 'approved', 'other'];
    var ACTIVE = ['bg-primary', 'text-white', 'border-primary'];
    var INACTIVE = ['bg-white', 'text-gray-500', 'border-gray-200', 'hover:border-gray-300', 'hover:text-gray-700'];
    tabs.forEach(function (t) {
        var btn = document.getElementById('my-leaves-tab-' + t);
        var content = document.getElementById('my-leaves-content-' + t);
        if (!btn || !content) return;
        if (t === tab) {
            btn.classList.remove.apply(btn.classList, INACTIVE);
            btn.classList.add.apply(btn.classList, ACTIVE);
            content.classList.remove('hidden');
        } else {
            btn.classList.remove.apply(btn.classList, ACTIVE);
            btn.classList.add.apply(btn.classList, INACTIVE);
            content.classList.add('hidden');
        }
    });
}

function renderMyLeaves(leaves) {
    var c = document.getElementById('my-leaves-list');
    if (!c) return;

    if (!leaves || leaves.length === 0) {
        c.innerHTML = '<div class="p-6"><div class="grid grid-cols-3 gap-3 mb-4">' +
            '<div class="bg-amber-50/50 rounded-xl p-4 text-center border border-amber-100/40"><p class="text-2xl font-bold text-amber-500">0</p><p class="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mt-0.5">Pending</p></div>' +
            '<div class="bg-emerald-50/50 rounded-xl p-4 text-center border border-emerald-100/40"><p class="text-2xl font-bold text-emerald-500">0</p><p class="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mt-0.5">Approved</p></div>' +
            '<div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100"><p class="text-2xl font-bold text-gray-400">0</p><p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Rejected</p></div></div>' +
            _emptyState('No leave requests yet') + '</div>';
        return;
    }

    var pending = leaves.filter(function (l) { return l.status === 'pending'; });
    var taken = leaves.filter(function (l) { return l.status === 'approved'; });
    var other = leaves.filter(function (l) { return l.status !== 'pending' && l.status !== 'approved'; });

    // Summary stat cards (clickable to switch tab)
    var summary = '<div class="p-5 border-b border-gray-100">' +
        '<div class="grid grid-cols-3 gap-3">' +
        '<button onclick="_switchMyLeavesTab(\'pending\')" class="bg-amber-50/50 rounded-xl p-3.5 text-center border border-amber-100/40 hover:border-amber-300 transition-colors cursor-pointer w-full"><p class="text-2xl font-bold text-amber-600">' + pending.length + '</p><p class="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mt-0.5">Pending</p></button>' +
        '<button onclick="_switchMyLeavesTab(\'approved\')" class="bg-emerald-50/50 rounded-xl p-3.5 text-center border border-emerald-100/40 hover:border-emerald-300 transition-colors cursor-pointer w-full"><p class="text-2xl font-bold text-emerald-600">' + taken.length + '</p><p class="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mt-0.5">Approved</p></button>' +
        '<button onclick="_switchMyLeavesTab(\'other\')" class="bg-gray-50 rounded-xl p-3.5 text-center border border-gray-100 hover:border-gray-300 transition-colors cursor-pointer w-full"><p class="text-2xl font-bold text-gray-500">' + other.length + '</p><p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Rejected</p></button>' +
        '</div></div>';

    // Tab buttons bar
    var tabBar = '<div class="px-5 py-3 border-b border-gray-100 flex gap-2 flex-wrap">' +
        '<button id="my-leaves-tab-pending" onclick="_switchMyLeavesTab(\'pending\')" class="text-xs font-semibold px-3.5 py-1.5 rounded-lg border transition-colors">Pending <span class="ml-0.5 opacity-75">(' + pending.length + ')</span></button>' +
        '<button id="my-leaves-tab-approved" onclick="_switchMyLeavesTab(\'approved\')" class="text-xs font-semibold px-3.5 py-1.5 rounded-lg border transition-colors">Approved <span class="ml-0.5 opacity-75">(' + taken.length + ')</span></button>' +
        '<button id="my-leaves-tab-other" onclick="_switchMyLeavesTab(\'other\')" class="text-xs font-semibold px-3.5 py-1.5 rounded-lg border transition-colors">Rejected / Cancelled <span class="ml-0.5 opacity-75">(' + other.length + ')</span></button>' +
        '</div>';

    // Tab content panels
    var contentPending = '<div id="my-leaves-content-pending" class="px-5 py-4">' + (pending.length ? _leavesTable(pending, true, true) : _emptyState('No pending requests')) + '</div>';
    var contentApproved = '<div id="my-leaves-content-approved" class="hidden px-5 py-4">' + (taken.length ? _leavesTable(taken, false, false) : _emptyState('No approved leaves')) + '</div>';
    var contentOther = '<div id="my-leaves-content-other" class="hidden px-5 py-4">' + (other.length ? _leavesTable(other, true, false) : _emptyState('No rejected or cancelled leaves')) + '</div>';

    c.innerHTML = summary + tabBar + contentPending + contentApproved + contentOther;
    // Default to pending tab; if no pending, show approved
    _switchMyLeavesTab(pending.length > 0 ? 'pending' : 'approved');
}

async function cancelLeave(id) {
    if (!confirm('Cancel this leave request?')) return;
    try { await Api.delete('/leaves/' + id); showToast('Leave cancelled', 'success'); loadLeavesTab(); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}

// ---- SINGLE / MULTIPLE DAY LEAVE MODE ----
var _leaveMode = 'single'; // 'single' or 'multiple'

function setLeaveMode(mode) {
    _leaveMode = mode;
    var singleBtn = document.getElementById('leave-single-day-btn');
    var multiBtn = document.getElementById('leave-multi-day-btn');
    var startLabel = document.getElementById('leave-start-date-label');
    var endDateWrap = document.getElementById('leave-end-date-wrap');
    if (!singleBtn || !multiBtn) return;
    var ACTIVE = ['border-primary', 'bg-primary/10', 'text-primary'];
    var INACTIVE = ['border-gray-200', 'bg-gray-50', 'text-gray-500'];
    if (mode === 'single') {
        singleBtn.classList.remove.apply(singleBtn.classList, INACTIVE);
        singleBtn.classList.add.apply(singleBtn.classList, ACTIVE);
        multiBtn.classList.remove.apply(multiBtn.classList, ACTIVE);
        multiBtn.classList.add.apply(multiBtn.classList, INACTIVE);
        if (startLabel) startLabel.textContent = 'Date';
        if (endDateWrap) endDateWrap.classList.add('hidden');
        // Sync end date with start date
        var startEl = document.getElementById('leave-start-date');
        var endEl = document.getElementById('leave-end-date');
        if (startEl && endEl) endEl.value = startEl.value;
    } else {
        multiBtn.classList.remove.apply(multiBtn.classList, INACTIVE);
        multiBtn.classList.add.apply(multiBtn.classList, ACTIVE);
        singleBtn.classList.remove.apply(singleBtn.classList, ACTIVE);
        singleBtn.classList.add.apply(singleBtn.classList, INACTIVE);
        if (startLabel) startLabel.textContent = 'From';
        // Only show end date wrap if NOT in half-day mode
        if (endDateWrap && _leaveDuration !== 'half') endDateWrap.classList.remove('hidden');
    }
}

// ---- HALF-DAY LEAVE HELPERS ----
var _leaveDuration = 'full';
var _halfDayPeriod = null;

function setLeaveDuration(mode) {
    _leaveDuration = mode;
    var fullBtn = document.getElementById('leave-full-day-btn');
    var halfBtn = document.getElementById('leave-half-day-btn');
    var periodWrap = document.getElementById('half-day-period-wrap');
    var startDateInput = document.getElementById('leave-start-date');
    var endDateInput = document.getElementById('leave-end-date');
    var endDateWrap = document.getElementById('leave-end-date-wrap');
    if (!fullBtn || !halfBtn) return;
    var ACTIVE = ['border-primary', 'bg-primary/10', 'text-primary'];
    var INACTIVE = ['border-gray-200', 'bg-gray-50', 'text-gray-500'];
    if (mode === 'full') {
        fullBtn.classList.remove.apply(fullBtn.classList, INACTIVE);
        fullBtn.classList.add.apply(fullBtn.classList, ACTIVE);
        halfBtn.classList.remove.apply(halfBtn.classList, ACTIVE);
        halfBtn.classList.add.apply(halfBtn.classList, INACTIVE);
        if (periodWrap) periodWrap.classList.add('hidden');
        _halfDayPeriod = null;
        // Re-enable and show the end date field (only if multiple-day mode)
        if (endDateInput) { endDateInput.disabled = false; endDateInput.style.opacity = ''; }
        if (endDateWrap && _leaveMode === 'multiple') endDateWrap.classList.remove('hidden');
        else if (endDateWrap && _leaveMode === 'single') endDateWrap.classList.add('hidden');
    } else {
        halfBtn.classList.remove.apply(halfBtn.classList, INACTIVE);
        halfBtn.classList.add.apply(halfBtn.classList, ACTIVE);
        fullBtn.classList.remove.apply(fullBtn.classList, ACTIVE);
        fullBtn.classList.add.apply(fullBtn.classList, INACTIVE);
        if (periodWrap) periodWrap.classList.remove('hidden');
        // Auto-sync end date with start date and hide the end date field
        if (startDateInput && endDateInput) {
            endDateInput.value = startDateInput.value;
        }
        if (endDateWrap) endDateWrap.classList.add('hidden');
    }
}

function setHalfDayPeriod(period) {
    _halfDayPeriod = period;
    var firstBtn = document.getElementById('leave-first-half-btn');
    var secondBtn = document.getElementById('leave-second-half-btn');
    if (!firstBtn || !secondBtn) return;
    var ACTIVE = ['border-primary', 'bg-primary/10', 'text-primary'];
    var INACTIVE = ['border-gray-200', 'bg-gray-50', 'text-gray-500'];
    [firstBtn, secondBtn].forEach(function (btn) {
        btn.classList.remove.apply(btn.classList, ACTIVE.concat(INACTIVE));
        btn.classList.add.apply(btn.classList, INACTIVE);
    });
    var activeBtn = period === 'first_half' ? firstBtn : secondBtn;
    activeBtn.classList.remove.apply(activeBtn.classList, INACTIVE);
    activeBtn.classList.add.apply(activeBtn.classList, ACTIVE);
}

function _resetHalfDayUI() {
    _leaveDuration = 'full';
    _halfDayPeriod = null;
    _leaveMode = 'single';
    setLeaveDuration('full');
    setLeaveMode('single');
}

// ---- APPLY LEAVE MODAL ----
async function openApplyLeaveModal(preselectPolicyId) {
    var m = document.getElementById('apply-leave-modal');
    if (!m) return;
    document.getElementById('leave-type-select').value = '';
    document.getElementById('leave-start-date').value = '';
    document.getElementById('leave-end-date').value = '';
    document.getElementById('leave-reason').value = '';
    _resetHalfDayUI();
    // Bind start-date → end-date auto-sync for half-day and single-day mode (once per element lifetime)
    var startDateEl = document.getElementById('leave-start-date');
    if (startDateEl && !startDateEl.dataset.halfDaySyncBound) {
        startDateEl.dataset.halfDaySyncBound = '1';
        startDateEl.addEventListener('change', function () {
            if (_leaveDuration === 'half' || _leaveMode === 'single') {
                var endEl = document.getElementById('leave-end-date');
                if (endEl) endEl.value = this.value;
            }
        });
    }
    var typeSelect = document.getElementById('leave-type-select');
    typeSelect.innerHTML = '<option value="">Select leave type...</option>';
    try {
        var customPolicies = await fetchCustomPoliciesForApply();
        if (customPolicies && customPolicies.length) {
            customPolicies.forEach(function (p) {
                typeSelect.innerHTML += '<option value="custom:' + p.id + '">' + (p.title || 'Custom') + '</option>';
            });
            if (preselectPolicyId) typeSelect.value = 'custom:' + preselectPolicyId;
        } else {
            typeSelect.innerHTML += '<option value="" disabled>No leave policies available yet</option>';
        }
    } catch (e) {
        console.warn('Could not load custom policies', e);
        typeSelect.innerHTML += '<option value="" disabled>Failed to load leave policies</option>';
    }
    m.classList.remove('hidden');
}

function toISODate(value) {
    if (!value || typeof value !== 'string') return value;
    var s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var parts = s.split(/[\/\-\.]/);
    if (parts.length === 3) {
        var a = parseInt(parts[0], 10), b = parseInt(parts[1], 10), c = parseInt(parts[2], 10);
        if (isNaN(a) || isNaN(b) || isNaN(c)) return value;
        if (c < 100) c += 2000;
        var year, month, day;
        if (a > 31) { year = a; month = b; day = c; }
        else if (c > 31) { year = c; month = b; day = a; }
        else { year = c; month = b; day = a; }
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
            return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }
    return value;
}

async function submitLeaveApplication() {
    var typeRaw = document.getElementById('leave-type-select').value;
    var start = (document.getElementById('leave-start-date').value || '').trim();
    var end = (document.getElementById('leave-end-date').value || '').trim();
    var reason = (document.getElementById('leave-reason').value || '').trim();
    if (!typeRaw) { showToast('Select leave type', 'error'); return; }
    var isHalf = _leaveDuration === 'half';
    // For half-day or single-day mode, end date is always the same as start date
    if ((isHalf || _leaveMode === 'single') && start) end = start;
    if (!start || !end) { showToast('Select a date', 'error'); return; }
    if (!reason) { showToast('Provide a reason', 'error'); return; }
    start = toISODate(start);
    end = toISODate(end);

    if (isHalf && start !== end) { showToast('Half-day leave must be for a single date', 'error'); return; }
    if (isHalf && !_halfDayPeriod) { showToast('Select First Half or Second Half', 'error'); return; }

    var type = typeRaw;
    var customPolicyId = null;
    if (typeRaw.indexOf('custom:') === 0) {
        customPolicyId = parseInt(typeRaw.slice(7), 10);
        type = 'custom';
    }
    var body = { leave_type: type, start_date: start, end_date: end, reason: reason, is_half_day: isHalf };
    if (isHalf) body.half_day_period = _halfDayPeriod;
    if (customPolicyId) body.custom_policy_id = customPolicyId;
    if (customPolicyId) {
        var policiesC = _cachedPoliciesForApply || [];
        var pol = policiesC.find(function (x) { return Number(x.id) === Number(customPolicyId); });
        if (pol) {
            var rem = _computePolicyRemainingForApply(pol, policiesC, _cachedMyLeaves || [], _cachedLeaveAdjustments || [], undefined);
            if (rem != null && rem <= 0) {
                showToast('Your leave balance for this type is zero. You cannot apply until balance is available.', 'error');
                return;
            }
        }
    }
    try {
        var res = await Api.post('/leaves/apply', body);
        var label = isHalf ? '0.5 day — ' + (_halfDayPeriod === 'first_half' ? '1st half' : '2nd half') : res.num_days + ' day' + (res.num_days !== 1 ? 's' : '');
        showToast('Leave applied! (' + label + ')', 'success');
        document.getElementById('apply-leave-modal').classList.add('hidden');
        loadLeavesTab();
    } catch (e) {
        var msg = (e && e.message) ? e.message : 'Failed to apply leave.';
        showToast(msg, 'error');
    }
}

// Fetch custom policies for apply-leave dropdown (optional cacheBust e.g. '&_=timestamp' for live data)
async function fetchCustomPoliciesForApply(cacheBust) {
    var url = Api.getApiUrl() + '/leaves/custom-policies/list?for_apply=true' + (cacheBust || '');
    var r = await fetch(url, { method: 'GET', headers: Api.getHeaders(), cache: 'no-store' });
    if (r.ok) return await r.json();
    if (r.status === 404) {
        var url2 = Api.getApiUrl() + '/leaves/custom-policies?for_apply=true' + (cacheBust || '');
        var r2 = await fetch(url2, { method: 'GET', headers: Api.getHeaders(), cache: 'no-store' });
        if (r2.ok) return await r2.json();
    }
    return [];
}

// ---- CUSTOM LEAVE POLICIES LIST (Director view) ----
async function loadCustomPolicies() {
    var c = document.getElementById('custom-leave-policies-list');
    if (!c) return;
    try {
        var list = null;
        var urlList = Api.getApiUrl() + '/leaves/custom-policies/list';
        var r = await fetch(urlList, { method: 'GET', headers: Api.getHeaders() });
        if (r.status === 401) { window.location.href = 'login.html'; return; }
        if (r.ok) {
            list = await r.json();
        } else if (r.status === 404) {
            var urlBase = Api.getApiUrl() + '/leaves/custom-policies';
            var r2 = await fetch(urlBase, { method: 'GET', headers: Api.getHeaders() });
            if (r2.status === 401) { window.location.href = 'login.html'; return; }
            if (r2.ok) list = await r2.json();
        }
        if (list !== null) {
            window._customPoliciesList = list;
            renderCustomPolicies(list);
            return;
        }
        if (r.status === 404 || r.status === 405) {
            c.innerHTML = '<p class="text-amber-600 text-sm p-4">Custom policies need the latest backend. <button type="button" onclick="loadCustomPolicies()" class="ml-1 text-amber-700 underline font-medium hover:no-underline">Retry</button></p>';
            return;
        }
        var e = await r.json().catch(function () { return {}; });
        var d = typeof e.detail === 'string' ? e.detail : (e.detail && e.detail[0] && e.detail[0].msg) || r.statusText;
        throw new Error(d || 'Failed to load');
    } catch (err) {
        var msg = (err && err.message) ? err.message : 'Failed to load custom leave policies';
        c.innerHTML = '<p class="text-red-500 text-sm p-4">' + msg + '</p>';
    }
}

function renderCustomPolicies(list) {
    var c = document.getElementById('custom-leave-policies-list');
    if (!c) return;
    if (!list || list.length === 0) {
        c.innerHTML = '<div class="text-center py-10"><svg class="w-10 h-10 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg><p class="text-gray-400 text-sm font-medium">No custom policies yet</p><p class="text-gray-300 text-xs mt-1">Create one to allow your team to apply for this leave type.</p></div>';
        return;
    }
    var roleColors = { employee: 'bg-emerald-50 text-emerald-600', intern: 'bg-amber-50 text-amber-600', manager: 'bg-blue-50 text-blue-600' };
    var h = '<div class="divide-y divide-gray-50">';
    list.forEach(function (p) {
        var roles = Array.isArray(p.allowed_roles) ? p.allowed_roles : [];
        h += '<div class="group flex items-center justify-between px-5 py-4 hover:bg-gray-50/40 transition-colors">';
        h += '<div class="min-w-0 flex-1">';
        // Title + badges row
        h += '<div class="flex items-center gap-2 flex-wrap">';
        h += '<p class="text-sm font-semibold text-gray-800">' + (p.title || 'Untitled') + '</p>';
        if (p.allowed_on_probation === false) h += '<span class="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded uppercase tracking-wide">No Probation</span>';
        if (p.sub_type_name) h += '<span class="text-[9px] font-semibold bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded">' + p.sub_type_name + '</span>';
        h += '</div>';
        // Meta row
        h += '<div class="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-400">';
        h += '<span class="inline-flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' + (p.prior_days === 0 ? 'Anytime' : p.prior_days + 'd prior') + '</span>';
        if (p.max_days_per_month != null && p.max_days_per_month > 0) h += '<span>Max ' + p.max_days_per_month + '/mo</span>';
        if (p.monthly_allowance != null && p.monthly_allowance > 0) h += '<span>' + p.monthly_allowance + '/mo wallet</span>';
        if (p.shared_annual_limit != null && p.shared_annual_limit > 0) h += '<span>Pool ' + p.shared_annual_limit + '/yr</span>';
        h += '</div>';
        // Role badges
        h += '<div class="flex items-center gap-1.5 mt-2">';
        roles.forEach(function (r) {
            h += '<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded ' + (roleColors[r] || 'bg-gray-50 text-gray-500') + ' capitalize">' + r + '</span>';
        });
        h += '</div>';
        h += '</div>';
        // Edit and Delete
        h += '<div class="shrink-0 ml-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">';
        h += '<button type="button" onclick="openEditCustomPolicyModal(' + p.id + ')" class="text-xs text-gray-300 hover:text-primary hover:bg-primary/10 p-2 rounded-lg font-medium transition-all" title="Edit policy">';
        h += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>';
        h += '</button>';
        h += '<button type="button" onclick="deleteCustomPolicy(' + p.id + ')" class="text-xs text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg font-medium transition-all" title="Delete policy">';
        h += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';
        h += '</button>';
        h += '</div>';
        h += '</div>';
    });
    h += '</div>';
    c.innerHTML = h;
}

// ---- CREATE / EDIT CUSTOM POLICY MODAL ----
function openCreateCustomPolicyModal() {
    var editIdEl = document.getElementById('custom-policy-edit-id');
    if (editIdEl) editIdEl.value = '';
    var titleEl = document.getElementById('create-custom-policy-modal-title');
    if (titleEl) titleEl.textContent = 'Create Custom Leave Policy';
    var btnEl = document.getElementById('create-custom-policy-submit-btn');
    if (btnEl) btnEl.textContent = 'Create Policy';
    var m = document.getElementById('create-custom-policy-modal');
    if (!m) return;
    document.getElementById('custom-policy-title').value = '';
    document.getElementById('custom-policy-prior-days').value = '0';
    var maxPerMonthEl = document.getElementById('custom-policy-max-days-per-month');
    if (maxPerMonthEl) maxPerMonthEl.value = '';
    var monthlyAllowanceEl = document.getElementById('custom-policy-monthly-allowance');
    if (monthlyAllowanceEl) monthlyAllowanceEl.value = '';
    var enableSubTypesEl = document.getElementById('custom-policy-enable-sub-types');
    if (enableSubTypesEl) enableSubTypesEl.checked = false;
    var sharedAnnualEl = document.getElementById('custom-policy-shared-annual-limit');
    if (sharedAnnualEl) sharedAnnualEl.value = '';
    var allowedOnProbationEl = document.getElementById('custom-policy-allowed-on-probation');
    if (allowedOnProbationEl) allowedOnProbationEl.checked = true;
    document.getElementById('custom-policy-role-employee').checked = false;
    document.getElementById('custom-policy-role-intern').checked = false;
    document.getElementById('custom-policy-role-manager').checked = false;

    var list = document.getElementById('sub-categories-list');
    if (list) {
        list.innerHTML = '';
        addSubCategoryRow();
        addSubCategoryRow();
    }

    updatePriorDaysState(); // reset disabled state
    m.classList.remove('hidden');
}

function openEditCustomPolicyModal(policyId) {
    var list = window._customPoliciesList;
    if (!list || !list.length) { showToast('Policy list not loaded', 'error'); return; }
    var p = list.find(function (x) { return x.id === policyId; });
    if (!p) { showToast('Policy not found', 'error'); return; }
    var editIdEl = document.getElementById('custom-policy-edit-id');
    if (editIdEl) editIdEl.value = String(p.id);
    var titleEl = document.getElementById('create-custom-policy-modal-title');
    if (titleEl) titleEl.textContent = 'Edit Custom Leave Policy';
    var btnEl = document.getElementById('create-custom-policy-submit-btn');
    if (btnEl) btnEl.textContent = 'Save changes';

    document.getElementById('custom-policy-title').value = p.title || '';
    document.getElementById('custom-policy-prior-days').value = String(p.prior_days != null ? p.prior_days : 0);
    var maxEl = document.getElementById('custom-policy-max-days-per-month');
    if (maxEl) maxEl.value = (p.max_days_per_month != null && parseFloat(p.max_days_per_month) > 0) ? String(p.max_days_per_month) : '';
    var monthlyEl = document.getElementById('custom-policy-monthly-allowance');
    if (monthlyEl) monthlyEl.value = (p.monthly_allowance != null && parseFloat(p.monthly_allowance) > 0) ? String(p.monthly_allowance) : '';
    var sharedEl = document.getElementById('custom-policy-shared-annual-limit');
    if (sharedEl) sharedEl.value = (p.shared_annual_limit != null && parseFloat(p.shared_annual_limit) > 0) ? String(p.shared_annual_limit) : '';
    var allowedOnProbationEl = document.getElementById('custom-policy-allowed-on-probation');
    if (allowedOnProbationEl) allowedOnProbationEl.checked = p.allowed_on_probation !== false;
    var roles = Array.isArray(p.allowed_roles) ? p.allowed_roles : [];
    var empEl = document.getElementById('custom-policy-role-employee');
    if (empEl) empEl.checked = roles.indexOf('employee') !== -1;
    var intEl = document.getElementById('custom-policy-role-intern');
    if (intEl) intEl.checked = roles.indexOf('intern') !== -1;
    var mgrEl = document.getElementById('custom-policy-role-manager');
    if (mgrEl) mgrEl.checked = roles.indexOf('manager') !== -1;

    var enableSubTypesEl = document.getElementById('custom-policy-enable-sub-types');
    if (enableSubTypesEl) enableSubTypesEl.checked = false;
    var subSection = document.getElementById('sub-types-section');
    if (subSection) subSection.style.display = 'none';
    updatePriorDaysState();

    var m = document.getElementById('create-custom-policy-modal');
    if (m) m.classList.remove('hidden');
}

function addSubCategoryRow() {
    var list = document.getElementById('sub-categories-list');
    if (!list) return;
    var div = document.createElement('div');
    div.className = 'flex items-center gap-2 sub-category-row';
    div.innerHTML = '<input type="text" placeholder="e.g. Medical" class="sub-category-name flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">' +
        '<input type="number" placeholder="Days" class="sub-category-prior-days w-28 text-center border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" min="0">' +
        '<button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 p-1 w-6 text-center" title="Remove row"><svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>';
    list.appendChild(div);
}

function updatePriorDaysState() {
    var enableSubTypesEl = document.getElementById('custom-policy-enable-sub-types');
    var enableSubTypes = !!(enableSubTypesEl && enableSubTypesEl.checked);
    var section = document.getElementById('sub-types-section');
    if (section) {
        section.style.display = enableSubTypes ? 'block' : 'none';
    }

    var input = document.getElementById('custom-policy-prior-days');
    var wrapper = document.getElementById('prior-days-wrapper');
    var label = document.getElementById('prior-days-label');
    var note = document.getElementById('prior-days-override-note');

    if (!input) return;

    if (enableSubTypes) {
        input.disabled = true;
        input.value = '0';
        input.classList.add('opacity-40', 'cursor-not-allowed', 'bg-gray-100');
        input.classList.remove('focus:ring-2', 'focus:ring-primary\/30', 'focus:border-primary');
        if (wrapper) wrapper.classList.add('opacity-60');
        if (label) label.classList.add('line-through', 'text-gray-400');
        if (note) note.classList.remove('hidden');
    } else {
        input.disabled = false;
        input.classList.remove('opacity-40', 'cursor-not-allowed', 'bg-gray-100');
        input.classList.add('focus:ring-2', 'focus:ring-primary\/30', 'focus:border-primary');
        if (wrapper) wrapper.classList.remove('opacity-60');
        if (label) { label.classList.remove('line-through', 'text-gray-400'); }
        if (note) note.classList.add('hidden');
    }
}

// ---- SUBMIT CREATE OR UPDATE POLICY ----
async function submitCreateOrUpdateCustomPolicy() {
    var editIdEl = document.getElementById('custom-policy-edit-id');
    var editId = editIdEl && editIdEl.value ? parseInt(editIdEl.value, 10) : null;
    if (editId) {
        await submitUpdateCustomPolicy(editId);
        return;
    }
    await submitCreateCustomPolicy();
}

async function submitUpdateCustomPolicy(policyId) {
    var title = (document.getElementById('custom-policy-title').value || '').trim();
    var priorDays = parseInt(document.getElementById('custom-policy-prior-days').value, 10);
    if (isNaN(priorDays) || priorDays < 0) priorDays = 0;
    var maxPerMonthEl = document.getElementById('custom-policy-max-days-per-month');
    var maxDaysPerMonth = _parseOptionalPolicyDecimalInput(maxPerMonthEl);
    var monthlyAllowanceEl = document.getElementById('custom-policy-monthly-allowance');
    var monthlyAllowance = _parseOptionalPolicyDecimalInput(monthlyAllowanceEl);
    var sharedAnnualEl = document.getElementById('custom-policy-shared-annual-limit');
    var sharedAnnualLimit = _parseOptionalPolicyDecimalInput(sharedAnnualEl);
    var allowedOnProbationEl = document.getElementById('custom-policy-allowed-on-probation');
    var allowedOnProbation = allowedOnProbationEl ? allowedOnProbationEl.checked : true;
    var roles = [];
    if (document.getElementById('custom-policy-role-employee').checked) roles.push('employee');
    if (document.getElementById('custom-policy-role-intern').checked) roles.push('intern');
    if (document.getElementById('custom-policy-role-manager').checked) roles.push('manager');

    if (!title) { showToast('Enter a heading/title', 'error'); return; }
    if (roles.length === 0) { showToast('Select at least one role', 'error'); return; }

    var body = { title: title, prior_days: priorDays, allowed_roles: roles, allowed_on_probation: allowedOnProbation };
    if (maxDaysPerMonth != null) body.max_days_per_month = maxDaysPerMonth;
    if (monthlyAllowance != null) body.monthly_allowance = monthlyAllowance;
    if (sharedAnnualLimit != null && sharedAnnualLimit > 0) body.shared_annual_limit = sharedAnnualLimit;

    try {
        await Api.put('/leaves/custom-policies/' + policyId, body);
        showToast('Policy updated', 'success');
        document.getElementById('create-custom-policy-modal').classList.add('hidden');
        document.getElementById('custom-policy-edit-id').value = '';
        loadCustomPolicies();
        if (typeof loadLeaveBalance === 'function') loadLeaveBalance();
    } catch (e) { showToast(e.message || 'Failed to update policy', 'error'); }
}

// ---- SUBMIT CREATE POLICY ----
async function submitCreateCustomPolicy() {
    var title = (document.getElementById('custom-policy-title').value || '').trim();
    var priorDays = parseInt(document.getElementById('custom-policy-prior-days').value, 10) || 0;
    var maxPerMonthEl = document.getElementById('custom-policy-max-days-per-month');
    var maxDaysPerMonth = _parseOptionalPolicyDecimalInput(maxPerMonthEl);
    var monthlyAllowanceEl = document.getElementById('custom-policy-monthly-allowance');
    var monthlyAllowance = _parseOptionalPolicyDecimalInput(monthlyAllowanceEl);

    var enableSubTypes = !!(document.getElementById('custom-policy-enable-sub-types') && document.getElementById('custom-policy-enable-sub-types').checked);

    var subTypes = [];
    var subtypePriorMap = {};
    if (enableSubTypes) {
        var rows = document.querySelectorAll('.sub-category-row');
        rows.forEach(function (row) {
            var name = (row.querySelector('.sub-category-name').value || '').trim();
            var prior = row.querySelector('.sub-category-prior-days').value;
            if (name) {
                subTypes.push(name);
                var p = 0; // Default to 0 if left empty
                if (prior !== '') {
                    p = parseInt(prior, 10);
                    if (isNaN(p) || p < 0) p = 0;
                }
                subtypePriorMap[name] = p;
            }
        });
    }

    var sharedAnnualEl = document.getElementById('custom-policy-shared-annual-limit');
    var sharedAnnualLimit = _parseOptionalPolicyDecimalInput(sharedAnnualEl);

    // Probation
    var allowedOnProbationEl = document.getElementById('custom-policy-allowed-on-probation');
    var allowedOnProbation = allowedOnProbationEl ? allowedOnProbationEl.checked : true;
    var roles = [];
    if (document.getElementById('custom-policy-role-employee').checked) roles.push('employee');
    if (document.getElementById('custom-policy-role-intern').checked) roles.push('intern');
    if (document.getElementById('custom-policy-role-manager').checked) roles.push('manager');

    if (!title) { showToast('Enter a heading/title', 'error'); return; }
    if (roles.length === 0) { showToast('Select at least one role (Employees, Interns, or Managers)', 'error'); return; }

    if (enableSubTypes) {
        if (subTypes.length < 2) { showToast('Enter at least 2 sub leave categories', 'error'); return; }
        if (sharedAnnualLimit == null || isNaN(sharedAnnualLimit) || sharedAnnualLimit <= 0) {
            showToast('Enter a valid shared annual total days value', 'error');
            return;
        }
    }

    var body = { title: title, prior_days: priorDays, allowed_roles: roles, allowed_on_probation: allowedOnProbation };
    if (maxDaysPerMonth != null) body.max_days_per_month = maxDaysPerMonth;
    if (monthlyAllowance != null) body.monthly_allowance = monthlyAllowance;
    if (enableSubTypes) {
        body.enable_sub_types = true;
        body.sub_types = subTypes;
        body.shared_annual_limit = sharedAnnualLimit;
        if (Object.keys(subtypePriorMap).length > 0) {
            body.sub_type_prior_days = subtypePriorMap;
        }
    }
    try {
        await Api.post('/leaves/custom-policies/create', body);
        showToast(enableSubTypes ? 'Grouped leave policy created' : 'Custom leave policy created', 'success');
        document.getElementById('create-custom-policy-modal').classList.add('hidden');
        loadCustomPolicies();
    } catch (e) { showToast(e.message || 'Failed to create policy', 'error'); }
}

async function deleteCustomPolicy(id) {
    if (!confirm('Delete this custom leave policy? Existing leave requests under it will keep the policy title.')) return;
    try {
        await Api.delete('/leaves/custom-policies/' + id);
        showToast('Policy deleted', 'success');
        loadCustomPolicies();
    } catch (e) { showToast(e.message || 'Failed to delete', 'error'); }
}

// ---- DIRECTOR: Pending leave approvals ----
function resetApprovalsFilter() {
    var m = document.getElementById('leaves-month-pending');
    var y = document.getElementById('leaves-year-pending');
    var s = document.getElementById('leaves-status-pending');
    if (m) m.value = '';
    if (y) y.value = '';
    if (s) s.value = 'all';
    loadPendingLeaves();
}

async function loadPendingLeaves() {
    var c = document.getElementById('pending-leaves-list');
    if (!c) return;
    try {
        var f = getLeavesFilterParams('pending');
        var q = buildLeavesFilterQuery(f);
        // Append status filter
        var statusEl = document.getElementById('leaves-status-pending');
        var statusVal = statusEl ? statusEl.value : '';
        if (statusVal) q += (q ? '&' : '?') + 'status=' + encodeURIComponent(statusVal);
        var bust = (q ? '&' : '?') + '_=' + Date.now();
        var leaves = await Api.get('/leaves/pending' + q + bust);

        // Update badge
        var badge = document.getElementById('pending-leaves-count-badge');
        if (badge) {
            var statusEl2 = document.getElementById('leaves-status-pending');
            var curStatus = statusEl2 ? (statusEl2.value || 'pending') : 'pending';
            if (leaves && leaves.length > 0) {
                badge.textContent = leaves.length + ' ' + (curStatus === 'all' ? 'total' : curStatus);
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        if (!leaves || leaves.length === 0) {
            var statusEl3 = document.getElementById('leaves-status-pending');
            var curStatus3 = statusEl3 ? (statusEl3.options[statusEl3.selectedIndex] && statusEl3.options[statusEl3.selectedIndex].text || 'pending') : 'pending';
            c.innerHTML = '<div class="flex flex-col items-center justify-center py-14 px-6">' +
                '<div class="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">' +
                '<svg class="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg></div>' +
                '<p class="text-sm font-semibold text-gray-600">No results</p>' +
                '<p class="text-xs text-gray-400 mt-0.5">No ' + curStatus3.toLowerCase() + ' leave requests for this period.</p></div>';
            return;
        }

        var rows = leaves.map(function(l) {
            var typeLabel = l.custom_policy_title || ((l.leave_type || '').replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }));
            var roleLabel = (l.user_role || 'employee').charAt(0).toUpperCase() + (l.user_role || 'employee').slice(1);
            var st = (l.status || 'pending').toLowerCase();

            // Date format: "May 14 \u2013 18" or "May 14"
            var dateStr;
            if (l.is_half_day) {
                var period = l.half_day_period === 'first_half' ? '1st half' : '2nd half';
                dateStr = fmtDateRange(l.start_date, l.start_date) + ' <span class="text-[10px] font-medium text-violet-600">' + period + '</span>';
            } else {
                dateStr = fmtDateRange(l.start_date, l.end_date);
            }

            // Status badge for non-pending rows
            var statusBadge = '';
            if (st === 'approved') statusBadge = ' <span class="inline-block text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">Approved</span>';
            else if (st === 'rejected') statusBadge = ' <span class="inline-block text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">Rejected</span>';
            else if (st === 'cancelled') statusBadge = ' <span class="inline-block text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">Cancelled</span>';

            // Reason cell: truncate long reasons with an expand toggle
            var reasonHtml;
            if (l.reason && l.reason.length > 55) {
                var safeShort = escapeHtml(l.reason.substring(0, 55));
                var safeFull = escapeHtml(l.reason);
                reasonHtml = '<span class="reason-short">' + safeShort + '\u2026</span>' +
                    '<span class="reason-full hidden">' + safeFull + '</span>' +
                    '<button class="ml-1 inline-flex items-center text-gray-400 hover:text-gray-600 align-middle" onclick="toggleReason(this)">' +
                    '<svg class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>' +
                    '</button>';
            } else {
                reasonHtml = escapeHtml(l.reason || '\u2014');
            }

            // Actions
            var actionsHtml = '';
            if (st === 'pending') {
                actionsHtml =
                    '<button onclick="reviewLeave(' + l.id + ',\'approved\')" class="px-4 py-1.5 rounded-md text-sm font-semibold text-white bg-[#2d6a4f] hover:bg-[#1b4332] transition-colors mr-2">Approve</button>' +
                    '<button onclick="reviewLeave(' + l.id + ',\'rejected\')" class="px-4 py-1.5 rounded-md text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">Deny</button>';
            } else if (st === 'approved') {
                actionsHtml = '<button onclick="revokeLeave(' + l.id + ')" class="px-4 py-1.5 rounded-md text-sm font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">Revoke</button>';
            }

            return '<tr class="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">' +
                '<td class="px-5 py-3.5 align-middle">' +
                    '<p class="text-sm font-semibold text-gray-900">' + escapeHtml(l.user_name || 'Unknown') + '</p>' +
                    '<p class="text-xs text-gray-400 mt-0.5">' + roleLabel + '</p>' +
                '</td>' +
                '<td class="px-5 py-3.5 align-middle text-sm text-gray-700">' + typeLabel + statusBadge + '</td>' +
                '<td class="px-5 py-3.5 align-middle text-sm text-gray-700 whitespace-nowrap">' + dateStr + '</td>' +
                '<td class="px-5 py-3.5 align-middle text-sm text-gray-600 max-w-xs">' + reasonHtml + '</td>' +
                '<td class="px-5 py-3.5 align-middle text-sm text-gray-500 whitespace-nowrap">' + (l.applied_at ? fmtAppliedAt(l.applied_at) : '—') + '</td>' +
                '<td class="px-5 py-3.5 align-middle whitespace-nowrap">' + actionsHtml + '</td>' +
                '</tr>';
        });

        c.innerHTML = '<div class="overflow-x-auto">' +
            '<table class="w-full">' +
            '<thead><tr class="border-b border-gray-200 bg-gray-50/60">' +
            '<th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>' +
            '<th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Leave Type</th>' +
            '<th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Dates</th>' +
            '<th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</th>' +
            '<th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Applied On</th>' +
            '<th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>' +
            '</tr></thead>' +
            '<tbody>' + rows.join('') + '</tbody>' +
            '</table></div>';
    } catch (e) { c.innerHTML = '<p class="text-red-500 text-sm p-4">Failed to load</p>'; }
}

async function reviewLeave(id, status) {
    try {
        await Api.put('/leaves/' + id + '/review', { status: status });
        if (typeof showToast === 'function') showToast('Leave ' + status + '!', 'success');
        loadPendingLeaves();
        if (typeof loadLeaveBalance === 'function') loadLeaveBalance();
        if (typeof loadEmployeeLeaveBalance === 'function') loadEmployeeLeaveBalance();
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Failed', 'error');
    }
}

async function revokeLeave(id) {
    if (!confirm('Revoke this approved leave? The employee\'s balance will be restored.')) return;
    try {
        await Api.post('/leaves/' + id + '/revoke', {});
        if (typeof showToast === 'function') showToast('Leave revoked.', 'success');
        loadPendingLeaves();
        if (typeof loadLeaveBalance === 'function') loadLeaveBalance();
        if (typeof loadEmployeeLeaveBalance === 'function') loadEmployeeLeaveBalance();
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Failed to revoke', 'error');
    }
}

// ---- Director: Adjust leave balance ----
var _adjustLeaveUsersCache = [];
var _adjustLeaveUserSearchBound = false;

var _adjustLeaveComboboxCfg = null;

function renderAdjustLeaveUserSelect() {
    if (_adjustLeaveComboboxCfg && _adjustLeaveComboboxCfg._render) _adjustLeaveComboboxCfg._render();
}

var _adjustBalanceEventsBound = false;

async function openAdjustLeaveModal() {
    var modal = document.getElementById('adjust-leave-modal');
    if (!modal) return;
    var yearEl = document.getElementById('adjust-leave-year');
    var typeSel = document.getElementById('adjust-leave-type');
    var daysEl = document.getElementById('adjust-leave-days');
    var reasonEl = document.getElementById('adjust-leave-reason');
    if (!yearEl || !typeSel || !daysEl) return;
    var y = new Date().getFullYear();
    yearEl.value = y;
    daysEl.value = '';
    if (reasonEl) reasonEl.value = '';
    _adjustBalanceCache = { user_id: null, policy_id: null, data: null };
    var preview = document.getElementById('adjust-leave-balance-preview');
    if (preview) preview.classList.add('hidden');

    if (!_adjustLeaveComboboxCfg) {
        _adjustLeaveComboboxCfg = {
            searchId: 'adjust-leave-user-search', hiddenId: 'adjust-leave-user',
            dropdownId: 'adjust-leave-user-dropdown', clearBtnId: 'adjust-leave-user-clear',
            placeholder: 'Search team member…', users: [],
            onSelect: function () { fetchAdjustLeaveBalance(); }
        };
        _initCombobox(_adjustLeaveComboboxCfg);
    }
    _resetCombobox(_adjustLeaveComboboxCfg);

    if (!_adjustBalanceEventsBound) {
        _adjustBalanceEventsBound = true;
        typeSel.addEventListener('change', fetchAdjustLeaveBalance);
        daysEl.addEventListener('input', updateAdjustBalancePreview);
    }
    try {
        var users = await Api.get('/auth/all-users');
        users = users || [];
        _adjustLeaveUsersCache = _sortUsersForLeaveBalance(users.filter(function (u) { return u.role !== 'senior'; }));
        _adjustLeaveComboboxCfg.users = _adjustLeaveUsersCache;
        var policies = await Api.get('/leaves/custom-policies/list');
        policies = policies || [];
        typeSel.innerHTML = '<option value="">Select...</option>' + policies.map(function (p) { return '<option value="c_' + p.id + '">' + (p.title || 'Policy #' + p.id) + '</option>'; }).join('');
        typeSel.value = '';
    } catch (e) { if (typeof showToast === 'function') showToast('Failed to load users or policies', 'error'); }
    modal.classList.remove('hidden');
}

var _adjustBalanceCache = { user_id: null, policy_id: null, data: null };

async function fetchAdjustLeaveBalance() {
    var preview = document.getElementById('adjust-leave-balance-preview');
    if (!preview) return;
    var userSel = document.getElementById('adjust-leave-user');
    var typeSel = document.getElementById('adjust-leave-type');
    var userId = userSel ? userSel.value : '';
    var typeVal = typeSel ? typeSel.value : '';
    if (!userId || !typeVal || typeVal.indexOf('c_') !== 0) {
        preview.classList.add('hidden');
        _adjustBalanceCache = { user_id: null, policy_id: null, data: null };
        updateAdjustBalancePreview();
        return;
    }
    var policyId = parseInt(typeVal.slice(2), 10);
    if (_adjustBalanceCache.user_id === userId && _adjustBalanceCache.policy_id === policyId && _adjustBalanceCache.data) {
        preview.classList.remove('hidden');
        updateAdjustBalancePreview();
        return;
    }
    preview.classList.remove('hidden');
    var currentEl = document.getElementById('adjust-current-balance');
    var afterEl = document.getElementById('adjust-after-balance');
    if (currentEl) currentEl.innerHTML = '<span class="animate-pulse text-gray-400">Loading…</span>';
    if (afterEl) afterEl.textContent = '—';
    try {
        var bal = await Api.get('/leaves/policy-balance?user_id=' + encodeURIComponent(userId) + '&policy_id=' + encodeURIComponent(policyId));
        _adjustBalanceCache = { user_id: userId, policy_id: policyId, data: bal };
        updateAdjustBalancePreview();
    } catch (e) {
        _adjustBalanceCache = { user_id: userId, policy_id: policyId, data: null };
        if (currentEl) currentEl.textContent = 'Unable to load';
        if (afterEl) afterEl.textContent = '—';
    }
}

function updateAdjustBalancePreview() {
    var preview = document.getElementById('adjust-leave-balance-preview');
    var currentEl = document.getElementById('adjust-current-balance');
    var afterEl = document.getElementById('adjust-after-balance');
    var detailEl = document.getElementById('adjust-balance-detail');
    if (!preview || !currentEl || !afterEl) return;
    var bal = _adjustBalanceCache.data;
    if (!bal || bal.available == null) {
        if (!_adjustBalanceCache.user_id) preview.classList.add('hidden');
        return;
    }
    preview.classList.remove('hidden');
    var avail = bal.available % 1 === 0 ? bal.available : parseFloat(bal.available.toFixed(2));
    var usedVal = bal.used != null ? (bal.used % 1 === 0 ? bal.used : parseFloat(bal.used.toFixed(2))) : '?';
    var limitVal = bal.limit != null ? (bal.limit % 1 === 0 ? bal.limit : parseFloat(bal.limit.toFixed(2))) : '—';
    currentEl.innerHTML = '<span class="text-lg font-bold ' + (avail > 0 ? 'text-emerald-600' : 'text-red-500') + '">' + avail + '</span> <span class="text-gray-500 text-xs">days available</span>';
    if (detailEl) detailEl.textContent = 'Used ' + usedVal + ' of ' + limitVal + ' (incl. pending)';

    var daysEl = document.getElementById('adjust-leave-days');
    var adjDays = daysEl ? parseFloat(daysEl.value) : NaN;
    if (!isNaN(adjDays) && adjDays !== 0) {
        var newBalance = Math.max(0, avail + adjDays);
        newBalance = newBalance % 1 === 0 ? newBalance : parseFloat(newBalance.toFixed(2));
        var arrow = adjDays > 0 ? '↑' : '↓';
        var color = adjDays > 0 ? 'text-emerald-600' : 'text-amber-600';
        afterEl.innerHTML = '<span class="text-lg font-bold ' + color + '">' + newBalance + '</span> <span class="text-gray-500 text-xs">days after adjustment (' + arrow + (adjDays > 0 ? '+' : '') + (adjDays % 1 === 0 ? adjDays : parseFloat(adjDays.toFixed(2))) + ')</span>';
    } else {
        afterEl.textContent = '—';
    }
}

async function submitLeaveAdjustment() {
    var userSel = document.getElementById('adjust-leave-user');
    var yearEl = document.getElementById('adjust-leave-year');
    var typeSel = document.getElementById('adjust-leave-type');
    var daysEl = document.getElementById('adjust-leave-days');
    var reasonEl = document.getElementById('adjust-leave-reason');
    if (!userSel || !yearEl || !typeSel || !daysEl) return;
    var userId = userSel.value ? parseInt(userSel.value, 10) : null;
    var year = yearEl.value ? parseInt(yearEl.value, 10) : null;
    var days = daysEl.value !== '' ? parseFloat(daysEl.value) : NaN;
    if (!isNaN(days)) days = Math.round(days * 100) / 100;
    var typeVal = typeSel.value || '';
    if (!userId || isNaN(year) || year < 2020 || year > 2030) { if (typeof showToast === 'function') showToast('Select a team member and a valid year', 'error'); return; }
    if (isNaN(days) || days === 0) { if (typeof showToast === 'function') showToast('Enter a non-zero adjustment (e.g. 2, -1, or 1.25)', 'error'); return; }
    if (!typeVal) { if (typeof showToast === 'function') showToast('Select a leave type', 'error'); return; }
    var body = { user_id: userId, year: year, adjustment_days: days, reason: (reasonEl && reasonEl.value) ? reasonEl.value.trim() : 'Adjusted by director' };
    if (typeVal.indexOf('c_') === 0) {
        body.custom_policy_id = parseInt(typeVal.slice(2), 10);
    } else {
        body.leave_type = typeVal;
    }
    try {
        await Api.post('/leaves/adjustments', body);
        if (typeof showToast === 'function') showToast('Leave balance updated', 'success');
        document.getElementById('adjust-leave-modal').classList.add('hidden');
        // Refresh balance everywhere it's visible
        if (typeof loadEmployeeLeaveBalance === 'function') loadEmployeeLeaveBalance();
        if (typeof loadLeaveBalance === 'function') loadLeaveBalance();
    } catch (e) { if (typeof showToast === 'function') showToast(e.message || 'Failed to apply adjustment', 'error'); }
}

// ---- Leave Reason Modal (click-to-view full reason) ----
function openLeaveReasonModalFromTitle(el) {
    if (!el || !el.getAttribute) return;
    var reason = el.getAttribute('title') || '';
    var modal = document.getElementById('leave-reason-modal');
    if (!modal) return; // modal markup is page-specific
    var textEl = document.getElementById('leave-reason-modal-text');
    if (textEl) textEl.textContent = reason || '—';
    modal.classList.remove('hidden');
}


// ============================================
// SENIOR: EMPLOYEE LEAVE DATA + LEAVE HISTORY GRID
// ============================================

var _trackerEmployeeLeaves = [];  // all leaves for selected employee (full year)
var _trackerEmployeePolicies = []; // policies with balance for selected employee

// Called when employee is selected from combobox (override _selectTeamLeaveBalanceUser callback)
var _origSelectTeamLeaveBalanceUser = typeof _selectTeamLeaveBalanceUser === 'function' ? _selectTeamLeaveBalanceUser : null;

function loadEmployeeLeaveData() {
    var sel = document.getElementById('team-leave-balance-user');
    var userId = sel ? sel.value : null;
    var balContainer = document.getElementById('team-leave-balance-container');
    var histSection = document.getElementById('leave-history-section');
    var infoEl = document.getElementById('tracker-employee-info');

    if (!userId) {
        if (balContainer) balContainer.classList.add('hidden');
        if (histSection) histSection.classList.add('hidden');
        return;
    }

    if (balContainer) { balContainer.classList.remove('hidden'); balContainer.innerHTML = '<p class="text-sm text-gray-400">Loading balance…</p>'; }
    if (histSection) histSection.classList.add('hidden');

    var year = (document.getElementById('leave-history-year-select') && document.getElementById('leave-history-year-select').value)
        ? parseInt(document.getElementById('leave-history-year-select').value)
        : new Date().getFullYear();

    Promise.all([
        Api.get('/leaves/user-policy-balances?user_id=' + encodeURIComponent(userId) + '&_=' + Date.now()),
        Api.get('/auth/users').catch(function() { return []; }),
        Api.get('/leaves/my-leaves?user_id=' + encodeURIComponent(userId)).catch(function() { return []; })
    ]).then(function(results) {
        var policies = results[0] || [];
        var allUsers = results[1] || [];
        var leaves = results[2] || [];
        _trackerEmployeePolicies = policies;
        _trackerEmployeeLeaves = leaves;

        // Show joining date info
        var emp = allUsers.find(function(u) { return String(u.id) === String(userId); });
        if (emp && infoEl) {
            var joiningStr = emp.joining_date ? ('joining date is ' + _fmtDate(emp.joining_date)) : 'no joining date set';
            infoEl.textContent = 'Leaves data (calculated from joining date) of the selected employee is displayed below. ' + (emp.full_name || 'Employee') + '\u2019s ' + joiningStr + '.';
            infoEl.classList.remove('hidden');
        }

        renderLeaveCards(balContainer, policies, [], true, [], null, userId);

        // Populate year selects
        _populateTrackerYearSelects(emp);

        // Render leave history grid
        if (histSection) histSection.classList.remove('hidden');
        renderLeaveHistoryGrid();
    }).catch(function(e) {
        if (balContainer) balContainer.innerHTML = '<p class="text-sm text-red-400">Failed to load data.</p>';
    });
}

function _populateTrackerYearSelects(emp) {
    var now = new Date();
    var currentYear = now.getFullYear();
    var startYear = emp && emp.joining_date ? parseInt(emp.joining_date.substring(0, 4)) : currentYear - 2;
    if (startYear > currentYear) startYear = currentYear;

    // Main tracker year/month
    var monthSel = document.getElementById('tracker-month-select');
    var yearSel = document.getElementById('tracker-year-select');
    if (yearSel && !yearSel.dataset.populated) {
        yearSel.innerHTML = '';
        for (var y = currentYear + 1; y >= startYear; y--) {
            yearSel.innerHTML += '<option value="' + y + '"' + (y === currentYear ? ' selected' : '') + '>' + y + '</option>';
        }
        yearSel.dataset.populated = '1';
    }
    if (monthSel && !monthSel.dataset.set) {
        monthSel.value = String(now.getMonth() + 1);
        monthSel.dataset.set = '1';
    }

    // Leave history year select
    var histYearSel = document.getElementById('leave-history-year-select');
    if (histYearSel) {
        var prevVal = histYearSel.value;
        histYearSel.innerHTML = '';
        for (var hy = currentYear + 1; hy >= startYear; hy--) {
            histYearSel.innerHTML += '<option value="' + hy + '"' + (hy === currentYear ? ' selected' : '') + '>' + hy + '</option>';
        }
        if (prevVal) histYearSel.value = prevVal;
    }
}

function renderLeaveHistoryGrid() {
    var grid = document.getElementById('leave-history-grid');
    if (!grid) return;
    var histYearSel = document.getElementById('leave-history-year-select');
    var year = histYearSel ? parseInt(histYearSel.value) : new Date().getFullYear();
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Filter leaves for this year
    var yearLeaves = (_trackerEmployeeLeaves || []).filter(function(l) {
        var s = l.start_date || '';
        var e = l.end_date || '';
        return (s.startsWith(year) || e.startsWith(year)) && l.status === 'approved';
    });

    // Group by policy title
    var policyMap = {};
    (_trackerEmployeePolicies || []).forEach(function(p) {
        policyMap[p.id] = p.title || ('Policy ' + p.id);
    });

    // Build leave name → month → days map
    var leaveGrid = {}; // { title: { 1: days, 2: days, ... } }
    yearLeaves.forEach(function(l) {
        var title = l.custom_policy_title || policyMap[l.custom_policy_id] || _leavetypeLabel(l.leave_type) || 'Leave';
        if (!leaveGrid[title]) leaveGrid[title] = {};
        // Distribute days across months
        var start = new Date(l.start_date);
        var end = new Date(l.end_date);
        for (var m = 1; m <= 12; m++) {
            var mStart = new Date(year, m - 1, 1);
            var mEnd = new Date(year, m, 0);
            var s = start < mStart ? mStart : start;
            var e = end > mEnd ? mEnd : end;
            if (s <= e) {
                var days = l.is_half_day ? 0.5 : l.num_days;
                leaveGrid[title][m] = (leaveGrid[title][m] || 0) + days;
            }
        }
    });

    if (Object.keys(leaveGrid).length === 0) {
        grid.innerHTML = '<p class="text-sm text-gray-400 py-4">No approved leaves for ' + year + '.</p>';
        // Update year label on parent
        var histLabel = document.querySelector('#leave-history-section h3');
        if (histLabel) histLabel.nextElementSibling && (histLabel.nextElementSibling.textContent = 'Jan-' + year + ' to Dec-' + year);
        return;
    }

    var h = '<table class="w-full text-sm border border-gray-100 rounded-xl overflow-hidden">';
    h += '<thead><tr class="bg-gray-50">';
    h += '<th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-40">Leave Name</th>';
    months.forEach(function(m) {
        h += '<th class="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">' + m + '</th>';
    });
    h += '</tr></thead><tbody class="divide-y divide-gray-50">';

    Object.keys(leaveGrid).forEach(function(title) {
        h += '<tr class="hover:bg-gray-50/50">';
        h += '<td class="px-4 py-3 text-gray-700 font-medium">' + title + '</td>';
        for (var m = 1; m <= 12; m++) {
            var val = leaveGrid[title][m];
            if (val) {
                h += '<td class="text-center px-2 py-3"><span class="inline-flex flex-col items-center"><span class="w-2 h-2 rounded-full bg-amber-400 mb-1"></span><span class="text-xs font-semibold text-gray-700">' + val + '</span></span></td>';
            } else {
                h += '<td class="text-center px-2 py-3 text-gray-200">—</td>';
            }
        }
        h += '</tr>';
    });

    h += '</tbody></table>';
    grid.innerHTML = h;
}

function _leavetypeLabel(lt) {
    var map = { earned_leave: 'Earned Leave', casual_leave: 'Casual Leave', sick_leave: 'Sick Leave', casual_sick_leave: 'Casual/Sick Leave', unpaid_leave: 'Loss of Pay', custom: 'Custom Leave' };
    return map[lt] || (lt || 'Leave');
}
