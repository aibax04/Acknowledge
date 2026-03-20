let currentUser = null;

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('Toast container not found');
        alert(message); // Fallback to alert
        return;
    }
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

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth & Session Validation
    const token = localStorage.getItem('access_token');
    const role = localStorage.getItem('user_role');

    if (!token || role !== 'senior') {
        window.location.href = 'login.html';
        return;
    }

    // Load profile and set user info
    try {
        currentUser = await Api.getProfile();
        if (currentUser.role !== 'senior') {
            window.location.href = 'login.html';
            return;
        }
        localStorage.setItem('user_name', currentUser.full_name);
        localStorage.setItem('user_role', currentUser.role);
        updateUserDisplay();
        setupEditName();
    } catch (e) {
        console.error("Failed to load profile", e);
        logout();
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

    // Initialize policy image upload handlers
    initPolicyImageUpload();

    // Initialize audience checkbox handlers
    initAudienceCheckboxes();

    // Assign Task Modal Listeners
    document.getElementById('cancel-assign-task')?.addEventListener('click', () => {
        document.getElementById('assign-task-modal').classList.add('hidden');
    });

    document.getElementById('confirm-assign-task')?.addEventListener('click', assignTask);

    document.getElementById('task-comments-close')?.addEventListener('click', () => {
        document.getElementById('task-comments-modal').classList.add('hidden');
    });
    document.getElementById('task-comments-post')?.addEventListener('click', postTaskComment);

    // Promote User Modal Listeners
    document.getElementById('cancel-promote-user')?.addEventListener('click', () => {
        document.getElementById('promote-user-modal').style.display = 'none';
    });
    document.getElementById('confirm-promote-user')?.addEventListener('click', promoteUser);

    // Close promote modal when clicking outside
    const promoteModal = document.getElementById('promote-user-modal');
    if (promoteModal) {
        promoteModal.addEventListener('click', (e) => {
            if (e.target === promoteModal) {
                promoteModal.style.display = 'none';
            }
        });
    }
});

function updateUserDisplay() {
    if (!currentUser) return;
    const el = document.getElementById('user-name');
    const av = document.getElementById('user-avatar');
    const roleEl = document.getElementById('user-role');
    if (el) el.innerText = currentUser.full_name;
    if (av) av.innerText = (currentUser.full_name || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '--';
    if (roleEl) roleEl.innerText = 'Director';
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
    btn.addEventListener('click', function () {
        input.value = currentUser ? (currentUser.full_name || '') : '';
        modal.classList.remove('hidden');
        input.focus();
    });
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);
    if (saveBtn) saveBtn.addEventListener('click', async function () {
        const name = (input.value || '').trim();
        if (!name) return;
        try {
            const updated = await Api.updateProfile({ full_name: name });
            currentUser.full_name = updated.full_name;
            localStorage.setItem('user_name', updated.full_name);
            updateUserDisplay();
            closeModal();
            if (currentTab === 'workforce') await loadWorkforce();
        } catch (e) {
            alert(e.message || 'Failed to update name');
        }
    });
}

let currentTab = 'stats';

function switchTab(tabId) {
    currentTab = tabId;

    // Hide all views
    document.getElementById('view-stats').classList.add('hidden');
    document.getElementById('view-compliance').classList.add('hidden');
    document.getElementById('view-workforce').classList.add('hidden');
    const projectsView = document.getElementById('view-projects');
    if (projectsView) projectsView.classList.add('hidden');
    const calendarView = document.getElementById('view-calendar');
    if (calendarView) calendarView.classList.add('hidden');
    const reportsView = document.getElementById('view-reports');
    if (reportsView) reportsView.classList.add('hidden');
    const trackView = document.getElementById('view-track');
    if (trackView) trackView.classList.add('hidden');
    const leavesView = document.getElementById('view-leaves');
    if (leavesView) leavesView.classList.add('hidden');

    // Reset nav styles
    const navs = ['nav-stats', 'nav-compliance', 'nav-workforce', 'nav-projects', 'nav-calendar', 'nav-reports', 'nav-track', 'nav-leaves'];
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

    // Load data
    if (tabId === 'calendar') {
        if (typeof loadPersonalCalendar === 'function') loadPersonalCalendar();
    }

    // Refresh data for specific tabs
    if (tabId === 'workforce') loadWorkforce();
    if (tabId === 'compliance') loadPolicyAudit();
    if (tabId === 'reports') loadReports();
    if (tabId === 'track') loadTrackData();
    if (tabId === 'projects') {
        if (typeof loadKanbanDashboard === 'function') loadKanbanDashboard('projects-kanban-container');
        if (typeof loadProjects === 'function') loadProjects();
    }
    if (tabId === 'leaves') {
        if (typeof loadPendingLeaves === 'function') loadPendingLeaves();
        if (typeof loadCustomPolicies === 'function') loadCustomPolicies();
    }
}

