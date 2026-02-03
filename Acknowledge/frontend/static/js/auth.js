// --- TAB NAVIGATION LOGIC ---
const loginTabBtn = document.getElementById('loginTabBtn');
const signupTabBtn = document.getElementById('signupTabBtn');
const loginTab = document.getElementById('loginTab');
const signupTab = document.getElementById('signupTab');
const tabIndicator = document.getElementById('tabIndicator');

function updateTabIndicator() {
    if (!tabIndicator || !loginTabBtn || !signupTabBtn) return;
    const active = loginTabBtn.classList.contains('active') ? loginTabBtn : signupTabBtn;
    tabIndicator.style.width = active.offsetWidth + 'px';
    tabIndicator.style.left = active.offsetLeft + 'px';
}

// Position tab indicator on load and resize
if (tabIndicator) {
    setTimeout(updateTabIndicator, 100);
    window.addEventListener('resize', updateTabIndicator);
}

// Switch to Login Tab
loginTabBtn?.addEventListener('click', () => {
    loginTabBtn.classList.add('active');
    signupTabBtn.classList.remove('active');
    signupTabBtn.classList.add('text-gray-500');
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
    updateTabIndicator();
});

// Switch to Signup Tab
signupTabBtn?.addEventListener('click', () => {
    signupTabBtn.classList.add('active');
    signupTabBtn.classList.remove('text-gray-500');
    loginTabBtn.classList.remove('active');
    loginTabBtn.classList.add('text-gray-500');
    signupTab.classList.add('active');
    loginTab.classList.remove('active');
    updateTabIndicator();
});

// --- ROLE SELECTION LOGIC ---
const stepRole = document.getElementById('step-role');
const stepForm = document.getElementById('step-form');
const selectedRoleDisplay = document.getElementById('selectedRoleDisplay');
const signupRoleInput = document.getElementById('signupRole');

const microsoftSignupBtn = document.getElementById('microsoftSignupBtn');
const googleSignupBtn = document.getElementById('googleSignupBtn');

// Login buttons
const microsoftLoginBtn = document.getElementById('microsoftLoginBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');

window.selectRole = (role) => {
    if (!signupRoleInput) return;
    signupRoleInput.value = role;

    // Format display text
    if (role === 'senior') selectedRoleDisplay.innerText = "Senior Leadership";
    else selectedRoleDisplay.innerText = role.charAt(0).toUpperCase() + role.slice(1);

    // Show/hide senior signup key field
    const seniorKeyWrap = document.getElementById('senior-key-wrap');
    const seniorSignupKeyInput = document.getElementById('seniorSignupKey');
    if (seniorKeyWrap && seniorSignupKeyInput) {
        if (role === 'senior') {
            seniorKeyWrap.classList.remove('hidden');
        } else {
            seniorKeyWrap.classList.add('hidden');
            seniorSignupKeyInput.value = '';
        }
    }

    // Toggle Buttons based on Role
    if (role === 'intern') {
        microsoftSignupBtn.classList.add('hidden');
        googleSignupBtn.classList.remove('hidden');
    } else {
        microsoftSignupBtn.classList.remove('hidden');
        googleSignupBtn.classList.add('hidden');
    }

    // Switch Views with animation
    stepRole.classList.add('hidden');
    stepRole.classList.remove('block');
    stepForm.classList.remove('hidden');
    stepForm.classList.add('block');
};

window.resetRoleSelection = () => {
    stepForm.classList.add('hidden');
    stepForm.classList.remove('block');
    stepRole.classList.remove('hidden');
    stepRole.classList.add('block');
};

// Check for Intern Login Toggle (Simple heuristic for Login Tab)
// Note: Login tab doesn't have role selection, but we can default to showing both or add a toggle.
// For now, let's show both on Login Tab or toggle based on some other input?
// Simpler: Show Google Button on Login Tab always, but maybe hide Microsoft if user wants?
// Actually, let's just make both visible on Login Tab for simplicity, or keep MS default and add Google.
// The requirements say "Interns can only login through Gmail".
// So if they try to login with MS as Intern, it should fail (backend check or frontend check if possible).
// We will show both buttons on Login Tab.
if (googleLoginBtn && microsoftLoginBtn) {
    googleLoginBtn.classList.remove('hidden');
    // We could add a toggle or simpler: just show both.
}


// --- MICROSOFT OAUTH CONFIGURATION ---
const MICROSOFT_CONFIG = {
    clientId: '',
    tenantId: 'common',
    redirectUri: window.location.origin + '/pages/login.html',
    scopes: ['openid', 'profile', 'email', 'User.Read']
};

// --- GOOGLE OAUTH CONFIGURATION ---
const GOOGLE_CONFIG = {
    clientId: '', // Will be set from backend
    redirectUri: window.location.origin + '/pages/login.html',
    scopes: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
};


