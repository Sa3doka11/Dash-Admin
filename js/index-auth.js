const AUTH_CONFIG = {
    apiBase: 'https://api.actionsports4u.com/api',
    userKey: 'actionSportsAuthUser',
    redirectKey: 'redirectAfterLogin',
    refreshTokenKey: 'actionSportsRefreshToken',
    dashboard: 'dashAdmin.html'
};

const authState = {
    user: null
};

const authStorage = {
    setUser(user) {
        authState.user = user || null;
    },
    getUser() {
        return authState.user;
    },
    clearAuth() {
        authState.user = null;
        this.clearRefreshToken();
    },
    setRedirect(url) {
        if (!url) return;
        sessionStorage.setItem(AUTH_CONFIG.redirectKey, url);
    },
    consumeRedirect() {
        const redirect = sessionStorage.getItem(AUTH_CONFIG.redirectKey);
        sessionStorage.removeItem(AUTH_CONFIG.redirectKey);
        return redirect;
    },
    setRefreshToken(token) {
        const secureFlag = (typeof window !== 'undefined' && window.location?.protocol === 'https:') ? '; Secure' : '';

        if (token) {
            // Set refresh token in HTTP-only cookie via server
            // For client-side fallback, we can use document.cookie (not HTTP-only)
            const expires = new Date();
            expires.setDate(expires.getDate() + 30); // 30 days
            document.cookie = `${AUTH_CONFIG.refreshTokenKey}=${token}; expires=${expires.toUTCString()}; path=/; SameSite=Strict${secureFlag}`;
        } else {
            document.cookie = `${AUTH_CONFIG.refreshTokenKey}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict${secureFlag}`;
        }
    },
    getRefreshToken() {
        // Get refresh token from cookies
        const name = AUTH_CONFIG.refreshTokenKey + "=";
        const decodedCookie = decodeURIComponent(document.cookie);
        const ca = decodedCookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) === 0) {
                return c.substring(name.length, c.length);
            }
        }
        return null;
    },
    clearRefreshToken() {
        const secureFlag = (typeof window !== 'undefined' && window.location?.protocol === 'https:') ? '; Secure' : '';
        document.cookie = `${AUTH_CONFIG.refreshTokenKey}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict${secureFlag}`;
    }
};

const authApi = {
    async signIn(email, password) {
        const url = `${AUTH_CONFIG.apiBase}/auth/sign-in`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
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

        const user = extractUser(data) || { email };
        authStorage.setUser(user);
        
        // Store refresh token if available
        if (data?.refreshToken) {
            authStorage.setRefreshToken(data.refreshToken);
        }

        return { user };
    },

    async refreshToken() {
        const refreshToken = authStorage.getRefreshToken();
        const url = `${AUTH_CONFIG.apiBase}/auth/token/refresh`;

        const hasManualToken = Boolean(refreshToken);
        const payload = hasManualToken ? { refreshToken } : {};
        const fetchOptions = {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        const response = await fetch(url, fetchOptions);

        const text = await response.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch (_) {
            data = { raw: text };
        }

        if (!response.ok) {
            // Clear invalid refresh token
            authStorage.clearRefreshToken();
            const message = data?.message || data?.msg || data?.error || 'فشل تحديث التوكن';
            throw new Error(message);
        }

        // Update refresh token if provided
        if (data?.refreshToken) {
            authStorage.setRefreshToken(data.refreshToken);
        }

        return data;
    }
};


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
    // No session verification needed - cookie-based auth
}

function bootstrapAuthPage() {
    const formInitialized = initAuthForm();

    if (formInitialized) {
        // Login page - no verification needed
    } else {
        enforceDashboardAuth();
    }
}

function enforceDashboardAuth() {
    // Cookie-based auth - let the server handle authentication
    // If the user is not authenticated, API calls will fail with 401
    // and the authorizedFetch will handle redirects
}

async function logout() {
    try {
        await fetch(`${AUTH_CONFIG.apiBase}/auth/log-out`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.warn('logout error', error);
    } finally {
        authStorage.clearAuth();
        window.location.href = 'index.html';
    }
}


function getUser() {
    return authStorage.getUser();
}

window.adminAuth = {
    getUser,
    setRedirect: authStorage.setRedirect.bind(authStorage),
    consumeRedirect: authStorage.consumeRedirect.bind(authStorage),
    requireAuth: enforceDashboardAuth,
    logout,
    refreshToken: authApi.refreshToken.bind(authApi)
};

document.addEventListener('DOMContentLoaded', () => {
    bootstrapAuthPage();
});