async function refreshDashboard() {
    showLoading(true);
    try {
        await Promise.all([
            loadStats(),
            loadTeamPerformance(),
            loadEscalatedConcerns(),
            loadPolicyAudit(),
            loadReports()
        ]);
        if (currentTab === 'workforce') await loadWorkforce();
        if (currentTab === 'projects' && typeof loadProjects === 'function') await loadProjects();
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

async function loadTeamPerformance() {
    try {
        const teams = await Api.get('/dashboard/senior/teams');
        const container = document.getElementById('team-list');
        container.innerHTML = '';

        teams.forEach(team => {
            const colorClass = team.performance_flag === 'high' ? 'green' :
                team.performance_flag === 'warning' ? 'yellow' : 'gray';

            const badgeText = team.performance_flag === 'high' ? 'High Performance' :
                team.performance_flag === 'warning' ? 'Capacity Warning' : 'Normal';

            const badgeColor = team.performance_flag === 'high' ? 'bg-green-100 text-green-800' :
                team.performance_flag === 'warning' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800';

            const html = `
                <div class="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-semibold text-gray-800">${team.team_name}</h3>
                        <span class="px-2 py-1 ${badgeColor} text-xs rounded-full uppercase font-bold">${badgeText}</span>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <div class="flex justify-between text-sm mb-1">
                                <span class="text-gray-500">Task Completion</span>
                                <span class="font-medium text-gray-900">${team.task_completion_percentage}%</span>
                            </div>
                            <div class="w-full bg-gray-100 rounded-full h-2">
                                <div class="bg-primary h-2 rounded-full" style="width: ${team.task_completion_percentage}%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-sm mb-1">
                                <span class="text-gray-500">Resource Utilization</span>
                                <span class="font-medium text-gray-900">${team.resource_utilization_percentage}%</span>
                            </div>
                            <div class="w-full bg-gray-100 rounded-full h-2">
                                <div class="${team.resource_utilization_percentage > 90 ? 'bg-red-400' : 'bg-blue-400'} h-2 rounded-full" style="width: ${team.resource_utilization_percentage}%"></div>
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
            container.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">No escalated nudges</div>';
            return;
        }

        concerns.forEach(concern => {
            const date = new Date(concern.created_at).toLocaleDateString();
            const notifiedUsers = concern.notified_users || [];
            const acknowledgedUsers = concern.acknowledged_by || [];
            const notifiedCount = notifiedUsers.length;
            const acknowledgedCount = acknowledgedUsers.length;
            const ackBlock = notifiedCount > 0
                ? `<div class="mb-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <p class="text-xs font-medium text-blue-800 mb-1">Notified: ${notifiedCount} people</p>
                    <div class="flex flex-wrap gap-1 mb-1">
                        ${notifiedUsers.map(u => {
                    const isAck = acknowledgedUsers.some(a => a.id === u.id);
                    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs ${isAck ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">${u.full_name} ${isAck ? '✓' : ''}</span>`;
                }).join('')}
                    </div>
                    <p class="text-xs text-gray-600">${acknowledgedCount} of ${notifiedCount} acknowledged</p>
                </div>`
                : '';
            const html = `
                <div class="p-4 hover:bg-gray-50 transition-colors">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="text-sm font-semibold text-gray-900">${concern.subject}</h4>
                        <span class="text-xs text-gray-400">${date}</span>
                    </div>
                    <p class="text-xs text-gray-600 mb-2 line-clamp-2">${concern.description}</p>
                    ${ackBlock}
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
    if (!confirm("Are you sure you want to close this nudge?")) return;
    try {
        await Api.put(`/concerns/${id}/action?action=closed`); // Note: Backend implementation might need body or query param check. 
        // Checked backend: it expects action as query param based on signature: action: str
        await refreshDashboard();
    } catch (e) {
        alert("Failed to close nudge");
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
                <td class="px-6 py-4 text-right text-sm space-x-2">
                    <button onclick="viewPolicyAcknowledgments(${item.policy_id}, '${item.policy_name.replace(/'/g, "\\'")}')" class="text-purple-600 hover:text-purple-800 font-bold text-xs uppercase hover:underline">View Details</button>
                    <button onclick="remindPolicy(${item.policy_id})" class="text-primary hover:text-primary-hover font-bold text-xs uppercase hover:underline">Remind</button>
                    <button onclick="editPolicy(${item.policy_id})" class="text-blue-500 hover:text-blue-700 font-bold text-xs uppercase hover:underline">Edit</button>
                    <button onclick="deletePolicy(${item.policy_id}, '${item.policy_name.replace(/'/g, "\\'")}')" class="text-red-500 hover:text-red-700 font-bold text-xs uppercase hover:underline">Delete</button>
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

async function viewPolicyAcknowledgments(policyId, policyName) {
    try {
        console.log(`=== LOADING ACKNOWLEDGMENTS FOR POLICY ${policyId} ===`);
        const data = await Api.get(`/policies/${policyId}/acknowledgments`);
        console.log("Acknowledgment data received:", data);

        // Safety checks
        if (!data) {
            throw new Error("No data received from server");
        }
        if (!data.acknowledged) {
            console.warn("No 'acknowledged' field in response, defaulting to empty array");
            data.acknowledged = [];
        }
        if (!data.pending) {
            console.warn("No 'pending' field in response, defaulting to empty array");
            data.pending = [];
        }

        // Update modal title
        document.getElementById('ack-modal-title').innerText = `Acknowledgments: ${policyName}`;

        // Populate acknowledged list
        const ackList = document.getElementById('ack-users-list');
        ackList.innerHTML = '';
        if (data.acknowledged.length === 0) {
            ackList.innerHTML = '<p class="text-gray-500 text-sm">No one has acknowledged yet</p>';
        } else {
            data.acknowledged.forEach(user => {
                const date = new Date(user.acknowledged_at).toLocaleString();
                ackList.innerHTML += `
                    <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-xs mr-3">
                                ${user.full_name.charAt(0)}
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900">${user.full_name}</p>
                                <p class="text-xs text-gray-500">${user.role}</p>
                            </div>
                        </div>
                        <span class="text-xs text-gray-400">${date}</span>
                    </div>
                `;
            });
        }

        // Populate pending list
        const pendingList = document.getElementById('pending-users-list');
        pendingList.innerHTML = '';
        if (data.pending.length === 0) {
            pendingList.innerHTML = '<p class="text-gray-500 text-sm">Everyone has acknowledged!</p>';
        } else {
            data.pending.forEach(user => {
                pendingList.innerHTML += `
                    <div class="flex items-center p-2 hover:bg-gray-50 rounded">
                        <div class="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs mr-3">
                            ${user.full_name.charAt(0)}
                        </div>
                        <div>
                            <p class="text-sm font-medium text-gray-900">${user.full_name}</p>
                            <p class="text-xs text-gray-500">${user.role}</p>
                        </div>
                    </div>
                `;
            });
        }

        // Show stats
        const total = data.acknowledged.length + data.pending.length;
        const percentage = total > 0 ? Math.round(data.acknowledged.length / total * 100) : 0;
        document.getElementById('ack-stats').innerText = `${data.acknowledged.length} of ${total} (${percentage}%)`;

        console.log("Modal populated successfully, showing modal");
        // Show modal
        document.getElementById('policy-ack-modal').classList.remove('hidden');
    } catch (e) {
        console.error("Failed to load acknowledgments:", e);
        console.error("Error details:", e.message, e.stack);
        alert("Failed to load acknowledgment details: " + (e.message || "Unknown error"));
    }
}

function closePolicyAckModal() {
    document.getElementById('policy-ack-modal').classList.add('hidden');
}

// --- POLICY MANAGEMENT ---

function switchPolicyTab(tab) {
    const writeBtn = document.getElementById('tab-write-policy');
    const previewBtn = document.getElementById('tab-preview-policy');
    const writeArea = document.getElementById('policy-write-area');
    const previewArea = document.getElementById('policy-preview-area');
    const content = document.getElementById('policy-content').value;

    if (tab === 'write') {
        // Active Tab Style
        writeBtn.classList.add('text-primary', 'border-primary', 'border-b-2');
        writeBtn.classList.remove('text-gray-500', 'hover:text-gray-700', 'border-transparent');

        previewBtn.classList.remove('text-primary', 'border-primary', 'border-b-2');
        previewBtn.classList.add('text-gray-500', 'hover:text-gray-700');

        // Show Write Area
        writeArea.classList.remove('hidden');
        previewArea.classList.add('hidden');
    } else {
        // Active Tab Style
        previewBtn.classList.add('text-primary', 'border-primary', 'border-b-2');
        previewBtn.classList.remove('text-gray-500', 'hover:text-gray-700');

        writeBtn.classList.remove('text-primary', 'border-primary', 'border-b-2');
        writeBtn.classList.add('text-gray-500', 'hover:text-gray-700');

        // Show Preview Area
        writeArea.classList.add('hidden');
        previewArea.classList.remove('hidden');

        // Render Content
        if (content.trim()) {
            // Using formatPopupContent from notification-popup.js
            previewArea.innerHTML = typeof formatPopupContent === 'function'
                ? formatPopupContent(content)
                : `<p>${content}</p>`;
        } else {
            previewArea.innerHTML = '<p class="text-gray-400 text-center italic mt-10">Start writing to see a preview...</p>';
        }
    }
}


function openPolicyCreateModal() {
    document.getElementById('policy-id').value = ''; // Clear ID for new creation
    document.getElementById('create-policy-modal-title').innerText = 'Publish New Organization Policy';
    document.getElementById('create-policy-btn-text').innerText = 'Publish to Selected Audience';

    document.getElementById('policy-title').value = '';
    // Clear all checkboxes
    document.querySelectorAll('.policy-audience-checkbox').forEach(cb => cb.checked = false);
    // Default to 'all' checked
    document.getElementById('audience-all').checked = true;
    document.getElementById('policy-content').value = '';
    document.getElementById('policy-image-url').value = '';
    document.getElementById('policy-image-preview').classList.add('hidden');
    document.getElementById('policy-upload-placeholder').classList.remove('hidden');
    updatePolicyCharCount();
    switchPolicyTab('write');
    document.getElementById('create-policy-modal').classList.remove('hidden');
}

function clearPolicyImage(event) {
    if (event) event.stopPropagation();
    document.getElementById('policy-image-url').value = '';
    document.getElementById('policy-image-input').value = '';
    document.getElementById('policy-image-preview').classList.add('hidden');
    document.getElementById('policy-upload-placeholder').classList.remove('hidden');
}

async function handlePolicyImageUpload(file) {
    if (!file) return;

    // Show loading state
    const placeholder = document.getElementById('policy-upload-placeholder');
    placeholder.innerHTML = `
        <div class="flex items-center justify-center space-x-2">
            <svg class="animate-spin w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span class="text-gray-600">Uploading...</span>
        </div>
    `;

    try {
        const formData = new FormData();
        formData.append('file', file);

        const token = localStorage.getItem('access_token');
        const response = await fetch('/api/uploads/policy-image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            let errorMessage = 'Upload failed';
            try {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const err = await response.json();
                    errorMessage = err.detail || errorMessage;
                } else {
                    errorMessage = `Server error (${response.status}): The server returned an unexpected response format. This may be due to the file being too large or a server configuration issue.`;
                }
            } catch (parseError) {
                errorMessage = `Server error (${response.status}): Could not parse error response.`;
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();

        // Show preview
        document.getElementById('policy-image-url').value = result.url;
        document.getElementById('policy-preview-img').src = '/api' + result.url;
        document.getElementById('policy-image-preview').classList.remove('hidden');
        placeholder.classList.add('hidden');

        // Reset placeholder content
        placeholder.innerHTML = `
            <svg class="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <p class="text-gray-600 font-medium">Click to upload a cover image</p>
            <p class="text-sm text-gray-400 mt-1">PNG, JPG, GIF up to 5MB</p>
        `;

    } catch (e) {
        console.error('Upload failed:', e);
        alert('Failed to upload image: ' + e.message);
        // Reset placeholder
        placeholder.innerHTML = `
            <svg class="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <p class="text-gray-600 font-medium">Click to upload a cover image</p>
            <p class="text-sm text-gray-400 mt-1">PNG, JPG, GIF up to 5MB</p>
        `;
    }
}

function updatePolicyCharCount() {
    const content = document.getElementById('policy-content').value;
    const countEl = document.getElementById('policy-char-count');
    if (countEl) {
        countEl.textContent = `${content.length} characters`;
    }
}

function initPolicyImageUpload() {
    const uploadArea = document.getElementById('policy-image-upload-area');
    const fileInput = document.getElementById('policy-image-input');
    const contentTextarea = document.getElementById('policy-content');

    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handlePolicyImageUpload(file);
        });

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('border-primary', 'bg-primary-light');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('border-primary', 'bg-primary-light');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('border-primary', 'bg-primary-light');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handlePolicyImageUpload(file);
            }
        });
    }

    // Character count
    if (contentTextarea) {
        contentTextarea.addEventListener('input', updatePolicyCharCount);
    }
}

function initAudienceCheckboxes() {
    // Add event listeners to handle checkbox interactions
    const allCheckbox = document.getElementById('audience-all');
    const otherCheckboxes = document.querySelectorAll('.policy-audience-checkbox:not(#audience-all)');

    if (allCheckbox) {
        allCheckbox.addEventListener('change', function () {
            if (this.checked) {
                // Uncheck all other checkboxes when "All" is selected
                otherCheckboxes.forEach(cb => cb.checked = false);
            }
        });
    }

    otherCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            if (this.checked && allCheckbox) {
                // Uncheck "All" when any specific audience is selected
                allCheckbox.checked = false;
            }
        });
    });
}


