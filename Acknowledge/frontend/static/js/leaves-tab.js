// ============================================
// LEAVES TAB - SHARED ACROSS DASHBOARDS
// ============================================

async function loadLeavesTab() {
    await Promise.all([loadLeaveBalance(), loadMyLeaves()]);
    var sec = document.getElementById('custom-leave-policies-section');
    if (sec && typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'senior') {
        sec.classList.remove('hidden');
        await loadCustomPolicies();
    } else if (sec) sec.classList.add('hidden');
}

async function loadLeaveBalance() {
    var c = document.getElementById('leave-balance-container');
    if (!c) return;
    try {
        var b = await Api.get('/leaves/balance');
        renderLeaveBalance(b);
    } catch(e) { c.innerHTML = '<p class="text-red-500 text-sm">Failed to load balance</p>'; }
}

function renderLeaveBalance(b) {
    var c = document.getElementById('leave-balance-container');
    if (!c) return;
    if (b.is_intern) {
        c.innerHTML = '<div class="bg-blue-50 border border-blue-200 rounded-lg p-4"><p class="text-sm font-medium text-blue-800">As an intern, you are eligible for unpaid leave only.</p><p class="text-xs text-blue-600 mt-1">Apply for unpaid leave below when needed.</p></div>';
        return;
    }
    var h = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5"><h4 class="text-sm font-semibold text-gray-700 mb-3">Earned Leave (EL)</h4>';
    h += '<div class="flex items-baseline gap-2 mb-2"><span class="text-3xl font-bold text-primary">' + b.earned_leave_balance.toFixed(1) + '</span><span class="text-sm text-gray-500">days available</span></div>';
    h += '<div class="text-xs text-gray-500 space-y-1"><p>Accrued: ' + b.earned_leave_accrued.toFixed(1) + ' days</p><p>Used: ' + b.earned_leave_used.toFixed(1) + ' days</p></div>';
    if (!b.can_use_earned_leave) h += '<div class="mt-2 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">On probation - EL accrues but available after confirmation</div>';
    h += '<div class="mt-3 text-[10px] text-gray-400 space-y-0.5"><p>* 1.25 days/month, max 15/year</p><p>* Must apply 7 days in advance</p><p>* Unused EL carries forward (max 45)</p></div></div>';
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5"><h4 class="text-sm font-semibold text-gray-700 mb-3">Casual / Sick Leave</h4>';
    h += '<div class="flex items-baseline gap-2 mb-2"><span class="text-3xl font-bold text-blue-600">' + b.casual_sick_leave_balance.toFixed(1) + '</span><span class="text-sm text-gray-500">days available</span></div>';
    h += '<div class="text-xs text-gray-500 space-y-1"><p>Accrued: ' + b.casual_sick_leave_accrued.toFixed(1) + ' days</p><p>Used: ' + b.casual_sick_leave_used.toFixed(1) + ' days</p></div>';
    h += '<div class="mt-3 text-[10px] text-gray-400 space-y-0.5"><p>* 1 day/month, max 12/year (shared pool)</p><p>* <strong>Casual:</strong> apply at least 15 days in advance</p><p>* <strong>Sick:</strong> can apply anytime</p><p>* Does NOT carry forward</p></div></div>';
    h += '</div>';
    c.innerHTML = h;
}

async function loadMyLeaves() {
    var c = document.getElementById('my-leaves-list');
    if (!c) return;
    try {
        var leaves = await Api.get('/leaves/my-leaves');
        renderMyLeaves(leaves);
    } catch(e) { c.innerHTML = '<p class="text-red-500 text-sm">Failed to load leaves</p>'; }
}

