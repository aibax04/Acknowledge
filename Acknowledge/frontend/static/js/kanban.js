/**
 * Kanban dashboard – polished, professional look.
 * Renders ventures with member avatars, task cards with priority chips,
 * status columns with coloured headers, and smooth move-to dropdowns.
 * Data: GET /ventures/kanban
 */
(function (global) {
    'use strict';

    const STATUSES = [
        { id: 'pending', label: 'Pending', dot: '#94a3b8', bg: 'background:#f8fafc;', headerBg: '#f1f5f9', headerText: '#475569', border: '#e2e8f0', badge: 'background:#f1f5f9;color:#475569;' },
        { id: 'in_progress', label: 'In Progress', dot: '#3b82f6', bg: 'background:#eff6ff;', headerBg: '#dbeafe', headerText: '#1e40af', border: '#bfdbfe', badge: 'background:#dbeafe;color:#1e40af;' },
        { id: 'review', label: 'Review', dot: '#f59e0b', bg: 'background:#fffbeb;', headerBg: '#fef3c7', headerText: '#92400e', border: '#fde68a', badge: 'background:#fef3c7;color:#92400e;' },
        { id: 'completed', label: 'Completed', dot: '#10b981', bg: 'background:#ecfdf5;', headerBg: '#d1fae5', headerText: '#065f46', border: '#a7f3d0', badge: 'background:#d1fae5;color:#065f46;' }
    ];

    function esc(s) {
        if (s == null || s === '') return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function initialsFor(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }

    function avatarColors(name) {
        const palettes = [
            ['#dbeafe', '#1e40af'], ['#d1fae5', '#065f46'], ['#fce7f3', '#9d174d'],
            ['#fef3c7', '#92400e'], ['#ede9fe', '#5b21b6'], ['#e0e7ff', '#3730a3'],
            ['#ccfbf1', '#134e4a'], ['#fce4ec', '#880e4f'], ['#e8eaf6', '#283593']
        ];
        let hash = 0;
        for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return palettes[Math.abs(hash) % palettes.length];
    }

    function miniAvatar(name, size) {
        size = size || 24;
        const [bg, fg] = avatarColors(name || '');
        const fs = Math.round(size * 0.42);
        return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:${fg};font-size:${fs}px;font-weight:600;flex-shrink:0;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.06);" title="${esc(name)}">${initialsFor(name)}</span>`;
    }

    function priorityChip(p) {
        const m = {
            high: 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca;',
            medium: 'background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;',
            low: 'background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb;'
        };
        const icons = { high: '↑', medium: '–', low: '↓' };
        const style = m[p] || m.medium;
        return `<span style="${style}display:inline-flex;align-items:center;gap:2px;padding:1px 7px;border-radius:9999px;font-size:11px;font-weight:600;line-height:18px;text-transform:capitalize;">${icons[p] || '–'} ${esc(p)}</span>`;
    }

    function taskCard(task, isAssignee) {
        const assigneeName = task.assigned_to ? esc(task.assigned_to.full_name) : 'Unassigned';
        const createdByName = task.created_by ? esc(task.created_by.full_name) : '—';
        const priority = (task.priority || 'medium').toLowerCase();

        let moveHtml = '';
        if (isAssignee && typeof Api !== 'undefined' && typeof showToast === 'function') {
            const opts = STATUSES.filter(s => s.id !== task.status).map(s =>
                `<button type="button" class="kanban-move-opt" style="display:block;width:100%;text-align:left;padding:6px 12px;font-size:12px;border:none;background:none;cursor:pointer;border-radius:6px;color:#374151;" onmouseenter="this.style.background='#f3f4f6'" onmouseleave="this.style.background='none'" onclick="window.kanbanMoveTask(${task.id},'${s.id}')"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.dot};margin-right:6px;"></span>${s.label}</button>`
            ).join('');
            moveHtml = `<div style="margin-top:8px;border-top:1px solid #f3f4f6;padding-top:6px;position:relative;">
                <button type="button" style="font-size:11px;color:#6b7280;font-weight:500;background:none;border:1px solid #e5e7eb;padding:3px 10px;border-radius:6px;cursor:pointer;transition:all .15s;" onmouseenter="this.style.borderColor='#10b981';this.style.color='#10b981'" onmouseleave="this.style.borderColor='#e5e7eb';this.style.color='#6b7280'" onclick="document.querySelectorAll('.kanban-dropdown-panel').forEach(function(p){p.classList.add('hidden')});this.nextElementSibling.classList.toggle('hidden')">Move to ▾</button>
                <div class="kanban-dropdown-panel hidden" style="position:absolute;left:0;top:100%;margin-top:4px;background:white;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 10px 25px -5px rgba(0,0,0,.1),0 4px 6px -2px rgba(0,0,0,.05);padding:4px;z-index:30;min-width:140px;">${opts}</div>
            </div>`;
        }

        return `<div class="kanban-card" style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;transition:all .2s;cursor:default;margin-bottom:8px;" onmouseenter="this.style.boxShadow='0 4px 12px rgba(0,0,0,.08)';this.style.borderColor='#d1d5db'" onmouseleave="this.style.boxShadow='none';this.style.borderColor='#e5e7eb'" data-task-id="${task.id}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <p style="font-size:13px;font-weight:600;color:#111827;line-height:1.4;margin:0;flex:1;min-width:120px;">${esc(task.title)}</p>
                <div style="flex-shrink:0;">${priorityChip(priority)}</div>
            </div>
            ${task.description ? `<p style="font-size:12px;color:#6b7280;margin:6px 0 0;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(task.description)}</p>` : ''}
            <div style="display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;">
                <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#6b7280;">${miniAvatar(assigneeName, 20)} ${assigneeName}</span>
                <span style="color:#d1d5db;font-size:10px;">•</span>
                <span style="font-size:11px;color:#9ca3af;" title="Assigned by ${createdByName}">by ${createdByName}</span>
            </div>
            ${moveHtml}
        </div>`;
    }

    function renderBoard(item) {
        const v = item.venture;
        const tasks = item.tasks || [];
        const creatorName = v.creator ? esc(v.creator.full_name) : '—';
        const members = v.members || [];

        const memberAvatarsHtml = members.length
            ? `<div style="display:flex;align-items:center;">` +
            members.slice(0, 6).map((m, i) => `<span style="margin-left:${i === 0 ? '0' : '-6px'};position:relative;z-index:${6 - i};">${miniAvatar(m.full_name, 28)}</span>`).join('') +
            (members.length > 6 ? `<span style="margin-left:-6px;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#f3f4f6;color:#6b7280;font-size:11px;font-weight:600;border:2px solid white;">+${members.length - 6}</span>` : '') +
            `</div>`
            : '<span style="font-size:12px;color:#9ca3af;">No members</span>';

        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const columnsHtml = STATUSES.map(col => {
            const colTasks = tasks.filter(t => t.status === col.id);
            const cardsHtml = colTasks.length
                ? colTasks.map(t => taskCard(t, global._kanbanCurrentUserId != null && t.assigned_to && t.assigned_to.id === global._kanbanCurrentUserId)).join('')
                : `<div style="text-align:center;padding:20px 8px;color:#cbd5e1;font-size:12px;"><svg style="margin:0 auto 6px;display:block;" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>No tasks</div>`;

            return `<div class="kanban-column" style="${col.bg}border:1px solid ${col.border};border-radius:12px;padding:0;min-width:260px;width:260px;flex-shrink:0;display:flex;flex-direction:column;max-height:520px;">
                <div style="padding:12px 14px 10px;border-bottom:1px solid ${col.border};display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:7px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${col.dot};flex-shrink:0;"></span>
                        <span style="font-size:13px;font-weight:600;color:${col.headerText};">${col.label}</span>
                    </div>
                    <span style="${col.badge}font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;">${colTasks.length}</span>
                </div>
                <div class="kanban-col-body" style="padding:10px;overflow-y:auto;flex:1;min-height:80px;">${cardsHtml}</div>
            </div>`;
        }).join('');

        return `<section style="margin-bottom:32px;background:white;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.04);overflow:hidden;">
            <div style="padding:20px 24px 16px;border-bottom:1px solid #f3f4f6;">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                    <div>
                        <h3 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 4px;">${esc(v.name)}</h3>
                        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                            Manager: <span style="font-weight:600;color:#374151;">${creatorName}</span>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:flex-end;">
                        <div style="text-align:right;">
                            <div style="font-size:11px;color:#9ca3af;margin-bottom:3px;">${completedTasks}/${totalTasks} tasks done</div>
                            <div style="width:100px;height:5px;background:#f1f5f9;border-radius:999px;overflow:hidden;">
                                <div style="height:100%;width:${progressPct}%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:999px;transition:width .4s;"></div>
                            </div>
                        </div>
                        ${memberAvatarsHtml}
                    </div>
                </div>
            </div>
            <div style="padding:16px 20px 20px;overflow-x:auto;" class="kanban-scroll">
                <div style="display:flex;gap:14px;">${columnsHtml}</div>
            </div>
        </section>`;
    }

    function renderKanban(container, data) {
        if (!container) return;
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:60px 20px;">
                    <div style="width:64px;height:64px;margin:0 auto 16px;background:#f1f5f9;border-radius:16px;display:flex;align-items:center;justify-content:center;">
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"/>
                        </svg>
                    </div>
                    <p style="font-size:16px;font-weight:600;color:#374151;margin:0 0 4px;">No projects yet</p>
                    <p style="font-size:13px;color:#9ca3af;">When you're added to a project, your Kanban board will appear here.</p>
                </div>`;
            return;
        }

        let pendingCount = 0;
        let inProgressCount = 0;
        let reviewCount = 0;
        let completedCount = 0;

        data.forEach(item => {
            if (item.tasks) {
                item.tasks.forEach(t => {
                    if (t.status === 'pending') pendingCount++;
                    else if (t.status === 'in_progress') inProgressCount++;
                    else if (t.status === 'review') reviewCount++;
                    else if (t.status === 'completed') completedCount++;
                });
            }
        });

        const totalTasks = pendingCount + inProgressCount + reviewCount + completedCount;
        let chartHtml = '';

        if (totalTasks > 0) {
            const pPct = (pendingCount / totalTasks) * 100;
            const iPct = (inProgressCount / totalTasks) * 100;
            const rPct = (reviewCount / totalTasks) * 100;
            const cPct = (completedCount / totalTasks) * 100;

            const pDeg = (pPct / 100) * 360;
            const iDeg = (iPct / 100) * 360;
            const rDeg = (rPct / 100) * 360;
            const cDeg = (cPct / 100) * 360;

            chartHtml = `
            <div style="background:white; border:1px solid #e5e7eb; border-radius:16px; padding:24px; margin-bottom:24px; display:flex; align-items:center; gap:32px; box-shadow:0 4px 20px rgba(0,0,0,0.04); flex-wrap:wrap; animation: pieChartIn 0.5s ease-out forwards;">
                <div style="flex-shrink:0;">
                    <div style="width:160px; height:160px; border-radius:50%; background: conic-gradient(
                        #94a3b8 0deg ${pDeg}deg, 
                        #3b82f6 ${pDeg}deg ${pDeg + iDeg}deg, 
                        #f59e0b ${pDeg + iDeg}deg ${pDeg + iDeg + rDeg}deg, 
                        #10b981 ${pDeg + iDeg + rDeg}deg 360deg
                    ); position:relative; display:flex; align-items:center; justify-content:center; box-shadow: inset 0 2px 10px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.05); transition: transform 0.3s ease;" onmouseenter="this.style.transform='scale(1.05)'" onmouseleave="this.style.transform='scale(1)'">
                        <div style="width:105px; height:105px; background:white; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-direction:column; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                            <span style="font-size:26px; font-weight:800; color:#111827; line-height:1;">${totalTasks}</span>
                            <span style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px; margin-top:4px;">Tasks</span>
                        </div>
                    </div>
                </div>
                <div style="flex:1; min-width:200px;">
                    <h3 style="font-size:18px; font-weight:700; color:#111827; margin:0 0 16px;">Overall Task Distribution</h3>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:16px;">
                        <div style="background:#f8fafc; padding:12px; border-radius:10px; border:1px solid #f1f5f9;">
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                                <span style="width:10px; height:10px; border-radius:50%; background:#94a3b8;"></span>
                                <span style="font-size:13px; font-weight:600; color:#475569;">Pending</span>
                            </div>
                            <div style="font-size:18px; font-weight:700; color:#1f2937;">${pendingCount} <span style="font-size:12px; font-weight:500; color:#9ca3af;">(${Math.round(pPct)}%)</span></div>
                        </div>
                        <div style="background:#eff6ff; padding:12px; border-radius:10px; border:1px solid #e0e7ff;">
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                                <span style="width:10px; height:10px; border-radius:50%; background:#3b82f6;"></span>
                                <span style="font-size:13px; font-weight:600; color:#1e40af;">In Progress</span>
                            </div>
                            <div style="font-size:18px; font-weight:700; color:#1e3a8a;">${inProgressCount} <span style="font-size:12px; font-weight:500; color:#60a5fa;">(${Math.round(iPct)}%)</span></div>
                        </div>
                        <div style="background:#fffbeb; padding:12px; border-radius:10px; border:1px solid #fef3c7;">
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                                <span style="width:10px; height:10px; border-radius:50%; background:#f59e0b;"></span>
                                <span style="font-size:13px; font-weight:600; color:#92400e;">Review</span>
                            </div>
                            <div style="font-size:18px; font-weight:700; color:#78350f;">${reviewCount} <span style="font-size:12px; font-weight:500; color:#fbbf24;">(${Math.round(rPct)}%)</span></div>
                        </div>
                        <div style="background:#ecfdf5; padding:12px; border-radius:10px; border:1px solid #d1fae5;">
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                                <span style="width:10px; height:10px; border-radius:50%; background:#10b981;"></span>
                                <span style="font-size:13px; font-weight:600; color:#065f46;">Completed</span>
                            </div>
                            <div style="font-size:18px; font-weight:700; color:#064e3b;">${completedCount} <span style="font-size:12px; font-weight:500; color:#34d399;">(${Math.round(cPct)}%)</span></div>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        container.innerHTML = chartHtml + data.map(renderBoard).join('');
    }

    async function loadKanbanDashboard(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (typeof Api === 'undefined') {
            container.innerHTML = '<p style="color:#6b7280;text-align:center;padding:32px;">API not available.</p>';
            return;
        }

        container.innerHTML = `<div style="display:flex;gap:14px;padding:20px 0;">` +
            [1, 2, 3, 4].map(() => `<div style="width:260px;flex-shrink:0;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:14px;">
                <div style="height:14px;width:60%;background:#e2e8f0;border-radius:6px;margin-bottom:14px;animation:kanbanPulse 1.5s ease-in-out infinite;"></div>
                <div style="height:70px;background:#e2e8f0;border-radius:8px;margin-bottom:8px;animation:kanbanPulse 1.5s ease-in-out infinite;animation-delay:.2s;"></div>
                <div style="height:70px;background:#e2e8f0;border-radius:8px;animation:kanbanPulse 1.5s ease-in-out infinite;animation-delay:.4s;"></div>
            </div>`).join('') + `</div>`;

        try {
            const data = await Api.get('/ventures/kanban');
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.id) global._kanbanCurrentUserId = currentUser.id;
            else global._kanbanCurrentUserId = null;
            renderKanban(container, data);
        } catch (e) {
            console.error('Kanban load failed:', e);
            var msg = (e && e.message) ? e.message : 'Unable to load Kanban.';
            if (msg.indexOf('integer') !== -1 || msg.indexOf('422') !== -1) msg = 'Kanban is not available yet. Refresh or try again shortly.';
            container.innerHTML = `<div style="text-align:center;padding:40px 20px;">
                <div style="width:48px;height:48px;margin:0 auto 12px;background:#fef3c7;border-radius:12px;display:flex;align-items:center;justify-content:center;">
                    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <p style="font-size:14px;font-weight:600;color:#92400e;">${esc(msg)}</p>
            </div>`;
        }
    }

    function kanbanMoveTask(taskId, newStatus) {
        if (typeof Api === 'undefined' || typeof showToast !== 'function') return;
        Api.put('/tasks/' + taskId, { status: newStatus })
            .then(function () {
                showToast('Task status updated');
                var container = document.getElementById('projects-kanban-container');
                if (container) loadKanbanDashboard('projects-kanban-container');
            })
            .catch(function (err) { showToast(err.message || 'Update failed', 'error'); });
    }

    if (!document.getElementById('kanban-dynamic-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'kanban-dynamic-styles';
        styleEl.textContent = `
            @keyframes pieChartIn { 0%{transform:scale(0.9);opacity:0;} 100%{transform:scale(1);opacity:1;} }
            @keyframes kanbanPulse { 0%,100%{opacity:.6} 50%{opacity:1} }
            .kanban-scroll::-webkit-scrollbar { height:6px; }
            .kanban-scroll::-webkit-scrollbar-track { background:transparent; }
            .kanban-scroll::-webkit-scrollbar-thumb { background:#d1d5db;border-radius:6px; }
            .kanban-scroll::-webkit-scrollbar-thumb:hover { background:#9ca3af; }
            .kanban-scroll { scrollbar-width:thin;scrollbar-color:#d1d5db transparent; }
            .kanban-col-body::-webkit-scrollbar { width:4px; }
            .kanban-col-body::-webkit-scrollbar-track { background:transparent; }
            .kanban-col-body::-webkit-scrollbar-thumb { background:#d1d5db;border-radius:4px; }
            .kanban-col-body { scrollbar-width:thin;scrollbar-color:#d1d5db transparent; }
            @media (max-width: 640px) {
                .kanban-column { min-width: 280px !important; width: 280px !important; }
                .kanban-dropdown-panel { position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: 90% !important; max-width: 300px !important; }
            }
        `;
        document.head.appendChild(styleEl);
    }

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.kanban-dropdown-panel') && !e.target.closest('[onclick*="kanban-dropdown-panel"]') && !e.target.closest('button[onclick*="classList.toggle"]')) {
            document.querySelectorAll('.kanban-dropdown-panel').forEach(function (p) { p.classList.add('hidden'); });
        }
    });

    global.loadKanbanDashboard = loadKanbanDashboard;
    global.renderKanban = renderKanban;
    global.kanbanMoveTask = kanbanMoveTask;
})(typeof window !== 'undefined' ? window : this);