// Initialize Authentication Configs
async function initAuthConfigs() {
    try {
        // Microsoft
        const msRes = await fetch(`${Api.getApiUrl()}/auth/microsoft/config`);
        if (msRes.ok) {
            const config = await msRes.json();
            MICROSOFT_CONFIG.clientId = config.client_id;
            MICROSOFT_CONFIG.tenantId = config.tenant_id || 'common';
        }

        // Google
        const googleRes = await fetch(`${Api.getApiUrl()}/auth/google/config`);
        if (googleRes.ok) {
            const config = await googleRes.json();
            GOOGLE_CONFIG.clientId = config.client_id;
        }
    } catch (error) {
        console.log('Auth config not available:', error.message);
    }
}

// Generate Microsoft OAuth URL
function getMicrosoftAuthUrl(isSignup = false, role = 'employee') {
    const state = JSON.stringify({
        action: isSignup ? 'signup' : 'login',
        role: role,
        provider: 'microsoft',
        nonce: Math.random().toString(36).substring(2)
    });
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
        client_id: MICROSOFT_CONFIG.clientId,
        response_type: 'code',
        redirect_uri: MICROSOFT_CONFIG.redirectUri,
        scope: MICROSOFT_CONFIG.scopes.join(' '),
        response_mode: 'query',
        state: btoa(state)
    });

    return `https://login.microsoftonline.com/${MICROSOFT_CONFIG.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

// Generate Google OAuth URL
function getGoogleAuthUrl(isSignup = false, role = 'intern') {
    const state = JSON.stringify({
        action: isSignup ? 'signup' : 'login',
        role: role,
        provider: 'google',
        nonce: Math.random().toString(36).substring(2)
    });
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
        client_id: GOOGLE_CONFIG.clientId,
        redirect_uri: GOOGLE_CONFIG.redirectUri,
        response_type: 'code',
        scope: GOOGLE_CONFIG.scopes,
        access_type: 'offline',
        state: btoa(state),
        prompt: 'consent'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}


// Handle OAuth Callback (Both MS and Google)
async function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const stateParam = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
        alert('Authentication Error: ' + (urlParams.get('error_description') || error));
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    if (code && stateParam) {
        try {
            // Verify state
            const storedState = sessionStorage.getItem('oauth_state');
            // Basic validation could go here

            let parsedState = {};
            try {
                parsedState = JSON.parse(atob(stateParam));
            } catch (e) {
                console.warn('Could not parse state parameter');
            }

            const provider = parsedState.provider || 'microsoft';

            // Show loading state
            showLoadingOverlay(`Authenticating with ${provider.charAt(0).toUpperCase() + provider.slice(1)}...`);

            let endpoint = '';
            let payload = {};

            if (provider === 'google') {
                endpoint = '/auth/google/callback';
                payload = {
                    code: code,
                    redirect_uri: GOOGLE_CONFIG.redirectUri,
                    action: parsedState.action || 'login',
                    role: parsedState.role || 'intern'
                };
            } else {
                endpoint = '/auth/microsoft/callback';
                payload = {
                    code: code,
                    redirect_uri: MICROSOFT_CONFIG.redirectUri,
                    action: parsedState.action || 'login',
                    role: parsedState.role || 'employee'
                };
            }
            if (parsedState.role === 'senior' && parsedState.action === 'signup') {
                const seniorKey = sessionStorage.getItem('senior_signup_key');
                if (seniorKey) {
                    payload.senior_signup_key = seniorKey;
                    sessionStorage.removeItem('senior_signup_key');
                }
            }

            // Exchange code for token via backend
            const response = await fetch(`${Api.getApiUrl()}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Authentication failed');
            }

            const data = await response.json();

            // Store tokens and user info
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('user_name', data.user.full_name);
            localStorage.setItem('user_role', data.user.role);

            // Clear OAuth state
            sessionStorage.removeItem('oauth_state');

            // Redirect based on role
            redirectByRole(data.user.role);

        } catch (error) {
            hideLoadingOverlay();
            console.error('Auth error:', error);
            alert('Authentication failed: ' + error.message);
        }

        // Clear URL params
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Redirect based on user role
function redirectByRole(role) {
    if (role === 'employee') window.location.href = 'employee.html';
    else if (role === 'manager') window.location.href = 'manager.html';
    else if (role === 'senior') window.location.href = 'senior.html';
    else if (role === 'intern') window.location.href = 'intern.html';
    else {
        hideLoadingOverlay();
        alert('Unknown role: ' + role);
    }
}

// Loading overlay functions
function showLoadingOverlay(message = 'Processing...') {
    hideLoadingOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
            <div style="background: white; padding: 2rem 3rem; border-radius: 1rem; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
                <div style="width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #10b981; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
                <p style="color: #374151; font-weight: 500;">${message}</p>
            </div>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.remove();
}