function renderMyLeaves(leaves) {
    var c = document.getElementById('my-leaves-list');
    if (!c) return;
    if (!leaves || leaves.length === 0) { c.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No leave requests yet</p>'; return; }
    var sc = {pending:'bg-yellow-100 text-yellow-800',approved:'bg-green-100 text-green-800',rejected:'bg-red-100 text-red-800',cancelled:'bg-gray-100 text-gray-500'};
    var tc = {earned_leave:'EL',casual_sick_leave:'CSL',casual_leave:'Casual',sick_leave:'Sick',unpaid_leave:'Unpaid'};
    var h = '<table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50"><tr>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">From</th>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">To</th>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Days</th>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>';
    h += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>';
    h += '</tr></thead><tbody class="divide-y divide-gray-100">';
    leaves.forEach(function(l) {
        var col = sc[l.status] || 'bg-gray-100 text-gray-600';
        var type = (l.leave_type === 'custom' && l.custom_policy_title) ? l.custom_policy_title : (tc[l.leave_type] || l.leave_type);
        h += '<tr><td class="px-4 py-2 font-medium">' + type + '</td>';
        h += '<td class="px-4 py-2">' + l.start_date + '</td>';
        h += '<td class="px-4 py-2">' + l.end_date + '</td>';
        h += '<td class="px-4 py-2">' + l.num_days + '</td>';
        h += '<td class="px-4 py-2 max-w-[200px] truncate" title="' + (l.reason||'') + '">' + (l.reason||'-') + '</td>';
        h += '<td class="px-4 py-2"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + col + ' capitalize">' + l.status + '</span></td>';
        h += '<td class="px-4 py-2">';
        if (l.status === 'pending') h += '<button onclick="cancelLeave(' + l.id + ')" class="text-xs text-red-500 hover:text-red-700 font-medium">Cancel</button>';
        if (l.reviewer_notes) h += '<span class="text-xs text-gray-400 ml-1" title="' + l.reviewer_notes + '">Note</span>';
        h += '</td></tr>';
    });
    h += '</tbody></table>';
    c.innerHTML = h;
}

async function cancelLeave(id) {
    if (!confirm('Cancel this leave request?')) return;
    try { await Api.delete('/leaves/' + id); showToast('Leave cancelled', 'success'); loadLeavesTab(); }
    catch(e) { showToast(e.message || 'Failed', 'error'); }
}

async function openApplyLeaveModal() {
    var m = document.getElementById('apply-leave-modal');
    if (!m) return;
    document.getElementById('leave-type-select').value = '';
    document.getElementById('leave-start-date').value = '';
    document.getElementById('leave-end-date').value = '';
    document.getElementById('leave-reason').value = '';
    var isIntern = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'intern';
    var typeSelect = document.getElementById('leave-type-select');
    typeSelect.innerHTML = '<option value="">Select leave type...</option>';
    if (!isIntern) {
        typeSelect.innerHTML += '<option value="casual_sick_leave">Casual/Sick Leave (CSL)</option>';
        typeSelect.innerHTML += '<option value="earned_leave">Earned Leave (EL) — 7 days prior</option>';
        try {
            var customPolicies = await fetchCustomPoliciesForApply();
            if (customPolicies && customPolicies.length) {
                customPolicies.forEach(function(p) {
                    typeSelect.innerHTML += '<option value="custom:' + p.id + '">' + (p.title || 'Custom') + ' — ' + (p.prior_days === 0 ? 'anytime' : p.prior_days + ' days prior') + '</option>';
                });
            }
        } catch(e) { console.warn('Could not load custom policies', e); }
    }
    typeSelect.innerHTML += '<option value="unpaid_leave">Unpaid Leave</option>';
    m.classList.remove('hidden');
}

async function submitLeaveApplication() {
    var typeRaw = document.getElementById('leave-type-select').value;
    var start = document.getElementById('leave-start-date').value;
    var end = document.getElementById('leave-end-date').value;
    var reason = document.getElementById('leave-reason').value.trim();
    if (!typeRaw) { showToast('Select leave type', 'error'); return; }
    if (!start || !end) { showToast('Select dates', 'error'); return; }
    if (!reason) { showToast('Provide a reason', 'error'); return; }
    var type = typeRaw;
    var customPolicyId = null;
    if (typeRaw.indexOf('custom:') === 0) {
        customPolicyId = parseInt(typeRaw.slice(7), 10);
        type = 'custom';
    }
    var body = {leave_type: type, start_date: start, end_date: end, reason: reason};
    if (customPolicyId) body.custom_policy_id = customPolicyId;
    try {
        var res = await Api.post('/leaves/apply', body);
        showToast('Leave applied! (' + res.num_days + ' days)', 'success');
        document.getElementById('apply-leave-modal').classList.add('hidden');
        loadLeavesTab();
    } catch(e) { showToast(e.message || 'Failed to apply', 'error'); }
}

// Fetch custom policies for apply-leave dropdown. Tries /list then /custom-policies on 404.
async function fetchCustomPoliciesForApply() {
    var r = await fetch(Api.getApiUrl() + '/leaves/custom-policies/list?for_apply=true', { method: 'GET', headers: Api.getHeaders() });
    if (r.ok) return await r.json();
    if (r.status === 404) {
        var r2 = await fetch(Api.getApiUrl() + '/leaves/custom-policies?for_apply=true', { method: 'GET', headers: Api.getHeaders() });
        if (r2.ok) return await r2.json();
    }
    return [];
}

// Custom Leave Policies: try GET /list first; if 404, try GET /custom-policies (no /list) for older backends.
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
            renderCustomPolicies(list);
            return;
        }
        if (r.status === 404 || r.status === 405) {
            c.innerHTML = '<p class="text-amber-600 text-sm">Custom policies need the latest backend deployed. On the server: run <code class="text-xs bg-gray-100 px-1 rounded">./Acknowledge/deploy-backend.sh</code> or see <code class="text-xs bg-gray-100 px-1 rounded">Acknowledge/DEPLOY_BACKEND.md</code>. Then <button type="button" onclick="loadCustomPolicies()" class="ml-1 text-amber-700 underline font-medium hover:no-underline">Retry</button>.</p>';
            return;
        }
        var e = await r.json().catch(function() { return {}; });
        var d = typeof e.detail === 'string' ? e.detail : (e.detail && e.detail[0] && e.detail[0].msg) || r.statusText;
        throw new Error(d || 'Failed to load');
    } catch(err) {
        var msg = (err && err.message) ? err.message : 'Failed to load custom leave policies';
        c.innerHTML = '<p class="text-red-500 text-sm">' + msg + '</p>';
    }
}