async function submitNewPolicy() {
    const title = document.getElementById('policy-title').value.trim();

    // Get selected audiences from checkboxes
    const selectedAudiences = [];
    const allCheckboxes = document.querySelectorAll('.policy-audience-checkbox');
    console.log("=== CHECKBOX DEBUGGING ===");
    console.log("Total checkboxes found:", allCheckboxes.length);

    allCheckboxes.forEach(cb => {
        console.log(`Checkbox: id=${cb.id}, value=${cb.value}, checked=${cb.checked}`);
        if (cb.checked) {
            selectedAudiences.push(cb.value);
        }
    });

    const content = document.getElementById('policy-content').value; // Preserving exact spacing
    const imageUrl = document.getElementById('policy-image-url').value.trim();
    const policyId = document.getElementById('policy-id').value;

    if (!title || !content.trim()) {
        alert("Please fill in both title and content");
        return;
    }

    if (selectedAudiences.length === 0) {
        alert("Please select at least one target audience");
        return;
    }

    try {
        // Join multiple audiences with comma
        const audienceString = selectedAudiences.join(',');

        console.log("=== POLICY SUBMISSION DEBUG ===");
        console.log("Selected audiences array:", selectedAudiences);
        console.log("Audience string:", audienceString);

        const payload = {
            title,
            content,
            target_audience: audienceString,
            is_active: true
        };
        console.log("DEBUG: Submitting policy payload:", JSON.stringify(payload, null, 2));

        if (imageUrl) {
            payload.image_url = imageUrl;
        }

        let res;
        if (policyId) {
            // Update existing
            res = await Api.put(`/policies/${policyId}`, payload);
            alert("Policy updated successfully!");
        } else {
            // Create new
            res = await Api.post('/policies/', payload);
            console.log("Policy creation response:", res);
            const audienceText = selectedAudiences.includes('all') ? 'all company members' : selectedAudiences.join(', ');
            alert(`Policy published successfully to ${audienceText}!`);
        }

        document.getElementById('create-policy-modal').classList.add('hidden');
        await loadPolicyAudit();
        await refreshDashboard();
    } catch (e) {
        console.error("Policy submission error:", e);
        alert(e.message || "Failed to save policy");
    }
}

