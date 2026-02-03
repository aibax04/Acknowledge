// ============================================
// MANDATORY POPUP SYSTEM
// Shows unacknowledged notifications and policies
// as blocking modals that must be acknowledged
// ============================================

let pendingPopups = [];
let isPopupActive = false;
let currentUserId = null;

// Types of popups
const POPUP_TYPES = {
    NOTIFICATION: 'notification',
    POLICY: 'policy'
};

// Get current user ID from storage or API
async function getCurrentUserId() {
    if (currentUserId) return currentUserId;

    try {
        const user = await Api.getProfile();
        currentUserId = user.id;
        return currentUserId;
    } catch (e) {
        console.error('Failed to get user ID:', e);
        return null;
    }
}

// Check for pending notifications and policies that need acknowledgment
async function checkForPendingItems() {
    if (isPopupActive) return; // Don't check if already showing a popup

    try {
        const userId = await getCurrentUserId();
        if (!userId) return;

        pendingPopups = [];

        // 1. Check for unacknowledged notifications (from "Notify Everyone")
        try {
            const notifications = await Api.get('/notifications/');
            const unacknowledgedNotifs = notifications.filter(n => !n.is_acknowledged);
            unacknowledgedNotifs.forEach(n => {
                pendingPopups.push({
                    type: POPUP_TYPES.NOTIFICATION,
                    id: n.id,
                    title: n.title,
                    content: n.content,
                    sender: n.created_by ? n.created_by.full_name : 'Management',
                    date: n.created_at,
                    imageUrl: null,
                    headerColor: 'from-primary to-primary-hover',
                    icon: 'bell',
                    label: 'Important Notification'
                });
            });
        } catch (e) {
            console.error('Failed to check notifications:', e);
        }

        // 2. Check for unacknowledged policies
        try {
            const policies = await Api.get('/policies/');
            policies.forEach(p => {
                const isAcknowledged = p.acknowledged_by && p.acknowledged_by.some(u => u.id === userId);
                if (!isAcknowledged) {
                    pendingPopups.push({
                        type: POPUP_TYPES.POLICY,
                        id: p.id,
                        title: p.title,
                        content: p.content,
                        sender: p.created_by ? p.created_by.full_name : 'HR Department',
                        date: p.created_at,
                        imageUrl: p.image_url,
                        headerColor: 'from-blue-600 to-blue-700',
                        icon: 'document',
                        label: 'New Company Policy'
                    });
                }
            });
        } catch (e) {
            console.error('Failed to check policies:', e);
        }

        // Sort by date (newest first)
        pendingPopups.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Show popup if there are pending items
        if (pendingPopups.length > 0) {
            showNextPopup();
        }

    } catch (e) {
        console.error('Failed to check pending items:', e);
    }
}

function showNextPopup() {
    if (pendingPopups.length === 0) {
        isPopupActive = false;
        document.body.style.overflow = '';
        return;
    }

    isPopupActive = true;
    const item = pendingPopups[0];

    // Create or get the popup modal
    let modal = document.getElementById('mandatory-popup-modal');
    if (!modal) {
        modal = createPopupModal();
        document.body.appendChild(modal);
    }

    // Set header color based on type
    const header = document.getElementById('popup-header');
    header.className = `bg-gradient-to-r ${item.headerColor} p-6 text-white`;

    // Set icon
    const iconContainer = document.getElementById('popup-icon');
    iconContainer.innerHTML = getIconSvg(item.icon);

    // Set label
    document.getElementById('popup-label').textContent = item.label;

    // Handle cover image for policies
    const imageContainer = document.getElementById('popup-image-container');
    if (item.imageUrl) {
        const imgSrc = item.imageUrl.startsWith('/') ? '/api' + item.imageUrl : item.imageUrl;
        imageContainer.innerHTML = `
            <img src="${imgSrc}" alt="Policy Cover" class="w-full h-48 object-cover rounded-xl shadow-lg mb-4">
        `;
        imageContainer.classList.remove('hidden');
    } else {
        imageContainer.innerHTML = '';
        imageContainer.classList.add('hidden');
    }

    // Populate content
    document.getElementById('popup-title').textContent = item.title;

    // Format content with proper line breaks and styling
    const contentEl = document.getElementById('popup-content');
    contentEl.innerHTML = formatPopupContent(item.content);

    document.getElementById('popup-sender').textContent = item.sender;
    document.getElementById('popup-date').textContent = new Date(item.date).toLocaleString();
    document.getElementById('popup-id').value = item.id;
    document.getElementById('popup-type').value = item.type;

    // Update count badge
    const countBadge = document.getElementById('popup-count');
    if (pendingPopups.length > 1) {
        countBadge.textContent = `${pendingPopups.length} items pending`;
        countBadge.classList.remove('hidden');
    } else {
        countBadge.classList.add('hidden');
    }

    // Update button text based on type
    const btnText = document.getElementById('popup-btn-text');
    if (item.type === POPUP_TYPES.POLICY) {
        btnText.textContent = 'I Acknowledge This Policy';
    } else {
        btnText.textContent = 'I Acknowledge This Notification';
    }

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function formatPopupContent(content) {
    if (!content) return '';

    // Escape HTML
    const escaped = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Bold formatting: **bold**
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Convert line breaks to proper formatting
    const lines = escaped.split('\n');
    let html = '';
    let inParagraph = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === '') {
            if (inParagraph) {
                html += '</p>';
                inParagraph = false;
            }
            html += '<div class="h-3"></div>'; // Spacing
        } else if (line.match(/^(SECTION|ARTICLE|CHAPTER|\d+\.|[A-Z][A-Z\s]+:)/)) {
            // Section headers
            if (inParagraph) {
                html += '</p>';
                inParagraph = false;
            }
            html += `<h4 class="font-bold text-gray-900 mt-4 mb-2">${line}</h4>`;
        } else if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
            // Bullet points
            if (inParagraph) {
                html += '</p>';
                inParagraph = false;
            }
            html += `<div class="flex items-start space-x-2 my-1">
                <span class="text-gray-400 mt-0.5">•</span>
                <span>${line.substring(1).trim()}</span>
            </div>`;
        } else {
            // Regular text
            if (!inParagraph) {
                html += '<p class="text-gray-700 leading-relaxed">';
                inParagraph = true;
            } else {
                html += '<br>';
            }
            html += line;
        }
    }

    if (inParagraph) {
        html += '</p>';
    }

    return html;
}