function renderCustomPolicies(list) {
    var c = document.getElementById('custom-leave-policies-list');
    if (!c) return;
    if (!list || list.length === 0) { c.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No custom policies yet. Create one to allow employees, interns, or managers to apply for this leave type (director will approve).</p>'; return; }
    var h = '<div class="space-y-3">';
    list.forEach(function(p) {
        var roles = Array.isArray(p.allowed_roles) ? p.allowed_roles.join(', ') : (p.allowed_roles || '');
        h += '<div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">';
        h += '<div><p class="font-medium text-gray-900">' + (p.title || 'Untitled') + '</p><p class="text-xs text-gray-500 mt-1">Prior days: ' + (p.prior_days === 0 ? 'Anytime' : p.prior_days) + ' &nbsp;|&nbsp; For: ' + roles + '</p></div>';
        h += '<button type="button" onclick="deleteCustomPolicy(' + p.id + ')" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>';
        h += '</div>';
    });
    h += '</div>';
    c.innerHTML = h;
}

function openCreateCustomPolicyModal() {
    var m = document.getElementById('create-custom-policy-modal');
    if (!m) return;
    document.getElementById('custom-policy-title').value = '';
    document.getElementById('custom-policy-prior-days').value = '0';
    document.getElementById('custom-policy-role-employee').checked = false;
    document.getElementById('custom-policy-role-intern').checked = false;
    document.getElementById('custom-policy-role-manager').checked = false;
    m.classList.remove('hidden');
}

async function submitCreateCustomPolicy() {
    var title = (document.getElementById('custom-policy-title').value || '').trim();
    var priorDays = parseInt(document.getElementById('custom-policy-prior-days').value, 10) || 0;
    var roles = [];
    if (document.getElementById('custom-policy-role-employee').checked) roles.push('employee');
    if (document.getElementById('custom-policy-role-intern').checked) roles.push('intern');
    if (document.getElementById('custom-policy-role-manager').checked) roles.push('manager');
    if (!title) { showToast('Enter a heading/title', 'error'); return; }
    if (roles.length === 0) { showToast('Select at least one role (Employees, Interns, or Managers)', 'error'); return; }
    try {
        await Api.post('/leaves/custom-policies/create', { title: title, prior_days: priorDays, allowed_roles: roles });
        showToast('Custom leave policy created', 'success');
        document.getElementById('create-custom-policy-modal').classList.add('hidden');
        loadCustomPolicies();
    } catch(e) { showToast(e.message || 'Failed to create policy', 'error'); }
}

async function deleteCustomPolicy(id) {
    if (!confirm('Delete this custom leave policy? Existing leave requests under it will keep the policy title.')) return;
    try {
        await Api.delete('/leaves/custom-policies/' + id);
        showToast('Policy deleted', 'success');
        loadCustomPolicies();
    } catch(e) { showToast(e.message || 'Failed to delete', 'error'); }
}

// DIRECTOR: Pending leave approvals
async function loadPendingLeaves() {
    var c = document.getElementById('pending-leaves-list');
    if (!c) return;
    try {
        var leaves = await Api.get('/leaves/pending');
        if (!leaves || leaves.length === 0) { c.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No pending requests</p>'; return; }
        var tc = {earned_leave:'EL',casual_sick_leave:'CSL',casual_leave:'Casual',sick_leave:'Sick',unpaid_leave:'Unpaid'};
        c.innerHTML = leaves.map(function(l) {
            var typeLabel = (l.leave_type === 'custom' && l.custom_policy_title) ? l.custom_policy_title : (tc[l.leave_type]||l.leave_type);
            return '<div class="bg-white border border-gray-200 rounded-lg p-4 mb-3"><div class="flex justify-between items-start mb-2"><div><p class="font-medium text-gray-900">' + l.user_name + '</p><p class="text-xs text-gray-500">' + typeLabel + ' | ' + l.start_date + ' to ' + l.end_date + ' (' + l.num_days + ' days)</p></div><span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Pending</span></div><p class="text-sm text-gray-600 mb-2">' + l.reason + '</p><div class="flex gap-2 mt-3"><button onclick="reviewLeave(' + l.id + ',\'approved\')" class="text-xs bg-green-500 text-white px-3 py-1.5 rounded hover:bg-green-600 font-medium">Approve</button><button onclick="reviewLeave(' + l.id + ',\'rejected\')" class="text-xs bg-red-500 text-white px-3 py-1.5 rounded hover:bg-red-600 font-medium">Deny</button></div></div>';
        }).join('');
    } catch(e) { c.innerHTML = '<p class="text-red-500 text-sm">Failed to load</p>'; }
}

async function reviewLeave(id, status) {
    try { await Api.put('/leaves/' + id + '/review', {status:status}); showToast('Leave ' + status + '!', 'success'); loadPendingLeaves(); }
    catch(e) { showToast(e.message || 'Failed', 'error'); }
}