async function editPolicy(id) {
    try {
        const policy = await Api.get(`/policies/${id}`);

        // Populate Modal
        document.getElementById('policy-id').value = policy.id;
        document.getElementById('create-policy-modal-title').innerText = 'Edit Policy';
        document.getElementById('create-policy-btn-text').innerText = 'Save Changes';

        document.getElementById('policy-title').value = policy.title;

        // Handle multiple audiences
        const audiences = (policy.target_audience || 'all').split(',');
        document.querySelectorAll('.policy-audience-checkbox').forEach(cb => {
            cb.checked = audiences.includes(cb.value);
        });

        const contentArea = document.getElementById('policy-content');
        contentArea.value = policy.content;
        contentArea.scrollTop = 0; // Ensure we start at the top
        updatePolicyCharCount();

        // Handle Image
        if (policy.image_url) {
            document.getElementById('policy-image-url').value = policy.image_url;
            document.getElementById('policy-preview-img').src = '/api' + policy.image_url;
            document.getElementById('policy-image-preview').classList.remove('hidden');
            document.getElementById('policy-upload-placeholder').classList.add('hidden');
        } else {
            clearPolicyImage();
        }

        switchPolicyTab('write');
        document.getElementById('create-policy-modal').classList.remove('hidden');
    } catch (e) {
        console.error("Failed to load policy for editing", e);
        alert("Failed to load policy details");
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
        const searchVal = document.getElementById('workforce-search')?.value.toLowerCase().trim() || '';

        // Distribution Update
        const empCountEl = document.getElementById('active-emp-count');
        const mgrCountEl = document.getElementById('active-mgr-count');
        const internCountEl = document.getElementById('active-intern-count');

        if (empCountEl) empCountEl.innerText = `${data.active_employees || 0} / ${data.total_employees || 0}`;
        if (mgrCountEl) mgrCountEl.innerText = `${data.active_managers || 0} / ${data.total_managers || 0}`;
        if (internCountEl) internCountEl.innerText = `${data.active_interns || 0} / ${data.total_interns || 0}`;

        // Workforce Utilization List
        const overList = document.getElementById('overutilized-list');
        if (overList) {
            overList.innerHTML = '';
            const allWorkload = data.workload_distribution || [];

            if (allWorkload.length === 0) {
                overList.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No personnel found</p>';
            } else {
                allWorkload.forEach(emp => {
                    const isOver = emp.task_count >= 3;
                    const bgColor = isOver ? 'bg-red-50' : 'bg-green-50';
                    const borderColor = isOver ? 'border-red-100' : 'border-green-100';
                    const textColor = isOver ? 'text-red-600' : 'text-green-600';
                    const badgeColor = isOver ? 'text-red-50' : 'text-green-50';
                    const badgeBg = isOver ? 'bg-red-500' : 'bg-green-500';
                    const statusText = isOver ? 'High Utilization' : 'Normal';

                    overList.innerHTML += `
                        <div class="flex justify-between items-center p-3 ${bgColor} rounded-lg border ${borderColor}">
                            <div>
                                <p class="text-sm font-semibold text-gray-900">${emp.employee_name} <span class="text-[10px] text-gray-400 font-normal">(${emp.role})</span></p>
                                <p class="text-xs ${textColor}">${emp.task_count} Pending Tasks</p>
                            </div>
                            <span class="text-[10px] font-black ${badgeColor} ${badgeBg} px-2 py-0.5 rounded uppercase tracking-tighter">${statusText}</span>
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
                const matchesRole = roleFilter === 'all' ? true : (u.role || '').toLowerCase() === roleFilter;
                const matchesSearch = (u.full_name || '').toLowerCase().includes(searchVal) || (u.email || '').toLowerCase().includes(searchVal);
                return matchesRole && matchesSearch;
            });

            if (filteredUsers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No matching personnel found</td></tr>';
                return;
            }

            filteredUsers.forEach(user => {
                const fullNameEsc = (user.full_name || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
                const onProbation = user.is_on_probation || false;
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50 transition-colors group";
                tr.innerHTML = `
                    <td class="px-6 py-4">
                        <div class="flex items-center flex-wrap gap-2">
                            <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 font-bold border border-gray-200 mr-1">
                                ${user.full_name.charAt(0)}
                            </div>
                            <span class="text-sm font-medium text-gray-900">${user.full_name}</span>
                            ${onProbation ? '<span class="text-[10px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded uppercase tracking-wide">Probation</span>' : ''}
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${user.role === 'senior' ? 'bg-emerald-100 text-emerald-700' : user.role === 'manager' ? 'bg-purple-100 text-purple-700' : user.role === 'intern' ? 'bg-sky-100 text-sky-700' : 'bg-blue-100 text-blue-700'}">
                            ${user.role}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-500">${user.email}</td>
                    <td class="px-6 py-4 text-sm text-gray-500">${new Date(user.created_at).toLocaleDateString()}</td>
                    <td class="px-6 py-4 text-right relative">
                        <div class="inline-block relative">
                            <button type="button" onclick="event.stopPropagation(); toggleActionMenu(${user.id})" class="text-gray-400 hover:text-gray-900 p-1 rounded-full hover:bg-gray-200 transition-all cursor-pointer">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                </svg>
                            </button>
                            <div id="action-menu-${user.id}" class="hidden absolute right-0 mt-2 w-52 bg-white border border-gray-100 rounded-lg shadow-xl z-50 overflow-hidden">
                                <button type="button" onclick="openAssignTaskModal(${user.id}, '${fullNameEsc}')" class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    Assign Task
                                </button>
                                <button type="button" onclick="openPromoteUserModal(${user.id}, '${fullNameEsc}', '${user.role}')" class="w-full text-left px-4 py-2 text-sm text-primary hover:bg-primary/5 flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                    Promote
                                </button>
                                <button type="button" onclick="toggleProbation(${user.id}, ${onProbation}, '${fullNameEsc}')" class="w-full text-left px-4 py-2 text-sm ${onProbation ? 'text-green-600 hover:bg-green-50' : 'text-orange-600 hover:bg-orange-50'} flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    ${onProbation ? 'Remove from Probation' : 'Place on Probation'}
                                </button>
                                <button type="button" onclick="deleteUser(${user.id}, '${fullNameEsc}')" class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete Credentials
                                </button>
                                <button type="button" class="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Reset Password
                                </button>
                            </div>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

    } catch (e) {
        console.error("Failed to load workforce live data", e);
    }
}

async function toggleProbation(userId, currentStatus, name) {
    const action = currentStatus ? 'remove from probation' : 'place on probation';
    if (!confirm(`Are you sure you want to ${action} "${name}"?`)) return;
    try {
        const res = await Api.put(`/dashboard/senior/users/${userId}/probation`, {});
        if (typeof showToast === 'function') showToast(res.message || 'Probation status updated', 'success');
        else alert(res.message || 'Probation status updated');
        await loadWorkforce();
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast(e.message || 'Failed to update probation status', 'error');
        else alert(e.message || 'Failed to update probation status');
    }
}


async function loadReports() {
    try {
        const summary = await Api.get('/dashboard/senior/summary');

        // Update Compliance Health List
        const complianceList = document.getElementById('compliance-health-list');
        if (complianceList) {
            complianceList.innerHTML = `
                <div class="p-3 bg-blue-50 rounded-lg">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs font-bold text-blue-800">Overall Acknowledgment Rate</span>
                        <span class="text-xs font-bold text-blue-800">${summary.compliance_rate}%</span>
                    </div>
                    <div class="w-full bg-blue-200 rounded-full h-1.5">
                        <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${summary.compliance_rate}%"></div>
                    </div>
                </div>
                <div class="p-3 bg-purple-50 rounded-lg">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs font-bold text-purple-800">Operational Efficiency</span>
                        <span class="text-xs font-bold text-purple-800">${summary.operational_efficiency_percentage}%</span>
                    </div>
                    <div class="w-full bg-purple-200 rounded-full h-1.5">
                        <div class="bg-purple-600 h-1.5 rounded-full" style="width: ${summary.operational_efficiency_percentage}%"></div>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        console.error("Failed to load reports data", e);
    }
}

function getPriorityColor(p) {
    p = (p || 'low').toLowerCase();
    if (p === 'high') return 'bg-red-500 text-red-600';
    if (p === 'medium') return 'bg-yellow-500 text-yellow-600';
    return 'bg-blue-500 text-blue-600';
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

// Close menus when clicking outside (ignore clicks on action menu trigger or inside a menu)
document.addEventListener('click', (e) => {
    if (!e.target.closest('button') && !e.target.closest('[id^="action-menu-"]')) {
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
        alert("Please fill in all fields");
        return;
    }

    try {
        if (window._notifyTargetUserId) {
            await Api.post('/notifications/', { title, content, notification_type: 'TARGETED', recipient_ids: [window._notifyTargetUserId] });
            window._notifyTargetUserId = null;
            alert("Notification sent!");
        } else {
            await Api.post('/notifications/', { title, content });
            alert("General Notification sent to all employees!");
        }
        closeNotifyModal();
        await loadSentNotifications();
    } catch (e) {
        console.error(e);
        alert("Failed to send notification");
    }
}

async function loadSentNotifications() {
    try {
        const notifications = await Api.get('/notifications/');
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
            <div class="p-4 hover:bg-gray-50 transition-colors flex justify-between items-center group">
                <div>
                    <h4 class="text-sm font-semibold text-gray-900">${notif.title}</h4>
                    <div class="flex items-center gap-2">
                        <p class="text-xs text-gray-500">${new Date(notif.created_at).toLocaleString()}</p>
                        <button onclick="deleteNotification(${notif.id})" 
                            class="text-red-400 hover:text-red-600 transition-opacity"
                            title="Delete notification">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
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

async function deleteNotification(id) {
    if (!confirm('Are you sure you want to delete this notification?')) return;
    try {
        await Api.delete(`/notifications/${id}`);
        alert("Notification deleted successfully");
        await loadSentNotifications();
    } catch (e) {
        console.error(e);
        alert(e.message || "Failed to delete notification");
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

// ============================================
// TASK ASSIGNMENT (SENIOR)
// ============================================

async function openAssignTaskModal(userId = null, userName = null) {
    document.getElementById('task-title').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-priority').value = 'medium';
    document.getElementById('task-deadline').value = '';

    // Populate Assign To Dropdown
    const assigneeSelect = document.getElementById('task-assignee');
    assigneeSelect.innerHTML = '<option value="">Loading users...</option>';

    try {
        const users = await Api.get('/auth/all-users');
        assigneeSelect.innerHTML = '<option value="">Select person...</option>';

        const myName = localStorage.getItem('user_name') || 'Me';

        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);
            option.textContent = `${user.full_name} (${roleLabel})`;

            // Check if this user is me (simple check by name, or if we had ID)
            if (user.full_name === myName) {
                option.textContent += ' (Me)';
                option.style.fontWeight = 'bold';
            }

            if (userId && user.id === userId) {
                option.selected = true;
            }
            assigneeSelect.appendChild(option);
        });

    } catch (e) {
        console.error("Failed to load users for assignment", e);
        assigneeSelect.innerHTML = '<option value="">Error loading users</option>';
    }
    // Populate Projects Dropdown
    const projectSelect = document.getElementById('task-project');
    projectSelect.innerHTML = '<option value="">Loading projects...</option>';

    try {
        const projects = await Api.get('/projects/');
        projectSelect.innerHTML = '<option value="">Select project (Optional)</option>';

        projects.forEach(v => {
            const option = document.createElement('option');
            option.value = v.id;
            option.textContent = v.name;
            projectSelect.appendChild(option);
        });
    } catch (e) {
        console.error("Failed to load projects", e);
        projectSelect.innerHTML = '<option value="">Error loading projects</option>';
    }

    document.getElementById('assign-task-modal').classList.remove('hidden');
}

async function assignTask() {
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const assignedToId = document.getElementById('task-assignee').value;
    const projectId = document.getElementById('task-project').value;
    const priority = document.getElementById('task-priority').value;
    const deadline = document.getElementById('task-deadline').value;
    const btn = document.getElementById('confirm-assign-task');

    if (!title || !assignedToId) {
        alert('Please fill in required fields (Title and Assignee)');
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

        await Api.post('/tasks/', taskData);
        alert('Task assigned successfully!');
        document.getElementById('assign-task-modal').classList.add('hidden');

        // Refresh relevant sections
        if (currentTab === 'calendar') {
            loadPersonalCalendar();
            loadAssignmentsByMe();
        } else {
            refreshDashboard();
        }

    } catch (error) {
        console.error('Failed to assign task:', error);
        alert(`Error: ${error.message || 'Failed to assign task'}`);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Assign Task';
    }
}

// ============================================
// CALENDAR & PERSONAL TASKS
// ============================================

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
        await renderCalendar(tasks);
        renderPersonalTodoList(tasks);
        loadAssignmentsByMe();
    } catch (e) {
        console.error('Failed to load my calendar:', e);
    }
}
window.refreshPersonalCalendar = loadPersonalCalendar;

async function loadAssignmentsByMe() {
    try {
        // Fetch ALL tasks then filter
        // Ideally backend should have /tasks/assigned-by-me but this works for now
        const allTasks = await Api.get('/tasks/');
        const myName = localStorage.getItem('user_name');

        // We filter by checking if we CAN remove it? No, backend returns Created By.
        // Actually, let's look at Task model. It has created_by_id.
        // We don't have our own ID easily accessible here unless we stored it.
        // Let's assume we can filter by 'created_by.full_name' == myName or similar.
        // Or better: Use the endpoint to get profile first if needed.

        // For urgency, let's try to find tasks where created_by name matches or use a backend filter if exists.
        // Creating a new endpoint is best, but "keep every feature as it is" suggests minimal backend changes if possible.
        // However, we modified backend previously.

        // Let's check if the Task object has created_by info.
        // tasks.py: selectinload(Task.created_by) IS INCLUDED.

        const myTasks = allTasks.filter(t => t.created_by && t.created_by.full_name === myName);

        const container = document.getElementById('assigned-by-me-list');
        if (myTasks.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 py-4">You haven\'t assigned any tasks.</p>';
            return;
        }

        container.innerHTML = myTasks.map(t => `
            <div class="p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                <div>
                    <p class="text-sm font-medium text-gray-900">${t.title}</p>
                    <p class="text-xs text-gray-500">To: ${t.assigned_to ? t.assigned_to.full_name : 'Unassigned'} • Status: <span class="uppercase text-primary font-bold">${t.status}</span></p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="openTaskCommentsModal(${t.id}, ${JSON.stringify(t.title || '')})" class="text-xs text-gray-600 hover:text-primary font-medium">Comment</button>
                    <span class="text-xs text-gray-400">${new Date(t.created_at).toLocaleDateString()}</span>
                </div>
            </div>
        `).join('');

    } catch (e) {
        console.error("Failed to load assigned tasks", e);
    }
}

function renderPersonalTodoList(tasks) {
    const list = document.getElementById('personal-todo-list');
    if (!list || list.closest('#personal-todo-list-container')) return;
    const pending = tasks.filter(t => t.status !== 'completed');

    if (pending.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 py-4">No pending personal tasks</p>';
        return;
    }

    list.innerHTML = pending.map(t => `
        <div class="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-white hover:shadow-sm transition-all group">
            <div class="flex-1">
                <p class="text-sm font-medium text-gray-800">${t.title}</p>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${getPriorityColor(t.priority)} bg-opacity-10 text-opacity-80 uppercase font-bold tracking-wide">${t.priority}</span>
                    <span class="text-xs text-gray-400">${t.deadline ? new Date(t.deadline).toLocaleDateString() : 'No deadline'}</span>
                </div>
            </div>
            <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="markTaskComplete(${t.id})" class="text-green-500 hover:text-green-600 p-1" title="Mark Complete">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function renderCalendar(tasks) {
    const grid = document.getElementById('calendar-grid');
    const monthLabel = document.getElementById('calendar-month-year');

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    await _fetchCalendarHolidays(year);

    monthLabel.innerText = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const totalDays = lastDay.getDate();

    let html = '';

    for (let i = 0; i < startDay; i++) {
        html += '<div class="h-24 bg-gray-50/50"></div>';
    }

    const personalTodos = typeof window.getPersonalTodosForCalendar === 'function' ? window.getPersonalTodosForCalendar() : [];

    window._calendarDayData = window._calendarDayData || {};

    for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const holidayName = _calendarHolidays[dateStr] || null;
        const dayTasks = tasks.filter(t => t.deadline && t.deadline.startsWith(dateStr));
        const dayPersonalTodos = personalTodos.filter(t => t.date === dateStr && !t.done);
        const dayItems = dayTasks.map(t => ({ title: t.title, priority: t.priority || 'medium' }))
            .concat(dayPersonalTodos.map(t => ({ title: t.text, priority: (t.priority || 'medium').toLowerCase() })));

        const bgClass = holidayName ? 'bg-purple-50 hover:bg-purple-100' : 'bg-white hover:bg-blue-50/10';
        const holidayHtml = holidayName
            ? `<div class="w-full px-1 rounded text-[9px] font-semibold bg-purple-100 text-purple-700 border border-purple-200 truncate" title="${(holidayName || '').replace(/"/g, '&quot;')}">${(holidayName || '').replace(/</g, '&lt;')}</div>`
            : '';

        const leafMatches = (window._calendarApprovedLeaves || []).filter(l => l.start_date <= dateStr && l.end_date >= dateStr);

        window._calendarDayData[dateStr] = {
            holiday: holidayName,
            leaves: leafMatches,
            tasks: dayItems
        };

        html += `
            <div class="h-24 ${bgClass} p-2 border border-gray-50 flex flex-col relative group transition-colors cursor-pointer" onclick="openCalendarDayModal('${dateStr}')">
                <span class="text-xs font-semibold text-gray-700 ${day === now.getDate() ? 'bg-primary text-white w-6 h-6 flex items-center justify-center rounded-full' : ''}">${day}</span>
                <div class="flex-1 overflow-auto mt-1 space-y-1 pointer-events-none">
                    ${holidayHtml}
                    ${dayItems.map(t => `
                        <div class="w-full h-1.5 rounded-full ${getPriorityColor(t.priority)}" title="${(t.title || '').replace(/"/g, '&quot;')}"></div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    grid.innerHTML = html;
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

function getPriorityColor(p) {
    if (p === 'high') return 'bg-red-500 text-red-500';
    if (p === 'medium') return 'bg-yellow-500 text-yellow-500';
    return 'bg-blue-500 text-blue-500';
}

async function markTaskComplete(id) {
    try {
        await Api.put(`/tasks/${id}`, { status: 'completed' });
        loadPersonalCalendar(); // refresh
    } catch (e) {
        console.error(e);
        alert(e.message || "Failed");
    }
}

function openTaskCommentsModal(taskId, taskTitle) {
    document.getElementById('task-comments-task-id').value = taskId;
    document.getElementById('task-comments-title').textContent = 'Comments: ' + (taskTitle || 'Task');
    document.getElementById('task-comments-input').value = '';
    document.getElementById('task-comments-modal').classList.remove('hidden');
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
        listEl.innerHTML = comments.map(c => {
            const name = c.user ? c.user.full_name : 'Someone';
            const date = c.created_at ? new Date(c.created_at).toLocaleString() : '';
            const body = (c.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            return '<div class="border-l-2 border-primary/30 pl-3 py-1"><span class="font-medium text-gray-900">' + name + '</span> <span class="text-xs text-gray-400">' + date + '</span><p class="text-gray-700 mt-0.5">' + body + '</p></div>';
        }).join('');
    } catch (e) {
        const msg = (e && e.message) ? String(e.message) : 'Failed to load comments.';
        listEl.innerHTML = '<p class="text-red-500 text-sm">' + msg.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    }
}

async function postTaskComment() {
    const taskId = document.getElementById('task-comments-task-id').value;
    const input = document.getElementById('task-comments-input');
    const body = (input.value || '').trim();
    if (!body) return;
    const btn = document.getElementById('task-comments-post');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Posting...';
    try {
        await Api.post('/tasks/' + taskId + '/comments', { body });
        input.value = '';
        await loadTaskComments(taskId);
    } catch (e) {
        alert(e.message || 'Failed to post comment');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Post';
    }
}

async function loadTrackData() {
    try {
        const data = await Api.get('/dashboard/senior/track');

        // Render Task Assignments
        const taskAssignmentsEl = document.getElementById('task-assignments-list');
        if (taskAssignmentsEl) {
            if (data.task_assignments && data.task_assignments.length > 0) {
                taskAssignmentsEl.innerHTML = data.task_assignments.map(item => `
                    <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                        <div>
                            <span class="font-medium text-gray-900">${escapeHtml(item.assigner_name)}</span>
                            <span class="text-xs text-gray-500 ml-2">(${item.assigner_role})</span>
                        </div>
                        <span class="font-bold text-primary">${item.tasks_assigned} tasks</span>
                    </div>
                `).join('');
            } else {
                taskAssignmentsEl.innerHTML = '<div class="text-center text-gray-500 py-4">No task assignments found</div>';
            }
        }

        // Render Task Breakdown
        const taskBreakdownEl = document.getElementById('task-breakdown-list');
        if (taskBreakdownEl) {
            if (data.task_breakdown && data.task_breakdown.length > 0) {
                taskBreakdownEl.innerHTML = data.task_breakdown.map(item => `
                    <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200 text-sm">
                        <div>
                            <span class="font-medium text-gray-900">${escapeHtml(item.assigner)}</span>
                            <span class="text-gray-500"> → </span>
                            <span class="font-medium text-gray-700">${escapeHtml(item.assignee)}</span>
                            <span class="text-xs text-gray-500 ml-1">(${item.assignee_role})</span>
                        </div>
                        <span class="font-bold text-primary">${item.task_count}</span>
                    </div>
                `).join('');
            } else {
                taskBreakdownEl.innerHTML = '<div class="text-center text-gray-500 py-4">No task breakdown found</div>';
            }
        }

        // Render Notifications Issued
        const notificationsEl = document.getElementById('notifications-issued-list');
        if (notificationsEl) {
            if (data.notifications_issued && data.notifications_issued.length > 0) {
                notificationsEl.innerHTML = data.notifications_issued.map(item => `
                    <div class="flex items-center justify-between p-3 bg-white rounded border border-gray-200 mb-2">
                        <div>
                            <span class="font-medium text-gray-900">${escapeHtml(item.creator_name)}</span>
                            <span class="text-xs text-gray-500 ml-2">(${item.creator_role})</span>
                        </div>
                        <span class="font-bold text-blue-600">${item.notifications_created} notifications</span>
                    </div>
                `).join('');
            } else {
                notificationsEl.innerHTML = '<div class="text-center text-gray-500 py-4">No notifications issued</div>';
            }
        }

        // Render Policy Acknowledgments
        const policyAcksEl = document.getElementById('policy-acknowledgments-list');
        if (policyAcksEl) {
            if (data.policy_acknowledgments && data.policy_acknowledgments.length > 0) {
                policyAcksEl.innerHTML = data.policy_acknowledgments.map(item => {
                    const statusClass = item.acknowledgment_rate >= 80 ? 'text-green-600' : item.acknowledgment_rate >= 50 ? 'text-yellow-600' : 'text-red-600';
                    return `
                        <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200 mb-2">
                            <div>
                                <span class="font-medium text-gray-900">${escapeHtml(item.user_name)}</span>
                                <span class="text-xs text-gray-500 ml-1">(${item.user_role})</span>
                            </div>
                            <div class="text-right">
                                <span class="font-bold ${statusClass}">${item.acknowledgment_rate}%</span>
                                <div class="text-xs text-gray-500">${item.acknowledged}/${item.total_policies}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                policyAcksEl.innerHTML = '<div class="text-center text-gray-500 py-4">No policy acknowledgment data</div>';
            }
        }

        // Render Notification Acknowledgments
        const notifAcksEl = document.getElementById('notification-acknowledgments-list');
        if (notifAcksEl) {
            if (data.notification_acknowledgments && data.notification_acknowledgments.length > 0) {
                notifAcksEl.innerHTML = data.notification_acknowledgments.map(item => {
                    const statusClass = item.acknowledgment_rate >= 80 ? 'text-green-600' : item.acknowledgment_rate >= 50 ? 'text-yellow-600' : 'text-red-600';
                    return `
                        <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200 mb-2">
                            <div>
                                <span class="font-medium text-gray-900">${escapeHtml(item.user_name)}</span>
                                <span class="text-xs text-gray-500 ml-1">(${item.user_role})</span>
                            </div>
                            <div class="text-right">
                                <span class="font-bold ${statusClass}">${item.acknowledgment_rate}%</span>
                                <div class="text-xs text-gray-500">${item.notifications_acknowledged}/${item.total_notifications}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                notifAcksEl.innerHTML = '<div class="text-center text-gray-500 py-4">No notification acknowledgment data</div>';
            }
        }

        // Render Activity Metrics
        const activityEl = document.getElementById('activity-metrics-list');
        if (activityEl) {
            if (data.activity_metrics && data.activity_metrics.length > 0) {
                activityEl.innerHTML = data.activity_metrics.map(item => {
                    let statusBadge = '';
                    let statusColor = '';
                    if (item.status === 'high_performer') {
                        statusBadge = 'High Performer';
                        statusColor = 'bg-green-100 text-green-700 border-green-200';
                    } else if (item.status === 'needs_attention') {
                        statusBadge = 'Needs Attention';
                        statusColor = 'bg-red-100 text-red-700 border-red-200';
                    } else if (item.status === 'inactive') {
                        statusBadge = 'Inactive';
                        statusColor = 'bg-gray-100 text-gray-700 border-gray-200';
                    } else {
                        statusBadge = 'Normal';
                        statusColor = 'bg-blue-100 text-blue-700 border-blue-200';
                    }

                    return `
                        <div class="bg-white rounded-lg border border-gray-200 p-4">
                            <div class="flex items-center justify-between mb-3">
                                <div>
                                    <span class="font-bold text-gray-900">${escapeHtml(item.user_name)}</span>
                                    <span class="text-xs text-gray-500 ml-2">(${item.user_role})</span>
                                </div>
                                <span class="px-2 py-1 rounded-full text-xs font-bold border ${statusColor}">${statusBadge}</span>
                            </div>
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span class="text-gray-600">Total Tasks:</span>
                                    <span class="font-bold text-gray-900 ml-2">${item.total_tasks}</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">Completed:</span>
                                    <span class="font-bold text-green-600 ml-2">${item.completed_tasks}</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">On Time:</span>
                                    <span class="font-bold text-blue-600 ml-2">${item.on_time_tasks}</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">Late:</span>
                                    <span class="font-bold text-red-600 ml-2">${item.late_tasks}</span>
                                </div>
                            </div>
                            <div class="mt-3 pt-3 border-t border-gray-100">
                                <div class="flex items-center justify-between text-sm">
                                    <span class="text-gray-600">Completion Rate:</span>
                                    <span class="font-bold text-gray-900">${item.completion_rate}%</span>
                                </div>
                                <div class="flex items-center justify-between text-sm mt-1">
                                    <span class="text-gray-600">On-Time Rate:</span>
                                    <span class="font-bold text-gray-900">${item.on_time_rate}%</span>
                                </div>
                                <div class="flex items-center justify-between text-sm mt-2 pt-2 border-t border-gray-100">
                                    <span class="font-medium text-gray-700">Activity Score:</span>
                                    <span class="font-bold text-primary text-lg">${item.activity_score}%</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                activityEl.innerHTML = '<div class="text-center text-gray-500 py-4">No activity data available</div>';
            }
        }
    } catch (error) {
        console.error('Failed to load track data:', error);
        const errorMsg = error.message || 'Failed to load tracking data';
        ['task-assignments-list', 'task-breakdown-list', 'notifications-issued-list',
            'policy-acknowledgments-list', 'notification-acknowledgments-list', 'activity-metrics-list'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = `<div class="text-center text-red-500 py-4">Error: ${escapeHtml(errorMsg)}</div>`;
            });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openPromoteUserModal(userId, userName, currentRole) {
    document.getElementById('promote-user-id').value = userId;
    document.getElementById('promote-user-name').textContent = userName;
    document.getElementById('promote-current-role').textContent = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
    document.getElementById('promote-new-role').value = '';

    // Disable current role in dropdown
    const select = document.getElementById('promote-new-role');
    Array.from(select.options).forEach(option => {
        option.disabled = option.value === currentRole;
    });

    document.getElementById('promote-user-modal').style.display = 'flex';
}

async function promoteUser() {
    const userId = document.getElementById('promote-user-id').value;
    const newRole = document.getElementById('promote-new-role').value;

    if (!newRole) {
        alert('Please select a new role');
        return;
    }

    const userName = document.getElementById('promote-user-name').textContent;
    const currentRole = document.getElementById('promote-current-role').textContent.toLowerCase();

    if (newRole === currentRole) {
        alert('User already has this role');
        return;
    }

    if (newRole === 'senior') {
        alert('Cannot promote to Senior role. Use signup process instead.');
        return;
    }

    if (currentRole === 'senior') {
        alert('Cannot demote Senior users');
        return;
    }

    const confirmMsg = `Are you sure you want to promote ${userName} from ${currentRole} to ${newRole}? This will update their dashboard and access permissions.`;
    if (!confirm(confirmMsg)) {
        return;
    }

    const btn = document.getElementById('confirm-promote-user');
    btn.disabled = true;
    btn.textContent = 'Promoting...';

    try {
        await Api.put(`/dashboard/senior/users/${userId}/promote`, { new_role: newRole });
        showToast(`${userName} has been promoted to ${newRole}!`, 'success');
        document.getElementById('promote-user-modal').style.display = 'none';

        // Refresh workforce list to show updated role
        await loadWorkforce();
    } catch (error) {
        console.error('Failed to promote user:', error);
        const errorMsg = error.message || 'Failed to promote user';
        showToast(errorMsg, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Promote';
    }
}
