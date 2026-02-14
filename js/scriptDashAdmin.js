/**
 * ========================================
 * لوحة التحكم الإدارية - Action Sports
 * ========================================
 * 
 * هذا الملف يحتوي على جميع وظائف لوحة التحكم الإدارية
 * بما في ذلك:
 * - إدارة المنتجات والفئات والطلبات
 * - معالجة البيانات من API
 * - عرض الرسوم البيانية والإحصائيات
 * - التعامل مع الأحداث والنماذج
 */

// ========================================
// ===== 0. دوال التحميل (Loader) =====
// ========================================

/**
 * Safely escape HTML entities (fallback for when DOMPurify is unavailable)
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text safe for HTML context
 */
function escapeHtmlEntities(text) {
    if (typeof text !== 'string') return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };
    return text.replace(/[&<>"'\/]/g, (char) => map[char]);
}

/**
 * Safely set innerHTML with DOMPurify sanitization
 * ⚠️ CRITICAL: ADD_ATTR preserves data-* attributes for interactivity
 */
function safeSetInnerHTML(element, html) {
    if (!element) return;

    if (typeof DOMPurify !== 'undefined') {
        element.innerHTML = DOMPurify.sanitize(html, {
            // Allowed HTML tags (structural + UI elements)
            ALLOWED_TAGS: [
                'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'img', 'a', 'button', 'i', 'strong', 'em', 'br', 'hr',
                'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
                'ul', 'ol', 'li', 'dl', 'dt', 'dd',
                'time', 'article', 'section', 'header', 'footer', 'nav', 'aside',
                'label', 'input', 'select', 'option', 'textarea', 'form',
                'small', 'figure', 'figcaption', 'canvas', 'svg', 'path',
                'use', 'symbol', 'defs', 'g', 'circle', 'rect', 'line',
            ],
            // Standard allowed attributes
            ALLOWED_ATTR: [
                'class', 'id', 'src', 'alt', 'href', 'title', 'style',
                'type', 'value', 'placeholder', 'name', 'for',
                'disabled', 'checked', 'readonly', 'selected', 'required',
                'min', 'max', 'step', 'rows', 'cols', 'maxlength',
                'aria-*', 'role', 'datetime', 'tabindex',
                'width', 'height', 'viewBox', 'fill', 'stroke', 'd',
                'xmlns', 'xlink:href',
            ],
            // ⚠️ CRITICAL: Custom data-* attributes used by dashboard
            ADD_ATTR: [
                'target',
                // Entity IDs
                'data-id', 'data-order-id', 'data-product-id', 'data-category-id',
                'data-subcategory-id', 'data-brand-id', 'data-banner-id',
                'data-customer-id', 'data-message-id', 'data-payment-id',
                // Modal controls
                'data-open-modal', 'data-modal-mode', 'data-entity', 'data-close-modal',
                'data-modal-title', 'data-modal-edit-title',
                // Action triggers
                'data-action', 'data-toggle', 'data-target',
                'data-bs-toggle', 'data-bs-target',
                // Image handling
                'data-image-index', 'data-original-image', 'data-preview-image',
                // Misc dashboard attributes
                'data-tab', 'data-section', 'data-counter', 'data-zone-id'
            ],
            // Forbidden XSS vectors
            FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur']
        });
    } else {
        // Defensive fallback: safely escape HTML
        console.warn('⚠️ DOMPurify not loaded - using HTML escaping fallback');
        element.textContent = html;
    }
}

/**
 * Global reusable function for safe HTML rendering
 * Sanitizes HTML through DOMPurify to prevent XSS attacks
 * @param {HTMLElement} element - Target DOM element
 * @param {string} html - HTML content to render
 */
function safeHTML(element, html) {
    safeSetInnerHTML(element, html);
}


class DashboardLoader {
    constructor() {
        this.loaderScreen = document.getElementById('loadingScreen');
        this.progressFill = document.getElementById('loaderProgressFill');
        this.progressText = document.getElementById('loaderProgressText');
        this.currentProgress = 0;
    }

    /**
     * تحديث شريط التقدم
     */
    setProgress(percentage) {
        this.currentProgress = Math.min(percentage, 100);
        if (this.progressFill) {
            this.progressFill.style.width = this.currentProgress + '%';
        }
        if (this.progressText) {
            this.progressText.textContent = `جاري التحميل... ${this.currentProgress}%`;
        }
    }

    /**
     * تحديث خطوة التحميل
     */
    updateStep(stepNumber, status = 'active') {
        const stepElement = document.getElementById(`step-${stepNumber}`);
        if (stepElement) {
            stepElement.classList.remove('active', 'completed');
            if (status === 'active') {
                stepElement.classList.add('active');
                stepElement.textContent = `⏳ جاري تحميل البيانات...`.replace('جاري تحميل البيانات', this.getStepText(stepNumber));
            } else if (status === 'completed') {
                stepElement.classList.add('completed');
                stepElement.textContent = `✓ تم ${this.getStepText(stepNumber)}`.replace('جاري تحميل البيانات', this.getStepText(stepNumber));
            }
        }
    }

    getStepText(stepNumber) {
        const steps = {
            1: 'تحميل البيانات',
            2: 'تحضير الواجهة',
            3: 'تحميل الرسوم البيانية'
        };
        return steps[stepNumber] || 'تحميل النظام';
    }

    /**
     * إخفاء شاشة التحميل
     */
    async hide() {
        if (this.loaderScreen) {
            this.setProgress(100);
            // انتظر قليلاً قبل الإخفاء
            await new Promise(resolve => setTimeout(resolve, 300));
            this.loaderScreen.classList.add('hidden');
            await new Promise(resolve => setTimeout(resolve, 500));
            this.loaderScreen.style.display = 'none';
        }
    }

    /**
     * إظهار الـ Loader
     */
    show() {
        if (this.loaderScreen) {
            this.loaderScreen.style.display = 'flex';
            this.loaderScreen.classList.remove('hidden');
            this.currentProgress = 0;
            this.setProgress(0);
        }
    }
}

async function updateProductDiscountPrice(productId, priceAfterDiscount) {
    if (!productId) {
        throw new Error('معرف المنتج غير صالح لتحديث سعر الخصم');
    }

    const requestBody = priceAfterDiscount === null
        ? { priceAfterDiscount: null }
        : { priceAfterDiscount: Number(priceAfterDiscount) };

    const response = await authorizedFetch(PRODUCT_PRICE_AFTER_DISCOUNT_ENDPOINT(productId), {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errorMessage = data.message || 'تعذر تحديث سعر المنتج بعد الخصم';
        throw new Error(errorMessage);
    }

    return response.json().catch(() => ({}));
}

// إنشاء instance من الـ Loader
const dashboardLoader = new DashboardLoader();

// ========================================
// ===== 1. إعدادات API =====
// ========================================

const ADMIN_API_BASE_URL = 'https://api.actionsports4u.com/api';
const BRAND_API = `${ADMIN_API_BASE_URL}/brands`;
const BANNER_API = `${ADMIN_API_BASE_URL}/banners`;
const SHIPPING_ZONES_ENDPOINT = `${ADMIN_API_BASE_URL}/shipping-zones`;
const USERS_ENDPOINT = `${ADMIN_API_BASE_URL}/users`;
const CUSTOMER_ENDPOINT = `${ADMIN_API_BASE_URL}/customers`;
const CATEGORY_ENDPOINT = `${ADMIN_API_BASE_URL}/categories`;
const SUBCATEGORY_ENDPOINT = (categoryId) => `${CATEGORY_ENDPOINT}/${encodeURIComponent(categoryId)}/subcategories`;
const SUBCATEGORY_DETAIL_ENDPOINT = (categoryId, subcategoryId) => `${SUBCATEGORY_ENDPOINT(categoryId)}/${encodeURIComponent(subcategoryId)}`;
const PRODUCT_ENDPOINT = `${ADMIN_API_BASE_URL}/products`;
const ORDER_ENDPOINT = `${ADMIN_API_BASE_URL}/orders`;
const PRODUCT_PRICE_AFTER_DISCOUNT_ENDPOINT = (productId) => `${PRODUCT_ENDPOINT}/price-after-discount/${encodeURIComponent(productId)}`;
const MESSAGE_ENDPOINT = `${ADMIN_API_BASE_URL}/messages`;
const PAYMENT_TOGGLE_ENDPOINTS = {
    cod: `${ADMIN_API_BASE_URL}/payment-settings/toggle/payOnDelivery`,
    visa: `${ADMIN_API_BASE_URL}/payment-settings/toggle/payWithCard`,
    installments: `${ADMIN_API_BASE_URL}/payment-settings/toggle/installments`
};
const PAYMENT_SETTINGS_ENDPOINT = `${ADMIN_API_BASE_URL}/payment-settings`;
const PAYMENT_STATUS_FIELD_BY_ID = {
    cod: 'payOnDelivery',
    visa: 'payWithCard',
    installments: 'installments'
};
const PAYMENT_ID_BY_STATUS_FIELD = Object.fromEntries(
    Object.entries(PAYMENT_STATUS_FIELD_BY_ID).map(([id, field]) => [field, id])
);
const DESCRIPTION_MAX_LENGTH = 700;

let cachedAdminId = null;

// ========================================
// ===== 1.b. REQUEST DEDUPLICATION =====
// ========================================

/**
 * Prevents duplicate mutation calls (delete, update) from firing
 * Useful when old zombie listeners accidentally fire alongside new ones
 * or when users rapidly click action buttons
 */
const pendingMutations = new Map();

async function debouncedMutation(key, mutationFn) {
    if (pendingMutations.has(key)) {
        console.warn(`⚠️ Duplicate mutation blocked: ${key}`);
        return pendingMutations.get(key);
    }

    const promise = mutationFn().finally(() => {
        pendingMutations.delete(key);
    });

    pendingMutations.set(key, promise);
    return promise;
}

// ========================================
// ===== 1.a. دوال مساعدة للعملاء والعناوين =====
// ========================================

const ADDRESS_TYPE_LABELS = {
    home: 'المنزل',
    work: 'العمل',
    office: 'المكتب',
    billing: 'عنوان الفواتير',
    shipping: 'عنوان الشحن',
    other: 'عنوان آخر'
};

function getAddressTypeLabel(type) {
    if (!type) return ADDRESS_TYPE_LABELS.other;
    const normalized = String(type).toLowerCase();
    return ADDRESS_TYPE_LABELS[normalized] || type;
}

function updateBannerImagePreview(image) {
    const preview = document.getElementById('bannerImagePreview');
    if (!preview) return;

    if (!image) {
        preview.innerHTML = '<span class="image-preview__placeholder">لم يتم اختيار صورة</span>';
        return;
    }

    preview.innerHTML = `<img src="${image}" alt="Banner Preview">`;
}

function prepareBannerCreateForm() {
    const form = document.getElementById('bannerForm');
    if (!form) return;

    form.reset();
    form.dataset.mode = 'create';
    setFieldValue(form, 'id', '');
    setFieldValue(form, 'title', '');
    setFieldValue(form, 'description', '');

    const descriptionField = form.querySelector('#bannerDescription');
    if (descriptionField) {
        updateDescriptionCounter(descriptionField);
    }

    const imageInput = form.querySelector('#bannerImage');
    if (imageInput) {
        imageInput.value = '';
        delete imageInput.dataset.originalImage;
        delete imageInput.dataset.previewImage;
        imageInput.required = true;
    }

    updateBannerImagePreview('');
}

function populateBannerModal(bannerId) {
    const form = document.getElementById('bannerForm');
    if (!form) return;

    const source = getBannerSource();
    const banner = source.find(entry => (entry._id === bannerId || entry.id === bannerId));
    if (!banner) {
        showToast('error', 'تعديل البانر', 'تعذر العثور على البانر المحدد');
        return;
    }

    form.dataset.mode = 'edit';
    setFieldValue(form, 'id', banner._id || banner.id || '');
    setFieldValue(form, 'title', banner.title || '');
    setFieldValue(form, 'description', banner.description || '');

    const descriptionField = form.querySelector('#bannerDescription');
    if (descriptionField) {
        updateDescriptionCounter(descriptionField);
    }

    const imageInput = form.querySelector('#bannerImage');
    const resolvedImage = banner.image || banner.raw?.image || BANNER_IMAGE_PLACEHOLDER;
    if (imageInput) {
        imageInput.value = '';
        imageInput.dataset.originalImage = resolvedImage;
        delete imageInput.dataset.previewImage;
        imageInput.required = false;
    }

    updateBannerImagePreview(resolvedImage);
}

async function handleBannerImageChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;

    const file = input.files?.[0];
    if (!file) {
        const fallback = input.dataset.previewImage || input.dataset.originalImage || '';
        updateBannerImagePreview(fallback);
        return;
    }

    try {
        const dataUrl = await readFileAsDataUrl(file);
        input.dataset.previewImage = dataUrl;
        updateBannerImagePreview(dataUrl);
    } catch (error) {
        showToast('error', 'صورة البانر', 'تعذر معاينة ملف الصورة المحدد');
        input.value = '';
        const fallback = input.dataset.originalImage || '';
        updateBannerImagePreview(fallback);
    }
}

async function handleBannerFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form || form.dataset.entity !== 'banner') return;

    const formData = new FormData(form);
    const mode = form.dataset.mode || 'create';
    const id = getFormValue(formData, 'id');
    const title = getFormValue(formData, 'title');
    const description = getFormValue(formData, 'description');
    const imageInput = form.querySelector('#bannerImage');
    const imageFile = imageInput?.files?.[0] || null;
    const originalImage = imageInput?.dataset.originalImage || '';

    if (!title) {
        showToast('error', 'حفظ البانر', 'يرجى إدخال عنوان للبانر');
        return;
    }

    if (!description) {
        showToast('error', 'حفظ البانر', 'يرجى إدخال وصف للبانر');
        return;
    }

    if (!imageFile && mode === 'create') {
        showToast('error', 'حفظ البانر', 'يرجى اختيار صورة للبانر');
        return;
    }

    if (!imageFile && mode === 'edit' && !originalImage) {
        showToast('error', 'حفظ البانر', 'يرجى اختيار صورة للبانر');
        return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton?.innerHTML;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    }

    const payload = { title, description };

    try {
        if (mode === 'edit') {
            if (!id) {
                throw new Error('تعذر تحديد البانر الذي ترغب في تعديله');
            }
            await updateBanner(id, payload, imageFile);
            showToast('success', 'تحديث البانر', 'تم تحديث البانر بنجاح');
        } else {
            await createBanner(payload, imageFile);
            showToast('success', 'إضافة البانر', 'تمت إضافة البانر بنجاح');
        }

        closeModal('bannerModal');
        prepareBannerCreateForm();
        await fetchBanners({ force: true });
    } catch (error) {
        const message = error?.message || 'حدث خطأ أثناء حفظ البانر';
        showToast('error', 'خطأ', message);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText || 'حفظ البانر';
        }
    }
}

function normalizeCustomerAddress(rawAddress = {}, index = 0) {
    if (!rawAddress) return null;

    if (typeof rawAddress === 'string') {
        const trimmed = rawAddress.trim();
        if (!trimmed) return null;
        return {
            id: `address-${index}`,
            type: 'other',
            label: ADDRESS_TYPE_LABELS.other,
            details: trimmed,
            city: '',
            region: '',
            country: '',
            postalCode: '',
            phone: '',
            name: '',
            raw: rawAddress
        };
    }

    if (Array.isArray(rawAddress)) {
        return rawAddress
            .map((entry, arrayIndex) => normalizeCustomerAddress(entry, index + arrayIndex))
            .filter(Boolean);
    }

    if (typeof rawAddress !== 'object') {
        return null;
    }

    const id = rawAddress._id
        || rawAddress.id
        || rawAddress.addressId
        || rawAddress.slug
        || rawAddress.reference
        || `address-${index}`;

    const type = rawAddress.type
        || rawAddress.addressType
        || rawAddress.tag
        || rawAddress.label
        || rawAddress.kind
        || 'other';

    const details = rawAddress.details
        || rawAddress.detail
        || rawAddress.street
        || rawAddress.street1
        || rawAddress.addressLine1
        || rawAddress.address1
        || rawAddress.line1
        || rawAddress.fullAddress
        || rawAddress.address
        || '';

    const city = rawAddress.city
        || rawAddress.town
        || rawAddress.cityName
        || rawAddress.governorate
        || rawAddress.state
        || '';

    const baseRegion = rawAddress.region
        || rawAddress.state
        || rawAddress.province
        || rawAddress.area
        || rawAddress.district
        || '';

    const postalCode = rawAddress.postalCode
        || rawAddress.zip
        || rawAddress.zipCode
        || rawAddress.postal
        || '';

    const country = rawAddress.country
        || rawAddress.countryName
        || rawAddress.country_code
        || '';

    const phone = rawAddress.phone
        || rawAddress.mobile
        || rawAddress.phoneNumber
        || rawAddress.contactPhone
        || '';

    const name = rawAddress.name
        || rawAddress.contactName
        || rawAddress.receiverName
        || rawAddress.recipient
        || '';

    const zoneInfo = typeof resolveShippingZone === 'function'
        ? resolveShippingZone({}, rawAddress)
        : { zoneName: '', shippingRate: null, zoneId: '' };

    const zoneIdCandidate = rawAddress.zoneId
        || rawAddress.shippingZoneId
        || (typeof rawAddress.shippingZone === 'string' ? rawAddress.shippingZone : '')
        || (typeof rawAddress.zone === 'string' ? rawAddress.zone : '')
        || zoneInfo.zoneId;

    let zoneName = zoneInfo.zoneName
        || rawAddress.zoneName
        || rawAddress.shippingZoneName
        || rawAddress.shippingZone?.name
        || rawAddress.zone?.name
        || rawAddress.areaName
        || '';

    if (!zoneName && zoneIdCandidate && typeof getShippingZoneById === 'function') {
        const matchedZone = getShippingZoneById(zoneIdCandidate);
        if (matchedZone?.zoneName) {
            zoneName = matchedZone.zoneName;
        }
    }

    const rateCandidate = zoneInfo.shippingRate
        ?? rawAddress.shippingRate
        ?? rawAddress.rate
        ?? rawAddress.price
        ?? rawAddress.cost
        ?? rawAddress.shippingCost
        ?? rawAddress.deliveryFee
        ?? null;

    const numericRate = Number(rateCandidate);
    const shippingRate = Number.isFinite(numericRate) && numericRate >= 0 ? numericRate : null;

    const zoneId = zoneIdCandidate
        || rawAddress.shippingZone?._id
        || rawAddress.shippingZone?.id
        || rawAddress.zone?._id
        || rawAddress.zone?.id
        || zoneInfo.zoneId
        || '';

    const region = zoneName || baseRegion;

    return {
        id,
        type,
        label: getAddressTypeLabel(type),
        details,
        city,
        region,
        postalCode,
        country,
        phone,
        name,
        zoneName,
        shippingRate,
        zoneId,
        raw: rawAddress
    };
}

function collectCustomerAddresses(customer = {}) {
    const addresses = [];

    const isAddressFromApi = (normalizedAddress) => {
        if (!normalizedAddress) return false;

        const raw = normalizedAddress.raw;
        if (!raw || typeof raw !== 'object') {
            return false;
        }

        if (raw.source === 'api' || raw.fromApi === true || raw.__fromApi === true) {
            return true;
        }

        const identifierCandidates = [
            raw._id,
            raw.id,
            raw.addressId,
            raw.address_id,
            raw.addressID,
            raw.slug
        ];

        if (identifierCandidates.some(value => typeof value === 'string' ? value.trim() : value)) {
            return true;
        }

        if (typeof normalizedAddress.id === 'string' && !normalizedAddress.id.startsWith('address-')) {
            return true;
        }

        return false;
    };

    const pushAddress = (entry) => {
        if (!entry) return;
        const normalized = normalizeCustomerAddress(entry, addresses.length);
        if (Array.isArray(normalized)) {
            normalized.forEach(pushAddress);
            return;
        }
        if (!normalized) return;

        const raw = normalized.raw;

        if (raw && typeof raw === 'object') {
            const hasOrderSignature = Boolean(
                raw.orderId
                || raw.order_id
                || raw.order
                || raw.orderReference
                || raw.orderRef
                || raw.cartId
            );

            if (hasOrderSignature) {
                return;
            }
        }

        const zoneRef = normalized.zoneId || normalized.raw?.zoneId || normalized.raw?.shippingZoneId;
        if (!normalized.zoneName && zoneRef && typeof getShippingZoneById === 'function') {
            const zone = getShippingZoneById(zoneRef);
            if (zone?.zoneName) {
                normalized.zoneName = zone.zoneName;
                if (!normalized.region || normalized.region === normalized.zoneId || normalized.region === zoneRef) {
                    normalized.region = zone.zoneName;
                }
                if (!normalized.zoneId) {
                    normalized.zoneId = zone.id;
                }
            }
        }

        if (normalized.region && normalized.zoneId && normalized.region === normalized.zoneId) {
            normalized.region = normalized.zoneName || '';
        }

        const signature = JSON.stringify([
            normalized.details,
            normalized.city,
            normalized.region,
            normalized.postalCode,
            normalized.country,
            normalized.phone
        ]);

        if (!isAddressFromApi(normalized)) {
            return;
        }

        const isDuplicate = addresses.some(existing => existing.signature === signature);
        if (!isDuplicate) {
            addresses.push({ ...normalized, signature });
        }
    };

    const candidateSources = [
        customer.addresses,
        customer.addressList,
        customer.addressesList,
        customer.profile?.addresses,
        customer.data?.addresses,
        customer.user?.addresses
    ];

    candidateSources.forEach(source => {
        if (!source) return;
        if (Array.isArray(source)) {
            source.forEach(item => pushAddress(item));
        } else {
            pushAddress(source);
        }
    });

    if (!addresses.length) {
        const fallbackDetails = customer.fullAddress
            || customer.address
            || customer.location
            || '';

        if (
            fallbackDetails
            || customer.city
            || customer.region
            || customer.country
            || customer.postalCode
        ) {
            pushAddress({
                type: 'other',
                details: fallbackDetails,
                city: customer.city,
                region: customer.region || customer.state,
                postalCode: customer.postalCode,
                country: customer.country,
                phone: customer.phone
            });
        }
    }

    return addresses.map(({ signature, ...rest }) => rest);
}

function isUserLikeObject(candidate) {
    if (!candidate || typeof candidate !== 'object') return false;
    return Boolean(
        candidate.email
        || candidate.phone
        || candidate.name
        || candidate.fullName
        || candidate.address
        || candidate.addresses
    );
}

function pickFirstUserLikeObject(payload) {
    if (!payload) return null;

    if (Array.isArray(payload)) {
        for (const item of payload) {
            const candidate = pickFirstUserLikeObject(item);
            if (candidate) return candidate;
        }
        return null;
    }

    if (isUserLikeObject(payload)) {
        return payload;
    }

    if (typeof payload !== 'object') {
        return null;
    }

    const nestedCandidates = [
        payload.data,
        payload.user,
        payload.customer,
        payload.profile,
        payload.result,
        payload.record,
        payload.document,
        payload.entry,
        payload.payload
    ];

    for (const nested of nestedCandidates) {
        const candidate = pickFirstUserLikeObject(nested);
        if (candidate) return candidate;
    }

    for (const value of Object.values(payload)) {
        if (Array.isArray(value)) {
            const candidate = pickFirstUserLikeObject(value);
            if (candidate) return candidate;
        }
    }

    return null;
}

function extractSingleUserFromPayload(payload) {
    if (!payload) return null;

    if (isUserLikeObject(payload)) {
        return payload;
    }

    const candidateObjects = [
        payload?.data?.user,
        payload?.data?.customer,
        payload?.data?.profile,
        payload?.data?.record,
        payload?.user,
        payload?.customer,
        payload?.profile,
        payload?.record,
        payload?.result,
        payload?.document,
        payload?.entry
    ];

    for (const candidate of candidateObjects) {
        if (isUserLikeObject(candidate)) {
            return candidate;
        }
    }

    const candidateArrays = [
        payload?.data?.users,
        payload?.data?.customers,
        payload?.data?.documents,
        payload?.data?.items,
        payload?.users,
        payload?.customers,
        payload?.documents,
        payload?.items,
        Array.isArray(payload?.data) ? payload.data : null,
        Array.isArray(payload) ? payload : null
    ];

    for (const collection of candidateArrays) {
        if (!Array.isArray(collection)) continue;
        const candidate = collection.find(isUserLikeObject);
        if (candidate) {
            return candidate;
        }
    }

    return pickFirstUserLikeObject(payload);
}

async function fetchCustomerProfileFromApi(customerId) {
    if (!customerId) return null;

    const targetId = encodeURIComponent(customerId);
    const endpoints = [
        `${USERS_ENDPOINT}/${targetId}`,
        `${CUSTOMER_ENDPOINT}/${targetId}`
    ];

    for (const endpoint of endpoints) {
        try {
            const response = await authorizedFetch(endpoint);

            if (response?.status === 404) {
                continue;
            }

            if (!response?.ok) {
                const message = `${response.status} ${response.statusText || ''}`.trim();
                throw new Error(message || 'تعذر جلب بيانات العميل');
            }

            const payload = await response.json().catch(() => null);
            const extracted = extractSingleUserFromPayload(payload);

            if (extracted) {
                return {
                    ...extracted,
                    _id: extracted._id || extracted.id || customerId,
                    id: extracted.id || extracted._id || customerId
                };
            }
        } catch (error) {
            if (error?.message?.includes('401')) {
                throw error;
            }
        }
    }

    return null;
}

async function getFreshCustomerData(customerId) {
    const freshProfile = await fetchCustomerProfileFromApi(customerId);
    if (!freshProfile) return null;

    const addresses = collectCustomerAddresses(freshProfile);

    if (!Array.isArray(addresses) || !addresses.length) {
        freshProfile.addresses = [];
    } else {
        freshProfile.addresses = addresses.map(address => ({
            ...address,
            label: address.label || getAddressTypeLabel(address.type)
        }));
    }

    return freshProfile;
}

function buildCustomerDetailsContent({ customer, loading = false, error = null, customerId }) {
    if (!customer && loading) {
        return `
                    <div class="customer-details-loading" style="min-width: 320px; min-height: 220px; display: flex; align-items: center; justify-content: center;">
                        <div class="loading-state">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>جارٍ تحميل بيانات العميل...</p>
                        </div>
                    </div>
                `;
    }

    if (!customer) {
        return `
                    <div class="customer-details-error" style="min-width: 320px; min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #e74c3c;"></i>
                        <p style="margin-top: 12px;">تعذر العثور على بيانات العميل</p>
                        ${error ? `<p style="color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(error)}</p>` : ''}
                    </div>
                `;
    }

    const normalizedName = escapeHtml(customer.name || customer.fullName || '-');
    const email = escapeHtml(customer.email || '-');
    const segment = customer.segment ? escapeHtml(customer.segment) : null;
    const createdDate = getCustomerCreatedDate?.(customer);
    const createdDateText = createdDate ? new Date(createdDate).toLocaleDateString('ar-EG') : null;

    const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];

    let addressesContent = '';

    if (loading && !addresses.length) {
        addressesContent = `
                    <div class="loading-state" style="padding: 20px;">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>جارٍ تحميل العناوين المسجلة...</p>
                    </div>
                `;
    } else if (addresses.length) {
        addressesContent = addresses.map((address, index) => {
            const label = escapeHtml(address.label || getAddressTypeLabel(address.type));
            const contactName = address.name ? `<p style="margin: 6px 0;"><strong>الاسم:</strong> ${escapeHtml(address.name)}</p>` : '';
            const details = address.details ? `<p style="margin: 6px 0;"><strong>التفاصيل:</strong> ${escapeHtml(address.details)}</p>` : '';
            const postalLine = address.postalCode ? `<p style="margin: 6px 0;"><strong>الرمز البريدي:</strong> ${escapeHtml(address.postalCode)}</p>` : '';
            const countryLine = address.country ? `<p style="margin: 6px 0;"><strong>الدولة:</strong> ${escapeHtml(address.country)}</p>` : '';
            const zoneLine = address.zoneName ? `<p style="margin: 6px 0;"><strong>منطقة الشحن:</strong> ${escapeHtml(address.zoneName)}</p>` : '';
            const phoneLine = address.phone
                ? `<p style="margin: 6px 0;"><strong>الهاتف:</strong> <a href="tel:${encodeURIComponent(address.phone)}" style="color: #27ae60; text-decoration: none;">${escapeHtml(address.phone)}</a></p>`
                : '';

            return `
                        <div class="customer-address-card" style="background: var(--bg-light); color: var(--text-main); padding: 16px; border-radius: 10px; border-right: 4px solid var(--primary); margin-bottom: 12px;">
                            <h4 style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px; color: #e74c3c;">
                                <i class="fas fa-map-marker-alt"></i>
                                <span>عنوان ${index + 1} (${label})</span>
                            </h4>
                            ${contactName}
                            ${details}
                            ${postalLine}
                            ${countryLine}
                            ${zoneLine}
                            ${phoneLine}
                        </div>
                    `;
        }).join('');
    } else {
        addressesContent = '<p style="color: var(--text-muted);">لا توجد عناوين مسجلة لهذا العميل.</p>';
    }

    const ordersButton = customerId
        ? `<button class="btn-primary" data-action="view-customer-orders" data-customer-id="${escapeHtml(customerId)}" style="margin-left: 10px;"><i class="fas fa-shopping-cart"></i> عرض طلبات العميل</button>`
        : '';

    const errorBlock = error
        ? `<div class="customer-details-error" style="margin-bottom: 20px; padding: 12px; border-radius: 8px; background: rgba(231, 76, 60, 0.15); color: #c0392b;">
                        <i class="fas fa-exclamation-circle"></i>
                        <span style="margin-right: 8px;">${escapeHtml(error)}</span>
                    </div>`
        : '';

    const loadingBadge = loading && addresses.length
        ? `<span style="background: rgba(39, 174, 96, 0.15); color: #27ae60; padding: 4px 8px; border-radius: 999px; font-size: 0.8rem;">جارٍ تحديث العناوين...</span>`
        : '';

    return `
                <div style="min-width: 320px;">
                    ${errorBlock}
                    <div style="margin-bottom: 24px;">
                        <h3 style="color: #e74c3c; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-info-circle"></i>
                            <span>المعلومات الأساسية</span>
                        </h3>
                        <div style="background: var(--bg-light); padding: 16px; border-radius: 10px; color: var(--text-main); display: grid; gap: 8px;">
                            <p style="margin: 0;"><strong>الاسم:</strong> ${normalizedName}</p>
                            <p style="margin: 0;"><strong>البريد الإلكتروني:</strong> ${email}</p>
                        </div>
                    </div>

                    <div style="margin-bottom: 24px;">
                        <h3 style="color: #e74c3c; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-map-marked-alt"></i>
                            <span>العناوين المسجلة (${addresses.length})</span>
                            ${loadingBadge}
                        </h3>
                        <div>${addressesContent}</div>
                    </div>
                    ${ordersButton ? `<div style="text-align: center; margin-top: 20px;">${ordersButton}</div>` : ''}
                </div>
            `;
}

// ========================================
// ===== 2. التحقق من المصادقة =====
// ========================================

// التحقق من تحميل وحدة المصادقة (يعتمد على window.adminAuth من js/index-auth.js)
if (!window.adminAuth) {
    console.error('⚠️ لم يتم تحميل وحدة المصادقة adminAuth. لن تعمل حماية لوحة التحكم.');
} else {
    window.adminAuth.requireAuth();
}

function setPaymentToggleState(toggleElement, enabled) {
    if (!toggleElement) return;

    const checked = Boolean(enabled);
    toggleElement.checked = checked;

    const card = toggleElement.closest('.payment-method-card');
    if (card) {
        card.dataset.enabled = String(checked);
        card.classList.toggle('is-enabled', checked);
    }
}

async function handleCreateAdminSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');
    const nameInput = form.querySelector('#adminName');
    const emailInput = form.querySelector('#adminCreateEmail');
    const passwordInput = form.querySelector('#adminCreatePassword');
    const confirmInput = form.querySelector('#adminCreatePasswordConfirm');

    const name = nameInput?.value?.trim();
    const email = emailInput?.value?.trim();
    const password = passwordInput?.value?.trim();
    const passwordConfirm = confirmInput?.value?.trim();

    if (!name || !email || !password || !passwordConfirm) {
        showToast('error', 'إنشاء مدير', 'يرجى ملء جميع الحقول المطلوبة.');
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('error', 'إنشاء مدير', 'صيغة البريد الإلكتروني غير صحيحة.');
        emailInput?.focus();
        return;
    }

    if (password.length < 8) {
        showToast('error', 'إنشاء مدير', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
        passwordInput?.focus();
        return;
    }

    if (password !== passwordConfirm) {
        showToast('error', 'إنشاء مدير', 'تأكيد كلمة المرور لا يطابق المدخلة.');
        confirmInput?.focus();
        return;
    }

    const setLoading = (loading) => {
        if (!submitBtn) return;
        submitBtn.disabled = loading;
        submitBtn.classList.toggle('is-loading', loading);
    };

    setLoading(true);

    try {
        const response = await authorizedFetch(USERS_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                email,
                password,
                passwordConfirm,
                role: 'admin'
            })
        });

        if (!response?.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const message = errorBody?.message || errorBody?.msg || `HTTP ${response?.status}`;
            throw new Error(message);
        }

        showToast('success', 'إنشاء مدير', 'تم إنشاء حساب المدير الجديد بنجاح.');
        form.reset();
    } catch (error) {
        console.error('Error:', error);
        const message = error?.message || 'حدث خطأ أثناء إنشاء حساب المدير.';
        showToast('error', 'إنشاء مدير', message);
    } finally {
        setLoading(false);
    }
}

function getMessageStatusLabel(status) {
    const labels = {
        new: 'جديدة',
        pending: 'قيد المراجعة',
        resolved: 'تمت المعالجة',
        archived: 'مؤرشفة',
        read: 'مقروءة'
    };
    return labels[status] || status;
}

// ===== Messages Panel =====
const MESSAGE_FETCH_TTL = 60 * 1000;
const DEFAULT_MESSAGES_LIMIT = 50;

const mockMessages = [
    {
        id: 'msg-001',
        name: 'أحمد فؤاد',
        email: 'ahmed@example.com',
        phone: '+201001234567',
        subject: 'استفسار عن الشحن',
        message: 'مرحباً، هل يتوفر شحن مجاني للطلبات فوق 1000 ريال؟',
        createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        status: 'new',
        isRead: false
    }
];

function normalizeMessage(rawMessage = {}, index = 0) {
    if (!rawMessage || typeof rawMessage !== 'object') return null;

    const id = String(
        rawMessage._id
        || rawMessage.id
        || rawMessage.messageId
        || rawMessage.slug
        || rawMessage.uid
        || rawMessage.uuid
        || rawMessage.reference
        || `message-${index}`
    );

    const name = rawMessage.name
        || rawMessage.fullName
        || rawMessage.sender
        || rawMessage.senderName
        || rawMessage.user?.name
        || 'مستخدم مجهول';

    const email = rawMessage.email
        || rawMessage.mail
        || rawMessage.user?.email
        || '';

    const phone = rawMessage.phone
        || rawMessage.mobile
        || rawMessage.phoneNumber
        || rawMessage.user?.phone
        || '';

    const subject = rawMessage.subject
        || rawMessage.title
        || rawMessage.topic
        || 'بدون عنوان';

    const content = rawMessage.message
        || rawMessage.body
        || rawMessage.content
        || rawMessage.details
        || '';

    const createdAt = rawMessage.createdAt
        || rawMessage.created_at
        || rawMessage.createdOn
        || rawMessage.submittedAt
        || rawMessage.date
        || null;

    const status = rawMessage.status
        || (rawMessage.isWatched ? 'read' : 'new');

    const isRead = Boolean(rawMessage.isWatched || rawMessage.read || rawMessage.status === 'read');

    return {
        id,
        name,
        email,
        phone,
        subject,
        message: content,
        createdAt,
        status,
        isRead,
        raw: rawMessage
    };
}

function extractMessagesFromResponse(payload) {
    if (!payload) return [];

    const candidateArrays = [
        payload.data?.documents,
        payload.data?.messages,
        payload.data?.items,
        payload.data,
        payload.messages,
        payload.items,
        payload.results,
        Array.isArray(payload) ? payload : null
    ];

    for (const candidate of candidateArrays) {
        if (Array.isArray(candidate) && candidate.length) {
            return candidate;
        }
    }

    return [];
}

function setMessagesLoading(isLoading) {
    state.messagesLoading = Boolean(isLoading);
}

function setMessagesError(error) {
    state.messagesError = error ? String(error) : null;
}

async function fetchMessages({ force = false, query = {} } = {}) {
    if (state.messagesLoading) return;

    const shouldSkip = !force
        && state.messagesLoaded
        && Date.now() - state.messagesLastFetched < MESSAGE_FETCH_TTL;

    if (shouldSkip) {
        renderMessagesList(state.filters.messagesSearch || '');
        return;
    }

    setMessagesLoading(true);
    setMessagesError(null);
    renderMessagesList(state.filters.messagesSearch || '');

    try {
        const params = new URLSearchParams();
        const limit = Number.isFinite(query.limit) ? query.limit : DEFAULT_MESSAGES_LIMIT;
        if (limit) params.set('limit', String(limit));

        if (query.page) params.set('page', String(query.page));
        if (query.isWatched !== undefined && query.isWatched !== null) {
            params.set('isWatched', String(query.isWatched));
        }

        const searchTerm = (state.filters.messagesSearch || '').trim();
        if (searchTerm && query.search !== false) {
            params.set('search', searchTerm);
        }

        const url = params.toString()
            ? `${MESSAGE_ENDPOINT}?${params.toString()}`
            : MESSAGE_ENDPOINT;

        const response = await authorizedFetch(url);
        const handled = handleUnauthorized(response);
        if (handled !== response) {
            setMessagesLoading(false);
            return;
        }

        if (!response.ok) {
            const message = `${response.status} ${response.statusText || ''}`.trim();
            throw new Error(message || 'فشل جلب الرسائل');
        }

        const payload = await response.json().catch(() => null);
        const rawMessages = extractMessagesFromResponse(payload);

        const normalizedMessages = rawMessages
            .map((entry, index) => normalizeMessage(entry, index))
            .filter(Boolean);

        if (!normalizedMessages.length && !state.messagesLoaded && mockMessages.length) {
            state.messagesLoaded = true;
            state.messagesLastFetched = Date.now();
        }

        state.messages = normalizedMessages;
        recalculateUnreadMessages();
        state.messagesLoaded = true;
        state.messagesLastFetched = Date.now();

        renderMessagesList(state.filters.messagesSearch || '');
        updateMessagesBadge();
    } catch (error) {
        setMessagesError(error?.message || 'تعذر تحميل الرسائل.');

        if (!state.messagesLoaded && !state.messages.length && mockMessages.length) {
            state.messages = normalizeMessages(mockMessages);
            recalculateUnreadMessages();
        }
    } finally {
        setMessagesLoading(false);
        renderMessagesList(state.filters.messagesSearch || '');
        updateMessagesBadge();
    }
}

function initMessagesPanel() {
    state.messages = [];
    state.unreadMessages = 0;
    state.messagesLoaded = false;
    state.messagesLastFetched = 0;
    renderMessagesList(state.filters.messagesSearch || '');
    fetchMessages({ force: true }).catch(error => {
        console.error('Error:', error);
    });
}

function updateMessagesBadge() {
    const badge = document.getElementById('messagesBadge');
    if (!badge) return;
    badge.textContent = state.unreadMessages > 9 ? '9+' : String(state.unreadMessages || 0);
    badge.hidden = state.unreadMessages === 0;
}

function recalculateUnreadMessages() {
    state.unreadMessages = (Array.isArray(state.messages) ? state.messages : [])
        .filter(message => !message.isRead)
        .length;
}

function renderMessagesList(filterValue = '') {
    const list = document.getElementById('messagesList');
    if (!list) return;

    const filter = String(filterValue || state.filters.messagesSearch || '').trim();
    state.filters.messagesSearch = filter;

    if (state.messagesLoading) {
        safeHTML(list, `
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>جاري تحميل الرسائل...</p>
                    </div>
                `);
        return;
    }

    if (state.messagesError) {
        safeHTML(list, `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>تعذر تحميل الرسائل</h3>
                        <p>${escapeHtml(state.messagesError)}</p>
                        <button class="btn-secondary btn-sm" data-action="refresh-messages">
                            <i class="fas fa-sync-alt"></i> إعادة المحاولة
                        </button>
                    </div>
                `);
        return;
    }

    const baseMessages = Array.isArray(state.messages) ? state.messages : [];

    const filteredMessages = !filter
        ? baseMessages
        : baseMessages.filter(msg => [
            msg.name,
            msg.email,
            msg.phone,
            msg.subject,
            msg.message
        ].some(field => String(field || '').toLowerCase().includes(filter.toLowerCase())));

    if (!filteredMessages.length) {
        safeHTML(list, '<p class="empty-state">لا توجد رسائل مطابقة.</p>');
        return;
    }

    safeHTML(list, filteredMessages.map(msg => createMessageItemMarkup(msg)).join(''));
}

function createMessageItemMarkup(message) {
    const createdDate = message.createdAt ? new Date(message.createdAt) : null;
    const relativeTime = createdDate ? formatRelativeTime(createdDate) : 'غير معروف';
    const isUnread = !message.isRead;
    const statusKey = message.status ? String(message.status).toLowerCase() : '';
    const statusBadge = statusKey
        ? `<span class="message-badge message-badge--${escapeHtml(statusKey)}">${escapeHtml(getMessageStatusLabel(statusKey))}</span>`
        : '';

    const nameMarkup = escapeHtml(message.name || 'مستخدم مجهول');
    const emailMarkup = escapeHtml(message.email || '-');
    const subjectMarkup = escapeHtml(message.subject || 'بدون عنوان');
    const bodyMarkup = escapeHtml(message.message || '').replace(/\n/g, '<br>');

    const markReadButton = isUnread
        ? `<button type="button" data-action="mark-read" data-message-id="${escapeHtml(message.id)}"><i class="fas fa-check"></i> تعيين كمقروء</button>`
        : `<span class="message-status-label"><i class="fas fa-check-circle"></i> مقروءة</span>`;

    return `
                <article class="message-item ${isUnread ? 'unread' : ''}" data-message-id="${escapeHtml(message.id)}" role="listitem">
                    <header class="message-item-header">
                        <div>
                            <div class="message-sender">
                                <i class="fas fa-user-circle"></i>
                                <span>${nameMarkup}</span>
                                ${isUnread ? '<span class="message-badge">جديد</span>' : ''}
                            </div>
                            <div class="message-meta">
                                <span><i class="fas fa-envelope"></i> ${emailMarkup}</span>
                            </div>
                        </div>
                        <div class="message-meta">
                            ${statusBadge}
                            <time datetime="${escapeHtml(message.createdAt || '')}" aria-label="وقت الإرسال">${escapeHtml(relativeTime)}</time>
                        </div>
                    </header>
                    <div>
                        <p class="message-subject">${subjectMarkup}</p>
                        <p class="message-body">${bodyMarkup}</p>
                    </div>
                    <footer class="message-actions">
                        ${markReadButton}
                    </footer>
                </article>
            `;
}

function toggleMessagesPanel(forceState = null) {
    const panel = document.getElementById('messagesPanel');
    const overlay = document.getElementById('messagesOverlay');
    const targetState = forceState !== null
        ? Boolean(forceState)
        : !panel?.classList.contains('active');

    if (panel) {
        panel.classList.toggle('active', targetState);
    }
    if (overlay) {
        overlay.hidden = !targetState;
        overlay.style.opacity = targetState ? '1' : '0';
    }

    document.body.classList.toggle('messages-open', targetState);

    if (targetState) {
        if (!state.messagesLoaded && !state.messagesLoading) {
            fetchMessages({ force: true }).catch(error => {
                console.error('Error:', error);
            });
        } else {
            renderMessagesList(state.filters.messagesSearch || '');
        }
    }
}

async function markMessageWatchState(messageId) {
    if (!messageId) return false;

    try {
        const response = await authorizedFetch(`${MESSAGE_ENDPOINT}/${encodeURIComponent(messageId)}/watch`, {
            method: 'PATCH'
        });

        const handled = handleUnauthorized(response);
        if (handled !== response) {
            throw new Error('تم إنهاء الطلب بسبب انتهاء صلاحية الجلسة.');
        }

        if (!response.ok) {
            const message = `${response.status} ${response.statusText || ''}`.trim();
            throw new Error(message || 'تعذر تحديث حالة الرسالة');
        }

        return true;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

async function markMessagesAsRead() {
    const unreadMessages = state.messages.filter(msg => !msg.isRead);
    if (!unreadMessages.length) {
        showToast('info', 'الرسائل', 'لا توجد رسائل غير مقروءة حالياً.');
        return;
    }

    setMessagesLoading(true);
    renderMessagesList(state.filters.messagesSearch || '');

    const results = await Promise.allSettled(unreadMessages.map(msg => markMessageWatchState(msg.id)));

    const succeededIds = [];
    const failedIds = [];

    results.forEach((result, index) => {
        const targetId = unreadMessages[index].id;
        if (result.status === 'fulfilled' && result.value) {
            succeededIds.push(targetId);
        } else {
            failedIds.push(targetId);
        }
    });

    state.messages = state.messages.map(msg => succeededIds.includes(msg.id)
        ? { ...msg, isRead: true, status: msg.status === 'new' ? 'read' : (msg.status || 'read') }
        : msg
    );

    state.unreadMessages = state.messages.filter(msg => !msg.isRead).length;
    setMessagesLoading(false);
    renderMessagesList(state.filters.messagesSearch || '');
    updateMessagesBadge();

    if (succeededIds.length) {
        showToast('success', 'الرسائل', `تم تعيين ${succeededIds.length} رسالة كمقروءة.`);
    }

    if (failedIds.length) {
        showToast('warning', 'الرسائل', `تعذر تحديث ${failedIds.length} رسالة. حاول مجدداً لاحقاً.`);
    }
}

async function handleMessageAction(action, messageId) {
    const index = state.messages.findIndex(msg => msg.id === messageId);
    if (index === -1) return;

    const message = state.messages[index];

    if (action === 'mark-read') {
        if (message.isRead) {
            showToast('info', 'الرسائل', 'هذه الرسالة مقروءة بالفعل.');
            return;
        }

        try {
            await markMessageWatchState(messageId);
            state.messages[index] = {
                ...message,
                isRead: true,
                status: message.status === 'new' ? 'read' : (message.status || 'read')
            };
            state.unreadMessages = state.messages.filter(msg => !msg.isRead).length;
            renderMessagesList(state.filters.messagesSearch || '');
            updateMessagesBadge();
            showToast('success', 'الرسائل', 'تم تعيين الرسالة كمقروءة.');
        } catch (error) {
            showToast('error', 'الرسائل', error?.message || 'تعذر تحديث حالة الرسالة.');
        }
    } else if (action === 'refresh') {
        fetchMessages({ force: true }).catch(error => {
            console.error('Error:', error);
        });
    }
}

// ========================================
// ===== 3. دوال العرض (Rendering) =====
// ========================================

/**
 * عرض العلامات التجارية
 */
function renderBrands() {

    const list = document.getElementById('brandsList');
    const emptyState = document.getElementById('brandsEmptyState');

    if (!list) {
        console.error('Error:', new Error('brandsList element not found'));
        return;
    }
    if (!emptyState) {
        console.error('Error:', new Error('brandsEmptyState element not found'));
        return;
    }

    // التأكد من أن brands هو array
    if (!Array.isArray(state.brands)) {
        console.error('Error:', new Error('state.brands is not an array'));
        state.brands = [];
    }

    // تصفية العلامات التجارية بناءً على البحث
    const searchTerm = state.filters.brandSearch?.toLowerCase() || '';
    const filteredBrands = state.brands.filter(brand =>
        brand.name?.toLowerCase().includes(searchTerm)
    );

    if (filteredBrands.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';

    safeHTML(list, filteredBrands.map(brand => {
        const brandId = brand._id || brand.id;
        const imageUrl = brand.image?.secure_url || brand.image?.url || brand.image || 'img/placeholder.png';
        const description = brand.description || '';

        return `
                <div class="brand-card" data-brand-id="${brandId}">
                    <div class="brand-image">
                        <img src="${imageUrl}" alt="${brand.name}" onerror="this.src='img/placeholder.png'">
                    </div>
                    <div class="brand-info">
                        <h3>${escapeHtml(brand.name || '')}</h3>
                        ${description ? `<p class="brand-description">${escapeHtml(description)}</p>` : ''}
                    </div>
                    <div class="brand-actions">
                        <button class="action-btn edit-brand" data-brand-id="${brandId}" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn delete-brand" data-brand-id="${brandId}" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                `;
    }).join(''));

    // ربط أحداث الأزرار
    list.querySelectorAll('.edit-brand').forEach(btn => {
        btn.addEventListener('click', () => handleEditBrand(btn.dataset.brandId));
    });

    list.querySelectorAll('.delete-brand').forEach(btn => {
        btn.addEventListener('click', () => handleDeleteBrand(btn.dataset.brandId));
    });
}

/**
 * عرض الفئات الفرعية
 * @param {string} categoryId - معرف الفئة الرئيسية
 */
function renderSubcategories(categoryId = state.filters.subcategoryCategory) {
    const list = document.getElementById('subcategoriesList');
    const emptyState = document.getElementById('subcategoriesEmptyState');
    if (!list || !emptyState) return;

    const selectedCategoryId = categoryId || 'all';

    let loading;
    let error;
    let subcategories;

    if (selectedCategoryId === 'all') {
        const categoryIds = state.categories.map(category => category.id);
        loading = categoryIds.some(id => state.subcategoriesLoading[id]);
        const errors = categoryIds
            .map(id => getSubcategoryError(id))
            .filter(Boolean);
        error = errors.length ? errors[0] : null;
        subcategories = categoryIds.flatMap(id => {
            const items = state.subcategories[id] || [];
            return items.map(item => ({ ...item, categoryId: id }));
        });
    } else {
        loading = !!state.subcategoriesLoading[selectedCategoryId];
        error = getSubcategoryError(selectedCategoryId);
        subcategories = (state.subcategories[selectedCategoryId] || []).map(item => ({ ...item, categoryId: selectedCategoryId }));
    }

    emptyState.hidden = true;
    list.hidden = false;

    if (loading) {
        list.innerHTML = `
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>جاري تحميل الفئات الفرعية...</p>
                    </div>
                `;
        return;
    }

    if (error) {
        list.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>حدث خطأ أثناء تحميل الفئات الفرعية</h3>
                        <p>${escapeHtml(error)}</p>
                    </div>
                `;
        return;
    }

    const filteredSubcategories = applyFilters(subcategories, [
        filterBySearch(state.filters.subcategorySearch, ['name', 'description'])
    ]);

    if (!filteredSubcategories.length) {
        list.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-sitemap"></i>
                        <h3>${state.filters.subcategorySearch
                ? 'لا توجد نتائج مطابقة لبحثك'
                : selectedCategoryId === 'all'
                    ? 'لا توجد فئات فرعية حالياً'
                    : 'لا توجد فئات فرعية لهذه الفئة'}</h3>
                        <p>${state.filters.subcategorySearch
                ? 'حاول تعديل كلمات البحث أو إعادة ضبطه.'
                : selectedCategoryId === 'all'
                    ? 'استخدم زر "إضافة فئة فرعية جديدة" لإنشاء أول فئة.'
                    : 'يمكنك استخدام زر "إضافة فئة فرعية جديدة" لإضافة فئات لهذه الفئة.'}</p>
                    </div>
                `;
        return;
    }

    safeHTML(list, filteredSubcategories.map(subcategory => {
        const parentCategoryId = subcategory.categoryId || selectedCategoryId;
        const extras = getSubcategoryExtras(parentCategoryId, subcategory.id);
        const image = subcategory.image || extras.image;
        const description = subcategory.description || extras.description || 'لا يوجد وصف متاح لهذه الفئة الفرعية حالياً.';
        const parentCategory = getCategoryById(parentCategoryId);

        return `
                    <div class="subcategory-card" data-category-id="${parentCategoryId}" data-subcategory-id="${subcategory.id}">
                        <div class="subcategory-thumb ${image ? 'has-image' : ''}">
                            ${image ? `<img src="${image}" alt="${escapeHtml(subcategory.name)}">` : '<i class="fas fa-sitemap"></i>'}
                        </div>
                        <div class="subcategory-info">
                            <h3>${escapeHtml(subcategory.name)}</h3>
                            ${parentCategory ? `<p class="subcategory-parent"><i class="fas fa-tags"></i> ${escapeHtml(parentCategory.name)}</p>` : ''}
                        </div>
                        <div class="subcategory-actions">
                            <button class="btn-danger btn-sm" data-action="delete-subcategory" data-entity-id="${subcategory.id}" data-category-id="${parentCategoryId}" data-entity-name="${escapeHtml(subcategory.name)}" title="حذف"><i class="fas fa-trash"></i></button>
                            <button class="btn-secondary btn-sm" data-open-modal="subcategoryModal" data-modal-mode="edit" data-entity="subcategory" data-entity-id="${subcategory.id}" data-category-id="${parentCategoryId}" title="تعديل"><i class="fas fa-edit"></i> تعديل</button>
                        </div>
                    </div>
                `;
    }).join(''));
}

// ========================================
// ===== 4. دوال تطبيع البيانات (Normalization) =====
// ========================================

/**
 * تطبيع بيانات الفئة الفرعية من API
 * @param {Object} rawSubcategory - البيانات الخام من API
 * @param {number} index - الفهرس
 * @param {string} fallbackCategoryId - معرف الفئة الاحتياطي
 * @returns {Object|null} - الفئة الفرعية المطبعة
 */
function normalizeSubcategory(rawSubcategory = {}, index = 0, fallbackCategoryId = '') {
    if (!rawSubcategory || typeof rawSubcategory !== 'object') return null;

    const id = rawSubcategory._id || rawSubcategory.id || rawSubcategory.slug || `subcategory-${index}`;
    const name = rawSubcategory.name || rawSubcategory.title || 'فئة فرعية بدون اسم';
    const slug = rawSubcategory.slug || slugify(name);
    const description = rawSubcategory.description || rawSubcategory.summary || rawSubcategory.details || '';
    const status = rawSubcategory.status || 'active';

    const categoryField = rawSubcategory.category
        ?? rawSubcategory.categoryId
        ?? rawSubcategory.parent
        ?? fallbackCategoryId;

    let categoryId = '';
    if (typeof categoryField === 'string') {
        categoryId = categoryField;
    } else if (categoryField && typeof categoryField === 'object') {
        categoryId = categoryField._id || categoryField.id || categoryField.slug || categoryId;
    }

    return {
        id,
        name,
        slug,
        description,
        status,
        image: extractCategoryImage(rawSubcategory),
        categoryId,
        raw: rawSubcategory
    };
}

// تتبع طلب جلب العلامات التجارية لتفادي التكرار
let brandsFetchPromise = null;
let bannersFetchPromise = null;
let shippingZonesFetchPromise = null;

// ========================================
// ===== 5. دوال المصادقة والطلبات =====
// ========================================

/**
 * إرسال طلب HTTP مع رأس المصادقة
 * @param {string} url - عنوان URL
 * @param {Object} options - خيارات الطلب
 * @returns {Promise} - وعد بالاستجابة
 */
function decodeJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;

    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;

        let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (payload.length % 4 !== 0) {
            payload += '=';
        }

        const decoded = atob(payload);
        try {
            return JSON.parse(decodeURIComponent(decoded.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
        } catch (_) {
            return JSON.parse(decoded);
        }
    } catch (error) {
        console.warn('⚠️ Failed to decode JWT token:', error);
        return null;
    }
}

let isRefreshing = false;
let refreshSubscribers = [];

function authorizedFetch(url, options = {}) {
    const baseOptions = { ...options, credentials: 'include' };

    return fetch(url, baseOptions)
        .then(async (response) => {
            // If response is 401, try to refresh the token
            if (response.status === 401 && window.adminAuth) {
                if (!isRefreshing) {
                    isRefreshing = true;

                    try {
                        // Attempt to refresh the token
                        await window.adminAuth.refreshToken();

                        // Retry the original request with new token
                        return fetch(url, baseOptions);
                    } catch (refreshError) {
                        // Refresh failed, logout and redirect to login
                        console.error('Token refresh failed:', refreshError);
                        window.adminAuth.logout();
                        return Promise.reject(refreshError);
                    } finally {
                        isRefreshing = false;
                        // Notify all waiting requests
                        refreshSubscribers.forEach(callback => callback());
                        refreshSubscribers = [];
                    }
                } else {
                    // If already refreshing, wait for it to complete
                    return new Promise((resolve, reject) => {
                        refreshSubscribers.push(() => {
                            fetch(url, baseOptions)
                                .then(resolve)
                                .catch(reject);
                        });
                    });
                }
            }

            return response;
        })
        .catch(error => {
            // Handle network errors
            console.error('Network error in authorizedFetch:', error);
            throw error;
        });
}

/**
 * معالجة الاستجابات غير المصرح بها (401)
 * @param {Response} response - استجابة HTTP
 * @returns {Response} - نفس الاستجابة
 */
function extractIdFromObject(entity) {
    if (!entity || typeof entity !== 'object') return null;

    const candidates = [
        entity._id,
        entity.id,
        entity.userId,
        entity.uid,
        entity.sub,
        entity?.user?._id,
        entity?.user?.id,
        entity?.user?.userId,
        entity?.data?._id,
        entity?.data?.id,
        entity?.data?.user?._id,
        entity?.data?.user?.id,
        entity?.profile?._id,
        entity?.profile?.id
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
        if (typeof candidate === 'object' && candidate.$oid) {
            return String(candidate.$oid);
        }
        if (typeof candidate === 'number') {
            return String(candidate);
        }
    }

    return null;
}

function setCachedAdminId(value) {
    if (value && typeof value === 'string' && value.trim()) {
        cachedAdminId = value.trim();
    }
}

async function resolveCurrentAdminId(forceRefresh = false) {
    if (!forceRefresh && cachedAdminId) {
        return cachedAdminId;
    }

    const auth = window.adminAuth;
    if (!auth) return null;

    let authUser;
    try {
        authUser = auth.getUser?.() || null;
        const extractedFromUser = extractIdFromObject(authUser);
        if (extractedFromUser && !forceRefresh) {
            setCachedAdminId(extractedFromUser);
            return cachedAdminId;
        }
    } catch (error) {
        console.warn('⚠️ Failed to read stored admin user:', error);
    }

    const token = auth.getToken?.();
    const payload = decodeJwtPayload(token);
    const extractedFromPayload = extractIdFromObject(payload) || extractIdFromObject(payload?.user);
    if (extractedFromPayload && !forceRefresh) {
        setCachedAdminId(extractedFromPayload);
        return cachedAdminId;
    }
    if (payload?.sub && typeof payload.sub === 'string' && !forceRefresh) {
        setCachedAdminId(payload.sub);
        return cachedAdminId;
    }

    const candidateEndpoints = [
        `${ADMIN_API_BASE_URL}/auth/profile`,
        `${ADMIN_API_BASE_URL}/auth/me`,
        `${USERS_ENDPOINT}/me`
    ];

    for (const endpoint of candidateEndpoints) {
        try {
            const response = await authorizedFetch(endpoint);
            if (!response?.ok) continue;
            const data = await response.json().catch(() => null);
            const extracted = extractIdFromObject(data) || extractIdFromObject(data?.data) || extractIdFromObject(data?.user);
            if (extracted) {
                setCachedAdminId(extracted);
                return cachedAdminId;
            }
        } catch (error) {
            console.warn(`⚠️ Failed to fetch admin identity from ${endpoint}:`, error);
        }
    }

    const email = authUser?.email ? String(authUser.email).toLowerCase() : null;
    if (email) {
        try {
            const response = await authorizedFetch(`${USERS_ENDPOINT}?email=${encodeURIComponent(email)}`);
            if (response?.ok) {
                const data = await response.json().catch(() => null);
                const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
                const matched = list.find(item => String(item.email || '').toLowerCase() === email);
                const extracted = extractIdFromObject(matched);
                if (extracted) {
                    setCachedAdminId(extracted);
                    return cachedAdminId;
                }
            }
        } catch (error) {
            console.warn('⚠️ Failed to lookup admin by email:', error);
        }
    }

    console.warn('⚠️ Unable to determine current admin id. Password change request cannot proceed.');
    return null;
}

function handleUnauthorized(response) {
    if (response?.status === 401 && window.adminAuth) {
        console.warn('انتهت صلاحية الجلسة، يتم إعادة التوجيه إلى صفحة الدخول.');
        window.adminAuth.logout();
    }
    return response;
}

// ========================================
// ===== 6. المتغيرات العامة =====
// ========================================

// متغيرات الرسوم البيانية
let chartsLoaded = {
    overview: false,
    analytics: false
};

const chartInstances = {
    overview: {},
    analytics: {}
};

// ========================================
// ===== 7. البيانات الوهمية (Mock Data) =====
// ========================================

const mockData = {
    overviewMetrics: {
        revenue: 452300,
        avgOrder: 850,
        conversionRate: 3.2,
        returnRate: 1.8,
        weeklyChange: {
            revenue: 0.18,
            avgOrder: 0.05,
            conversionRate: -0.005,
            returnRate: -0.003
        }
    },
    overviewOrders: [
        { id: 'ORD-1042', customer: 'محمد أحمد', total: 8690, status: 'processing', date: '2025-10-25', payment: 'cash' }
    ],
    products: [],
    categories: [],
    collections: [
        { id: 'COL-1', name: 'حملة العودة للنادي', status: 'active', products: 12, schedule: '2025-10-01 — 2025-10-31', image: 'https://via.placeholder.com/400x200?text=Collection' }
    ],
    promotions: [
        { id: 'PR-1', title: 'خصم 20% على كل الأجهزة', type: 'percentage', value: '20%', period: '2025-10-20 — 2025-10-31', status: 'active' }
    ],
    banners: [],
    payments: [
        { id: 'cod', name: 'الدفع عند الاستلام', note: '', enabled: true }
    ],
    orders: [
        { id: 'ORD-1042', customer: 'محمد أحمد', total: 8690, status: 'processing', payment: 'cash', date: '2025-10-25', items: 3 }
    ],
    customers: [
        { id: 'CUS-778', name: 'محمد أحمد', email: 'm.ahmed@example.com', segment: 'vip', orders: 12, spend: 98000, status: 'active', lastOrder: '2025-10-25' }
    ],
    analyticsRangeOptions: [
        { value: '7d', label: 'آخر 7 أيام' },
        { value: '30d', label: 'آخر 30 يوم' },
        { value: '90d', label: 'آخر 3 أشهر' },
        { value: 'ytd', label: 'منذ بداية العام' }
    ],
    auditLogs: [
        { id: 1, createdAt: '2025-10-25 14:32:15', user: 'أحمد محمد', action: 'create', message: 'إضافة منتج جديد: "جهاز المشي"', ip: '192.168.1.1' }
    ],
    users: [
        { id: 'USR-1', name: 'أحمد محمد', email: 'ahmed@admin.com', role: 'admin', status: 'active', lastActive: '2025-10-25 14:32' }
    ],
    orderDetails: {
        'ORD-1042': {
            customer: { name: 'محمد أحمد', email: 'm.ahmed@example.com', phone: '01012345678' },
            shipping: { line: '15 شارع الجامعة', city: 'المنصورة، الدقهلية', country: 'مصر - 35516' },
            paymentMethod: 'الدفع عند الاستلام',
            date: '2025-10-25 14:30',
            items: [
                { name: 'جهاز المشي الكهربائي', quantity: 1, price: 8500 },
                { name: 'حبل القفز الرياضي', quantity: 2, price: 120 }
            ],
            summary: { subtotal: 8740, shipping: 50, discount: 100, total: 8690 },
            status: 'processing',
            notes: ''
        }
    }
};

// ========================================
// ===== 8. حالة التطبيق (Application State) =====
// ========================================

const state = {
    // الفلاتر
    filters: {
        productSearch: '',
        productCategory: 'all',
        productStatus: 'all',
        orderSearch: '',
        orderStatus: 'all',
        orderDate: '',
        customerSearch: '',
        customerOrdersFilter: 'all',
        customerSegment: 'all',
        auditSearch: '',
        auditAction: 'all',
        auditDate: '',
        analyticsRange: '30',
        analyticsDays: 30,
        analyticsStart: null,
        analyticsEnd: null,
        categorySearch: '',
        subcategoryCategory: 'all',
        subcategorySearch: '',
        brandSearch: '',
        messagesSearch: ''
    },
    // الفئات
    categories: [],
    categoriesLoading: false,
    categoriesError: null,
    categoryExtras: {},
    // الفئات الفرعية
    subcategories: {},
    subcategoriesLoading: {},
    subcategoriesError: {},
    subcategoryExtras: {},
    // المنتجات
    products: [],
    productsLoading: false,
    productsError: null,
    productExtras: {},
    // العلامات التجارية
    brands: [],
    brandsLoading: false,
    brandsError: null,
    // العملاء
    customers: [],
    customersLoading: false,
    customersError: null,
    // البانرات
    banners: [],
    bannersLoading: false,
    bannersError: null,
    // القسم الحالي
    currentSection: 'overview',
    messages: [],
    unreadMessages: 0,
    messagesLoading: false,
    messagesError: null,
    messagesLoaded: false,
    messagesLastFetched: 0,
    orders: [],
    ordersLoading: false,
    ordersError: null,
    ordersPagination: {
        currentPage: 1,
        totalPages: 1,
        totalOrders: 0
    },
    shippingZones: [],
    shippingZonesLoading: false,
    shippingZonesError: null,
    selectedShippingZoneId: '',
    // ===== LAZY LOADING FLAGS =====
    // Tracks which sections have been loaded to prevent duplicate loading
    sectionLoaded: {
        overview: false,
        products: false,
        categories: false,
        subcategories: false,
        brands: false,
        orders: false,
        customers: false,
        cms: false,
        payments: false,
        analytics: false,
        settings: false,
        users: false,
        collections: false,
        promotions: false
    },
    // Tracks if section data is currently being loaded
    sectionLoading: {
        overview: false,
        products: false,
        categories: false,
        subcategories: false,
        brands: false,
        orders: false,
        customers: false,
        cms: false,
        payments: false,
        analytics: false,
        settings: false,
        users: false,
        collections: false,
        promotions: false
    }
};

// ========================================
// ===== 9. بيانات الحالات (Status Metadata) =====
// ========================================

const STATUS_META = {
    new: { label: 'جديد', class: 'status-new' },
    preparing: { label: 'قيد التجهيز', class: 'status-preparing' },
    in_transit: { label: 'قيد التوصيل', class: 'status-in_transit' },
    delivered: { label: 'تم التوصيل', class: 'status-delivered' },
    // cancelled: { label: 'ملغي', class: 'status-cancelled' },
    processing: { label: 'قيد المعالجة', class: 'status-processing' },
    shipped: { label: 'تم الشحن', class: 'status-shipped' },
    completed: { label: 'مكتمل', class: 'status-completed' },
    active: { label: 'نشط', class: 'status-active' },
    inactive: { label: 'غير نشط', class: 'status-inactive' },
    scheduled: { label: 'مجدول', class: 'status-scheduled' },
    paused: { label: 'متوقف', class: 'status-paused' },
    low_stock: { label: 'مخزون منخفض', class: 'status-warning' },
    login: { label: 'تسجيل دخول', class: 'action-login' },
    create: { label: 'إضافة', class: 'action-create' },
    update: { label: 'تعديل', class: 'action-update' },
    delete: { label: 'حذف', class: 'action-delete' }
};

const ORDER_STATUS_FLOW = ['new', 'preparing', 'in_transit', 'delivered'];

function normalizeStatusKey(status) {
    if (status === undefined || status === null) return '';
    const normalized = String(status).trim().toLowerCase();
    if (!normalized) return '';

    const collapsed = normalized.replace(/[\s-]+/g, '_');
    const aliases = {
        canceled: 'cancelled',
        cancelled: 'cancelled',
        cancel: 'cancelled',
        in_preparation: 'preparing',
        preparation: 'preparing',
        preparing: 'preparing',
        pending: 'preparing',
        processing: 'preparing',
        in_delivery: 'in_transit',
        indelivery: 'in_transit',
        in_transit: 'in_transit',
        delivery: 'in_transit',
        shipped: 'in_transit',
        out_for_delivery: 'in_transit'
    };

    if (aliases[collapsed]) {
        return aliases[collapsed];
    }

    if (ORDER_STATUS_FLOW.includes(collapsed)) {
        return collapsed;
    }

    return collapsed;
}

function getOrderStatusOptions() {
    return ORDER_STATUS_FLOW.map(statusKey => ({
        value: statusKey,
        label: STATUS_META[statusKey]?.label || statusKey
    }));
}

// ===== Session Management =====
// حفظ القسم الحالي في sessionStorage لاستعادته عند إعادة تحميل الصفحة
function saveCurrentSection(section) {
    state.currentSection = section;
    try {
        sessionStorage.setItem('currentSection', section);
    } catch (error) {
        console.warn('Failed to save current section', error);
    }
}

function hydrateSubcategoryCategoryOptions() {
    const categories = state.categories;
    const filterSelect = document.getElementById('subcategoryCategoryFilter');
    const formSelect = document.getElementById('subcategoryCategory');

    const optionsMarkup = categories.map(category => `<option value="${category.id}">${category.name}</option>`).join('');
    const availableIds = new Set(categories.map(category => category.id));

    if (filterSelect) {
        const currentFilter = state.filters.subcategoryCategory;
        filterSelect.innerHTML = `<option value="">اختر الفئة الرئيسية</option>${optionsMarkup}`;
        if (currentFilter && availableIds.has(currentFilter)) {
            filterSelect.value = currentFilter;
        } else {
            filterSelect.value = '';
            if (currentFilter && !availableIds.has(currentFilter)) {
                state.filters.subcategoryCategory = '';
            }
        }
    }

    if (formSelect) {
        const previousValue = formSelect.value;
        formSelect.innerHTML = `<option value="">اختر الفئة الرئيسية</option>${optionsMarkup}`;

        const preferredValue = previousValue && availableIds.has(previousValue)
            ? previousValue
            : (state.filters.subcategoryCategory && availableIds.has(state.filters.subcategoryCategory)
                ? state.filters.subcategoryCategory
                : '');

        formSelect.value = preferredValue;
    }
}

function populateSubcategoryModal(categoryId, subcategoryId = null) {
    const form = document.getElementById('subcategoryForm');
    if (!form) return;

    hydrateSubcategoryCategoryOptions();

    const subcategory = subcategoryId ? getSubcategoryById(categoryId, subcategoryId) : null;
    const resolvedCategoryId = categoryId
        || subcategory?.categoryId
        || state.filters.subcategoryCategory
        || state.categories[0]?.id
        || '';
    const extras = subcategory ? getSubcategoryExtras(subcategory.categoryId || resolvedCategoryId, subcategory.id) : null;



    form.dataset.mode = subcategory ? 'edit' : 'create';

    setFieldValue(form, 'id', subcategory?.id || '');
    setFieldValue(form, 'categoryId', resolvedCategoryId);
    setFieldValue(form, 'originalCategoryId', subcategory?.categoryId || resolvedCategoryId);
    setFieldValue(form, 'name', subcategory?.name || '');
    const resolvedName = subcategory?.name || '';
    const resolvedSlug = subcategory?.slug || (resolvedName ? slugify(resolvedName) : '');
    setFieldValue(form, 'slug', resolvedSlug);
    const subcategoryDescriptionField = form.querySelector('[name="description"]');
    const initialDescription = extras?.description || subcategory?.description || '';
    setFieldValue(form, 'description', truncateText(initialDescription, getDescriptionMaxLength(subcategoryDescriptionField)));
    if (subcategoryDescriptionField) {
        updateDescriptionCounter(subcategoryDescriptionField);
    }

    const statusField = form.elements['status'];
    if (statusField) {
        statusField.value = subcategory?.status || 'active';
    }

    const imageInput = form.querySelector('#subcategoryImage');
    const targetImage = resolveImageSource(extras?.image) || resolveImageSource(subcategory?.image) || '';
    if (imageInput) {
        imageInput.value = '';
        imageInput.dataset.originalImage = targetImage;
        imageInput.dataset.previewImage = '';
    }
    updateSubcategoryImagePreview(targetImage);

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = subcategory ? 'حفظ التعديلات' : 'حفظ الفئة الفرعية';
    }

    if (subcategory) {
        const snapshot = {
            name: resolvedName,
            slug: resolvedSlug,
            description: truncateText(initialDescription, getDescriptionMaxLength(subcategoryDescriptionField)) || '',
            status: subcategory?.status || 'active',
            categoryId: subcategory?.categoryId || resolvedCategoryId
        };

        try {
            form.dataset.originalSubcategory = JSON.stringify(snapshot);
        } catch (error) {
            console.error('Error:', error);
            delete form.dataset.originalSubcategory;
        }
    } else {
        delete form.dataset.originalSubcategory;
    }
}

async function handleProductFormSubmit(event) {
    event.preventDefault();
    const form = event.target.closest('form');
    if (!form || form.dataset.entity !== 'product') {
        console.error('❌ Invalid form element');
        return;
    }

    // إظهار مؤشر التحميل
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton?.innerHTML || 'حفظ';
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    }

    try {
        // التحقق من الحقول المطلوبة
        const requiredFields = [
            { name: 'name', message: 'يرجى إدخال اسم المنتج' },
            { name: 'price', message: 'يرجى إدخال سعر المنتج' },
            { name: 'brand', message: 'يرجى اختيار علامة تجارية' },
            { name: 'category', message: 'يرجى اختيار الفئة الرئيسية' },
            { name: 'description', message: 'يرجى إدخال وصف للمنتج' }
        ];

        // التحقق من الحقول المطلوبة
        for (const field of requiredFields) {
            const input = form.querySelector(`[name="${field.name}"]`);
            if (input && !input.value.trim()) {
                showToast('error', 'خطأ في الإدخال', field.message);
                input.focus();
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.innerHTML = originalButtonText;
                }
                return;
            }
        }

        const mode = form.dataset.mode || 'create';
        const id = form.querySelector('[name="id"]')?.value;
        const discountInputValue = form.querySelector('[name="priceAfterDiscount"]')?.value.trim() ?? '';
        const originalDiscountValue = form.dataset.originalPriceAfterDiscount ?? '';
        const normalizedCurrentDiscount = discountInputValue || '';
        const normalizedOriginalDiscount = originalDiscountValue || '';
        const discountNeedsUpdate = mode === 'edit' && id && normalizedCurrentDiscount !== normalizedOriginalDiscount;

        try {
            // بناء بيانات المنتج
            const payload = buildProductPayload(form);

            // Get new image files from form state (which stores actual File objects)
            let newImageFiles = [];
            if (form.__productImageState && form.__productImageState.newImages) {
                newImageFiles = form.__productImageState.newImages;
            }

            // Get existing images that were not removed
            let existingImages = [];
            try {
                existingImages = JSON.parse(form.dataset.existingProductImages || '[]');
            } catch (e) {
                existingImages = [];
            }

            try {
                // طباعة البيانات للتشخيص
                // إضافة رسالة تحميل
                showToast('info', 'جاري الحفظ', 'جاري حفظ المنتج، يرجى الانتظار...', 2000);

                if (mode === 'edit' && id) {
                    await updateProduct(id, payload, newImageFiles, existingImages);

                    if (discountNeedsUpdate) {
                        const numericDiscount = normalizedCurrentDiscount === '' ? null : Number(normalizedCurrentDiscount);
                        await updateProductDiscountPrice(id, numericDiscount);
                    }

                    form.dataset.originalPriceAfterDiscount = normalizedCurrentDiscount;
                    showToast('success', 'تم التحديث', 'تم تحديث المنتج بنجاح');
                } else {
                    await createProduct(payload, newImageFiles);
                    showToast('success', 'تمت الإضافة', 'تمت إضافة المنتج بنجاح');
                    form.reset(); // إعادة تعيين النموذج بعد الإضافة
                    form.dataset.originalPriceAfterDiscount = '';
                }

                // إغلاق المودال بعد الحفظ
                closeModal('addProductModal');

                // تحديث قائمة المنتجات
                await fetchProducts();
                renderProducts();

            } catch (error) {
                console.error('Error:', error);
                let errorMessage = 'حدث خطأ أثناء محاولة حفظ المنتج';

                if (error.response) {
                    // معالجة أخطاء API
                    const errorData = error.response.data || {};
                    errorMessage = errorData.message || errorMessage;

                    // معالجة أخطاء التحقق من الصحة
                    if (errorData.errors) {
                        const errorMessages = Object.values(errorData.errors).flat();
                        errorMessage = errorMessages.join('\n');
                    }
                } else if (error.request) {
                    errorMessage = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
                }

                showToast('error', 'خطأ', errorMessage);
            }
        } catch (error) {
            console.error('Error:', error);
            let errorMessage = error.message || 'الرجاء التحقق من البيانات المدخلة';

            // تحسين رسائل الخطأ
            if (error.message.includes('brand') || error.message.includes('علامة تجارية')) {
                errorMessage = 'يجب اختيار علامة تجارية صالحة';
                const brandSelect = form.querySelector('#productBrand');
                if (brandSelect) brandSelect.focus();
            } else if (error.message.includes('category')) {
                errorMessage = 'يجب اختيار فئة رئيسية صالحة';
                const categorySelect = form.querySelector('#productCategory');
                if (categorySelect) categorySelect.focus();
            } else if (error.message.includes('price')) {
                errorMessage = 'يجب إدخال سعر صحيح';
                const priceInput = form.querySelector('[name="price"]');
                if (priceInput) priceInput.focus();
            }

            showToast('error', 'خطأ في البيانات', errorMessage);
            return;
        } finally {
            // إعادة تفعيل زر الحفظ
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonText;
            }
        }
    } catch (error) {
        console.error('Error:', error);

        // معالجة أخطاء التحقق من صحة البيانات
        if (error.message.includes('validation failed')) {
            const errorMessage = error.message.split(':').pop().trim();
            showToast('error', 'خطأ في التحقق من صحة البيانات', errorMessage);
        } else {
            showToast('error', 'خطأ', 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى');
        }
    }
}

// تحميل القسم المحفوظ أو الافتراضي عند بدء التطبيق
function loadCurrentSection() {
    try {
        return sessionStorage.getItem('currentSection') || 'overview';
    } catch (error) {
        console.error('Error:', error);
        return 'overview';
    }
}

// ===== Utility Helpers =====
function escapeHtml(value = '') {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resolveAssetUrl(path = '') {
    if (!path || typeof path !== 'string') return '';
    const trimmed = path.trim();

    if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
        return trimmed;
    }

    try {
        const base = new URL(ADMIN_API_BASE_URL);
        const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
        base.pathname = normalizedPath;
        base.search = '';
        base.hash = '';
        return base.toString();
    } catch (error) {
        console.warn('Failed to resolve asset url:', path, error);
        return trimmed;
    }
}

function resolveImageSource(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        return resolveAssetUrl(value);
    }

    if (typeof value === 'object') {
        const candidate = value.secure_url
            || value.url
            || value.src
            || value.path
            || value.href
            || value.preview;
        if (candidate) {
            return resolveAssetUrl(candidate);
        }
    }

    return '';
}

function extractCategoryImage(rawCategory = {}) {
    const candidates = [];

    const addCandidate = (value) => {
        if (!value) return;
        if (typeof value === 'string') {
            candidates.push(value);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach(addCandidate);
            return;
        }

        if (typeof value === 'object') {
            const candidate = value.secure_url
                || value.url
                || value.src
                || value.path
                || value.href;
            if (candidate) {
                candidates.push(candidate);
            }
        }
    };

    addCandidate(rawCategory.image);
    addCandidate(rawCategory.thumbnail);
    addCandidate(rawCategory.cover);
    addCandidate(rawCategory.media);
    if (Array.isArray(rawCategory.images)) {
        rawCategory.images.forEach(addCandidate);
    }

    const resolved = candidates
        .map(candidate => resolveAssetUrl(candidate))
        .find(candidate => typeof candidate === 'string' && candidate.trim().length > 0);

    return resolved || '';
}

const PRODUCT_PLACEHOLDER_IMAGE = 'https://via.placeholder.com/320x200?text=Product';
const BANNER_IMAGE_PLACEHOLDER = 'https://via.placeholder.com/1200x400?text=Banner';

function extractProductImage(rawProduct = {}) {
    const candidates = [];

    const addCandidate = (value) => {
        if (!value) return;
        if (typeof value === 'string') {
            candidates.push(value);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach(addCandidate);
            return;
        }

        if (typeof value === 'object') {
            const candidate = value.secure_url
                || value.url
                || value.src
                || value.path
                || value.href
                || value.preview;
            if (candidate) {
                candidates.push(candidate);
            }
        }
    };

    addCandidate(rawProduct.image);
    addCandidate(rawProduct.thumbnail);
    addCandidate(rawProduct.mainImage);
    addCandidate(rawProduct.cover);
    addCandidate(rawProduct.featuredImage);

    if (Array.isArray(rawProduct.images)) {
        rawProduct.images.forEach(addCandidate);
    }

    const resolved = candidates
        .map(candidate => resolveAssetUrl(candidate))
        .find(candidate => typeof candidate === 'string' && candidate.trim().length > 0);

    return resolved || PRODUCT_PLACEHOLDER_IMAGE;
}

function slugifyProduct(value = '') {
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^\w\u0600-\u06FF]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || `product-${Date.now()}`;
}

function normalizeProduct(rawProduct = {}, index = 0) {
    if (!rawProduct || typeof rawProduct !== 'object') return null;

    const id = rawProduct._id || rawProduct.id || rawProduct.slug || `product-${index}`;
    const name = rawProduct.name || rawProduct.title || 'منتج بدون اسم';
    const title = rawProduct.name || rawProduct.title || name;
    const slug = rawProduct.slug || rawProduct.handle || slugifyProduct(title || name);
    const sku = rawProduct.sku || rawProduct.code || '';
    const priceSource = rawProduct.price?.current
        ?? rawProduct.price?.value
        ?? rawProduct.price?.amount
        ?? rawProduct.price
        ?? rawProduct.currentPrice
        ?? rawProduct.salePrice;
    const price = Number(priceSource) && Number(priceSource) > 0 ? Number(priceSource) : 0;

    const priceAfterDiscountSource = rawProduct.priceAfterDiscount
        ?? rawProduct.discountedPrice
        ?? rawProduct.discountPrice
        ?? rawProduct.discount_value
        ?? rawProduct.discount
        ?? rawProduct.price?.afterDiscount
        ?? rawProduct.price?.discounted
        ?? rawProduct.salePriceAfterDiscount
        ?? null;
    const parsedDiscountPrice = Number(priceAfterDiscountSource);
    const priceAfterDiscount = Number.isFinite(parsedDiscountPrice) && parsedDiscountPrice >= 0
        ? parsedDiscountPrice
        : null;

    const installationPriceSource = rawProduct.installationPrice
        ?? rawProduct.installation_price
        ?? rawProduct.installation?.price
        ?? rawProduct.installation?.value
        ?? null;
    const installationPrice = Number.isFinite(Number(installationPriceSource)) && Number(installationPriceSource) >= 0
        ? Number(installationPriceSource)
        : null;

    const quantitySource = rawProduct.quantity
        ?? rawProduct.stock
        ?? rawProduct.availableQuantity
        ?? rawProduct.inventory
        ?? 0;
    const quantity = Number.isFinite(Number(quantitySource)) ? Number(quantitySource) : 0;

    const status = rawProduct.status || (quantity > 0 ? 'active' : 'inactive');

    const categoryField = rawProduct.category ?? rawProduct.mainCategory;
    let categoryId = 'uncategorized';
    let categorySlug = 'uncategorized';
    let categoryName = 'فئة غير محددة';

    if (typeof categoryField === 'string') {
        categoryId = categoryField;
        categorySlug = categoryField;
    } else if (categoryField && typeof categoryField === 'object') {
        categoryId = categoryField._id || categoryField.id || categoryField.slug || categoryId;
        categorySlug = categoryField.slug || categoryField._id || categorySlug;
        categoryName = categoryField.name || categoryField.title || categoryName;
    }

    const subCategoryField = rawProduct.subCategory || rawProduct.subcategory || rawProduct.subCategoryId;
    let subCategoryId = 'all';
    let subCategorySlug = 'all';
    let subCategoryName = '';

    if (typeof subCategoryField === 'string') {
        subCategoryId = subCategoryField;
        subCategorySlug = subCategoryField;
    } else if (subCategoryField && typeof subCategoryField === 'object') {
        subCategoryId = subCategoryField._id || subCategoryField.id || subCategoryField.slug || subCategoryId;
        subCategorySlug = subCategoryField.slug || subCategoryField._id || subCategorySlug;
        subCategoryName = subCategoryField.name || subCategoryField.title || subCategoryName;
    }

    const description = rawProduct.description || rawProduct.summary || rawProduct.shortDescription || '';
    const specs = rawProduct.specs
        || rawProduct.details
        || rawProduct.specifications
        || rawProduct.features
        || '';
    const image = extractProductImage(rawProduct);
    const sold = rawProduct.sold ?? rawProduct.sales ?? 0;
    const rating = rawProduct.rating?.average ?? rawProduct.ratingAverage ?? rawProduct.averageRating ?? rawProduct.rating ?? 0;
    const colors = Array.isArray(rawProduct.colors)
        ? rawProduct.colors.map(color => String(color).trim()).filter(Boolean)
        : [];
    const brandId = rawProduct.brand?._id || rawProduct.brand?.id || '';
    const brandName = rawProduct.brand?.name || rawProduct.brand || '';

    return {
        id,
        name,
        title,
        slug,
        sku,
        price,
        stock: quantity,
        category: categoryId,
        categoryId,
        categorySlug,
        categoryName,
        subCategoryId,
        subCategorySlug,
        subCategoryName,
        status,
        image,
        images: Array.isArray(rawProduct.images) ? rawProduct.images : [],
        description,
        specs,
        brand: rawProduct.brand?.name || rawProduct.brand || '',
        brandId,
        brandName,
        colors,
        sold,
        rating,
        installationPrice,
        raw: rawProduct,
        priceAfterDiscount
    };
}

function syncProductExtras(products = []) {
    state.productExtras = products.reduce((acc, product) => {
        acc[product.id] = {
            image: product.image,
            description: product.description,
            specs: product.specs,
            images: Array.isArray(product.images) ? product.images : [],
            brandName: product.brandName || product.brand || ''
        };
        return acc;
    }, {});
}

function upsertProductExtras(productId, extras = {}) {
    if (!productId) return;
    state.productExtras[productId] = {
        ...(state.productExtras[productId] || {}),
        ...extras
    };
}

function getProductsSource() {
    if (Array.isArray(state.products) && state.products.length) {
        return state.products;
    }
    return Array.isArray(mockData.products) ? mockData.products : [];
}

function getBannerSource() {
    if (Array.isArray(state.banners) && state.banners.length) {
        return state.banners;
    }
    return Array.isArray(mockData.banners) ? mockData.banners : [];
}

function normalizeBanner(rawBanner = {}, index = 0) {
    if (!rawBanner || typeof rawBanner !== 'object') return null;

    const id = rawBanner._id
        || rawBanner.id
        || rawBanner.bannerId
        || rawBanner.slug
        || rawBanner.reference
        || rawBanner.uuid
        || `banner-${Date.now()}-${index}`;

    const title = rawBanner.title || rawBanner.name || 'بانر بدون عنوان';
    const description = rawBanner.description || rawBanner.subtitle || rawBanner.details || '';
    const placement = rawBanner.placement || rawBanner.position || rawBanner.location || 'home_hero';
    const status = rawBanner.status || rawBanner.state || 'active';
    const link = rawBanner.link || rawBanner.url || rawBanner.targetUrl || rawBanner.href || '';
    const order = rawBanner.order ?? rawBanner.sortOrder ?? rawBanner.priority ?? 0;

    const imageCandidates = [
        rawBanner.image?.secure_url,
        rawBanner.image?.url,
        rawBanner.image,
        rawBanner.imageUrl,
        rawBanner.bannerImage,
        rawBanner.thumbnail,
        rawBanner.cover,
        rawBanner.mediaUrl
    ];

    const image = imageCandidates
        .map(candidate => resolveAssetUrl(candidate))
        .find(candidate => typeof candidate === 'string' && candidate.trim().length > 0)
        || BANNER_IMAGE_PLACEHOLDER;

    const scheduleStart = rawBanner.schedule?.start
        || rawBanner.startDate
        || rawBanner.start_at
        || rawBanner.validFrom
        || null;

    const scheduleEnd = rawBanner.schedule?.end
        || rawBanner.endDate
        || rawBanner.end_at
        || rawBanner.validTo
        || null;

    return {
        id,
        title,
        description,
        placement,
        status,
        link,
        image,
        order,
        schedule: {
            start: scheduleStart,
            end: scheduleEnd
        },
        createdAt: rawBanner.createdAt,
        updatedAt: rawBanner.updatedAt,
        raw: rawBanner
    };
}

function slugify(value = '') {
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^\w\u0600-\u06FF]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || `category-${Date.now()}`;
}

function normalizeCategory(rawCategory = {}, index = 0) {
    if (!rawCategory || typeof rawCategory !== 'object') return null;

    const id = rawCategory._id || rawCategory.id || rawCategory.slug || `category-${index}`;
    const name = rawCategory.name || rawCategory.title || 'فئة بدون اسم';
    const slug = rawCategory.slug || slugify(name);

    return {
        id,
        name,
        slug,
        image: extractCategoryImage(rawCategory),
        status: rawCategory.status || 'active',
        subcategoriesCount: rawCategory.subcategoriesCount
            ?? rawCategory.subCategoriesCount
            ?? rawCategory.subCategories?.length
            ?? rawCategory.subcategories?.length
            ?? rawCategory.children?.length
            ?? 0,
        productsCount: rawCategory.productsCount
            ?? rawCategory.productsNumber
            ?? rawCategory.products?.length
            ?? rawCategory.count
            ?? 0,
        createdAt: rawCategory.createdAt,
        updatedAt: rawCategory.updatedAt,
        description: rawCategory.description || rawCategory.summary || rawCategory.details || ''
    };
}

function normalizeOrderId(orderId) {
    if (!orderId) return '';
    return String(orderId).trim();
}

function getDefaultCategoryExtras() {
    return {
        image: '',
        description: ''
    };
}

function upsertCategoryExtras(categoryId, extras = {}) {
    if (!categoryId) return;

    const current = state.categoryExtras[categoryId] || getDefaultCategoryExtras();

    const next = {
        image: extras.image ?? current.image ?? '',
        description: extras.description ?? current.description ?? ''
    };

    state.categoryExtras[categoryId] = next;

    const index = state.categories.findIndex(category => category.id === categoryId);
    if (index !== -1) {
        const existing = state.categories[index];
        state.categories[index] = {
            ...existing,
            image: next.image,
            description: next.description || existing.description || ''
        };
    }

    syncCategoriesCache(state.categories);
}

function syncCategoryExtras(categories = []) {
    state.categoryExtras = categories.reduce((acc, category) => {
        const base = getDefaultCategoryExtras();
        acc[category.id] = {
            image: category.image ?? base.image,
            description: category.description ?? base.description
        };
        return acc;
    }, {});
}

function syncCategoriesCache(categories = []) {
    // لا نقوم باستبدال البيانات الوهمية عند جلب بيانات حقيقية من الـ API
}

function getCategorySource() {
    return state.categories.length > 0 ? state.categories : mockData.categories;
}

function getCategoryById(categoryId) {
    const source = getCategorySource();
    return source.find(category => category.id === categoryId);
}

function ensureCategorySubcategories(categoryId) {
    if (!categoryId) return [];
    if (!state.subcategories[categoryId]) {
        state.subcategories[categoryId] = [];
    }
    if (!state.subcategoryExtras[categoryId]) {
        state.subcategoryExtras[categoryId] = {};
    }
    return state.subcategories[categoryId];
}

function getSubcategories(categoryId, { fallback = [] } = {}) {
    if (!categoryId) return fallback;
    const collection = state.subcategories[categoryId];
    return Array.isArray(collection) && collection.length ? collection : fallback;
}

function getSubcategoryById(categoryId, subcategoryId) {
    if (!categoryId || !subcategoryId) return null;
    const collection = getSubcategories(categoryId);
    return collection.find(entry => entry.id === subcategoryId) || null;
}

function upsertSubcategory(categoryId, subcategory = {}) {
    if (!categoryId || !subcategory?.id) return;
    const collection = ensureCategorySubcategories(categoryId);
    const index = collection.findIndex(entry => entry.id === subcategory.id);
    if (index === -1) {
        collection.push(subcategory);
    } else {
        collection[index] = { ...collection[index], ...subcategory };
    }
}

function removeSubcategory(categoryId, subcategoryId) {
    if (!categoryId || !subcategoryId) return;
    const collection = ensureCategorySubcategories(categoryId);
    const index = collection.findIndex(entry => entry.id === subcategoryId);
    if (index !== -1) {
        collection.splice(index, 1);
    }
    if (state.subcategoryExtras[categoryId]) {
        delete state.subcategoryExtras[categoryId][subcategoryId];
    }
}

function upsertSubcategoryExtras(categoryId, subcategoryId, extras = {}) {
    if (!categoryId || !subcategoryId) return;
    if (!state.subcategoryExtras[categoryId]) {
        state.subcategoryExtras[categoryId] = {};
    }
    const current = state.subcategoryExtras[categoryId][subcategoryId] || { image: '', description: '' };
    state.subcategoryExtras[categoryId][subcategoryId] = {
        image: extras.image ?? current.image ?? '',
        description: extras.description ?? current.description ?? ''
    };
}

function getSubcategoryExtras(categoryId, subcategoryId) {
    return state.subcategoryExtras[categoryId]?.[subcategoryId] || { image: '', description: '' };
}

function setSubcategoryLoading(categoryId, value) {
    if (!categoryId) return;
    state.subcategoriesLoading[categoryId] = Boolean(value);
}

function setSubcategoryError(categoryId, message = null) {
    if (!categoryId) return;
    if (message) {
        state.subcategoriesError[categoryId] = message;
    } else {
        delete state.subcategoriesError[categoryId];
    }
}

function getSubcategoryError(categoryId) {
    return state.subcategoriesError[categoryId] || null;
}

// ===== Category and Product Form Functions =====
function hydrateProductCategoryOptions() {
    const select = document.getElementById('productCategory');
    if (!select) return;

    // حفظ القيمة المحددة حالياً
    const currentValue = select.value;

    // مسح الخيارات الحالية
    select.innerHTML = '';

    // إضافة الخيار الافتراضي
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'اختر الفئة الرئيسية';
    select.appendChild(defaultOption);

    // إضافة الفئات المتاحة
    state.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        select.appendChild(option);
    });

    // استعادة القيمة المحددة إذا كانت لا تزال صالحة
    if (currentValue && state.categories.some(c => c.id === currentValue)) {
        select.value = currentValue;
        // تحديث قائمة الفئات الفرعية عند استعادة القيمة
        populateSubcategoryOptions(currentValue);
    } else if (state.categories.length > 0) {
        // تحديد أول فئة كإفتراضية إذا لم تكن هناك قيمة حالية
        select.value = state.categories[0].id;
        populateSubcategoryOptions(state.categories[0].id);
    }
}

// ===== API Functions =====

// Brands
async function fetchBrands(options = {}) {
    const forceReload = options.force === true;

    if (brandsFetchPromise) {
        if (!forceReload) {
            return brandsFetchPromise;
        }

        try {
            await brandsFetchPromise;
        } catch (err) {
            console.warn('⚠️ Previous brands fetch failed, retrying with force reload.', err);
        }
    }

    state.brandsLoading = true;
    state.brandsError = null;

    const request = (async () => {
        try {
            const response = await authorizedFetch(BRAND_API, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();


            const candidates = [
                data,
                data?.data,
                data?.data?.documents,
                data?.data?.rows,
                data?.data?.items,
                data?.documents,
                data?.brands,
                Array.isArray(data?.data) ? data.data : null
            ].filter(Array.isArray);

            if (candidates.length > 0) {
                state.brands = candidates[0];
            } else {
                console.warn('⚠️ Unexpected brands response format:', data);
                state.brands = [];
            }


            return state.brands;
        } catch (error) {
            state.brandsError = error;
            console.error('❌ Failed to fetch brands:', error);
            throw error;
        } finally {
            state.brandsLoading = false;
            brandsFetchPromise = null;
        }
    })();

    brandsFetchPromise = request;
    return request;
}

async function createBrand(brandData, imageFile = null) {
    try {
        const formData = new FormData();
        formData.append('name', brandData.name);
        formData.append('description', brandData.description);

        if (imageFile) {
            formData.append('image', imageFile);
        }

        const response = await authorizedFetch(BRAND_API, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        return data;
    } catch (error) {
        console.error('❌ Failed to create brand:', error);
        throw error;
    }
}

async function updateBrand(brandId, brandData = {}, imageFile = null) {


    if (!brandId) {
        throw new Error('معرّف العلامة التجارية غير صالح');
    }

    if (!brandData?.name) {
        throw new Error('يجب إدخال اسم العلامة التجارية');
    }

    const normalizedData = {
        name: brandData.name?.trim(),
        description: brandData.description?.trim() ?? ''
    };

    const requestOptions = {
        method: 'PATCH',
        headers: {
            Accept: 'application/json'
        }
    };

    if (imageFile instanceof File) {
        const formData = new FormData();
        Object.entries(normalizedData).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                formData.append(key, value);
            }
        });
        formData.append('image', imageFile);
        requestOptions.body = formData;
    } else {
        requestOptions.headers['Content-Type'] = 'application/json';
        requestOptions.body = JSON.stringify(normalizedData);
    }

    const response = handleUnauthorized(await authorizedFetch(`${BRAND_API}/${encodeURIComponent(brandId)}`, requestOptions));

    const contentType = response.headers.get('content-type') || '';
    const hasJsonBody = contentType.includes('application/json');
    const responseBody = hasJsonBody ? await response.json().catch(() => ({})) : {};

    if (!response.ok) {
        const message = responseBody?.message || `HTTP ${response.status}`;
        throw new Error(message);
    }

    const updatedBrand = responseBody?.data || responseBody || null;

    if (Array.isArray(state.brands) && updatedBrand) {
        const targetId = String(brandId);
        state.brands = state.brands.map(brand => {
            const currentId = String(brand._id || brand.id || '');
            if (currentId !== targetId) return brand;
            return { ...brand, ...updatedBrand };
        });
        renderBrands();
    }

    return updatedBrand;
}

async function deleteBrand(brandId) {
    try {
        const response = await authorizedFetch(`${BRAND_API}/${brandId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        return data;
    } catch (error) {
        console.error(`❌ Failed to delete brand ${brandId}:`, error);
        throw error;
    }
}

async function fetchBanners(options = {}) {
    const forceReload = options.force === true;

    if (bannersFetchPromise) {
        if (!forceReload) {
            return bannersFetchPromise;
        }

        try {
            await bannersFetchPromise;
        } catch (err) {
            console.warn('⚠️ Previous banners fetch failed, retrying with force reload.', err);
        }
    }

    state.bannersLoading = true;
    state.bannersError = null;
    renderBanners();

    const request = (async () => {
        try {
            const response = handleUnauthorized(await authorizedFetch(BANNER_API));
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json().catch(() => ({}));
            const candidates = [
                data?.data?.banners,
                data?.data?.documents,
                data?.data,
                data?.banners,
                data?.documents,
                Array.isArray(data) ? data : null
            ].filter(Array.isArray);

            const banners = (candidates[0] || []).map((banner, index) => normalizeBanner(banner, index)).filter(Boolean);
            state.banners = banners;
            state.bannersError = null;

            return banners;
        } catch (error) {
            console.error('❌ Failed to fetch banners:', error);
            state.bannersError = error?.message || 'تعذر تحميل البانرات. يرجى المحاولة مرة أخرى.';
            state.banners = [];
            throw error;
        } finally {
            state.bannersLoading = false;
            bannersFetchPromise = null;
            renderBanners();
        }
    })();

    bannersFetchPromise = request;
    return request;
}

async function createBanner(bannerData = {}, imageFile = null) {
    try {
        const formData = new FormData();
        formData.append('title', bannerData.title);
        formData.append('description', bannerData.description);
        if (imageFile instanceof File) {
            formData.append('image', imageFile);
        }

        const response = await authorizedFetch(BANNER_API, {
            method: 'POST',
            body: formData
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.message || `HTTP ${response.status}`);
        }


        return data?.data || data;
    } catch (error) {
        console.error('❌ Failed to create banner:', error);
        throw error;
    }
}

async function updateBanner(bannerId, bannerData = {}, imageFile = null) {
    if (!bannerId) {
        throw new Error('معرّف البانر غير صالح');
    }

    try {
        const formData = new FormData();
        if (bannerData.title !== undefined) formData.append('title', bannerData.title);
        if (bannerData.description !== undefined) formData.append('description', bannerData.description);
        if (imageFile instanceof File) {
            formData.append('image', imageFile);
        }

        const response = await authorizedFetch(`${BANNER_API}/${encodeURIComponent(bannerId)}`, {
            method: 'PATCH',
            body: formData
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.message || `HTTP ${response.status}`);
        }


        return data?.data || data;
    } catch (error) {
        console.error(`❌ Failed to update banner ${bannerId}:`, error);
        throw error;
    }
}

async function deleteBanner(bannerId) {
    if (!bannerId) {
        throw new Error('معرّف البانر غير صالح');
    }

    try {
        const response = await authorizedFetch(`${BANNER_API}/${encodeURIComponent(bannerId)}`, {
            method: 'DELETE'
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.message || `HTTP ${response.status}`);
        }


        return data?.data || data;
    } catch (error) {
        console.error(`❌ Failed to delete banner ${bannerId}:`, error);
        throw error;
    }
}

function normalizeShippingZone(rawZone = {}, index = 0) {
    if (!rawZone || typeof rawZone !== 'object') return null;

    const id = rawZone._id
        || rawZone.id
        || rawZone.zoneId
        || rawZone.key
        || `zone-${Date.now()}-${index}`;

    const zoneName = rawZone.zoneName
        || rawZone.nameAr
        || rawZone.name
        || rawZone.nameEn
        || rawZone.title
        || 'منطقة غير معروفة';

    const rate = Number(rawZone.shippingRate ?? rawZone.rate ?? rawZone.price ?? rawZone.cost ?? 0) || 0;
    const installationAvailable = Boolean(
        rawZone.isInstallationAvailable ?? rawZone.installationAvailable ?? rawZone.hasInstallation
    );

    return {
        id,
        zoneName,
        shippingRate: rate,
        installationAvailable,
        raw: rawZone
    };
}

async function fetchShippingZones(options = {}) {
    const { force = false } = options || {};

    if (shippingZonesFetchPromise) {
        if (!force) {
            return shippingZonesFetchPromise;
        }

        try {
            await shippingZonesFetchPromise;
        } catch (error) {
            console.warn('⚠️ Previous shipping zones fetch failed, retrying...', error);
        }
    }

    state.shippingZonesLoading = true;
    state.shippingZonesError = null;
    renderShippingSettings();

    const request = (async () => {
        try {
            const response = handleUnauthorized(await authorizedFetch(SHIPPING_ZONES_ENDPOINT));
            if (!response?.ok) {
                throw new Error(`HTTP ${response?.status}`);
            }

            const payload = await response.json().catch(() => ({}));
            const zonesArray = [
                payload?.data?.zones,
                payload?.data?.shippingZones,
                payload?.data,
                payload?.zones,
                payload?.shippingZones,
                Array.isArray(payload) ? payload : null
            ].find(Array.isArray) || [];

            const normalized = zonesArray
                .map((zone, index) => normalizeShippingZone(zone, index))
                .filter(Boolean);

            state.shippingZones = normalized;
            state.shippingZonesError = null;

            const hasSelected = normalized.some(zone => String(zone.id) === String(state.selectedShippingZoneId));
            if (!hasSelected) {
                state.selectedShippingZoneId = normalized[0]?.id || '';
            }


            return normalized;
        } catch (error) {
            console.error('❌ Failed to fetch shipping zones:', error);
            state.shippingZones = [];
            state.shippingZonesError = error?.message || 'تعذر تحميل مناطق الشحن';
            throw error;
        } finally {
            state.shippingZonesLoading = false;
            shippingZonesFetchPromise = null;
            renderShippingSettings();
        }
    })();

    shippingZonesFetchPromise = request;
    return request;
}

async function updateShippingZoneRate(zoneId, shippingRate, isInstallationAvailable) {
    if (!zoneId) {
        throw new Error('لم يتم تحديد منطقة الشحن');
    }

    const numericRate = Number(shippingRate);
    if (!Number.isFinite(numericRate) || numericRate < 0) {
        throw new Error('يرجى إدخال قيمة صالحة لتكلفة الشحن');
    }

    const payload = { shippingRate: numericRate };
    if (typeof isInstallationAvailable === 'boolean') {
        payload.isInstallationAvailable = isInstallationAvailable;
        payload.installationAvailable = isInstallationAvailable;
    }

    showToast('info', 'تحديث تكلفة الشحن', 'جاري تحديث تكلفة الشحن، يرجى الانتظار...');

    try {
        const response = handleUnauthorized(await authorizedFetch(`${SHIPPING_ZONES_ENDPOINT}/${encodeURIComponent(zoneId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }));

        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(responseBody?.message || `HTTP ${response.status}`);
        }

        showToast('success', 'تحديث تكلفة الشحن', 'تم حفظ تكلفة الشحن بنجاح');
        await fetchShippingZones({ force: true });
        return responseBody?.data || responseBody;
    } catch (error) {
        console.error(`❌ Failed to update shipping zone ${zoneId}:`, error);
        showToast('error', 'تحديث تكلفة الشحن', error?.message || 'حدث خطأ أثناء تحديث تكلفة الشحن');
        throw error;
    }
}

async function createShippingZone(nameAr, nameEn, shippingRate) {
    const arabicName = typeof nameAr === 'string' ? nameAr.trim() : '';
    const englishName = typeof nameEn === 'string' ? nameEn.trim() : '';

    if (!arabicName) {
        throw new Error('يرجى إدخال اسم المنطقة بالعربية');
    }

    if (!englishName) {
        throw new Error('يرجى إدخال اسم المنطقة بالإنجليزية');
    }

    const numericRate = Number(shippingRate);
    if (!Number.isFinite(numericRate) || numericRate < 0) {
        throw new Error('يرجى إدخال تكلفة شحن صحيحة (0 أو أكبر)');
    }

    showToast('info', 'إضافة منطقة الشحن', 'جاري إنشاء منطقة الشحن الجديدة...');

    try {
        const requestPayload = {
            nameAr: arabicName,
            nameEn: englishName,
            shippingRate: numericRate,
        };

        const response = handleUnauthorized(await authorizedFetch(SHIPPING_ZONES_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        }));

        const responseJson = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(responseJson?.message || `HTTP ${response.status}`);
        }

        const createdZone = responseJson?.data?.shippingZone
            || responseJson?.data?.zone
            || responseJson?.data
            || responseJson;
        const createdId = createdZone?._id || createdZone?.id || createdZone?.zoneId || null;

        if (createdId) {
            state.selectedShippingZoneId = createdId;
        }

        showToast('success', 'إضافة منطقة الشحن', 'تم إنشاء منطقة الشحن بنجاح');
        await fetchShippingZones({ force: true });
        return responseJson?.data || responseJson;
    } catch (error) {
        console.error('❌ Failed to create shipping zone:', error);
        showToast('error', 'إضافة منطقة الشحن', error?.message || 'حدث خطأ أثناء إنشاء منطقة الشحن');
        throw error;
    }
}

async function deleteShippingZone(zoneId) {
    if (!zoneId) {
        throw new Error('لم يتم اختيار منطقة الشحن');
    }

    showToast('info', 'حذف منطقة الشحن', 'جاري حذف منطقة الشحن المحددة...');

    try {
        const response = handleUnauthorized(await authorizedFetch(`${SHIPPING_ZONES_ENDPOINT}/${encodeURIComponent(zoneId)}`, {
            method: 'DELETE'
        }));

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.message || `HTTP ${response.status}`);
        }

        showToast('success', 'حذف منطقة الشحن', 'تم حذف منطقة الشحن بنجاح');
        if (String(state.selectedShippingZoneId) === String(zoneId)) {
            state.selectedShippingZoneId = '';
        }
        await fetchShippingZones({ force: true });
        return payload?.data || payload;
    } catch (error) {
        console.error(`❌ Failed to delete shipping zone ${zoneId}:`, error);
        showToast('error', 'حذف منطقة الشحن', error?.message || 'حدث خطأ أثناء حذف منطقة الشحن');
        throw error;
    }
}

function getShippingZoneById(zoneId) {
    if (!zoneId) return null;
    return state.shippingZones.find(zone => String(zone.id) === String(zoneId)) || null;
}

function hydrateSettingsForms() {
    fetchShippingZones().catch(error => {
        console.error('❌ Failed to hydrate shipping settings:', error);
    });
}

async function handleShippingSettingsSubmit(event) {
    event.preventDefault();

    const form = event.target;
    if (!form || form.dataset.entity !== 'shipping-settings') {
        return;
    }

    const select = form.querySelector('#shippingZoneSelect');
    const rateInput = form.querySelector('#shippingZoneRate');
    const submitButton = form.querySelector('#shippingSettingsSubmit');
    const installationCheckbox = form.querySelector('#shippingZoneInstallation');

    const zoneId = select?.value;
    const rateValue = rateInput?.value;
    const installationValue = installationCheckbox?.checked ?? null;

    if (!zoneId) {
        showToast('error', 'إعدادات الشحن', 'يرجى اختيار المنطقة أولاً');
        return;
    }

    const numericRate = Number(rateValue);
    if (!Number.isFinite(numericRate) || numericRate < 0) {
        showToast('error', 'إعدادات الشحن', 'يرجى إدخال تكلفة شحن صحيحة (0 أو أكبر)');
        rateInput?.focus();
        return;
    }

    const originalState = submitButton ? { disabled: submitButton.disabled, label: submitButton.innerHTML } : null;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    }

    try {
        await updateShippingZoneRate(zoneId, numericRate, installationValue);
    } catch (error) {
    } finally {
        if (submitButton && originalState) {
            submitButton.disabled = originalState.disabled;
            submitButton.innerHTML = originalState.label;
        }
    }
}

async function fetchCategories() {
    state.categoriesLoading = true;
    state.categoriesError = null;
    renderCategories();

    try {
        const categoriesUrl = `${CATEGORY_ENDPOINT}?page=1&limit=100`;
        const response = handleUnauthorized(await authorizedFetch(categoriesUrl));

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();

        const documents = Array.isArray(payload?.data?.documents)
            ? payload.data.documents
            : Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload)
                    ? payload
                    : [];


        const previousExtras = { ...state.categoryExtras };
        const normalized = documents
            .map((doc, index) => normalizeCategory(doc, index))
            .filter(Boolean)
            .map(category => {
                const extras = previousExtras[category.id];
                const image = category.image || extras?.image || '';
                const description = category.description || extras?.description || '';
                return {
                    ...category,
                    image,
                    description
                };
            });


        state.categories = normalized;
        syncCategoriesCache(normalized);
        syncCategoryExtras(normalized);
        hydrateProductCategoryOptions();
        hydrateSubcategoryCategoryOptions();
        if (!state.filters.subcategoryCategory && normalized.length) {
            state.filters.subcategoryCategory = normalized[0].id;
            hydrateSubcategoryCategoryOptions();
        }

        if (normalized.length) {
            const selectedCategoryId = state.filters.subcategoryCategory || normalized[0].id;
            const preloadPromises = normalized.map(category =>
                fetchSubcategories(category.id, {
                    force: true,
                    skipRender: category.id !== selectedCategoryId
                })
            );

            await Promise.allSettled(preloadPromises);
            renderSubcategories(selectedCategoryId);
        } else {
            renderSubcategories();
        }
    } catch (error) {
        state.categoriesError = 'تعذر تحميل الفئات. يرجى المحاولة مرة أخرى.';
    } finally {
        state.categoriesLoading = false;
        renderCategories();
        hydrateFilters(); // تحديث فلتر الفئات في قسم المنتجات
    }
}

async function fetchProducts() {
    state.productsLoading = true;
    state.productsError = null;
    renderProducts();

    try {
        const response = handleUnauthorized(await authorizedFetch(PRODUCT_ENDPOINT));

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();

        const documents = Array.isArray(payload?.data?.products)
            ? payload.data.products
            : Array.isArray(payload?.data?.documents)
                ? payload.data.documents
                : Array.isArray(payload?.data)
                    ? payload.data
                    : Array.isArray(payload)
                        ? payload
                        : [];

        const previousExtras = { ...state.productExtras };
        const normalized = documents
            .map((product, index) => normalizeProduct(product, index))
            .filter(Boolean)
            .map(product => {
                const extras = previousExtras[product.id];
                return {
                    ...product,
                    image: extras?.image || product.image,
                    description: extras?.description || product.description,
                    specs: extras?.specs || product.specs,
                    images: Array.isArray(extras?.images) && extras.images.length ? extras.images : product.images,
                    brandName: extras?.brandName || product.brandName || product.brand
                };
            });


        state.products = normalized;
        syncProductExtras(normalized);
    } catch (error) {
        state.productsError = error.message || 'تعذر تحميل المنتجات. يرجى المحاولة مرة أخرى.';
        state.products = [];
    } finally {
        state.productsLoading = false;
        hydrateFilters();
        renderProducts();
        renderTopProducts();

        // تحديث إحصائيات نظرة عامة إذا كانت محملة
        if (state.currentSection === 'overview') {
            updateOverviewStats();
        }
    }
}

function mergeProductWithExtras(product) {
    if (!product) return product;
    const extras = state.productExtras[product.id];
    if (!extras) return product;
    return {
        ...product,
        image: extras.image || product.image,
        description: extras.description || product.description,
        specs: extras.specs || product.specs,
        images: Array.isArray(extras.images) && extras.images.length
            ? extras.images
            : product.images,
        brandName: extras.brandName || product.brandName || product.brand
    };
}

function buildProductPayload(form) {
    const formData = new FormData(form);

    const name = getFormValue(formData, 'name', '').trim();
    const title = getFormValue(formData, 'title', '').trim() || name;
    const description = getFormValue(formData, 'description', '').trim();
    const priceValue = getFormValue(formData, 'price', '0');
    const priceAfterDiscountValue = getFormValue(formData, 'priceAfterDiscount', '').trim();
    const installationPriceValue = getFormValue(formData, 'installationPrice', '').trim();
    const quantityValue = getFormValue(formData, 'quantity', '0');
    const sku = getFormValue(formData, 'sku', '').trim();
    const category = getFormValue(formData, 'category', '').trim();
    const subCategory = getFormValue(formData, 'subCategory', '').trim();
    const brand = getFormValue(formData, 'brand', '').trim();
    const specs = getFormValue(formData, 'specs', '').trim();
    const status = getFormValue(formData, 'status', '').trim();

    const price = parseFloat(priceValue);
    if (Number.isNaN(price) || price < 0) {
        throw new Error('يجب إدخال سعر صحيح');
    }

    let installationPrice = null;
    if (installationPriceValue) {
        const parsedInstallationPrice = parseFloat(installationPriceValue);
        if (Number.isNaN(parsedInstallationPrice) || parsedInstallationPrice < 0) {
            throw new Error('يجب إدخال سعر تركيب صحيح (0 أو أكبر)');
        }
        installationPrice = parsedInstallationPrice;
    }

    let priceAfterDiscount = null;
    if (priceAfterDiscountValue) {
        const parsedDiscountPrice = parseFloat(priceAfterDiscountValue);
        if (Number.isNaN(parsedDiscountPrice) || parsedDiscountPrice < 0) {
            throw new Error('يجب إدخال سعر بعد الخصم صحيح (0 أو أكبر)');
        }
        priceAfterDiscount = parsedDiscountPrice;
    }

    const quantity = parseInt(quantityValue, 10);
    if (Number.isNaN(quantity) || quantity < 0) {
        throw new Error('يجب إدخال كمية صحيحة');
    }

    if (!brand) {
        throw new Error('يجب اختيار علامة تجارية');
    }

    const payload = {
        name,
        title,
        description,
        quantity: String(quantity),
        price: String(price),
        category,
        subCategory,
        brand,
        specs,
    };

    if (installationPrice !== null) {
        payload.installationPrice = String(installationPrice);
    }

    if (priceAfterDiscount !== null) {
        payload.priceAfterDiscount = String(priceAfterDiscount);
    }

    if (sku) {
        payload.sku = sku;
    }
    if (status) {
        payload.status = status;
    }

    return payload;
}

function buildProductRequestOptions(payload = {}, imageFiles = []) {
    const dataPayload = { ...payload };
    const formData = new FormData();

    Object.entries(dataPayload).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value)) {
            value.forEach(item => {
                if (item !== undefined && item !== null) {
                    formData.append(`${key}[]`, item);
                }
            });
        } else {
            formData.append(key, value);
        }
    });

    imageFiles.forEach(file => {
        if (file instanceof File) {
            formData.append('images', file);
        }
    });

    for (let [key, value] of formData.entries()) {
    }

    return { body: formData, headers: null };
}

async function createProduct(payload, imageFiles = []) {

    try {
        const formData = new FormData();

        Object.entries(payload || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                formData.append(key, value);
            }
        });

        if (imageFiles && imageFiles.length > 0) {
            imageFiles.forEach((file, index) => {
                formData.append('images', file);
            });
        }

        const response = await authorizedFetch(PRODUCT_ENDPOINT, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            const errorMessage = data.message || `HTTP ${response.status} - ${response.statusText}`;
            throw new Error(errorMessage);
        }

        return data;
    } catch (error) {
        throw error;
    }
}

// دالة تحديث المنتج
async function updateProduct(productId, payload, imageFiles = [], existingImages = []) {

    if (!productId) {
        throw new Error('معرف المنتج غير صالح');
    }

    try {
        const formData = new FormData();

        Object.entries(payload || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                formData.append(key, value);
            }
        });

        // Add new image files
        if (imageFiles && imageFiles.length > 0) {
            imageFiles.forEach((file, index) => {
                if (file instanceof File) {
                    formData.append('images', file);
                }
            });
        }

        // Add existing images that should be kept
        if (existingImages && existingImages.length > 0) {
            // Send existing image URLs to backend
            // The backend should handle keeping these images
            existingImages.forEach((imageUrl, index) => {
                if (imageUrl && typeof imageUrl === 'string') {
                    formData.append(`existingImages[${index}]`, imageUrl);
                }
            });
        }

        const response = await authorizedFetch(`${PRODUCT_ENDPOINT}/${encodeURIComponent(productId)}`, {
            method: 'PATCH',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            const errorMessage = data.message || `HTTP ${response.status} - ${response.statusText}`;
            throw new Error(errorMessage);
        }


        const updatedProduct = data.data || data;

        if (updatedProduct) {
            upsertProductExtras(productId, {
                image: updatedProduct.images?.[0] || updatedProduct.image || '',
                description: updatedProduct.description || '',
                specs: updatedProduct.specs || updatedProduct.details || '',
                images: Array.isArray(updatedProduct.images) ? updatedProduct.images : [],
                brandName: updatedProduct.brand?.name || updatedProduct.brandName || updatedProduct.brand || ''
            });
        }

        return updatedProduct;
    } catch (error) {
        showToast('error', 'تحديث المنتج', error.message || 'حدث خطأ غير متوقع');
        throw error;
    }
}

/**
 * عرض تفاصيل المنتج في نافذة منبثقة
 */
function viewProductDetails(productId) {
    const product = state.products?.find(p => (p._id || p.id) === productId);

    if (!product) {
        showToast('error', 'خطأ', 'لم يتم العثور على المنتج');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'product-details-modal';
    modal.style.opacity = '0';

    const categoryName = product.categoryName || getCategoryLabel(product.categorySlug) || product.category?.name || '-';
    const subcategoryName = product.subcategoryName || product.subcategory?.name || '-';
    const brandName = product.brandName || product.brand?.name || '-';

    const hasStock = product.stock !== undefined && product.stock !== null && product.stock !== '';
    const stockNumber = Number(product.stock);
    const stockIsFinite = Number.isFinite(stockNumber);
    const stockValue = stockIsFinite ? stockNumber : product.stock;
    const stockClass = stockIsFinite ? (stockNumber > 0 ? 'positive' : 'negative') : '';

    const stockMarkup = hasStock
        ? `
                    <div class="product-details-card">
                        <span class="product-details-label">المخزون</span>
                        <span class="product-details-value ${stockClass}">${stockValue}</span>
                    </div>
                `
        : '';

    const installationMarkup = Number.isFinite(product.installationPrice)
        ? `
                    <div class="product-details-card">
                        <span class="product-details-label">سعر التركيب</span>
                        <span class="product-details-value price">${formatCurrency(product.installationPrice)}</span>
                    </div>
                `
        : '';

    const skuMarkup = product.sku
        ? `
                    <div class="product-details-card">
                        <span class="product-details-label">رمز المنتج (SKU)</span>
                        <span class="product-details-value">${product.sku}</span>
                    </div>
                `
        : '';

    const hasDiscountPrice = Number.isFinite(product.priceAfterDiscount);
    const priceCardMarkup = hasDiscountPrice
        ? `
                    <div class="product-details-card">
                        <span class="product-details-label">السعر بعد الخصم</span>
                        <span class="product-details-value price">${formatCurrency(product.priceAfterDiscount)}</span>
                        <small class="product-details-subtext" style="display:block;margin-top:4px;font-size:0.85em;color:var(--text-muted, #a0a0a0);">
                            السعر الأصلي: <span style="text-decoration: line-through; opacity: 0.8;">${formatCurrency(product.price)}</span>
                        </small>
                    </div>
                `
        : `
                    <div class="product-details-card">
                        <span class="product-details-label">السعر</span>
                        <span class="product-details-value price">${formatCurrency(product.price)}</span>
                    </div>
                `;

    const subcategoryMarkup = subcategoryName !== '-'
        ? `
                    <div class="product-details-card product-details-meta-card">
                        <i class="fas fa-tags"></i>
                        <div>
                            <span class="product-details-label">الفئة الفرعية</span>
                            <strong class="product-details-value">${subcategoryName}</strong>
                        </div>
                    </div>
                `
        : '';

    const brandMarkup = brandName !== '-'
        ? `
                    <div class="product-details-card product-details-meta-card">
                        <i class="fas fa-certificate"></i>
                        <div>
                            <span class="product-details-label">الماركة</span>
                            <strong class="product-details-value">${brandName}</strong>
                        </div>
                    </div>
                `
        : '';

    modal.innerHTML = `
                <div class="product-details-dialog">
                    <div class="product-details-header">
                        <h2>تفاصيل المنتج</h2>
                        <button type="button" class="close-btn" aria-label="إغلاق">&times;</button>
                    </div>
                    <div class="product-details-body">
                        ${(() => {
            const galleryImages = Array.isArray(product.images)
                ? product.images.map(resolveImageSource).filter(Boolean)
                : [];
            if (galleryImages.length) {
                return `
                                <div class="product-details-gallery" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;">
                                    ${galleryImages.map((img, index) => `
                                        <div class="product-details-image" style="flex:0 0 auto;">
                                            <img src="${img}" alt="${product.name} - صورة ${index + 1}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                                        </div>
                                    `).join('')}
                                </div>
                            `;
            }
            const fallbackImage = resolveImageSource(product.image);
            return fallbackImage ? `
                                <div class="product-details-gallery" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;">
                                    <div class="product-details-image" style="flex:0 0 auto;">
                                        <img src="${fallbackImage}" alt="${product.name}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                                    </div>
                                </div>
                            ` : '';
        })()}
                        <div class="product-details-info">
                            <h3 class="product-details-title">${product.name}</h3>
                            ${product.description ? `<p class="product-details-description">${product.description}</p>` : ''}
                            ${product.specs ? `<div class="product-details-specs" style="background:rgba(0,0,0,0.04);padding:16px;border-radius:10px;">
                                <strong style="display:block;margin-bottom:8px;color:var(--text-main);">المواصفات</strong>
                                <p style="margin:0;color:var(--text-muted);line-height:1.6;white-space:pre-wrap;">${product.specs}</p>
                            </div>` : ''}
                            <div class="product-details-stats">
                                ${priceCardMarkup}
                                ${stockMarkup}
                                ${installationMarkup}
                                ${skuMarkup}
                            </div>
                            <div class="product-details-meta">
                                <div class="product-details-card product-details-meta-card">
                                    <i class="fas fa-tag"></i>
                                    <div>
                                        <span class="product-details-label">الفئة</span>
                                        <strong class="product-details-value">${categoryName}</strong>
                                    </div>
                                </div>
                                ${subcategoryMarkup}
                                ${brandMarkup}
                            </div>
                        </div>
                    </div>
                </div>
            `;

    document.body.appendChild(modal);

    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);

    const closeBtn = modal.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 300);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 300);
        }
    });
}

async function deleteProductImage(productId, publicId) {
    if (!productId || !publicId) {
        throw new Error('معرف المنتج أو معرف الصورة غير صالح');
    }

    try {
        const response = handleUnauthorized(await authorizedFetch(`${ADMIN_API_BASE_URL}/products/delete-image/${encodeURIComponent(productId)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                public_id: publicId
            })
        }));

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        return true;
    } catch (error) {
        console.error('Error deleting product image:', error);
        throw error;
    }
}

async function deleteProduct(productId, { productName } = {}) {

    if (!productId) return;

    const confirmationMessage = productName
        ? `هل أنت متأكد من حذف المنتج "${productName}"؟ لا يمكن التراجع عن هذا الإجراء.`
        : 'هل أنت متأكد من حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء.';

    confirmPopup('تأكيد حذف المنتج', confirmationMessage, async () => {
        try {
            const response = handleUnauthorized(await authorizedFetch(`${PRODUCT_ENDPOINT}/${encodeURIComponent(productId)}`, {
                method: 'DELETE'
            }));


            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                const message = errorBody?.message || `HTTP ${response.status}`;
                throw new Error(message);
            }

            await fetchProducts();
            showToast('success', 'حذف المنتج', 'تم حذف المنتج بنجاح');
        } catch (error) {
            showToast('error', 'حذف المنتج', error.message || 'حدث خطأ غير متوقع');
        }
    }, null, 'حذف', 'إلغاء');
}

async function createCategory(payload, extras = {}, imageFile = null) {

    try {
        const { body, headers } = buildCategoryRequestOptions(payload, {
            description: extras.description
        }, imageFile);


        const response = handleUnauthorized(await authorizedFetch(CATEGORY_ENDPOINT, {
            method: 'POST',
            headers: headers || undefined,
            body
        }));


        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const responseData = await response.json();

        const newCategoryId = responseData?.data?._id || responseData?._id;

        await fetchCategories();

        if (newCategoryId) {
            const mergedExtras = {
                image: extras.image || '',
                description: extras.description || ''
            };
            upsertCategoryExtras(newCategoryId, mergedExtras);
        }

        renderCategories();
        showToast('success', 'إضافة الفئة', 'تمت إضافة الفئة بنجاح');
        closeModal('categoryModal');
    } catch (error) {
        showToast('error', 'إضافة الفئة', error.message || 'حدث خطأ غير متوقع');
    }
}

async function updateCategory(categoryId, payload, extras = {}, imageFile = null) {

    if (!categoryId) return;

    try {
        const cleanPayload = {};
        Object.keys(payload || {}).forEach(key => {
            const value = payload[key];
            if (value !== undefined && value !== null && value !== '') {
                cleanPayload[key] = value;
            }
        });

        if (!imageFile) {
            const existingImage = cleanPayload.image
                ?? extras.image
                ?? state.categoryExtras[categoryId]?.image
                ?? state.categories.find(category => category.id === categoryId)?.image
                ?? '';

            if (existingImage) {
                cleanPayload.image = existingImage;
            } else {
                delete cleanPayload.image;
            }
        }


        const { body, headers } = buildCategoryRequestOptions(cleanPayload, {
            description: extras.description
        }, imageFile);


        const response = handleUnauthorized(await authorizedFetch(`${CATEGORY_ENDPOINT}/${encodeURIComponent(categoryId)}`, {
            method: 'PATCH',
            headers: headers || undefined,
            body
        }));


        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const responseData = await response.json();

        const document = responseData?.data?.category
            ?? responseData?.data
            ?? responseData;

        if (document && typeof document === 'object') {
            const normalized = normalizeCategory(document, 0);
            if (normalized) {
                const merged = {
                    ...normalized,
                    ...cleanPayload,
                    description: extras.description ?? cleanPayload.description ?? normalized.description ?? '',
                    image: extras.image || cleanPayload.image || normalized.image || ''
                };


                const categoryIndex = state.categories.findIndex(category => category.id === categoryId);
                if (categoryIndex !== -1) {
                    state.categories[categoryIndex] = merged;
                } else {
                    state.categories.push(merged);
                }
            }
        }

        await fetchCategories();

        const updatedCategory = state.categories.find(category => category.id === categoryId);
        const mergedExtras = {
            image: updatedCategory?.image || extras.image || '',
            description: extras.description || updatedCategory?.description || ''
        };
        upsertCategoryExtras(categoryId, mergedExtras);

        renderCategories();
        showToast('success', 'تحديث الفئة', 'تم تحديث الفئة بنجاح');
        closeModal('categoryModal');
    } catch (error) {
        showToast('error', 'تحديث الفئة', error.message || 'حدث خطأ غير متوقع');
    }
}

async function deleteCategory(categoryId) {

    if (!categoryId) return;

    try {
        const response = handleUnauthorized(await authorizedFetch(`${CATEGORY_ENDPOINT}/${encodeURIComponent(categoryId)}`, {
            method: 'DELETE'
        }));


        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }


        await fetchCategories();
        showToast('success', 'حذف الفئة', 'تم حذف الفئة بنجاح');
    } catch (error) {
        showToast('error', 'حذف الفئة', error.message || 'حدث خطأ غير متوقع');
    }
}

function buildSubcategoryRequestOptions(payload = {}, imageFile = null) {
    const dataPayload = { ...payload };

    if (dataPayload.categoryId && !dataPayload.category) {
        dataPayload.category = dataPayload.categoryId;
    }

    if (imageFile instanceof File) {
        delete dataPayload.image;
        const formData = new FormData();
        Object.entries(dataPayload).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                formData.append(key, value);
            }
        });
        formData.append('image', imageFile);

        for (let [key, value] of formData.entries()) {
        }

        return { body: formData, headers: null };
    }

    return {
        body: JSON.stringify(dataPayload),
        headers: { 'Content-Type': 'application/json' }
    };
}

function buildSubcategoryFormData(formData, formElement = null) {
    if (!(formData instanceof FormData)) {
        return {
            categoryId: '',
            originalCategoryId: '',
            subcategoryId: '',
            payload: {},
            imageFile: null
        };
    }

    const form = formElement || document.getElementById('subcategoryForm');
    const categoryId = getFormValue(formData, 'categoryId');
    const originalCategoryId = getFormValue(formData, 'originalCategoryId');
    const subcategoryId = getFormValue(formData, 'id');
    const name = getFormValue(formData, 'name');
    const slug = getFormValue(formData, 'slug') || slugify(name);
    const descriptionField = form?.querySelector('[name="description"]');
    const maxLength = getDescriptionMaxLength(descriptionField);
    const description = truncateText(getFormValue(formData, 'description'), maxLength);
    if (descriptionField && descriptionField.value !== description) {
        descriptionField.value = description;
        updateDescriptionCounter(descriptionField);
    }
    const status = getFormValue(formData, 'status', 'active');

    const payload = {
        name,
        slug,
        description,
        status
    };

    Object.keys(payload).forEach(key => {
        if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
            delete payload[key];
        }
    });

    const imageFile = formData.get('image');

    return {
        categoryId,
        originalCategoryId,
        subcategoryId,
        payload,
        imageFile: imageFile instanceof File && imageFile.name ? imageFile : null
    };
}

async function fetchSubcategories(categoryId, options = {}) {
    const { force = false, skipRender = false } = options || {};

    if (!categoryId || categoryId === 'all') {
        return [];
    }

    if (!force && state.subcategoriesLoading[categoryId]) {
        return getSubcategories(categoryId);
    }

    setSubcategoryLoading(categoryId, true);
    setSubcategoryError(categoryId, null);

    try {
        const response = handleUnauthorized(await authorizedFetch(SUBCATEGORY_ENDPOINT(categoryId)));

        if (!response.ok) {
            if (response.status === 404) {
                state.subcategories[categoryId] = [];
                setSubcategoryError(categoryId, null);
                return [];
            }

            const errorBody = await response.json().catch(() => ({}));
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const payload = await response.json();

        const documents = Array.isArray(payload?.data?.documents)
            ? payload.data.documents
            : Array.isArray(payload?.data?.subcategories)
                ? payload.data.subcategories
                : Array.isArray(payload?.data)
                    ? payload.data
                    : Array.isArray(payload)
                        ? payload
                        : [];

        const normalized = documents
            .map((doc, index) => normalizeSubcategory(doc, index, categoryId))
            .filter(Boolean)
            .map(subcategory => {
                const extras = getSubcategoryExtras(categoryId, subcategory.id);
                return {
                    ...subcategory,
                    image: subcategory.image || extras.image,
                    description: subcategory.description || extras.description
                };
            });

        state.subcategories[categoryId] = normalized;
        return normalized;
    } catch (error) {
        console.error('❌ Failed to fetch subcategories:', error);
        const message = error?.message || 'تعذر تحميل الفئات الفرعية. يرجى المحاولة مرة أخرى.';
        setSubcategoryError(categoryId, message);
        return [];
    } finally {
        setSubcategoryLoading(categoryId, false);
        if (!skipRender) {
            renderSubcategories();
        }
    }
}

async function createSubcategory(categoryId, payload = {}, imageFile = null) {
    if (!categoryId) {
        throw new Error('رقم الفئة الرئيسية مفقود.');
    }


    try {
        const { body, headers } = buildSubcategoryRequestOptions(payload, imageFile);

        const response = handleUnauthorized(await authorizedFetch(SUBCATEGORY_ENDPOINT(categoryId), {
            method: 'POST',
            headers: headers || undefined,
            body
        }));


        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error('❌ Create subcategory error:', errorBody);
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const responseData = await response.json();

        const document = responseData?.data?.subcategory
            ?? responseData?.data
            ?? responseData;

        const normalized = normalizeSubcategory(document, 0, categoryId);
        if (normalized) {
            const merged = {
                ...normalized,
                image: normalized.image || payload.image || '',
                description: normalized.description || payload.description || ''
            };
            upsertSubcategory(categoryId, merged);
            upsertSubcategoryExtras(categoryId, merged.id, {
                image: merged.image,
                description: merged.description
            });
        }

        await fetchSubcategories(categoryId, { force: true });
        showToast('success', 'إضافة الفئة الفرعية', 'تمت إضافة الفئة الفرعية بنجاح');
        return normalized;
    } catch (error) {
        console.error('❌ Failed to create subcategory:', error);
        showToast('error', 'إضافة الفئة الفرعية', error.message || 'حدث خطأ غير متوقع');
        throw error;
    }
}

async function updateSubcategory(categoryId, subcategoryId, payload = {}, imageFile = null, options = {}) {
    if (!categoryId || !subcategoryId) {
        throw new Error('بيانات الفئة الفرعية غير مكتملة.');
    }

    const previousCategoryId = options.previousCategoryId;
    const targetCategoryId = options.targetCategoryId || payload.categoryId || categoryId;


    try {
        const cleanPayload = {};
        Object.keys(payload || {}).forEach(key => {
            const value = payload[key];
            if (value !== undefined && value !== null && value !== '') {
                cleanPayload[key] = value;
            }
        });

        if (!imageFile && 'image' in cleanPayload) {
            delete cleanPayload.image;
        }


        const { body, headers } = buildSubcategoryRequestOptions(cleanPayload, imageFile);

        const response = handleUnauthorized(await authorizedFetch(SUBCATEGORY_DETAIL_ENDPOINT(categoryId, subcategoryId), {
            method: 'PATCH',
            headers: headers || undefined,
            body
        }));


        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error('❌ Update subcategory error:', errorBody);
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const responseData = await response.json();

        const document = responseData?.data?.subcategory
            ?? responseData?.data
            ?? responseData;

        const normalizedCategoryId = document?.categoryId || targetCategoryId;

        const normalized = normalizeSubcategory(document, 0, normalizedCategoryId) || {
            id: subcategoryId,
            ...cleanPayload,
            categoryId: normalizedCategoryId
        };

        const merged = {
            ...normalized,
            ...cleanPayload,
            categoryId: targetCategoryId,
            description: cleanPayload.description ?? normalized.description ?? '',
            image: normalized.image || cleanPayload.image || payload?.image || '',
            status: cleanPayload.status ?? normalized.status
        };


        upsertSubcategory(targetCategoryId, merged);
        upsertSubcategoryExtras(targetCategoryId, merged.id, {
            image: merged.image,
            description: merged.description
        });

        if (previousCategoryId && previousCategoryId !== targetCategoryId) {
            removeSubcategory(previousCategoryId, subcategoryId);
            await fetchSubcategories(previousCategoryId, { force: true, skipRender: true });
        }

        await fetchSubcategories(targetCategoryId, { force: true });
        showToast('success', 'تحديث الفئة الفرعية', 'تم تحديث الفئة الفرعية بنجاح');
        return merged;
    } catch (error) {
        console.error('❌ Failed to update subcategory:', error);
        showToast('error', 'تحديث الفئة الفرعية', error.message || 'حدث خطأ غير متوقع');
        throw error;
    }
}

async function deleteSubcategory(categoryId, subcategoryId) {
    if (!categoryId || !subcategoryId) {
        throw new Error('بيانات الفئة الفرعية غير مكتملة.');
    }


    try {
        const response = handleUnauthorized(await authorizedFetch(SUBCATEGORY_DETAIL_ENDPOINT(categoryId, subcategoryId), {
            method: 'DELETE'
        }));


        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error('❌ Delete subcategory error:', errorBody);
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        removeSubcategory(categoryId, subcategoryId);
        renderSubcategories();
        showToast('success', 'حذف الفئة الفرعية', 'تم حذف الفئة الفرعية بنجاح');
        return true;
    } catch (error) {
        console.error('❌ Failed to delete subcategory:', error);
        showToast('error', 'حذف الفئة الفرعية', error.message || 'حدث خطأ غير متوقع');
        throw error;
    }
}

function buildCategoryRequestOptions(payload, meta = {}, file = null, options = {}) {
    const dataPayload = { ...payload };

    if (meta.description) {
        dataPayload.description = meta.description;
    }

    const forceFormData = options.forceFormData === true;

    if (file instanceof File || forceFormData) {
        const formData = new FormData();

        // لا نرسل قيمة الصورة كسلسلة إذا لم يكن هناك ملف حقيقي
        if (file instanceof File) {
            delete dataPayload.image;
        }

        Object.entries(dataPayload).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                formData.append(key, value);
            }
        });

        if (file instanceof File) {
            formData.append('image', file);
        }

        for (let [key, value] of formData.entries()) {
        }

        return { body: formData, headers: null };
    }


    return {
        body: JSON.stringify(dataPayload),
        headers: { 'Content-Type': 'application/json' }
    };
}

// ===== Image Handling =====
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('تعذر قراءة الملف'));
        reader.readAsDataURL(file);
    });
}

function updateCategoryImagePreview(image) {
    const preview = document.getElementById('categoryImagePreview');
    if (!preview) return;

    if (image) {
        preview.innerHTML = `<img src="${image}" alt="صورة الفئة">`;
        preview.classList.add('has-image');
    } else {
        preview.innerHTML = '<span class="image-preview__placeholder">لم يتم اختيار صورة</span>';
        preview.classList.remove('has-image');
    }
}

function updateSubcategoryImagePreview(image) {
    const preview = document.getElementById('subcategoryImagePreview');
    if (!preview) return;

    if (image) {
        preview.innerHTML = `<img src="${image}" alt="صورة الفئة الفرعية">`;
        preview.classList.add('has-image');
    } else {
        preview.innerHTML = '<span class="image-preview__placeholder">لم يتم اختيار صورة</span>';
        preview.classList.remove('has-image');
    }
}

function updateBrandImagePreview(image) {
    const preview = document.getElementById('brandImagePreview');
    if (!preview) return;

    if (!image) {
        preview.innerHTML = '<span class="image-preview__placeholder">لم يتم اختيار صورة</span>';
        return;
    }

    preview.innerHTML = `<img src="${image}" alt="Brand Preview">`;
}

function updateProductImagePreview(images = []) {
    const preview = document.getElementById('productImagePreview');
    if (!preview) return;

    // Ensure images is an array
    const imageArray = Array.isArray(images) ? images : (images ? [images] : []);
    const resolvedImages = imageArray.map(resolveImageSource);
    const hasImages = resolvedImages.some(Boolean);

    if (!hasImages) {
        preview.innerHTML = '<span class="image-preview__placeholder">لم يتم اختيار صورة</span>';
        preview.classList.remove('has-image');
        return;
    }

    preview.classList.add('has-image');
    preview.innerHTML = `
        <div class="image-preview-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px;">
            ${resolvedImages.map((img, idx) => {
        if (!img) return '';
        return `
                <div class="image-preview-item" data-image-index="${idx}" style="position: relative; overflow: hidden; border-radius: 8px; aspect-ratio: 1; background: #f5f5f5;">
                    <img src="${img}" alt="صورة المنتج ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;">
                    <button type="button" class="image-remove-btn" data-image-index="${idx}" style="position: absolute; top: 4px; right: 4px; width: 28px; height: 28px; padding: 0; background: rgba(231, 76, 60, 0.9); color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: background 0.2s;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                `;
    }).join('')}
        </div>
    `;

    // Attach remove button handlers
    preview.querySelectorAll('.image-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeProductImage(parseInt(btn.dataset.imageIndex));
        });
        // Hover effect
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'rgba(192, 57, 43, 1)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'rgba(231, 76, 60, 0.9)';
        });
    });
}

async function handleCategoryImageChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;

    const file = input.files?.[0];
    if (!file) {
        input.dataset.previewImage = '';
        updateCategoryImagePreview(input.dataset.originalImage || '');
        return;
    }


    try {
        const dataUrl = await readFileAsDataUrl(file);
        input.dataset.previewImage = dataUrl;
        updateCategoryImagePreview(dataUrl);
    } catch (error) {
        console.error('❌ Failed to preview category image:', error);
        showToast('error', 'صورة الفئة', 'تعذر معاينة ملف الصورة المحدد');
    }
}

async function handleSubcategoryImageChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;

    const file = input.files?.[0];
    if (!file) {
        input.dataset.previewImage = '';
        updateSubcategoryImagePreview(input.dataset.originalImage || '');
        return;
    }


    try {
        const dataUrl = await readFileAsDataUrl(file);
        input.dataset.previewImage = dataUrl;
        updateSubcategoryImagePreview(dataUrl);
    } catch (error) {
        console.error('❌ Failed to preview subcategory image:', error);
        showToast('error', 'صورة الفئة الفرعية', 'تعذر معاينة ملف الصورة المحدد');
    }
}

async function handleBrandImageChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;

    const file = input.files?.[0];
    if (!file) {
        updateBrandImagePreview('');
        return;
    }


    try {
        const dataUrl = await readFileAsDataUrl(file);
        updateBrandImagePreview(dataUrl);
    } catch (error) {
        console.error('❌ Failed to preview brand image:', error);
        showToast('error', 'صورة العلامة التجارية', 'تعذر معاينة ملف الصورة المحدد');
    }
}

async function handleProductImageChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;

    const newFiles = input.files ? Array.from(input.files) : [];
    if (!newFiles.length) return;

    const form = input.closest('form');
    if (!form) return;

    try {
        // Initialize product image storage in form if needed
        if (!form.__productImageState) {
            form.__productImageState = {
                newImages: [], // Store actual File objects here
                newImageDataUrls: [] // Store data URLs for preview
            };
        }

        // Get existing images
        let existingImages = [];
        let existingImagesJson = form.dataset.existingProductImages || '[]';
        try {
            existingImages = JSON.parse(existingImagesJson);
        } catch (e) {
            existingImages = [];
        }

        // Convert new files to data URLs and store File objects
        for (const file of newFiles) {
            try {
                const dataUrl = await readFileAsDataUrl(file);
                form.__productImageState.newImages.push(file);
                form.__productImageState.newImageDataUrls.push(dataUrl);
            } catch (error) {
                console.error('Failed to read file:', error);
                showToast('error', 'صورة المنتج', `تعذر معالجة الملف: ${file.name}`);
            }
        }

        // Clear the file input to allow re-selection
        input.value = '';

        // Update preview with all images (existing + new)
        const allImages = [
            ...existingImages,
            ...form.__productImageState.newImageDataUrls
        ];
        updateProductImagePreview(allImages);

    } catch (error) {
        console.error('Error processing product images:', error);
        showToast('error', 'صورة المنتج', 'تعذر معالجة الصور المحددة');
        input.value = '';
    }
}

async function removeProductImage(imageIndex) {
    const form = document.getElementById('addProductModal')?.querySelector('form');
    if (!form) return;

    // Initialize state if needed
    if (!form.__productImageState) {
        form.__productImageState = {
            newImages: [],
            newImageDataUrls: []
        };
    }

    let existingImages = [];
    let removedExistingImages = [];

    try {
        existingImages = JSON.parse(form.dataset.existingProductImages || '[]');
        removedExistingImages = JSON.parse(form.dataset.removedProductImages || '[]');
    } catch (e) {
        existingImages = [];
        removedExistingImages = [];
    }

    const totalExistingCount = existingImages.length;

    if (imageIndex < totalExistingCount) {
        // Removing an existing image from database
        const removedImage = existingImages[imageIndex];

        // Get product ID for API call
        const productId = form.querySelector('[name="id"]')?.value;

        if (productId) {
            try {
                // Extract public_id and make immediate API call
                let publicId = '';
                if (typeof removedImage === 'string') {
                    const matches = removedImage.match(/\/([^\/]+)\.[^.]+$/);
                    publicId = matches ? `action-sports/Product/${matches[1]}` : removedImage;
                } else if (removedImage.public_id) {
                    publicId = removedImage.public_id;
                } else if (removedImage.url) {
                    const matches = removedImage.url.match(/\/([^\/]+)\.[^.]+$/);
                    publicId = matches ? `action-sports/Product/${matches[1]}` : removedImage.url;
                }

                if (publicId) {
                    await deleteProductImage(productId, publicId);
                    showToast('success', 'حذف الصورة', 'تم حذف الصورة بنجاح');
                }
            } catch (error) {
                showToast('error', 'حذف الصورة', error.message || 'فشل حذف الصورة');
                return; // Don't remove from UI if API call fails
            }
        }

        removedExistingImages.push(removedImage);
        existingImages.splice(imageIndex, 1);
        form.dataset.removedProductImages = JSON.stringify(removedExistingImages);
        form.dataset.existingProductImages = JSON.stringify(existingImages);
    } else {
        // Removing a newly selected image
        const newImageIndex = imageIndex - totalExistingCount;
        if (newImageIndex >= 0 && newImageIndex < form.__productImageState.newImages.length) {
            form.__productImageState.newImages.splice(newImageIndex, 1);
            form.__productImageState.newImageDataUrls.splice(newImageIndex, 1);
        }
    }

    // Update preview
    const allImages = [
        ...existingImages,
        ...form.__productImageState.newImageDataUrls
    ];
    updateProductImagePreview(allImages);
}

// ===== Form Handlers =====
async function handleCategoryFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form || form.dataset.entity !== 'category') return;


    const formData = new FormData(form);
    const mode = form.dataset.mode || 'create';
    const id = formData.get('id');

    const name = getFormValue(formData, 'name');
    const slug = getFormValue(formData, 'slug') || slugify(name);
    const description = getFormValue(formData, 'description');
    const descriptionField = form.querySelector('[name="description"]');
    const descriptionMaxLength = getDescriptionMaxLength(descriptionField);
    const normalizedDescription = truncateText(description, descriptionMaxLength);
    if (descriptionField && descriptionField.value !== normalizedDescription) {
        descriptionField.value = normalizedDescription;
        updateDescriptionCounter(descriptionField);
    }
    const imageInput = form.querySelector('#categoryImage');
    const imageFile = imageInput?.files?.[0];



    const existingCategory = id ? getCategoryById(id) : null;
    const existingExtras = existingCategory ? state.categoryExtras[existingCategory.id] : null;
    const existingImage = existingExtras?.image || existingCategory?.image || '';

    const originalValues = (() => {
        try {
            return JSON.parse(form.dataset.originalCategory || '{}');
        } catch (error) {
            console.warn('⚠️ Failed to parse original category dataset', error);
            return {};
        }
    })();

    let image = imageInput?.dataset.previewImage || existingImage;

    if (imageFile) {
        try {
            image = await readFileAsDataUrl(imageFile);
            if (imageInput) {
                imageInput.dataset.previewImage = image;
            }

        } catch (error) {
            console.error('❌ Failed to read category image:', error);
            showToast('error', 'صورة الفئة', 'تعذر قراءة ملف الصورة المحدد');
            return;
        }
    }

    if (!name) {
        showToast('error', 'حفظ الفئة', 'يرجى إدخال اسم الفئة');
        return;
    }

    if (!image && mode === 'create') {
        showToast('error', 'حفظ الفئة', 'يرجى اختيار صورة للفئة');
        return;
    }

    const safeDescription = normalizedDescription || '';
    const payload = {};
    const extras = {};

    if (mode === 'edit' && id) {
        const originalName = originalValues.name ?? '';
        const originalSlug = originalValues.slug ?? '';
        const originalDescription = originalValues.description ?? '';

        if (name !== originalName) {
            payload.name = name;
        }

        if (slug && slug !== originalSlug) {
            payload.slug = slug;
        }

        if (safeDescription !== originalDescription) {
            extras.description = safeDescription;
        }

        if (imageFile) {
            extras.image = image || '';
        }

        const hasPayloadChanges = Object.keys(payload).length > 0;
        const hasExtrasChanges = Object.keys(extras).length > 0;

        if (!hasPayloadChanges && !hasExtrasChanges) {
            showToast('info', 'حفظ الفئة', 'لم يتم تعديل أي بيانات لحفظها.');
            return;
        }

        let effectiveImageFile = imageFile || null;
        await updateCategory(id, payload, extras, imageFile);
    } else {
        payload.name = name;
        payload.slug = slug;
        if (image) {
            payload.image = image;
        }

        extras.image = image || '';
        extras.description = safeDescription;

        await createCategory(payload, extras, imageFile);
    }
}

async function handleBrandFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form || form.dataset.entity !== 'brand') return;



    const formData = new FormData(form);
    const mode = form.dataset.mode || 'create';
    const id = formData.get('id');
    const name = getFormValue(formData, 'name');
    const description = getFormValue(formData, 'description');
    const imageInput = form.querySelector('#brandImage');
    const imageFile = imageInput?.files?.[0];

    if (!name) {
        showToast('error', 'حفظ العلامة التجارية', 'يرجى إدخال اسم العلامة التجارية');
        return;
    }

    if (!description) {
        showToast('error', 'حفظ العلامة التجارية', 'يرجى إدخال وصف العلامة التجارية');
        return;
    }

    if (!imageFile && mode === 'create') {
        showToast('error', 'حفظ العلامة التجارية', 'يرجى اختيار صورة للعلامة التجارية');
        return;
    }

    try {
        if (mode === 'edit' && id) {
            await updateBrand(id, { name, description }, imageFile);
            showToast('success', 'تحديث العلامة التجارية', 'تم تحديث العلامة التجارية بنجاح');
        } else {
            await createBrand({ name, description }, imageFile);
            showToast('success', 'إضافة العلامة التجارية', 'تمت إضافة العلامة التجارية بنجاح');
        }

        closeModal('brandModal');
        form.reset();
        await fetchBrands();
        renderBrands();
    } catch (error) {
        console.error('❌ Brand form error:', error);
        showToast('error', 'خطأ', error.message || 'حدث خطأ أثناء حفظ العلامة التجارية');
    }
}

function prepareBrandCreateForm() {
    const form = document.getElementById('brandForm');
    if (!form) return;

    form.dataset.mode = 'create';
    setFieldValue(form, 'id', '');
    setFieldValue(form, 'name', '');
    setFieldValue(form, 'description', '');

    const imageInput = form.querySelector('#brandImage');
    if (imageInput) {
        imageInput.required = true;
        imageInput.value = '';
        delete imageInput.dataset.originalImage;
    }

    const imagePreview = document.getElementById('brandImagePreview');
    if (imagePreview) {
        imagePreview.innerHTML = '<span class="image-preview__placeholder">لم يتم اختيار صورة</span>';
    }
}

function handleEditBrand(brandId) {
    const brand = state.brands.find(b => (b._id === brandId || b.id === brandId));
    if (!brand) {
        showToast('error', 'تعديل العلامة التجارية', 'لم يتم العثور على العلامة التجارية');
        return;
    }

    openModal('brandModal', 'edit');

    const form = document.getElementById('brandForm');
    if (!form) return;

    form.dataset.mode = 'edit';
    setFieldValue(form, 'id', brand._id || brand.id || '');
    setFieldValue(form, 'name', brand.name || '');
    setFieldValue(form, 'description', truncateText(brand.description || '', getDescriptionMaxLength(form.querySelector('[name="description"]'))));
    const brandDescriptionField = form.querySelector('[name="description"]');
    if (brandDescriptionField) {
        updateDescriptionCounter(brandDescriptionField);
    }

    const imageInput = form.querySelector('#brandImage');
    if (imageInput) {
        imageInput.required = false;
        imageInput.value = '';
        const currentImage = brand.image?.secure_url || brand.image?.url || brand.image || '';
        imageInput.dataset.originalImage = currentImage;
    }

    const imagePreview = document.getElementById('brandImagePreview');
    if (imagePreview) {
        const imageUrl = brand.image?.secure_url || brand.image?.url || brand.image || '';
        if (imageUrl) {
            imagePreview.innerHTML = `<img src="${imageUrl}" alt="${escapeHtml(brand.name || 'علامة تجارية')}">`;
        } else {
            imagePreview.innerHTML = '<span class="image-preview__placeholder">لم يتم اختيار صورة</span>';
        }
    }
}

async function handleDeleteBrand(brandId) {
    confirmPopup('تأكيد حذف العلامة التجارية', 'هل أنت متأكد من حذف هذه العلامة التجارية؟', async () => {
        try {
            await deleteBrand(brandId);
            showToast('success', 'حذف العلامة التجارية', 'تم حذف العلامة التجارية بنجاح');
            await fetchBrands();
            renderBrands();
        } catch (error) {
            console.error('❌ Delete brand error:', error);
            showToast('error', 'خطأ', error.message || 'حدث خطأ أثناء حذف العلامة التجارية');
        }
    }, null, 'حذف', 'إلغاء');
}

async function handleSubcategoryFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form || form.dataset.entity !== 'subcategory') return;



    const formData = new FormData(form);
    const mode = form.dataset.mode || 'create';
    const {
        categoryId,
        originalCategoryId,
        subcategoryId,
        payload,
        imageFile
    } = buildSubcategoryFormData(formData, form);

    if (!payload.name) {
        showToast('error', 'حفظ الفئة الفرعية', 'يرجى إدخال اسم الفئة الفرعية');
        return;
    }

    if (!categoryId) {
        showToast('error', 'حفظ الفئة الفرعية', 'يرجى اختيار الفئة الرئيسية');
        return;
    }

    const statusField = form.elements['status'];
    if (statusField && statusField.value) {
        payload.status = statusField.value;
    }

    const imageInput = form.querySelector('#subcategoryImage');
    let previewImage = imageInput?.dataset.previewImage || imageInput?.dataset.originalImage || '';

    if (imageFile && !previewImage) {
        try {
            previewImage = await readFileAsDataUrl(imageFile);
            if (imageInput) {
                imageInput.dataset.previewImage = previewImage;
            }
        } catch (error) {
            console.error('❌ Failed to read subcategory image:', error);
            showToast('error', 'صورة الفئة الفرعية', 'تعذر قراءة ملف الصورة المحدد');
            return;
        }
    }

    const originalSnapshot = (() => {
        if (!form.dataset.originalSubcategory) return null;
        try {
            return JSON.parse(form.dataset.originalSubcategory) || null;
        } catch (error) {
            console.warn('⚠️ Failed to parse original subcategory snapshot', error);
            return null;
        }
    })();

    try {
        if (mode === 'edit' && subcategoryId) {
            const normalizeValue = (value) => {
                if (value === null || value === undefined) return '';
                if (typeof value === 'string') return value.trim();
                return String(value).trim();
            };

            const diffPayload = {};

            if (originalSnapshot) {
                Object.entries(payload).forEach(([key, value]) => {
                    const newValueNormalized = normalizeValue(value);
                    const oldValueNormalized = Object.prototype.hasOwnProperty.call(originalSnapshot, key)
                        ? normalizeValue(originalSnapshot[key])
                        : null;

                    if (oldValueNormalized === null) {
                        if (value !== undefined && value !== null && newValueNormalized !== '') {
                            diffPayload[key] = value;
                        }
                    } else if (newValueNormalized !== oldValueNormalized) {
                        diffPayload[key] = value;
                    }
                });
            } else {
                Object.assign(diffPayload, payload);
            }

            const categoryChanged = Boolean(originalCategoryId && originalCategoryId !== categoryId);
            if (categoryChanged) {
                diffPayload.categoryId = categoryId;
            }

            const endpointCategoryId = categoryChanged && originalCategoryId
                ? originalCategoryId
                : categoryId;

            const hasPayloadChanges = Object.keys(diffPayload).length > 0;
            const hasImageChange = !!imageFile;

            if (!hasPayloadChanges && !hasImageChange) {
                showToast('info', 'تحديث الفئة الفرعية', 'لم يتم تعديل أي بيانات لحفظها.');
                return;
            }

            await updateSubcategory(
                endpointCategoryId,
                subcategoryId,
                diffPayload,
                imageFile,
                {
                    previousCategoryId: categoryChanged ? originalCategoryId : null,
                    targetCategoryId: categoryId
                }
            );
        } else {
            await createSubcategory(categoryId, payload, imageFile);
        }

        state.filters.subcategoryCategory = categoryId;
        hydrateSubcategoryCategoryOptions();
        renderSubcategories(categoryId);

        form.reset();
        if (imageInput) {
            imageInput.dataset.previewImage = '';
            imageInput.dataset.originalImage = '';
        }
        updateSubcategoryImagePreview('');
        closeModal('subcategoryModal');
    } catch (error) {
        console.error('❌ Failed to submit subcategory form:', error);
    }
}

// ===== Modal Population =====
async function populateProductModal(productId = null) {
    const modal = document.getElementById('addProductModal');
    const form = modal?.querySelector('form');
    const title = modal?.querySelector('[data-modal-title]') || modal?.querySelector('.modal-title');



    if (!modal || !form) {
        console.error('❌ Missing required elements:', { modal, form, title });
        return;
    }

    // إعادة تعيين النموذج
    form.reset();

    // تحميل العلامات التجارية
    try {
        await hydrateBrandOptions();
    } catch (error) {
        console.error('❌ Failed to load brands:', error);
    }

    // إضافة مستمع حدث لتحديث الفئات الفرعية عند تغيير الفئة الرئيسية
    const categorySelect = form.querySelector('#productCategory');
    if (categorySelect) {
        // إزالة أي مستمعات سابقة لتجنب التكرار
        const newCategorySelect = categorySelect.cloneNode(true);
        categorySelect.parentNode.replaceChild(newCategorySelect, categorySelect);

        newCategorySelect.addEventListener('change', (e) => {
            const categoryId = e.target.value;

            populateSubcategoryOptions(categoryId);

            // تفعيل/تعطيل حقل الفئة الفرعية بناءً على وجود فئة محددة
            const subcategorySelect = form.querySelector('#productSubcategory');
            if (subcategorySelect) {
                subcategorySelect.disabled = !categoryId;
                if (!categoryId) {
                    subcategorySelect.innerHTML = '<option value="">اختر الفئة الفرعية</option>';
                }
            }
        });
    }

    form.dataset.mode = productId ? 'edit' : 'create';

    if (productId) {
        // وضع التعديل: تعبئة البيانات الحالية للمنتج
        const baseProduct = state.products.find(p => p.id === productId);
        const product = mergeProductWithExtras(baseProduct);
        if (!product) {
            console.error('المنتج غير موجود:', productId);
            return;
        }

        // تعبئة حقول النموذج
        title.textContent = 'تعديل المنتج';
        form.dataset.entityId = product.id;
        setFieldValue(form, 'id', product.id);

        // تعبئة الحقول الأساسية
        setFieldValue(form, 'name', product.name);
        const descriptionField = form.querySelector('[name="description"]');
        setFieldValue(form, 'description', truncateText(product.description, getDescriptionMaxLength(descriptionField)));
        if (descriptionField) {
            updateDescriptionCounter(descriptionField);
        }
        const specsField = form.querySelector('[name="specs"]');
        setFieldValue(form, 'specs', truncateText(product.specs || '', getDescriptionMaxLength(specsField)));
        if (specsField) {
            updateDescriptionCounter(specsField);
        }
        setFieldValue(form, 'price', product.price);
        setFieldValue(form, 'installationPrice', product.installationPrice ?? '');
        setFieldValue(form, 'priceAfterDiscount', product.raw?.priceAfterDiscount ?? '');
        setFieldValue(form, 'quantity', product.stock);
        setFieldValue(form, 'sku', product.sku || '');
        setFieldValue(form, 'status', product.status || 'draft');

        // تعبئة الفئة الرئيسية والفرعية
        if (product.categoryId) {
            setFieldValue(form, 'category', product.categoryId);
            // تحديث قائمة الفئات الفرعية
            populateSubcategoryOptions(product.categoryId);

            // تأخير تعيين الفئة الفرعية لضمان تحميل القائمة
            setTimeout(() => {
                if (product.subCategoryId) {
                    setFieldValue(form, 'subCategory', product.subCategoryId);
                }
            }, 100);
        }

        // تعبئة العلامة التجارية
        if (product.brandId) {
            setFieldValue(form, 'brand', product.brandId);
        } else if (product.brandName) {
            // إذا كانت هناك علامة تجارية نصية وليست معرف، نضيفها كخيار جديد
            const brandSelect = form.querySelector('#productBrand');
            if (brandSelect) {
                const option = document.createElement('option');
                option.value = product.brandName;
                option.textContent = product.brandName;
                brandSelect.appendChild(option);
                brandSelect.value = product.brandName;
            }
        }

        // تحديث معاينة الصورة إذا وجدت
        const productImagesRaw = product.images && Array.isArray(product.images) ? product.images : (product.images ? [product.images] : []);
        form.dataset.existingProductImages = JSON.stringify(productImagesRaw);
        form.dataset.removedProductImages = JSON.stringify([]);
        form.__productImageState = {
            newImages: [],
            newImageDataUrls: []
        };
        updateProductImagePreview(productImagesRaw);
        const firstImage = productImagesRaw.find(img => resolveImageSource(img));
        form.dataset.productImageOriginal = firstImage ? resolveImageSource(firstImage) : '';
    } else {
        // وضع الإضافة: إعداد النموذج فارغاً
        title.textContent = 'إضافة منتج جديد';
        delete form.dataset.entityId;
        setFieldValue(form, 'id', '');
        form.dataset.existingProductImages = JSON.stringify([]);
        form.dataset.removedProductImages = JSON.stringify([]);
        form.dataset.productImageOriginal = '';
        form.__productImageState = {
            newImages: [],
            newImageDataUrls: []
        };
        updateProductImagePreview([]);

        const descriptionField = form.querySelector('[name="description"]');
        if (descriptionField) {
            setFieldValue(form, 'description', '');
            updateDescriptionCounter(descriptionField);
        }
        const specsField = form.querySelector('[name="specs"]');
        if (specsField) {
            setFieldValue(form, 'specs', '');
            updateDescriptionCounter(specsField);
        }

        // تعطيل حقل الفئة الفرعية حتى يتم اختيار فئة رئيسية
        const subcategorySelect = document.getElementById('productSubcategory');
        if (subcategorySelect) {
            subcategorySelect.disabled = true;
        }
    }
}

function populateCategoryModal(categoryId) {
    const form = document.getElementById('categoryForm');
    if (!form) return;

    const category = categoryId ? getCategoryById(categoryId) : null;
    const extras = category ? state.categoryExtras[category.id] : null;



    form.dataset.mode = category ? 'edit' : 'create';
    setFieldValue(form, 'id', category?.id || '');
    setFieldValue(form, 'name', category?.name || '');
    setFieldValue(form, 'slug', category?.slug || '');
    const targetImage = extras?.image ?? category?.image ?? '';
    const imageInput = form.querySelector('#categoryImage');
    if (imageInput) {
        imageInput.value = '';
        imageInput.dataset.originalImage = targetImage;
        imageInput.dataset.previewImage = '';
        imageInput.required = !targetImage;
    }
    updateCategoryImagePreview(targetImage);
    const resolvedDescription = extras?.description || category?.description || '';
    const descriptionField = form.querySelector('[name="description"]');
    setFieldValue(form, 'description', truncateText(resolvedDescription, getDescriptionMaxLength(descriptionField)));
    if (descriptionField) {
        updateDescriptionCounter(descriptionField);
    }

    const originalSnapshot = {
        name: category?.name || '',
        slug: category?.slug || '',
        description: resolvedDescription,
        image: targetImage
    };
    form.dataset.originalCategory = JSON.stringify(originalSnapshot);

    form.querySelector('[type="submit"]').textContent = category ? 'حفظ التعديلات' : 'حفظ الفئة';
}

// ===== Utility Functions =====
function isValidObjectId(id) {
    // Check if the ID is a valid MongoDB ObjectId (24 hex characters)
    return /^[0-9a-fA-F]{24}$/.test(id);
}

function formatCurrency(value) {
    const num = Number(value) || 0;
    return `${num.toLocaleString('ar-EG')} ريال`;
}

function formatNumber(value) {
    if (value === null || value === undefined) return '0';
    const number = Number(value);
    return Number.isNaN(number) ? String(value) : number.toLocaleString('ar-EG');
}

function formatPercent(value) {
    return `${value.toFixed(1)}%`;
}

function formatDate(value, options = {}) {
    const date = parseDateValue(value);
    if (!date) return '-';

    const formatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        ...options
    };

    return date.toLocaleDateString('ar-EG', formatOptions);
}

function formatRelativeTime(value) {
    const date = parseDateValue(value);
    if (!date) return '-';

    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const absDiffMs = Math.abs(diffMs);

    const units = [
        { unit: 'year', ms: 1000 * 60 * 60 * 24 * 365 },
        { unit: 'month', ms: 1000 * 60 * 60 * 24 * 30 },
        { unit: 'week', ms: 1000 * 60 * 60 * 24 * 7 },
        { unit: 'day', ms: 1000 * 60 * 60 * 24 },
        { unit: 'hour', ms: 1000 * 60 * 60 },
        { unit: 'minute', ms: 1000 * 60 },
        { unit: 'second', ms: 1000 }
    ];

    for (const { unit, ms } of units) {
        if (absDiffMs >= ms || unit === 'second') {
            const value = Math.round(diffMs / ms);
            if (typeof Intl !== 'undefined' && Intl.RelativeTimeFormat) {
                const formatter = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
                return formatter.format(value, unit);
            }

            const absValue = Math.abs(value);
            const suffix = value < 0 ? 'منذ' : 'بعد';
            const labels = {
                second: 'ثانية',
                minute: 'دقيقة',
                hour: 'ساعة',
                day: 'يوم',
                week: 'أسبوع',
                month: 'شهر',
                year: 'سنة'
            };
            return `${suffix} ${absValue} ${labels[unit] || ''}`.trim();
        }
    }

    return '-';
}

function parseDateValue(value) {
    if (!value) return null;

    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;

        // جرّب إنشاء التاريخ مباشرة، ثم جرّب استبدال الفراغ بـ "T" للأنماط الشائعة
        let date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
            return date;
        }

        date = new Date(trimmed.replace(' ', 'T'));
        return isNaN(date.getTime()) ? null : date;
    }

    return null;
}

function formatDateInputValue(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function isSameDay(dateA, dateB) {
    if (!dateA || !dateB) return false;
    return (
        dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate()
    );
}

function isSameMonth(dateA, dateB) {
    if (!dateA || !dateB) return false;
    return (
        dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth()
    );
}

function getOrderDate(order = {}) {
    if (!order) return null;

    const raw = order.raw || {};
    const dateValue =
        raw.createdAt ||
        raw.created_at ||
        raw.createdDate ||
        raw.date ||
        raw.orderDate ||
        order.createdAt ||
        order.created_at ||
        order.date;

    return parseDateValue(dateValue);
}

function getCustomerCreatedDate(customer = {}) {
    if (!customer) return null;

    const dateValue =
        customer.createdAt ||
        customer.created_at ||
        customer.createdOn ||
        customer.created_on ||
        customer.created ||
        customer.registrationDate ||
        customer.registeredAt ||
        customer.registered_at ||
        customer.joinedAt ||
        customer.joined_at;

    return parseDateValue(dateValue);
}

function formatChange(value) {
    return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function isValidObjectId(value) {
    return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value.trim());
}

function normalizeFilterValue(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim().toLowerCase();
}

function setFieldValue(form, name, value) {
    if (!form) return;
    const field = form.elements[name];
    if (!field) return;
    field.value = value ?? '';
}

function getFormValue(formData, name, fallback = '') {
    if (!formData) return fallback;
    const value = formData.get(name);
    return value !== null ? value.trim() : fallback;
}

function truncateText(value = '', maxLength = DESCRIPTION_MAX_LENGTH) {
    const text = typeof value === 'string' ? value : String(value ?? '');
    if (!Number.isFinite(maxLength) || maxLength <= 0) {
        return text;
    }
    return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function getDescriptionMaxLength(field) {
    if (!field || typeof field.getAttribute !== 'function') return DESCRIPTION_MAX_LENGTH;
    const attr = Number(field.getAttribute('maxlength'));
    return Number.isFinite(attr) && attr > 0 ? attr : DESCRIPTION_MAX_LENGTH;
}

function updateDescriptionCounter(field) {
    if (!field) return;
    const maxLength = getDescriptionMaxLength(field);
    const currentValue = field.value || '';
    if (currentValue.length > maxLength) {
        field.value = currentValue.slice(0, maxLength);
    }

    const counterId = field.dataset.counter;
    const counterElement = counterId ? document.getElementById(counterId) : null;
    if (counterElement) {
        counterElement.textContent = `${field.value.length} / ${maxLength}`;
    }
}

function refreshDescriptionCounters(container = document) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    container.querySelectorAll('.js-description-input').forEach(field => updateDescriptionCounter(field));
}

function initDescriptionInputs(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('.js-description-input').forEach(field => {
        if (field.dataset.descriptionWatcherAttached === 'true') return;
        field.dataset.descriptionWatcherAttached = 'true';
        field.addEventListener('input', () => updateDescriptionCounter(field));
        field.addEventListener('blur', () => updateDescriptionCounter(field));
        updateDescriptionCounter(field);
    });
}

function getNumericValue(formData, name, fallback = 0) {
    const value = formData.get(name);
    if (value === null || value === '') return fallback;
    const number = Number(value);
    return Number.isNaN(number) ? fallback : number;
}

function getStatusLabel(status) {
    const normalized = normalizeStatusKey(status);
    const entry = normalized ? STATUS_META[normalized] : null;
    return entry?.label || status || normalized || '-';
}

function getStatusBadge(status) {
    const normalized = normalizeStatusKey(status) || 'new';
    const entry = STATUS_META[normalized] || { label: normalized, class: 'status-default' };
    return `<span class="status-badge ${entry.class}">${entry.label}</span>`;
}

function renderOrderStatusControls(order = {}) {
    const statusKey = normalizeStatusKey(order.status) || 'new';
    const orderIdRaw = order?.id ?? '';
    const orderIdLiteral = JSON.stringify(orderIdRaw ?? '');
    const hasValidId = !(orderIdRaw === undefined || orderIdRaw === null || String(orderIdRaw).trim() === '');

    const optionsMarkup = getOrderStatusOptions()
        .map(option => `<option value="${option.value}"${option.value === statusKey ? ' selected' : ''}>${option.label}</option>`)
        .join('');

    return `
                <div class="order-status-control">
                    ${getStatusBadge(statusKey)}
                    <select class="order-status-select"${hasValidId ? '' : ' disabled'} data-order-id=${orderIdLiteral} onchange="changeOrderStatus(${orderIdLiteral}, this.value, this)">
                        ${optionsMarkup}
                    </select>
                </div>
            `;
}

function getRoleBadge(role) {
    const map = {
        admin: { label: 'مدير', class: 'role-admin' },
        editor: { label: 'محرر', class: 'role-editor' },
        support: { label: 'دعم', class: 'role-support' },
        viewer: { label: 'مشاهد', class: 'role-viewer' }
    };
    const entry = map[role] || { label: role, class: 'role-default' };
    return `<span class="role-badge ${entry.class}">${entry.label}</span>`;
}

function getCategoryLabel(slug) {
    const category = state.categories.find(cat => cat.slug === slug);
    if (category) {
        return category.name;
    }
    return slug;
}

function getCustomerSegmentLabel(segment) {
    const map = {
        vip: 'عميل مميز',
        loyal: 'عميل وفي',
        new: 'عميل جديد',
        churn: 'مهدد بالمغادرة'
    };
    return map[segment] || segment || '-';
}

function getPaymentLabel(method) {
    const map = {
        cash: 'الدفع عند الاستلام',
        card: 'بطاقة ائتمان',
        installment: 'التقسيط',
        bank: 'تحويل بنكي'
    };
    return map[method] || method || '-';
}

function getProductById(productId) {
    if (!productId) return null;
    return getProductsSource().find(product => String(product.id) === String(productId)) || null;
}

function getOrderById(orderId) {
    const normalizedId = normalizeOrderId(orderId);
    if (!normalizedId) return null;

    const orderFromState = getOrdersSource().find(order => normalizeOrderId(order.id) === normalizedId);
    if (orderFromState) {
        return orderFromState;
    }

    if (typeof mockData !== 'undefined' && Array.isArray(mockData.orders)) {
        return mockData.orders.find(order => normalizeOrderId(order.id) === normalizedId) || null;
    }

    return null;
}

function getOrderDetails(orderId) {
    const normalizedId = normalizeOrderId(orderId);
    if (!normalizedId) return null;

    const order = getOrderById(normalizedId);

    if (order) {
        const itemsSource = (() => {
            if (Array.isArray(order.itemsDetails) && order.itemsDetails.length) {
                return order.itemsDetails;
            }
            if (Array.isArray(order.raw?.cartItems) && order.raw.cartItems.length) {
                return order.raw.cartItems;
            }
            if (Array.isArray(order.raw?.items) && order.raw.items.length) {
                return order.raw.items;
            }
            return [];
        })();

        const items = itemsSource.length
            ? itemsSource.map(item => {
                const quantity = Number(item.quantity ?? item.qty ?? item.count ?? 1) || 1;
                const price = Number(item.price ?? item.unitPrice ?? item.salePrice ?? 0) || 0;
                return {
                    name: item.name || item.product?.name || item.productId?.name || 'منتج',
                    quantity,
                    price
                };
            })
            : [{
                name: order.raw?.cartItems?.[0]?.productId?.name || order.raw?.items?.[0]?.name || 'منتج',
                quantity: Number(order.items) || 1,
                price: Number(order.total) || 0
            }];

        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingInfo = order.shipping || normalizeOrderShipping(order.raw?.shippingAddress || order.raw?.shipping || null, order.raw);
        const shippingCost = Number(order.raw?.shippingCost ?? order.raw?.shippingPrice ?? order.raw?.deliveryFee ?? shippingInfo?.shippingRate ?? 0) || 0;
        const installationCost = Number(
            order.raw?.totalInstallationPrice
            ?? order.raw?.installationCost
            ?? order.raw?.installation_price
            ?? order.raw?.installationFee
            ?? order.installationCost
            ?? order.totalInstallationPrice
            ?? 0
        ) || 0;
        const discountValue = Number(order.raw?.discount ?? order.raw?.discountValue ?? 0) || 0;
        const totalValue = Number(order.total);
        const resolvedTotal = Number.isFinite(totalValue)
            ? totalValue
            : (subtotal + shippingCost + installationCost - discountValue);

        return {
            customer: {
                name: order.customer || order.user?.name || '-',
                email: order.customerEmail || order.user?.email || '-',
                phone: order.customerPhone || order.user?.phone || '-'
            },
            shipping: shippingInfo,
            paymentMethod: order.payment,
            date: order.date,
            items,
            summary: {
                subtotal,
                shipping: shippingCost,
                installation: installationCost,
                discount: discountValue,
                total: resolvedTotal
            },
            status: order.status,
            notes: order.raw?.notes || ''
        };
    }

    if (typeof mockData !== 'undefined') {
        const mockDetails = mockData.orderDetails?.[normalizedId];
        if (mockDetails) {
            return mockDetails;
        }

        const mockOrder = Array.isArray(mockData.orders)
            ? mockData.orders.find(entry => normalizeOrderId(entry.id) === normalizedId)
            : null;

        if (mockOrder) {
            const quantity = mockOrder.items && mockOrder.items > 0 ? mockOrder.items : 1;
            const unitPrice = quantity > 0 ? mockOrder.total / quantity : mockOrder.total;
            const installationCost = Number(mockOrder.totalInstallationPrice ?? mockOrder.installationCost ?? mockOrder.installation ?? 0) || 0;
            const shippingCost = Number(mockOrder.shippingCost ?? mockOrder.shipping ?? 0) || 0;
            const discountValue = Number(mockOrder.discount ?? 0) || 0;
            return {
                customer: { name: mockOrder.customer, email: '-', phone: '-' },
                shipping: { line: '-', city: '-', country: '-' },
                paymentMethod: mockOrder.payment,
                date: mockOrder.date,
                items: [{ name: 'تفاصيل المنتجات غير متاحة', quantity, price: unitPrice }],
                summary: {
                    subtotal: unitPrice * quantity,
                    shipping: shippingCost,
                    installation: installationCost,
                    discount: discountValue,
                    total: mockOrder.total ?? ((unitPrice * quantity) + shippingCost + installationCost - discountValue)
                },
                status: mockOrder.status,
                notes: ''
            };
        }
    }

    return null;
}

function getCustomerById(customerId) {
    if (!customerId) return null;

    const normalizedId = String(customerId);
    const customerFromState = (state.customers || []).find(customer => {
        const id = customer._id ?? customer.id;
        return id && String(id) === normalizedId;
    });

    if (customerFromState) {
        return customerFromState;
    }

    return mockData.customers.find(customer => String(customer.id) === normalizedId) || null;
}

function getPaymentMethodById(paymentId) {
    return mockData.payments.find(method => method.id === paymentId) || null;
}

async function fetchPaymentSettingsStatus() {
    try {
        const response = await authorizedFetch(PAYMENT_SETTINGS_ENDPOINT);
        if (!response?.ok) {
            throw new Error(`HTTP ${response?.status}`);
        }

        const payload = await response.json().catch(() => null);
        const data = payload?.data || payload;

        if (!data || typeof data !== 'object') {
            throw new Error('استجابة غير متوقعة من خادم طرق الدفع');
        }

        Object.entries(data).forEach(([field, value]) => {
            const paymentId = PAYMENT_ID_BY_STATUS_FIELD[field];
            if (!paymentId) return;

            const card = document.querySelector(`.payment-method-card[data-payment-id="${paymentId}"]`);
            const toggle = card?.querySelector('.toggle-switch input');
            if (toggle) {
                setPaymentToggleState(toggle, Boolean(value));
            }
        });

        return data;
    } catch (error) {
        console.error('❌ فشل جلب حالة إعدادات الدفع:', error);
        showToast('error', 'إعدادات الدفع', error?.message || 'تعذر جلب حالة طرق الدفع.');
        throw error;
    }
}

async function renderPaymentMethods() {
    await fetchPaymentSettingsStatus();
    const methods = mockData.payments;
    methods.forEach(updatePaymentMethodCard);

    document.querySelectorAll('.payment-method-card .toggle-switch input').forEach(input => {
        const card = input.closest('.payment-method-card');
        const stored = card?.dataset.enabled;
        if (stored == null) {
            setPaymentToggleState(input, true);
        }
    });
}

async function togglePaymentMethod(paymentKey, enabled) {
    const endpoint = PAYMENT_TOGGLE_ENDPOINTS[paymentKey];
    if (!endpoint) {
        throw new Error(`نقطة نهاية غير معروفة للطريقة: ${paymentKey}`);
    }

    const response = await authorizedFetch(endpoint, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled })
    });

    const handled = handleUnauthorized(response);
    if (handled !== response) {
        throw new Error('انتهت الجلسة. يرجى إعادة تسجيل الدخول.');
    }

    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};

    if (!response.ok) {
        const message = body?.message || `HTTP ${response.status}`;
        throw new Error(message);
    }

    return body?.data || body || { enabled };
}

function updatePaymentMethodCard(payment) {
    const card = document.querySelector(`.payment-method-card[data-payment-id="${payment.id}"]`);
    if (!card) return;

    let noteEl = card.querySelector('[data-payment-note]');
    if (payment.note) {
        if (!noteEl) {
            noteEl = document.createElement('p');
            noteEl.setAttribute('data-payment-note', 'true');
            noteEl.className = 'payment-note';
            card.querySelector('.payment-method-details')?.appendChild(noteEl);
        }
        noteEl.textContent = payment.note;
    } else if (noteEl) {
        noteEl.remove();
    }

    const toggle = card.querySelector('.toggle-switch input');
    if (toggle) {
        setPaymentToggleState(toggle, payment.enabled);
    }
}

// ===== Filter Helpers =====
function normalizeFilterValue(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function filterBySearch(term, fields = []) {
    const needle = normalizeFilterValue(term);
    if (!needle) return () => true;
    const targetFields = Array.isArray(fields) && fields.length ? fields : ['name'];
    return item => targetFields.some(field => normalizeFilterValue(item?.[field]).includes(needle));
}

function applyFilters(collection, filters = []) {
    return filters.reduce((items, filterFn) => items.filter(filterFn), collection);
}

// ===== Print & Export Functions =====
function buildReportTemplate(title, sections = [], options = {}) {
    const generatedAt = options.generatedAt || new Date().toLocaleString('ar-EG');
    const {
        footerNote = 'تم توليد هذا التقرير من لوحة التحكم التجريبية لـ Action Sports.',
        includePrintButton = true,
        extraStyles = ''
    } = options;

    const baseStyles = `
                body { font-family: 'Tajawal', 'Cairo', Arial, sans-serif; background: #f5f6fa; color: #2c3e50; margin: 0; }
                .container { max-width: 960px; margin: 0 auto; padding: 32px; background: #ffffff; }
                .report-header { text-align: center; margin-bottom: 32px; }
                .report-header h1 { margin-bottom: 8px; }
                .meta { color: #7f8c8d; margin: 0; }
                .section { margin-bottom: 32px; }
                .section h2 { margin-bottom: 16px; font-size: 1.4rem; }
                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th, .data-table td { border: 1px solid #ecf0f1; padding: 12px; text-align: right; }
                .data-table thead { background: #f9fafb; }
                .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
                .chart-card { background: #f9fafb; border: 1px solid #ecf0f1; border-radius: 12px; padding: 16px; text-align: center; }
                .chart-card img { max-width: 100%; height: auto; margin-top: 12px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
                .empty-state { color: #7f8c8d; margin: 0; }
                .report-footer { text-align: center; margin-top: 24px; }
                .report-footer button { background: #e74c3c; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 1rem; }
                .report-footer button:hover { background: #c44133; }
            `;

    const styles = `${baseStyles}${extraStyles}`;
    const buttonHtml = includePrintButton ? `<button onclick="window.print()">طباعة التقرير</button>` : '';

    const sectionsHtml = sections.map(section => `
                <section class="section">
                    ${section.title ? `<h2>${section.title}</h2>` : ''}
                    ${section.content || ''}
                </section>
            `).join('');

    return `
                <!DOCTYPE html>
                <html lang="ar" dir="rtl">
                    <head>
                        <meta charset="utf-8" />
                        <title>${title}</title>
                        <style>${styles}</style>
                    </head>
                    <body>
                        <div class="container">
                            <header class="report-header">
                                <h1>${title}</h1>
                                <p class="meta">تم الإنشاء بتاريخ ${generatedAt}</p>
                            </header>
                            ${sectionsHtml}
                            <footer class="report-footer">
                                ${buttonHtml}
                                <p class="meta">${footerNote}</p>
                            </footer>
                        </div>
                    </body>
                </html>
            `;
}

function openReportWindow(html) {
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
        return false;
    }

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    return true;
}

function exportOrders() {
    const orders = filterOrders().slice();

    if (!orders.length) {
        showToast('info', 'تصدير الطلبات', 'لا توجد طلبات متاحة للتقرير حالياً.');
        return;
    }

    const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalItems = orders.reduce((sum, order) => sum + (order.items || 0), 0);

    const statusCounts = orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
    }, {});

    const paymentCounts = orders.reduce((acc, order) => {
        acc[order.payment] = (acc[order.payment] || 0) + 1;
        return acc;
    }, {});

    const summaryContent = `
                <table class="data-table">
                    <tbody>
                        <tr><th>عدد الطلبات</th><td>${formatNumber(orders.length)}</td></tr>
                        <tr><th>إجمالي الإيرادات</th><td>${formatCurrency(totalRevenue)}</td></tr>
                        <tr><th>متوسط قيمة الطلب</th><td>${orders.length ? formatCurrency(totalRevenue / orders.length) : '0 ريال'}</td></tr>
                        <tr><th>إجمالي عدد المنتجات</th><td>${formatNumber(totalItems)}</td></tr>
                    </tbody>
                </table>
            `;

    const statusTable = Object.keys(statusCounts).length
        ? `
                    <table class="data-table">
                        <thead>
                            <tr><th>الحالة</th><th>عدد الطلبات</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(statusCounts).map(([status, count]) => `
                                <tr><td>${getStatusLabel(status)}</td><td>${formatNumber(count)}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                `
        : '<p class="empty-state">لا تتوفر بيانات للحالات.</p>';

    const paymentTable = Object.keys(paymentCounts).length
        ? `
                    <table class="data-table">
                        <thead>
                            <tr><th>طريقة الدفع</th><th>عدد الطلبات</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(paymentCounts).map(([payment, count]) => `
                                <tr><td>${getPaymentLabel(payment)}</td><td>${formatNumber(count)}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                `
        : '<p class="empty-state">لا تتوفر بيانات لطرق الدفع.</p>';

    const ordersRows = orders.map((order, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${order.id}</td>
                    <td>${order.customer}</td>
                    <td>${formatCurrency(order.total)}</td>
                    <td>${formatNumber(order.items)}</td>
                    <td>${getPaymentLabel(order.payment)}</td>
                    <td>${getStatusLabel(order.status)}</td>
                    <td>${order.date}</td>
                </tr>
            `).join('');

    const ordersTable = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>رقم الطلب</th>
                            <th>العميل</th>
                            <th>قيمة الطلب</th>
                            <th>عدد المنتجات</th>
                            <th>طريقة الدفع</th>
                            <th>الحالة</th>
                            <th>التاريخ</th>
                        </tr>
                    </thead>
                    <tbody>${ordersRows}</tbody>
                </table>
            `;

    const sections = [
        { title: 'ملخص سريع', content: summaryContent },
        {
            title: 'تفاصيل الحالة وطرق الدفع',
            content: `<div class="grid-2">${statusTable}${paymentTable}</div>`
        },
        { title: 'قائمة الطلبات', content: ordersTable }
    ];

    const reportHtml = buildReportTemplate('تقرير الطلبات', sections, {
        extraStyles: '.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }'
    });

    if (!openReportWindow(reportHtml)) {
        showToast('error', 'تصدير الطلبات', 'تعذر فتح التقرير. يرجى السماح بالنوافذ المنبثقة والمحاولة مرة أخرى.');
        return;
    }

    showToast('success', 'تصدير الطلبات', 'تم فتح تقرير الطلبات في نافذة جديدة. يمكنك طباعته أو حفظه كملف PDF.');
}

function exportCustomers() {
    const customers = getCustomersForDisplay();

    if (!customers.length) {
        showToast('info', 'تصدير العملاء', 'لا توجد بيانات عملاء متاحة للتقرير حالياً.');
        return;
    }

    const orders = Array.isArray(state.orders) ? state.orders : [];

    const customersWithMetrics = customers.map(customer => {
        const relatedOrders = orders.filter(order => doesOrderBelongToCustomer(order, customer));
        const ordersCount = relatedOrders.length;
        const totalSpent = relatedOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);

        let lastOrderDisplay = customer.lastOrder || '-';
        if (relatedOrders.length) {
            const latestOrder = relatedOrders.reduce((latest, current) => {
                const latestDate = latest ? getOrderDate(latest) : null;
                const currentDate = getOrderDate(current);
                if (!currentDate) return latest;
                if (!latestDate || currentDate > latestDate) {
                    return current;
                }
                return latest;
            }, null);

            const latestDate = getOrderDate(latestOrder);
            if (latestDate) {
                lastOrderDisplay = latestDate.toLocaleString('ar-EG');
            }
        }

        return {
            ...customer,
            ordersCount,
            totalSpent,
            lastOrderDisplay
        };
    });

    const totalCustomers = customersWithMetrics.length;
    const totalOrders = customersWithMetrics.reduce((sum, customer) => sum + (customer.ordersCount || 0), 0);
    const totalSpend = customersWithMetrics.reduce((sum, customer) => sum + (customer.totalSpent || 0), 0);
    const averageSpend = totalCustomers ? totalSpend / totalCustomers : 0;

    const summaryContent = `
                <table class="data-table">
                    <tbody>
                        <tr><th>عدد العملاء</th><td>${formatNumber(totalCustomers)}</td></tr>
                        <tr><th>إجمالي عدد الطلبات</th><td>${formatNumber(totalOrders)}</td></tr>
                        <tr><th>إجمالي الإنفاق</th><td>${formatCurrency(totalSpend)}</td></tr>
                        <tr><th>متوسط إنفاق العميل</th><td>${formatCurrency(averageSpend)}</td></tr>
                    </tbody>
                </table>
            `;

    const customersRows = customersWithMetrics.map((customer, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${customer.name || '-'}</td>
                    <td>${customer.email || '-'}</td>
                    <td>${customer.phone || '-'}</td>
                    <td>${formatCurrency(customer.totalSpent || 0)}</td>
                    <td>${customer.lastOrderDisplay || '-'}</td>
                </tr>
            `).join('');

    const customersTable = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>الاسم</th>
                            <th>البريد الإلكتروني</th>
                            <th>رقم الهاتف</th>
                            <th>إجمالي الإنفاق</th>
                            <th>آخر طلب</th>
                        </tr>
                    </thead>
                    <tbody>${customersRows}</tbody>
                </table>
            `;

    const sections = [
        { title: 'ملخص سريع', content: summaryContent },
        { title: 'قائمة العملاء', content: customersTable }
    ];

    const reportHtml = buildReportTemplate('تقرير العملاء', sections, {
        extraStyles: '.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }'
    });

    if (!openReportWindow(reportHtml)) {
        showToast('error', 'تصدير العملاء', 'تعذر فتح التقرير. يرجى السماح بالنوافذ المنبثقة والمحاولة مرة أخرى.');
        return;
    }

    showToast('success', 'تصدير العملاء', 'تم فتح تقرير العملاء في نافذة جديدة. يمكنك طباعته أو حفظه كملف PDF.');
}

function exportAuditLogs() {
    const logs = mockData.auditLogs.slice();

    if (!logs.length) {
        showToast('info', 'تصدير سجل النشاط', 'لا توجد سجلات نشاط متاحة حالياً.');
        return;
    }

    const actionCounts = logs.reduce((acc, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
    }, {});

    const uniqueUsers = new Set(logs.map(log => log.user)).size;
    const latestLog = logs[0];

    const summaryContent = `
                <table class="data-table">
                    <tbody>
                        <tr><th>إجمالي السجلات</th><td>${formatNumber(logs.length)}</td></tr>
                        <tr><th>عدد المستخدمين</th><td>${formatNumber(uniqueUsers)}</td></tr>
                        <tr><th>أحدث حدث</th><td>${latestLog?.createdAt || '-'}</td></tr>
                    </tbody>
                </table>
            `;

    const actionTable = `
                <table class="data-table">
                    <thead>
                        <tr><th>نوع الإجراء</th><th>عدد المرات</th></tr>
                    </thead>
                    <tbody>
                        ${Object.entries(actionCounts).map(([action, count]) => `
                            <tr><td>${getStatusLabel(action)}</td><td>${formatNumber(count)}</td></tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

    const logsRows = logs.map(log => `
                <tr>
                    <td>${log.createdAt}</td>
                    <td>${log.user}</td>
                    <td>${getStatusLabel(log.action)}</td>
                    <td>${log.message}</td>
                    <td>${log.ip}</td>
                </tr>
            `).join('');

    const logsTable = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>التاريخ والوقت</th>
                            <th>المستخدم</th>
                            <th>الإجراء</th>
                            <th>الوصف</th>
                            <th>عنوان IP</th>
                        </tr>
                    </thead>
                    <tbody>${logsRows}</tbody>
                </table>
            `;

    const sections = [
        { title: 'ملخص سريع', content: summaryContent },
        { title: 'توزيع الإجراءات', content: actionTable },
        { title: 'السجل التفصيلي', content: logsTable }
    ];

    const reportHtml = buildReportTemplate('تقرير سجل النشاط', sections);

    if (!openReportWindow(reportHtml)) {
        showToast('error', 'تصدير سجل النشاط', 'تعذر فتح التقرير. يرجى السماح بالنوافذ المنبثقة والمحاولة مرة أخرى.');
        return;
    }

    showToast('success', 'تصدير سجل النشاط', 'تم فتح تقرير السجل في نافذة جديدة. يمكنك طباعته أو حفظه كملف PDF.');
}

async function exportAnalyticsReport() {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    if (!chartsLoaded.overview) {
        loadOverviewCharts();
        chartsLoaded.overview = true;
    }

    if (!chartsLoaded.analytics) {
        loadAnalyticsCharts();
        chartsLoaded.analytics = true;
    }

    await wait(200);

    const chartDefinitions = [
        { scope: 'overview', key: 'sales', title: 'المبيعات الشهرية', description: 'أداء المبيعات خلال آخر ستة أشهر.' },
        { scope: 'overview', key: 'products', title: 'توزيع أفضل المنتجات', description: 'نسبة المبيعات حسب نوع المنتج.' },
        { scope: 'analytics', key: 'revenue', title: 'الإيرادات مقابل التكاليف', description: 'مقارنة شهرية بين الإيرادات والتكاليف.' },
        { scope: 'analytics', key: 'traffic', title: 'مصادر الزيارات', description: 'توزيع مصادر زيارات المتجر خلال الفترة المحددة.' },
        { scope: 'analytics', key: 'performance', title: 'رادار الأداء العام', description: 'قياس مؤشرات الأداء الرئيسية الحالية.' }
    ];

    const chartCards = chartDefinitions.map(def => {
        const chart = chartInstances[def.scope]?.[def.key];
        if (!chart || !chart.canvas) {
            return '';
        }

        let dataUrl = '';
        try {
            dataUrl = chart.canvas.toDataURL('image/png');
        } catch (error) {
            console.warn('Failed to export chart image', error);
        }

        if (!dataUrl) {
            return '';
        }

        return `
                    <div class="chart-card">
                        <h3>${def.title}</h3>
                        <p>${def.description}</p>
                        <img src="${dataUrl}" alt="${def.title}" />
                    </div>
                `;
    }).filter(Boolean).join('');

    const analyticsData = calculateAnalyticsData();

    const metricsRows = `
                <tr><th>إجمالي الإيرادات</th><td>${formatCurrency(analyticsData.totalRevenue)}</td></tr>
                <tr><th>متوسط قيمة السلة</th><td>${formatCurrency(analyticsData.avgBasket)}</td></tr>
                <tr><th>عدد الطلبات</th><td>${formatNumber(analyticsData.ordersCount)}</td></tr>
                <tr><th>إجمالي المنتجات المباعة</th><td>${formatNumber(analyticsData.totalItems)}</td></tr>
            `;

    const topProductsData = (analyticsData.topProducts || []).filter(product => Number(product.quantity) >= 5);

    const topProductsRows = topProductsData.map((product, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${product.name}</td>
                    <td>${formatNumber(product.quantity)}</td>
                    <td>${formatCurrency(product.revenue)}</td>
                </tr>
            `).join('');

    const orders = Array.isArray(state.orders) ? state.orders : [];
    let customers = Array.isArray(state.customers) ? state.customers.slice() : [];

    if ((!customers || customers.length === 0) && orders.length) {
        createCustomersFromOrders();
        customers = Array.isArray(state.customers) ? state.customers.slice() : [];
    }

    const customersWithMetrics = (customers || []).map(customer => {
        const relatedOrders = orders.filter(order => doesOrderBelongToCustomer(order, customer));
        const ordersCount = relatedOrders.length;
        const totalSpent = relatedOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);

        let lastOrderDisplay = customer.lastOrder || '-';
        if (relatedOrders.length) {
            const latestOrder = relatedOrders.reduce((latest, current) => {
                const latestDate = latest ? getOrderDate(latest) : null;
                const currentDate = getOrderDate(current);
                if (!currentDate) return latest;
                if (!latestDate || currentDate > latestDate) {
                    return current;
                }
                return latest;
            }, null);

            const latestDate = getOrderDate(latestOrder);
            if (latestDate) {
                lastOrderDisplay = latestDate.toLocaleString('ar-EG');
            }
        }

        const status = customer.status || customer.accountStatus || null;
        const segment = customer.segment || null;

        return {
            ...customer,
            ordersCount,
            totalSpent,
            lastOrderDisplay,
            status,
            segment
        };
    });

    const topCustomersData = customersWithMetrics
        .filter(customer => (customer.totalSpent || 0) > 0 || (customer.ordersCount || 0) > 0)
        .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
        .slice(0, 10);

    const topCustomersRows = topCustomersData.map((customer, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${customer.name || '-'}</td>
                    <td>${customer.email || '-'}</td>
                    <td>${customer.phone || '-'}</td>
                    <td>${getCustomerSegmentLabel(customer.segment)}</td>
                    <td>${formatNumber(customer.ordersCount || 0)}</td>
                    <td>${formatCurrency(customer.totalSpent || 0)}</td>
                    <td>${customer.status ? getStatusLabel(customer.status) : '-'}</td>
                    <td>${customer.lastOrderDisplay || '-'}</td>
                </tr>
            `).join('');

    const chartsMarkup = chartCards || '<p class="empty-state">لا تتوفر رسوم بيانية حالياً.</p>';
    const productsMarkup = topProductsData.length
        ? `<table class="data-table"><thead><tr><th>#</th><th>اسم المنتج</th><th>المبيعات (الكمية)</th><th>الإيرادات</th></tr></thead><tbody>${topProductsRows}</tbody></table>`
        : '<p class="empty-state">لا توجد منتجات حققت 5 مبيعات أو أكثر للعرض.</p>';
    const customersMarkup = topCustomersData.length
        ? `<table class="data-table"><thead><tr><th>#</th><th>الاسم</th><th>البريد الإلكتروني</th><th>رقم الهاتف</th><th>التصنيف</th><th>عدد الطلبات</th><th>إجمالي الإنفاق</th><th>الحالة</th><th>آخر طلب</th></tr></thead><tbody>${topCustomersRows}</tbody></table>`
        : '<p class="empty-state">لا توجد بيانات عملاء للعرض.</p>';

    const sections = [
        {
            title: 'المؤشرات الرئيسية',
            content: `<table class="data-table"><tbody>${metricsRows}</tbody></table>`
        },
        {
            title: 'الرسوم البيانية',
            content: `<div class="charts-grid">${chartsMarkup}</div>`
        },
        {
            title: 'أفضل المنتجات أداءً',
            content: productsMarkup
        },
        {
            title: 'أعلى العملاء إنفاقاً',
            content: customersMarkup
        }
    ];

    const reportHtml = buildReportTemplate('تقرير التحليلات', sections);

    if (!openReportWindow(reportHtml)) {
        showToast('error', 'تصدير التقرير', 'فشل فتح نافذة جديدة. يرجى السماح بالنوافذ المنبثقة والمحاولة مجدداً.');
        return;
    }

    showToast('success', 'تصدير التقرير', 'تم فتح التقرير في نافذة جديدة. يمكنك طباعته أو حفظه كملف PDF.');
}

// ===== Rendering Functions =====
/**
 * تحديث إحصائيات نظرة عامة
 */
function updateOverviewStats() {
    const orders = state.orders || [];
    const products = state.products || [];
    const customers = state.customers || [];
    const now = new Date();

    // 1. إجمالي الإيرادات لهذا الشهر (استثناء الملغاة)
    const monthlyRevenue = orders
        .filter(order => order.status !== 'cancelled')
        .filter(order => {
            const orderDate = getOrderDate(order);
            return isSameMonth(orderDate, now);
        })
        .reduce((sum, order) => sum + (Number(order.total) || 0), 0);

    // 2. العملاء الجدد (المضافون اليوم وفق تواريخ الإنشاء)
    const dailyNewCustomers = customers.filter(customer => {
        const createdAt = getCustomerCreatedDate(customer);
        if (createdAt) {
            return isSameDay(createdAt, now);
        }

        // fallback: إذا لم يتوفر تاريخ الإنشاء نتحقق من آخر طلب
        const customerOrders = orders.filter(order => doesOrderBelongToCustomer(order, customer));
        if (!customerOrders.length) return false;

        const latestOrder = customerOrders.reduce((latest, current) => {
            const latestDate = latest ? getOrderDate(latest) : null;
            const currentDate = getOrderDate(current);
            if (!currentDate) return latest;
            if (!latestDate || currentDate > latestDate) {
                return current;
            }
            return latest;
        }, null);

        const latestOrderDate = getOrderDate(latestOrder);
        return isSameDay(latestOrderDate, now);
    }).length;

    // 3. المنتجات منخفضة المخزون (٥ أو أقل)
    const lowStockProducts = products.filter(product => {
        const stockValue = product.stock ?? product.quantity ?? product.count ?? 0;
        return Number.isFinite(stockValue) && stockValue <= 5;
    });

    // تحديث العناصر في HTML باستخدام IDs
    const revenueEl = document.getElementById('monthlyRevenue');
    const customersEl = document.getElementById('newCustomersCount');
    const lowStockEl = document.getElementById('lowStockCount');
    const todayOrdersEl = document.getElementById('todayOrdersCount');
    const lowStockCard = document.getElementById('lowStockCard');

    if (revenueEl) revenueEl.textContent = formatCurrency(monthlyRevenue);
    if (customersEl) customersEl.textContent = formatNumber(dailyNewCustomers);
    if (lowStockEl) lowStockEl.textContent = lowStockProducts.length;
    if (todayOrdersEl) {
        const todayOrdersCount = orders.filter(order => {
            const orderDate = getOrderDate(order);
            return isSameDay(orderDate, now);
        }).length;
        todayOrdersEl.textContent = formatNumber(todayOrdersCount);
    }

    if (lowStockCard) {
        if (lowStockProducts.length === 0) {
            lowStockCard.removeAttribute('title');
        } else {
            const tooltip = lowStockProducts
                .map(product => {
                    const name = product.name || product.title || 'منتج غير معروف';
                    const quantity = product.stock ?? product.quantity ?? product.count ?? 0;
                    return `${name} — ${quantity}`;
                })
                .join('\n');
            lowStockCard.setAttribute('title', tooltip);
        }
    }

    renderTodayOrders();
}

function renderTodayOrders() {
    const body = document.getElementById('todayOrdersTableBody');
    if (!body) return;

    const orders = Array.isArray(state.orders) ? state.orders : [];
    const today = new Date();

    const todayOrders = orders.filter(order => {
        const orderDate = getOrderDate(order);
        return isSameDay(orderDate, today);
    });

    if (!todayOrders.length) {
        body.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 24px; color: #7a7a7a;">
                        لا توجد طلبات اليوم حتى الآن.
                    </td>
                </tr>
            `;
        return;
    }

    const rows = todayOrders.map((order, index) => {
        const orderIdLiteral = JSON.stringify(order?.id ?? '');

        return `
                <tr data-id="${order.id}">
                    <td>${index + 1}</td>
                    <td>${order.id}</td>
                    <td>${order.customer}</td>
                    <td><strong>${formatCurrency(order.total)}</strong></td>
                    <td>${getStatusBadge(order.status)}</td>
                    <td>${order.date}</td>
                    <td>
                        <button class="action-btn" onclick='viewOrderDetails(${orderIdLiteral})' title="عرض التفاصيل">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="action-btn" onclick='printOrder(${orderIdLiteral})' title="طباعة">
                            <i class="fas fa-print"></i>
                        </button>
                    </td>
                </tr>
            `;
    }).join('');

    body.innerHTML = rows;
}


function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    if (state.productsLoading) {
        grid.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>جاري تحميل المنتجات...</p>
                </div>
            `;
        return;
    }

    if (state.productsError) {
        grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>حدث خطأ أثناء تحميل المنتجات</h3>
                    <p>${state.productsError}</p>
                    <button class="btn-primary" data-action="refresh-products">إعادة المحاولة</button>
                </div>
            `;
        return;
    }

    const source = getProductsSource();

    if (!source.length) {
        safeHTML(grid, `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i>
                    <h3>لا توجد منتجات حالياً</h3>
                    <p>استخدم زر "إضافة منتج جديد" لإنشاء أول منتج.</p>
                </div>
            `);
        return;
    }

    const filterFns = [
        filterBySearch(state.filters.productSearch, ['name', 'sku']),
        state.filters.productCategory !== 'all' ? item => normalizeFilterValue(item.categoryId || item.categorySlug) === normalizeFilterValue(state.filters.productCategory) : () => true
    ];

    const filtered = applyFilters(source, filterFns);
    if (!filtered.length) {
        safeHTML(grid, `<div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>لا توجد منتجات مطابقة</h3>
                <p>حاول تعديل البحث أو الفلاتر</p>
            </div>`);
        return;
    }

    safeHTML(grid, filtered.map(product => `
            <div class="product-card" data-id="${product.id}">
                <div class="product-thumb">
                    <img src="${product.image || PRODUCT_PLACEHOLDER_IMAGE}" alt="${product.name}">
                </div>
                <div class="product-info">
                    <h3>${product.name}</h3>
                    <p class="product-category">${product.categoryName || getCategoryLabel(product.categorySlug)}</p>
                    <div class="product-meta">
                        <span class="meta-item"><i class="fas fa-coins"></i> ${formatCurrency(product.price)}</span>
                    </div>
                </div>
                <div class="product-actions">
                    <button class="btn-secondary" title="عرض التفاصيل" data-action="preview-product" data-entity-id="${product.id}"><i class="fas fa-eye"></i></button>
                    <button class="btn-secondary" title="تعديل المنتج" data-open-modal="addProductModal" data-modal-mode="edit" data-entity="product" data-entity-id="${product.id}"><i class="fas fa-edit"></i> تعديل</button>
                    <button class="btn-danger" title="حذف المنتج" data-action="delete-product" data-entity-id="${product.id}"><i class="fas fa-trash"></i> حذف</button>
                </div>
            </div>
        `).join(''));
}

function renderCategories() {
    const list = document.getElementById('categoriesList');
    if (!list) return;

    if (state.categoriesLoading) {
        list.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>جاري تحميل الفئات...</p>
                </div>
            `;
        return;
    }

    if (state.categoriesError) {
        list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>حدث خطأ أثناء تحميل الفئات</h3>
                    <p>${state.categoriesError}</p>
                    <button class="btn-primary" data-action="refresh-categories">إعادة المحاولة</button>
                </div>
            `;
        return;
    }

    const categories = getCategorySource();
    const filteredCategories = applyFilters(categories, [
        filterBySearch(state.filters.categorySearch, ['name', 'description'])
    ]);

    if (!filteredCategories.length) {
        list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-tags"></i>
                    <h3>${state.filters.categorySearch ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد فئات حالياً'}</h3>
                    <p>${state.filters.categorySearch ? 'حاول تعديل كلمات البحث أو إعادة ضبطه.' : 'استخدم زر "إضافة فئة جديدة" لإنشاء أول فئة.'}</p>
                </div>
            `;
        return;
    }

    safeHTML(list, filteredCategories.map(category => {
        const loadedSubcategories = getSubcategories(category.id);
        const subcategoriesCount = loadedSubcategories.length
            ? loadedSubcategories.length
            : typeof category.subcategoriesCount === 'number'
                ? category.subcategoriesCount
                : Number(category.subcategoriesCount) || 0;
        return `
                <div class="category-card" data-id="${category.id}">
                    <div class="category-content">
                        <div class="category-icon ${category.image ? 'has-image' : ''}">
                            ${category.image ? `<img src="${category.image}" alt="${escapeHtml(category.name)}">` : '<i class="fas fa-tag"></i>'}
                        </div>
                        <div class="category-info">
                            <h3>${escapeHtml(category.name)}</h3>
                            <p class="category-description">${escapeHtml(truncateText(category.description || 'لا يوجد وصف متاح لهذه الفئة حالياً.', DESCRIPTION_MAX_LENGTH))}</p>
                            <div class="category-meta">
                                <span class="meta-item"><i class="fas fa-sitemap"></i> ${formatNumber(subcategoriesCount)} فئة فرعية</span>
                            </div>
                        </div>
                    </div>
                    <div class="category-actions">
                        <button class="btn-danger btn-sm" data-action="delete-category" data-entity-id="${category.id}" title="حذف"><i class="fas fa-trash"></i></button>
                        <button class="btn-secondary btn-sm" data-open-modal="categoryModal" data-modal-mode="edit" data-entity="category" data-entity-id="${category.id}" title="تعديل"><i class="fas fa-edit"></i> تعديل</button>
                    </div>
                </div>
            `;
    }).join(''));
}

function renderCollections() {
    const grid = document.getElementById('collectionsGrid');
    if (!grid) return;

    grid.innerHTML = mockData.collections.map(collection => `
            <div class="collection-card" data-id="${collection.id}">
                <div class="collection-cover">
                    <img src="${collection.image}" alt="${collection.name}">
                    ${getStatusBadge(collection.status)}
                </div>
                <div class="collection-info">
                    <h3>${collection.name}</h3>
                    <p>${collection.products} منتج • ${collection.schedule}</p>
                </div>
                <div class="collection-actions">
                    <button class="btn-secondary" data-open-modal="collectionModal" data-modal-mode="edit" data-entity="collection" data-entity-id="${collection.id}"><i class="fas fa-edit"></i></button>
                    <button class="btn-secondary" data-action="view-collection" data-entity="collection" data-entity-id="${collection.id}"><i class="fas fa-eye"></i></button>
                </div>
            </div>
        `).join('');
}

function renderPromotions() {
    const grid = document.getElementById('promotionsGrid');
    if (!grid) return;

    grid.innerHTML = mockData.promotions.map(promotion => `
            <div class="promotion-card" data-id="${promotion.id}">
                <div class="promotion-header">
                    <h3>${promotion.title}</h3>
                    ${getStatusBadge(promotion.status)}
                </div>
                <div class="promotion-details">
                    <p><strong>النوع:</strong> ${promotion.type}</p>
                    <p><strong>القيمة:</strong> ${promotion.value}</p>
                    <p><strong>الفترة:</strong> ${promotion.period}</p>
                </div>
                <div class="promotion-actions">
                    <button class="btn-secondary btn-sm" data-open-modal="promotionModal" data-modal-mode="edit" data-entity="promotion" data-entity-id="${promotion.id}"><i class="fas fa-edit"></i> تعديل</button>
                    <button class="btn-danger btn-sm" data-action="pause" data-entity="promotion" data-entity-id="${promotion.id}"><i class="fas fa-pause"></i> إيقاف</button>
                </div>
            </div>
        `).join('');
}

function renderShippingSettings() {
    const form = document.getElementById('shippingSettingsForm');
    const select = document.getElementById('shippingZoneSelect');
    const rateInput = document.getElementById('shippingZoneRate');
    const submitButton = document.getElementById('shippingSettingsSubmit');
    const deleteButton = document.getElementById('shippingZoneDeleteBtn');
    const installationCheckbox = document.getElementById('shippingZoneInstallation');

    if (!form || !select || !rateInput || !submitButton || !deleteButton) {
        return;
    }

    const { shippingZonesLoading, shippingZonesError, shippingZones, selectedShippingZoneId } = state;

    select.disabled = shippingZonesLoading;
    rateInput.disabled = shippingZonesLoading;
    submitButton.disabled = shippingZonesLoading || !!shippingZonesError || !shippingZones.length;
    deleteButton.disabled = shippingZonesLoading || !!shippingZonesError || !shippingZones.length;

    if (shippingZonesLoading) {
        select.innerHTML = '<option value="">جاري التحميل...</option>';
        if (document.activeElement !== rateInput) {
            rateInput.value = '';
        }
        if (installationCheckbox) {
            installationCheckbox.checked = false;
            installationCheckbox.disabled = true;
        }
        return;
    }

    if (shippingZonesError) {
        select.innerHTML = `<option value="">${escapeHtml(shippingZonesError)}</option>`;
        if (document.activeElement !== rateInput) {
            rateInput.value = '';
        }
        if (installationCheckbox) {
            installationCheckbox.checked = false;
            installationCheckbox.disabled = true;
        }
        return;
    }

    if (!shippingZones.length) {
        select.innerHTML = '<option value="">لا توجد مناطق شحن متاحة</option>';
        if (document.activeElement !== rateInput) {
            rateInput.value = '';
        }
        if (installationCheckbox) {
            installationCheckbox.checked = false;
            installationCheckbox.disabled = true;
        }
        return;
    }

    const optionsMarkup = shippingZones
        .map(zone => `<option value="${escapeHtml(zone.id)}">${escapeHtml(zone.zoneName)}</option>`)
        .join('');

    select.innerHTML = optionsMarkup;

    const targetZoneId = selectedShippingZoneId && getShippingZoneById(selectedShippingZoneId)
        ? selectedShippingZoneId
        : shippingZones[0].id;

    state.selectedShippingZoneId = targetZoneId;
    select.value = targetZoneId;

    const zone = getShippingZoneById(targetZoneId);
    if (zone) {
        if (document.activeElement !== rateInput) {
            rateInput.value = zone.shippingRate;
        }
        if (installationCheckbox) {
            installationCheckbox.checked = Boolean(zone.installationAvailable);
            installationCheckbox.disabled = false;
        }
    } else if (installationCheckbox) {
        installationCheckbox.checked = false;
        installationCheckbox.disabled = true;
    }
}

function renderBanners() {
    const grid = document.getElementById('bannersGrid');
    if (!grid) return;

    if (state.bannersLoading) {
        safeHTML(grid, `
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>جاري تحميل البانرات...</p>
                </div>
            `);
        return;
    }

    if (state.bannersError) {
        safeHTML(grid, `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>حدث خطأ أثناء تحميل البانرات</h3>
                    <p>${escapeHtml(state.bannersError)}</p>
                    <button class="btn-primary" data-action="refresh-banners">إعادة المحاولة</button>
                </div>
            `);
        return;
    }

    const banners = getBannerSource();

    if (!banners.length) {
        grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-image"></i>
                    <h3>لا توجد بانرات حالياً</h3>
                    <p>استخدم زر "إضافة بانر جديد" لإنشاء بانر.</p>
                </div>
            `;
        return;
    }

    safeHTML(grid, banners.map(banner => {
        const bannerId = banner._id || banner.id;
        const imageUrl = banner.image?.secure_url || banner.image?.url || banner.image || 'https://via.placeholder.com/1200x400?text=Banner';
        const description = banner.description ? escapeHtml(truncateText(banner.description, DESCRIPTION_MAX_LENGTH)) : '';

        return `
                <div class="banner-card" data-id="${escapeHtml(bannerId || '')}">
                    <div class="banner-preview">
                        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(banner.title || 'بانر')}">
                    </div>
                    <div class="banner-info">
                        <h3>${escapeHtml(banner.title || 'بانر بدون عنوان')}</h3>
                        ${description ? `<p class="banner-description">${description}</p>` : ''}
                        <div class="banner-actions">
                            <button class="btn-secondary btn-sm" data-open-modal="bannerModal" data-modal-mode="edit" data-entity="banner" data-entity-id="${escapeHtml(bannerId || '')}"><i class="fas fa-edit"></i> تعديل</button>
                            <button class="btn-danger btn-sm" data-action="delete-banner" data-entity-id="${escapeHtml(bannerId || '')}"><i class="fas fa-trash"></i> حذف</button>
                        </div>
                    </div>
                </div>
            `;
    }).join(''));
}



/**
 * عرض قائمة العملاء
 */
function getCustomersForDisplay() {
    const ordersFilter = state.filters?.customerOrdersFilter || 'all';
    const searchTerm = state.filters?.customerSearch?.toLowerCase() || '';

    let customers = Array.isArray(state.customers) ? [...state.customers] : [];

    if (ordersFilter === 'withOrders') {
        customers = customers.filter(customer => (Number(customer.ordersCount) || 0) > 0);
    }

    if (searchTerm) {
        customers = customers.filter(customer => {
            const name = (customer.name || '').toLowerCase();
            const phone = (customer.phone || '').toLowerCase();
            return name.includes(searchTerm) || phone.includes(searchTerm);
        });
    }

    customers.sort((a, b) => {
        const timeA = Number(a.lastOrderTimestamp) || 0;
        const timeB = Number(b.lastOrderTimestamp) || 0;
        return timeB - timeA;
    });

    return customers;
}

/**
 * عرض قائمة العملاء
 */
/**
 * ========================================
 * renderCustomers() - DOM API Refactored
 * ========================================
 * Renders customers table using pure DOM API (DOMPurify-safe)
 * - No innerHTML usage
 * - Uses textContent for user data
 * - Event delegation for action buttons
 * - DocumentFragment for performance optimization
 * - Preserves data-id attributes for interactivity
 */
function renderCustomers() {
    const body = document.getElementById('customersTableBody');
    if (!body) {
        console.warn('⚠️ customersTableBody element not found!');
        return;
    }

    // Clear previous rows
    body.innerHTML = '';

    // ===== STATE: LOADING =====
    if (state.customersLoading) {
        const loadingRow = document.createElement('tr');
        loadingRow.style.cssText = 'text-align: center; padding: 40px;';

        const loadingCell = document.createElement('td');
        loadingCell.colSpan = '6';
        loadingCell.style.cssText = 'padding: 40px;';

        const spinner = document.createElement('i');
        spinner.className = 'fas fa-spinner fa-spin';
        spinner.style.cssText = 'font-size: 24px; color: #e74c3c; display: block;';

        const loadingText = document.createElement('p');
        loadingText.style.cssText = 'margin-top: 10px;';
        loadingText.textContent = 'جاري تحميل العملاء...';

        loadingCell.appendChild(spinner);
        loadingCell.appendChild(loadingText);
        loadingRow.appendChild(loadingCell);
        body.appendChild(loadingRow);
        return;
    }

    // ===== STATE: ERROR =====
    if (state.customersError) {
        const errorRow = document.createElement('tr');
        const errorCell = document.createElement('td');
        errorCell.colSpan = '6';
        errorCell.style.cssText = 'padding: 40px; text-align: center;';

        const errorIcon = document.createElement('i');
        errorIcon.className = 'fas fa-exclamation-triangle';
        errorIcon.style.cssText = 'font-size: 24px; color: #f39c12; display: block;';

        const errorText = document.createElement('p');
        errorText.style.cssText = 'margin-top: 10px; color: #e74c3c;';
        errorText.textContent = state.customersError;

        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn-primary';
        retryBtn.style.cssText = 'margin-top: 15px;';
        retryBtn.textContent = 'إعادة المحاولة';
        retryBtn.addEventListener('click', fetchCustomers);

        errorCell.appendChild(errorIcon);
        errorCell.appendChild(errorText);
        errorCell.appendChild(retryBtn);
        errorRow.appendChild(errorCell);
        body.appendChild(errorRow);
        return;
    }

    // ===== FETCH CUSTOMERS =====
    const ordersFilter = state.filters?.customerOrdersFilter || 'all';
    const searchTerm = state.filters?.customerSearch || '';
    const customers = getCustomersForDisplay();

    // ===== STATE: EMPTY =====
    if (!customers.length) {
        const normalizedSearch = searchTerm.trim();
        let message;
        if (normalizedSearch) {
            message = `لا توجد نتائج للبحث عن "${state.filters.customerSearch}"`;
        } else if (ordersFilter === 'withOrders') {
            message = 'لا يوجد عملاء لديهم طلبات حالياً';
        } else {
            message = 'لا يوجد عملاء حالياً';
        }

        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = '6';
        emptyCell.style.cssText = 'padding: 40px; text-align: center;';

        const emptyIcon = document.createElement('i');
        emptyIcon.className = 'fas fa-users';
        emptyIcon.style.cssText = 'font-size: 24px; color: #95a5a6; display: block;';

        const emptyText = document.createElement('p');
        emptyText.style.cssText = 'margin-top: 10px;';
        emptyText.textContent = message;

        emptyCell.appendChild(emptyIcon);
        emptyCell.appendChild(emptyText);
        emptyRow.appendChild(emptyCell);
        body.appendChild(emptyRow);
        return;
    }

    // ===== RENDER ROWS: USE DOCUMENT FRAGMENT FOR PERFORMANCE =====
    const fragment = document.createDocumentFragment();

    customers.forEach((customer, index) => {
        const customerId = customer._id || customer.id;
        const row = document.createElement('tr');
        row.dataset.id = customerId; // Preserve data-id for external selection/filtering

        // Column 1: Index (#)
        const indexCell = document.createElement('td');
        indexCell.textContent = String(index + 1);

        // Column 2: Name
        const nameCell = document.createElement('td');
        nameCell.textContent = customer.name || '-';

        // Column 3: Email
        const emailCell = document.createElement('td');
        emailCell.textContent = customer.email || '-';

        // Column 4: Phone
        const phoneCell = document.createElement('td');
        phoneCell.textContent = customer.phone || '-';

        // Column 5: Last Order
        const lastOrderCell = document.createElement('td');
        lastOrderCell.textContent = customer.lastOrder || '-';

        // Column 6: Actions (Eye + Cart icons)
        const actionsCell = document.createElement('td');

        // Action Button 1: View Details (Eye Icon)
        const viewDetailsBtn = document.createElement('button');
        viewDetailsBtn.className = 'action-btn';
        viewDetailsBtn.title = 'عرض التفاصيل';
        viewDetailsBtn.dataset.action = 'view-details';
        viewDetailsBtn.dataset.customerId = customerId;

        const eyeIcon = document.createElement('i');
        eyeIcon.className = 'fas fa-eye';
        eyeIcon.setAttribute('aria-hidden', 'true');

        viewDetailsBtn.appendChild(eyeIcon);

        // Action Button 2: View Orders (Cart Icon)
        const viewOrdersBtn = document.createElement('button');
        viewOrdersBtn.className = 'action-btn';
        viewOrdersBtn.title = 'عرض الطلبات';
        viewOrdersBtn.dataset.action = 'view-orders';
        viewOrdersBtn.dataset.customerId = customerId;

        const cartIcon = document.createElement('i');
        cartIcon.className = 'fas fa-shopping-cart';
        cartIcon.setAttribute('aria-hidden', 'true');

        viewOrdersBtn.appendChild(cartIcon);

        // Append action buttons to actions cell
        actionsCell.appendChild(viewDetailsBtn);
        actionsCell.appendChild(viewOrdersBtn);

        // Append all cells to row
        row.appendChild(indexCell);
        row.appendChild(nameCell);
        row.appendChild(emailCell);
        row.appendChild(phoneCell);
        row.appendChild(lastOrderCell);
        row.appendChild(actionsCell);

        // Append row to fragment (not yet in DOM)
        fragment.appendChild(row);
    });

    // ===== BATCH DOM INSERTION =====
    body.appendChild(fragment);

    // ===== EVENT DELEGATION: ATTACH LISTENERS =====
    attachCustomersTableEventListeners();
}

/**
 * Event delegation handler for customer table actions
 * Attached once to tbody, handles all button clicks
 * Ensures compatibility with dynamic content and prevents zombie listeners
 */
function attachCustomersTableEventListeners() {
    const body = document.getElementById('customersTableBody');
    if (!body) return;

    // Remove old listener (if exists) to prevent duplicate handlers
    const oldListener = body.__customersTableListener;
    if (oldListener) {
        body.removeEventListener('click', oldListener);
    }

    // New event handler
    const clickHandler = (event) => {
        const btn = event.target.closest('button[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const customerId = btn.dataset.customerId;

        if (!customerId) {
            console.warn('⚠️ Missing customerId in action button');
            return;
        }

        // Execute appropriate action
        if (action === 'view-details') {
            viewCustomerDetails(customerId);
        } else if (action === 'view-orders') {
            viewCustomerOrders(customerId);
        }
    };

    // Attach listener and cache it for removal later
    body.addEventListener('click', clickHandler);
    body.__customersTableListener = clickHandler;
}

function renderTopProducts() {
    const analyticsData = calculateAnalyticsData();
    renderTopProductsTable(analyticsData.topProducts || []);
}

function renderAnalyticsFilters() {
    const select = document.getElementById('analyticsTimeFilter');
    if (!select) return;

    select.innerHTML = mockData.analyticsRangeOptions.map(option => `
            <option value="${option.value}" ${state.filters.analyticsRange === option.value ? 'selected' : ''}>${option.label}</option>
        `).join('');
}

function renderAuditLogs() {
    const tableBody = document.getElementById('auditLogsTableBody');
    if (!tableBody) return;

    const actionFilter = state.filters.auditAction !== 'all'
        ? item => item.action === state.filters.auditAction
        : () => true;

    const dateFilter = state.filters.auditDate
        ? item => item.createdAt.startsWith(state.filters.auditDate)
        : () => true;

    const searchFilter = filterBySearch(state.filters.auditSearch, ['user', 'message']);

    const filtered = applyFilters(mockData.auditLogs, [actionFilter, dateFilter, searchFilter]);

    tableBody.innerHTML = filtered.map(log => `
            <tr>
                <td>${log.createdAt}</td>
                <td>${log.user}</td>
                <td>${getStatusBadge(log.action)}</td>
                <td>${log.message}</td>
                <td>${log.ip}</td>
            </tr>
        `).join('');
}

async function handleChangePasswordSubmit(event) {
    event.preventDefault();

    if (!window.adminAuth?.getUser) {
        showToast('error', 'تغيير كلمة المرور', 'حدثت مشكلة في المصادقة. يرجى إعادة تسجيل الدخول.');
        return;
    }

    const form = event.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');
    const currentPasswordInput = form.querySelector('#currentPassword');
    const newPasswordInput = form.querySelector('#newPassword');
    const confirmPasswordInput = form.querySelector('#confirmPassword');

    const currentPassword = currentPasswordInput?.value?.trim();
    const newPassword = newPasswordInput?.value?.trim();
    const confirmPassword = confirmPasswordInput?.value?.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('error', 'تغيير كلمة المرور', 'يرجى ملء جميع الحقول المطلوبة.');
        return;
    }

    if (newPassword.length < 8) {
        showToast('error', 'تغيير كلمة المرور', 'كلمة المرور الجديدة يجب أن لا تقل عن 8 أحرف.');
        newPasswordInput?.focus();
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('error', 'تغيير كلمة المرور', 'تأكيد كلمة المرور لا يطابق الكلمة الجديدة.');
        confirmPasswordInput?.focus();
        return;
    }

    let userId = await resolveCurrentAdminId();

    if (!userId) {
        userId = await resolveCurrentAdminId(true);
    }

    if (!userId) {
        showToast('error', 'تغيير كلمة المرور', 'تعذر تحديد حساب المدير. يرجى إعادة تسجيل الدخول.');
        return;
    }

    const setLoading = (loading) => {
        if (!submitBtn) return;
        submitBtn.disabled = loading;
        submitBtn.classList.toggle('is-loading', loading);
    };

    setLoading(true);

    try {
        const response = await authorizedFetch(`${USERS_ENDPOINT}/${encodeURIComponent(userId)}/change-password`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentPassword,
                newPassword,
                passwordConfirm: confirmPassword
            })
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const message = errorBody?.message || errorBody?.msg || `HTTP ${response.status}`;
            throw new Error(message);
        }

        showToast('success', 'تغيير كلمة المرور', 'تم تحديث كلمة المرور بنجاح.');
        form.reset();
    } catch (error) {
        console.error('❌ Failed to change password:', error);
        const message = error?.message || 'حدث خطأ أثناء تغيير كلمة المرور.';
        showToast('error', 'تغيير كلمة المرور', message);
    } finally {
        setLoading(false);
    }
}

async function changeOrderStatus(orderId, nextStatus, triggerElement = null) {
    if (!orderId || !nextStatus) {
        return;
    }

    const normalizedStatus = normalizeStatusKey(nextStatus);
    if (!normalizedStatus || !ORDER_STATUS_FLOW.includes(normalizedStatus)) {
        showToast('error', 'تحديث حالة الطلب', 'الحالة الجديدة غير مدعومة.');
        return;
    }

    const targetOrder = getOrderById(orderId);
    if (!targetOrder) {
        showToast('error', 'تحديث حالة الطلب', 'تعذر العثور على الطلب المحدد.');
        return;
    }

    const currentStatus = normalizeStatusKey(targetOrder.status) || 'new';
    if (currentStatus === normalizedStatus) {
        if (triggerElement && triggerElement.tagName === 'SELECT') {
            triggerElement.value = normalizedStatus;
        }
        showToast('info', 'تحديث حالة الطلب', 'الحالة المختارة هي نفس الحالة الحالية.');
        return;
    }

    const previousValue = triggerElement && triggerElement.tagName === 'SELECT'
        ? triggerElement.value
        : null;

    if (triggerElement) {
        triggerElement.disabled = true;
        triggerElement.dataset.loading = 'true';
    }

    showToast('info', 'تحديث حالة الطلب', 'جاري تحديث حالة الطلب، يرجى الانتظار...');

    try {
        const response = await authorizedFetch(`${ORDER_ENDPOINT}/${encodeURIComponent(orderId)}/status/${encodeURIComponent(normalizedStatus)}`, {
            method: 'PATCH'
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody?.message || `HTTP ${response.status}`);
        }

        const result = await response.json().catch(() => null);


        const orderIndex = state.orders.findIndex(o => String(o.id) === String(orderId));
        if (orderIndex !== -1) {
            state.orders[orderIndex].status = normalizedStatus;
            state.orders[orderIndex].isDelivered = normalizedStatus === 'delivered';
            state.orders[orderIndex].isCanceled = normalizedStatus === 'cancelled';
        }

        renderOrders();
        updateOverviewStats();
        if (state.customers?.length) {
            updateCustomersOrdersInfo();
        }

        showToast('success', 'تحديث حالة الطلب', `تم تحديث حالة الطلب ${orderId} بنجاح إلى "${getStatusLabel(normalizedStatus)}"`);;
    } catch (error) {
        console.error('❌ Failed to change order status:', error);
        showToast('error', 'تحديث حالة الطلب', error.message || 'حدث خطأ أثناء تحديث حالة الطلب.');
        if (triggerElement && triggerElement.tagName === 'SELECT') {
            triggerElement.value = currentStatus;
        }
    }
    finally {
        if (triggerElement) {
            triggerElement.disabled = false;
            delete triggerElement.dataset.loading;
        }
    }
}

function renderUsers(users = []) {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    safeHTML(tableBody, users.map(user => `
            <tr data-id="${user.id}">
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${getRoleBadge(user.role)}</td>
                <td>${getStatusBadge(user.status)}</td>
                <td>${user.lastActive}</td>
                <td>
                    <button class="action-btn" data-open-modal="userModal" data-modal-mode="edit" data-entity="user" data-entity-id="${user.id}"><i class="fas fa-edit"></i></button>
                    <button class="action-btn" data-action="permissions" data-entity="user" data-entity-id="${user.id}"><i class="fas fa-key"></i></button>
                </td>
            </tr>
        `).join(''));
}

// ===== Brand Functions =====
async function hydrateBrandOptions() {
    const select = document.getElementById('productBrand');
    if (!select) return;

    try {
        // جلب العلامات التجارية إذا لم تكن محملة
        if (!state.brands || state.brands.length === 0) {
            await fetchBrands();
        }

        // حفظ القيمة المحددة حالياً
        const currentValue = select.value;

        // مسح الخيارات الحالية
        select.innerHTML = '';

        // إضافة الخيار الافتراضي
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'اختر العلامة التجارية';
        select.appendChild(defaultOption);

        // إضافة العلامات التجارية المتاحة
        if (state.brands && state.brands.length > 0) {
            state.brands.forEach(brand => {
                const option = document.createElement('option');
                option.value = brand._id || brand.id;
                option.textContent = brand.name;
                select.appendChild(option);
            });

            // استعادة القيمة المحددة إذا كانت لا تزال صالحة
            if (currentValue && state.brands.some(b => (b._id || b.id) === currentValue)) {
                select.value = currentValue;
            }
        }
    } catch (error) {
        console.error('❌ Failed to populate brand options:', error);
    }
}

// ===== Subcategory Functions =====
function populateSubcategoryOptions(categoryId) {
    const subcategorySelect = document.getElementById('productSubcategory');
    if (!subcategorySelect) return;



    // حفظ القيمة المحددة حالياً
    const currentValue = subcategorySelect.value;

    // مسح الخيارات الحالية
    subcategorySelect.innerHTML = '';

    // إضافة الخيار الافتراضي
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'اختر الفئة الفرعية';
    subcategorySelect.appendChild(defaultOption);

    if (!categoryId) {
        subcategorySelect.disabled = true;
        return;
    }

    // تفعيل حقل الفئة الفرعية
    subcategorySelect.disabled = false;



    // الحصول على الفئات الفرعية
    const categorySubcategories = [];

    // البحث في state.subcategories
    if (state.subcategories && state.subcategories[categoryId]) {
        categorySubcategories.push(...state.subcategories[categoryId]);

    }

    // البحث في كائن الفئة
    if (state.categories) {
        const category = state.categories.find(cat => cat.id === categoryId);
        if (category && category.subcategories) {
            categorySubcategories.push(...category.subcategories);

        }
    }

    // إزالة التكرارات
    const uniqueSubcategories = Array.from(new Map(categorySubcategories.map(item => [item.id, item])).values());


    if (uniqueSubcategories.length === 0) {
        const noOption = document.createElement('option');
        noOption.value = '';
        noOption.textContent = 'لا توجد فئات فرعية متاحة';
        noOption.disabled = true;
        subcategorySelect.appendChild(noOption);
        subcategorySelect.disabled = true;
    } else {
        uniqueSubcategories.forEach(subcategory => {
            const option = document.createElement('option');
            option.value = subcategory.id;
            option.textContent = subcategory.name;
            subcategorySelect.appendChild(option);
        });

        // استعادة القيمة المحددة إذا كانت لا تزال صالحة
        if (currentValue && uniqueSubcategories.some(s => s.id === currentValue)) {
            subcategorySelect.value = currentValue;
        }
    }
}

function hydrateSubcategoryCategoryOptions() {
    const categories = state.categories;
    const filterSelect = document.getElementById('subcategoryCategoryFilter');
    const formSelect = document.getElementById('subcategoryCategory');

    const optionsMarkup = categories.map(category => `<option value="${category.id}">${category.name}</option>`).join('');
    const availableIds = new Set(categories.map(category => category.id));

    if (filterSelect) {
        const currentFilter = state.filters.subcategoryCategory;
        filterSelect.innerHTML = `<option value="all">جميع الفئات</option>${optionsMarkup}`;
        if (currentFilter && currentFilter !== 'all' && availableIds.has(currentFilter)) {
            filterSelect.value = currentFilter;
        } else {
            filterSelect.value = 'all';
            state.filters.subcategoryCategory = 'all';
        }
    }

    if (formSelect) {
        const previousValue = formSelect.value;
        formSelect.innerHTML = `<option value="">اختر الفئة الرئيسية</option>${optionsMarkup}`;

        const filteredSelection = state.filters.subcategoryCategory !== 'all'
            ? state.filters.subcategoryCategory
            : '';

        const preferredValue = previousValue && availableIds.has(previousValue)
            ? previousValue
            : (filteredSelection && availableIds.has(filteredSelection)
                ? filteredSelection
                : categories[0]?.id || '');

        formSelect.value = preferredValue;
    }
}

function hydrateFilters() {
    const productCategoryFilter = document.getElementById('productCategoryFilter');
    if (productCategoryFilter) {
        // استخدام جميع الفئات من state.categories
        const categories = state.categories || [];

        const categoryOptions = [
            { value: 'all', label: 'كل الفئات' },
            ...categories.map(cat => ({
                value: cat._id || cat.id || cat.slug,
                label: cat.name
            }))
        ];

        productCategoryFilter.innerHTML = categoryOptions.map(option => `
                <option value="${option.value}">${option.label}</option>
            `).join('');

        const hasSelectedCategory = categoryOptions.some(option => option.value === state.filters.productCategory);
        productCategoryFilter.value = hasSelectedCategory ? state.filters.productCategory : 'all';
        state.filters.productCategory = productCategoryFilter.value;
    }

    const categorySearchInput = document.getElementById('categorySearch');
    if (categorySearchInput) {
        categorySearchInput.value = state.filters.categorySearch;
        categorySearchInput.addEventListener('input', event => {
            state.filters.categorySearch = event.target.value;
            renderCategories();
        });
    }

    const subcategorySearchInput = document.getElementById('subcategorySearch');
    if (subcategorySearchInput) {
        subcategorySearchInput.value = state.filters.subcategorySearch;
        subcategorySearchInput.addEventListener('input', event => {
            state.filters.subcategorySearch = event.target.value;
            renderSubcategories();
        });
    }

    const subcategoryCategoryFilter = document.getElementById('subcategoryCategoryFilter');
    if (subcategoryCategoryFilter) {
        subcategoryCategoryFilter.value = state.filters.subcategoryCategory || 'all';
        subcategoryCategoryFilter.addEventListener('change', event => {
            state.filters.subcategoryCategory = event.target.value || 'all';
            renderSubcategories(event.target.value || 'all');
        });
    }

    const customerOrdersFilter = document.getElementById('customerOrdersFilter');
    if (customerOrdersFilter) {
        customerOrdersFilter.value = state.filters.customerOrdersFilter || 'all';
    }

    const orderStatusFilter = document.getElementById('orderStatusFilter');
    if (orderStatusFilter) {
        const statusOptions = [`<option value="all">كل الحالات</option>`, ...getOrderStatusOptions().map(option => `
                <option value="${option.value}">${option.label}</option>
            `)];
        orderStatusFilter.innerHTML = statusOptions.join('');
        orderStatusFilter.value = state.filters.orderStatus || 'all';
    }

    const customerSegmentFilter = document.getElementById('customerSegmentFilter');
    if (customerSegmentFilter) {
        const segments = [...new Set(mockData.customers.map(c => c.segment))];
        customerSegmentFilter.innerHTML = `
                <option value="all">كل الشرائح</option>
                ${segments.map(segment => `<option value="${segment}">${getCustomerSegmentLabel(segment)
            }</option>`).join('')}
            `;
    }

    const auditActionFilter = document.getElementById('auditActionFilter');
    if (auditActionFilter) {
        auditActionFilter.innerHTML = `
                <option value="all">كل الإجراءات</option>
                <option value="create">إضافة</option>
                <option value="update">تعديل</option>
                <option value="delete">حذف</option>
                <option value="login">تسجيل الدخول</option>
            `;
    }
}

function setupProductFilters() {
    const productSearchInput = document.getElementById('productSearchInput');
    if (productSearchInput) {
        productSearchInput.value = state.filters.productSearch;
        productSearchInput.addEventListener('input', event => {
            state.filters.productSearch = event.target.value;
            renderProducts();
        });
    }

    const productCategoryFilter = document.getElementById('productCategoryFilter');
    if (productCategoryFilter) {
        productCategoryFilter.addEventListener('change', event => {
            state.filters.productCategory = event.target.value;
            renderProducts();
        });
    }

    const productStatusFilter = document.getElementById('productStatusFilter');
    if (productStatusFilter) {
        productStatusFilter.addEventListener('change', event => {
            state.filters.productStatus = event.target.value;
            renderProducts();
        });
    }
}

function setupCustomerFilters() {
    const filtersBar = document.querySelector('#customers .filters-bar');
    if (!filtersBar) return;

    let ordersFilterSelect = document.getElementById('customerOrdersFilter');
    if (!ordersFilterSelect) {
        ordersFilterSelect = document.createElement('select');
        ordersFilterSelect.id = 'customerOrdersFilter';
        ordersFilterSelect.className = 'filter-select';
        ordersFilterSelect.innerHTML = `
                <option value="all">كل العملاء </option>
                <option value="withOrders">عملاء لديهم طلبات فقط</option>
            `;
        filtersBar.appendChild(ordersFilterSelect);
    }

    ordersFilterSelect.value = state.filters.customerOrdersFilter || 'all';

    if (!ordersFilterSelect.dataset.bound) {
        ordersFilterSelect.addEventListener('change', (event) => {
            state.filters.customerOrdersFilter = event.target.value;
            renderCustomers();
            if (state.currentSection === 'overview') {
                updateOverviewStats();
            }
        });
        ordersFilterSelect.dataset.bound = 'true';
    }
}

function renderDashboard() {
    updateOverviewStats();
    renderProducts();
    renderCategories();
    renderSubcategories();
    renderCollections();
    renderPromotions();
    renderBanners();
    renderOrders();
    renderCustomers();
    renderTopProducts();
    renderAnalyticsFilters();
    renderAuditLogs();
    renderUsers();
    renderShippingSettings();
}

function setupModalCancels(root = document) {
    const closeButtons = root.querySelectorAll('[data-close-modal]');
    closeButtons.forEach(button => {
        if (button.dataset.closeBound) return;
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            const form = button.closest('form');
            if (form) {
                form.reset();
            }
            if (modal?.id) {
                closeModal(modal.id);
            }
        });
        button.dataset.closeBound = 'true';
    });
}

// ===== Theme Toggle =====
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.toggle('dark-mode', savedTheme === 'dark');
    updateThemeIcon();
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    updateThemeIcon();
    showToast('success', 'تم تغيير الوضع', `تم التبديل إلى الوضع ${theme === 'dark' ? 'الداكن' : 'الفاتح'}`);
}

function updateThemeIcon() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            if (document.body.classList.contains('dark-mode')) {
                icon.className = 'fas fa-sun';
            } else {
                icon.className = 'fas fa-moon';
            }
        }
    }
}

// ===== Navigation =====
// تفعيل القسم المطلوب في التنقل الجانبي وإعداد الرسوم البيانية عند الحاجة
function switchSection(targetSection) {

    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');

    if (sidebar && sidebarOverlay && window.innerWidth <= 992) {
        sidebar.classList.remove('mobile-active');
        sidebarOverlay.hidden = true;
        sidebarOverlay.style.opacity = '0';
        document.body.classList.remove('sidebar-open');
        if (mobileMenuBtn) {
            mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
        }
    }

    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');

    navItems.forEach(item => item.classList.remove('active'));
    contentSections.forEach(section => section.classList.remove('active'));

    const clickedNav = document.querySelector(`[data-section="${targetSection}"]`);
    if (clickedNav) {
        clickedNav.classList.add('active');
    }

    const targetSectionEl = document.getElementById(targetSection);
    if (targetSectionEl) {
        targetSectionEl.classList.add('active');

        // ===== LAZY LOAD SECTION DATA =====
        // Load section content only when accessed
        loadSectionData(targetSection).catch(error => {
            console.error(`❌ Failed to load section ${targetSection}:`, error);
            showToast('error', 'خطأ', `حدث خطأ عند تحميل قسم ${targetSection}`);
        });

        // تحميل الرسوم البيانية بشكل lazy عند الحاجة
        if (targetSection === 'overview') {
            // تحميل الرسومات
            if (!chartsLoaded.overview) {
                setTimeout(() => {
                    loadOverviewCharts();
                    chartsLoaded.overview = true;
                }, 100);
            }
        } else if (targetSection === 'analytics') {
            if (!state.filters) state.filters = {};

            // ضبط القيمة الافتراضية للفلتر إذا لم تكن موجودة
            if (!state.filters.analyticsDays) {
                const select = document.getElementById('analyticsTimeFilter');
                const defaultValue = select ? parseInt(select.value) : 30;
                state.filters.analyticsDays = defaultValue || 30;
            }

            // تحميل الرسومات عند الحاجة
            if (!chartsLoaded.analytics) {
                setTimeout(() => {
                    loadAnalyticsCharts();
                    chartsLoaded.analytics = true;
                }, 100);
            } else {
                // تحديث فوري عند العودة للقسم
                loadAnalyticsCharts();
            }
        }
    }

    saveCurrentSection(targetSection);
}

// ===== LAZY LOADING FUNCTIONS =====
/**
 * Centralized lazy loading function for all dashboard sections
 * Loads section data ONLY when accessed, preventing initial load overhead
 * Prevents duplicate loading with state flags
 * 
 * @param {string} sectionKey - The section to load (overview, products, customers, etc.)
 * @returns {Promise<void>}
 */
async function loadSectionData(sectionKey) {
    // Skip if already loaded and not refreshing
    if (state.sectionLoaded[sectionKey]) {
        return;
    }

    // Skip if currently loading (prevent duplicate requests)
    if (state.sectionLoading[sectionKey]) {
        return;
    }

    // Mark section as loading to prevent concurrent requests
    state.sectionLoading[sectionKey] = true;

    try {
        switch (sectionKey) {
            case 'overview':
                // Overview requires categories and orders to be loaded
                if (!state.sectionLoaded.overview) {
                    if (!state.categories.length) await fetchCategories();
                    if (!state.orders.length) await fetchOrders();
                }
                updateOverviewStats();
                break;

            case 'products':
                // Load products if not already loaded
                if (!state.products.length && !state.productsLoading) {
                    await fetchProducts();
                }
                renderProducts();
                break;

            case 'categories':
                // Load categories if not already loaded
                if (!state.categories.length && !state.categoriesLoading) {
                    await fetchCategories();
                }
                renderCategories();
                break;

            case 'subcategories':
                // Load subcategories for the selected category
                const selectedCategoryId = state.filters?.subcategoryCategory;
                if (!state.subcategoriesLoading[selectedCategoryId] && !state.subcategories[selectedCategoryId]) {
                    if (selectedCategoryId && selectedCategoryId !== 'all') {
                        await fetchSubcategories(selectedCategoryId, { force: true });
                    } else {
                        // Load all if no category selected
                        await fetchSubcategories();
                    }
                }
                renderSubcategories();
                break;

            case 'brands':
                // Load brands if not already loaded
                if (!state.brands.length && !state.brandsLoading) {
                    await fetchBrands({ force: true });
                }
                renderBrands();
                break;

            case 'orders':
                // Load orders if not already loaded
                if (!state.orders.length && !state.ordersLoading) {
                    await fetchOrders();
                }
                renderOrders();
                break;

            case 'customers':
                // Load customers if not already loaded
                if (!state.customers.length && !state.customersLoading) {
                    await fetchCustomers();
                }
                renderCustomers();
                break;

            case 'cms':
                // Load messages when CMS section is opened
                if (!state.messagesLoaded && !state.messagesLoading) {
                    await fetchMessages({ force: true });
                }
                renderMessages();
                break;

            case 'payments':
                // Load payment methods
                await renderPaymentMethods();
                break;

            case 'analytics':
                // Load analytics data and charts
                if (!state.sectionLoaded.analytics) {
                    // Analytics charts are loaded in switchSection via chartsLoaded flags
                    renderAnalyticsFilters();
                }
                break;

            case 'collections':
                // Load and render collections
                renderCollections();
                break;

            case 'promotions':
                // Load and render promotions
                renderPromotions();
                break;

            case 'settings':
                // Load settings if hydration function exists
                if (typeof hydrateSettingsForms === 'function') {
                    hydrateSettingsForms();
                }
                break;

            case 'users':
                // Users are rendered in renderDashboard
                // Additional loading can be added here if needed
                break;

            default:
                console.warn(`⚠️ Unknown section: ${sectionKey}`);
        }

        // Mark section as successfully loaded
        state.sectionLoaded[sectionKey] = true;
    } catch (error) {
        console.error(`❌ Error loading section ${sectionKey}:`, error);
        // Don't mark as loaded on error - allow retry
    } finally {
        // Clear loading flag
        state.sectionLoading[sectionKey] = false;
    }
}

function refreshSectionData(sectionKey) {
    switch (sectionKey) {
        case 'overview':
            updateOverviewStats();
            break;
        case 'products':
            fetchProducts();
            break;
        case 'categories':
            fetchCategories();
            break;
        case 'subcategories':
            if (state.filters?.subcategoryCategory) {
                fetchSubcategories(state.filters.subcategoryCategory, { force: true });
            } else {
                fetchSubcategories();
            }
            break;
        case 'brands':
            fetchBrands({ force: true }).then(() => renderBrands()).catch(console.error);
            break;
        case 'orders':
            fetchOrders();
            break;
        case 'customers':
            fetchCustomers();
            break;
        case 'cms':
            fetchMessages({ force: true }).catch(console.error);
            break;
        case 'payments':
            renderPaymentMethods();
            break;
        case 'analytics':
            loadAnalyticsCharts();
            break;
        case 'settings':
            if (typeof hydrateSettingsForms === 'function') {
                hydrateSettingsForms();
            }
            break;
        default:
            break;
    }
}

// ===== Modals =====
function openModal(modalId, mode = 'create', entity = null) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add('active');

    const form = modal.querySelector('form');
    if (form) {
        form.dataset.mode = mode;
        form.reset();
    }

    if (entity) {
        populateModal(modalId, entity, mode);
    }

    const title = modal.querySelector('[data-modal-title]');
    if (title) {
        if (!title.dataset.defaultTitle) {
            title.dataset.defaultTitle = title.textContent.trim();
        }
        const defaultTitle = title.dataset.defaultTitle;
        const editTitle = title.getAttribute('data-modal-edit-title') || defaultTitle;
        title.textContent = mode === 'edit' ? editTitle : defaultTitle;
    }

    if (modalId === 'brandModal' && mode === 'create') {
        prepareBrandCreateForm();
    }

    initDescriptionInputs(modal);
    refreshDescriptionCounters(modal);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.classList.remove('active'));
}

// ===== Toast Notifications =====
function showToast(type, title, message) {


    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
            <i class="fas ${iconMap[type]}"></i>
            <div class="toast-content">
                <h4>${title}</h4>
                <p>${message}</p>
            </div>
        `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-100px)';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

/**
 * عرض نافذة منبثقة مخصصة
 * @param {string} title - عنوان النافذة
 * @param {string} message - محتوى الرسالة
 * @param {string} type - نوع الرسالة: "success" | "error" | "warning" | "info"
 */
function showPopup(title, message, type = 'info') {
    const modal = document.getElementById('customPopupModal');
    const headerEl = document.getElementById('popupTitle');
    const messageEl = document.getElementById('popupMessage');
    const iconEl = document.getElementById('popupIcon');
    const footer = document.getElementById('popupFooter');
    const overlay = document.getElementById('popupOverlay');
    const closeBtn = document.getElementById('popupCloseBtn');

    if (!modal || !headerEl || !messageEl || !iconEl) return;

    // Remove any existing confirm buttons
    footer.innerHTML = '';

    // Set content
    headerEl.textContent = title;
    messageEl.textContent = message;

    // Set icon based on type
    const iconMap = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    iconEl.className = `popup-icon ${type}`;
    iconEl.innerHTML = `<i class="${iconMap[type]}"></i>`;

    // Add dismiss button
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn-secondary popup-btn-dismiss';
    dismissBtn.textContent = 'حسناً';
    dismissBtn.addEventListener('click', closePopup);
    footer.appendChild(dismissBtn);

    // Show modal
    modal.classList.add('active');

    // Close handlers
    const closeHandler = () => closePopup();
    overlay.addEventListener('click', closeHandler);
    closeBtn.addEventListener('click', closeHandler);
}

/**
 * عرض نافذة تأكيد (Confirm Dialog)
 * @param {string} title - عنوان النافذة
 * @param {string} message - محتوى الرسالة
 * @param {function} onConfirm - الدالة المنفذة عند التأكيد
 * @param {function} onCancel - الدالة المنفذة عند الإلغاء (اختياري)
 * @param {string} confirmText - نص زر التأكيد (افتراضي: "تأكيد")
 * @param {string} cancelText - نص زر الإلغاء (افتراضي: "إلغاء")
 */
function confirmPopup(title, message, onConfirm, onCancel = null, confirmText = 'تأكيد', cancelText = 'إلغاء') {
    const modal = document.getElementById('customPopupModal');
    const headerEl = document.getElementById('popupTitle');
    const messageEl = document.getElementById('popupMessage');
    const iconEl = document.getElementById('popupIcon');
    const footer = document.getElementById('popupFooter');
    const overlay = document.getElementById('popupOverlay');
    const closeBtn = document.getElementById('popupCloseBtn');

    if (!modal || !headerEl || !messageEl || !iconEl) return;

    // Remove any existing handlers
    footer.innerHTML = '';

    // Set content
    headerEl.textContent = title;
    messageEl.textContent = message;

    // Set warning icon for confirmations
    iconEl.className = 'popup-icon warning';
    iconEl.innerHTML = '<i class="fas fa-question-circle"></i>';

    // Create buttons
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary popup-btn-cancel';
    cancelBtn.textContent = cancelText;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-primary popup-btn-confirm';
    confirmBtn.textContent = confirmText;

    // Handle confirm
    const handleConfirm = () => {
        closePopup();
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
    };

    // Handle cancel
    const handleCancel = () => {
        closePopup();
        if (typeof onCancel === 'function') {
            onCancel();
        }
    };

    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    // Show modal
    modal.classList.add('active');

    // Close handlers
    const closeHandler = handleCancel;
    overlay.addEventListener('click', closeHandler);
    closeBtn.addEventListener('click', closeHandler);
}

/**
 * إغلاق النافذة المنبثقة
 */
function closePopup() {
    const modal = document.getElementById('customPopupModal');
    if (modal) {
        modal.classList.remove('active');
        // Remove event listeners by clearing and resetting footer
        const footer = document.getElementById('popupFooter');
        if (footer) {
            footer.innerHTML = '';
        }
    }
}

// ===== Charts =====
function createChartInstance(scope, key, canvas, config) {
    if (!canvas) return null;
    const store = chartInstances[scope];
    if (store && store[key]) {
        store[key].destroy();
    }
    const chart = new Chart(canvas, config);
    if (store) {
        store[key] = chart;
    }
    return chart;
}

/**
 * حساب المبيعات الشهرية لآخر 6 أشهر
 */
function calculateMonthlySales() {
    const orders = state.orders || [];
    const months = [];
    const sales = [];

    const rangeStart = parseDateValue(state.filters?.analyticsStart);
    const rangeEnd = parseDateValue(state.filters?.analyticsEnd);
    const hasCustomRange = rangeStart && rangeEnd;

    if (hasCustomRange) {
        const startMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
        const endMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
        let current = new Date(startMonth);
        let safetyCounter = 0;
        while (current <= endMonth && safetyCounter < 36) {
            const monthName = current.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
            months.push(monthName);
            const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
            const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);
            const monthSales = orders
                .filter(order => {
                    const orderDate = getOrderDate(order);
                    return orderDate && orderDate >= monthStart && orderDate <= monthEnd && order.status !== 'cancelled';
                })
                .reduce((sum, order) => sum + (Number(order.total) || 0), 0);
            sales.push(monthSales);
            current.setMonth(current.getMonth() + 1);
            safetyCounter++;
        }
    } else {
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = date.toLocaleDateString('ar-EG', { month: 'long' });
            months.push(monthName);
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
            const monthSales = orders
                .filter(order => {
                    const orderDate = getOrderDate(order);
                    return orderDate && orderDate >= monthStart && orderDate <= monthEnd && order.status !== 'cancelled';
                })
                .reduce((sum, order) => sum + (Number(order.total) || 0), 0);
            sales.push(monthSales);
        }
    }


    return { labels: months, values: sales };
}

/**
 * حساب أفضل 5 منتجات مبيعاً
 */
function calculateTopProducts() {
    const orders = state.orders || [];
    const productSales = {};

    // جمع مبيعات كل منتج
    orders.forEach(order => {
        if (order.status === 'cancelled') return;

        const items = order.itemsDetails || order.cartItems || [];
        items.forEach(item => {
            const productName = item.name || item.product?.name || 'منتج غير معروف';
            const quantity = item.quantity || item.qty || 0;

            if (!productSales[productName]) {
                productSales[productName] = 0;
            }
            productSales[productName] += quantity;
        });
    });

    // ترتيب المنتجات حسب المبيعات
    const sorted = Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    if (sorted.length === 0) {
        return {
            labels: ['لا توجد مبيعات'],
            values: [1]
        };
    }

    return {
        labels: sorted.map(([name]) => name),
        values: sorted.map(([, count]) => count)
    };
}

function loadOverviewCharts() {

    // رسم المبيعات الشهرية
    const salesCtx = document.getElementById('salesChart');
    if (salesCtx) {
        const salesData = calculateMonthlySales();


        createChartInstance('overview', 'sales', salesCtx, {
            type: 'line',
            data: {
                labels: salesData.labels,
                datasets: [{
                    label: 'المبيعات',
                    data: salesData.values,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return value.toLocaleString() + ' ريال';
                            }
                        }
                    }
                }
            }
        });
    }

    // رسم أفضل المنتجات مبيعاً
    const productsCtx = document.getElementById('productsChart');
    if (productsCtx) {
        const topProductsData = calculateTopProducts();

        createChartInstance('overview', 'products', productsCtx, {
            type: 'doughnut',
            data: {
                labels: topProductsData.labels,
                datasets: [{
                    data: topProductsData.values,
                    backgroundColor: [
                        '#e74c3c',
                        '#3498db',
                        '#2ecc71',
                        '#f1c40f',
                        '#9b59b6',
                        '#1abc9c',
                        '#e67e22',
                        '#34495e',
                        '#16a085',
                        '#8e44ad'
                    ],
                    borderColor: [
                        '#e74c3c',
                        '#3498db',
                        '#2ecc71',
                        '#f1c40f',
                        '#9b59b6',
                        '#1abc9c',
                        '#e67e22',
                        '#34495e',
                        '#16a085',
                        '#8e44ad'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

/**
 * حساب بيانات التحليلات حسب الفلتر
 */
function calculateAnalyticsData() {
    const orders = state.orders || [];
    const rangeStart = parseDateValue(state.filters?.analyticsStart);
    const rangeEnd = parseDateValue(state.filters?.analyticsEnd);

    const hasCustomRange = rangeStart instanceof Date && !isNaN(rangeStart) && rangeEnd instanceof Date && !isNaN(rangeEnd);
    const startDate = hasCustomRange ? new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()) : null;
    const endDate = hasCustomRange ? new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate(), 23, 59, 59, 999) : null;

    const filteredOrders = orders.filter(order => {
        const orderDate = getOrderDate(order);
        if (!orderDate || order.status === 'cancelled') return false;

        if (hasCustomRange) {
            return orderDate >= startDate && orderDate <= endDate;
        }

        return true;
    });

    // 1. إجمالي الإيرادات
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);

    // 2. متوسط قيمة السلة
    const avgBasket = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;

    const ordersCount = filteredOrders.length;
    const totalItems = filteredOrders.reduce((sum, order) => sum + (Number(order.items) || Number(order.totalItems) || 0), 0);

    // 3. الإيرادات الشهرية (آخر 8 أشهر)
    const monthlyRevenue = [];
    const monthLabels = [];
    const monthsToInclude = 8;
    if (hasCustomRange) {
        const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        let current = new Date(startMonth);
        let safetyCounter = 0;
        while (current <= endMonth && safetyCounter < 36) {
            const monthName = current.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
            monthLabels.push(monthName);
            const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
            const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);
            const monthRevenue = filteredOrders
                .filter(order => {
                    const orderDate = getOrderDate(order);
                    return orderDate && orderDate >= monthStart && orderDate <= monthEnd;
                })
                .reduce((sum, order) => sum + (Number(order.total) || 0), 0);
            monthlyRevenue.push(monthRevenue);
            current.setMonth(current.getMonth() + 1);
            safetyCounter++;
        }
    } else {
        const now = new Date();
        for (let i = monthsToInclude - 1; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = monthDate.toLocaleDateString('ar-EG', { month: 'long' });
            monthLabels.push(monthName);
            const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
            const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
            const monthRevenue = filteredOrders
                .filter(order => {
                    const orderDate = getOrderDate(order);
                    return orderDate && orderDate >= monthStart && orderDate <= monthEnd;
                })
                .reduce((sum, order) => sum + (Number(order.total) || 0), 0);
            monthlyRevenue.push(monthRevenue);
        }
    }

    // 4. أكثر المنتجات مبيعاً
    const productStats = {};
    filteredOrders.forEach(order => {
        const items = order.itemsDetails || order.cartItems || [];
        items.forEach(item => {
            const productName = item.name || item.product?.name || 'منتج غير معروف';
            const quantity = Number(item.quantity || item.qty || 0);
            const price = Number(item.price || 0);
            const revenue = quantity * price;

            if (!productStats[productName]) {
                productStats[productName] = { quantity: 0, revenue: 0 };
            }
            productStats[productName].quantity += quantity;
            productStats[productName].revenue += revenue;
        });
    });

    const topProducts = Object.entries(productStats)
        .sort((a, b) => b[1].quantity - a[1].quantity)
        .slice(0, 10)
        .map(([name, stats]) => ({ name, ...stats }));

    return {
        totalRevenue,
        avgBasket,
        ordersCount,
        totalItems,
        monthlyRevenue: { labels: monthLabels, values: monthlyRevenue },
        topProducts
    };
}

/**
 * تحديث إحصائيات التحليلات
 */
function updateAnalyticsStats() {
    const data = calculateAnalyticsData();

    // تحديث الإحصائيات
    const revenueEl = document.getElementById('analyticsRevenue');
    const avgBasketEl = document.getElementById('analyticsAvgBasket');

    if (revenueEl) revenueEl.textContent = formatCurrency(data.totalRevenue);
    if (avgBasketEl) avgBasketEl.textContent = formatCurrency(data.avgBasket);

    // تحديث جدول المنتجات
    renderTopProductsTable(data.topProducts);


}

/**
 * عرض جدول أكثر المنتجات مبيعاً
 */
function renderTopProductsTable(products) {
    const tbody = document.getElementById('topProductsTableBody');
    if (!tbody) return;

    const filteredProducts = products.filter(product => Number(product.quantity) >= 5);

    if (filteredProducts.length === 0) {
        tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 20px; color: #95a5a6;">
                        لا توجد منتجات حققت 5 مبيعات أو أكثر في هذه الفترة
                    </td>
                </tr>
            `;
        return;
    }

    tbody.innerHTML = filteredProducts.map((product, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${product.name}</td>
                <td>${formatNumber(product.quantity)}</td>
                <td>${formatCurrency(product.revenue)}</td>
            </tr>
        `).join('');
}

// ... (rest of the code remains the same)
function loadAnalyticsCharts() {


    const data = calculateAnalyticsData();

    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
        createChartInstance('analytics', 'revenue', revenueCtx, {
            type: 'bar',
            data: {
                labels: data.monthlyRevenue.labels,
                datasets: [{
                    label: 'الإيرادات',
                    data: data.monthlyRevenue.values,
                    backgroundColor: '#e74c3c'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return value.toLocaleString() + ' ريال';
                            }
                        }
                    }
                }
            }
        });
    }

    // تحديث الإحصائيات
    updateAnalyticsStats();
}

// ===== Mobile Menu =====
function createMobileMenu() {
    if (window.innerWidth <= 992) {
        let menuBtn = document.getElementById('mobileMenuBtn');
        if (!menuBtn) {
            menuBtn = document.createElement('button');
            menuBtn.id = 'mobileMenuBtn';
            menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
            menuBtn.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: var(--primary);
                    color: white;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(231, 76, 60, 0.4);
                    z-index: 999;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
            document.body.appendChild(menuBtn);
        }
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.hidden = true;
            overlay.style.opacity = '0';
        }
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.remove('mobile-active');
        }
        document.body.classList.remove('sidebar-open');
    } else {
        const menuBtn = document.getElementById('mobileMenuBtn');
        if (menuBtn) {
            menuBtn.remove();
        }
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.remove('mobile-active');
        }
        document.body.classList.remove('sidebar-open');
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.hidden = true;
            overlay.style.opacity = '0';
        }
    }
}

function toggleSidebar(forceState = null) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuBtn = document.getElementById('mobileMenuBtn');

    if (!sidebar || !overlay) return;

    const isActive = sidebar.classList.contains('mobile-active');
    const targetState = forceState !== null ? Boolean(forceState) : !isActive;

    sidebar.classList.toggle('mobile-active', targetState);
    overlay.hidden = !targetState;
    overlay.style.opacity = targetState ? '1' : '0';
    document.body.classList.toggle('sidebar-open', targetState);

    if (menuBtn) {
        menuBtn.innerHTML = targetState
            ? '<i class="fas fa-times"></i>'
            : '<i class="fas fa-bars"></i>';
    }
}

// ===== Event Delegation =====
document.addEventListener('click', function (e) {
    // Theme Toggle
    if (e.target.closest('#themeToggle')) {
        e.preventDefault();
        toggleTheme();
        return;
    }

    // Navigation Items
    const navItem = e.target.closest('.nav-item');
    if (navItem) {
        e.preventDefault();
        const section = navItem.getAttribute('data-section');
        if (section) {
            switchSection(section);
        }
        return;
    }

    // Toggle sidebar (mobile FAB)
    if (e.target.closest('#mobileMenuBtn')) {
        e.preventDefault();
        toggleSidebar();
        return;
    }

    // Delete Subcategory
    const deleteSubcategoryBtn = e.target.closest('[data-action="delete-subcategory"]');
    if (deleteSubcategoryBtn) {
        e.preventDefault();
        const subcategoryId = deleteSubcategoryBtn.getAttribute('data-entity-id');
        const categoryId = deleteSubcategoryBtn.getAttribute('data-category-id')
            || state.filters.subcategoryCategory;

        if (!subcategoryId || !categoryId) {
            showToast('error', 'حذف الفئة الفرعية', 'تعذر تحديد الفئة الفرعية أو الفئة الأصلية.');
            return;
        }

        const subcategoryName = deleteSubcategoryBtn.getAttribute('data-entity-name')
            || getSubcategoryById(categoryId, subcategoryId)?.name
            || 'هذه الفئة الفرعية';

        confirmPopup('تأكيد حذف الفئة الفرعية', `هل أنت متأكد من حذف الفئة الفرعية "${subcategoryName}"؟`, () => {
            deleteSubcategory(categoryId, subcategoryId).catch(() => {
                // يتم التعامل مع رسائل الخطأ داخل deleteSubcategory بالفعل
            });
        }, null, 'حذف', 'إلغاء');
        return;
    }

    // Refresh Categories
    const refreshCategoriesBtn = e.target.closest('[data-action="refresh-categories"]');
    if (refreshCategoriesBtn) {
        e.preventDefault();
        fetchCategories();
        return;
    }

    // Modal Close Buttons
    if (e.target.closest('.modal-close')) {
        e.preventDefault();
        const modal = e.target.closest('.modal');
        if (modal) {
            modal.classList.remove('active');
        }
        return;
    }

    // Modal Overlays
    if (e.target.classList.contains('modal-overlay')) {
        e.preventDefault();
        const modal = e.target.closest('.modal');
        if (modal) {
            modal.classList.remove('active');
        }
        return;
    }

    // Generic Modal Triggers
    const modalTrigger = e.target.closest('[data-open-modal]');
    if (modalTrigger) {
        e.preventDefault();
        const modalId = modalTrigger.getAttribute('data-open-modal');
        const mode = modalTrigger.getAttribute('data-modal-mode') || 'create';
        const entity = modalTrigger.getAttribute('data-entity');
        const customerId = modalTrigger.getAttribute('data-customer-id');
        const entityId = modalTrigger.getAttribute('data-entity-id');
        const categoryIdAttr = modalTrigger.getAttribute('data-category-id');

        openModal(modalId, mode);

        if (modalId === 'categoryModal') {
            populateCategoryModal(mode === 'edit' ? entityId : null);
        } else if (modalId === 'addProductModal') {
            populateProductModal(mode === 'edit' ? entityId : null);
        } else if (modalId === 'subcategoryModal') {
            const contextCategoryId = categoryIdAttr
                || state.filters.subcategoryCategory
                || state.categories[0]?.id
                || '';
            populateSubcategoryModal(contextCategoryId, mode === 'edit' ? entityId : null);
        } else if (modalId === 'paymentSettingsModal' && entityId) {
            populatePaymentSettingsModal(entityId);
        } else if (modalId === 'bannerModal') {
            if (mode === 'edit' && entityId) {
                populateBannerModal(entityId);
            } else {
                prepareBannerCreateForm();
            }
        }

        if (entity) {
            const labels = {
                product: 'منتج',
                category: 'فئة',
                promotion: 'عرض ترويجي',
                coupon: 'قسيمة',
                banner: 'بانر',
                feature: 'ميزة',
                user: 'مستخدم',
                payment: 'طريقة دفع'
            };
            const actionLabel = mode === 'edit' ? `تعديل ${labels[entity] || 'عنصر'}` : `إضافة ${labels[entity] || 'عنصر'} جديد`;
            showToast('info', actionLabel, 'تم فتح النموذج بنجاح');
        }

        if (modalId === 'customerProfileModal' && customerId) {
            populateCustomerProfile(customerId);
            showToast('info', 'ملف العميل', 'تم عرض ملف العميل بنجاح');
        } else if (modalId === 'customerOrdersModal' && customerId) {
            populateCustomerOrders(customerId);
            showToast('info', 'طلبات العميل', 'تم تحميل طلبات العميل');
        }
        return;
    }

    // Export Buttons
    if (e.target.closest('#exportOrdersBtn')) {
        e.preventDefault();
        exportOrders();
        return;
    }

    if (e.target.closest('#exportCustomersBtn')) {
        e.preventDefault();
        exportCustomers();
        return;
    }

    if (e.target.closest('#exportReportBtn')) {
        e.preventDefault();
        exportAnalyticsReport();
        return;
    }

    if (e.target.closest('#exportAuditBtn')) {
        e.preventDefault();
        exportAuditLogs();
        return;
    }

    // View Order Details
    if (e.target.closest('.view-order')) {
        e.preventDefault();
        const btn = e.target.closest('.view-order');
        const orderIdAttr = btn?.getAttribute('data-order-id');
        const row = btn?.closest('tr');
        const fallbackId = row?.dataset.id || row?.querySelector('td:first-child')?.textContent;
        const orderId = normalizeOrderId(orderIdAttr || fallbackId);

        if (!orderId) {
            showToast('error', 'تفاصيل الطلب', 'تعذر تحديد رقم الطلب');
            return;
        }

        viewOrderDetails(orderId);
        showToast('info', 'تفاصيل الطلب', `عرض تفاصيل الطلب ${orderId}`);
        return;
    }

    // Print Order Invoice
    if (e.target.closest('.print-order')) {
        e.preventDefault();
        const btn = e.target.closest('.print-order');
        const orderIdAttr = btn?.getAttribute('data-order-id');
        const row = btn?.closest('tr');
        const fallbackId = row?.dataset.id || row?.querySelector('td:first-child')?.textContent;
        const orderId = normalizeOrderId(orderIdAttr || fallbackId);

        if (!orderId) {
            showToast('error', 'طباعة الفاتورة', 'تعذر تحديد رقم الطلب للطباعة');
            return;
        }

        printOrder(orderId);
        return;
    }

    // Delete Category
    const refreshBannersBtn = e.target.closest('[data-action="refresh-banners"]');
    if (refreshBannersBtn) {
        e.preventDefault();
        fetchBanners({ force: true }).then(renderBanners).catch(error => {
            console.error('❌ Failed to refresh banners:', error);
            showToast('error', 'تحديث البانرات', 'تعذر تحديث قائمة البانرات.');
        });
        return;
    }

    const deleteBannerBtn = e.target.closest('[data-action="delete-banner"]');
    if (deleteBannerBtn) {
        e.preventDefault();
        const bannerId = deleteBannerBtn.getAttribute('data-entity-id');
        if (!bannerId) {
            showToast('error', 'حذف البانر', 'تعذر تحديد البانر المطلوب حذفه');
            return;
        }

        confirmPopup('تأكيد حذف البانر', 'هل أنت متأكد من حذف هذا البانر؟', () => {
            deleteBanner(bannerId)
                .then(() => {
                    showToast('success', 'حذف البانر', 'تم حذف البانر بنجاح');
                    return fetchBanners({ force: true });
                })
                .catch(error => {
                    console.error('❌ Delete banner error:', error);
                    showToast('error', 'حذف البانر', error?.message || 'حدث خطأ أثناء حذف البانر');
                });
        }, null, 'حذف', 'إلغاء');
        return;
    }

    const deleteCategoryBtn = e.target.closest('[data-action="delete-category"]');
    if (deleteCategoryBtn) {
        e.preventDefault();
        const categoryId = deleteCategoryBtn.getAttribute('data-entity-id');
        if (!categoryId) return;

        const category = getCategoryById(categoryId);
        if (!category) {
            showToast('error', 'حذف الفئة', 'لم يتم العثور على الفئة المحددة');
            return;
        }

        confirmPopup('تأكيد حذف الفئة', `هل أنت متأكد من حذف الفئة "${category.name}"؟`, () => {
            deleteCategory(categoryId);
        }, null, 'حذف', 'إلغاء');
        return;
    }

    // Delete Product
    const deleteProductBtn = e.target.closest('[data-action="delete-product"]');
    if (deleteProductBtn) {
        e.preventDefault();
        const productId = deleteProductBtn.getAttribute('data-entity-id');
        if (!productId) return;

        const product = getProductById(productId);
        if (!product) {
            showToast('error', 'حذف المنتج', 'لم يتم العثور على المنتج المحدد');
            return;
        }

        deleteProduct(productId, { productName: product.name });
        return;
    }

    // Preview Product
    const previewProductBtn = e.target.closest('[data-action="preview-product"]');
    if (previewProductBtn) {
        e.preventDefault();
        const productId = previewProductBtn.getAttribute('data-entity-id');
        const product = getProductById(productId);
        if (!product) {
            showToast('error', 'عرض المنتج', 'لم يتم العثور على المنتج المحدد');
            return;
        }

        viewProductDetails(product.id);
        return;
    }

    // Close mobile sidebar when clicking outside
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 992 && sidebar && sidebar.classList.contains('mobile-active')) {
        if (!sidebar.contains(e.target) && !e.target.closest('#mobileMenuBtn')) {
            sidebar.classList.remove('mobile-active');
            const menuBtn = document.getElementById('mobileMenuBtn');
            if (menuBtn) {
                menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
            }
            document.body.classList.remove('sidebar-open');
            const overlay = document.getElementById('sidebarOverlay');
            if (overlay) {
                overlay.hidden = true;
                overlay.style.opacity = '0';
            }
        }
    }

    if (e.target.closest('#sidebarOverlay')) {
        e.preventDefault();
        toggleSidebar(false);
        return;
    }

    // Toggle messages panel
    if (e.target.closest('#messagesBtn')) {
        e.preventDefault();
        toggleMessagesPanel();
        return;
    }

    if (e.target.closest('#closeMessagesPanel')) {
        e.preventDefault();
        toggleMessagesPanel(false);
        return;
    }

    if (e.target.closest('#markAllMessagesRead')) {
        e.preventDefault();
        markMessagesAsRead();
        showToast('success', 'الرسائل', 'تم تعيين جميع الرسائل كمقروءة');
        return;
    }

    if (e.target.id === 'messagesOverlay') {
        toggleMessagesPanel(false);
        return;
    }

    if (window.innerWidth > 992) {
        const panel = document.getElementById('messagesPanel');
        if (panel?.classList.contains('active') && !panel.contains(e.target) && !e.target.closest('#messagesBtn')) {
            toggleMessagesPanel(false);
        }
    }

    const messageActionBtn = e.target.closest('[data-action][data-message-id]');
    if (messageActionBtn) {
        const action = messageActionBtn.getAttribute('data-action');
        const messageId = messageActionBtn.getAttribute('data-message-id');
        handleMessageAction(action, messageId);
        return;
    }
});

document.addEventListener('input', function (e) {
    if (e.target.id === 'messagesSearchInput') {
        renderMessagesList(e.target.value || '');
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const panel = document.getElementById('messagesPanel');
        if (panel?.classList.contains('active')) {
            toggleMessagesPanel(false);
        }
    }
});

// ===== Image Upload Functions =====
async function uploadImages(files) {
    if (!files || !files.length) return [];

    const UPLOAD_ENDPOINT = '/api/upload';
    const uploadedUrls = [];

    try {
        for (const file of files) {
            const formData = new FormData();
            formData.append('image', file);

            const response = await authorizedFetch(UPLOAD_ENDPOINT, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`فشل رفع الصورة: ${file.name}`);
            }

            const result = await response.json();
            if (result.url) {
                uploadedUrls.push({
                    url: result.url,
                    alt: file.name,
                    isMain: uploadedUrls.length === 0 // أول صورة تكون رئيسية
                });
            }
        }

        return uploadedUrls;
    } catch (error) {
        console.error('❌ Failed to upload images:', error);
        showToast('error', 'خطأ في رفع الصور', error.message || 'حدث خطأ أثناء رفع الصور');
        throw error;
    }
}

// ===== Toggle Switches =====
document.addEventListener('change', async function (e) {
    if (e.target.matches('#subcategoryCategoryFilter')) {
        const selectedCategoryId = e.target.value;
        state.filters.subcategoryCategory = selectedCategoryId;
        if (selectedCategoryId) {
            fetchSubcategories(selectedCategoryId, { force: true });
        }
        renderSubcategories(selectedCategoryId);
        return;
    }

    if (e.target.matches('#subcategoryImage')) {
        handleSubcategoryImageChange(e);
        return;
    }

    if (e.target.matches('.toggle-switch input')) {
        const toggleInput = e.target;
        const parent = toggleInput.closest('.payment-method-card');
        if (!parent) return;

        const paymentId = parent.getAttribute('data-payment-id');
        if (!paymentId) {
            console.warn('⚠️ لم يتم تحديد معرف طريقة الدفع للزر.', parent);
            return;
        }

        const methodName = parent.querySelector('h3')?.textContent || 'طريقة الدفع';
        const enabled = toggleInput.checked;
        const previousStateAttr = parent.dataset.enabled;
        const previousState = typeof previousStateAttr === 'string'
            ? previousStateAttr === 'true'
            : !enabled;

        toggleInput.disabled = true;
        showToast('info', 'جاري التحديث', `يتم الآن ${enabled ? 'تفعيل' : 'إلغاء تفعيل'} ${methodName}...`);

        try {
            await togglePaymentMethod(paymentId, enabled);
            setPaymentToggleState(toggleInput, enabled);
            showToast('success', 'تم التحديث', `تم ${enabled ? 'تفعيل' : 'إلغاء تفعيل'} ${methodName} بنجاح`);
        } catch (error) {
            console.error('❌ فشل تحديث حالة طريقة الدفع:', { paymentId, enabled, error });
            setPaymentToggleState(toggleInput, previousState);
            showToast('error', 'خطأ في التحديث', error?.message || 'تعذر تحديث حالة طريقة الدفع. يرجى المحاولة مرة أخرى');
        } finally {
            toggleInput.disabled = false;
        }
    }
});

// ===== Image Upload Areas =====
document.addEventListener('click', function (e) {
    const uploadArea = e.target.closest('.image-upload-area');
    if (uploadArea && !e.target.matches('input[type="file"]')) {
        const input = uploadArea.querySelector('input[type="file"]');
        if (input) {
            input.click();
        }
    }
});

document.addEventListener('change', function (e) {
    if (e.target.matches('.image-upload-area input[type="file"]')) {
        const files = e.target.files;
        if (files.length > 0) {
            showToast('success', 'تحميل الصور', `تم اختيار ${files.length} صورة`);
        }
    }
});

// ===== Initialize =====
// نقطة البداية الرئيسية عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function () {

    // تهيئة السمة (الوضع الفاتح/الداكن)
    initTheme();

    // استعادة القسم المحفوظ أو الذهاب للنظرة العامة
    const savedSection = loadCurrentSection();
    switchSection(savedSection);

    // تحميل الرسوم البيانية الأولية بعد تأخير قصير
    setTimeout(() => {
        if (state.currentSection === 'overview') {
            loadOverviewCharts();
            chartsLoaded.overview = true;
        }
    }, 100);

    // تهيئة الفلاتر والبيانات
    hydrateFilters();
    // ⭐ LAZY LOADING: Render HTML structure but data loads lazily
    renderDashboard();  // Sets up empty HTML structure for all sections
    setupProductFilters();

    // جلب الفئات مباشرة عند التهيئة (لـ product form)
    fetchCategories();
    fetchBrands();

    // ربط حدث إرسال نموذج الفئة
    const categoryForm = document.getElementById('categoryForm');
    if (categoryForm) {
        categoryForm.addEventListener('submit', handleCategoryFormSubmit);
    }

    // ربط حدث تغيير صورة الفئة
    const categoryImageInput = document.getElementById('categoryImage');
    if (categoryImageInput) {
        categoryImageInput.addEventListener('change', handleCategoryImageChange);
    }

    const subcategoryForm = document.getElementById('subcategoryForm');
    if (subcategoryForm) {
        subcategoryForm.addEventListener('submit', handleSubcategoryFormSubmit);
    }

    const subcategoryImageInput = document.getElementById('subcategoryImage');
    if (subcategoryImageInput) {
        subcategoryImageInput.addEventListener('change', handleSubcategoryImageChange);
    }

    // ربط حدث إرسال نموذج العلامة التجارية
    const brandForm = document.getElementById('brandForm');
    if (brandForm) {
        brandForm.addEventListener('submit', handleBrandFormSubmit);
    }

    // ربط حدث تغيير صورة العلامة التجارية
    const brandImageInput = document.getElementById('brandImage');
    if (brandImageInput) {
        brandImageInput.addEventListener('change', handleBrandImageChange);
    }

    const bannerForm = document.getElementById('bannerForm');
    if (bannerForm) {
        bannerForm.addEventListener('submit', handleBannerFormSubmit);
    }

    const bannerImageInput = document.getElementById('bannerImage');
    if (bannerImageInput) {
        bannerImageInput.addEventListener('change', handleBannerImageChange);
    }

    prepareBannerCreateForm();

    // ربط حدث البحث في العلامات التجارية
    const brandSearchInput = document.getElementById('brandSearch');
    if (brandSearchInput) {
        brandSearchInput.addEventListener('input', (e) => {
            state.filters.brandSearch = e.target.value;
            renderBrands();
        });
    }

    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', handleProductFormSubmit);
        const productImageInput = productForm.querySelector('#productImage');
        if (productImageInput) {
            productImageInput.addEventListener('change', handleProductImageChange);
        }
    }

    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePasswordSubmit);
    }

    const createAdminForm = document.getElementById('createAdminForm');
    if (createAdminForm) {
        createAdminForm.addEventListener('submit', handleCreateAdminSubmit);
    }

    const shippingSettingsForm = document.getElementById('shippingSettingsForm');
    const shippingZoneSelect = document.getElementById('shippingZoneSelect');
    const shippingZoneDeleteBtn = document.getElementById('shippingZoneDeleteBtn');
    const shippingZoneCreateContainer = document.getElementById('shippingZoneCreateContainer');
    const shippingZoneCreateToggle = document.getElementById('shippingZoneCreateToggle');
    const shippingZoneCreateCancel = document.getElementById('shippingZoneCreateCancel');

    if (shippingZoneSelect) {
        shippingZoneSelect.addEventListener('change', (event) => {
            const zoneId = event.target.value;
            state.selectedShippingZoneId = zoneId;
            const zone = getShippingZoneById(zoneId);
            const rateInput = document.getElementById('shippingZoneRate');
            const installationCheckbox = document.getElementById('shippingZoneInstallation');
            if (zone && rateInput && document.activeElement !== rateInput) {
                rateInput.value = zone.shippingRate;
            }
            if (installationCheckbox) {
                installationCheckbox.checked = Boolean(zone?.installationAvailable);
                installationCheckbox.disabled = !zone;
            }
        });
    }

    if (shippingSettingsForm) {
        shippingSettingsForm.addEventListener('submit', handleShippingSettingsSubmit);
    }

    const setCreateZoneVisibility = (visible = false) => {
        if (!shippingZoneCreateContainer) return;
        shippingZoneCreateContainer.hidden = !visible;

        if (shippingZoneCreateToggle) {
            shippingZoneCreateToggle.setAttribute('aria-expanded', visible ? 'true' : 'false');
            shippingZoneCreateToggle.innerHTML = visible
                ? '<i class="fas fa-times"></i> إخفاء نموذج الإضافة'
                : '<i class="fas fa-plus"></i> إضافة منطقة جديدة';
        }

        if (!visible) {
            const form = shippingZoneCreateContainer.querySelector('#shippingZoneCreateForm');
            form?.reset();
        }
    };

    if (shippingZoneCreateToggle) {
        shippingZoneCreateToggle.addEventListener('click', () => {
            const shouldShow = shippingZoneCreateContainer?.hidden !== false;
            setCreateZoneVisibility(shouldShow);
            if (shouldShow) {
                shippingZoneCreateContainer?.querySelector('#newShippingZoneNameAr')?.focus();
            }
        });
        setCreateZoneVisibility(false);
    }

    if (shippingZoneCreateCancel) {
        shippingZoneCreateCancel.addEventListener('click', () => {
            setCreateZoneVisibility(false);
        });
    }

    if (shippingZoneDeleteBtn) {
        shippingZoneDeleteBtn.addEventListener('click', async () => {
            const zoneId = state.selectedShippingZoneId || shippingZoneSelect?.value;
            if (!zoneId) {
                showToast('error', 'حذف منطقة الشحن', 'يرجى اختيار المنطقة المراد حذفها');
                return;
            }

            const zone = getShippingZoneById(zoneId);
            const zoneLabel = zone?.zoneName || 'هذه المنطقة';

            confirmPopup('تأكيد حذف منطقة الشحن', `هل أنت متأكد من حذف "${zoneLabel}"؟ لا يمكن التراجع عن هذه العملية.`, async () => {
                shippingZoneDeleteBtn.disabled = true;
                shippingZoneDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحذف...';

                try {
                    await deleteShippingZone(zoneId);
                } catch (error) {
                    console.error('❌ Delete shipping zone failed:', error);
                } finally {
                    shippingZoneDeleteBtn.disabled = false;
                    shippingZoneDeleteBtn.innerHTML = '<i class="fas fa-trash"></i> حذف المنطقة';
                }
            }, null, 'حذف', 'إلغاء');
        });
    }

    const shippingZoneCreateForm = document.getElementById('shippingZoneCreateForm');
    if (shippingZoneCreateForm) {
        shippingZoneCreateForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const form = event.target;
            const nameArInput = form.querySelector('#newShippingZoneNameAr');
            const nameEnInput = form.querySelector('#newShippingZoneNameEn');
            const rateInput = form.querySelector('#newShippingZoneRate');
            const submitBtn = form.querySelector('#shippingZoneCreateSubmit');

            const nameAr = nameArInput?.value?.trim();
            const nameEn = nameEnInput?.value?.trim();
            const shippingRate = rateInput?.value;

            if (!nameAr) {
                showToast('error', 'إضافة منطقة الشحن', 'يرجى إدخال اسم المنطقة بالعربية');
                nameArInput?.focus();
                return;
            }

            if (!nameEn) {
                showToast('error', 'إضافة منطقة الشحن', 'يرجى إدخال اسم المنطقة بالإنجليزية');
                nameEnInput?.focus();
                return;
            }

            const numericRate = Number(shippingRate);
            if (!Number.isFinite(numericRate) || numericRate < 0) {
                showToast('error', 'إضافة منطقة الشحن', 'يرجى إدخال تكلفة شحن صحيحة (0 أو أكبر)');
                rateInput?.focus();
                return;
            }

            const originalState = submitBtn ? { disabled: submitBtn.disabled, label: submitBtn.innerHTML } : null;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإضافة...';
            }

            try {
                await createShippingZone(nameAr, nameEn, numericRate);
                setCreateZoneVisibility(false);
            } catch (error) {
                console.error('❌ Create shipping zone failed:', error);
            } finally {
                if (submitBtn && originalState) {
                    submitBtn.disabled = originalState.disabled;
                    submitBtn.innerHTML = originalState.label;
                }
            }
        });
    }

    document.querySelectorAll('.toggle-password').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = targetId ? document.getElementById(targetId) : btn.previousElementSibling;
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye', !isPassword);
                icon.classList.toggle('fa-eye-slash', isPassword);
            }
            btn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
        });
    });

    // جلب الفئات من الـ API
    fetchCustomers();
    fetchProducts();
    fetchBanners();
    fetchShippingZones();

    initMessagesPanel();

    // إنشاء قائمة الهاتف المحمول إذا لزم الأمر
    createMobileMenu();

    // عرض رسالة ترحيب بعد تأخير قصير
    setTimeout(() => {
        showToast('success', 'مرحباً بك', 'تم تسجيل الدخول بنجاح إلى لوحة التحكم');
    }, 500);

    const authBtn = document.getElementById('authBtn');
    if (authBtn && window.adminAuth) {
        authBtn.addEventListener('click', () => {
            authBtn.disabled = true;
            authBtn.classList.add('is-loading');
            showToast('info', 'تسجيل الخروج', 'جاري إنهاء الجلسة...');
            setTimeout(() => {
                window.adminAuth.logout();
            }, 300);
        });
    }
});

window.updateOrderStatusOptions = getOrderStatusOptions;
window.changeOrderStatus = changeOrderStatus;

// ===== Window Resize Handler =====
window.addEventListener('resize', createMobileMenu);


// ========================================
// ===== 10. دوال معالجة الطلبات =====
// ========================================

/**
 * تطبيع بيانات الطلبات من استجابة API
 * @param {Object} payload - البيانات الخام من API
 * @returns {Array} - مصفوفة الطلبات المطبعة
 */
function normalizeOrdersPayload(payload) {


    if (!payload) return [];

    // محاولة استخراج المصفوفة من أماكن مختلفة في الاستجابة
    const candidates = [
        payload?.data?.orders,
        payload?.data?.documents,
        payload?.orders,
        payload?.documents,
        payload?.data,
        Array.isArray(payload) ? payload : null
    ];

    const source = candidates.find(Array.isArray) || [];


    return source.map(order => normalizeOrderEntity(order)).filter(Boolean);
}

/**
 * تطبيع بيانات طلب واحد
 * @param {Object} order - بيانات الطلب الخام
 * @returns {Object|null} - الطلب المطبع
 */
function normalizeOrderEntity(order = {}) {
    if (!order || typeof order !== 'object') return null;

    const id = order._id || order.id || order.orderId || order.order_id;

    // استخراج بيانات العميل
    const customer = extractOrderCustomer(order);
    const identifiers = extractOrderIdentifiers(order);
    const userIds = Array.from(identifiers.ids);
    const userEmails = Array.from(identifiers.emails);
    const userPhones = Array.from(identifiers.phones);
    const primaryUserId = userIds.length ? userIds[0] : null;

    // استخراج عناصر الطلب وتحويلها للتنسيق المطلوب
    const items = extractOrderItems(order);

    const totalSource = order.totalOrderPrice
        ?? order.totalAmount
        ?? order.total
        ?? order.amount
        ?? order.summary?.total
        ?? order.raw?.total
        ?? 0;
    const total = Number(totalSource);

    // تحويل cartItems إلى itemsDetails بالتنسيق الصحيح
    const itemsDetails = Array.isArray(order.cartItems)
        ? order.cartItems.map(item => ({
            name: item.productId?.name || item.name || 'منتج',
            quantity: item.qty || item.quantity || 1,
            price: item.unitPrice || item.price || 0,
            image: item.productId?.images?.[0]?.secure_url || '',
            product: {
                name: item.productId?.name || item.name || 'منتج',
                _id: item.productId?._id || item.productId || ''
            }
        }))
        : [];

    const status = resolveOrderStatus(order);
    const payment = order.paymentMethod || order.payment_method || order.payment || 'نقدي';
    const createdAtSource = order.createdAt || order.created_at || order.date || order.createdDate;
    const createdAtDate = parseDateValue(createdAtSource);
    const dateDisplay = createdAtDate ? formatDate(createdAtDate) : '-';
    const dateValue = createdAtDate ? createdAtDate.toISOString() : '';

    const shippingSource = order.shippingAddress || order.shipping || order.deliveryAddress || order.raw?.shippingAddress || order.raw?.shipping;
    const shipping = normalizeOrderShipping(shippingSource, order);

    return {
        id: String(id),
        customer: customer.name || 'غير معروف',
        customerEmail: customer.email || '',
        customerPhone: customer.phone || '',
        total: Number(total) || 0,
        items: items.totalCount,
        itemsDetails: itemsDetails,
        status,
        payment,
        date: dateDisplay,
        dateValue,
        shipping,
        userId: primaryUserId,
        userIds,
        userEmails,
        userPhones,
        primaryUserId,
        isPaid: order.isPaid || false,
        isDelivered: order.isDelivered || false,
        isCanceled: order.isCanceled || false,
        raw: order
    };
}

function resolveShippingText(value) {
    if (value === null || value === undefined) return '';

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const text = String(value).trim();
        if (!text || text === '[object Object]') return '';
        return text;
    }

    if (Array.isArray(value)) {
        for (const entry of value) {
            const resolved = resolveShippingText(entry);
            if (resolved) return resolved;
        }
        return '';
    }

    if (typeof value === 'object') {
        const candidates = [
            value.zoneName, value.nameAr, value.name_ar, value['name-ar'], value.nameAR,
            value.nameEn, value.name_en, value['name-en'], value.name,
            value.label, value.title, value.displayName, value.display_name,
            value.ar, value.arabic, value.en, value.english,
            value.city, value.cityName, value.region, value.regionName, value.country,
            value.details, value.address, value.addressLine1, value.addressLine2,
            value.street, value.value
        ];

        for (const candidate of candidates) {
            const resolved = resolveShippingText(candidate);
            if (resolved) return resolved;
        }
    }

    return '';
}

function resolveShippingZone(rawOrder = {}, shippingObj = {}) {
    const directZone = shippingObj.shippingZone || shippingObj.zone || shippingObj.area || shippingObj.region || shippingObj.shipping;
    const rawZone = rawOrder.shippingZone || rawOrder.zone || rawOrder.shipping_area;

    const zoneCandidate = directZone || rawZone;
    if (!zoneCandidate) {
        return { zoneName: '', shippingRate: null, zoneId: '' };
    }

    const zoneName = resolveShippingText(zoneCandidate) || resolveShippingText(zoneCandidate?.name) || '';
    const rateCandidate = zoneCandidate?.shippingRate
        ?? zoneCandidate?.rate
        ?? zoneCandidate?.price
        ?? zoneCandidate?.cost
        ?? shippingObj?.shippingRate
        ?? shippingObj?.shippingCost
        ?? rawOrder.shippingCost
        ?? rawOrder.shippingFee
        ?? rawOrder.deliveryFee
        ?? rawOrder.deliveryCost
        ?? null;

    const numericRate = Number(rateCandidate);
    const shippingRate = Number.isFinite(numericRate) && numericRate >= 0 ? numericRate : null;

    const zoneId = zoneCandidate?.id || zoneCandidate?._id || shippingObj?.zoneId || rawOrder.shippingZoneId || rawOrder.zoneId || '';

    return {
        zoneName,
        shippingRate,
        zoneId
    };
}

function normalizeOrderShipping(shippingSource, rawOrder = {}) {
    if (!shippingSource) return null;

    if (Array.isArray(shippingSource)) {
        const firstEntry = shippingSource.find(Boolean);
        return firstEntry ? normalizeOrderShipping(firstEntry, rawOrder) : null;
    }

    if (typeof shippingSource === 'string' || typeof shippingSource === 'number') {
        const details = resolveShippingText(shippingSource) || String(shippingSource).trim();
        const zone = resolveShippingZone(rawOrder, {});
        return {
            details,
            city: '',
            region: '',
            postalCode: '',
            phone: '',
            zoneName: zone.zoneName,
            shippingRate: zone.shippingRate,
            zoneId: zone.zoneId
        };
    }

    if (typeof shippingSource !== 'object') {
        return null;
    }

    const details = resolveShippingText([
        shippingSource.details,
        shippingSource.address,
        shippingSource.addressLine1 && `${shippingSource.addressLine1} ${shippingSource.addressLine2 || ''}`.trim(),
        shippingSource.street,
        shippingSource.location,
        shippingSource.description,
        shippingSource.fullAddress,
        shippingSource.notes
    ]);

    const city = resolveShippingText([shippingSource.city, shippingSource.cityName, shippingSource.cityAr, shippingSource.cityEn]);
    const region = resolveShippingText([shippingSource.region, shippingSource.state, shippingSource.governorate, shippingSource.zone, shippingSource.area]);
    const postalCode = resolveShippingText(shippingSource.postalCode || shippingSource.zip || shippingSource.zipCode);
    const phone = resolveShippingText(shippingSource.phone || shippingSource.mobile || shippingSource.contactPhone);

    const zone = resolveShippingZone(rawOrder, shippingSource);

    return {
        details,
        city,
        region,
        postalCode,
        phone,
        zoneName: zone.zoneName,
        shippingRate: zone.shippingRate,
        zoneId: zone.zoneId
    };
}

function extractOrderIdentifiers(order = {}) {
    const ids = new Set();
    const emails = new Set();
    const phones = new Set();

    const normalizePhone = (phone) => {
        if (!phone) return '';
        return String(phone)
            .replace(/[^0-9+]/g, '')
            .replace(/^[^0-9+]*/, '');
    };

    const pushId = (value) => {
        if (value === null || value === undefined) return;
        const normalized = String(value).trim();
        if (normalized) ids.add(normalized);
    };

    const pushEmail = (value) => {
        if (!value) return;
        const normalized = String(value).trim().toLowerCase();
        if (normalized) emails.add(normalized);
    };

    const pushPhone = (value) => {
        const normalized = normalizePhone(value);
        if (normalized) phones.add(normalized);
    };

    const possibleUserRefs = [
        order.userId,
        order.user,
        order.customer,
        order.customerId,
        order.user_id,
        order.customer_id
    ];

    possibleUserRefs.forEach(ref => {
        if (!ref) return;
        if (typeof ref === 'string' || typeof ref === 'number') {
            pushId(ref);
        } else if (typeof ref === 'object') {
            pushId(ref._id || ref.id || ref.userId || ref.customerId);
            pushEmail(ref.email);
            pushPhone(ref.phone);
        }
    });

    if (order.shippingAddress) {
        pushEmail(order.shippingAddress.email);
        pushPhone(order.shippingAddress.phone);
        pushId(order.shippingAddress.userId || order.shippingAddress.customerId);
    }

    pushEmail(order.userEmail || order.customerEmail);
    pushPhone(order.userPhone || order.customerPhone);

    return { ids, emails, phones };
}

function doesOrderBelongToCustomer(order, customer) {
    if (!order || !customer) return false;

    // ============================================
    // ✅ الطريقة المحسّنة: المقارنة بناءً على:
    // 1. معرف العميل (userId) - الأولوية الأولى
    // 2. اسم المستخدم (name) - الأولوية الثانية
    // 3. الحساب (username/account) - الأولوية الثالثة
    // ⛔ بدون البريد الإلكتروني ولا الهاتف
    // ============================================

    // ============================================
    // المرحلة 1: المقارنة بناءً على معرف العميل (userId)
    // ============================================
    const customerIds = new Set();
    const addCustomerId = (value) => {
        if (value === null || value === undefined) return;
        const normalized = String(value).trim();
        if (normalized) customerIds.add(normalized);
    };

    // جمع جميع معرفات العميل الممكنة
    addCustomerId(customer._id);
    addCustomerId(customer.id);
    addCustomerId(customer.userId);
    if (customer.user && typeof customer.user === 'object') {
        addCustomerId(customer.user._id || customer.user.id);
    }

    // التحقق من معرفات الطلب الأساسية
    const orderIds = order.userIds || [];
    for (const id of orderIds) {
        if (customerIds.has(String(id))) {
            return true;
        }
    }

    if (order.userId) {
        const orderUserId = String(order.userId).trim();
        if (customerIds.has(orderUserId)) {
            return true;
        }
    }

    // ============================================
    // المرحلة 2: المقارنة بناءً على اسم المستخدم (name)
    // ============================================
    const normalizeText = (text) => {
        if (!text) return '';
        return String(text).trim().toLowerCase();
    };

    // جمع أسماء العميل الممكنة
    const customerNames = new Set(
        [
            customer.name,
            customer.fullName,
            customer.user?.name,
            customer.user?.fullName
        ]
            .filter(Boolean)
            .map(normalizeText)
            .filter(name => name.length > 0)
    );

    // مقارنة أسماء من الطلب
    const orderUsernames = (order.usernames || [])
        .map(normalizeText)
        .filter(Boolean);

    // أيضاً محاولة استخراج اسم من order.customer
    if (order.customer && typeof order.customer === 'object') {
        const custName = normalizeText(order.customer.name || order.customer.fullName);
        if (custName) orderUsernames.push(custName);
    }

    // مقارنة الأسماء
    for (const customerName of customerNames) {
        for (const orderUsername of orderUsernames) {
            if (customerName === orderUsername && customerName.length > 0) {
                return true;
            }
        }
    }

    // ============================================
    // المرحلة 3: المقارنة بناءً على الحساب (username/account)
    // ============================================
    const customerAccounts = new Set(
        [
            customer.username,
            customer.account,
            customer.user?.username,
            customer.user?.account
        ]
            .filter(Boolean)
            .map(normalizeText)
            .filter(acc => acc.length > 0)
    );

    // مقارنة الحسابات من الطلب
    const orderAccounts = (order.userAccounts || [])
        .map(normalizeText)
        .filter(Boolean);

    // أيضاً محاولة استخراج حساب من order.customer
    if (order.customer && typeof order.customer === 'object') {
        const custAccount = normalizeText(order.customer.username || order.customer.account);
        if (custAccount) orderAccounts.push(custAccount);
    }

    // مقارنة الحسابات
    for (const customerAccount of customerAccounts) {
        for (const orderAccount of orderAccounts) {
            if (customerAccount === orderAccount && customerAccount.length > 0) {
                return true;
            }
        }
    }

    // ⛔ لا نقارن بالبريد أو الهاتف نهائياً
    return false;
}

function extractOrderCustomer(order = {}) {
    // إذا كان userId موجود وهو كائن
    if (order.userId && typeof order.userId === 'object') {
        return {
            name: order.userId.name || '',
            email: order.userId.email || '',
            phone: order.userId.phone || order.shippingAddress?.phone || ''
        };
    }

    // إذا كان user موجود
    if (order.user && typeof order.user === 'object') {
        return {
            name: order.user.name || '',
            email: order.user.email || '',
            phone: order.user.phone || order.shippingAddress?.phone || ''
        };
    }

    // إذا كان customer موجود
    if (order.customer) {
        if (typeof order.customer === 'string') {
            return { name: order.customer, email: '', phone: '' };
        }
        if (typeof order.customer === 'object') {
            return {
                name: order.customer.name || order.customer.fullName || '',
                email: order.customer.email || '',
                phone: order.customer.phone || order.shippingAddress?.phone || ''
            };
        }
    }

    // محاولة استخراج من shippingAddress
    if (order.shippingAddress) {
        return {
            name: order.shippingAddress.name || order.shippingAddress.fullName || '',
            email: order.shippingAddress.email || '',
            phone: order.shippingAddress.phone || ''
        };
    }

    return { name: '', email: '', phone: '' };
}

function extractOrderItems(order = {}) {
    const cartItems = Array.isArray(order.cartItems) ? order.cartItems : [];

    if (!cartItems.length && Array.isArray(order.items)) {
        const totalCount = order.items.reduce((sum, item) => {
            return sum + (Number(item.quantity || item.qty || 0));
        }, 0);
        return { list: order.items, totalCount };
    }

    const totalCount = cartItems.reduce((sum, item) => {
        return sum + (Number(item.qty || item.quantity || 0));
    }, 0);

    return { list: cartItems, totalCount };
}

function resolveOrderStatus(order = {}) {
    if (!order || typeof order !== 'object') return 'new';

    const raw = (order.raw && typeof order.raw === 'object') ? order.raw : null;

    const isCancelledFlags = [
        order.isCanceled,
        order.isCancelled,
        order.cancelled,
        raw?.isCanceled,
        raw?.isCancelled,
        raw?.cancelled
    ];
    if (isCancelledFlags.some(Boolean)) {
        return 'cancelled';
    }

    const candidateStatuses = [
        order.status,
        order.statusKey,
        order.currentStatus,
        order.orderStatus,
        order.state,
        order.deliveryStatus,
        order.delivery_status,
        order.liveryStatus,
        raw?.status,
        raw?.statusKey,
        raw?.currentStatus,
        raw?.orderStatus,
        raw?.state,
        raw?.deliveryStatus,
        raw?.delivery_status,
        raw?.liveryStatus
    ];

    for (const candidate of candidateStatuses) {
        const normalized = normalizeStatusKey(candidate);
        if (normalized && ORDER_STATUS_FLOW.includes(normalized)) {
            return normalized;
        }
    }

    const isDeliveredFlags = [order.isDelivered, raw?.isDelivered];
    if (isDeliveredFlags.some(Boolean)) {
        return 'delivered';
    }

    const isPaidFlags = [order.isPaid, raw?.isPaid];
    if (isPaidFlags.some(Boolean)) {
        return 'processing';
    }

    return 'new';
}

/**
 * جلب الطلبات من API
 */
async function fetchOrders(options = {}) {
    const { page = 1, append = false } = options || {};

    if (!append) {
        state.ordersLoading = true;
    }


    state.ordersError = null;
    renderOrders();

    try {
        const url = ORDER_ENDPOINT.startsWith('http')
            ? `${ORDER_ENDPOINT}?page=${page}`
            : `${ORDER_ENDPOINT}?page=${page}`;

        const response = await authorizedFetch(url);


        const handled = handleUnauthorized(response);
        if (handled !== response) return; // تم إعادة التوجيه للتسجيل

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const payload = await response.json();


        const normalized = normalizeOrdersPayload(payload);


        if (append) {
            const existingIds = new Set(state.orders.map(order => order.id));
            const merged = [
                ...state.orders,
                ...normalized.filter(order => !existingIds.has(order.id))
            ];
            state.orders = merged;
        } else {
            state.orders = normalized;
        }
        state.ordersError = null;

        state.ordersPagination = {
            currentPage: Number(payload?.currentPage || page || 1),
            totalPages: Number(payload?.totalPages || 1),
            totalOrders: Number(payload?.totalOrders || state.orders.length)
        };

        // إعادة جلب العملاء لضمان ظهور أي عملاء جدد
        // أو تحديث بيانات العملاء الموجودين
        if (state.customers && state.customers.length > 0) {
            // إنشاء عملاء من الطلبات للعملاء المفقودين
            createCustomersFromOrders();

            // إذا كانت بيانات العملاء محملة، نعيد جلبها لتحديثها (بصمت)
            fetchCustomers(true).catch(err => {
                console.warn('⚠️ Failed to refresh customers:', err);
                // في حالة الفشل، نحدث البيانات الموجودة فقط
                updateCustomersOrdersInfo();
            });
        } else {
            // إذا لم تكن العملاء محملة، نحاول إنشاءهم من الطلبات
            state.customers = [];
            createCustomersFromOrders();
            updateCustomersOrdersInfo();
        }

        // تحديث الرسومات إذا كانت محملة
        if (chartsLoaded.overview) {
            loadOverviewCharts();
        }

        showToast('success', 'تحميل الطلبات', append
            ? `تم إضافة ${normalized.length} طلب`
            : `تم تحميل ${normalized.length} طلب بنجاح`);
    } catch (error) {
        console.error('❌ Failed to fetch orders:', error);
        state.orders = [];
        state.ordersError = error?.message || 'تعذر تحميل الطلبات. حاول مرة أخرى.';
        showToast('error', 'خطأ في تحميل الطلبات', state.ordersError);
    } finally {
        if (!append) {
            state.ordersLoading = false;
        }
        renderOrders();
        updateOverviewStats();

        // تحديث معلومات الطلبات للعملاء الموجودين
        if (state.customers && state.customers.length > 0) {
            updateCustomersOrdersInfo();
        }
    }
}

/**
 * تحديث حالة تسليم الطلب
 * @param {string} orderId - معرف الطلب
 */
async function updateOrderDeliveryStatus(orderId) {
    if (!orderId) return;



    try {
        const response = await authorizedFetch(`${ORDER_ENDPOINT}/${orderId}/deliver`, {
            method: 'PATCH'
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody?.message || `HTTP ${response.status}`);
        }

        const result = await response.json();

        // تحديث الطلب في الحالة المحلية
        const orderIndex = state.orders.findIndex(o => o.id === orderId);
        if (orderIndex !== -1) {
            state.orders[orderIndex].isDelivered = true;
            state.orders[orderIndex].status = 'delivered';
        }

        // إعادة عرض الطلبات
        renderOrders();
        updateOverviewStats();

        // تحديث بيانات العملاء
        if (state.customers && state.customers.length > 0) {
            updateCustomersOrdersInfo();
        }

        showToast('success', 'تحديث حالة التسليم', `تم تحديث حالة الطلب ${orderId} إلى "تم التسليم"`);
    } catch (error) {
        console.error('❌ Failed to update delivery status:', error);
        showToast('error', 'خطأ في التحديث', error.message || 'حدث خطأ أثناء تحديث حالة التسليم');
    }
}

function getOrdersSource() {
    return Array.isArray(state.orders) ? state.orders : [];
}

function getOrderById(orderId) {
    const normalizedId = String(orderId).trim();
    return getOrdersSource().find(order => String(order.id) === normalizedId);
}

function getOrdersPagination() {
    return {
        currentPage: state.ordersPagination.currentPage || 1,
        totalPages: state.ordersPagination.totalPages || 1,
        totalOrders: state.ordersPagination.totalOrders || state.orders.length
    };
}

function hasMoreOrders() {
    const pagination = getOrdersPagination();
    return pagination.currentPage < pagination.totalPages;
}

async function loadMoreOrders() {
    if (!hasMoreOrders()) {
        showToast('info', 'الطلبات', 'تم عرض جميع الطلبات.');
        return;
    }

    const nextPage = state.ordersPagination.currentPage + 1;
    try {
        await fetchOrders({ page: nextPage, append: true });
    } catch (error) {
        console.error('❌ Failed to load more orders:', error);
    }
}

function filterOrders() {
    let filtered = getOrdersSource();

    // Filter by search
    if (state.filters.orderSearch) {
        const search = state.filters.orderSearch.toLowerCase().trim();
        filtered = filtered.filter(order => {
            const idMatch = String(order.id).toLowerCase().includes(search);
            const nameMatch = (order.customer || '').toLowerCase().includes(search);
            const emailMatch = (order.customerEmail || '').toLowerCase().includes(search);
            return idMatch || nameMatch || emailMatch;
        });
    }

    // Filter by status
    if (state.filters.orderStatus !== 'all') {
        const targetStatus = normalizeStatusKey(state.filters.orderStatus);
        filtered = filtered.filter(order => normalizeStatusKey(order.status) === targetStatus);
    }

    // Filter by date
    if (state.filters.orderDate) {
        const selectedDate = parseDateValue(state.filters.orderDate);
        if (selectedDate) {
            filtered = filtered.filter(order => {
                const orderDate = getOrderDate(order);
                return isSameDay(orderDate, selectedDate);
            });
        }
    }

    return filtered;
}

/**
 * عرض جدول الطلبات
 * يعرض قائمة الطلبات مع الفلاتر المطبقة
 */
function renderOrders() {
    const body = document.getElementById('ordersTableBody');
    const loadMoreRowId = 'ordersLoadMoreRow';
    if (!body) return;

    // حالة التحميل
    if (state.ordersLoading) {
        body.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: #e74c3c;"></i>
                        <p style="margin-top: 10px;">جاري تحميل الطلبات...</p>
                    </td>
                </tr>
            `;
        return;
    }

    if (state.ordersError) {
        body.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px; color: #e74c3c;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 24px;"></i>
                        <p style="margin-top: 10px;">${state.ordersError}</p>
                        <button onclick="fetchOrders()" style="margin-top: 15px; padding: 8px 20px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            <i class="fas fa-redo"></i> إعادة المحاولة
                        </button>
                    </td>
                </tr>
            `;
        return;
    }

    const filtered = filterOrders();

    if (!filtered.length) {
        body.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px; color: #7a7a7a;">
                        <i class="fas fa-inbox" style="font-size: 24px;"></i>
                        <p style="margin-top: 10px;">لا توجد طلبات مطابقة للمعايير الحالية</p>
                    </td>
                </tr>
            `;
        return;
    }

    const rows = filtered.map((order, index) => {
        const orderIdLiteral = JSON.stringify(order?.id ?? '');

        return `
                <tr data-id="${order.id}">
                    <td>${index + 1}</td>
                    <td>${order.id}</td>
                    <td>
                        <div>${order.customer}</div>
                        ${order.customerEmail ? `<small style="color: #7a7a7a;">${order.customerEmail}</small>` : ''}
                    </td>
                    <td>${order.items}</td>
                    <td><strong>${formatCurrency(order.total)}</strong></td>
                    <td>${getPaymentLabel(order.payment)}</td>
                    <td>${getStatusBadge(order.status)}</td>
                    <td>${order.date}</td>
                    <td>
                        <button class="action-btn" onclick='viewOrderDetails(${orderIdLiteral})' title="عرض التفاصيل">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="action-btn" onclick='printOrder(${orderIdLiteral})' title="طباعة">
                            <i class="fas fa-print"></i>
                        </button>
                    </td>
                </tr>
            `;
    }).join('');

    const pagination = getOrdersPagination();
    const showLoadMore = hasMoreOrders();

    body.innerHTML = showLoadMore
        ? `${rows}
                <tr id="${loadMoreRowId}">
                    <td colspan="8" style="text-align: center; padding: 20px;">
                        <button id="ordersLoadMoreBtn" class="btn-secondary" style="padding: 10px 24px;">
                            <i class="fas fa-plus-circle"></i> تحميل المزيد (${pagination.currentPage}/${pagination.totalPages})
                        </button>
                        <div style="margin-top: 8px; color: #7a7a7a;">
                            تم عرض ${filtered.length} من إجمالي ${pagination.totalOrders} طلب
                        </div>
                    </td>
                </tr>`
        : rows;

    const loadMoreBtn = document.getElementById('ordersLoadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            loadMoreBtn.disabled = true;
            loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...';
            loadMoreOrders().finally(() => {
                loadMoreBtn.disabled = false;
            });
        });
    }
}

// تم حذف الدالة المكررة - يوجد renderOverview أعلى في الملف

/**
 * عرض تفاصيل الطلب في نافذة منبثقة
 * @param {string} orderId - معرف الطلب
 */
function viewOrderDetails(orderId) {
    const order = getOrderById(orderId);
    if (!order) {
        showToast('error', 'خطأ', 'لم يتم العثور على الطلب');
        return;
    }


    const orderDetails = getOrderDetails(order.id) || {};
    let summary = orderDetails.summary || {
        subtotal: (order.itemsDetails || []).reduce((sum, item) => {
            const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;
            const price = Number(item.price ?? item.unitPrice ?? 0) || 0;
            return sum + quantity * price;
        }, 0),
        shipping: Number(order.raw?.shippingCost ?? order.raw?.shippingPrice ?? order.raw?.deliveryFee ?? order.shipping?.shippingRate ?? 0) || 0,
        discount: Number(order.raw?.discount ?? order.raw?.discountValue ?? 0) || 0,
        total: (() => {
            const totalValue = Number(order.total);
            if (Number.isFinite(totalValue)) {
                return totalValue;
            }
            return (
                ((order.itemsDetails || []).reduce((sum, item) => {
                    const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;
                    const price = Number(item.price ?? item.unitPrice ?? 0) || 0;
                    return sum + quantity * price;
                }, 0))
                + (Number(order.raw?.shippingCost ?? order.raw?.shippingPrice ?? order.raw?.deliveryFee ?? order.shipping?.shippingRate ?? 0) || 0)
                - (Number(order.raw?.discount ?? order.raw?.discountValue ?? 0) || 0)
            );
        })()
    };

    const installationAmount = Number(
        summary.installation
        ?? order.raw?.totalInstallationPrice
        ?? order.raw?.installationCost
        ?? order.raw?.installation_price
        ?? order.raw?.installationFee
        ?? order.installationCost
        ?? order.totalInstallationPrice
        ?? 0
    ) || 0;

    const subtotalValue = Number(summary.subtotal) || 0;
    const shippingValue = Number(summary.shipping) || 0;
    const discountValue = Number(summary.discount) || 0;
    const totalValue = Number(summary.total);
    const recalculatedTotal = subtotalValue + shippingValue + installationAmount - discountValue;

    summary = {
        ...summary,
        installation: installationAmount,
        subtotal: subtotalValue,
        shipping: shippingValue,
        discount: discountValue,
        total: Number.isFinite(totalValue) ? totalValue : recalculatedTotal
    };

    // إنشاء النافذة المنبثقة
    const modal = document.createElement('div');
    modal.className = 'order-details-modal';
    modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
            padding: 20px;
            box-sizing: border-box;
        `;

    // محتوى النافذة
    const statusOptions = getOrderStatusOptions();
    const normalizedStatus = normalizeStatusKey(order.status) || 'new';

    modal.innerHTML = `
            <div class="order-details-content" style="
                background: var(--bg-base);
                color: var(--text-main);
                padding: 30px;
                border-radius: 12px;
                width: 90%;
                max-width: 800px;
                max-height: 90vh;
                overflow-y: auto;
                position: relative;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            ">
                <button class="close-btn" style="
                    position: absolute;
                    top: 15px;
                    left: 15px;
                    background: #f44336;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 35px;
                    height: 35px;
                    font-size: 20px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                ">×</button>
                
                <h2 style="text-align: center; margin-bottom: 25px; color: var(--text-main);">
                    <i class="fas fa-receipt" style="margin-left: 10px; color: #e74c3c;"></i>
                    تفاصيل الطلب ${order.id}
                </h2>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                    <div>
                        <h3 style="color: #e74c3c; margin-bottom: 10px;">
                            <i class="fas fa-user"></i> معلومات العميل
                        </h3>
                        <p><strong>الاسم:</strong> ${order.customer}</p>
                        <p><strong>البريد:</strong> ${order.customerEmail || '-'}</p>
                        <p><strong>الهاتف:</strong> ${order.customerPhone || order.shipping?.phone || '-'}</p>
                    </div>
                    
                    <div>
                        <h3 style="color: #e74c3c; margin-bottom: 10px;">
                            <i class="fas fa-info-circle"></i> معلومات الطلب
                        </h3>
                        <p><strong>التاريخ:</strong> ${order.date}</p>
                        <p><strong>طريقة الدفع:</strong> ${order.payment}</p>
                    </div>
                </div>

                <div class="order-status-panel" style="margin: 20px 0; padding: 20px; background: var(--bg-light); border-radius: 10px; display: flex; flex-direction: column; gap: 12px;">
                    <div class="order-status-header" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                        <div style="font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-exchange-alt" style="color: var(--primary);"></i>
                            <span>إدارة حالة الطلب</span>
                        </div>
                        <div class="order-status-current" style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: var(--text-muted); font-size: 13px;">الحالة الحالية:</span>
                            <span class="order-status-badge-wrapper">${getStatusBadge(order.status)}</span>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; align-items: end;">
                        <div>
                            <label for="orderStatusSelect" style="display:block; margin-bottom:6px; font-size: 13px; color: var(--text-muted);">تغيير الحالة</label>
                            <select id="orderStatusSelect" class="order-status-select" data-order-id="${order.id}">
                                ${statusOptions.map(option => `
                                    <option value="${option.value}"${option.value === normalizedStatus ? ' selected' : ''}>${option.label}</option>
                                `).join('')}
                            </select>
                        </div>
                        <button id="orderStatusUpdateBtn" class="btn-primary" style="height: 42px; display:flex; align-items:center; justify-content:center; gap:8px;">
                            <i class="fas fa-save"></i> حفظ الحالة
                        </button>
                    </div>
                </div>
                
                ${order.shipping ? `
                    <div style="margin-bottom: 25px; padding: 20px; background: var(--bg-light); border-radius: 10px; border-right: 4px solid var(--primary);">
                        <h3 style="color: #e74c3c; margin-bottom: 15px; font-size: 1.1em;">
                            <i class="fas fa-map-marker-alt"></i> عنوان الشحن
                        </h3>
                        <div style="background: var(--bg-base); color: var(--text-main); padding: 15px; border-radius: 8px; line-height: 1.8;">
                            ${order.shipping.details ? `
                                <p style="margin: 8px 0; color: var(--text-main);">
                                    <i class="fas fa-home" style="color: #e74c3c; margin-left: 8px; width: 20px;"></i>
                                    <strong>التفاصيل:</strong> ${order.shipping.details}
                                </p>
                            ` : ''}
                            ${order.shipping.zoneName ? `
                                <p style="margin: 8px 0; color: var(--text-main);">
                                    <i class="fas fa-map-pin" style="color: #e74c3c; margin-left: 8px; width: 20px;"></i>
                                    <strong>منطقة الشحن:</strong> ${order.shipping.zoneName}
                                </p>
                            ` : ''}
                            ${Number.isFinite(order.shipping.shippingRate) ? `
                                <p style="margin: 8px 0; color: var(--text-main);">
                                    <i class="fas fa-shipping-fast" style="color: #e74c3c; margin-left: 8px; width: 20px;"></i>
                                    <strong>تكلفة الشحن:</strong> ${formatCurrency(order.shipping.shippingRate)}
                                </p>
                            ` : ''}
                            ${order.shipping.city ? `
                                <p style="margin: 8px 0; color: var(--text-main);">
                                    <i class="fas fa-city" style="color: #e74c3c; margin-left: 8px; width: 20px;"></i>
                                    <strong>المدينة:</strong> ${order.shipping.city}
                                </p>
                            ` : ''}
                            ${order.shipping.postalCode ? `
                                <p style="margin: 8px 0; color: var(--text-main);">
                                    <i class="fas fa-mail-bulk" style="color: #e74c3c; margin-left: 8px; width: 20px;"></i>
                                    <strong>الرمز البريدي:</strong> ${order.shipping.postalCode}
                                </p>
                            ` : ''}
                            ${order.shipping.phone ? `
                                <p style="margin: 8px 0; color: var(--text-main);">
                                    <i class="fas fa-phone" style="color: #e74c3c; margin-left: 8px; width: 20px;"></i>
                                    <strong>رقم الهاتف:</strong> <a href="tel:${order.shipping.phone}" style="color: #27ae60; text-decoration: none;">${order.shipping.phone}</a>
                                </p>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
                
                <div style="margin-bottom: 25px;">
                    <h3 style="color: #e74c3c; margin-bottom: 10px;">
                        <i class="fas fa-box"></i> المنتجات (${order.items} منتج)
                    </h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--bg-light); color: var(--text-main);">
                                <th style="padding: 10px; text-align: right; border: 1px solid var(--border);">المنتج</th>
                                <th style="padding: 10px; text-align: center; border: 1px solid var(--border);">الكمية</th>
                                <th style="padding: 10px; text-align: right; border: 1px solid var(--border);">السعر</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${order.itemsDetails && order.itemsDetails.length > 0
            ? order.itemsDetails.map(item => `
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid var(--border); color: var(--text-main);">${item.name || item.product?.name || 'منتج'}</td>
                                        <td style="padding: 10px; text-align: center; border: 1px solid var(--border); color: var(--text-main);">${item.quantity || item.qty || 1}</td>
                                        <td style="padding: 10px; border: 1px solid var(--border); color: var(--text-main);">${formatCurrency(item.price || 0)}</td>
                                    </tr>
                                `).join('')
            : '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #999;">لا توجد تفاصيل المنتجات</td></tr>'
        }
                        </tbody>
                    </table>
                </div>
                
                <div style="text-align: left; padding: 20px; background: var(--bg-light); border-radius: 8px; color: var(--text-main);">
                    <h3 style="color: #e74c3c; margin-bottom: 15px;">ملخص الفاتورة</h3>
                    <p style="margin: 6px 0;"><strong>المجموع الفرعي:</strong> ${formatCurrency(summary.subtotal)}</p>
                    <p style="margin: 6px 0;"><strong>الشحن:</strong> ${formatCurrency(summary.shipping)}</p>
                    <p style="margin: 6px 0;"><strong>التركيب:</strong> ${formatCurrency(summary.installation)}</p>
                    ${summary.discount ? `<p style="margin: 6px 0;"><strong>الخصم:</strong> ${formatCurrency(summary.discount)}</p>` : ''}
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.1);">
                        <p style="font-size: 1.4em; font-weight: bold; color: #27ae60; margin: 0;"><strong>الإجمالي الكلي:</strong> ${formatCurrency(summary.total)}</p>
                    </div>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    const rootStyles = getComputedStyle(document.documentElement);
    const sidebarWidth = rootStyles.getPropertyValue('--sidebar-width').trim() || '0px';

    const applyModalPadding = () => {
        if (window.innerWidth > 992) {
            modal.style.paddingRight = `calc(${sidebarWidth} + 40px)`;
        } else {
            modal.style.paddingRight = '20px';
        }
    };

    applyModalPadding();
    const handleResize = () => applyModalPadding();
    window.addEventListener('resize', handleResize);
    const cleanupHandlers = () => {
        document.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('resize', handleResize);
    };
    const fadeOutAndRemove = () => {
        modal.style.opacity = '0';
        setTimeout(() => {
            cleanupHandlers();
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    };

    // إظهار النافذة
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);

    // إغلاق النافذة
    const closeBtn = modal.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', fadeOutAndRemove);
    }

    // إغلاق عند النقر خارج المحتوى
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            fadeOutAndRemove();
        }
    });

    // إغلاق بمفتاح ESC
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            fadeOutAndRemove();
        }
    };
    document.addEventListener('keydown', handleKeyDown);

    const statusSelect = modal.querySelector('#orderStatusSelect');
    const updateStatusBtn = modal.querySelector('#orderStatusUpdateBtn');

    if (statusSelect && updateStatusBtn) {
        updateStatusBtn.addEventListener('click', async () => {
            const selectedStatus = statusSelect.value;
            await changeOrderStatus(order.id, selectedStatus, statusSelect);
            // تحديث الشارة المعروضة بعد الحفظ
            const badgeWrapper = modal.querySelector('.order-status-badge-wrapper');
            if (badgeWrapper) {
                badgeWrapper.innerHTML = getStatusBadge(selectedStatus);
            }
        });
    }
}

/**
 * طباعة فاتورة الطلب
 * @param {string} orderId - معرف الطلب
 */
function printOrder(orderId) {
    const order = getOrderById(orderId);
    if (!order) {
        showToast('error', 'خطأ', 'لم يتم العثور على الطلب');
        return;
    }

    // فتح نافذة الطباعة
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
        showToast('error', 'طباعة الفاتورة', 'يبدو أن النوافذ المنبثقة محظورة');
        return;
    }

    // محتوى الفاتورة
    const orderDetails = getOrderDetails(order.id) || {};
    let summary = orderDetails.summary || {
        subtotal: (order.itemsDetails || []).reduce((sum, item) => {
            const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;
            const price = Number(item.price ?? item.unitPrice ?? 0) || 0;
            return sum + quantity * price;
        }, 0),
        shipping: Number(order.raw?.shippingCost ?? order.raw?.shippingPrice ?? order.raw?.deliveryFee ?? order.shipping?.shippingRate ?? 0) || 0,
        discount: Number(order.raw?.discount ?? order.raw?.discountValue ?? 0) || 0,
        total: Number(order.total) || 0
    };

    const installationAmount = Number(
        summary.installation
        ?? order.raw?.totalInstallationPrice
        ?? order.raw?.installationCost
        ?? order.raw?.installation_price
        ?? order.raw?.installationFee
        ?? order.installationCost
        ?? order.totalInstallationPrice
        ?? 0
    ) || 0;

    const subtotalValue = Number(summary.subtotal) || 0;
    const shippingValue = Number(summary.shipping) || 0;
    const discountValue = Number(summary.discount) || 0;
    const totalValue = Number(summary.total);
    const recalculatedTotal = subtotalValue + shippingValue + installationAmount - discountValue;

    summary = {
        ...summary,
        installation: installationAmount,
        subtotal: subtotalValue,
        shipping: shippingValue,
        discount: discountValue,
        total: Number.isFinite(totalValue) ? totalValue : recalculatedTotal
    };

    win.document.write(`
            <!doctype html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="utf-8" />
                <title>فاتورة طلب ${order.id}</title>
                <style>
                    body { 
                        font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; 
                        padding: 40px; 
                        color: #2d3436;
                        line-height: 1.6;
                    }
                    h1 { 
                        text-align: center;
                        color: #e74c3c; 
                        margin-bottom: 30px;
                        border-bottom: 3px solid #e74c3c;
                        padding-bottom: 15px;
                    }
                    .header-info {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                        margin-bottom: 30px;
                        padding: 20px;
                        background: #f8f9fa;
                        border-radius: 8px;
                    }
                    .info-section h3 {
                        color: #e74c3c;
                        margin-bottom: 10px;
                        font-size: 1.1em;
                    }
                    .info-section p {
                        margin: 5px 0;
                    }
                    table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin: 30px 0;
                    }
                    th, td { 
                        border: 1px solid #dfe6e9; 
                        padding: 12px; 
                        text-align: right; 
                    }
                    th { 
                        background: #e74c3c; 
                        color: white;
                        font-weight: bold;
                    }
                    tr:nth-child(even) {
                        background: #f8f9fa;
                    }
                    .summary { 
                        margin-top: 30px; 
                        text-align: left;
                        padding: 20px;
                        background: #f8f9fa;
                        border-radius: 8px;
                    }
                    .summary .total { 
                        font-size: 1.5em;
                        font-weight: bold; 
                        color: #27ae60;
                        margin-top: 15px;
                        padding-top: 15px;
                        border-top: 2px solid #ddd;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 50px;
                        padding-top: 20px;
                        border-top: 2px solid #ddd;
                        color: #7a7a7a;
                    }
                    @media print {
                        body { padding: 20px; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <h1>فاتورة طلب ${order.id}</h1>
                
                <div class="header-info">
                    <div class="info-section">
                        <h3>معلومات العميل</h3>
                        <p><strong>الاسم:</strong> ${order.customer}</p>
                        <p><strong>البريد:</strong> ${order.customerEmail || '-'}</p>
                        <p><strong>الهاتف:</strong> ${order.customerPhone || order.shipping?.phone || '-'}</p>
                    </div>
                    
                    <div class="info-section">
                        <h3>معلومات الطلب</h3>
                        <p><strong>رقم الطلب:</strong> ${order.id}</p>
                        <p><strong>التاريخ:</strong> ${order.date}</p>
                        <p><strong>طريقة الدفع:</strong> ${order.payment}</p>
                    </div>
                </div>
                
                ${order.shipping ? `
                    <div class="info-section" style="margin-bottom: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-right: 4px solid #e74c3c;">
                        <h3 style="color: #e74c3c; margin-bottom: 15px;">
                            <i class="fas fa-map-marker-alt"></i> عنوان الشحن
                        </h3>
                        ${order.shipping.details ? `<p style="margin: 5px 0;"><strong>التفاصيل:</strong> ${order.shipping.details}</p>` : ''}
                        ${order.shipping.zoneName ? `<p style="margin: 5px 0;"><strong>منطقة الشحن:</strong> ${order.shipping.zoneName}</p>` : ''}
                        ${Number.isFinite(order.shipping.shippingRate) ? `<p style="margin: 5px 0;"><strong>تكلفة الشحن:</strong> ${formatCurrency(order.shipping.shippingRate)}</p>` : ''}
                        ${order.shipping.city ? `<p style="margin: 5px 0;"><strong>المدينة:</strong> ${order.shipping.city}</p>` : ''}
                        ${order.shipping.postalCode ? `<p style="margin: 5px 0;"><strong>الرمز البريدي:</strong> ${order.shipping.postalCode}</p>` : ''}
                        ${order.shipping.phone ? `<p style="margin: 5px 0;"><strong>رقم الهاتف:</strong> ${order.shipping.phone}</p>` : ''}
                    </div>
                ` : ''}
                
                <h3 style="color: #e74c3c; margin-top: 30px;">قائمة المنتجات</h3>
                <table>
                    <thead>
                        <tr>
                            <th>المنتج</th>
                            <th style="text-align: center;">الكمية</th>
                            <th>سعر الوحدة</th>
                            <th>الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${order.itemsDetails && order.itemsDetails.length > 0
            ? order.itemsDetails.map(item => {
                const quantity = item.quantity || item.qty || 1;
                const price = item.price || 0;
                const total = quantity * price;
                return `
                                    <tr>
                                        <td>${item.name || item.product?.name || 'منتج'}</td>
                                        <td style="text-align: center;">${quantity}</td>
                                        <td>${formatCurrency(price)}</td>
                                        <td><strong>${formatCurrency(total)}</strong></td>
                                    </tr>
                                `;
            }).join('')
            : '<tr><td colspan="4" style="text-align: center; padding: 20px;">لا توجد تفاصيل المنتجات</td></tr>'
        }
                    </tbody>
                </table>
                
                <div class="summary">
                    <p style="margin: 6px 0;"><strong>المجموع الفرعي:</strong> ${formatCurrency(summary.subtotal)}</p>
                    <p style="margin: 6px 0;"><strong>الشحن:</strong> ${formatCurrency(summary.shipping)}</p>
                    <p style="margin: 6px 0;"><strong>التركيب:</strong> ${formatCurrency(summary.installation)}</p>
                    ${summary.discount ? `<p style="margin: 6px 0;"><strong>الخصم:</strong> ${formatCurrency(summary.discount)}</p>` : ''}
                    <div class="total">
                        <strong>الإجمالي الكلي:</strong> ${formatCurrency(summary.total)}
                    </div>
                </div>
                
                <div class="footer">
                    <p>شكراً لتعاملكم معنا</p>
                    <p>Action Sports - متجر المعدات الرياضية</p>
                </div>
            </body>
            </html>
        `);

    win.document.close();
    win.focus();
    win.onload = () => {
        win.focus();
        win.print();
    };

    showToast('success', 'طباعة الفاتورة', `تم إرسال فاتورة الطلب ${order.id} للطباعة`);
}

// ===== Filters Setup =====
function setupOrderFilters() {
    const searchInput = document.getElementById('orderSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.filters.orderSearch = e.target.value;
            renderOrders();
        });
    }

    const statusFilter = document.getElementById('orderStatusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            state.filters.orderStatus = e.target.value;
            renderOrders();
        });
    }

    const dateFilter = document.getElementById('orderDateFilter');
    if (dateFilter) {
        dateFilter.addEventListener('change', (e) => {
            state.filters.orderDate = e.target.value;
            renderOrders();
        });
    }
}

// ========================================
// ===== 11. دوال إدارة المستخدمين =====
// ========================================

/**
 * إنشاء عملاء من الطلبات للعملاء المفقودين
 */
function createCustomersFromOrders() {
    if (!state.orders || state.orders.length === 0) return;


    const existingCustomerIds = new Set();
    const existingCustomerEmails = new Set();

    // جمع معرفات وإيميلات العملاء الموجودين
    (state.customers || []).forEach(customer => {
        const id = customer._id || customer.id;
        if (id) existingCustomerIds.add(id);
        if (customer.email) existingCustomerEmails.add(customer.email.toLowerCase());
    });

    const newCustomers = [];
    const processedIds = new Set();

    // استخراج العملاء من الطلبات
    state.orders.forEach(order => {
        const userId = order.userId || order.user?._id || order.user?.id;

        // تخطي إذا كان العميل موجود بالفعل
        if (userId && (existingCustomerIds.has(userId) || processedIds.has(userId))) {
            return;
        }

        const customerInfo = extractOrderCustomer(order);

        // تخطي إذا لم نحصل على معلومات كافية
        if (!customerInfo.name && !customerInfo.email) {
            return;
        }

        // تخطي إذا كان الإيميل موجود بالفعل
        if (customerInfo.email && existingCustomerEmails.has(customerInfo.email.toLowerCase())) {
            return;
        }

        // إنشاء عميل جديد
        const newCustomer = {
            _id: userId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            id: userId,
            name: customerInfo.name || 'عميل',
            email: customerInfo.email || '',
            phone: customerInfo.phone || '',
            role: 'user',
            ordersCount: 0,
            lastOrder: '-',
            lastOrderTimestamp: null,
            isFromOrders: true // علامة للتمييز
        };

        if (userId) processedIds.add(userId);
        if (customerInfo.email) existingCustomerEmails.add(customerInfo.email.toLowerCase());

        newCustomers.push(newCustomer);
    });

    if (newCustomers.length > 0) {
        state.customers = [...(state.customers || []), ...newCustomers];
    }
}

/**
 * تحديث معلومات الطلبات للعملاء الموجودين
 */
function updateCustomersOrdersInfo() {
    if (!state.customers || state.customers.length === 0) return;


    state.customers = state.customers.map(customer => {
        const customerId = customer._id || customer.id;

        // البحث عن طلبات هذا العميل باستخدام المطابقة المرنة
        const customerOrders = state.orders?.filter(order => {
            // محاولة المطابقة بالـ ID أولاً
            if (order.userId === customerId || order.user?._id === customerId || order.user?.id === customerId) {
                return true;
            }
            // محاولة المطابقة بالبريد الإلكتروني
            if (customer.email && order.user?.email === customer.email) {
                return true;
            }
            // محاولة المطابقة بالهاتف
            if (customer.phone && order.user?.phone === customer.phone) {
                return true;
            }
            // استخدام دالة المطابقة المتقدمة
            return doesOrderBelongToCustomer(order, customer);
        }) || [];

        // حساب عدد الطلبات (عدد الطلبات وليس عدد المنتجات)
        const ordersCount = customerOrders.length;

        if (ordersCount > 0 && customer.name) {
        }

        // إيجاد آخر طلب
        let lastOrder = '-';
        let lastOrderTimestamp = null;
        if (customerOrders.length > 0) {
            // ترتيب الطلبات حسب التاريخ (الأحدث أولاً)
            const sortedOrders = customerOrders.sort((a, b) => {
                const dateA = getOrderDate(a);
                const dateB = getOrderDate(b);
                if (!dateA || !dateB) return 0;
                return dateB - dateA;
            });

            const latestOrder = sortedOrders[0];
            const orderDate = getOrderDate(latestOrder);
            if (orderDate) {
                lastOrderTimestamp = orderDate.getTime();
                lastOrder = orderDate.toLocaleDateString('ar-EG');
            }
        }

        return {
            ...customer,
            ordersCount,
            lastOrder,
            lastOrderTimestamp
        };
    });

    // إعادة عرض العملاء إذا كان القسم نشطاً
    const customersSection = document.getElementById('customers');
    if (customersSection && customersSection.classList.contains('active')) {
        renderCustomers();
    }


}

/**
 * جلب العملاء من API
 * @param {boolean} silent - إذا كان true، لا تظهر رسالة النجاح
 */
async function fetchCustomers(silent = false) {

    state.customersLoading = true;
    state.customersError = null;
    renderCustomers();

    try {
        const response = await authorizedFetch(USERS_ENDPOINT);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const payload = await response.json();

        // استخراج العملاء من الاستجابة - جرب جميع الاحتمالات
        const allUsers = Array.isArray(payload?.data?.users)
            ? payload.data.users
            : Array.isArray(payload?.data?.documents)
                ? payload.data.documents
                : Array.isArray(payload?.data)
                    ? payload.data
                    : Array.isArray(payload)
                        ? payload
                        : [];

        // تصفية المستخدمين العاديين فقط (إخفاء المدراء)
        const fetchedCustomers = allUsers.filter(user => user.role !== 'admin');


        // دمج العملاء الجدد مع الموجودين دون تكرار
        const existingCustomers = Array.isArray(state.customers) ? state.customers : [];
        const seenIds = new Set();
        const seenEmails = new Set();

        existingCustomers.forEach(customer => {
            const id = customer._id || customer.id;
            if (id) seenIds.add(String(id));
            if (customer.email) {
                seenEmails.add(String(customer.email).toLowerCase());
            }
        });

        const mergedCustomers = [
            ...existingCustomers
        ];

        fetchedCustomers.forEach(customer => {
            const id = customer._id || customer.id;
            const email = customer.email ? String(customer.email).toLowerCase() : null;

            const normalizedId = id ? String(id) : null;

            const alreadyExists =
                (normalizedId && seenIds.has(normalizedId)) ||
                (email && seenEmails.has(email));

            if (!alreadyExists) {
                mergedCustomers.push(customer);
                if (normalizedId) seenIds.add(normalizedId);
                if (email) seenEmails.add(email);
            }
        });

        // إضافة معلومات الطلبات لكل عميل
        const customersWithOrders = mergedCustomers.map(customer => {
            const customerId = customer._id || customer.id;

            // البحث عن طلبات هذا العميل باستخدام المطابقة المرنة
            const customerOrders = state.orders?.filter(order => {
                // محاولة المطابقة بالـ ID أولاً
                if (order.userId === customerId || order.user?._id === customerId || order.user?.id === customerId) {
                    return true;
                }
                // محاولة المطابقة بالبريد الإلكتروني
                if (customer.email && order.user?.email === customer.email) {
                    return true;
                }
                // محاولة المطابقة بالهاتف
                if (customer.phone && order.user?.phone === customer.phone) {
                    return true;
                }
                // استخدام دالة المطابقة المتقدمة
                return doesOrderBelongToCustomer(order, customer);
            }) || [];

            // حساب عدد الطلبات
            const ordersCount = customerOrders.length;

            // إيجاد آخر طلب
            let lastOrder = '-';
            let lastOrderTimestamp = null;
            if (customerOrders.length > 0) {
                // ترتيب الطلبات حسب التاريخ (الأحدث أولاً)
                const sortedOrders = customerOrders.sort((a, b) => {
                    const dateA = getOrderDate(a);
                    const dateB = getOrderDate(b);
                    if (!dateA || !dateB) return 0;
                    return dateB - dateA;
                });

                const latestOrder = sortedOrders[0];
                const orderDate = getOrderDate(latestOrder);
                if (orderDate) {
                    lastOrderTimestamp = orderDate.getTime();
                    lastOrder = orderDate.toLocaleDateString('ar-EG');
                }
            }

            if (ordersCount > 0) {
            }

            return {
                ...customer,
                ordersCount,
                lastOrder,
                lastOrderTimestamp
            };
        });


        state.customers = customersWithOrders;

        // إنشاء عملاء من الطلبات للعملاء المفقودين
        if (state.orders && state.orders.length > 0) {
            createCustomersFromOrders();
            // تحديث معلومات الطلبات للعملاء الجدد
            updateCustomersOrdersInfo();
        }

        state.customersError = null;

        if (!silent) {
            const filteredCustomers = getCustomersForDisplay();
            showToast('success', 'تحميل العملاء', `تم تحميل ${filteredCustomers.length} عميل بنجاح`);
        }
    } catch (error) {
        console.error('❌ Failed to fetch customers:', error);
        state.customers = [];
        state.customersError = error.message || 'حدث خطأ أثناء تحميل العملاء';
        showToast('error', 'خطأ في تحميل العملاء', state.customersError);
    } finally {
        state.customersLoading = false;
        renderCustomers();

        // تحديث إحصائيات نظرة عامة إذا كانت محملة
        if (state.currentSection === 'overview') {
            updateOverviewStats();
        }
    }
}

/**
 * جلب المستخدمين من API
 */
async function fetchUsers() {

    try {
        const response = await authorizedFetch(USERS_ENDPOINT);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const payload = await response.json();

        // استخراج المستخدمين من الاستجابة
        const users = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];

        showToast('success', 'تحميل المستخدمين', `تم تحميل ${users.length} مستخدم بنجاح`);
        return users;
    } catch (error) {
        console.error('❌ Failed to fetch users:', error);
        showToast('error', 'خطأ في تحميل المستخدمين', error.message || 'حدث خطأ أثناء تحميل المستخدمين');
        return [];
    }
}

/**
 * حذف مستخدم
 * @param {string} userId - معرف المستخدم
 */
async function deleteUser(userId) {
    if (!userId) return;

    confirmPopup('تأكيد حذف المستخدم', 'هل أنت متأكد من حذف هذا المستخدم؟', async () => {
        try {
            const response = await authorizedFetch(`${USERS_ENDPOINT}/${userId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                throw new Error(errorBody?.message || `HTTP ${response.status}`);
            }


            showToast('success', 'حذف المستخدم', 'تم حذف المستخدم بنجاح');

            // إعادة تحميل قائمة المستخدمين
            await fetchUsers();
        } catch (error) {
            console.error('❌ Failed to delete user:', error);
            showToast('error', 'خطأ في الحذف', error.message || 'حدث خطأ أثناء حذف المستخدم');
        }
    }, null, 'حذف', 'إلغاء');
}

/**
 * تغيير كلمة مرور المستخدم
 * @param {string} userId - معرف المستخدم
 * @param {string} newPassword - كلمة المرور الجديدة
 */
async function changeUserPassword(userId, newPassword) {
    if (!userId || !newPassword) {
        showToast('error', 'خطأ', 'يرجى إدخال كلمة المرور الجديدة');
        return;
    }


    try {
        const response = await authorizedFetch(`${USERS_ENDPOINT}/${userId}/change-password`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newPassword })
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody?.message || `HTTP ${response.status}`);
        }

        const result = await response.json();

        showToast('success', 'تغيير كلمة المرور', 'تم تغيير كلمة المرور بنجاح');
    } catch (error) {
        console.error('❌ Failed to change password:', error);
        showToast('error', 'خطأ في التغيير', error.message || 'حدث خطأ أثناء تغيير كلمة المرور');
    }
}

/**
 * عرض تفاصيل العميل
 * @param {string} customerId - معرف العميل
 */
function viewCustomerDetails(customerId) {
    const existingCustomer = state.customers?.find(c => (c._id || c.id) === customerId);

    if (!existingCustomer) {
        showToast('error', 'خطأ', 'لم يتم العثور على العميل');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'order-details-modal';
    modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

    const content = document.createElement('div');
    content.className = 'order-details-content';
    content.style.cssText = `
            background: var(--bg-base);
            color: var(--text-main);
            padding: 30px;
            border-radius: 12px;
            width: 90%;
            max-width: 700px;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        `;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
            position: absolute;
            top: 15px;
            left: 15px;
            background: #f44336;
            color: #fff;
            border: none;
            border-radius: 50%;
            width: 35px;
            height: 35px;
            font-size: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        `;

    const bodyWrapper = document.createElement('div');

    const renderContent = ({ customer, loading = false, error = null }) => {
        bodyWrapper.innerHTML = buildCustomerDetailsContent({ customer, loading, error, customerId });
        const ordersBtn = bodyWrapper.querySelector('[data-action="view-customer-orders"]');
        if (ordersBtn) {
            ordersBtn.addEventListener('click', () => {
                closeModal();
                viewCustomerOrders(customerId);
            });
        }
    };

    const closeModal = () => {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 300);
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    content.appendChild(closeBtn);
    content.appendChild(bodyWrapper);
    modal.appendChild(content);
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
        modal.style.opacity = '1';
    });

    renderContent({ customer: existingCustomer, loading: true });

    getFreshCustomerData(customerId)
        .then(freshCustomer => {
            if (freshCustomer) {
                const customers = Array.isArray(state.customers) ? [...state.customers] : [];
                const index = customers.findIndex(c => (c._id || c.id) === customerId);
                if (index !== -1) {
                    customers[index] = {
                        ...customers[index],
                        ...freshCustomer,
                        addresses: Array.isArray(freshCustomer.addresses) ? freshCustomer.addresses : []
                    };
                    state.customers = customers;
                }

                renderContent({ customer: freshCustomer, loading: false });
            } else {
                renderContent({ customer: existingCustomer, loading: false, error: 'تعذر تحميل بيانات العميل.' });
            }
        })
        .catch(error => {
            console.error('❌ فشل جلب بيانات العميل:', error);
            showToast('error', 'بيانات العميل', error?.message || 'تعذر تحميل بيانات العميل من الخادم.');
            renderContent({ customer: existingCustomer, loading: false, error: error?.message || 'تعذر تحميل بيانات العميل من الخادم.' });
        });
}

/**
 * عرض طلبات العميل فقط
 * تصفية بناءً على معرف العميل واسم المستخدم والبريد الإلكتروني
 * ⛔ لا نستخدم الهاتف للمقارنة
 * @param {string} customerId - معرف العميل
 */
function viewCustomerOrders(customerId) {
    const customer = state.customers?.find(c => (c._id || c.id) === customerId);

    if (!customer) {
        showToast('error', 'خطأ', 'لم يتم العثور على العميل');
        return;
    }

    // تصفية الطلبات الخاصة بهذا العميل فقط
    // استخدام دالة doesOrderBelongToCustomer للتأكد من أن الطلب ينتمي إلى هذا العميل تحديداً
    const customerOrders = (state.orders || []).filter(order => {
        const belongs = doesOrderBelongToCustomer(order, customer);
        if (belongs) {
        }
        return belongs;
    });



    // التحقق من أن جميع الطلبات تنتمي لهذا العميل فقط
    if (customerOrders.length === 0) {
        showToast('info', 'معلومة', `لا توجد طلبات مسجلة للعميل ${customer.name}`);
    }

    // إنشاء النافذة المنبثقة
    const modal = document.createElement('div');
    modal.className = 'order-details-modal';
    modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

    // حساب إجمالي المبيعات للعميل
    const totalOrderValue = customerOrders.reduce((sum, order) => sum + (order.total || 0), 0);

    const ordersHTML = customerOrders.length > 0
        ? `
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <thead>
                        <tr style="background: var(--bg-light); color: var(--text-main);">
                            <th style="padding: 12px; text-align: right; border: 1px solid var(--border);">رقم الطلب</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid var(--border);">التاريخ</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid var(--border);">المبلغ</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid var(--border);">الحالة</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid var(--border);">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${customerOrders.map((order, index) => `
                            <tr style="color: var(--text-main); ${index % 2 === 0 ? 'background: var(--bg-light);' : ''}">
                                <td style="padding: 10px; border: 1px solid var(--border);">${order.id}</td>
                                <td style="padding: 10px; border: 1px solid var(--border);">${order.date || 'غير محدد'}</td>
                                <td style="padding: 10px; border: 1px solid var(--border);"><strong>${formatCurrency(order.total || 0)}</strong></td>
                                <td style="padding: 10px; border: 1px solid var(--border);">${getStatusBadge(order.status)}</td>
                                <td style="padding: 10px; border: 1px solid var(--border);">
                                    <button class="action-btn view-order-details" data-order-id="${order.id}" title="عرض التفاصيل">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="action-btn print-order" data-order-id="${order.id}" title="طباعة">
                                        <i class="fas fa-print"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `
        : '<p style="text-align: center; color: var(--text-muted); padding: 40px;"><i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 20px;"></i>لا توجد طلبات لهذا العميل</p>';

    modal.innerHTML = `
            <div class="order-details-content" style="
                background: var(--bg-base);
                color: var(--text-main);
                padding: 30px;
                border-radius: 12px;
                width: 90%;
                max-width: 1000px;
                max-height: 90vh;
                overflow-y: auto;
                position: relative;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            ">
                <button class="close-btn" style="
                    position: absolute;
                    top: 15px;
                    left: 15px;
                    background: #f44336;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 35px;
                    height: 35px;
                    font-size: 20px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                    z-index: 10;
                ">×</button>
                
                <h2 style="text-align: center; margin-bottom: 25px; color: var(--text-main);">
                    <i class="fas fa-shopping-cart" style="margin-left: 10px; color: #e74c3c;"></i>
                    طلبات العميل: ${escapeHtml(customer.name || 'غير محدد')}
                </h2>
                
                <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; margin-bottom: 20px; color: var(--text-main); display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div>
                        <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">إجمالي الطلبات</p>
                        <p style="margin: 5px 0; font-size: 1.5rem; font-weight: bold; color: #e74c3c;">${customerOrders.length}</p>
                    </div>
                    <div>
                        <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">إجمالي المبيعات</p>
                        <p style="margin: 5px 0; font-size: 1.5rem; font-weight: bold; color: #27ae60;">${formatCurrency(totalOrderValue)}</p>
                    </div>
                    <div>
                        <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">البريد الإلكتروني</p>
                        <p style="margin: 5px 0; font-size: 0.95rem; word-break: break-all;">${escapeHtml(customer.email || 'غير محدد')}</p>
                    </div>
                </div>
                
                ${ordersHTML}
            </div>
        `;

    document.body.appendChild(modal);
    const rootStyles = getComputedStyle(document.documentElement);
    const sidebarWidth = rootStyles.getPropertyValue('--sidebar-width').trim() || '0px';

    const applyModalPadding = () => {
        if (window.innerWidth > 992) {
            modal.style.paddingRight = `calc(${sidebarWidth} + 40px)`;
        } else {
            modal.style.paddingRight = '20px';
        }
    };

    applyModalPadding();
    const handleResize = () => applyModalPadding();
    window.addEventListener('resize', handleResize);

    const cleanupHandlers = () => {
        document.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('resize', handleResize);
    };
    const fadeOutAndRemove = () => {
        modal.style.opacity = '0';
        setTimeout(() => {
            cleanupHandlers();
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    };

    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);

    // إغلاق النافذة
    const closeBtn = modal.querySelector('.close-btn');
    closeBtn.addEventListener('click', fadeOutAndRemove);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            fadeOutAndRemove();
        }
    });

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            fadeOutAndRemove();
        }
    };
    document.addEventListener('keydown', handleKeyDown);

    // إضافة معالجات للأزرار
    modal.querySelectorAll('.view-order-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const orderId = e.currentTarget.dataset.orderId;
            fadeOutAndRemove();
            viewOrderDetails(orderId);
        });
    });

    modal.querySelectorAll('.print-order').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const orderId = e.currentTarget.dataset.orderId;
            printOrder(orderId);
        });
    });
}

// ========================================
// ===== 12. تهيئة التطبيق =====
// ========================================

/**
 * تهيئة لوحة التحكم عند تحميل الصفحة
 * - إعداد الفلاتر
 * - ربط الأحداث
 * - جلب البيانات الأولية
 */
document.addEventListener('DOMContentLoaded', async () => {

    // إظهار شاشة التحميل
    dashboardLoader.show();

    try {
        // الخطوة 1: تهيئة الواجهة الأساسية
        dashboardLoader.updateStep(1, 'active');
        dashboardLoader.setProgress(10);

        initDescriptionInputs();
        refreshDescriptionCounters();

        // إعداد فلاتر الطلبات
        setupOrderFilters();
        setupModalCancels();

        dashboardLoader.setProgress(25);

        // إضافة مستمع حدث لتحديث الفئات الفرعية عند تغيير الفئة الرئيسية
        const categorySelect = document.getElementById('productCategory');
        if (categorySelect) {
            categorySelect.addEventListener('change', (e) => {
                const categoryId = e.target.value;
                populateSubcategoryOptions(categoryId);
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // EVENT DELEGATION: Initialize all delegated event listeners
        // ═══════════════════════════════════════════════════════════════

        // ═══════════════════════════════════════════════════════════════
        // EVENT DELEGATION: Brands List
        // ═══════════════════════════════════════════════════════════════
        const brandsListContainer = document.getElementById('brandsList');
        if (brandsListContainer) {
            brandsListContainer.addEventListener('click', (e) => {
                // ⚠️ MUST use .closest() - user may click the icon inside the button
                const editBtn = e.target.closest('.edit-brand');
                if (editBtn) {
                    const brandId = editBtn.dataset.brandId;
                    if (brandId) handleEditBrand(brandId);
                    return;
                }

                const deleteBtn = e.target.closest('.delete-brand');
                if (deleteBtn) {
                    const brandId = deleteBtn.dataset.brandId;
                    if (brandId) handleDeleteBrand(brandId);
                    return;
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // EVENT DELEGATION: Product Image Preview
        // ═══════════════════════════════════════════════════════════════
        const productImagePreview = document.getElementById('productImagePreview');
        if (productImagePreview) {
            productImagePreview.addEventListener('click', (e) => {
                // ⚠️ MUST use .closest() - button contains <i> icon
                const removeBtn = e.target.closest('.image-remove-btn');
                if (removeBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const imageIndex = parseInt(removeBtn.dataset.imageIndex, 10);
                    if (!isNaN(imageIndex)) {
                        removeProductImage(imageIndex);
                    }
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // EVENT DELEGATION: Products Grid
        // ═══════════════════════════════════════════════════════════════
        const productsGrid = document.getElementById('productsGrid');
        if (productsGrid) {
            productsGrid.addEventListener('click', (e) => {
                // Find the product card first
                const productCard = e.target.closest('.product-card');
                if (!productCard) return;

                const productId = productCard.dataset.productId;
                if (!productId) return;

                // ⚠️ MUST use .closest() for all button checks
                const editBtn = e.target.closest('[data-action="edit"]');
                if (editBtn) {
                    populateProductModal(productId);
                    openModal('addProductModal');
                    return;
                }

                const viewBtn = e.target.closest('[data-action="view"]');
                if (viewBtn) {
                    viewProductDetails(productId);
                    return;
                }

                const deleteBtn = e.target.closest('[data-action="delete"]');
                if (deleteBtn) {
                    handleDeleteProduct(productId);
                    return;
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // EVENT DELEGATION: Orders Table
        // ═══════════════════════════════════════════════════════════════
        const ordersTableBody = document.getElementById('ordersTableBody');
        if (ordersTableBody) {
            // Click delegation for buttons
            ordersTableBody.addEventListener('click', (e) => {
                const row = e.target.closest('tr');
                if (!row) return;

                const orderId = row.dataset.orderId;
                if (!orderId) return;

                // ⚠️ MUST use .closest()
                const viewBtn = e.target.closest('[data-action="view-order"]');
                if (viewBtn) {
                    viewOrderDetails(orderId);
                    return;
                }

                const printBtn = e.target.closest('[data-action="print-order"]');
                if (printBtn) {
                    printOrder(orderId);
                    return;
                }
            });

            // Change delegation for status dropdown
            ordersTableBody.addEventListener('change', (e) => {
                const statusSelect = e.target.closest('.order-status-select');
                if (statusSelect) {
                    const row = statusSelect.closest('tr');
                    const orderId = row?.dataset.orderId;
                    const newStatus = statusSelect.value;
                    if (orderId && newStatus) {
                        updateOrderStatus(orderId, newStatus);
                    }
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // EVENT DELEGATION: Categories List
        // ═══════════════════════════════════════════════════════════════
        const categoriesList = document.getElementById('categoriesList');
        if (categoriesList) {
            categoriesList.addEventListener('click', (e) => {
                const categoryCard = e.target.closest('.category-card');
                if (!categoryCard) return;

                const categoryId = categoryCard.dataset.categoryId;
                if (!categoryId) return;

                // ⚠️ MUST use .closest()
                const editBtn = e.target.closest('.edit-category');
                if (editBtn) {
                    populateCategoryModal(categoryId);
                    openModal('categoryModal');
                    return;
                }

                const deleteBtn = e.target.closest('.delete-category');
                if (deleteBtn) {
                    handleDeleteCategory(categoryId);
                    return;
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // EVENT DELEGATION: Subcategories List
        // ═══════════════════════════════════════════════════════════════
        const subcategoriesList = document.getElementById('subcategoriesList');
        if (subcategoriesList) {
            subcategoriesList.addEventListener('click', (e) => {
                const subcategoryCard = e.target.closest('.subcategory-card');
                if (!subcategoryCard) return;

                const subcategoryId = subcategoryCard.dataset.subcategoryId;
                const categoryId = subcategoryCard.dataset.categoryId;
                if (!subcategoryId) return;

                // ⚠️ MUST use .closest()
                const editBtn = e.target.closest('.edit-subcategory');
                if (editBtn) {
                    populateSubcategoryModal(categoryId, subcategoryId);
                    openModal('subcategoryModal');
                    return;
                }

                const deleteBtn = e.target.closest('.delete-subcategory');
                if (deleteBtn) {
                    handleDeleteSubcategory(categoryId, subcategoryId);
                    return;
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // EVENT DELEGATION: Banners Grid
        // ═══════════════════════════════════════════════════════════════
        const bannersGrid = document.getElementById('bannersGrid');
        if (bannersGrid) {
            bannersGrid.addEventListener('click', (e) => {
                const bannerCard = e.target.closest('.banner-card');
                if (!bannerCard) return;

                const bannerId = bannerCard.dataset.bannerId;
                if (!bannerId) return;

                // ⚠️ MUST use .closest()
                const editBtn = e.target.closest('.edit-banner');
                if (editBtn) {
                    populateBannerModal(bannerId);
                    openModal('bannerModal');
                    return;
                }

                const deleteBtn = e.target.closest('.delete-banner');
                if (deleteBtn) {
                    handleDeleteBanner(bannerId);
                    return;
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // EVENT DELEGATION: Customers Table
        // ═══════════════════════════════════════════════════════════════
        const customersTableBody = document.getElementById('customersTableBody');
        if (customersTableBody) {
            customersTableBody.addEventListener('click', (e) => {
                const row = e.target.closest('tr');
                if (!row) return;

                const customerId = row.dataset.customerId;
                if (!customerId) return;

                // ⚠️ MUST use .closest()
                const viewBtn = e.target.closest('[data-action="view-customer"]');
                if (viewBtn) {
                    openCustomerProfileModal(customerId);
                    return;
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // EVENT DELEGATION: Messages List (if exists)
        // ═══════════════════════════════════════════════════════════════
        const messagesList = document.getElementById('messagesList');
        if (messagesList) {
            messagesList.addEventListener('click', (e) => {
                const messageItem = e.target.closest('.message-item');
                if (!messageItem) return;

                const messageId = messageItem.dataset.messageId;
                if (!messageId) return;

                // ⚠️ MUST use .closest()
                const viewBtn = e.target.closest('.view-message');
                if (viewBtn) {
                    viewMessage(messageId);
                    return;
                }

                const deleteBtn = e.target.closest('.delete-message');
                if (deleteBtn) {
                    handleDeleteMessage(messageId);
                    return;
                }

                const replyBtn = e.target.closest('.reply-message');
                if (replyBtn) {
                    handleReplyMessage(messageId);
                    return;
                }
            });
        }

        // جلب البيانات الأولية من API
        dashboardLoader.updateStep(2, 'active');
        dashboardLoader.setProgress(40);

        await fetchOrders();
        await fetchCustomers();

        dashboardLoader.setProgress(80);

        // إعداد زر التحديث
        const refreshBtn = document.getElementById('refreshOrdersBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', fetchOrders);
        }

        // إعداد حقل البحث عن العملاء
        const customerSearchInput = document.getElementById('customerSearchInput');
        if (customerSearchInput) {
            customerSearchInput.addEventListener('input', (e) => {
                if (!state.filters) state.filters = {};
                state.filters.customerSearch = e.target.value;
                renderCustomers();
            });
        }

        setupCustomerFilters();

        // إعداد فلاتر التحليلات ونطاق التاريخ
        const analyticsTimeFilter = document.getElementById('analyticsTimeFilter');
        const analyticsStartInput = document.getElementById('analyticsStartDate');
        const analyticsEndInput = document.getElementById('analyticsEndDate');

        const ensureFilterState = () => {
            if (!state.filters) {
                state.filters = {};
            }
        };

        const millisecondsPerDay = 24 * 60 * 60 * 1000;

        const setDateInputsDisabled = (disabled) => {
            if (analyticsStartInput) analyticsStartInput.disabled = disabled;
            if (analyticsEndInput) analyticsEndInput.disabled = disabled;
        };

        const setAnalyticsRangeState = (rangeLabel, startDate, endDate, explicitDays = null) => {
            ensureFilterState();
            if (!startDate || !endDate) return;

            const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);

            state.filters.analyticsRange = rangeLabel;
            state.filters.analyticsStart = normalizedStart.toISOString();
            state.filters.analyticsEnd = normalizedEnd.toISOString();

            const daysCount = explicitDays ?? Math.max(1, Math.round((normalizedEnd - normalizedStart) / millisecondsPerDay) + 1);
            state.filters.analyticsDays = isNaN(daysCount) ? null : daysCount;

            if (analyticsStartInput) analyticsStartInput.value = formatDateInputValue(normalizedStart);
            if (analyticsEndInput) analyticsEndInput.value = formatDateInputValue(normalizedEnd);
        };

        const refreshAnalytics = () => {
            try {
                loadAnalyticsCharts();
            } catch (error) {
                console.error('⚠️ Failed to refresh analytics charts:', error);
            }
        };

        const applyPresetRange = (days, triggerRefresh = true) => {
            const validDays = Number.isFinite(days) && days > 0 ? days : 30;
            const now = new Date();
            const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - (validDays - 1));

            setDateInputsDisabled(false);
            setAnalyticsRangeState(String(validDays), startDate, endDate, validDays);

            if (analyticsTimeFilter && analyticsTimeFilter.value !== String(validDays)) {
                analyticsTimeFilter.value = String(validDays);
            }

            if (triggerRefresh) {
                refreshAnalytics();
            }
        };

        const ensureCustomDefaults = () => {
            const now = new Date();
            const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            const defaultStart = new Date(defaultEnd);
            defaultStart.setDate(defaultStart.getDate() - 6);
            return { start: defaultStart, end: defaultEnd };
        };

        const applyCustomRange = (startValue, endValue, triggerRefresh = true) => {
            setDateInputsDisabled(false);

            let startDate = parseDateValue(startValue) || parseDateValue(state.filters?.analyticsStart);
            let endDate = parseDateValue(endValue) || parseDateValue(state.filters?.analyticsEnd);

            if (!startDate || !endDate) {
                const defaults = ensureCustomDefaults();
                startDate = defaults.start;
                endDate = defaults.end;
            }

            if (startDate > endDate) {
                const temp = startDate;
                startDate = endDate;
                endDate = temp;
            }

            setAnalyticsRangeState('custom', startDate, endDate);

            if (analyticsTimeFilter && analyticsTimeFilter.value !== 'custom') {
                analyticsTimeFilter.value = 'custom';
            }

            if (triggerRefresh) {
                refreshAnalytics();
            }
        };

        if (analyticsTimeFilter || analyticsStartInput || analyticsEndInput) {
            ensureFilterState();

            const initialValue = analyticsTimeFilter ? analyticsTimeFilter.value : '30';
            if (initialValue === 'custom') {
                applyCustomRange(analyticsStartInput?.value, analyticsEndInput?.value, false);
            } else {
                applyPresetRange(parseInt(initialValue, 10) || 30, false);
            }
        }

        if (analyticsTimeFilter) {
            analyticsTimeFilter.addEventListener('change', (event) => {
                const value = event.target.value;
                if (value === 'custom') {
                    applyCustomRange(analyticsStartInput?.value, analyticsEndInput?.value);
                } else {
                    const days = parseInt(value, 10);
                    applyPresetRange(days);
                }
            });
        }

        if (analyticsStartInput) {
            analyticsStartInput.addEventListener('change', () => {
                if (analyticsTimeFilter && analyticsTimeFilter.value !== 'custom') {
                    analyticsTimeFilter.value = 'custom';
                }
                applyCustomRange(analyticsStartInput.value, analyticsEndInput?.value);
            });
        }

        if (analyticsEndInput) {
            analyticsEndInput.addEventListener('change', () => {
                if (analyticsTimeFilter && analyticsTimeFilter.value !== 'custom') {
                    analyticsTimeFilter.value = 'custom';
                }
                applyCustomRange(analyticsStartInput?.value, analyticsEndInput.value);
            });
        }


        // =========================================
        // دالة تشخيصية: مساعدة المسؤول على فهم سبب تعدد الطلبات
        // =========================================
        window.debugCustomerOrders = function (customerIndex = 0) {
            const customers = state.customers || [];
            if (customerIndex >= customers.length) {
                console.error('❌ العميل غير موجود');
                return;
            }

            const customer = customers[customerIndex];


            const orders = state.orders || [];

            orders.forEach((order, idx) => {
                const belongs = doesOrderBelongToCustomer(order, customer);
                const status = belongs ? '✅' : '❌';


            });
        };

        // مثال على الاستخدام:
        // debugCustomerOrders(0)  // لتشخيص العميل الأول
        // debugCustomerOrders(1)  // لتشخيص العميل الثاني

        // الخطوة 2: تحديث الخطوة الثانية
        dashboardLoader.updateStep(1, 'completed');
        dashboardLoader.updateStep(2, 'active');
        dashboardLoader.setProgress(60);

        // جلب البيانات
        await fetchOrders();
        await fetchCustomers();

        dashboardLoader.setProgress(85);

        // الخطوة 3: تحميل الرسوم البيانية
        dashboardLoader.updateStep(2, 'completed');
        dashboardLoader.updateStep(3, 'active');

        // تأكد من تحميل الرسوم البيانية
        setTimeout(() => {
            dashboardLoader.updateStep(3, 'completed');
            dashboardLoader.setProgress(100);

            // إخفاء الـ Loader
            setTimeout(() => {
                dashboardLoader.hide();
            }, 500);
        }, 800);

    } catch (error) {
        console.error('❌ خطأ في تحميل Dashboard:', error);
        dashboardLoader.setProgress(100);
        setTimeout(() => {
            dashboardLoader.hide();
            showToast('error', 'خطأ', 'تعذر تحميل لوحة التحكم. حاول مرة أخرى.');
        }, 1000);
    }

}); 