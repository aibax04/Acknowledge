/**
 * Organization directory search - shown at top of senior, manager, employee, intern pages.
 * Read-only: users can search and view the org directory only.
 */
(function () {
    const searchEl = document.getElementById('org-directory-search');
    const dropdownEl = document.getElementById('org-directory-dropdown');
    if (!searchEl || !dropdownEl) return;

    let allUsers = [];
    let dropdownOpen = false;

    function roleLabel(role) {
        if (!role) return '—';
        const r = String(role).toLowerCase();
        if (r === 'senior') return 'Senior';
        if (r === 'manager') return 'Manager';
        if (r === 'employee') return 'Employee';
        if (r === 'intern') return 'Intern';
        return role;
    }

    function filterUsers(query) {
        const q = (query || '').toLowerCase().trim();
        if (!q) return allUsers;
        return allUsers.filter(function (u) {
            const name = (u.full_name || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            const role = roleLabel(u.role).toLowerCase();
            return name.includes(q) || email.includes(q) || role.includes(q);
        });
    }

    function escapeHtml(s) {
        if (s == null || s === '') return '';
        var div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function renderDropdown(filtered) {
        if (filtered.length === 0) {
            dropdownEl.innerHTML = '<div class="p-4 text-sm text-gray-500 text-center">No matching people in directory</div>';
            return;
        }
        var hasNudgeModal = !!document.getElementById('raise-concern-modal');
        var hasNotifyModal = !!document.getElementById('notify-modal');
        dropdownEl.innerHTML = filtered.map(function (u) {
            const role = roleLabel(u.role);
            const name = escapeHtml(u.full_name || '—');
            const email = escapeHtml(u.email || '');
            var actionBtn = '';
            if (hasNudgeModal) {
                actionBtn = '<button type="button" class="org-directory-nudge-btn text-xs font-medium text-primary hover:text-primary-hover whitespace-nowrap" data-user-id="' + escapeHtml(String(u.id)) + '" title="Create nudge to this person">Create nudge</button>';
            } else if (hasNotifyModal) {
                var safeName = (u.full_name || '').replace(/"/g, '&quot;');
                actionBtn = '<button type="button" class="org-directory-notify-btn text-xs font-medium text-primary hover:text-primary-hover whitespace-nowrap" data-user-id="' + escapeHtml(String(u.id)) + '" data-user-name="' + safeName + '" title="Notify this person">Notify</button>';
            }
            return '<div class="px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center justify-between gap-3">' +
                '<div class="min-w-0 flex-1">' +
                '<p class="text-sm font-medium text-gray-900 truncate">' + name + '</p>' +
                '<p class="text-xs text-gray-500 truncate">' + role + ' · ' + email + '</p>' +
                '</div>' +
                (actionBtn ? '<div class="flex-shrink-0">' + actionBtn + '</div>' : '') +
                '</div>';
        }).join('');
        dropdownEl.querySelectorAll('.org-directory-nudge-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var userId = btn.getAttribute('data-user-id');
                if (userId && typeof window.openRaiseConcernForUser === 'function') {
                    window.openRaiseConcernForUser(parseInt(userId, 10));
                    hideDropdown();
                }
            });
        });
        dropdownEl.querySelectorAll('.org-directory-notify-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var userId = btn.getAttribute('data-user-id');
                var userName = btn.getAttribute('data-user-name') || '';
                if (userId && typeof window.openNotifyForUser === 'function') {
                    window.openNotifyForUser(parseInt(userId, 10), userName);
                    hideDropdown();
                }
            });
        });
    }

    function showDropdown() {
        dropdownOpen = true;
        dropdownEl.classList.remove('hidden');
    }

    function hideDropdown() {
        dropdownOpen = false;
        dropdownEl.classList.add('hidden');
    }

    function onSearch() {
        const query = searchEl.value;
        const filtered = filterUsers(query);
        renderDropdown(filtered);
        showDropdown();
    }

    function loadAndShow() {
        if (allUsers.length === 0) {
            dropdownEl.innerHTML = '<div class="p-4 text-sm text-gray-500 text-center">Loading directory...</div>';
            showDropdown();
            Api.get('/auth/all-users')
                .then(function (users) {
                    allUsers = users || [];
                    onSearch();
                })
                .catch(function (err) {
                    dropdownEl.innerHTML = '<div class="p-4 text-sm text-red-500 text-center">Could not load directory</div>';
                });
        } else {
            onSearch();
        }
    }

    searchEl.addEventListener('focus', loadAndShow);
    searchEl.addEventListener('input', function () {
        if (allUsers.length > 0) onSearch();
    });

    document.addEventListener('click', function (e) {
        if (dropdownOpen && !searchEl.contains(e.target) && !dropdownEl.contains(e.target)) {
            hideDropdown();
        }
    });
})();
