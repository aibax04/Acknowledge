// ============================================
// MANAGER DASHBOARD - FULLY FUNCTIONAL
// ============================================

let currentUser = null;
let allTasks = [];
let allConcerns = [];
let allEmployees = [];
let allPolicies = [];

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
        document.getElementById('user-name').innerText = currentUser.full_name;
        const initials = currentUser.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        document.getElementById('user-avatar').innerText = initials;
        document.getElementById('user-role').innerText = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

        return true;
    } catch (error) {
        console.error('Auth validation failed:', error);
        showToast('Session expired. Please login again.', 'error');
        setTimeout(() => window.location.href = 'login.html', 2000);
        return false;
    }
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
        await loadPolicies();
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
        const tasks = await Api.get('/tasks');
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
        const concerns = await Api.get('/concerns');
        allConcerns = concerns;
        renderAttentionItems(concerns);
    } catch (error) {
        console.error('Failed to load attention items:', error);
        showEmptyState('attention-list', 'Failed to load items');
    }
}

function renderAttentionItems(concerns) {
    const container = document.getElementById('attention-list');

    const openConcerns = concerns.filter(c => c.status === 'open');
    const reviewTasks = allTasks.filter(t => t.status === 'review');

    if (openConcerns.length === 0 && reviewTasks.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500 text-center">No items require attention</p>';
        return;
    }

    container.innerHTML = '';

    // Render open concerns
    openConcerns.forEach(concern => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-red-50 rounded-lg border border-red-100';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <h4 class="text-sm font-semibold text-red-800">Concern Raised</h4>
                <span class="text-xs text-red-500">${getTimeAgo(concern.created_at)}</span>
            </div>
            <p class="text-sm text-red-600 mt-1">"${concern.subject}" - <span class="font-medium">${concern.raised_by ? concern.raised_by.full_name : 'Employee'}</span></p>
            <div class="mt-3 flex space-x-2">
                <button onclick="resolveConcern(${concern.id})" class="text-xs bg-white border border-red-200 text-red-600 px-3 py-1 rounded hover:bg-red-50">Resolve</button>
            </div>
        `;
        container.appendChild(div);
    });

    // Render tasks pending review
    reviewTasks.slice(0, 3).forEach(task => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-primary-bg rounded-lg border border-primary-light';
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
        // Get all employees from the new endpoint
        const users = await Api.get('/auth/users');
        allEmployees = users;

        // Populate dropdown
        const select = document.getElementById('task-assignee');
        if (!select) return; // Modal not loaded yet

        select.innerHTML = '<option value="">Select employee...</option>';
        allEmployees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.id;
            option.textContent = emp.full_name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load employees:', error);
        showToast('Failed to load employees', 'error');
    }
}

function openAssignTaskModal() {
    document.getElementById('task-title').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-assignee').value = '';
    document.getElementById('task-priority').value = 'medium';
    document.getElementById('task-deadline').value = '';
    document.getElementById('assign-task-modal').classList.add('active');
}

async function assignTask() {
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const assignedToId = document.getElementById('task-assignee').value;
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
        const tasks = await Api.get('/tasks');
        const activeTasksList = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
        allTasks = tasks;
        renderAllTasks(activeTasksList);
    } catch (error) {
        console.error('Failed to load tasks:', error);
        showEmptyState('all-tasks-tbody', 'Failed to load tasks');
    }
}

function renderAllTasks(tasks) {
    const tbody = document.getElementById('all-tasks-tbody');

    if (tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-gray-500">No tasks found</td></tr>';
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

    tbody.innerHTML = tasks.map(task => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${task.title}</div>
                <div class="text-xs text-gray-500">${task.description || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${task.assigned_to ? task.assigned_to.full_name : 'Unassigned'}
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
                ${task.status === 'review' ?
            `<button onclick="approveTask(${task.id})" class="text-primary hover:text-primary-hover font-medium">Approve</button>` :
            `<button onclick="viewTask(${task.id})" class="text-gray-600 hover:text-gray-800 font-medium">View</button>`
        }
            </td>
        </tr>
    `).join('');
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

function viewTask(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (task) {
        alert(`Task: ${task.title}\nStatus: ${task.status}\nAssigned to: ${task.assigned_to ? task.assigned_to.full_name : 'Unassigned'}`);
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
        const tasks = await Api.get('/tasks');
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
    } else if (tabName === 'policies') {
        loadPolicies();
    }
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

    // Load initial data
    await loadOverview();

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

    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

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
    document.getElementById('notify-title').value = '';
    document.getElementById('notify-content').value = '';
    document.getElementById('notify-modal').classList.remove('hidden');
}

function closeNotifyModal() {
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
        await Api.post('/notifications/', { title, content });
        showToast("General Notification sent to all employees!", "success");
        closeNotifyModal();
        await loadSentNotifications();
    } catch (e) {
        console.error(e);
        showToast("Failed to send notification", "error");
    }
}

async function loadSentNotifications() {
    try {
        const notifications = await Api.get('/notifications');
        const container = document.getElementById('sent-notifications-list');

        if (notifications.length === 0) {
            container.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">No notifications sent yet</div>';
            return;
        }

        container.innerHTML = notifications.map(notif => `
            <div class="p-4 hover:bg-gray-50 transition-colors flex justify-between items-center">
                <div>
                    <h4 class="text-sm font-semibold text-gray-900">${notif.title}</h4>
                    <p class="text-xs text-gray-500">${new Date(notif.created_at).toLocaleString()}</p>
                </div>
                <button onclick="viewNotifStatus(${notif.id}, '${notif.title}')" 
                    class="text-xs font-medium text-primary hover:text-primary-hover bg-primary-light px-3 py-1 rounded-full">
                    View Status
                </button>
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
        const notifications = await Api.get('/notifications');
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

async function loadPolicies() {
    showLoading('policies-list');

    try {
        const policies = await Api.get('/policies');

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

    container.innerHTML = policies.map(policy => `
        <div class="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
            <div class="flex justify-between items-start mb-3">
                <h3 class="font-semibold text-gray-900">${policy.title}</h3>
                ${policy.is_acknowledged_by_me ?
            '<span class="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Acknowledged</span>' :
            '<span class="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>'
        }
            </div>
            <p class="text-sm text-gray-600 mb-4 line-clamp-2">${policy.content.substring(0, 100)}...</p>
            <div class="flex justify-between items-center">
                <span class="text-xs text-gray-500">Created ${new Date(policy.created_at).toLocaleDateString()}</span>
                <button onclick="openPolicyModal(${policy.id})" class="text-primary hover:text-primary-hover text-sm font-medium">
                    View Policy →
                </button>
            </div>
        </div>
    `).join('');
}

function openPolicyModal(policyId) {
    const policy = allPolicies.find(p => p.id === policyId);
    if (!policy) return;

    document.getElementById('policy-modal-id').value = policyId;
    document.getElementById('policy-modal-title').innerText = policy.title;
    document.getElementById('policy-modal-content').innerText = policy.content;

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
