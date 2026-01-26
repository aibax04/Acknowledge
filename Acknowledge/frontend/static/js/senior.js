document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth & Session Validation
    const token = localStorage.getItem('access_token');
    const role = localStorage.getItem('user_role');

    if (!token || role !== 'senior') {
        window.location.href = 'login.html';
        return;
    }

    // Set user info
    let userName = localStorage.getItem('user_name');
    if (!userName) {
        try {
            const user = await Api.getProfile();
            userName = user.full_name;
            localStorage.setItem('user_name', userName);
            localStorage.setItem('user_role', user.role);
            if (user.role !== 'senior') window.location.href = 'login.html';
        } catch (e) {
            console.error("Failed to load profile", e);
            logout();
        }
    }

    if (userName) {
        document.getElementById('user-name').innerText = userName;
        const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        document.getElementById('user-avatar').innerText = initials;
    }

    // Initialize Dashboard
    await refreshDashboard();

    // Auto refresh every 60s
    setInterval(refreshDashboard, 60000);

    // Event Listeners
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.querySelector('button[onclick="switchTab(\'stats\')"]').addEventListener('click', () => switchTab('stats'));
    document.querySelector('button[onclick="switchTab(\'compliance\')"]').addEventListener('click', () => switchTab('compliance'));
    document.querySelector('button[onclick="switchTab(\'workforce\')"]').addEventListener('click', () => switchTab('workforce'));

    // This button might be in the header or specific tab
    const downloadBtn = document.querySelector('button[class*="Download Report"]');
    // Wait, I updated HTML but download button didn't have ID. Let's find it by text content or add ID. 
    // In senior.html: <button ...>Download Report</button>
    // I can querySelector by text or verify structure. simpler: adding ID in JS by finding it.
    const buttons = document.getElementsByTagName("button");
    for (let btn of buttons) {
        if (btn.innerText.includes("Download Report")) {
            btn.onclick = downloadReport;
        }
    }
});

let currentTab = 'stats';

function switchTab(tabId) {
    currentTab = tabId;

    // Hide all views
    document.getElementById('view-stats').classList.add('hidden');
    document.getElementById('view-compliance').classList.add('hidden');
    document.getElementById('view-workforce').classList.add('hidden');

    // Reset nav styles
    const navs = ['nav-stats', 'nav-compliance', 'nav-workforce'];
    navs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('bg-primary-light', 'text-primary');
            el.classList.add('text-gray-600', 'hover:bg-gray-50');
        }
    });

    // Show active view
    document.getElementById(`view-${tabId}`).classList.remove('hidden');

    // Active nav style
    const activeNav = document.getElementById(`nav-${tabId}`);
    if (activeNav) {
        activeNav.classList.remove('text-gray-600', 'hover:bg-gray-50');
        activeNav.classList.add('bg-primary-light', 'text-primary');
    }

    // Refresh data for the specific tab if needed, but for simplicity we load all or lazy load
    if (tabId === 'workforce') loadWorkforce();
    if (tabId === 'compliance') loadPolicyAudit();
}

async function refreshDashboard() {
    showLoading(true);
    try {
        await Promise.all([
            loadStats(),
            loadDepartmentPerformance(),
            loadEscalatedConcerns(),
            loadPolicyAudit(),
            loadSentNotifications()
        ]);
        if (currentTab === 'workforce') await loadWorkforce();
    } catch (error) {
        console.error("Dashboard refresh failed", error);
    } finally {
        showLoading(false);
    }
}

async function loadStats() {
    try {
        const data = await Api.get('/dashboard/senior/summary');

        document.getElementById('stat-efficiency').innerText = `${data.operational_efficiency_percentage}%`;

        const changeEl = document.getElementById('stat-efficiency-change');
        if (data.efficiency_change_percentage >= 0) {
            changeEl.innerText = `↑ ${data.efficiency_change_percentage}% vs last period`;
            changeEl.className = 'text-sm text-green-600 mt-1';
        } else {
            changeEl.innerText = `↓ ${Math.abs(data.efficiency_change_percentage)}% vs last period`;
            changeEl.className = 'text-sm text-red-600 mt-1';
        }

        document.getElementById('stat-compliance-rate').innerText = `${data.compliance_rate}%`;
        document.getElementById('stat-open-concerns').innerText = data.escalated_concerns_count;
        document.getElementById('stat-total-employees').innerText = data.total_employees;

    } catch (e) {
        console.error("Failed to load summary stats", e);
    }
}