function getIconSvg(iconType) {
    const icons = {
        bell: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>`,
        document: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>`
    };
    return icons[iconType] || icons.bell;
}

function createPopupModal() {
    const modal = document.createElement('div');
    modal.id = 'mandatory-popup-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4';
    modal.style.display = 'none';

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in transform scale-100 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <!-- Header -->
            <div id="popup-header" class="bg-gradient-to-r from-primary to-primary-hover p-6 text-white flex-shrink-0">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <div id="popup-icon" class="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                        </div>
                        <div>
                            <h2 id="popup-label" class="text-xl font-bold">Important Notification</h2>
                            <p class="text-white/80 text-sm">Please read and acknowledge</p>
                        </div>
                    </div>
                    <span id="popup-count" class="hidden bg-white/30 text-white text-xs px-3 py-1 rounded-full font-bold"></span>
                </div>
            </div>
            
            <!-- Content - Scrollable -->
            <div class="flex-1 overflow-y-auto p-6">
                <input type="hidden" id="popup-id">
                <input type="hidden" id="popup-type">
                
                <!-- Cover Image -->
                <div id="popup-image-container" class="hidden"></div>
                
                <h3 id="popup-title" class="text-2xl font-bold text-gray-900 mb-4"></h3>
                
                <div id="popup-content" class="bg-gray-50 rounded-xl p-5 mb-4 text-sm"></div>
                
                <div class="flex items-center justify-between text-sm text-gray-500 mb-4">
                    <div class="flex items-center space-x-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                        </svg>
                        <span>From: <strong id="popup-sender"></strong></span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        <span id="popup-date"></span>
                    </div>
                </div>
            </div>
            
            <!-- Footer - Fixed -->
            <div class="flex-shrink-0 p-6 border-t border-gray-100 bg-gray-50">
                <!-- Warning -->
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start space-x-3">
                    <svg class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    <p class="text-sm text-amber-800">
                        <strong>Action Required:</strong> You must acknowledge this to continue using the platform.
                    </p>
                </div>
                
                <!-- Action -->
                <button id="popup-acknowledge-btn" onclick="acknowledgePopupItem()" 
                    class="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-hover transition-all shadow-lg hover:shadow-xl flex items-center justify-center space-x-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                    <span id="popup-btn-text">I Acknowledge This</span>
                </button>
            </div>
        </div>
    `;

    // Prevent closing by clicking outside
    modal.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    return modal;
}

async function acknowledgePopupItem() {
    const id = document.getElementById('popup-id').value;
    const type = document.getElementById('popup-type').value;
    const btn = document.getElementById('popup-acknowledge-btn');

    btn.disabled = true;
    btn.innerHTML = `
        <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Acknowledging...</span>
    `;

    try {
        // Call appropriate API based on type
        let endpoint;
        switch (type) {
            case POPUP_TYPES.NOTIFICATION:
                endpoint = `/notifications/${id}/acknowledge`;
                break;
            case POPUP_TYPES.POLICY:
                endpoint = `/policies/${id}/acknowledge`;
                break;
            default:
                throw new Error('Unknown popup type');
        }

        await Api.post(endpoint, {});

        // Remove from pending list
        pendingPopups = pendingPopups.filter(p => !(p.id == id && p.type === type));

        // Show success
        btn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Acknowledged!</span>
        `;
        btn.classList.add('bg-green-600', 'hover:bg-green-700');
        btn.classList.remove('bg-primary', 'hover:bg-primary-hover');

        setTimeout(() => {
            btn.classList.remove('bg-green-600', 'hover:bg-green-700');
            btn.classList.add('bg-primary', 'hover:bg-primary-hover');
            btn.disabled = false;

            if (pendingPopups.length > 0) {
                showNextPopup();
            } else {
                // Close modal and restore scrolling
                const modal = document.getElementById('mandatory-popup-modal');
                if (modal) {
                    modal.style.display = 'none';
                }
                document.body.style.overflow = '';
                isPopupActive = false;

                // Refresh relevant lists if functions are available
                if (typeof loadNotifications === 'function') loadNotifications();
                if (typeof loadPolicies === 'function') loadPolicies();
            }
        }, 800);

    } catch (e) {
        console.error('Failed to acknowledge item:', e);
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span id="popup-btn-text">I Acknowledge This</span>
        `;

        if (typeof showToast === 'function') {
            showToast('Failed to acknowledge. Please try again.', 'error');
        } else {
            alert('Failed to acknowledge. Please try again.');
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check after a short delay to allow auth to complete
    setTimeout(() => {
        if (localStorage.getItem('access_token')) {
            checkForPendingItems();
        }
    }, 1500);

    // Also check periodically for new items (every 30 seconds)
    setInterval(() => {
        if (localStorage.getItem('access_token') && !isPopupActive) {
            checkForPendingItems();
        }
    }, 30000);
});

// Export for manual triggering after creating new items
window.checkForPendingItems = checkForPendingItems;
