// Ventures Management JavaScript
// Handles all CRUD operations for ventures and member management

let selectedUsersToAdd = [];
let selectedMembersForNotif = [];


// ========== API FUNCTIONS ==========

async function fetchVentures() {
    try {
        const response = await Api.get('/ventures/');
        return response || [];
    } catch (error) {
        console.error('Error fetching ventures:', error);
        return [];
    }
}

async function fetchVentureDetails(ventureId) {
    try {
        const response = await Api.get(`/ventures/${ventureId}`);
        return response;
    } catch (error) {
        console.error('Error fetching venture details:', error);
        return null;
    }
}

async function createVenture(name, description) {
    try {
        const response = await Api.post('/ventures/', { name, description });
        return response;
    } catch (error) {
        console.error('Error creating venture:', error);
        throw error;
    }
}

async function deleteVenture(ventureId) {
    try {
        await Api.delete(`/ventures/${ventureId}`);
        return true;
    } catch (error) {
        console.error('Error deleting venture:', error);
        throw error;
    }
}

async function fetchAvailableUsers(ventureId) {
    try {
        const response = await Api.get(`/ventures/${ventureId}/available-users`);
        return response || [];
    } catch (error) {
        console.error('Error fetching available users:', error);
        return [];
    }
}

async function addMembersToVenture(ventureId, userIds) {
    try {
        const response = await Api.post(`/ventures/${ventureId}/members`, { user_ids: userIds });
        return response;
    } catch (error) {
        console.error('Error adding members:', error);
        throw error;
    }
}

async function removeMemberFromVenture(ventureId, userId) {
    try {
        const response = await Api.delete(`/ventures/${ventureId}/members/${userId}`);
        return response;
    } catch (error) {
        console.error('Error removing member:', error);
        throw error;
    }
}

// ========== UI RENDERING FUNCTIONS ==========

function renderVenturesList(ventures) {
    const container = document.getElementById('ventures-list');
    if (!container) return;

    if (ventures.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-500">
                <svg class="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                <p class="text-lg font-medium">No ventures yet</p>
                <p class="text-sm">Create your first venture to organize your team</p>
            </div>
        `;
        return;
    }

    container.innerHTML = ventures.map(venture => `
        <div class="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer venture-card"
             data-venture-id="${venture.id}">
            <div class="flex items-start justify-between mb-3">
                <div class="w-10 h-10 rounded-lg bg-primary-light text-primary flex items-center justify-center">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                </div>
            </div>
            <h3 class="font-semibold text-gray-900 mb-1">${escapeHtml(venture.name)}</h3>
            <p class="text-sm text-gray-500 line-clamp-2">${escapeHtml(venture.description || 'No description')}</p>
            <div class="mt-4 pt-4 border-t border-gray-50 flex items-center text-xs text-gray-400">
                <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                Created ${formatDate(venture.created_at)}
            </div>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.venture-card').forEach(card => {
        card.addEventListener('click', () => openVentureModal(card.dataset.ventureId));
    });
}

function renderVentureMembers(members) {
    const container = document.getElementById('venture-members-list');
    if (!container) return;

    selectedMembersForNotif = [];
    updateSelectedCount();

    if (!members || members.length === 0) {
        container.innerHTML = `
            <p class="text-center text-gray-400 py-4">No members added yet</p>
        `;
        return;
    }

    container.innerHTML = members.map(member => `
        <div class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <div class="flex items-center flex-1">
                <input type="checkbox" class="member-checkbox rounded text-primary focus:ring-primary mr-3" 
                       data-user-id="${member.id}">
                <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">
                    ${getInitials(member.full_name)}
                </div>
                <div class="ml-3">
                    <p class="text-sm font-medium text-gray-900">${escapeHtml(member.full_name)}</p>
                    <p class="text-xs text-gray-500">${escapeHtml(member.email)}</p>
                </div>
            </div>
            <button class="text-red-500 hover:text-red-700 text-sm remove-member-btn ml-2" data-user-id="${member.id}">
                Remove
            </button>
        </div>
    `).join('');

    // Handle "Select All"
    const selectAllDetails = document.getElementById('select-all-members');
    if (selectAllDetails) {
        selectAllDetails.checked = false;
        selectAllDetails.onclick = (e) => {
            const isChecked = e.target.checked;
            container.querySelectorAll('.member-checkbox').forEach(cb => {
                cb.checked = isChecked;
                const userId = parseInt(cb.dataset.userId);
                if (isChecked) {
                    if (!selectedMembersForNotif.includes(userId)) selectedMembersForNotif.push(userId);
                } else {
                    selectedMembersForNotif = [];
                }
            });
            updateSelectedCount();
        };
    }

    // Handle individual checkboxes
    container.querySelectorAll('.member-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const userId = parseInt(checkbox.dataset.userId);
            if (checkbox.checked) {
                selectedMembersForNotif.push(userId);
            } else {
                selectedMembersForNotif = selectedMembersForNotif.filter(id => id !== userId);
                if (selectAllDetails) selectAllDetails.checked = false;
            }
            updateSelectedCount();
        });
    });

    // Add remove handlers
    container.querySelectorAll('.remove-member-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const userId = btn.dataset.userId;
            const ventureId = document.getElementById('venture-modal-id').value;
            if (confirm('Remove this member from the venture?')) {
                await removeMemberFromVenture(ventureId, userId);
                openVentureModal(ventureId); // Refresh
                showToast('Member removed successfully', 'success');
            }
        });
    });
}

