document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('access_token')) {
        window.location.href = 'login.html';
        return;
    }

    // Set user info
    let userName = localStorage.getItem('user_name');
    let userRole = localStorage.getItem('user_role');

    if (!userName) {
        try {
            const user = await Api.getProfile();
            userName = user.full_name;
            userRole = user.role;
            localStorage.setItem('user_name', userName);
            localStorage.setItem('user_role', userRole);
        } catch (e) {
            console.error("Failed to load profile", e);
        }
    }

    if (userName) {
        document.getElementById('user-name').innerText = userName;
        const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        document.getElementById('user-avatar').innerText = initials;
    }
    if (userRole) {
        document.getElementById('user-role').innerText = userRole.charAt(0).toUpperCase() + userRole.slice(1);
    }

    try {
        const stats = await Api.get('/dashboard/stats');
        document.getElementById('stat-compliance-rate').innerText = stats.compliance_rate;
        document.getElementById('stat-open-concerns').innerText = stats.open_concerns;

        const policies = await Api.get('/policies');
        renderAuditLog(policies);

    } catch (e) {
        console.error(e);
    }

    document.getElementById('logoutBtn')?.addEventListener('click', () => Api.logout());
});

function renderAuditLog(policies) {
    const tbody = document.getElementById('audit-log-body');
    tbody.innerHTML = '';

    if (policies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">No policies found</td></tr>';
        return;
    }

    policies.forEach(policy => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 text-sm font-medium text-gray-900">${policy.title}</td>
            <td class="px-6 py-4"><span class="text-${policy.is_active ? 'green' : 'gray'}-600 text-xs font-bold uppercase">${policy.is_active ? 'Active' : 'Archived'}</span></td>
            <td class="px-6 py-4 text-sm text-gray-500">- / - Employees</td> 
            <td class="px-6 py-4 text-sm text-gray-500">${new Date(policy.created_at).toLocaleDateString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

// End of file
