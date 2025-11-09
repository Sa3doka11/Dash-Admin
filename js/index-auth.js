const AUTH_CONFIG = {
    apiBase: 'https://action-sports-api.vercel.app/api',
    tokenKey: 'actionSportsAuthToken',
    userKey: 'actionSportsAuthUser',
    redirectKey: 'redirectAfterLogin',
    dashboard: 'dashAdmin.html'
};

const authStorage = {
    setToken(token) {
        if (!token) return;
        try {
            localStorage.setItem(AUTH_CONFIG.tokenKey, token);
            console.log('[auth] setToken -> stored token (len=' + (token ? token.length : 0) + ')');
        } catch (e) {
            console.warn('[auth] setToken error', e);
        }
    },
    getToken() {
        return localStorage.getItem(AUTH_CONFIG.tokenKey);
    },
    setUser(user) {
        if (!user) return;
        localStorage.setItem(AUTH_CONFIG.userKey, JSON.stringify(user));
    },
    getUser() {
        const raw = localStorage.getItem(AUTH_CONFIG.userKey);
        try {
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            console.warn('authStorage.getUser parse error', err);
            return null;
        }
    },
    clearAuth() {
        try {
            localStorage.removeItem(AUTH_CONFIG.tokenKey);
            localStorage.removeItem(AUTH_CONFIG.userKey);
            console.log('[auth] clearAuth -> removed token & user');
        } catch (e) {
            console.warn('[auth] clearAuth error', e);
        }
    },
    setRedirect(url) {
        if (!url) return;
        sessionStorage.setItem(AUTH_CONFIG.redirectKey, url);
    },
    consumeRedirect() {
        const redirect = sessionStorage.getItem(AUTH_CONFIG.redirectKey);
        sessionStorage.removeItem(AUTH_CONFIG.redirectKey);
        return redirect;
    }
};

const authApi = {
    async signIn(email, password) {
        const url = `${AUTH_CONFIG.apiBase}/auth/sign-in`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const text = await response.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch (_) {
            data = { raw: text };
        }

        if (!response.ok) {
            const message = data?.message || data?.msg || data?.error || 'فشل تسجيل الدخول';
            throw new Error(message);
        }

        const token = extractToken(data);
        if (!token) {
            throw new Error('لم يتم استلام رمز المصادقة من الخادم');
        }

        const user = extractUser(data) || { email };
        authStorage.setToken(token);
        authStorage.setUser(user);

        return { token, user };
    }
};

function extractToken(payload = {}) {
    const candidates = [
        payload.token,
        payload.accessToken,
        payload.access_token,
        payload?.data?.token,
        payload?.data?.accessToken,
        payload?.data?.access_token
    ];

    for (const candidate of candidates) {
        if (candidate && typeof candidate === 'string') {
            return candidate;
        }
    }

    if (payload && typeof payload === 'object') {
        for (const value of Object.values(payload)) {
            if (typeof value === 'string' && value.split('.').length === 3) {
                return value;
            }
        }
    }

    return null;
}

function extractUser(payload = {}) {
    if (payload.user) return payload.user;
    if (payload?.data?.user) return payload.data.user;
    if (payload.userProfile) return payload.userProfile;
    return null;
}

function redirectToDashboard() {
    const saved = authStorage.consumeRedirect();
    const target = saved && !saved.includes('index.html') ? saved : AUTH_CONFIG.dashboard;
    window.location.href = target;
}

function updatePasswordVisibility(toggleBtn, passwordInput) {
    if (!toggleBtn || !passwordInput) return;
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    const icon = toggleBtn.querySelector('i');
    if (icon) {
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    }
    toggleBtn.setAttribute('aria-pressed', type === 'text' ? 'true' : 'false');
}

function setLoadingState(button, loading) {
    if (!button) return;
    button.disabled = loading;
    button.textContent = loading ? 'جاري التحقق...' : 'بدء التحكم';
}

function showMessage(element, message, type = 'error') {
    if (!element) return;
    element.textContent = message || '';
    element.classList.remove('is-error', 'is-success');
    if (!message) {
        element.style.display = 'none';
        return;
    }

    element.style.display = 'block';
    element.classList.add(type === 'success' ? 'is-success' : 'is-error');
}

