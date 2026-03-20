/**
 * Personal To-Do list with date and priority - connected to calendar.
 * Data stored in localStorage per data-storage-key on the container.
 */
(function () {
    const container = document.getElementById('personal-todo-list-container');
    if (!container) return;

    const storageKey = container.getAttribute('data-storage-key') || 'personal_todo_list';
    const input = container.querySelector('#personal-todo-input');
    const addBtn = container.querySelector('#personal-todo-add');
    const dateInput = container.querySelector('#personal-todo-date');
    const prioritySelect = container.querySelector('#personal-todo-priority');
    const listEl = container.querySelector('#personal-todo-list');
    if (!input || !addBtn || !listEl) return;

    function loadTodos() {
        try {
            const raw = localStorage.getItem(storageKey);
            const list = raw ? JSON.parse(raw) : [];
            return list.map(function (t) {
                if (t.date === undefined) t.date = '';
                if (t.priority === undefined) t.priority = 'medium';
                return t;
            });
        } catch (e) {
            return [];
        }
    }

    function saveTodos(todos) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(todos));
        } catch (e) { }
    }

    function priorityBadgeClass(p) {
        p = (p || 'medium').toLowerCase();
        if (p === 'high') return 'bg-red-100 text-red-800';
        if (p === 'medium') return 'bg-yellow-100 text-yellow-800';
        return 'bg-blue-100 text-blue-800';
    }

    function render() {
        const todos = loadTodos();
        if (todos.length === 0) {
            listEl.innerHTML = '<li class="text-sm text-gray-500 py-4 text-center">No tasks yet. Add one above.</li>';
            return;
        }
        listEl.innerHTML = todos.map(function (t) {
            const doneClass = t.done ? 'line-through text-gray-400' : 'text-gray-900';
            const dateStr = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString() : '';
            const priority = (t.priority || 'medium').toLowerCase();
            return '<li class="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 border border-gray-100" data-todo-id="' + t.id + '">' +
                '<input type="checkbox" class="personal-todo-check rounded text-primary focus:ring-primary flex-shrink-0" ' + (t.done ? 'checked' : '') + ' aria-label="Mark done">' +
                '<div class="flex-1 min-w-0">' +
                '<span class="text-sm ' + doneClass + '">' + escapeHtml(t.text) + '</span>' +
                (dateStr ? '<span class="block text-xs text-gray-500">' + escapeHtml(dateStr) + '</span>' : '') +
                '</div>' +
                '<span class="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ' + priorityBadgeClass(priority) + '">' + (priority || 'med') + '</span>' +
                '<button type="button" class="personal-todo-delete text-red-400 hover:text-red-600 p-1 rounded flex-shrink-0" aria-label="Delete">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
                '</button></li>';
        }).join('');

        listEl.querySelectorAll('.personal-todo-check').forEach(function (cb) {
            cb.addEventListener('change', function () {
                const id = parseInt(cb.closest('li').getAttribute('data-todo-id'), 10);
                const todos = loadTodos();
                const item = todos.find(function (t) { return t.id === id; });
                if (item) { item.done = !!cb.checked; saveTodos(todos); render(); notifyCalendar(); }
            });
        });
        listEl.querySelectorAll('.personal-todo-delete').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const id = parseInt(btn.closest('li').getAttribute('data-todo-id'), 10);
                const todos = loadTodos().filter(function (t) { return t.id !== id; });
                saveTodos(todos);
                render();
                notifyCalendar();
            });
        });
    }

    function escapeHtml(s) {
        if (s == null || s === '') return '';
        var div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function notifyCalendar() {
        if (typeof window.refreshPersonalCalendar === 'function') window.refreshPersonalCalendar();
    }

    addBtn.addEventListener('click', function () {
        var text = (input.value || '').trim();
        if (!text) return;
        var dateVal = dateInput ? (dateInput.value || '').trim() : '';
        var priorityVal = prioritySelect ? (prioritySelect.value || 'medium') : 'medium';
        var todos = loadTodos();
        todos.push({ id: Date.now(), text: text, done: false, date: dateVal, priority: priorityVal });
        saveTodos(todos);
        input.value = '';
        if (dateInput) dateInput.value = '';
        if (prioritySelect) prioritySelect.value = 'medium';
        render();
        notifyCalendar();
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') addBtn.click();
    });

    window.getPersonalTodosForCalendar = function () { return loadTodos(); };
    render();
})();
