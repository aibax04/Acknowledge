/* Activity / History feed — shared across all dashboards */

var _activityPage = 0;
var _activityLoading = false;
var _activityDone = false;
var _activityEndpoint = '/activity-logs/mine';

var ACTION_META = {
    task_created:           { label: 'Task Created',           color: 'bg-blue-100 text-blue-600' },
    task_assigned:          { label: 'Task Assigned',          color: 'bg-indigo-100 text-indigo-600' },
    task_reassigned:        { label: 'Task Reassigned',        color: 'bg-indigo-100 text-indigo-600' },
    task_edited:            { label: 'Task Edited',            color: 'bg-slate-100 text-slate-600' },
    task_status_changed:    { label: 'Status Changed',         color: 'bg-cyan-100 text-cyan-600' },
    task_completed:         { label: 'Task Completed',         color: 'bg-emerald-100 text-emerald-600' },
    leave_requested:        { label: 'Leave Applied',          color: 'bg-amber-100 text-amber-600' },
    leave_approved:         { label: 'Leave Approved',         color: 'bg-green-100 text-green-600' },
    leave_rejected:         { label: 'Leave Rejected',         color: 'bg-red-100 text-red-600' },
    leave_cancelled:        { label: 'Leave Cancelled',        color: 'bg-gray-100 text-gray-500' },
    attendance_requested:   { label: 'Attendance Request',     color: 'bg-orange-100 text-orange-600' },
    attendance_approved:    { label: 'Attendance Approved',    color: 'bg-green-100 text-green-600' },
    attendance_rejected:    { label: 'Attendance Rejected',    color: 'bg-red-100 text-red-600' },
    project_created:        { label: 'Project Created',        color: 'bg-purple-100 text-purple-600' },
    project_edited:         { label: 'Project Edited',         color: 'bg-violet-100 text-violet-600' },
    project_member_added:   { label: 'Member Added',           color: 'bg-teal-100 text-teal-600' },
    project_member_removed: { label: 'Member Removed',         color: 'bg-rose-100 text-rose-600' },
};

function _actEsc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _formatActivityTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var now = new Date();
    var diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function _renderActivityItem(log) {
    var meta = ACTION_META[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-500' };
    return '<div class="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">' +
        '<span class="mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase whitespace-nowrap flex-shrink-0 ' + meta.color + '">' + _actEsc(meta.label) + '</span>' +
        '<div class="flex-1 min-w-0">' +
            '<p class="text-sm text-gray-800 leading-snug">' + _actEsc(log.description) + '</p>' +
            '<p class="text-xs text-gray-400 mt-0.5">' + _formatActivityTime(log.created_at) + '</p>' +
        '</div>' +
    '</div>';
}

async function loadActivityFeed(containerId, isSenior) {
    _activityEndpoint = isSenior ? '/activity-logs/' : '/activity-logs/mine';
    _activityPage = 0;
    _activityDone = false;
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Loading history...</p>';
    await _fetchActivityPage(containerId, true);
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
                container.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No activity yet. History will appear here as actions are taken.</p>';
            } else {
                var btn = document.getElementById('activity-load-more');
                if (btn) btn.remove();
            }
            return;
        }
        _activityPage++;
        var html = logs.map(_renderActivityItem).join('');
        if (replace) {
            container.innerHTML = html;
        } else {
            var btn = document.getElementById('activity-load-more');
            if (btn) btn.insertAdjacentHTML('beforebegin', html);
        }
        // Add/update load-more button
        var existingBtn = document.getElementById('activity-load-more');
        if (logs.length < limit) {
            _activityDone = true;
            if (existingBtn) existingBtn.remove();
        } else if (!existingBtn) {
            container.insertAdjacentHTML('beforeend',
                '<div class="text-center pt-4"><button id="activity-load-more" onclick="_fetchActivityPage(\'' + containerId + '\', false)" class="text-sm text-primary hover:underline">Load more</button></div>'
            );
        }
    } catch (e) {
        _activityLoading = false;
        if (replace) container.innerHTML = '<p class="text-sm text-red-400 text-center py-8">Could not load activity history.</p>';
    }
}
