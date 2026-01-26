// ============================================
// EMPLOYEE DASHBOARD - FULLY FUNCTIONAL
// ============================================

let currentUser = null;
let allTasks = [];
let allConcerns = [];
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

        // Verify role is employee
        if (currentUser.role !== 'employee') {
            showToast('Access denied. Employee role required.', 'error');
            setTimeout(() => {
                Api.logout();
            }, 2000);
            return false;
        }

        // Update UI with user info
        document.getElementById('user-name').innerText = currentUser.full_name;
        const initials = currentUser.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        document.getElementById('user-avatar').innerText = initials;
        document.getElementById('user-role').innerText = 'Employee';

        return true;
    } catch (error) {
        console.error('Auth validation failed:', error);
        showToast('Session expired. Please login again.', 'error');
        setTimeout(() => window.location.href = 'login.html', 2000);
        return false;
    }
}

// ============================================
// STEP 2 & 3 - MY TASKS TAB & DASHBOARD SUMMARY
// ============================================

async function loadTasks() {
    showLoading('tasks-tbody');

    try {
        allTasks = await Api.get('/tasks');
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
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <button onclick="openUpdateTaskModal(${task.id}, '${task.status}')" 
                    class="text-primary hover:text-primary-hover font-medium"
                    ${task.status === 'completed' ? 'disabled' : ''}>
                    Update
                </button>
            </td>
        </tr>
    `}).join('');
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

        // Count pending policies
        const pendingPolicies = allPolicies.filter(p => !p.is_acknowledged_by_me).length;
        document.getElementById('stat-pending-policies').innerText = pendingPolicies;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// ============================================
// STEP 4 - CONCERNS TAB
// ============================================

async function loadConcerns() {
    showLoading('concerns-list');

    try {
        allConcerns = await Api.get('/concerns');
        renderConcerns(allConcerns);
        updateConcernsBadge();
    } catch (error) {
        console.error('Failed to load concerns:', error);
        showEmptyState('concerns-list', 'Failed to load concerns');
        showToast('Failed to load concerns', 'error');
    }
}

function renderConcerns(concerns) {
    const container = document.getElementById('concerns-list');

    if (concerns.length === 0) {
        container.innerHTML = '<div class="text-center py-12 text-gray-500">No concerns raised yet</div>';
        return;
    }

    container.innerHTML = concerns.map(concern => {
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

async function openRaiseConcernModal() {
    document.getElementById('concern-subject').value = '';
    document.getElementById('concern-description').value = '';
    await loadAllUsersForConcern();
    document.getElementById('raise-concern-modal').classList.add('active');
}

async function loadAllUsersForConcern() {
    try {
        const users = await Api.get('/auth/all-users');
        const container = document.getElementById('notify-users-list');
        const employees = users.filter(u => u.role === 'employee');
        const managers = users.filter(u => u.role === 'manager');
        const seniors = users.filter(u => u.role === 'senior');
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
        console.log('Submitting concern with data:', { subject, description, notified_user_ids: notifiedUserIds });
        const result = await Api.post('/concerns/', { subject, description, notified_user_ids: notifiedUserIds });
        console.log('Concern created:', result);
        showToast('Concern raised successfully!', 'success');
        document.getElementById('raise-concern-modal').classList.remove('active');
        await loadConcerns();
    } catch (error) {
        console.error('Failed to raise concern:', error);
        const errorMsg = error.message || error.toString();
        showToast(`Failed to raise concern: ${errorMsg}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Submit';
    }
}

async function acknowledgeConcern(concernId) {
    try {
        await Api.post(`/concerns/${concernId}/acknowledge`, {});
        showToast('Concern acknowledged!', 'success');
        await loadConcerns();
    } catch (error) {
        console.error('Failed to acknowledge:', error);
        showToast('Failed to acknowledge concern', 'error');
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
        const policies = await Api.get('/policies');

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
    }
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
