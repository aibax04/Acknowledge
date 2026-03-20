// ============================================
// MANAGER DASHBOARD - FULLY FUNCTIONAL
// ============================================

let currentUser = null;
let allTasks = [];
let allConcerns = [];
let allEmployees = [];
let allPolicies = [];
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
// STEP 1 - AUTH SESSION AND ROLE VALIDATION
// ============================================

async function validateAuth() {
    const token = localStorage.getItem('access_token');

    if (!token) {
        window.location.href = 'login.html';
        return false;
    }

    try {
        currentUser = await Api.getProfile();

        // Verify role is manager or senior
        if (currentUser.role !== 'manager' && currentUser.role !== 'senior') {
            showToast('Access denied. Manager role required.', 'error');
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
    if (roleEl) roleEl.innerText = (currentUser.role || '').charAt(0).toUpperCase() + (currentUser.role || '').slice(1);
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
    cancelBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);

    saveBtn?.addEventListener('click', async () => {
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
// STEP 2 - OVERVIEW TAB (SUMMARY CARDS)
// ============================================

async function loadOverview() {
    try {
        const stats = await Api.get('/dashboard/stats');

        // Update summary cards
        document.getElementById('stat-team-workload').innerText = stats.team_workload || '0%';
        document.getElementById('stat-pending-reviews').innerText = stats.pending_tasks || 0;
        document.getElementById('stat-open-concerns').innerText = stats.open_concerns || 0;
        document.getElementById('stat-active-tasks').innerText = stats.active_tasks || 0;

        // Load team status and attention items
        await loadTeamStatus();
        await loadAttentionItems();
        await loadSentNotifications();
        await loadNotifications();
    } catch (error) {
        console.error('Failed to load overview:', error);
        showToast('Failed to load dashboard data', 'error');
    }
}

// ============================================
// STEP 3 - TEAM STATUS TABLE
// ============================================

async function loadTeamStatus() {
    showLoading('team-status-body');

    try {
        const tasks = await Api.get('/tasks/');
        allTasks = tasks;
        renderTeamStatus(tasks);
    } catch (error) {
        console.error('Failed to load team status:', error);
        showEmptyState('team-status-body', 'Failed to load team status');
    }
}

function renderTeamStatus(tasks) {
    const tbody = document.getElementById('team-status-body');

    if (tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="px-6 py-12 text-center text-gray-500">No active tasks</td></tr>';
        return;
    }

    // Group tasks by employee
    const employeeTasks = {};
    tasks.forEach(task => {
        if (task.assigned_to) {
            const empId = task.assigned_to.id;
            if (!employeeTasks[empId]) {
                employeeTasks[empId] = {
                    employee: task.assigned_to,
                    tasks: []
                };
            }
            employeeTasks[empId].tasks.push(task);
        }
    });

    tbody.innerHTML = Object.values(employeeTasks).slice(0, 10).map(emp => {
        const currentTask = emp.tasks[0];
        const progress = calculateProgress(currentTask.status);
        const progressColor = progress < 30 ? 'bg-red-400' : progress < 70 ? 'bg-yellow-400' : 'bg-primary';
        const initials = emp.employee.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                            ${initials}
                        </div>
                        <div class="ml-3 text-sm font-medium text-gray-900">${emp.employee.full_name}</div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${currentTask.title}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="${progressColor} h-2.5 rounded-full" style="width: ${progress}%"></div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function calculateProgress(status) {
    const progressMap = {
        'pending': 10,
        'in_progress': 50,
        'review': 80,
        'completed': 100
    };
    return progressMap[status] || 0;
}

// ============================================
// STEP 4 - REQUIRES ATTENTION PANEL
// ============================================

async function loadAttentionItems() {
    showLoading('attention-list');

    try {
        const concerns = await Api.get('/concerns/');
        allConcerns = concerns;
        renderAttentionItems(concerns);
    } catch (error) {
        console.error('Failed to load attention items:', error);
        showEmptyState('attention-list', 'Failed to load items');
    }
}

function renderAttentionItems(concerns) {
    const container = document.getElementById('attention-list');

    const openConcerns = concerns.filter(c => c.status === 'open' && (!c.raised_by || c.raised_by.id !== currentUser.id));
    const reviewTasks = allTasks.filter(t => t.status === 'review');

    if (openConcerns.length === 0 && reviewTasks.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500 text-center">No items require attention</p>';
        return;
    }

    container.innerHTML = '';

    // Render open concerns
    openConcerns.forEach(concern => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-red-50 rounded-lg border border-red-100 cursor-pointer hover:bg-red-100 transition-colors';
        div.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') {
                switchTab('nudges');
                viewNudge(concern.id);
            }
        };
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <h4 class="text-sm font-semibold text-red-800">Concern Raised</h4>
                <span class="text-xs text-red-500">${getTimeAgo(concern.created_at)}</span>
            </div>
            <p class="text-sm text-red-600 mt-1 line-clamp-2">"${concern.subject}" - <span class="font-medium">${concern.raised_by ? concern.raised_by.full_name : 'Employee'}</span></p>
            <div class="mt-3 flex space-x-2">
                <button onclick="resolveConcern(${concern.id})" class="text-xs bg-white border border-red-200 text-red-600 px-3 py-1 rounded hover:bg-red-50">Resolve</button>
            </div>
        `;
        container.appendChild(div);
    });

    // Render tasks pending review
    reviewTasks.slice(0, 3).forEach(task => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-primary-light/50 rounded-lg border border-primary-light cursor-pointer hover:bg-primary-light transition-colors';
        div.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') {
                switchTab('team');
                viewTask(task.id);
            }
        };
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <h4 class="text-sm font-semibold text-primary">Task Review</h4>
                <span class="text-xs text-primary">${getTimeAgo(task.updated_at || task.created_at)}</span>
            </div>
            <p class="text-sm text-primary-hover mt-1">${task.assigned_to ? task.assigned_to.full_name : 'Employee'} submitted "${task.title}" for review.</p>
            <div class="mt-3 flex space-x-2">
                <button onclick="approveTask(${task.id})" class="text-xs bg-primary text-white px-3 py-1 rounded hover:bg-primary-hover">Approve</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

// ============================================
// STEP 5 - ASSIGN NEW TASK
// ============================================

async function loadEmployees() {
    try {
        // Get all employees
        const users = await Api.get('/auth/users');
        allEmployees = users;

        // Populate dropdown
        const select = document.getElementById('task-assignee');
        if (!select) return; // Modal not loaded yet

        select.innerHTML = '<option value="">Select person...</option>';

        // Add "Assign to Me" option
        if (currentUser) {
            const meOption = document.createElement('option');
            meOption.value = currentUser.id;
            meOption.textContent = `${currentUser.full_name} (Me)`;
            meOption.style.fontWeight = 'bold';
            select.appendChild(meOption);
        }

        allEmployees.forEach(emp => {
            // Prevent duplicate if current user is in list
            if (currentUser && emp.id === currentUser.id) return;

            const option = document.createElement('option');
            option.value = emp.id;
            const roleLabel = emp.role.charAt(0).toUpperCase() + emp.role.slice(1);
            option.textContent = `${emp.full_name} (${roleLabel})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load employees:', error);
        showToast('Failed to load employees', 'error');
    }
}

async function loadProjectsForDropdown() {
    try {
        // fetchProjects is defined in projects.js which is loaded before manager.js
        const projects = await fetchProjects();
        const select = document.getElementById('task-venture');
        if (!select) return;

        const currentVal = select.value;
        select.innerHTML = '<option value="">Select venture (Optional)</option>';
        projects.forEach(v => {
            const option = document.createElement('option');
            option.value = v.id;
            option.textContent = v.name;
            select.appendChild(option);
        });
        select.value = currentVal || '';

        // Also populate the filter-project dropdown if it exists
        const filterSelect = document.getElementById('filter-project');
        if (filterSelect) {
            const currentVal = filterSelect.value;
            filterSelect.innerHTML = '<option value="all">All Projects</option>';
            projects.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = v.name;
                filterSelect.appendChild(opt);
            });
            filterSelect.value = currentVal;
        }

        // Also populate the nudge-project dropdown
        const nudgeProjectSelect = document.getElementById('nudge-project');
        if (nudgeProjectSelect) {
            nudgeProjectSelect.innerHTML = '<option value="">None</option>';
            projects.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = v.name;
                nudgeProjectSelect.appendChild(opt);
            });
        }
    } catch (error) {
        console.error('Failed to load projects:', error);
    }
}

async function openAssignTaskModal() {
    // Refresh lists just in case
    await loadEmployees();
    await loadProjectsForDropdown();

    document.getElementById('task-title').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-assignee').value = '';
    document.getElementById('task-venture').value = '';
    document.getElementById('task-priority').value = 'medium';
    document.getElementById('task-deadline').value = '';
    document.getElementById('assign-task-modal').classList.add('active');
}

async function assignTask() {
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const assignedToId = document.getElementById('task-assignee').value;
    const projectId = document.getElementById('task-venture').value;
    const priority = document.getElementById('task-priority').value;
    const deadline = document.getElementById('task-deadline').value;
    const btn = document.getElementById('confirm-assign-task');

    if (!title || !assignedToId) {
        showToast('Please fill in required fields', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Assigning...';

    try {
        const taskData = {
            title,
            description: description || null,
            assigned_to_id: parseInt(assignedToId),
            venture_id: projectId ? parseInt(projectId) : null,
            priority,
            deadline: deadline ? new Date(deadline).toISOString() : null
        };

        console.log('Sending task data:', taskData);
        const result = await Api.post('/tasks/', taskData);
        console.log('Task created:', result);
        showToast('Task assigned successfully!', 'success');
        document.getElementById('assign-task-modal').classList.remove('active');
        await loadOverview();
        if (document.getElementById('all-tasks-tbody')) {
            await loadAllTasks();
        }
    } catch (error) {
        console.error('Failed to assign task:', error);
        const errorMsg = error.message || 'Failed to assign task';
        showToast(`Error: ${errorMsg}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Assign Task';
    }
}

// ============================================
// STEP 6 - TEAM & TASKS TAB
// ============================================

async function loadAllTasks() {
    showLoading('all-tasks-tbody');

    try {
        const tasks = await Api.get('/tasks/');
        allTasks = tasks;
        try {
            const summaries = await Api.get('/tasks/comments/summary');
            lastCommentAtByTaskId = {};
            (summaries || []).forEach(s => {
                if (s && s.task_id && s.last_comment_at) lastCommentAtByTaskId[s.task_id] = s.last_comment_at;
            });
        } catch {
            lastCommentAtByTaskId = {};
        }

        // Populate Assigned To filter
        const assignedToSelect = document.getElementById('filter-assigned-to');
        if (assignedToSelect) {
            const currentVal = assignedToSelect.value;
            const assignees = new Map();

            tasks.forEach(task => {
                if (task.assigned_to) {
                    assignees.set(task.assigned_to.id, task.assigned_to.full_name);
                } else {
                    assignees.set('unassigned', 'Unassigned');
                }
            });

            assignedToSelect.innerHTML = '<option value="all">All Assigned To</option>';
            assignees.forEach((name, id) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                assignedToSelect.appendChild(option);
            });

            if (currentVal && (currentVal === 'all' || assignees.has(parseInt(currentVal)) || (currentVal === 'unassigned' && assignees.has('unassigned')))) {
                assignedToSelect.value = currentVal;
            }
        }

        // Populate Assigned By filter
        const assignedBySelect = document.getElementById('filter-assigned-by');
        if (assignedBySelect) {
            const currentVal = assignedBySelect.value;
            const creators = new Map();

            tasks.forEach(task => {
                if (task.created_by) {
                    creators.set(task.created_by.id, task.created_by.full_name);
                } else {
                    creators.set('system', 'System');
                }
            });

            assignedBySelect.innerHTML = '<option value="all">All Managers</option>';
            creators.forEach((name, id) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                assignedBySelect.appendChild(option);
            });

            // Restore previous selection if it still exists
            if (currentVal && (currentVal === 'all' || creators.has(parseInt(currentVal)) || (currentVal === 'system' && creators.has('system')))) {
                assignedBySelect.value = currentVal;
            }
        }

        filterTasks(); // Initial render with filters
    } catch (error) {
        console.error('Failed to load tasks:', error);
        showEmptyState('all-tasks-tbody', 'Failed to load tasks');
    }
}

function filterTasks() {
    const statusFilter = document.getElementById('filter-status').value;
    const priorityFilter = document.getElementById('filter-priority').value;
    const projectFilter = document.getElementById('filter-project')?.value || 'all';
    const assignedByFilter = document.getElementById('filter-assigned-by')?.value || 'all';
    const assignedToFilter = document.getElementById('filter-assigned-to')?.value || 'all';
    const ackFilter = document.getElementById('filter-ack')?.value || 'all';

    let filtered = allTasks;

    if (assignedByFilter !== 'all') {
        filtered = filtered.filter(t => {
            if (assignedByFilter === 'system') return !t.created_by;
            return t.created_by && t.created_by.id === parseInt(assignedByFilter);
        });
    }

    if (assignedToFilter !== 'all') {
        filtered = filtered.filter(t => {
            if (assignedToFilter === 'unassigned') return !t.assigned_to;
            return t.assigned_to && t.assigned_to.id === parseInt(assignedToFilter);
        });
    }

    if (statusFilter !== 'all') {
        filtered = filtered.filter(t => t.status === statusFilter);
    }

    if (priorityFilter !== 'all') {
        filtered = filtered.filter(t => t.priority === priorityFilter);
    }

    if (projectFilter !== 'all') {
        filtered = filtered.filter(t => t.venture_id === parseInt(projectFilter));
    }

    if (ackFilter !== 'all') {
        if (ackFilter === 'acknowledged') {
            filtered = filtered.filter(t => !!t.acknowledged_at);
        } else if (ackFilter === 'pending') {
            filtered = filtered.filter(t => !t.acknowledged_at);
        }
    }

    renderAllTasks(filtered);
}

function renderAllTasks(tasks) {
    const tbody = document.getElementById('all-tasks-tbody');

    if (tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No tasks found</td></tr>';
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
        const lastCommentAt = lastCommentAtByTaskId ? lastCommentAtByTaskId[task.id] : null;
        const seenKey = currentUser && currentUser.id ? `task_comments_seen_${currentUser.id}_${task.id}` : `task_comments_seen_${task.id}`;
        const lastSeen = localStorage.getItem(seenKey);
        const hasUnseen = !!(lastCommentAt && (!lastSeen || new Date(lastCommentAt).getTime() > new Date(lastSeen).getTime()));

        return `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${task.title}</div>
                <div class="text-xs text-gray-500">${task.description || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${task.assigned_to ? task.assigned_to.full_name : 'Unassigned'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${task.created_by ? task.created_by.full_name : 'System'}
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
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2">
                        ${((task.assigned_to_id === currentUser?.id) || (task.assigned_to && task.assigned_to.id === currentUser?.id)) && !task.acknowledged_at ?
                `<button type="button" onclick="acknowledgeTask(${task.id})" class="px-2.5 py-1 rounded-md text-primary hover:bg-primary/10 font-medium transition-colors">Acknowledge</button>` :
                ((task.assigned_to_id === currentUser?.id) || (task.assigned_to && task.assigned_to.id === currentUser?.id)) && task.acknowledged_at && task.status !== 'completed' && task.status !== 'review' ?
                    `<span class="text-xs text-green-600 font-medium px-2.5 py-1">✓ Acknowledged</span>` :
                    ((task.created_by_id === currentUser?.id) || (task.created_by && task.created_by.id === currentUser?.id)) && task.acknowledged_at ?
                        `<span class="text-xs text-green-600 font-medium px-2.5 py-1">✓ Acknowledged</span>` :
                        ''
            }
                        ${((task.assigned_to_id === currentUser?.id) || (task.assigned_to && task.assigned_to.id === currentUser?.id)) && task.status !== 'completed' && task.status !== 'review' ?
                `<button type="button" onclick="markTaskComplete(${task.id})" class="px-2.5 py-1 rounded-md text-green-600 hover:bg-green-50 font-medium transition-colors">Mark Complete</button>` :
                ''
            }
                        <button type="button" class="task-comment-btn px-2.5 py-1 rounded-md text-gray-600 hover:text-primary hover:bg-primary/10 font-medium transition-colors inline-flex items-center gap-1" data-task-id="${task.id}" data-task-title="${(task.title || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">Comment${hasUnseen ? '<span class="inline-block w-2 h-2 rounded-full bg-red-500" aria-label="Unseen comments"></span>' : ''}</button>
                        ${task.status === 'review' ?
                `<button type="button" onclick="approveTask(${task.id})" class="px-2.5 py-1 rounded-md text-primary hover:bg-primary/10 font-medium transition-colors">Approve</button>` :
                `<button type="button" onclick="viewTask(${task.id})" class="px-2.5 py-1 rounded-md text-gray-600 hover:text-gray-800 hover:bg-gray-100 font-medium transition-colors">View</button>`
            }
                    </div>
                    <span class="text-gray-200" aria-hidden="true">|</span>
                    <button type="button" onclick="deleteTask(${task.id})" class="p-1.5 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors" title="Delete task" aria-label="Delete task">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

async function acknowledgeTask(taskId) {
    try {
        await Api.patch(`/tasks/${taskId}/acknowledge`);
        showToast('Task acknowledged', 'success');
        await loadAllTasks();
    } catch (e) {
        showToast(e.message || 'Failed to acknowledge task', 'error');
    }
}

async function approveTask(taskId) {
    if (!confirm('Approve this task as completed?')) return;

    try {
        await Api.put(`/tasks/${taskId}`, { status: 'completed' });
        showToast('Task approved!', 'success');
        await loadOverview();
        await loadAllTasks();
    } catch (error) {
        console.error('Failed to approve task:', error);
        showToast('Failed to approve task', 'error');
    }
}

async function markTaskComplete(taskId) {
    if (!confirm('Mark this task as completed?')) return;

    try {
        await Api.put(`/tasks/${taskId}`, { status: 'completed' });
        showToast('Task marked as completed!', 'success');
        await loadOverview();
        await loadAllTasks();
    } catch (error) {
        console.error('Failed to mark task as complete:', error);
        showToast('Failed to mark task as complete', 'error');
    }
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
    if (!listEl) return;
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
        await loadAllTasks();
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
    if (!btn) return;
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

function viewTask(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('view-task-title').innerText = task.title;
    document.getElementById('view-task-description').innerText = task.description || 'No description provided.';
    document.getElementById('view-task-assignee').innerText = task.assigned_to ? task.assigned_to.full_name : 'Unassigned';
    document.getElementById('view-task-deadline').innerText = task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No deadline';

    const statusEl = document.getElementById('view-task-status');
    statusEl.innerText = task.status.replace('_', ' ');

    const statusColors = {
        'pending': 'bg-gray-100 text-gray-800',
        'in_progress': 'bg-blue-100 text-blue-800',
        'completed': 'bg-green-100 text-green-800',
        'review': 'bg-purple-100 text-purple-800'
    };

    statusEl.className = `inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${statusColors[task.status] || 'bg-gray-100'}`;

    // Show acknowledgment status if task was acknowledged
    const ackEl = document.getElementById('view-task-acknowledgment');
    if (task.acknowledged_at) {
        ackEl.classList.remove('hidden');
    } else {
        ackEl.classList.add('hidden');
    }

    document.getElementById('view-task-modal').classList.add('active');
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
        return;
    }

    try {
        await Api.delete(`/tasks/${taskId}`);
        showToast('Task deleted successfully', 'success');
        await loadOverview();
        await loadAllTasks();
    } catch (error) {
        console.error('Failed to delete task:', error);
        showToast(error.message || 'Failed to delete task', 'error');
    }
}

// ============================================
// STEP 7 - CONCERN MANAGEMENT
// ============================================

async function resolveConcern(concernId) {
    if (!confirm('Mark this concern as resolved?')) return;

    try {
        await Api.put(`/concerns/${concernId}`, { status: 'resolved' });
        showToast('Concern resolved!', 'success');
        await loadOverview();
    } catch (error) {
        console.error('Failed to resolve concern:', error);
        showToast('Failed to resolve concern', 'error');
    }
}

// ============================================
// STEP 8 - REPORTS TAB
// ============================================

async function loadReports() {
    try {
        const tasks = await Api.get('/tasks/');
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const totalTasks = tasks.length;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        document.getElementById('report-completion-rate').innerText = `${completionRate}%`;
        document.getElementById('report-response-time').innerText = '2.5h';
    } catch (error) {
        console.error('Failed to load reports:', error);
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
    if (tabName === 'overview') {
        loadOverview();
    } else if (tabName === 'team') {
        loadAllTasks();
    } else if (tabName === 'reports') {
        loadReports();
    } else if (tabName === 'nudges') {
        loadManageNudges();
    } else if (tabName === 'projects') {
        if (typeof loadKanbanDashboard === 'function') loadKanbanDashboard('projects-kanban-container');
        if (typeof loadProjects === 'function') loadProjects();
    } else if (tabName === 'policies') {
        loadPolicies();
    } else if (tabName === 'calendar') {
        loadPersonalCalendar();
    } else if (tabName === 'extra') {
        loadResolvedConcerns();
    } else if (tabName === 'attendance') {
        loadAttendanceTab();
        loadPendingAttendanceRequests();
        initAttendanceExport();
    } else if (tabName === 'leaves') {
        loadLeavesTab();
    } else if (tabName === 'holidays') {
        loadHolidays(currentUser ? currentUser.office : null);
    }
}

async function loadResolvedConcerns() {
    showLoading('resolved-concerns-tbody');
    try {
        const concerns = await Api.get('/concerns/');
        // Global variable should be defined at the top, but for safety I'll assume allConcerns is reusable or I'll just use a local reference if I wasn't persisting it.
        // Actually, let's use a new global or simply attach it to window to be safe if I can't edit the top easily.
        // Better: I will edit the top in a separate call or just rely on the existing allConcerns if it's there. 
        // Manager.js has `let allConcerns = []` at line 7. I will use that.
        allConcerns = concerns;

        // Populate Filters
        const filterSelect = document.getElementById('filter-concern-raised-by');

        if (filterSelect) {
            const currentVal = filterSelect.value;
            const raisers = new Map();

            concerns.forEach(c => {
                if (c.status === 'resolved') {
                    if (c.raised_by) {
                        raisers.set(c.raised_by.id, c.raised_by.full_name);
                    } else {
                        raisers.set('unknown', 'Unknown');
                    }
                }
            });

            filterSelect.innerHTML = '<option value="all">All Raised By</option>';
            raisers.forEach((name, id) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                filterSelect.appendChild(option);
            });

            if (currentVal && (currentVal === 'all' || raisers.has(parseInt(currentVal)) || (currentVal === 'unknown' && raisers.has('unknown')))) {
                filterSelect.value = currentVal;
            }
        }

        filterResolvedConcerns();
    } catch (error) {
        console.error('Failed to load resolved concerns:', error);
        showEmptyState('resolved-concerns-tbody', 'Failed to load history');
    }
}

function filterResolvedConcerns() {
    const filterVal = document.getElementById('filter-concern-raised-by')?.value || 'all';
    const sortVal = document.getElementById('sort-concerns')?.value || 'newest';

    let filtered = allConcerns.filter(c => c.status === 'resolved');

    // Apply Raiser Filter
    if (filterVal !== 'all') {
        filtered = filtered.filter(c => {
            if (filterVal === 'unknown') return !c.raised_by;
            return c.raised_by && c.raised_by.id === parseInt(filterVal);
        });
    }

    // Apply Sort
    filtered.sort((a, b) => {
        const dateA = new Date(a.resolved_at || a.created_at);
        const dateB = new Date(b.resolved_at || b.created_at);

        return sortVal === 'newest' ? dateB - dateA : dateA - dateB;
    });

    renderResolvedConcerns(filtered);
}

function renderResolvedConcerns(concerns) {
    const tbody = document.getElementById('resolved-concerns-tbody');
    if (!tbody) return;

    if (concerns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-12 text-center text-gray-500">No resolved concerns found</td></tr>';
        return;
    }

    tbody.innerHTML = concerns.map(c => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${c.subject}</div>
                <div class="text-xs text-gray-500 line-clamp-1">${c.description}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${c.raised_by ? c.raised_by.full_name : 'Unknown'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : '-'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button class="text-gray-400 cursor-not-allowed">Resolved</button>
            </td>
        </tr>
    `).join('');
}

// ============================================
// STEP 10 - LOGOUT FUNCTIONALITY
// ============================================

function handleLogout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_role');

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

    // Load employees for task assignment
    await loadEmployees();
    await loadProjectsForDropdown();

    // Init Calendar Listeners
    initCalendar();

    // Load initial data
    await loadOverview();
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
    document.getElementById('btn-assign-task').addEventListener('click', openAssignTaskModal);

    document.getElementById('cancel-assign-task').addEventListener('click', () => {
        document.getElementById('assign-task-modal').classList.remove('active');
    });

    document.getElementById('confirm-assign-task').addEventListener('click', assignTask);

    document.getElementById('close-view-task')?.addEventListener('click', () => {
        document.getElementById('view-task-modal').classList.remove('active');
    });

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

    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Nudge Senior handlers
    document.getElementById('btn-create-nudge')?.addEventListener('click', openCreateNudgeModal);
    document.getElementById('cancel-create-nudge')?.addEventListener('click', () => {
        document.getElementById('create-nudge-modal').classList.remove('active');
    });
    document.getElementById('confirm-create-nudge')?.addEventListener('click', submitNudge);

    // Notification tray handlers
    document.getElementById('notifTrayBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('notifDropdown').classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        const tray = document.getElementById('notifDropdown');
        if (tray) tray.classList.add('hidden');
    });

    document.getElementById('notifDropdown')?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Policy Modal handlers
    document.getElementById('close-policy-modal')?.addEventListener('click', () => {
        document.getElementById('view-policy-modal').classList.remove('active');
    });

    document.getElementById('acknowledge-policy-btn')?.addEventListener('click', acknowledgePolicy);

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
// STEP 11 - ERROR HANDLING (Global)
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

function openNotifyModal() {
    window._notifyTargetUserId = null;
    const h2 = document.querySelector('#notify-modal h2');
    if (h2) h2.textContent = 'General Notification';
    document.getElementById('notify-title').value = '';
    document.getElementById('notify-content').value = '';
    document.getElementById('notify-modal').classList.remove('hidden');
}

window.openNotifyForUser = function (userId, userName) {
    window._notifyTargetUserId = userId;
    const h2 = document.querySelector('#notify-modal h2');
    if (h2) h2.textContent = userName ? 'Notify ' + userName : 'Notify';
    document.getElementById('notify-title').value = '';
    document.getElementById('notify-content').value = '';
    document.getElementById('notify-modal').classList.remove('hidden');
};

function closeNotifyModal() {
    window._notifyTargetUserId = null;
    const h2 = document.querySelector('#notify-modal h2');
    if (h2) h2.textContent = 'General Notification';
    document.getElementById('notify-modal').classList.add('hidden');
}

async function submitNotification() {
    const title = document.getElementById('notify-title').value.trim();
    const content = document.getElementById('notify-content').value.trim();

    if (!title || !content) {
        showToast("Please fill in all fields", "error");
        return;
    }

    try {
        if (window._notifyTargetUserId) {
            await Api.post('/notifications/', { title, content, notification_type: 'TARGETED', recipient_ids: [window._notifyTargetUserId] });
            window._notifyTargetUserId = null;
            showToast("Notification sent!", "success");
        } else {
            await Api.post('/notifications/', { title, content });
            showToast("General Notification sent to all employees!", "success");
        }
        closeNotifyModal();
        await loadSentNotifications();
    } catch (e) {
        console.error(e);
        showToast("Failed to send notification", "error");
    }
}

async function loadSentNotifications() {
    try {
        const notifications = await Api.get('/notifications/');
        const container = document.getElementById('sent-notifications-list');

        if (notifications.length === 0) {
            container.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">No notifications sent yet</div>';
            return;
        }

        container.innerHTML = notifications.map(notif => `
            <div class="px-6 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4 group">
                <div class="min-w-0 flex-1">
                    <h4 class="text-sm font-semibold text-gray-900">${notif.title}</h4>
                    <p class="text-xs text-gray-500 mt-0.5">${new Date(notif.created_at).toLocaleString()}</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button onclick="deleteNotification(${notif.id})" 
                        class="p-2 text-red-400 hover:text-red-600 transition-colors rounded-lg"
                        title="Delete notification" aria-label="Delete">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                    <button onclick="viewNotifStatus(${notif.id}, '${(notif.title || '').replace(/'/g, '&#39;')}')" 
                        class="text-xs font-medium text-primary hover:text-primary-hover bg-primary-light px-3 py-1.5 rounded-full whitespace-nowrap">
                        View Status
                    </button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
    }
}

async function viewNotifStatus(id, title) {
    try {
        const status = await Api.get(`/notifications/${id}/status`);
        document.getElementById('status-modal-title').innerText = `Status: ${title}`;

        const ackList = document.getElementById('ack-list');
        const pendingList = document.getElementById('pending-list');

        ackList.innerHTML = status.acknowledged_users.length > 0
            ? status.acknowledged_users.map(u => `<li>${u.full_name} <span class="text-green-500">✓</span></li>`).join('')
            : '<li class="italic">None yet</li>';

        pendingList.innerHTML = status.pending_users.length > 0
            ? status.pending_users.map(u => `<li>${u.full_name}</li>`).join('')
            : '<li class="italic text-green-600 font-bold">Everyone has acknowledged!</li>';

        document.getElementById('notif-status-modal').classList.remove('hidden');
    } catch (e) {
        console.error(e);
        showToast("Failed to load status", "error");
    }
}

// ============================================
// SHARED SYSTEMS (POLICY & NOTIFICATIONS)
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
    if (!container || !badge) return;

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
        const canDelete = currentUser && (notif.created_by_id === currentUser.id || currentUser.role === 'SENIOR');

        return `
            <div class="p-4 ${notif.is_acknowledged ? 'bg-white opacity-70' : 'bg-blue-50'} hover:bg-gray-50 transition-colors">
                <div class="flex justify-between items-start mb-1">
                    <h4 class="text-sm font-bold text-gray-900">${notif.title}</h4>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-gray-400 font-medium">${date}</span>
                        ${canDelete ? `
                            <button onclick="deleteNotification(${notif.id})" 
                                class="text-red-500 hover:text-red-700 transition-colors" 
                                title="Delete notification">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                            </button>
                        ` : ''}
                    </div>
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

async function deleteNotification(id) {
    if (!confirm('Are you sure you want to delete this notification? This action cannot be undone.')) {
        return;
    }

    try {
        await Api.delete(`/notifications/${id}`);
        showToast("Notification deleted successfully", "success");
        await loadNotifications();
        // Also refresh sent notifications list if it exists
        if (typeof loadSentNotifications === 'function') {
            await loadSentNotifications();
        }
    } catch (e) {
        console.error(e);
        showToast(e.message || "Failed to delete notification", "error");
    }
}

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
    } catch (error) {
        console.error('Failed to load policies:', error);
        showEmptyState('policies-list', 'Failed to load policies');
    }
}

function renderPolicies(policies) {
    const container = document.getElementById('policies-list');
    if (!container) return;

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
    const stat = document.getElementById('stat-pending-policies');

    if (badge) {
        if (pendingPolicies > 0) {
            badge.innerText = pendingPolicies;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    if (stat) {
        stat.innerText = pendingPolicies;
    }
}

// ============================================
// STEP 12 - PERSONAL CALENDAR
// ============================================

let currentCalendarDate = new Date();
let personalTasks = [];
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

async function loadPersonalCalendar() {
    try {
        const tasks = await Api.get('/tasks/my-calendar');
        personalTasks = tasks;

        // Fetch approved leaves here
        try {
            const [myLeaves, allLeaves] = await Promise.all([
                Api.get('/leaves/my-leaves').catch(() => []),
                Api.get('/leaves/all').catch(() => [])
            ]);

            const leavesMap = new Map();
            myLeaves.forEach(l => { if (l.status === 'approved') leavesMap.set(l.id, { ...l, user_name: 'Me' }); });
            allLeaves.forEach(l => { if (l.status === 'approved') leavesMap.set(l.id, l); });

            window._calendarApprovedLeaves = Array.from(leavesMap.values());
        } catch (e) { window._calendarApprovedLeaves = []; }

        await renderCalendar();
        renderPersonalTodoList();
    } catch (error) {
        console.error('Failed to load personal calendar:', error);
        showToast('Failed to load personal calendar', 'error');
    }
}

async function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthYear = document.getElementById('calendar-month-year');
    if (!grid || !monthYear) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    await _fetchCalendarHolidays(year);

    monthYear.innerText = currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayIndex = firstDay.getDay();
    const totalDays = lastDay.getDate();

    let html = '';

    for (let i = 0; i < startDayIndex; i++) {
        html += `<div class="bg-white h-24 border-b border-r border-gray-100"></div>`;
    }

    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
    const personalTodos = typeof window.getPersonalTodosForCalendar === 'function' ? window.getPersonalTodosForCalendar() : [];

    window._calendarDayData = window._calendarDayData || {};

    for (let day = 1; day <= totalDays; day++) {
        const isToday = isCurrentMonth && today.getDate() === day;
        const dayString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const holidayName = _calendarHolidays[dayString] || null;

        const dayTasks = personalTasks.filter(t => t.deadline && t.deadline.startsWith(dayString));
        const dayPersonalTodos = personalTodos.filter(t => t.date === dayString && !t.done);
        const dayItems = dayTasks.map(t => ({ title: t.title, priority: t.priority || 'medium' }))
            .concat(dayPersonalTodos.map(t => ({ title: t.text, priority: (t.priority || 'medium').toLowerCase() })));

        const bgClass = holidayName ? 'bg-purple-50 hover:bg-purple-100' : 'bg-white hover:bg-gray-50';
        const holidayHtml = holidayName
            ? `<div class="text-[10px] truncate px-1 rounded font-semibold bg-purple-100 text-purple-700 border border-purple-200" title="${(holidayName || '').replace(/"/g, '&quot;')}">${(holidayName || '').replace(/</g, '&lt;')}</div>`
            : '';

        const leafMatches = (window._calendarApprovedLeaves || []).filter(l => l.start_date <= dayString && l.end_date >= dayString);

        window._calendarDayData[dayString] = {
            holiday: holidayName,
            leaves: leafMatches,
            tasks: dayItems
        };

        html += `
            <div class="${bgClass} h-24 border-b border-r border-gray-100 p-2 transition-colors relative group cursor-pointer" onclick="openCalendarDayModal('${dayString}')">
                <span class="text-sm font-medium ${isToday ? 'bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-700'}">${day}</span>
                <div class="mt-2 flex flex-col gap-1 overflow-hidden pointer-events-none">
                    ${holidayHtml}
                    ${leafMatches.map(l => `<div class="text-[10px] truncate px-1 rounded bg-teal-100 text-teal-800" title="Leave: ${(l.custom_policy_title || l.leave_type || '').replace(/"/g, '&quot;')} - ${(l.user_name || '').replace(/"/g, '&quot;')}">Leave: ${(l.user_name || 'Unknown')} - ${(l.custom_policy_title || l.leave_type || '').replace(/</g, '&lt;')}</div>`).join('')}
                    ${dayItems.map(t => `<div class="text-[10px] truncate px-1 rounded ${t.priority === 'high' ? 'bg-red-100 text-red-800' : t.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-50 text-blue-800'}">${(t.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`).join('')}
                </div>
            </div>
        `;
    }

    grid.innerHTML = html;
}

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



function renderPersonalTodoList() {
    const list = document.getElementById('personal-todo-list');
    if (!list || list.closest('#personal-todo-list-container')) return;

    // Filter pending/in_progress tasks
    const todos = personalTasks.filter(t => t.status !== 'completed' && t.status !== 'review');

    if (todos.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 py-4">No pending personal tasks</p>';
        return;
    }

    list.innerHTML = todos.map(t => `
        <div class="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:shadow-sm transition-shadow">
            <div class="flex justify-between items-start">
                <h4 class="text-sm font-medium text-gray-900 line-clamp-1">${t.title}</h4>
                <span class="text-[10px] uppercase font-bold ${getPriorityColor(t.priority)}">${t.priority}</span>
            </div>
            <p class="text-xs text-gray-500 mt-1 line-clamp-2">${t.description || ''}</p>
            <div class="flex justify-between items-center mt-2">
                <span class="text-[10px] text-red-500">${t.deadline ? 'Due ' + new Date(t.deadline).toLocaleDateString() : 'No deadline'}</span>
                <button onclick="markTaskComplete(${t.id})" class="text-xs text-primary font-medium hover:underline">Complete</button>
            </div>
        </div>
    `).join('');
}

function getPriorityColor(p) {
    if (p === 'high') return 'text-red-600';
    if (p === 'medium') return 'text-yellow-600';
    return 'text-green-600';
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

// ============================================
// STEP 13 - NUDGE SENIORS
// ============================================

let managerNudgesCache = [];

async function loadManageNudges() {
    showLoading('nudges-tbody');
    try {
        const nudges = await Api.get('/concerns/');
        // Filter nudges where reporter exists and is a manager
        const myNudges = nudges.filter(n => n.raised_by && n.raised_by.role === 'manager');
        managerNudgesCache = myNudges;
        renderNudges(myNudges);
    } catch (error) {
        console.error('Failed to load nudges:', error);
        showEmptyState('nudges-tbody', 'Failed to load nudges');
    }
}

function renderNudges(nudges) {
    const tbody = document.getElementById('nudges-tbody');
    if (!tbody) return;

    if (nudges.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No nudges sent yet</td></tr>';
        return;
    }

    const statusColors = {
        'pending': 'bg-yellow-100 text-yellow-800',
        'accepted': 'bg-blue-100 text-blue-800',
        'resolved': 'bg-green-100 text-green-800'
    };

    tbody.innerHTML = nudges.map(n => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${n.subject}</div>
                <div class="text-xs text-gray-500">${n.description || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${n.notified_users && n.notified_users.length > 0 ? n.notified_users[0].full_name : 'Multiple/None'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[n.status] || 'bg-gray-100'}">
                    ${n.status}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${new Date(n.created_at).toLocaleDateString()}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="viewNudge(${n.id})" class="text-primary hover:text-primary-hover">View</button>
            </td>
        </tr>
    `).join('');
}

async function openCreateNudgeModal() {
    const modal = document.getElementById('create-nudge-modal');
    modal.classList.add('active');

    // Populate Seniors
    try {
        const users = await Api.get('/auth/all-users');
        const seniors = users.filter(u => u.role === 'senior');
        const seniorSelect = document.getElementById('nudge-senior');
        seniorSelect.innerHTML = '<option value="">Select a senior...</option>';
        seniors.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.full_name;
            seniorSelect.appendChild(opt);
        });

        // Populate Tasks
        const taskSelect = document.getElementById('nudge-task');
        taskSelect.innerHTML = '<option value="">None</option>';
        allTasks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.title;
            taskSelect.appendChild(opt);
        });

        // Projects already populated by loadProjectsForDropdown
    } catch (e) {
        console.error("Failed to populate nudge modal", e);
    }
}

async function submitNudge() {
    const subject = document.getElementById('nudge-subject').value;
    const description = document.getElementById('nudge-description').value;
    const seniorId = document.getElementById('nudge-senior').value;
    const taskId = document.getElementById('nudge-task').value;
    const projectId = document.getElementById('nudge-project').value;

    if (!subject || !seniorId) {
        showToast('Subject and Senior are required', 'error');
        return;
    }

    try {
        await Api.post('/concerns/', {
            subject,
            description,
            notified_user_ids: [parseInt(seniorId)],
            task_id: taskId ? parseInt(taskId) : null,
            venture_id: projectId ? parseInt(projectId) : null
        });
        showToast('Nudge sent to senior!', 'success');
        document.getElementById('create-nudge-modal').classList.remove('active');
        loadManageNudges();
    } catch (error) {
        console.error('Failed to send nudge:', error);
        showToast('Failed to send nudge', 'error');
    }
}

function viewNudge(nudgeId) {
    let nudge = null;
    if (typeof allConcerns !== 'undefined') nudge = allConcerns.find(n => n.id === nudgeId);
    if (!nudge && typeof managerNudgesCache !== 'undefined') nudge = managerNudgesCache.find(n => n.id === nudgeId);
    if (!nudge) {
        showToast('Nudge not found', 'error');
        return;
    }
    const modal = document.getElementById('view-nudge-modal');
    const statusColors = { open: 'text-yellow-600', escalated: 'text-orange-600', resolved: 'text-green-600', accepted: 'text-blue-600' };
    document.getElementById('view-nudge-title').textContent = nudge.subject || 'Nudge Details';
    document.getElementById('view-nudge-subject').textContent = nudge.subject || '—';
    document.getElementById('view-nudge-description').textContent = nudge.description || '—';
    document.getElementById('view-nudge-seniors').textContent = (nudge.notified_users && nudge.notified_users.length > 0)
        ? nudge.notified_users.map(u => u.full_name).join(', ')
        : '—';
    const statusEl = document.getElementById('view-nudge-status');
    statusEl.textContent = (nudge.status || '—').toLowerCase();
    statusEl.className = 'text-sm font-medium ' + (statusColors[nudge.status] || 'text-gray-600');
    document.getElementById('view-nudge-created').textContent = nudge.created_at
        ? new Date(nudge.created_at).toLocaleString()
        : '—';
    const resolvedWrap = document.getElementById('view-nudge-resolved-wrap');
    const resolvedEl = document.getElementById('view-nudge-resolved');
    if (nudge.resolved_at) {
        resolvedWrap.classList.remove('hidden');
        resolvedEl.textContent = new Date(nudge.resolved_at).toLocaleString();
    } else {
        resolvedWrap.classList.add('hidden');
    }
    modal.classList.add('active');
}


// ============================================
// ATTENDANCE EXPORT (Excel)
// ============================================

let _exportUsersLoaded = false;

async function initAttendanceExport() {
    const userSel = document.getElementById('export-att-user');
    const monthSel = document.getElementById('export-att-month');
    const yearSel = document.getElementById('export-att-year');
    const markAbsentUserSel = document.getElementById('mark-absent-user');
    if (!userSel || !monthSel || !yearSel) return;

    if (!_exportUsersLoaded) {
        try {
            const users = await Api.get('/auth/all-users');
            const opts = (users || []).map(u => `<option value="${u.id}">${u.full_name} (${u.role})</option>`).join('');
            userSel.innerHTML = '<option value="">Select employee...</option>' + opts;
            if (markAbsentUserSel) {
                markAbsentUserSel.innerHTML = '<option value="">Select employee...</option>' + opts;
            }
            _exportUsersLoaded = true;
        } catch (e) {
            console.error('Failed to load users for export', e);
        }
    }

    if (!monthSel.options.length || monthSel.options.length < 2) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const now = new Date();
        monthSel.innerHTML = '';
        months.forEach((m, i) => {
            monthSel.innerHTML += `<option value="${i + 1}" ${i + 1 === now.getMonth() + 1 ? 'selected' : ''}>${m}</option>`;
        });
        yearSel.innerHTML = '';
        const cy = now.getFullYear();
        for (let y = cy - 2; y <= cy + 1; y++) {
            yearSel.innerHTML += `<option value="${y}" ${y === cy ? 'selected' : ''}>${y}</option>`;
        }
    }
    const dateInput = document.getElementById('mark-absent-date');
    if (dateInput && !dateInput.value) {
        const today = new Date();
        dateInput.value = today.toISOString().slice(0, 10);
    }
}

async function submitMarkAbsent() {
    const userId = document.getElementById('mark-absent-user') && document.getElementById('mark-absent-user').value;
    const dateEl = document.getElementById('mark-absent-date');
    const absentDate = dateEl && dateEl.value ? dateEl.value.trim() : '';
    if (!userId) { showToast('Please select an employee', 'error'); return; }
    if (!absentDate) { showToast('Please select a date', 'error'); return; }
    try {
        await Api.post('/attendance/mark-absent', { user_id: parseInt(userId, 10), absent_date: absentDate });
        showToast('Marked absent successfully', 'success');
        if (dateEl) dateEl.value = '';
        if (typeof loadAttendanceTab === 'function') loadAttendanceTab();
    } catch (e) {
        showToast(e.message || 'Failed to mark absent', 'error');
    }
}

async function exportAttendanceExcel() {
    const userId = document.getElementById('export-att-user').value;
    const month = document.getElementById('export-att-month').value;
    const year = document.getElementById('export-att-year').value;
    if (!userId) { showToast('Please select an employee', 'error'); return; }

    try {
        const url = Api.getApiUrl() + `/attendance/export?year=${year}&month=${month}&user_id=${userId}`;
        const resp = await fetch(url, { method: 'GET', headers: Api.getHeaders() });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || `Export failed (${resp.status})`);
        }
        const blob = await resp.blob();
        const disposition = resp.headers.get('Content-Disposition') || '';
        let filename = 'attendance.xlsx';
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        showToast('Attendance exported!', 'success');
    } catch (e) {
        showToast(e.message || 'Export failed', 'error');
    }
}
