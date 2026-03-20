// ============================================
// EMPLOYEE DASHBOARD - FULLY FUNCTIONAL
// ============================================

let currentUser = null;
let allTasks = [];
let allConcerns = [];
let allPolicies = [];
let currentWeekOffset = 0;
let taskAssignmentWatcherInterval = null;
let seenAssignedTaskIds = new Set();
let lastCommentAtByTaskId = {};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'} text-white px-6 py-4 rounded-lg shadow-lg`;
    toast.innerHTML = `
        <div class="flex items-center">
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">×</button>
        </div>
    `;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function _seenTasksStorageKey() {
    return currentUser && currentUser.id ? `seen_assigned_task_ids_${currentUser.id}` : 'seen_assigned_task_ids';
}

function _loadSeenAssignedTaskIds() {
    try {
        const raw = localStorage.getItem(_seenTasksStorageKey());
        const arr = raw ? JSON.parse(raw) : [];
        seenAssignedTaskIds = new Set(Array.isArray(arr) ? arr : []);
    } catch {
        seenAssignedTaskIds = new Set();
    }
}

function _saveSeenAssignedTaskIds() {
    try {
        const arr = Array.from(seenAssignedTaskIds).slice(-300);
        localStorage.setItem(_seenTasksStorageKey(), JSON.stringify(arr));
    } catch {
        // ignore storage failures
    }
}

async function _checkForNewAssignedTasks() {
    if (!currentUser || !currentUser.id) return;
    try {
        const tasks = await Api.get('/tasks/');
        const assignedToMe = (tasks || []).filter(t => t && t.assigned_to_id === currentUser.id);
        assignedToMe.forEach(t => {
            if (!seenAssignedTaskIds.has(t.id)) {
                seenAssignedTaskIds.add(t.id);
                showToast(`New task assigned: ${t.title || 'Task'}`, 'info');
            }
        });
        _saveSeenAssignedTaskIds();
    } catch {
        // silent - don't spam toasts on transient network issues
    }
}

function startTaskAssignmentWatcher() {
    if (taskAssignmentWatcherInterval) return;
    _loadSeenAssignedTaskIds();
    // Seed with current tasks to avoid popping on first load
    (allTasks || []).forEach(t => {
        if (t && t.assigned_to_id === currentUser?.id) {
            seenAssignedTaskIds.add(t.id);
        }
    });
    _saveSeenAssignedTaskIds();
    taskAssignmentWatcherInterval = setInterval(_checkForNewAssignedTasks, 15000);
}

function showLoading(elementId) {
    const element = document.getElementById(elementId);
    element.innerHTML = '<div class="text-center py-8"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>';
}

function showEmptyState(elementId, message) {
    const element = document.getElementById(elementId);
    element.innerHTML = `<div class="text-center py-12 text-gray-500">${message}</div>`;
}

// ============================================
// STEP 1 - AUTH SESSION VALIDATION
// ============================================

async function validateAuth() {
    const token = localStorage.getItem('access_token');

    if (!token) {
        window.location.href = 'login.html';
        return false;
    }

    try {
        currentUser = await Api.getProfile();

        // Verify role is intern
        if (currentUser.role !== 'intern') {
            showToast('Access denied. Intern role required.', 'error');
            setTimeout(() => {
                Api.logout();
            }, 2000);
            return false;
        }

        // Update UI with user info
        updateUserDisplay();
        setupEditName();

        return true;
    } catch (error) {
        console.error('Auth validation failed:', error);
        showToast('Session expired. Please login again.', 'error');
        setTimeout(() => window.location.href = 'login.html', 2000);
        return false;
    }
}