function validateForm(emailInput, passwordInput, messageEl) {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
        showMessage(messageEl, 'الرجاء إدخال البريد الإلكتروني');
        emailInput.focus();
        return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showMessage(messageEl, 'الرجاء إدخال بريد إلكتروني صحيح');
        emailInput.focus();
        return false;
    }

    if (!password) {
        showMessage(messageEl, 'الرجاء إدخال كلمة المرور');
        passwordInput.focus();
        return false;
    }

    if (password.length < 4) {
        showMessage(messageEl, 'كلمة المرور قصيرة للغاية');
        passwordInput.focus();
        return false;
    }

    return true;
}

function initAuthForm() {
    const form = document.getElementById('adminLoginForm');
    const emailInput = document.getElementById('adminEmail');
    const passwordInput = document.getElementById('adminPassword');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const submitBtn = document.getElementById('loginSubmit');
    const messageEl = document.getElementById('authMessage');

    if (!form) {
        return false;
    }

    if (!emailInput || !passwordInput || !submitBtn || !messageEl) {
        console.warn('عناصر نموذج تسجيل الدخول غير مكتملة.');
        return false;
    }

    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => updatePasswordVisibility(togglePasswordBtn, passwordInput));
    }

    emailInput.addEventListener('input', () => showMessage(messageEl, ''));
    passwordInput.addEventListener('input', () => showMessage(messageEl, ''));

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!validateForm(emailInput, passwordInput, messageEl)) {
            return;
        }

        showMessage(messageEl, '');
        setLoadingState(submitBtn, true);

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        try {
            await authApi.signIn(email, password);

            showMessage(messageEl, 'تم تسجيل الدخول بنجاح! جارٍ تحويلك...', 'success');
            setTimeout(() => redirectToDashboard(), 600);
        } catch (error) {
            const message = normalizeErrorMessage(error?.message || 'فشل تسجيل الدخول');
            showMessage(messageEl, message, 'error');
            passwordInput.focus();
            passwordInput.select();
        } finally {
            setLoadingState(submitBtn, false);
        }
    });

    setTimeout(() => emailInput.focus(), 200);
    return true;
}

function normalizeErrorMessage(message) {
    if (!message) return 'حدث خطأ غير متوقع. حاول مرة أخرى لاحقًا.';
    const dictionary = [
        { includes: ['401', 'unauthorized', 'Invalid credentials', 'بيانات الدخول غير صحيحة'], text: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { includes: ['422', 'validation'], text: 'البيانات المدخلة غير صالحة' },
        { includes: ['timeout'], text: 'انتهت مهلة الاتصال. حاول مرة أخرى.' },
        { includes: ['network', 'Failed to fetch', 'networkerror'], text: 'فشل الاتصال بالخادم. تحقق من اتصال الإنترنت لديك.' },
        { includes: ['500', 'server'], text: 'خطأ في الخادم. حاول مرة أخرى لاحقًا.' }
    ];

    const lowerMessage = message.toLowerCase();
    for (const entry of dictionary) {
        if (entry.includes.some(token => lowerMessage.includes(token.toLowerCase()))) {
            return entry.text;
        }
    }

    return message;
}

function ensureAuthenticated() {
    try {
        const token = authStorage.getToken();
        if (token) {
            redirectToDashboard();
        }
    } catch (err) {
        console.warn('ensureAuthenticated error', err);
    }
}

function bootstrapAuthPage() {
    const formInitialized = initAuthForm();

    if (formInitialized) {
        ensureAuthenticated();
    } else {
        enforceDashboardAuth();
    }
}

function enforceDashboardAuth() {
    const token = authStorage.getToken();
    if (token) {
        return;
    }

    const current = window.location.href;
    try {
        authStorage.setRedirect(current);
    } catch (err) {
        console.warn('Failed to persist redirect', err);
    }

    window.location.href = 'index.html';
}

function logout() {
    authStorage.clearAuth();
    window.location.href = 'index.html';
}

function getAuthHeader() {
    const token = authStorage.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function isAuthenticated() {
    const token = authStorage.getToken();
    return Boolean(token);
}

function getUser() {
    return authStorage.getUser();
}

window.adminAuth = {
    getToken: authStorage.getToken.bind(authStorage),
    getUser,
    setRedirect: authStorage.setRedirect.bind(authStorage),
    consumeRedirect: authStorage.consumeRedirect.bind(authStorage),
    getAuthHeader,
    isAuthenticated,
    requireAuth: enforceDashboardAuth,
    logout
};

document.addEventListener('DOMContentLoaded', bootstrapAuthPage);
