/** Format a date value as DD/MM/YYYY */
function fmtDate(val) {
    if (!val) return '—';
    var d = (val instanceof Date) ? val : new Date(val);
    if (isNaN(d)) return String(val);
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
}

/** Format a datetime value as DD/MM/YYYY, HH:MM */
function fmtDateTime(val) {
    if (!val) return '—';
    var d = (val instanceof Date) ? val : new Date(val);
    if (isNaN(d)) return String(val);
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    var hh = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return dd + '/' + mm + '/' + yyyy + ', ' + hh + ':' + min;
}

function getApiUrl() {
    if (typeof localStorage !== 'undefined') {
        var base = localStorage.getItem('API_BASE');
        if (base && base.trim()) return base.trim().replace(/\/$/, '');
        if (localStorage.getItem('USE_LOCAL_BACKEND') === '1') return 'http://localhost:8000';
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:8000';
    }
    return '/api';
}
const API_URL = getApiUrl();

function showInactiveLockScreen(message) {
    if (document.getElementById('__inactive-lock-screen')) return;
    var overlay = document.createElement('div');
    overlay.id = '__inactive-lock-screen';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="position:absolute;inset:0;background:rgba(15,23,42,0.55);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);"></div>
        <div style="position:relative;max-width:420px;width:90%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);border-radius:24px;padding:40px 36px;box-shadow:0 25px 60px rgba(0,0,0,0.4);text-align:center;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);">
            <div style="width:68px;height:68px;background:rgba(239,68,68,0.18);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;border:1.5px solid rgba(239,68,68,0.35);">
                <svg width="32" height="32" fill="none" stroke="#f87171" stroke-width="2" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
            </div>
            <h2 style="color:#fff;font-size:1.35rem;font-weight:700;margin:0 0 10px;letter-spacing:-0.02em;">Account Suspended</h2>
            <p style="color:rgba(255,255,255,0.7);font-size:0.95rem;line-height:1.6;margin:0 0 28px;">${message || 'Your account has been marked inactive. Please contact your administrator to regain access.'}</p>
            <button onclick="localStorage.removeItem('access_token');window.location.href='login.html';" style="background:rgba(239,68,68,0.85);color:#fff;border:none;border-radius:12px;padding:12px 28px;font-size:0.95rem;font-weight:600;cursor:pointer;width:100%;transition:background 0.2s;" onmouseover="this.style.background='rgba(220,38,38,0.95)'" onmouseout="this.style.background='rgba(239,68,68,0.85)'">
                Sign Out
            </button>
        </div>`;
    document.body.appendChild(overlay);
}

function _handleApiResponse(response, errorJson) {
    const d = errorJson && errorJson.detail;
    let msg = response.statusText || 'API Request failed';
    if (typeof d === 'string') msg = d;
    else if (Array.isArray(d) && d.length) {
        const first = d[0];
        msg = (first && (first.msg || first.message)) || String(first);
    } else if (d && typeof d === 'object' && (d.msg || d.message)) msg = d.msg || d.message;
    if (response.status === 403 && msg && msg.toLowerCase().includes('inactive')) {
        showInactiveLockScreen(msg);
    }
    throw new Error(msg);
}

class Api {
    static getApiUrl() {
        return getApiUrl();
    }

    static getHeaders() {
        const token = localStorage.getItem('access_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        };
    }

    static async get(endpoint) {
        const response = await fetch(`${getApiUrl()}${endpoint}`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        if (response.status === 401) { window.location.href = 'login.html'; }
        if (!response.ok) { const err = await response.json().catch(() => ({})); _handleApiResponse(response, err); }
        return response.json();
    }

    static async post(endpoint, data) {
        const response = await fetch(`${getApiUrl()}${endpoint}`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) { const err = await response.json().catch(() => ({})); _handleApiResponse(response, err); }
        return response.json();
    }

    static async put(endpoint, data) {
        const response = await fetch(`${getApiUrl()}${endpoint}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) { const err = await response.json().catch(() => ({})); _handleApiResponse(response, err); }
        return response.json();
    }

    static async patch(endpoint, data = null) {
        const response = await fetch(`${getApiUrl()}${endpoint}`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: data ? JSON.stringify(data) : undefined
        });
        if (!response.ok) { const err = await response.json().catch(() => ({})); _handleApiResponse(response, err); }
        return response.json();
    }

    static async delete(endpoint) {
        const response = await fetch(`${getApiUrl()}${endpoint}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        if (!response.ok) { const err = await response.json().catch(() => ({})); _handleApiResponse(response, err); }
        return response.json();
    }

    // Auth specific (form data usually)
    static async login(username, password) {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${getApiUrl()}/auth/login`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const detail = typeof err.detail === 'string' ? err.detail : (Array.isArray(err.detail) ? err.detail[0]?.msg : null) || err.detail;
            let msg = detail || response.statusText || 'Login failed';
            if ((response.status === 502 || response.status === 503) && !detail) {
                msg = 'Service temporarily unavailable. The database may be unreachable—try again in a moment.';
            }
            throw new Error(msg);
        }
        return response.json();
    }

    static async getProfile() {
        const response = await fetch(`${getApiUrl()}/auth/me`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        if (!response.ok) {
            throw new Error('Failed to fetch profile');
        }
        return response.json();
    }

    static async updateProfile(data) {
        const response = await fetch(`${getApiUrl()}/auth/me`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = Array.isArray(err.detail) ? (err.detail[0]?.msg || err.detail[0]) : err.detail;
            throw new Error(msg || 'Failed to update profile');
        }
        return response.json();
    }

    static logout() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_name');
        localStorage.removeItem('user_role');
        window.location.href = 'login.html';
    }

    static async getRaw(endpoint) {
        const response = await fetch(`${getApiUrl()}${endpoint}`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        return response;
    }
}