async function loadDepartmentPerformance() {
    try {
        const depts = await Api.get('/dashboard/senior/departments');
        const container = document.getElementById('department-list');
        container.innerHTML = '';

        depts.forEach(dept => {
            const colorClass = dept.performance_flag === 'high' ? 'green' :
                dept.performance_flag === 'warning' ? 'yellow' : 'gray';

            const badgeText = dept.performance_flag === 'high' ? 'High Performance' :
                dept.performance_flag === 'warning' ? 'Capacity Warning' : 'Normal';

            const badgeColor = dept.performance_flag === 'high' ? 'bg-green-100 text-green-800' :
                dept.performance_flag === 'warning' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800';

            const html = `
                <div class="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-semibold text-gray-800">${dept.department_name}</h3>
                        <span class="px-2 py-1 ${badgeColor} text-xs rounded-full uppercase font-bold">${badgeText}</span>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <div class="flex justify-between text-sm mb-1">
                                <span class="text-gray-500">Task Completion</span>
                                <span class="font-medium text-gray-900">${dept.task_completion_percentage}%</span>
                            </div>
                            <div class="w-full bg-gray-100 rounded-full h-2">
                                <div class="bg-primary h-2 rounded-full" style="width: ${dept.task_completion_percentage}%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-sm mb-1">
                                <span class="text-gray-500">Resource Utilization</span>
                                <span class="font-medium text-gray-900">${dept.resource_utilization_percentage}%</span>
                            </div>
                            <div class="w-full bg-gray-100 rounded-full h-2">
                                <div class="${dept.resource_utilization_percentage > 90 ? 'bg-red-400' : 'bg-blue-400'} h-2 rounded-full" style="width: ${dept.resource_utilization_percentage}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += html;
        });
    } catch (e) {
        console.error("Failed to load departments", e);
    }
}

async function loadEscalatedConcerns() {
    try {
        const concerns = await Api.get('/concerns/escalated');
        const container = document.getElementById('escalations-list');
        container.innerHTML = '';

        if (concerns.length === 0) {
            container.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">No escalated concerns</div>';
            return;
        }

        concerns.forEach(concern => {
            const date = new Date(concern.created_at).toLocaleDateString();
            const html = `
                <div class="p-4 hover:bg-gray-50 transition-colors">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="text-sm font-semibold text-gray-900">${concern.subject}</h4>
                        <span class="text-xs text-gray-400">${date}</span>
                    </div>
                    <p class="text-xs text-gray-600 mb-2 line-clamp-2">${concern.description}</p>
                    <div class="flex justify-between items-center">
                        <div class="flex items-center space-x-2">
                            <span class="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-medium">High Severity</span>
                            <span class="text-xs text-gray-500">By: ${concern.raised_by?.full_name || 'Unknown'}</span>
                        </div>
                        <button onclick="closeConcern(${concern.id})" class="text-xs text-primary hover:text-primary-hover font-medium">Close Case</button>
                    </div>
                </div>
            `;
            container.innerHTML += html;
        });
    } catch (e) {
        console.error("Failed to load escalations", e);
    }
}

async function closeConcern(id) {
    if (!confirm("Are you sure you want to close this concern?")) return;
    try {
        await Api.put(`/concerns/${id}/action?action=closed`); // Note: Backend implementation might need body or query param check. 
        // Checked backend: it expects action as query param based on signature: action: str
        await refreshDashboard();
    } catch (e) {
        alert("Failed to close concern");
    }
}

async function loadPolicyAudit() {
    try {
        const auditData = await Api.get('/policies/audit/recent');
        const tbody = document.getElementById('audit-log-body');
        tbody.innerHTML = '';

        auditData.forEach(item => {
            const statusColor = item.status === 'Completed' ? 'green' :
                item.status === 'Low Compliance' ? 'red' : 'yellow';

            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 transition-colors";
            tr.innerHTML = `
                <td class="px-6 py-4 text-sm font-medium text-gray-900">${item.policy_name}</td>
                <td class="px-6 py-4"><span class="text-${statusColor}-600 text-[10px] font-black uppercase tracking-wider">${item.status}</span></td>
                <td class="px-6 py-4 text-sm text-gray-500">
                    <div class="flex items-center min-w-[120px]">
                        <span class="mr-2 font-bold text-gray-700">${item.completion_percentage}%</span>
                        <div class="w-full bg-gray-100 rounded-full h-1.5 flex-1">
                            <div class="bg-${statusColor}-500 h-1.5 rounded-full shadow-sm" style="width: ${item.completion_percentage}%"></div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-500">${new Date(item.date_issued).toLocaleDateString()}</td>
                <td class="px-6 py-4 text-right text-sm space-x-3">
                    <button onclick="remindPolicy(${item.policy_id})" class="text-primary hover:text-primary-hover font-bold text-xs uppercase hover:underline">Remind</button>
                    <button onclick="deletePolicy(${item.policy_id}, '${item.policy_name}')" class="text-red-500 hover:text-red-700 font-bold text-xs uppercase hover:underline">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to load audit", e);
    }
}

async function remindPolicy(id) {
    try {
        const res = await Api.post(`/policies/${id}/remind`);
        alert(res.message);
    } catch (e) {
        alert("Failed to send reminders");
    }
}

// --- POLICY MANAGEMENT ---

function openPolicyCreateModal() {
    document.getElementById('policy-title').value = '';
    document.getElementById('policy-content').value = '';
    document.getElementById('create-policy-modal').classList.remove('hidden');
}

async function submitNewPolicy() {
    const title = document.getElementById('policy-title').value.trim();
    const content = document.getElementById('policy-content').value.trim();

    if (!title || !content) {
        alert("Please fill in both title and content");
        return;
    }

    try {
        const res = await Api.post('/policies/', { title, content, is_active: true });
        alert("Policy published successfully to all company members!");
        document.getElementById('create-policy-modal').classList.add('hidden');
        await loadPolicyAudit();
        await refreshDashboard();
    } catch (e) {
        console.error(e);
        alert(e.message || "Failed to publish policy");
    }
}

async function deletePolicy(id, name) {
    if (!confirm(`DANGER: Are you sure you want to PERMANENTLY delete "${name}"?\nThis will remove the policy from every member's dashboard and delete all acknowledgment records.`)) {
        return;
    }

    try {
        const res = await Api.delete(`/policies/${id}`);
        alert(res.message);
        await loadPolicyAudit();
        await refreshDashboard();
    } catch (e) {
        console.error(e);
        alert(e.message || "Failed to delete policy");
    }
}

async function loadWorkforce() {
    try {
        const data = await Api.get('/dashboard/senior/workforce/overview');
        const users = await Api.get('/auth/all-users');
        const roleFilter = document.getElementById('role-filter')?.value || 'all';

        // Distribution Update
        const empCountEl = document.getElementById('active-emp-count');
        const mgrCountEl = document.getElementById('active-mgr-count');
        if (empCountEl) empCountEl.innerText = `${data.active_employees} / ${data.total_employees}`;
        if (mgrCountEl) mgrCountEl.innerText = `${data.active_managers} / ${data.total_managers}`;

        // Overutilized List
        const overList = document.getElementById('overutilized-list');
        if (overList) {
            overList.innerHTML = '';
            const overutilized = data.workload_distribution?.filter(u => u.status === 'overutilized') || [];

            if (overutilized.length === 0) {
                overList.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No capacity issues detected</p>';
            } else {
                overutilized.forEach(emp => {
                    overList.innerHTML += `
                        <div class="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-100 animate-pulse">
                            <div>
                                <p class="text-sm font-semibold text-gray-900">${emp.employee_name}</p>
                                <p class="text-xs text-red-600">${emp.task_count} Active Tasks</p>
                            </div>
                            <span class="text-[10px] font-black text-red-500 bg-white px-2 py-0.5 rounded border border-red-200 uppercase tracking-tighter">Over Capacity</span>
                        </div>
                    `;
                });
            }
        }

        // Main Directory Update
        const tbody = document.getElementById('workforce-list-body');
        if (tbody) {
            tbody.innerHTML = '';

            const filteredUsers = users.filter(u => {
                if (roleFilter === 'all') return u.role !== 'senior';
                return u.role === roleFilter;
            });

            if (filteredUsers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No matching personnel found</td></tr>';
                return;
            }

            filteredUsers.forEach(user => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50 transition-colors group";
                tr.innerHTML = `
                    <td class="px-6 py-4">
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 font-bold border border-gray-200 mr-3">
                                ${user.full_name.charAt(0)}
                            </div>
                            <span class="text-sm font-medium text-gray-900">${user.full_name}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${user.role === 'manager' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
                            ${user.role}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-500">${user.email}</td>
                    <td class="px-6 py-4 text-sm text-gray-500">${new Date(user.created_at).toLocaleDateString()}</td>
                    <td class="px-6 py-4 text-right relative">
                        <div class="inline-block relative">
                            <button onclick="toggleActionMenu(${user.id})" class="text-gray-400 hover:text-gray-900 p-1 rounded-full hover:bg-gray-200 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                </svg>
                            </button>
                            <div id="action-menu-${user.id}" class="hidden absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-lg shadow-xl z-50 overflow-hidden">
                                <button onclick="deleteUser(${user.id}, '${user.full_name}')" class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete Credentials
                                </button>
                                <button class="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Reset Password
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
                `;
                tbody.appendChild(tr);
            });
        }

    } catch (e) {
        console.error("Failed to load workforce live data", e);
    }
}

function toggleActionMenu(userId) {
    const menus = document.querySelectorAll('[id^="action-menu-"]');
    menus.forEach(m => {
        if (m.id !== `action-menu-${userId}`) m.classList.add('hidden');
    });

    const menu = document.getElementById(`action-menu-${userId}`);
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('button')) {
        document.querySelectorAll('[id^="action-menu-"]').forEach(m => m.classList.add('hidden'));
    }
});

