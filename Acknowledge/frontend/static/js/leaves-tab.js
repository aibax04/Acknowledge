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
    ensureLeavesFilter('my', 'Filter by month:');
    ensureLeavesFilter('pending', 'Filter by month:');
    await Promise.all([loadLeaveBalance(), loadMyLeaves()]);
    var teamTrackerSec = document.getElementById('team-leave-tracker-section');
    if (teamTrackerSec && typeof currentUser !== 'undefined' && currentUser && (currentUser.role === 'manager' || currentUser.role === 'senior')) {
        teamTrackerSec.classList.remove('hidden');
        loadTeamLeaves();
    }

    var sec = document.getElementById('custom-leave-policies-section');
    if (sec && typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'senior') {
        sec.classList.remove('hidden');
        await loadCustomPolicies();
        loadPendingLeaves();
    } else if (sec) sec.classList.add('hidden');
}

var _cachedTeamLeaves = [];
var _teamLeavesSearchBound = false;

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

/** Rebuild employee <select> from cached users + current search box (alphabetical, filtered). */
function renderTeamLeaveBalanceUserSelect() {
    var userSel = document.getElementById('team-leave-balance-user');
    if (!userSel || !window._allUsersForLeaveBalance) return;
    var searchEl = document.getElementById('team-leave-balance-search');
    var q = (searchEl && searchEl.value) ? searchEl.value.trim().toLowerCase() : '';
    var users = window._allUsersForLeaveBalance;
    var filtered = !q ? users : users.filter(function (u) {
        var name = (u.full_name || '').toLowerCase();
        var role = (u.role || '').toLowerCase();
        var email = (u.email || '').toLowerCase();
        var office = (u.office || '').toLowerCase();
        var idStr = String(u.id != null ? u.id : '');
        return name.indexOf(q) !== -1 || role.indexOf(q) !== -1 || email.indexOf(q) !== -1 || office.indexOf(q) !== -1 || idStr.indexOf(q) !== -1;
    });
    var prev = userSel.value;
    var opts = filtered.map(function (u) {
        var label = (u.full_name || 'User') + ' (' + (u.role || '') + ')';
        return '<option value="' + _escapeHtmlAttr(u.id) + '">' + _escapeHtmlAttr(label) + '</option>';
    }).join('');
    userSel.innerHTML = '<option value="">Select employee...</option>' + opts;
    if (filtered.length === 1 && q) {
        userSel.value = String(filtered[0].id);
        loadEmployeeLeaveBalance();
        return;
    }
    var stillThere = prev && filtered.some(function (u) { return String(u.id) === String(prev); });
    if (stillThere) {
        userSel.value = prev;
    } else {
        userSel.value = '';
        var container = document.getElementById('team-leave-balance-container');
        if (container) container.classList.add('hidden');
    }
}

