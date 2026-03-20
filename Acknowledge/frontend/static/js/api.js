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
        if (response.status === 401) {
            window.location.href = 'login.html';
        }
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = typeof err.detail === 'string' ? err.detail : (Array.isArray(err.detail) ? (err.detail[0]?.msg || err.detail[0]) : err.detail);
            throw new Error(msg || response.statusText || 'API Request failed');
        }
        return response.json();
    }

    static async post(endpoint, data) {
        const response = await fetch(`${getApiUrl()}${endpoint}`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const d = err.detail;
            let msg = response.statusText || 'API Request failed';
            if (typeof d === 'string') msg = d;
            else if (Array.isArray(d) && d.length) {
                const first = d[0];
                msg = (first && (first.msg || first.message)) || String(first);
            } else if (d && typeof d === 'object' && (d.msg || d.message)) msg = d.msg || d.message;
            throw new Error(msg);
        }
        return response.json();
    }

    static async put(endpoint, data) {
        const response = await fetch(`${getApiUrl()}${endpoint}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = typeof err.detail === 'string' ? err.detail : (Array.isArray(err.detail) ? (err.detail[0]?.msg || err.detail[0]) : err.detail);
            throw new Error(msg || response.statusText || 'API Request failed');
        }
        return response.json();
    }

    static async patch(endpoint, data = null) {
        const response = await fetch(`${getApiUrl()}${endpoint}`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: data ? JSON.stringify(data) : undefined
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = typeof err.detail === 'string' ? err.detail : (Array.isArray(err.detail) ? (err.detail[0]?.msg || err.detail[0]) : err.detail);
            throw new Error(msg || response.statusText || 'API Request failed');
        }
        return response.json();
    }

    static async delete(endpoint) {
        const response = await fetch(`${getApiUrl()}${endpoint}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = typeof err.detail === 'string' ? err.detail : (Array.isArray(err.detail) ? (err.detail[0]?.msg || err.detail[0]) : err.detail);
            throw new Error(msg || response.statusText || 'API Request failed');
        }
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