function updateSelectedCount() {
    const btn = document.getElementById('btn-venture-notify');
    const countSpan = document.getElementById('selected-count');

    if (selectedMembersForNotif.length > 0) {
        btn.classList.remove('hidden');
        countSpan.textContent = selectedMembersForNotif.length;
    } else {
        btn.classList.add('hidden');
    }
}

function renderAvailableUsers(users) {
    const container = document.getElementById('available-users-list');
    if (!container) return;

    selectedUsersToAdd = [];

    if (users.length === 0) {
        container.innerHTML = `
            <p class="text-center text-gray-400 py-4">All users are already members</p>
        `;
        return;
    }

    container.innerHTML = users.map(user => `
        <label class="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
            <input type="checkbox" class="user-checkbox rounded text-primary focus:ring-primary mr-3" 
                   data-user-id="${user.id}">
            <div class="flex-1">
                <p class="text-sm font-medium text-gray-900">${escapeHtml(user.full_name)}</p>
                <p class="text-xs text-gray-500">${escapeHtml(user.email)} • ${user.role}</p>
            </div>
        </label>
    `).join('');

    // Handle checkbox changes
    container.querySelectorAll('.user-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const userId = parseInt(checkbox.dataset.userId);
            if (checkbox.checked) {
                selectedUsersToAdd.push(userId);
            } else {
                selectedUsersToAdd = selectedUsersToAdd.filter(id => id !== userId);
            }
        });
    });
}

// ========== MODAL FUNCTIONS ==========

