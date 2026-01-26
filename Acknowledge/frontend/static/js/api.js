const API_URL = "http://localhost:8000";

class Api {
    static getHeaders() {
        const token = localStorage.getItem('access_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        };
    }

    static async get(endpoint) {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        if (response.status === 401) {
            window.location.href = 'login.html';
        }
        return response.json();
    }

    static async post(endpoint, data) {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'API Request failed');
        }
        return response.json();
    }

    static async put(endpoint, data) {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'API Request failed');
        }
        return response.json();
    }

    static async delete(endpoint) {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'API Request failed');
        }
        return response.json();
    }

    // Auth specific (form data usually)
    static async login(username, password) {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }
        return response.json();
    }

    static async getProfile() {
        const response = await fetch(`${API_URL}/auth/me`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        if (!response.ok) {
            throw new Error('Failed to fetch profile');
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
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        return response;
    }
}
