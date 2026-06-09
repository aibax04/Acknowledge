/* Activity / History feed — shared across all dashboards */

var _activityPage = 0;
var _activityLoading = false;
var _activityDone = false;
var _activityEndpoint = '/activity-logs/mine';
var _activityContainerId = 'activity-feed-container';

/* ── Action metadata ─────────────────────────────────────── */
var ACTION_META = {
    task_created:           { label: 'Task Created',        icon: 'task',        pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    task_assigned:          { label: 'Task Assigned',       icon: 'task',        pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
    task_edited:            { label: 'Task Edited',         icon: 'task',        pill: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200' },
    task_status_changed:    { label: 'Status Changed',      icon: 'task',        pill: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200' },
    task_completed:         { label: 'Task Completed',      icon: 'check',       pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    leave_requested:        { label: 'Leave Applied',       icon: 'calendar',    pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    leave_approved:         { label: 'Leave Approved',      icon: 'check',       pill: 'bg-green-50 text-green-700 ring-1 ring-green-200' },
    leave_rejected:         { label: 'Leave Rejected',      icon: 'x',           pill: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    leave_cancelled:        { label: 'Leave Cancelled',     icon: 'calendar',    pill: 'bg-gray-50 text-gray-500 ring-1 ring-gray-200' },
    attendance_requested:   { label: 'Attendance Request',  icon: 'clock',       pill: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
    attendance_approved:    { label: 'Attendance Approved', icon: 'check',       pill: 'bg-green-50 text-green-700 ring-1 ring-green-200' },
    attendance_rejected:    { label: 'Attendance Rejected', icon: 'x',           pill: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    project_created:        { label: 'Project Created',     icon: 'project',     pill: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200' },
    project_edited:         { label: 'Project Edited',      icon: 'project',     pill: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
    project_member_added:   { label: 'Member Added',        icon: 'user-plus',   pill: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' },
    project_member_removed: { label: 'Member Removed',      icon: 'user-minus',  pill: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' },
};

var ICONS = {
    task: '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>',
    check: '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
    x: '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
    calendar: '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
    clock: '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    project: '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>',
    'user-plus': '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>',
    'user-minus': '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"/></svg>',
};

var AVATAR_COLORS = [
    'bg-blue-100 text-blue-700',
    'bg-purple-100 text-purple-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
    'bg-indigo-100 text-indigo-700',
    'bg-teal-100 text-teal-700',
    'bg-orange-100 text-orange-700',
    'bg-pink-100 text-pink-700',
];

/* ── Helpers ─────────────────────────────────────────────── */
function _actEsc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _getInitials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
}

function _avatarColor(actorId) {
    return AVATAR_COLORS[(actorId || 0) % AVATAR_COLORS.length];
}

function _formatTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function _formatDateLabel(dateObj) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var yesterday = new Date(today - 86400000);
    var target = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    if (target.getTime() === today.getTime()) return 'Today';
    if (target.getTime() === yesterday.getTime()) return 'Yesterday';
    return dateObj.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function _isoDateKey(isoStr) {
    if (!isoStr) return '';
    return isoStr.slice(0, 10); // "YYYY-MM-DD"
}

/* ── Description formatter ───────────────────────────────── */
function _formatDescription(log) {
    var desc = log.description || '';
    var actor = log.actor_name || '';
    // Bold the actor name at the start
    if (actor && desc.startsWith(actor)) {
        return '<span class="font-semibold text-gray-900">' + _actEsc(actor) + '</span>' + _actEsc(desc.slice(actor.length));
    }
    return _actEsc(desc);
}

/* ── Item renderer ───────────────────────────────────────── */
function _renderActivityItem(log) {
    var meta = ACTION_META[log.action] || { label: log.action.replace(/_/g, ' '), icon: 'task', pill: 'bg-gray-50 text-gray-500 ring-1 ring-gray-200' };
    var icon = ICONS[meta.icon] || ICONS['task'];
    var initials = _getInitials(log.actor_name);
    var avatarCls = _avatarColor(log.actor_id);
    var time = _formatTime(log.created_at);

    return '<div class="flex gap-3.5 py-4 border-b border-gray-100 last:border-0 group">' +
        // Avatar
        '<div class="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ' + avatarCls + '">' +
            _actEsc(initials) +
        '</div>' +
        // Body
        '<div class="flex-1 min-w-0">' +
            // Top row: pill badge + time
            '<div class="flex items-center justify-between gap-2 mb-1">' +
                '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ' + meta.pill + '">' +
                    icon + _actEsc(meta.label) +
                '</span>' +
                '<span class="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">' + _actEsc(time) + '</span>' +
            '</div>' +
            // Description
            '<p class="text-sm text-gray-700 leading-snug">' + _formatDescription(log) + '</p>' +
        '</div>' +
    '</div>';
}

/* ── Date separator ──────────────────────────────────────── */
function _renderDateSeparator(label) {
    return '<div class="flex items-center gap-3 py-2 mt-2">' +
        '<div class="flex-1 h-px bg-gray-100"></div>' +
        '<span class="text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">' + _actEsc(label) + '</span>' +
        '<div class="flex-1 h-px bg-gray-100"></div>' +
    '</div>';
}

/* ── Build grouped HTML ──────────────────────────────────── */
function _buildGroupedHtml(logs) {
    var html = '';
    var lastKey = null;
    logs.forEach(function(log) {
        var dateKey = _isoDateKey(log.created_at);
        if (dateKey !== lastKey) {
            lastKey = dateKey;
            var label = log.created_at ? _formatDateLabel(new Date(log.created_at)) : '';
            html += _renderDateSeparator(label);
        }
        html += _renderActivityItem(log);
    });
    return html;
}

/* ── Public API ──────────────────────────────────────────── */
async function loadActivityFeed(containerId, isSenior) {
    _activityEndpoint = isSenior ? '/activity-logs/' : '/activity-logs/mine';
    _activityPage = 0;
    _activityDone = false;
    _activityContainerId = containerId || 'activity-feed-container';
    var container = document.getElementById(_activityContainerId);
    if (!container) return;
    container.innerHTML =
        '<div class="flex items-center justify-center gap-2 py-10 text-gray-400">' +
            '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>' +
            '<span class="text-sm">Loading history…</span>' +
        '</div>';
    await _fetchActivityPage(_activityContainerId, true);
}

async function _fetchActivityPage(containerId, replace) {
    if (_activityLoading || _activityDone) return;
    _activityLoading = true;
    var container = document.getElementById(containerId);
    if (!container) { _activityLoading = false; return; }

    try {
        var limit = 50;
        var offset = _activityPage * limit;
        var logs = await Api.get(_activityEndpoint + '?limit=' + limit + '&offset=' + offset);
        _activityLoading = false;

        if (!logs || logs.length === 0) {
            _activityDone = true;
            if (replace) {
                container.innerHTML =
                    '<div class="flex flex-col items-center justify-center py-14 text-gray-400">' +
                        '<svg class="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
                        '<p class="text-sm font-medium">No activity yet</p>' +
                        '<p class="text-xs mt-1">History will appear here as actions are taken</p>' +
                    '</div>';
            } else {
                var btn = document.getElementById('activity-load-more');
                if (btn) btn.parentElement.remove();
            }
            return;
        }

        _activityPage++;
        var html = _buildGroupedHtml(logs);

        if (replace) {
            container.innerHTML = html;
        } else {
            var btn = document.getElementById('activity-load-more');
            if (btn) btn.parentElement.insertAdjacentHTML('beforebegin', html);
        }

        var existingBtn = document.getElementById('activity-load-more');
        if (logs.length < limit) {
            _activityDone = true;
            if (existingBtn) existingBtn.parentElement.remove();
        } else if (!existingBtn) {
            container.insertAdjacentHTML('beforeend',
                '<div class="pt-4 pb-1 text-center">' +
                    '<button id="activity-load-more" onclick="_fetchActivityPage(\'' + containerId + '\', false)" ' +
                    'class="text-sm text-primary font-medium hover:underline px-4 py-2 rounded-lg hover:bg-primary/5 transition-colors">' +
                    'Load older activity' +
                    '</button>' +
                '</div>'
            );
        }
    } catch (e) {
        _activityLoading = false;
        if (replace) {
            container.innerHTML =
                '<p class="text-sm text-red-400 text-center py-8">Could not load activity history.</p>';
        }
    }
}