// Microsoft Login Button Handler
document.getElementById('microsoftLoginBtn')?.addEventListener('click', async () => {
    if (!MICROSOFT_CONFIG.clientId) {
        alert('Microsoft authentication is not configured.');
        return;
    }
    window.location.href = getMicrosoftAuthUrl(false);
});

// Google Login Button Handler
document.getElementById('googleLoginBtn')?.addEventListener('click', async () => {
    if (!GOOGLE_CONFIG.clientId) {
        alert('Google authentication is not configured.');
        return;
    }
    // Default to intern role for generic login if they choose Google?
    // Or let backend decide? Backend will map email to existing user.
    // But if it's a new signup via login... (should go to signup tab).
    // For login, role param is just pass-through, backend uses existing user record.
    window.location.href = getGoogleAuthUrl(false, 'intern');
});

// Microsoft Signup Button Handler  
document.getElementById('microsoftSignupBtn')?.addEventListener('click', async () => {
    if (!MICROSOFT_CONFIG.clientId) {
        alert('Microsoft authentication is not configured.');
        return;
    }
    const selectedRole = document.getElementById('signupRole')?.value || 'employee';
    if (!selectedRole) {
        alert('Please select an account type first.');
        return;
    }
    if (selectedRole === 'intern') {
        alert("Interns must use Google Sign In.");
        return;
    }
    if (selectedRole === 'senior') {
        const seniorKey = document.getElementById('seniorSignupKey')?.value?.trim();
        if (!seniorKey) {
            alert('Please enter the senior signup key to create a Senior Leadership account.');
            return;
        }
        sessionStorage.setItem('senior_signup_key', seniorKey);
    }
    window.location.href = getMicrosoftAuthUrl(true, selectedRole);
});

// Google Signup Button Handler
document.getElementById('googleSignupBtn')?.addEventListener('click', async () => {
    if (!GOOGLE_CONFIG.clientId) {
        alert('Google authentication is not configured.');
        return;
    }
    const selectedRole = document.getElementById('signupRole')?.value || 'intern';
    if (!selectedRole) {
        alert('Please select an account type first.');
        return;
    }
    if (selectedRole === 'senior') {
        const seniorKey = document.getElementById('seniorSignupKey')?.value?.trim();
        if (!seniorKey) {
            alert('Please enter the senior signup key to create a Senior Leadership account.');
            return;
        }
        sessionStorage.setItem('senior_signup_key', seniorKey);
    }
    window.location.href = getGoogleAuthUrl(true, selectedRole);
});

// --- AUTH LOGIC ---

// LOGIN
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    await handleAuthAction(submitBtn, async () => {
        const loginData = await Api.login(email, password);
        localStorage.setItem('access_token', loginData.access_token);

        // Get User Profile to store name and role
        const user = await Api.getProfile();
        localStorage.setItem('user_name', user.full_name);
        localStorage.setItem('user_role', user.role);

        return loginData;
    });
});

// SIGNUP
document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const fullName = document.getElementById('fullname').value;
    const role = document.getElementById('signupRole').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!role) {
        alert("Please select a role");
        return;
    }

    if (role === 'intern' && !email.endsWith('@gmail.com')) {
        // Optional: Enforce gmail domain strictly?
    }

    if (role === 'senior') {
        const seniorKey = document.getElementById('seniorSignupKey')?.value?.trim();
        if (!seniorKey) {
            alert('Please enter the senior signup key to create a Senior Leadership account.');
            return;
        }
    }

    handleAuthAction(submitBtn, async () => {
        const payload = {
            email: email,
            password: password,
            full_name: fullName,
            role: role
        };
        if (role === 'senior') {
            payload.senior_signup_key = document.getElementById('seniorSignupKey')?.value?.trim() || '';
        }
        // 1. Register
        await Api.post('/auth/signup', payload);

        // 2. Auto Login
        const loginData = await Api.login(email, password);
        localStorage.setItem('access_token', loginData.access_token);

        // 3. Get User Profile
        const user = await Api.getProfile();
        localStorage.setItem('user_name', user.full_name);
        localStorage.setItem('user_role', user.role);

        return loginData;
    });
});

// Helper to handle loading state and redirection
async function handleAuthAction(btn, actionCallback) {
    const originalText = btn.innerText;
    btn.innerText = 'Processing...';
    btn.disabled = true;
    btn.classList.add('opacity-75');

    try {
        const data = await actionCallback();

        // Robust JWT Decode
        const base64Url = data.access_token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const payload = JSON.parse(jsonPayload);
        const role = payload.role;

        redirectByRole(role);

    } catch (error) {
        console.error('Auth error:', error);
        alert('Action failed: ' + error.message);
        btn.innerText = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-75');
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Auth configs
    await initAuthConfigs();

    // Check for OAuth callback
    handleOAuthCallback();
});