async function loadTeamLeaves() {
    var c = document.getElementById('team-leaves-list');
    if (!c) return;
    try {
        var balanceSearchInput = document.getElementById('team-leave-balance-search');
        if (balanceSearchInput && typeof window._balanceSearchBound === 'undefined') {
            window._balanceSearchBound = true;
            balanceSearchInput.addEventListener('input', function () {
                renderTeamLeaveBalanceUserSelect();
            });
        }

        var leaves = await Api.get('/leaves/all');
        _cachedTeamLeaves = leaves || [];
        renderTeamLeaves(_cachedTeamLeaves);

        var userSel = document.getElementById('team-leave-balance-user');
        if (userSel) {
            var users = await Api.get('/auth/all-users');
            window._allUsersForLeaveBalance = _sortUsersForLeaveBalance(users || []);
            renderTeamLeaveBalanceUserSelect();
        }

        var searchInput = document.getElementById('team-leave-search');
        if (searchInput && !_teamLeavesSearchBound) {
            _teamLeavesSearchBound = true;
            searchInput.addEventListener('input', function (e) {
                var val = e.target.value.toLowerCase();
                if (!val) {
                    renderTeamLeaves(_cachedTeamLeaves);
                    return;
                }
                var filtered = _cachedTeamLeaves.filter(function (l) {
                    return (l.user_name || '').toLowerCase().indexOf(val) > -1;
                });
                renderTeamLeaves(filtered);
            });
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
    h += '</tr></thead><tbody class="divide-y divide-gray-50 bg-white">';

    leaves.forEach(function (l) {
        var type = l.custom_policy_title || l.leave_type;
        var dates = (l.start_date || '-') + ' to ' + (l.end_date || '-');
        var reasonEsc = (l.reason || '').replace(/"/g, '&quot;');

        h += '<tr class="hover:bg-gray-50 transition-colors">';
        h += '<td class="px-6 py-4 whitespace-nowrap"><div class="font-medium text-gray-900">' + (l.user_name || 'Unknown') + '</div><div class="text-xs text-gray-400 capitalize">' + (l.user_role || 'employee') + '</div></td>';
        h += '<td class="px-6 py-4 text-gray-700 whitespace-nowrap">' + type + '</td>';
        h += '<td class="px-6 py-4 text-gray-600 whitespace-nowrap">' + dates + '</td>';
        h += '<td class="px-6 py-4 font-semibold text-gray-900 text-center">' + (l.num_days || 0) + '</td>';
        h += '<td class="px-6 py-4 text-gray-500 max-w-[200px] truncate cursor-pointer hover:text-gray-700" title="' + reasonEsc + '" onclick="openLeaveReasonModalFromTitle(this)">' + (l.reason || '—') + '</td>';
        h += '<td class="px-6 py-4">' + _statusBadge(l.status) + '</td>';
        h += '</tr>';
    });

    h += '</tbody></table></div>';
    c.innerHTML = h;
}

var _cachedEmployeeLeavesPolicies = {};
async function loadEmployeeLeaveBalance() {
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
        var policies = await Api.get('/leaves/user-policies/' + userId);
        var uid = parseInt(userId, 10);
        var employeeLeaves = _cachedTeamLeaves.filter(function (l) { return Number(l.user_id) === uid; });
        var adjustments = [];
        try {
            var year = new Date().getFullYear();
            var adjRes = await Api.get('/leaves/adjustments?user_id=' + encodeURIComponent(userId) + '&year=' + year);
            if (adjRes && Array.isArray(adjRes)) adjustments = adjRes.map(function (a) { return { leave_type: a.leave_type, custom_policy_id: a.custom_policy_id, adjustment_days: a.adjustment_days, reason: a.reason }; });
        } catch (e2) { /* ignore */ }
        renderLeaveCards(container, policies, employeeLeaves, true, adjustments);
    } catch (e) {
        container.innerHTML = '<p class="text-sm text-red-500 py-4">Failed to load balance.</p>';
    }
}

var _cachedMyLeaves = [];
var _cachedPoliciesForApply = [];

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
        var policies = await fetchCustomPoliciesForApply('&' + ts);
        _cachedPoliciesForApply = policies || [];
        var leavesRes = await Api.get('/leaves/my-leaves?' + ts);
        _cachedMyLeaves = leavesRes || [];
        var adjustments = [];
        try {
            var balanceRes = await Api.get('/leaves/balance?' + ts);
            if (balanceRes && balanceRes.adjustments) adjustments = balanceRes.adjustments;
        } catch (e) { /* ignore */ }
        renderLeaveCards(c, _cachedPoliciesForApply, _cachedMyLeaves, false, adjustments);
    } catch (e) {
        c.innerHTML = '<p class="text-gray-500 text-sm">Unable to load leave balance.</p>';
    }
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

// ---- LEAVE BALANCE CARDS (employee/intern/manager) ----
function renderLeaveCards(container, policies, leaves, readOnly, adjustments) {
    if (!container) return;
    adjustments = adjustments || [];
    if (!policies || policies.length === 0) {
        container.innerHTML = '<div class="text-center py-10"><svg class="w-10 h-10 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg><p class="text-gray-400 text-sm font-medium">No leave types available yet</p><p class="text-gray-300 text-xs mt-1">Your director can add custom leave policies.</p></div>';
        return;
    }
    var currentYear = new Date().getFullYear();
    var currentMonth = new Date().getMonth() + 1;
    var colors = ['emerald', 'blue', 'violet', 'amber', 'rose', 'teal', 'indigo', 'cyan'];
    var h = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">';
    policies.forEach(function (p, idx) {
        var color = colors[idx % colors.length];
        var used = _usedDaysForPolicyOrGroup(leaves, p, policies);
        var adjDays = _adjustmentDaysForPolicy(adjustments, p, policies);
        var limitInfo = _limitForPolicyOrGroup(p, policies);
        var monthlyAllowance = limitInfo.monthlyAllowance;
        var sharedLimit = limitInfo.sharedLimit;
        var maxPerMonth = limitInfo.maxPerMonth;
        var limit = null;
        var remaining = null;
        if (monthlyAllowance != null && monthlyAllowance > 0) {
            var monthsElapsed = currentMonth;
            var accrued = monthlyAllowance * monthsElapsed;
            limit = accrued;
            remaining = Math.max(0, accrued - used + adjDays);
        } else if (sharedLimit != null && sharedLimit >= 0) {
            limit = sharedLimit;
            remaining = Math.max(0, limit - used + adjDays);
        }
        var pct = (limit != null && limit > 0) ? Math.round((used / limit) * 100) : 0;
        var hasCap = limit != null && limit >= 0;
        var balanceText, balanceLabel;
        if (hasCap) {
            var disp = remaining % 1 === 0 ? remaining : parseFloat(remaining.toFixed(2));
            balanceText = String(disp);
            balanceLabel = 'days available';
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
        // progress bar when there is a cap (no "Used X of Y" — see Ledger)
        if (limit != null && limit > 0) {
            h += '<div class="mt-3"><div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden"><div class="bg-' + color + '-500 h-1.5 rounded-full transition-all duration-700 ease-out" style="width:' + Math.min(pct, 100) + '%"></div></div>';
            h += '<p class="text-[10px] text-gray-400 mt-1">Used this year → see Ledger</p></div>';
        }
        // actions
        if (!readOnly) {
            h += '<div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">';
            h += '<button type="button" onclick="openLeaveLogsModal(' + policyId + ',\'' + (groupKey || '').replace(/'/g, "\\'") + '\')" class="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors">Logs</button>';
            h += '<span class="text-gray-200 text-xs">·</span>';
            h += '<button type="button" onclick="openLeaveLedgerModal(' + policyId + ',\'' + (groupKey || '').replace(/'/g, "\\'") + '\')" class="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors">Ledger</button>';
            h += '<button type="button" onclick="openApplyLeaveModal(' + policyId + ')" class="ml-auto text-xs font-semibold text-white bg-' + color + '-500 hover:bg-' + color + '-600 px-3.5 py-1.5 rounded-lg transition-colors shadow-sm">Request Leave</button>';
            h += '</div>';
        } else {
            h += '<div class="mt-4 pt-3 border-t border-gray-50"><p class="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Track</p></div>';
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
            t += '<td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">' + (l.start_date || '-') + '</td>';
            t += '<td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">' + (l.end_date || '-') + '</td>';
            t += '<td class="px-4 py-2.5 font-semibold text-gray-900">' + (l.num_days || 0) + '</td>';
            t += '<td class="px-4 py-2.5 text-gray-500 max-w-[200px] truncate cursor-pointer hover:text-gray-700" title="' + (l.reason || '').replace(/"/g, '&quot;') + '" onclick="openLeaveReasonModalFromTitle(this)">' + (l.reason || '-') + '</td>';
            t += '<td class="px-4 py-2.5">' + _statusBadge(l.status) + '</td></tr>';
        });
        t += '</tbody></table></div>';
        content.innerHTML = t;
    }
    modal.classList.remove('hidden');
}

// ---- LEAVE LEDGER MODAL ----
function _ledgerWalletStats(policy, leaves, adjustments, policies) {
    var currentMonth = new Date().getMonth() + 1;
    var used = _usedDaysForPolicyOrGroup(leaves, policy, policies);
    var adjDays = _adjustmentDaysForPolicy(adjustments || [], policy, policies);
    var limitInfo = _limitForPolicyOrGroup(policy, policies || []);
    var monthlyAllowance = limitInfo.monthlyAllowance;
    var sharedLimit = limitInfo.sharedLimit;
    var limit = null;
    var remaining = null;
    var accruedLabel = '';
    if (monthlyAllowance != null && monthlyAllowance > 0) {
        var monthsElapsed = currentMonth;
        var accrued = monthlyAllowance * monthsElapsed;
        limit = accrued;
        remaining = Math.max(0, accrued - used + adjDays);
        accruedLabel = 'Accrued (' + monthsElapsed + ' mo × ' + monthlyAllowance + ')';
    } else if (sharedLimit != null && sharedLimit >= 0) {
        limit = sharedLimit;
        remaining = Math.max(0, limit - used + adjDays);
        accruedLabel = 'Annual limit';
    }
    var maxPerMonth = limitInfo.maxPerMonth;
    return { used: used, adjDays: adjDays, limit: limit, remaining: remaining, accruedLabel: accruedLabel, maxPerMonth: maxPerMonth };
}

async function openLeaveLedgerModal(policyId, policyGroupKey) {
    var modal = document.getElementById('leave-ledger-modal');
    var content = document.getElementById('leave-ledger-content');
    if (!modal || !content) return;

    content.innerHTML = '<div class="flex items-center justify-center py-12 text-gray-500"><span class="animate-pulse">Loading live balance…</span></div>';
    modal.classList.remove('hidden');

    var policies = _cachedPoliciesForApply || [];
    var leaves = _cachedMyLeaves || [];
    var adjustments = [];
    var adjustmentsFull = [];

    var userId = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : null;
    var currentYear = new Date().getFullYear();

    try {
        var policiesF = fetchCustomPoliciesForApply().then(function (p) { policies = p || []; _cachedPoliciesForApply = policies; });
        var myLeavesF = Api.get('/leaves/my-leaves').then(function (l) { leaves = l || []; _cachedMyLeaves = leaves; });
        var balanceF = Api.get('/leaves/balance').then(function (b) { adjustments = (b && b.adjustments) ? b.adjustments : []; });
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
        var stats = _ledgerWalletStats(policy, leaves, adjustments, policies);
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
            var dateStr = (a.created_at || '').toString().substring(0, 10);
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
            var desc = (l.start_date && l.end_date) ? l.start_date + ' – ' + l.end_date : 'Leave';
            if (l.reason) desc += ' · ' + (l.reason.length > 40 ? l.reason.substring(0, 40) + '…' : l.reason);
            html += '<tr class="hover:bg-gray-50/80 transition-colors">';
            html += '<td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">' + (l.start_date || '-') + '</td>';
            html += '<td class="px-4 py-2.5 text-gray-600">' + desc + '</td>';
            html += '<td class="px-4 py-2.5 font-semibold text-gray-900">' + (l.num_days || 0) + '</td>';
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

// ---- TABLE ROW ----
function _leaveRow(l, showStatus, showAction) {
    var type = l.custom_policy_title || l.leave_type;
    var reasonEsc = (l.reason || '').replace(/"/g, '&quot;');
    var h = '<tr class="hover:bg-gray-50/60 transition-colors">';
    h += '<td class="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">' + type + '</td>';
    h += '<td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">' + l.start_date + '</td>';
    h += '<td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">' + l.end_date + '</td>';
    h += '<td class="px-4 py-3 text-sm font-semibold text-gray-900 text-center">' + l.num_days + '</td>';
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
function renderMyLeaves(leaves) {
    var c = document.getElementById('my-leaves-list');
    if (!c) return;

    if (!leaves || leaves.length === 0) {
        c.innerHTML = '<div class="p-6"><div class="grid grid-cols-2 gap-3 mb-4">' +
            '<div class="bg-amber-50/50 rounded-xl p-4 text-center border border-amber-100/40"><p class="text-2xl font-bold text-amber-500">0</p><p class="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mt-0.5">Pending</p></div>' +
            '<div class="bg-emerald-50/50 rounded-xl p-4 text-center border border-emerald-100/40"><p class="text-2xl font-bold text-emerald-500">0</p><p class="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mt-0.5">Approved</p></div></div>' +
            _emptyState('No leave requests yet') + '</div>';
        return;
    }

    var pending = leaves.filter(function (l) { return l.status === 'pending'; });
    var taken = leaves.filter(function (l) { return l.status === 'approved'; });
    var other = leaves.filter(function (l) { return l.status !== 'pending' && l.status !== 'approved'; });

    // Summary cards
    var colCount = other.length > 0 ? 4 : 3;
    var summary = '<div class="p-5 border-b border-gray-100">' +
        '<div class="grid grid-cols-2 sm:grid-cols-' + colCount + ' gap-3">' +
        '<div class="bg-amber-50/50 rounded-xl p-3.5 text-center border border-amber-100/40"><p class="text-2xl font-bold text-amber-600">' + pending.length + '</p><p class="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mt-0.5">Pending</p></div>' +
        '<div class="bg-emerald-50/50 rounded-xl p-3.5 text-center border border-emerald-100/40"><p class="text-2xl font-bold text-emerald-600">' + taken.length + '</p><p class="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mt-0.5">Approved</p></div>' +
        '<div class="bg-blue-50/50 rounded-xl p-3.5 text-center border border-blue-100/40"><p class="text-2xl font-bold text-blue-600">' + leaves.length + '</p><p class="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mt-0.5">Total</p></div>';
    if (other.length > 0) summary += '<div class="bg-gray-50 rounded-xl p-3.5 text-center border border-gray-100"><p class="text-2xl font-bold text-gray-500">' + other.length + '</p><p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Other</p></div>';
    summary += '</div></div>';

    // Sections
    var pendingSection = '<div class="px-5 py-4"><h4 class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Pending Requests</h4>' + _leavesTable(pending, true, true) + '</div>';
    var takenSection = '<div class="px-5 py-4 border-t border-gray-50"><h4 class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Approved Leaves</h4>' + _leavesTable(taken, false, false) + '</div>';
    var otherSection = other.length > 0 ? '<div class="px-5 py-4 border-t border-gray-50"><h4 class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Rejected / Cancelled</h4>' + _leavesTable(other, true, false) + '</div>' : '';

    c.innerHTML = summary + pendingSection + takenSection + otherSection;
}

async function cancelLeave(id) {
    if (!confirm('Cancel this leave request?')) return;
    try { await Api.delete('/leaves/' + id); showToast('Leave cancelled', 'success'); loadLeavesTab(); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}

// ---- APPLY LEAVE MODAL ----
async function openApplyLeaveModal(preselectPolicyId) {
    var m = document.getElementById('apply-leave-modal');
    if (!m) return;
    document.getElementById('leave-type-select').value = '';
    document.getElementById('leave-start-date').value = '';
    document.getElementById('leave-end-date').value = '';
    document.getElementById('leave-reason').value = '';
    var typeSelect = document.getElementById('leave-type-select');
    typeSelect.innerHTML = '<option value="">Select leave type...</option>';
    try {
        var customPolicies = await fetchCustomPoliciesForApply();
        if (customPolicies && customPolicies.length) {
            customPolicies.forEach(function (p) {
                var prior = (p.prior_days === 0 ? 'anytime' : p.prior_days + 'd prior');
                var perMonth = (p.max_days_per_month != null && p.max_days_per_month > 0) ? ' · max ' + p.max_days_per_month + '/mo' : '';
                var annual = (p.shared_annual_limit != null && p.shared_annual_limit > 0) ? ' · ' + p.shared_annual_limit + '/yr' : '';
                typeSelect.innerHTML += '<option value="custom:' + p.id + '">' + (p.title || 'Custom') + ' — ' + prior + perMonth + annual + '</option>';
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
    if (!start || !end) { showToast('Select From and To dates', 'error'); return; }
    if (!reason) { showToast('Provide a reason', 'error'); return; }
    start = toISODate(start);
    end = toISODate(end);
    var type = typeRaw;
    var customPolicyId = null;
    if (typeRaw.indexOf('custom:') === 0) {
        customPolicyId = parseInt(typeRaw.slice(7), 10);
        type = 'custom';
    }
    var body = { leave_type: type, start_date: start, end_date: end, reason: reason };
    if (customPolicyId) body.custom_policy_id = customPolicyId;
    try {
        var res = await Api.post('/leaves/apply', body);
        showToast('Leave applied! (' + res.num_days + ' days)', 'success');
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
async function loadPendingLeaves() {
    var c = document.getElementById('pending-leaves-list');
    if (!c) return;
    try {
        var f = getLeavesFilterParams('pending');
        var q = buildLeavesFilterQuery(f);
        var bust = (q ? '&' : '?') + '_=' + Date.now();
        var leaves = await Api.get('/leaves/pending' + q + bust);
        if (!leaves || leaves.length === 0) {
            c.innerHTML = _emptyState('No pending requests');
            return;
        }
        c.innerHTML = '<div class="space-y-3">' + leaves.map(function (l) {
            var typeLabel = l.custom_policy_title || l.leave_type;
            var initials = (l.user_name || '?').split(' ').map(function (w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
            return '<div class="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all">' +
                '<div class="shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">' + initials + '</div>' +
                '<div class="flex-1 min-w-0">' +
                '<div class="flex items-center justify-between gap-2 mb-1"><p class="text-sm font-semibold text-gray-900 truncate">' + l.user_name + '</p>' + _statusBadge('pending') + '</div>' +
                '<p class="text-xs text-gray-500"><span class="font-medium text-gray-600">' + typeLabel + '</span> &middot; ' + l.start_date + ' → ' + l.end_date + ' &middot; <span class="font-semibold text-gray-700">' + l.num_days + ' day' + (l.num_days !== 1 ? 's' : '') + '</span></p>' +
                '<p class="text-sm text-gray-500 mt-1.5 line-clamp-2">' + (l.reason || '—') + '</p>' +
                '<div class="flex gap-2 mt-3">' +
                '<button onclick="reviewLeave(' + l.id + ',\'approved\')" class="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 px-3.5 py-1.5 rounded-lg transition-colors shadow-sm">Approve</button>' +
                '<button onclick="reviewLeave(' + l.id + ',\'rejected\')" class="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-3.5 py-1.5 rounded-lg transition-colors">Deny</button>' +
                '</div></div></div>';
        }).join('') + '</div>';
    } catch (e) { c.innerHTML = '<p class="text-red-500 text-sm p-4">Failed to load</p>'; }
}

async function reviewLeave(id, status) {
    try { await Api.put('/leaves/' + id + '/review', { status: status }); showToast('Leave ' + status + '!', 'success'); loadPendingLeaves(); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}

// ---- Director: Adjust leave balance ----
var _adjustLeaveUsersCache = [];
var _adjustLeaveUserSearchBound = false;

function renderAdjustLeaveUserSelect() {
    var userSel = document.getElementById('adjust-leave-user');
    var searchEl = document.getElementById('adjust-leave-user-search');
    if (!userSel) return;
    var q = (searchEl && searchEl.value) ? searchEl.value.trim().toLowerCase() : '';
    var filtered = !q ? _adjustLeaveUsersCache : _adjustLeaveUsersCache.filter(function (u) {
        var name = (u.full_name || '').toLowerCase();
        var role = (u.role || '').toLowerCase();
        var email = (u.email || '').toLowerCase();
        var office = (u.office || '').toLowerCase();
        var idStr = String(u.id != null ? u.id : '');
        return name.indexOf(q) !== -1 || role.indexOf(q) !== -1 || email.indexOf(q) !== -1 || office.indexOf(q) !== -1 || idStr.indexOf(q) !== -1;
    });
    var prev = userSel.value;
    userSel.innerHTML = '<option value="">Select...</option>' + filtered.map(function (u) {
        return '<option value="' + _escapeHtmlAttr(u.id) + '">' + _escapeHtmlAttr((u.full_name || 'User #' + u.id) + ' (' + (u.role || '') + ')') + '</option>';
    }).join('');
    if (prev && filtered.some(function (u) { return String(u.id) === String(prev); })) {
        userSel.value = prev;
    } else {
        userSel.value = '';
    }
}

async function openAdjustLeaveModal() {
    var modal = document.getElementById('adjust-leave-modal');
    if (!modal) return;
    var userSel = document.getElementById('adjust-leave-user');
    var userSearchEl = document.getElementById('adjust-leave-user-search');
    var yearEl = document.getElementById('adjust-leave-year');
    var typeSel = document.getElementById('adjust-leave-type');
    var daysEl = document.getElementById('adjust-leave-days');
    var reasonEl = document.getElementById('adjust-leave-reason');
    if (!userSel || !yearEl || !typeSel || !daysEl) return;
    var y = new Date().getFullYear();
    yearEl.value = y;
    daysEl.value = '';
    if (reasonEl) reasonEl.value = '';
    if (userSearchEl) userSearchEl.value = '';
    if (userSearchEl && !_adjustLeaveUserSearchBound) {
        _adjustLeaveUserSearchBound = true;
        userSearchEl.addEventListener('input', renderAdjustLeaveUserSelect);
    }
    try {
        var users = await Api.get('/auth/all-users');
        users = users || [];
        _adjustLeaveUsersCache = _sortUsersForLeaveBalance(users.filter(function (u) { return u.role !== 'senior'; }));
        renderAdjustLeaveUserSelect();
        var policies = await Api.get('/leaves/custom-policies/list');
        policies = policies || [];
        typeSel.innerHTML = '<option value="">Select...</option>' + policies.map(function (p) { return '<option value="c_' + p.id + '">' + (p.title || 'Policy #' + p.id) + '</option>'; }).join('');
        typeSel.value = '';
    } catch (e) { if (typeof showToast === 'function') showToast('Failed to load users or policies', 'error'); }
    modal.classList.remove('hidden');
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
        if (typeof loadEmployeeLeaveBalance === 'function') loadEmployeeLeaveBalance();
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