function updateUserDisplay() {
    if (!currentUser) return;
    const el = document.getElementById('user-name');
    const av = document.getElementById('user-avatar');
    const roleEl = document.getElementById('user-role');
    if (el) el.innerText = currentUser.full_name;
    if (av) av.innerText = (currentUser.full_name || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '--';
    if (roleEl) roleEl.innerText = 'Intern';
    localStorage.setItem('user_name', currentUser.full_name || '');
}

function setupEditName() {
    const btn = document.getElementById('edit-name-btn');
    const modal = document.getElementById('edit-name-modal');
    const input = document.getElementById('edit-name-input');
    const saveBtn = document.getElementById('edit-name-save');
    const cancelBtn = document.getElementById('edit-name-cancel');
    const backdrop = document.getElementById('edit-name-backdrop');
    if (!btn || !modal || !input) return;
    function closeModal() { modal.classList.add('hidden'); }
    btn.addEventListener('click', () => {
        input.value = currentUser ? (currentUser.full_name || '') : '';
        modal.classList.remove('hidden');
        input.focus();
    });
    cancelBtn && cancelBtn.addEventListener('click', closeModal);
    backdrop && backdrop.addEventListener('click', closeModal);
    saveBtn && saveBtn.addEventListener('click', async () => {
        const name = (input.value || '').trim();
        if (!name) { showToast('Name cannot be empty', 'error'); return; }
        try {
            const updated = await Api.updateProfile({ full_name: name });
            currentUser.full_name = updated.full_name;
            localStorage.setItem('user_name', updated.full_name);
            updateUserDisplay();
            closeModal();
            showToast('Name updated. It will appear everywhere you\'re shown.', 'success');
        } catch (e) {
            showToast(e.message || 'Failed to update name', 'error');
        }
    });
}

// ============================================
// STEP 2 & 3 - MY TASKS TAB & DASHBOARD SUMMARY
// ============================================

async function loadTasks() {
    showLoading('tasks-tbody');

    try {
        allTasks = await Api.get('/tasks/');
        try {
            const summaries = await Api.get('/tasks/comments/summary');
            lastCommentAtByTaskId = {};
            (summaries || []).forEach(s => {
                if (s && s.task_id && s.last_comment_at) lastCommentAtByTaskId[s.task_id] = s.last_comment_at;
            });
        } catch {
            lastCommentAtByTaskId = {};
        }
        renderTasks(allTasks);
        updateDashboardStats();
    } catch (error) {
        console.error('Failed to load tasks:', error);
        showEmptyState('tasks-tbody', 'Failed to load tasks');
        showToast('Failed to load tasks', 'error');
    }
}

function renderTasks(tasks) {
    const tbody = document.getElementById('tasks-tbody');

    if (tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No tasks assigned</td></tr>';
        return;
    }

    const priorityColors = {
        'high': 'text-red-800 bg-red-100',
        'medium': 'text-yellow-800 bg-yellow-100',
        'low': 'text-green-800 bg-green-100'
    };

    const statusColors = {
        'pending': 'bg-gray-100 text-gray-800',
        'in_progress': 'bg-blue-100 text-blue-800',
        'completed': 'bg-green-100 text-green-800',
        'review': 'bg-purple-100 text-purple-800'
    };

    tbody.innerHTML = tasks.map(task => {
        const managerName = task.created_by ? task.created_by.full_name : 'Manager';
        const lastCommentAt = lastCommentAtByTaskId ? lastCommentAtByTaskId[task.id] : null;
        const seenKey = currentUser && currentUser.id ? `task_comments_seen_${currentUser.id}_${task.id}` : `task_comments_seen_${task.id}`;
        const lastSeen = localStorage.getItem(seenKey);
        const hasUnseen = !!(lastCommentAt && (!lastSeen || new Date(lastCommentAt).getTime() > new Date(lastSeen).getTime()));

        return `
        <tr class="hover:bg-primary-light/30 transition-colors">
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${task.title}</div>
                <div class="text-xs text-gray-500">${task.description || ''}</div>
                <div class="text-xs text-primary mt-1">
                    <span class="font-medium">Assigned by:</span> ${managerName}
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${task.deadline ? new Date(task.deadline).toLocaleDateString() : '-'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[task.status] || 'bg-gray-100'} capitalize">
                    ${task.status.replace('_', ' ')}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${priorityColors[task.priority] || 'text-gray-500'} capitalize">
                    ${task.priority}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                ${!task.acknowledged_at ?
                `<button type="button" onclick="acknowledgeTask(${task.id})" class="text-primary hover:text-primary-hover font-medium">Acknowledge</button>` :
                `<span class="text-xs text-green-600 font-medium">✓ Acknowledged</span>`
            }
                <button onclick="openUpdateTaskModal(${task.id}, '${task.status}')" 
                    class="text-primary hover:text-primary-hover font-medium"
                    ${task.status === 'completed' ? 'disabled' : ''}>
                    Update
                </button>
                <button type="button" class="task-comment-btn text-gray-600 hover:text-primary font-medium inline-flex items-center gap-1" data-task-id="${task.id}" data-task-title="${(task.title || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
                    Comment
                    ${hasUnseen ? '<span class="inline-block w-2 h-2 rounded-full bg-red-500" aria-label="Unseen comments"></span>' : ''}
                </button>
            </td>
        </tr>
    `}).join('');
}

function openTaskCommentsModal(taskId, taskTitle) {
    document.getElementById('task-comments-task-id').value = taskId;
    document.getElementById('task-comments-title').textContent = 'Comments: ' + (taskTitle || 'Task');
    document.getElementById('task-comments-input').value = '';
    document.getElementById('task-comments-modal').classList.add('active');
    loadTaskComments(taskId);
}

async function loadTaskComments(taskId) {
    const listEl = document.getElementById('task-comments-list');
    listEl.innerHTML = '<span class="text-gray-400">Loading...</span>';
    try {
        const comments = await Api.get('/tasks/' + taskId + '/comments');
        if (!comments || comments.length === 0) {
            listEl.innerHTML = '<p class="text-gray-400 text-sm">No comments yet. Add one below.</p>';
            return;
        }
        let maxTs = 0;
        listEl.innerHTML = comments.map(c => {
            const name = c.user ? c.user.full_name : 'Someone';
            const date = c.created_at ? new Date(c.created_at).toLocaleString() : '';
            if (c.created_at) {
                const t = new Date(c.created_at).getTime();
                if (t > maxTs) maxTs = t;
            }
            const body = (c.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            return `<div class="border-l-2 border-primary/30 pl-3 py-1"><span class="font-medium text-gray-900">${name}</span> <span class="text-xs text-gray-400">${date}</span><p class="text-gray-700 mt-0.5">${body}</p></div>`;
        }).join('');
        const seenKey = currentUser && currentUser.id ? `task_comments_seen_${currentUser.id}_${taskId}` : `task_comments_seen_${taskId}`;
        const mark = maxTs ? new Date(maxTs).toISOString() : new Date().toISOString();
        localStorage.setItem(seenKey, mark);
        await loadTasks();
    } catch (e) {
        const msg = (e && e.message) ? String(e.message) : 'Failed to load comments.';
        listEl.innerHTML = '<p class="text-red-500 text-sm">' + msg.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    }
}

async function postTaskComment() {
    const taskId = document.getElementById('task-comments-task-id').value;
    const input = document.getElementById('task-comments-input');
    const body = (input.value || '').trim();
    if (!body) { showToast('Enter a comment', 'error'); return; }
    const btn = document.getElementById('task-comments-post');
    btn.disabled = true;
    btn.textContent = 'Posting...';
    try {
        await Api.post('/tasks/' + taskId + '/comments', { body });
        input.value = '';
        await loadTaskComments(taskId);
        showToast('Comment posted', 'success');
    } catch (e) {
        showToast(e.message || 'Failed to post comment', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Post';
    }
}

async function acknowledgeTask(taskId) {
    try {
        await Api.patch(`/tasks/${taskId}/acknowledge`);
        showToast('Task acknowledged', 'success');
        await loadTasks();
    } catch (e) {
        showToast(e.message || 'Failed to acknowledge task', 'error');
    }
}

function openUpdateTaskModal(taskId, currentStatus) {
    document.getElementById('modal-task-id').value = taskId;
    document.getElementById('modal-task-status').value = currentStatus;
    document.getElementById('update-task-modal').classList.add('active');
}

async function updateTaskStatus() {
    const taskId = document.getElementById('modal-task-id').value;
    const newStatus = document.getElementById('modal-task-status').value;
    const btn = document.getElementById('confirm-update-task');

    btn.disabled = true;
    btn.innerText = 'Updating...';

    try {
        await Api.put(`/tasks/${taskId}`, { status: newStatus });
        showToast('Task updated successfully!', 'success');
        document.getElementById('update-task-modal').classList.remove('active');
        await loadTasks(); // Refresh tasks
    } catch (error) {
        console.error('Failed to update task:', error);
        showToast('Failed to update task', 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Update';
    }
}

async function updateDashboardStats() {
    try {
        const stats = await Api.get('/dashboard/stats');
        document.getElementById('stat-open-tasks').innerText = stats.open_tasks || 0;
        document.getElementById('stat-completed-tasks').innerText = stats.completed_tasks || 0;

        // Count pending policies (for badge; stat box removed from intern UI)
        const pendingPolicies = allPolicies.filter(p => !p.is_acknowledged_by_me).length;
        const statEl = document.getElementById('stat-pending-policies');
        if (statEl) statEl.innerText = pendingPolicies;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// ============================================
// STEP 4 - NUDGES TAB
// ============================================

async function loadConcerns() {
    showLoading('concerns-list');

    try {
        allConcerns = await Api.get('/concerns/');
        renderConcerns(allConcerns);
        updateConcernsBadge();
    } catch (error) {
        console.error('Failed to load nudges:', error);
        showEmptyState('concerns-list', 'Failed to load nudges');
        showToast('Failed to load nudges', 'error');
    }
}

function renderConcerns(concerns) {
    const container = document.getElementById('concerns-list');
    const filter = document.getElementById('nudge-filter')?.value || 'newest';

    const sortedConcerns = [...concerns].sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return filter === 'newest' ? dateB - dateA : dateA - dateB;
    });

    if (sortedConcerns.length === 0) {
        container.innerHTML = '<div class="text-center py-12 text-gray-500">No nudges created yet</div>';
        return;
    }

    container.innerHTML = sortedConcerns.map(concern => {
        const notifiedUsers = concern.notified_users || [];
        const acknowledgedUsers = concern.acknowledged_by || [];
        const notifiedCount = notifiedUsers.length;
        const acknowledgedCount = acknowledgedUsers.length;
        const needsAck = notifiedUsers.some(u => u.id === currentUser.id) && !acknowledgedUsers.some(u => u.id === currentUser.id);

        return `
        <div class="bg-white border ${concern.status === 'open' ? 'border-red-200 bg-red-50' : 'border-gray-200'} rounded-xl p-6">
            <div class="flex justify-between items-start mb-3">
                <h3 class="font-semibold text-gray-900">${concern.subject}</h3>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${concern.status === 'open' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                    ${concern.status === 'open' ? 'Open' : 'Resolved'}
                </span>
            </div>
            <p class="text-sm text-gray-600 mb-3">${concern.description}</p>
            ${notifiedCount > 0 ? `
                <div class="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <p class="text-xs font-medium text-blue-800 mb-2">Notified: ${notifiedCount} people</p>
                    <div class="flex flex-wrap gap-2">
                        ${notifiedUsers.map(user => {
            const isAck = acknowledgedUsers.some(u => u.id === user.id);
            return `<span class="inline-flex items-center px-2 py-1 rounded text-xs ${isAck ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">${user.full_name} ${isAck ? '✓' : ''}</span>`;
        }).join('')}
                    </div>
                    <p class="text-xs text-gray-600 mt-2">${acknowledgedCount} of ${notifiedCount} acknowledged</p>
                </div>
            ` : ''}
            <div class="flex justify-between items-center text-xs text-gray-500">
                <span>Raised on ${new Date(concern.created_at).toLocaleDateString()}</span>
                ${concern.resolved_at ? `<span class="text-green-600">Resolved on ${new Date(concern.resolved_at).toLocaleDateString()}</span>` : ''}
            </div>
            ${needsAck ? `<div class="mt-3"><button onclick="acknowledgeConcern(${concern.id})" class="text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover">Acknowledge</button></div>` : ''}
        </div>
    `}).join('');
}

async function openRaiseConcernModal(preSelectUserId) {
    document.getElementById('concern-subject').value = '';
    document.getElementById('concern-description').value = '';
    await loadAllUsersForConcern();
    if (preSelectUserId) {
        const cb = document.querySelector('.notify-user-checkbox[value="' + preSelectUserId + '"]');
        if (cb) cb.checked = true;
    }
    document.getElementById('raise-concern-modal').classList.add('active');
}
window.openRaiseConcernForUser = function (userId) { openRaiseConcernModal(userId); };

async function loadAllUsersForConcern() {
    try {
        const users = await Api.get('/auth/all-users');
        const container = document.getElementById('notify-users-list');
        const employees = users.filter(u => u.role === 'employee');
        const managers = users.filter(u => u.role === 'manager');
        const seniors = users.filter(u => u.role === 'senior');
        const interns = users.filter(u => u.role === 'intern');
        let html = '';
        if (managers.length > 0) {
            html += '<div class="mb-3"><p class="text-xs font-semibold text-gray-700 mb-2">Managers</p>';
            managers.forEach(u => html += `<label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"><input type="checkbox" class="notify-user-checkbox" value="${u.id}"><span class="text-sm">${u.full_name}</span></label>`);
            html += '</div>';
        }
        if (seniors.length > 0) {
            html += '<div class="mb-3"><p class="text-xs font-semibold text-gray-700 mb-2">Senior Officers</p>';
            seniors.forEach(u => html += `<label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"><input type="checkbox" class="notify-user-checkbox" value="${u.id}"><span class="text-sm">${u.full_name}</span></label>`);
            html += '</div>';
        }
        if (employees.length > 0) {
            html += '<div class="mb-3"><p class="text-xs font-semibold text-gray-700 mb-2">Employees</p>';
            employees.forEach(u => html += `<label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"><input type="checkbox" class="notify-user-checkbox" value="${u.id}"><span class="text-sm">${u.full_name}</span></label>`);
            html += '</div>';
        }
        if (interns.length > 0) {
            html += '<div class="mb-3"><p class="text-xs font-semibold text-gray-700 mb-2">Interns</p>';
            interns.forEach(u => html += `<label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"><input type="checkbox" class="notify-user-checkbox" value="${u.id}"><span class="text-sm">${u.full_name}</span></label>`);
            html += '</div>';
        }
        container.innerHTML = html;
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

async function submitConcern() {
    const subject = document.getElementById('concern-subject').value.trim();
    const description = document.getElementById('concern-description').value.trim();
    const checkboxes = document.querySelectorAll('.notify-user-checkbox:checked');
    const notifiedUserIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    const btn = document.getElementById('confirm-raise-concern');

    if (!subject || !description) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    if (notifiedUserIds.length === 0) {
        showToast('Please select at least one person to notify', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Submitting...';

    try {
        console.log('Submitting nudge with data:', { subject, description, notified_user_ids: notifiedUserIds });
        const result = await Api.post('/concerns/', { subject, description, notified_user_ids: notifiedUserIds });
        console.log('Nudge created:', result);
        showToast('Nudge created successfully!', 'success');
        document.getElementById('raise-concern-modal').classList.remove('active');
        await loadConcerns();
    } catch (error) {
        console.error('Failed to create nudge:', error);
        const errorMsg = error.message || error.toString();
        showToast(`Failed to create nudge: ${errorMsg}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Submit';
    }
}

async function acknowledgeConcern(concernId) {
    try {
        await Api.post(`/concerns/${concernId}/acknowledge`, {});
        showToast('Nudge acknowledged!', 'success');
        await loadConcerns();
    } catch (error) {
        console.error('Failed to acknowledge:', error);
        showToast('Failed to acknowledge nudge', 'error');
    }
}

function updateConcernsBadge() {
    const openConcerns = allConcerns.filter(c => c.status === 'open').length;
    const badge = document.getElementById('concerns-badge');

    if (openConcerns > 0) {
        badge.innerText = openConcerns;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ============================================
// STEP 5 - POLICIES TAB
// ============================================

async function loadPolicies() {
    showLoading('policies-list');

    try {
        const policies = await Api.get('/policies/');

        // Check which policies current user has acknowledged
        allPolicies = policies.map(policy => {
            const isAcknowledged = policy.acknowledged_by &&
                policy.acknowledged_by.some(user => user.id === currentUser.id);
            return { ...policy, is_acknowledged_by_me: isAcknowledged };
        });

        renderPolicies(allPolicies);
        updatePoliciesBadge();
        updateDashboardStats();
    } catch (error) {
        console.error('Failed to load policies:', error);
        showEmptyState('policies-list', 'Failed to load policies');
        showToast('Failed to load policies', 'error');
    }
}

function renderPolicies(policies) {
    const container = document.getElementById('policies-list');

    if (policies.length === 0) {
        container.innerHTML = '<div class="col-span-2 text-center py-12 text-gray-500">No policies available</div>';
        return;
    }

    container.innerHTML = policies.map(policy => {
        const hasImage = policy.image_url;
        const imgSrc = hasImage ? (policy.image_url.startsWith('/') ? '/api' + policy.image_url : policy.image_url) : null;

        return `
            <div class="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 group">
                ${hasImage ? `
                    <div class="h-40 w-full overflow-hidden border-b border-gray-100">
                        <img src="${imgSrc}" alt="${policy.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                    </div>
                ` : `
                    <div class="h-40 w-full bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center border-b border-gray-100">
                        <svg class="w-12 h-12 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                    </div>
                `}
                <div class="p-6">
                    <div class="flex justify-between items-start mb-3">
                        <h3 class="font-bold text-gray-900 group-hover:text-primary transition-colors">${policy.title}</h3>
                        ${policy.is_acknowledged_by_me ?
                '<span class="bg-green-50 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-100 uppercase">Acknowledged</span>' :
                '<span class="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-100 uppercase">Pending</span>'
            }
                    </div>
                    <p class="text-sm text-gray-600 mb-6 line-clamp-3 leading-relaxed">${policy.content.substring(0, 120)}...</p>
                    <div class="flex justify-between items-center pt-4 border-t border-gray-50 mt-auto">
                        <span class="text-[11px] font-medium text-gray-400 capitalize">
                             ${new Date(policy.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <button onclick="openPolicyModal(${policy.id})" class="text-primary hover:text-primary-hover text-sm font-bold flex items-center transition-all group-hover:translate-x-1">
                            Read Policy <span class="ml-1">→</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openPolicyModal(policyId) {
    const policy = allPolicies.find(p => p.id === policyId);
    if (!policy) return;

    document.getElementById('policy-modal-id').value = policyId;
    document.getElementById('policy-modal-title').innerText = policy.title;

    // Set content with formatting
    const contentEl = document.getElementById('policy-modal-content');
    if (typeof formatPopupContent === 'function') {
        contentEl.innerHTML = formatPopupContent(policy.content);
    } else {
        contentEl.innerHTML = `<p style="white-space: pre-wrap">${policy.content}</p>`;
    }

    // Set image
    const imageContainer = document.getElementById('policy-modal-image-container');
    if (policy.image_url) {
        const imgSrc = policy.image_url.startsWith('/') ? '/api' + policy.image_url : policy.image_url;
        imageContainer.innerHTML = `<img src="${imgSrc}" class="w-full h-64 object-cover rounded-xl shadow-md">`;
        imageContainer.classList.remove('hidden');
    } else {
        imageContainer.innerHTML = '';
        imageContainer.classList.add('hidden');
    }

    const ackBtn = document.getElementById('acknowledge-policy-btn');
    if (policy.is_acknowledged_by_me) {
        ackBtn.disabled = true;
        ackBtn.innerText = 'Already Acknowledged';
        ackBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        ackBtn.disabled = false;
        ackBtn.innerText = 'Acknowledge';
        ackBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    document.getElementById('view-policy-modal').classList.add('active');
}

async function acknowledgePolicy() {
    const policyId = document.getElementById('policy-modal-id').value;
    const btn = document.getElementById('acknowledge-policy-btn');

    btn.disabled = true;
    btn.innerText = 'Acknowledging...';

    try {
        await Api.post(`/policies/${policyId}/acknowledge`, {});
        showToast('Policy acknowledged successfully!', 'success');
        document.getElementById('view-policy-modal').classList.remove('active');
        await loadPolicies(); // Refresh policies
    } catch (error) {
        console.error('Failed to acknowledge policy:', error);
        showToast('Failed to acknowledge policy', 'error');
        btn.disabled = false;
        btn.innerText = 'Acknowledge';
    }
}

function updatePoliciesBadge() {
    const pendingPolicies = allPolicies.filter(p => !p.is_acknowledged_by_me).length;
    const badge = document.getElementById('policies-badge');

    if (pendingPolicies > 0) {
        badge.innerText = pendingPolicies;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ============================================
// STEP 6 - TAB NAVIGATION
// ============================================

function switchTab(tabName) {
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active', 'bg-primary-light', 'text-primary');
        link.classList.add('text-gray-600');
    });

    const activeLink = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeLink) {
        activeLink.classList.add('active', 'bg-primary-light', 'text-primary');
        activeLink.classList.remove('text-gray-600');
    }

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Load data for the tab
    if (tabName === 'tasks') {
        loadTasks();
    } else if (tabName === 'concerns') {
        loadConcerns();
    } else if (tabName === 'policies') {
        loadPolicies();
    } else if (tabName === 'schedule') {
        renderCalendar();
    } else if (tabName === 'projects') {
        if (typeof loadKanbanDashboard === 'function') loadKanbanDashboard('projects-kanban-container');
        else loadMyProjects();
    } else if (tabName === 'attendance') {
        loadAttendanceTab();
    } else if (tabName === 'leaves') {
        loadLeavesTab();
    }
}

// ============================================
// MY PROJECTS (ventures user is a member of)
// ============================================

async function loadMyProjects() {
    const container = document.getElementById('my-projects-list');
    if (!container) return;
    try {
        const ventures = await Api.get('/ventures/my-ventures');
        renderMyProjects(ventures);
    } catch (e) {
        console.error('Failed to load my projects:', e);
        container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">Unable to load projects. Try again later.</div>';
    }
}

function renderMyProjects(ventures) {
    const container = document.getElementById('my-projects-list');
    if (!container) return;
    if (!ventures || ventures.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-500">
                <svg class="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                <p class="text-lg font-medium">No projects yet</p>
                <p class="text-sm">When a manager or senior adds you to a project, it will appear here.</p>
            </div>`;
        return;
    }
    container.innerHTML = ventures.map(v => {
        const creatorName = v.creator ? (v.creator.full_name || v.creator.email || 'Unknown') : 'Unknown';
        const members = v.members || [];
        const memberNames = members.map(m => m.full_name || m.email || 'Unknown').filter(Boolean);
        const memberList = memberNames.length ? memberNames.join(', ') : 'No other members';
        const desc = (v.description || '').trim() || 'No description';
        return `
            <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                        </svg>
                    </div>
                </div>
                <h3 class="font-semibold text-gray-900 mb-1">${escapeHtml(v.name)}</h3>
                <p class="text-sm text-gray-500 line-clamp-2 mb-3">${escapeHtml(desc)}</p>
                <div class="text-xs text-gray-500 space-y-1 pt-3 border-t border-gray-100">
                    <p><span class="font-medium text-gray-600">Created by:</span> ${escapeHtml(creatorName)}</p>
                    <p><span class="font-medium text-gray-600">Members:</span> ${escapeHtml(memberList)}</p>
                </div>
            </div>`;
    }).join('');
}

// ============================================
// STEP 8 - LOGOUT FUNCTIONALITY
// ============================================

function handleLogout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_role');

    // Prevent back button
    window.history.pushState(null, '', window.location.href);
    window.onpopstate = function () {
        window.history.pushState(null, '', window.location.href);
    };

    window.location.href = 'login.html';
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Validate auth first
    const isAuthenticated = await validateAuth();
    if (!isAuthenticated) return;

    // Load initial data
    await loadTasks();
    await loadNotifications();
    startTaskAssignmentWatcher();
    initAttendanceClock();

    // Setup tab navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = link.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    // Setup modal handlers
    document.getElementById('cancel-update-task').addEventListener('click', () => {
        document.getElementById('update-task-modal').classList.remove('active');
    });

    document.getElementById('confirm-update-task').addEventListener('click', updateTaskStatus);

    document.getElementById('task-comments-close').addEventListener('click', () => {
        document.getElementById('task-comments-modal').classList.remove('active');
    });
    document.getElementById('task-comments-post').addEventListener('click', postTaskComment);

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.task-comment-btn');
        if (!btn) return;
        const taskId = btn.getAttribute('data-task-id');
        const taskTitle = (btn.getAttribute('data-task-title') || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        openTaskCommentsModal(taskId, taskTitle);
    });

    document.getElementById('btn-raise-concern').addEventListener('click', openRaiseConcernModal);

    document.getElementById('cancel-raise-concern').addEventListener('click', () => {
        document.getElementById('raise-concern-modal').classList.remove('active');
    });

    document.getElementById('confirm-raise-concern').addEventListener('click', submitConcern);

    document.getElementById('close-policy-modal').addEventListener('click', () => {
        document.getElementById('view-policy-modal').classList.remove('active');
    });

    document.getElementById('acknowledge-policy-btn').addEventListener('click', acknowledgePolicy);

    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Calendar Navigation
    initCalendar();

    // Notification tray handlers
    document.getElementById('notifTrayBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('notifDropdown').classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        document.getElementById('notifDropdown').classList.add('hidden');
    });

    document.getElementById('notifDropdown').addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Nudge Filter Handler
    document.getElementById('nudge-filter')?.addEventListener('change', () => {
        renderConcerns(allConcerns);
    });

    // Close modals on background click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
});

// ============================================
// STEP 9 - ERROR HANDLING (Global)
// ============================================

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);

    if (event.reason && event.reason.message) {
        if (event.reason.message.includes('401') || event.reason.message.includes('Unauthorized')) {
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = 'login.html', 2000);
        } else if (event.reason.message.includes('403') || event.reason.message.includes('Forbidden')) {
            showToast('Access denied', 'error');
        } else if (event.reason.message.includes('500')) {
            showToast('Server error. Please try again later.', 'error');
        }
    }
});

// ============================================
// NOTIFICATION SYSTEM
// ============================================

async function loadNotifications() {
    try {
        const notifications = await Api.get('/notifications/');
        renderNotifications(notifications);
    } catch (e) {
        console.error('Failed to load notifications:', e);
    }
}

function renderNotifications(notifications) {
    const container = document.getElementById('notifItems');
    const badge = document.getElementById('notifBadge');

    const unacknowledged = notifications.filter(n => !n.is_acknowledged);

    if (unacknowledged.length > 0) {
        badge.innerText = unacknowledged.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    if (notifications.length === 0) {
        container.innerHTML = '<div class="p-4 text-center text-gray-500 text-sm">No notifications</div>';
        return;
    }

    container.innerHTML = notifications.map(notif => {
        const date = new Date(notif.created_at).toLocaleString();
        return `
            <div class="p-4 ${notif.is_acknowledged ? 'bg-white opacity-70' : 'bg-blue-50'} hover:bg-gray-50 transition-colors">
                <div class="flex justify-between items-start mb-1">
                    <h4 class="text-sm font-bold text-gray-900">${notif.title}</h4>
                    <span class="text-[10px] text-gray-400 font-medium">${date}</span>
                </div>
                <p class="text-xs text-gray-600 mb-2">${notif.content}</p>
                <div class="flex justify-between items-center text-[10px]">
                    <span class="text-gray-400">By: ${notif.created_by ? notif.created_by.full_name : 'Admin'}</span>
                    ${notif.is_acknowledged ?
                '<span class="text-green-600 font-bold flex items-center">✓ Acknowledged</span>' :
                `<button onclick="acknowledgeNotification(${notif.id})" class="text-white bg-primary px-3 py-1 rounded font-bold hover:bg-primary-hover shadow-sm">Acknowledge</button>`
            }
                </div>
            </div>
        `;
    }).join('');
}

async function acknowledgeNotification(id) {
    try {
        await Api.post(`/notifications/${id}/acknowledge`);
        showToast("Notification acknowledged", "success");
        await loadNotifications();
    } catch (e) {
        console.error(e);
        showToast("Failed to acknowledge", "error");
    }
}

// ============================================
// CALENDAR SYSTEM
// ============================================

let currentCalendarDate = new Date();
let _calendarHolidays = {};

async function _fetchCalendarHolidays(year) {
    const office = (currentUser && currentUser.office) ? currentUser.office : null;
    let url = '/holidays/?year=' + year;
    if (office) url += '&office=' + office;
    try {
        const list = await Api.get(url);
        _calendarHolidays = {};
        (list || []).forEach(h => { _calendarHolidays[h.date] = h.title; });
    } catch (e) { console.warn('Failed to load holidays for calendar', e); }
}

async function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthYearLabel = document.getElementById('calendar-month-year');
    if (!grid || !monthYearLabel) return;

    grid.innerHTML = '';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    await _fetchCalendarHolidays(year);

    monthYearLabel.innerText = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentCalendarDate);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'min-h-[100px] bg-gray-50/50 border-b border-r border-gray-100';
        grid.appendChild(placeholder);
    }

    const priorityColors = {
        'high': 'bg-red-50 text-red-700 border-red-100',
        'medium': 'bg-yellow-50 text-yellow-700 border-yellow-100',
        'low': 'bg-blue-50 text-blue-700 border-blue-100'
    };

    window._calendarDayData = window._calendarDayData || {};

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const holidayName = _calendarHolidays[dateStr] || null;
        const dayTasks = allTasks.filter(t => t.deadline && t.deadline.startsWith(dateStr));

        window._calendarDayData[dateStr] = {
            holiday: holidayName,
            leaves: [],
            tasks: dayTasks.map(t => ({ title: t.title, priority: t.priority || 'medium' }))
        };

        const dayDiv = document.createElement('div');
        dayDiv.className = 'min-h-[100px] border-b border-r border-gray-100 p-2 transition-colors cursor-pointer '
            + (holidayName ? 'bg-purple-50 hover:bg-purple-100' : 'bg-white hover:bg-gray-50');
        dayDiv.onclick = () => openCalendarDayModal(dateStr);

        let holidayHtml = holidayName
            ? `<div class="mb-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200 truncate" title="${escapeHtmlAttr(holidayName)}">${escapeHtmlAttr(holidayName)}</div>`
            : '';

        let tasksHtml = dayTasks.map(t => `
            <div class="mb-1 px-1.5 py-0.5 rounded text-[10px] font-medium border truncate ${priorityColors[t.priority] || 'bg-gray-100'}" title="${escapeHtmlAttr(t.title)}">
                ${escapeHtmlAttr(t.title)}
            </div>
        `).join('');

        dayDiv.innerHTML = `
            <div class="text-right text-gray-400 text-xs mb-1">${day}</div>
            <div class="space-y-1">${holidayHtml}${tasksHtml}</div>
        `;
        grid.appendChild(dayDiv);
    }
}

if (typeof window.openCalendarDayModal !== 'function') {
    window.openCalendarDayModal = function (dateString) {
        let m = document.getElementById('calendar-day-modal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'calendar-day-modal';
            m.className = 'fixed inset-0 z-[110] overflow-y-auto hidden';
            m.innerHTML = `
                <div class="flex min-h-full items-center justify-center p-4">
                    <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onclick="document.getElementById('calendar-day-modal').classList.add('hidden')"></div>
                    <div class="relative bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-8 animate-fade-in border border-gray-100/50">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-xl font-bold text-gray-900 tracking-tight" id="cdm-title"></h3>
                            <button onclick="document.getElementById('calendar-day-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full p-2 transition-colors">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div id="cdm-content" class="space-y-3 max-h-[60vh] overflow-y-auto pr-2"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(m);
        }
        const data = window._calendarDayData[dateString] || {};

        // Parse date safely
        const [y, mStr, dStr] = dateString.split('-');
        const dateObj = new Date(parseInt(y), parseInt(mStr) - 1, parseInt(dStr));
        document.getElementById('cdm-title').innerText = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        let html = '';

        if (data.holiday) {
            html += `<div class="p-3 bg-purple-50 border border-purple-100 rounded-xl"><span class="text-xs font-semibold text-purple-600 uppercase tracking-widest block mb-1">Holiday</span><p class="text-sm font-medium text-purple-900">${(data.holiday || '').replace(/</g, '&lt;')}</p></div>`;
        }

        if (data.leaves && data.leaves.length) {
            data.leaves.forEach(l => {
                const label = l.user_name ? `${l.user_name} - ${l.custom_policy_title || l.leave_type}` : `Leave: ${l.custom_policy_title || l.leave_type}`;
                html += `<div class="p-3 bg-teal-50 border border-teal-100 rounded-xl"><span class="text-xs font-semibold text-teal-600 uppercase tracking-widest block mb-1">Leave</span><p class="text-sm font-medium text-teal-900">${(label || '').replace(/</g, '&lt;')}</p></div>`;
            });
        }

        if (data.tasks && data.tasks.length) {
            const priorityColors = {
                'high': 'bg-red-50 border-red-100 text-red-900',
                'medium': 'bg-yellow-50 border-yellow-100 text-yellow-900',
                'low': 'bg-blue-50 border-blue-100 text-blue-900'
            };
            const labelColors = {
                'high': 'text-red-600',
                'medium': 'text-yellow-600',
                'low': 'text-blue-600'
            };
            data.tasks.forEach(t => {
                const bg = priorityColors[t.priority] || 'bg-gray-50 border-gray-100 text-gray-900';
                const lc = labelColors[t.priority] || 'text-gray-600';
                html += `<div class="p-3 border rounded-xl ${bg}"><span class="text-xs font-semibold ${lc} uppercase tracking-widest block mb-1">Task (${t.priority})</span><p class="text-sm font-medium">${(t.title || '').replace(/</g, '&lt;')}</p></div>`;
            });
        }

        if (!html) {
            html = `<p class="text-sm text-gray-500 text-center py-6 bg-gray-50 rounded-xl border border-gray-100 border-dashed">No events scheduled for this day.</p>`;
        }

        document.getElementById('cdm-content').innerHTML = html;
        m.classList.remove('hidden');
    };
}

function escapeHtml(s) {
    if (s == null || s === '') return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function escapeHtmlAttr(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML.replace(/"/g, '&quot;');
}

function initCalendar() {
    document.getElementById('calendar-prev')?.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('calendar-next')?.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar();
    });

    window.refreshPersonalCalendar = renderCalendar;
}

function getWeekRange(offset = 0) {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay(); // 0 is Sun, 1 is Mon
    const diff = day === 0 ? 6 : day - 1; // Adjust to Mon as first day

    startOfWeek.setDate(now.getDate() - diff + (offset * 7));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return { start: startOfWeek, end: endOfWeek };
}

async function loadSchedule() {
    if (allTasks.length === 0) {
        try {
            allTasks = await Api.get('/tasks/');
        } catch (e) {
            console.error(e);
        }
    }

    const range = getWeekRange(currentWeekOffset);
    const start = range.start;
    const end = range.end;

    // Update label
    const label = document.getElementById('current-week-label');
    if (currentWeekOffset === 0) label.innerText = "This Week";
    else if (currentWeekOffset === -1) label.innerText = "Last Week";
    else if (currentWeekOffset === 1) label.innerText = "Next Week";
    else {
        label.innerText = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }

    // Days setup
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    days.forEach(day => document.getElementById(`day-${day}`).innerHTML = '');

    let weekAssigned = 0;
    let weekCompleted = 0;

    allTasks.forEach(task => {
        const taskDate = new Date(task.deadline || task.created_at);
        if (taskDate >= start && taskDate <= end) {
            weekAssigned++;
            if (task.status === 'completed') weekCompleted++;

            const dayIdx = taskDate.getDay() === 0 ? 6 : taskDate.getDay() - 1;
            const dayId = `day-${days[dayIdx]}`;

            const taskDiv = document.createElement('div');
            taskDiv.className = `p-2 rounded text-[10px] text-left border ${task.status === 'completed' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-blue-50 border-blue-100 text-blue-700 shadow-sm'}`;
            taskDiv.innerHTML = `
                <p class="font-bold truncate">${task.title}</p>
                <div class="flex justify-between mt-1 items-center">
                    <span>${task.priority}</span>
                    ${task.status === 'completed' ? '<span>✓</span>' : ''}
                </div>
            `;
            document.getElementById(dayId).appendChild(taskDiv);
        }
    });

    // Update Performance UI
    const statsEl = document.getElementById('weekly-completion-stats');
    const barEl = document.getElementById('weekly-completion-bar');
    const statusTextEl = document.getElementById('weekly-status-text');

    statsEl.innerText = `${weekCompleted}/${weekAssigned}`;
    const percent = weekAssigned > 0 ? (weekCompleted / weekAssigned) * 100 : 0;
    barEl.style.width = `${percent}%`;

    if (weekAssigned === 0) {
        statusTextEl.innerText = "No Tasks";
        statusTextEl.className = "text-lg font-bold text-gray-400";
    } else if (percent === 100) {
        statusTextEl.innerText = "Perfect Week!";
        statusTextEl.className = "text-lg font-bold text-primary";
    } else if (percent >= 70) {
        statusTextEl.innerText = "Great Progress";
        statusTextEl.className = "text-lg font-bold text-green-500";
    } else {
        statusTextEl.innerText = "Work in Progress";
        statusTextEl.className = "text-lg font-bold text-yellow-600";
    }
}
