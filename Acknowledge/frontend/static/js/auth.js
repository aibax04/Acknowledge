// --- SLIDER LOGIC ---
const slideContainer = document.getElementById('slideContainer');
const toSignupBtn = document.getElementById('toSignupBtn');
const backToLoginBtn = document.getElementById('backToLoginBtn');

toSignupBtn.addEventListener('click', () => {
    slideContainer.style.transform = 'translateX(-50%)';
});

backToLoginBtn.addEventListener('click', () => {
    slideContainer.style.transform = 'translateX(0)';
});

// --- ROLE SELECTION LOGIC ---
const stepRole = document.getElementById('step-role');
const stepForm = document.getElementById('step-form');
const selectedRoleDisplay = document.getElementById('selectedRoleDisplay');
const signupRoleInput = document.getElementById('signupRole');

window.selectRole = (role) => {
    signupRoleInput.value = role;

    // Format display text
    if (role === 'senior') selectedRoleDisplay.innerText = "Senior Leadership";
    else selectedRoleDisplay.innerText = role.charAt(0).toUpperCase() + role.slice(1);

    // Switch Views
    stepRole.classList.add('hidden');
    stepRole.classList.remove('block');
    stepForm.classList.remove('hidden');
    stepForm.classList.add('block', 'animate-fade-in'); // Add fade in if defined in CSS
};

window.resetRoleSelection = () => {
    stepForm.classList.add('hidden');
    stepRole.classList.remove('hidden');
    stepRole.classList.add('block');
};

// --- AUTH LOGIC ---

// LOGIN
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    handleAuthAction(submitBtn, async () => {
        const loginData = await Api.login(email, password);
        localStorage.setItem('access_token', loginData.access_token);

        // Get User Profile
        const user = await Api.getProfile();
        localStorage.setItem('user_name', user.full_name);
        localStorage.setItem('user_role', user.role);

        return loginData;
    });
});

// SIGNUP
document.getElementById('signupForm').addEventListener('submit', async (e) => {
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

    handleAuthAction(submitBtn, async () => {
        // 1. Register
        await Api.post('/auth/signup', {
            email: email,
            password: password,
            full_name: fullName,
            role: role
        });

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

        localStorage.setItem('access_token', data.access_token);
        const payload = JSON.parse(atob(data.access_token.split('.')[1]));
        const role = payload.role;

        if (role === 'employee') window.location.href = 'employee.html';
        else if (role === 'manager') window.location.href = 'manager.html';
        else if (role === 'senior') window.location.href = 'senior.html';
        else alert('Unknown role');

    } catch (error) {
        alert('Action failed: ' + error.message);
        btn.innerText = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-75');
    }
}