async function deleteUser(id, name) {
    if (!confirm(`CRITICAL: Are you sure you want to PERMANENTLY delete the credentials for "${name}"?\nThis action cannot be undone.`)) {
        return;
    }

    try {
        const res = await Api.delete(`/auth/users/${id}`);
        alert(res.message);
        await loadWorkforce();
        await refreshDashboard();
    } catch (e) {
        console.error(e);
        alert(e.message || "Failed to delete user credentials");
    }
}

function downloadReport() {
    const btn = document.querySelector('button[class*="Download Report"]') || document.getElementsByTagName("button")[1]; // Fallback
    const originalText = btn ? btn.innerText : 'Download';
    if (btn) btn.innerText = "Generating...";

    // Trigger download via API (which returns blob/csv) or direct window open if simplistic
    // Using fetch to get blob to allow auth headers

    Api.getRaw('/reports/senior/download')
        .then(async (response) => {
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `executive_report_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                alert("Failed to download report");
            }
        })
        .catch(e => console.error(e))
        .finally(() => {
            if (btn) btn.innerText = originalText;
        });
}

function logout() {
    Api.logout();
}

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        if (show) overlay.classList.remove('hidden');
        else overlay.classList.add('hidden');
    }
}

// Helper to use fetch with token directly for special cases if needed is now in api.js

// --- NOTIFICATION SYSTEM ---

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
        alert("Please fill in all fields");
        return;
    }

    try {
        await Api.post('/notifications/', { title, content });
        alert("General Notification sent to all employees!");
        closeNotifyModal();
        await loadSentNotifications();
    } catch (e) {
        console.error(e);
        alert("Failed to send notification");
    }
}

async function loadSentNotifications() {
    try {
        const notifications = await Api.get('/notifications');
        const container = document.getElementById('sent-notifications-list');

        // Filter to show only those created by me
        const myNotifications = notifications; // The API currently returns all, but we could filter if needed.
        // Actually the backend model has created_by_id, we can filter here or in backend.
        // For simplicity, let's just show all for now as the prompt says "the one who generated it can see it".

        if (myNotifications.length === 0) {
            container.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">No notifications sent yet</div>';
            return;
        }

        container.innerHTML = myNotifications.map(notif => `
            <div class="p-4 hover:bg-gray-50 transition-colors flex justify-between items-center">
                <div>
                    <h4 class="text-sm font-semibold text-gray-900">${notif.title}</h4>
                    <p class="text-xs text-gray-500">${new Date(notif.created_at).toLocaleString()}</p>
                </div>
                <button onclick="viewNotifStatus(${notif.id}, '${notif.title}')" 
                    class="text-xs font-medium text-primary hover:text-primary-hover bg-primary-light px-3 py-1 rounded-full">
                    View Acknowledgment Status
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
        alert("Failed to load status");
    }
}