function showModal(modal) {
    if (!modal) return;
    // Support both patterns: class 'active' and style display
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function hideModal(modal) {
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('active');
}

function openCreateVentureModal() {
    document.getElementById('venture-name').value = '';
    document.getElementById('venture-description').value = '';
    showModal(document.getElementById('create-venture-modal'));
}

function closeCreateVentureModal() {
    hideModal(document.getElementById('create-venture-modal'));
}

async function openVentureModal(ventureId) {
    const venture = await fetchVentureDetails(ventureId);
    if (!venture) {
        showToast('Failed to load venture details', 'error');
        return;
    }

    document.getElementById('venture-modal-id').value = venture.id;
    document.getElementById('venture-modal-title').textContent = venture.name;
    document.getElementById('venture-modal-desc').textContent = venture.description || 'No description';

    renderVentureMembers(venture.members);
    showModal(document.getElementById('view-venture-modal'));
}

function closeVentureModal() {
    hideModal(document.getElementById('view-venture-modal'));
}

async function openAddMembersModal() {
    const ventureId = document.getElementById('venture-modal-id').value;
    const users = await fetchAvailableUsers(ventureId);
    renderAvailableUsers(users);
    showModal(document.getElementById('add-members-modal'));
}

function closeAddMembersModal() {
    hideModal(document.getElementById('add-members-modal'));
    selectedUsersToAdd = [];
}

function openTargetedNotificationModal() {
    if (selectedMembersForNotif.length === 0) return;
    document.getElementById('target-count').textContent = selectedMembersForNotif.length;
    document.getElementById('target-notif-title').value = '';
    document.getElementById('target-notif-content').value = '';
    showModal(document.getElementById('targeted-notification-modal'));
}

function closeTargetedNotificationModal() {
    hideModal(document.getElementById('targeted-notification-modal'));
}

async function sendTargetedNotification() {
    const title = document.getElementById('target-notif-title').value.trim();
    const content = document.getElementById('target-notif-content').value.trim();

    if (!title || !content) {
        showToast('Please fill in both subject and message', 'error');
        return;
    }

    try {
        await Api.post('/notifications/', {
            title: title,
            content: content,
            recipient_ids: selectedMembersForNotif.map(id => parseInt(id)),
            notification_type: 'TARGETED'
        });

        showToast('Notification sent successfully', 'success');
        closeTargetedNotificationModal();

        // Reset selection
        selectedMembersForNotif = [];
        updateSelectedCount();
        const selectAll = document.getElementById('select-all-members');
        if (selectAll) selectAll.checked = false;
        document.querySelectorAll('.member-checkbox').forEach(cb => cb.checked = false);

    } catch (error) {
        console.error(error);
        showToast('Failed to send notification', 'error');
    }
}

// ========== HELPER FUNCTIONS ==========

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getInitials(name) {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast bg-white border-l-4 ${type === 'success' ? 'border-green-500' : 'border-red-500'} p-4 rounded-lg shadow-lg mb-2`;
    toast.innerHTML = `
        <div class="flex items-center">
            <span class="${type === 'success' ? 'text-green-600' : 'text-red-600'} font-medium">${message}</span>
        </div>
    `;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========== EVENT HANDLERS INITIALIZATION ==========

async function loadVentures() {
    const ventures = await fetchVentures();
    renderVenturesList(ventures);
}

function initVenturesModule() {
    // Create venture button
    const createBtn = document.getElementById('btn-create-venture');
    if (createBtn) {
        createBtn.addEventListener('click', openCreateVentureModal);
    }

    // Cancel create
    const cancelCreateBtn = document.getElementById('cancel-create-venture');
    if (cancelCreateBtn) {
        cancelCreateBtn.addEventListener('click', closeCreateVentureModal);
    }

    // Confirm create
    const confirmCreateBtn = document.getElementById('confirm-create-venture');
    if (confirmCreateBtn) {
        confirmCreateBtn.addEventListener('click', async () => {
            const name = document.getElementById('venture-name').value.trim();
            const description = document.getElementById('venture-description').value.trim();

            if (!name) {
                showToast('Please enter a venture name', 'error');
                return;
            }

            try {
                await createVenture(name, description);
                closeCreateVentureModal();
                showToast('Venture created successfully', 'success');
                loadVentures();
            } catch (error) {
                showToast('Failed to create venture', 'error');
            }
        });
    }

    // Close venture modal
    const closeVentureBtn = document.getElementById('close-venture-modal');
    if (closeVentureBtn) {
        closeVentureBtn.addEventListener('click', closeVentureModal);
    }

    // Delete venture
    const deleteVentureBtn = document.getElementById('delete-venture-btn');
    if (deleteVentureBtn) {
        deleteVentureBtn.addEventListener('click', async () => {
            const ventureId = document.getElementById('venture-modal-id').value;
            if (confirm('Are you sure you want to delete this venture? This action cannot be undone.')) {
                try {
                    await deleteVenture(ventureId);
                    closeVentureModal();
                    showToast('Venture deleted successfully', 'success');
                    loadVentures();
                } catch (error) {
                    showToast('Failed to delete venture', 'error');
                }
            }
        });
    }

    // Add members button
    const addMembersBtn = document.getElementById('btn-add-members');
    if (addMembersBtn) {
        addMembersBtn.addEventListener('click', openAddMembersModal);
    }

    // Cancel add members
    const cancelAddMembersBtn = document.getElementById('cancel-add-members');
    if (cancelAddMembersBtn) {
        cancelAddMembersBtn.addEventListener('click', closeAddMembersModal);
    }

    // Confirm add members
    const confirmAddMembersBtn = document.getElementById('confirm-add-members');
    if (confirmAddMembersBtn) {
        confirmAddMembersBtn.addEventListener('click', async () => {
            if (selectedUsersToAdd.length === 0) {
                showToast('Please select at least one user', 'error');
                return;
            }

            const ventureId = document.getElementById('venture-modal-id').value;
            try {
                await addMembersToVenture(ventureId, selectedUsersToAdd);
                closeAddMembersModal();
                showToast('Members added successfully', 'success');
                openVentureModal(ventureId); // Refresh
            } catch (error) {
                showToast('Failed to add members', 'error');
            }
        });
    }

    // Targeted notification handlers
    const notifyBtn = document.getElementById('btn-venture-notify');
    if (notifyBtn) {
        notifyBtn.addEventListener('click', openTargetedNotificationModal);
    }

    const cancelNotifyBtn = document.getElementById('cancel-target-notif');
    if (cancelNotifyBtn) {
        cancelNotifyBtn.addEventListener('click', closeTargetedNotificationModal);
    }

    const confirmNotifyBtn = document.getElementById('confirm-target-notif');
    if (confirmNotifyBtn) {
        confirmNotifyBtn.addEventListener('click', sendTargetedNotification);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initVenturesModule();

    // Load ventures when the ventures tab is clicked
    document.querySelectorAll('[data-tab="ventures"]').forEach(link => {
        link.addEventListener('click', loadVentures);
    });
});
