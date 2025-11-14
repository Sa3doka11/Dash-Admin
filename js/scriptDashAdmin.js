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
// ===== 1. إعدادات API =====
// ========================================

const ADMIN_API_BASE_URL = 'https://action-sports-api.vercel.app/api';
const BRAND_API = `${ADMIN_API_BASE_URL}/brands`;
const CUSTOMER_ENDPOINT = `${ADMIN_API_BASE_URL}/customers`;
const CATEGORY_ENDPOINT = `${ADMIN_API_BASE_URL}/categories`;
const SUBCATEGORY_ENDPOINT = (categoryId) => `${CATEGORY_ENDPOINT}/${encodeURIComponent(categoryId)}/subcategories`;
const SUBCATEGORY_DETAIL_ENDPOINT = (categoryId, subcategoryId) => `${SUBCATEGORY_ENDPOINT(categoryId)}/${encodeURIComponent(subcategoryId)}`;
const PRODUCT_ENDPOINT = `${ADMIN_API_BASE_URL}/products`;
const ORDER_ENDPOINT = `${ADMIN_API_BASE_URL}/orders`;
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
            state.messages = mockMessages.map(msg => ({ ...msg }));
        } else {
            state.messages = normalizedMessages;
        }

        state.unreadMessages = state.messages.filter(msg => !msg.isRead).length;
        state.messagesLoaded = true;
        state.messagesLastFetched = Date.now();
        setMessagesError(null);
        updateMessagesBadge();
    } catch (error) {
        console.error('❌ Failed to fetch messages:', error);
        setMessagesError(error?.message || 'تعذر تحميل الرسائل.');

        if (!state.messagesLoaded && !state.messages.length && mockMessages.length) {
            state.messages = mockMessages.map(msg => ({ ...msg }));
            state.unreadMessages = state.messages.filter(msg => !msg.isRead).length;
            state.messagesLoaded = true;
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
        console.error('❌ Failed to initialize messages panel:', error);
    });
}

function updateMessagesBadge() {
    const badge = document.getElementById('messagesBadge');
    if (!badge) return;
    badge.textContent = state.unreadMessages > 9 ? '9+' : String(state.unreadMessages || 0);
    badge.hidden = state.unreadMessages === 0;
}

function renderMessagesList(filterValue = '') {
    const list = document.getElementById('messagesList');
    if (!list) return;

    const filter = String(filterValue || state.filters.messagesSearch || '').trim();
    state.filters.messagesSearch = filter;

    if (state.messagesLoading) {
        list.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>جاري تحميل الرسائل...</p>
            </div>
        `;
        return;
    }

    if (state.messagesError) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>تعذر تحميل الرسائل</h3>
                <p>${escapeHtml(state.messagesError)}</p>
                <button class="btn-secondary btn-sm" data-action="refresh-messages">
                    <i class="fas fa-sync-alt"></i> إعادة المحاولة
                </button>
            </div>
        `;
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
        list.innerHTML = '<p class="empty-state">لا توجد رسائل مطابقة.</p>';
        return;
    }

    list.innerHTML = filteredMessages.map(msg => createMessageItemMarkup(msg)).join('');
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
                console.error('❌ Failed to load messages on open:', error);
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
        console.error('❌ Failed to mark message as watched:', error);
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
            console.error('❌ Failed to refresh messages:', error);
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
    console.log('🎨 Rendering brands...', state.brands);
    
    const list = document.getElementById('brandsList');
    const emptyState = document.getElementById('brandsEmptyState');
    
    if (!list) {
        console.error('❌ brandsList element not found!');
        return;
    }
    if (!emptyState) {
        console.error('❌ brandsEmptyState element not found!');
        return;
    }

    // التأكد من أن brands هو array
    if (!Array.isArray(state.brands)) {
        console.error('❌ state.brands is not an array:', state.brands);
        state.brands = [];
    }

    // تصفية العلامات التجارية بناءً على البحث
    const searchTerm = state.filters.brandSearch?.toLowerCase() || '';
    const filteredBrands = state.brands.filter(brand => 
        brand.name?.toLowerCase().includes(searchTerm)
    );

    console.log('🔍 Filtered brands:', filteredBrands.length);

    if (filteredBrands.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'flex';
        console.log('📭 No brands to display');
        return;
    }

    emptyState.style.display = 'none';
    console.log('✅ Rendering', filteredBrands.length, 'brands');
    
    list.innerHTML = filteredBrands.map(brand => {
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
    }).join('');

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

    list.innerHTML = filteredSubcategories.map(subcategory => {
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
                    <p class="subcategory-description">${escapeHtml(truncateText(description, DESCRIPTION_MAX_LENGTH))}</p>
                </div>
                <div class="subcategory-actions">
                    <button class="btn-danger btn-sm" data-action="delete-subcategory" data-entity-id="${subcategory.id}" data-category-id="${parentCategoryId}" data-entity-name="${escapeHtml(subcategory.name)}" title="حذف"><i class="fas fa-trash"></i></button>
                    <button class="btn-secondary btn-sm" data-open-modal="subcategoryModal" data-modal-mode="edit" data-entity="subcategory" data-entity-id="${subcategory.id}" data-category-id="${parentCategoryId}" title="تعديل"><i class="fas fa-edit"></i> تعديل</button>
                </div>
            </div>
        `;
    }).join('');
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

function authorizedFetch(url, options = {}) {
    if (!window.adminAuth) {
        return fetch(url, options);
    }

    const authHeader = window.adminAuth.getAuthHeader?.() || {};

    if (options.headers instanceof Headers) {
        Object.entries(authHeader).forEach(([key, value]) => {
            if (value) options.headers.set(key, value);
        });
        return fetch(url, { ...options, headers: options.headers });
    }

    const mergedHeaders = { ...authHeader, ...(options.headers || {}) };
    return fetch(url, { ...options, headers: mergedHeaders });
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
    banners: [
        { id: 'BN-1', title: 'عرض الصيف الكبير', placement: 'home_hero', status: 'active', image: 'https://via.placeholder.com/1200x400?text=Banner' }
    ],
    pages: [
        { id: 'PG-1', title: 'من نحن', updatedAt: '2025-10-20' }
    ],
    features: [
        { id: 'FT-1', icon: 'fas fa-shipping-fast', title: 'توصيل خلال 24 ساعة', description: 'شحن سريع لجميع المحافظات', status: 'active' }
    ],
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
        customerSegment: 'all',
        auditSearch: '',
        auditAction: 'all',
        auditDate: '',
        analyticsRange: '7d',
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
    // القسم الحالي
    currentSection: 'overview',
    messages: [],
    unreadMessages: 0,
    messagesLoading: false,
    messagesError: null,
    messagesLoaded: false,
    messagesLastFetched: 0
};

// ========================================
// ===== 9. بيانات الحالات (Status Metadata) =====
// ========================================

const STATUS_META = {
    active: { label: 'نشط', class: 'status-active' },
    inactive: { label: 'غير نشط', class: 'status-inactive' },
    scheduled: { label: 'مجدول', class: 'status-scheduled' },
    paused: { label: 'متوقف', class: 'status-paused' },
    completed: { label: 'مكتمل', class: 'status-completed' },
    shipped: { label: 'تم الشحن', class: 'status-shipped' },
    processing: { label: 'قيد المعالجة', class: 'status-processing' },
    new: { label: 'جديد', class: 'status-new' },
    cancelled: { label: 'ملغي', class: 'status-cancelled' },
    low_stock: { label: 'مخزون منخفض', class: 'status-warning' },
    login: { label: 'تسجيل دخول', class: 'action-login' },
    create: { label: 'إضافة', class: 'action-create' },
    update: { label: 'تعديل', class: 'action-update' },
    delete: { label: 'حذف', class: 'action-delete' }
};

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

    console.log('📝 Populating subcategory form:', { categoryId: resolvedCategoryId, subcategory, extras });

    setFieldValue(form, 'id', subcategory?.id || '');
    setFieldValue(form, 'categoryId', resolvedCategoryId);
    setFieldValue(form, 'originalCategoryId', subcategory?.categoryId || resolvedCategoryId);
    setFieldValue(form, 'name', subcategory?.name || '');
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
    const targetImage = extras?.image ?? subcategory?.image ?? '';
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
}

async function handleProductFormSubmit(event) {
    event.preventDefault();
    const form = event.target.closest('form');
    if (!form || form.dataset.entity !== 'product') {
        console.error('❌ Invalid form element');
        return;
    }

    console.log('📝 Submitting product form...');

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
        
        try {
            // بناء بيانات المنتج
            const payload = buildProductPayload(form);
            
            // الحصول على ملفات الصور
            const imageInput = form.querySelector('#productImage');
            const imageFiles = imageInput?.files ? Array.from(imageInput.files) : [];
            
            console.log('📸 Selected images:', imageFiles.length);

            try {
                // طباعة البيانات للتشخيص
                console.log('📤 Payload being sent:', JSON.stringify(payload, null, 2));
                
                // إضافة رسالة تحميل
                showToast('info', 'جاري الحفظ', 'جاري حفظ المنتج، يرجى الانتظار...', 2000);
                
                if (mode === 'edit' && id) {
                    await updateProduct(id, payload, imageFiles);
                    showToast('success', 'تم التحديث', 'تم تحديث المنتج بنجاح');
                } else {
                    await createProduct(payload, imageFiles);
                    showToast('success', 'تمت الإضافة', 'تمت إضافة المنتج بنجاح');
                    form.reset(); // إعادة تعيين النموذج بعد الإضافة
                }
                
                // إغلاق المودال بعد الحفظ
                const modal = document.getElementById('addProductModal');
                if (modal) {
                    const modalInstance = bootstrap.Modal.getInstance(modal);
                    if (modalInstance) {
                        modalInstance.hide();
                    }
                }
                
                // تحديث قائمة المنتجات
                await fetchProducts();
                
            } catch (error) {
                console.error('❌ Error saving product:', error);
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
            console.error('❌ Error in buildProductPayload:', error);
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
        console.error('❌ Error in handleProductFormSubmit:', error);
        
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
        console.warn('Failed to load current section', error);
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
        brand: rawProduct.brand?.name || rawProduct.brand || '',
        brandId,
        brandName,
        colors,
        sold,
        rating,
        raw: rawProduct
    };
}

function syncProductExtras(products = []) {
    state.productExtras = products.reduce((acc, product) => {
        acc[product.id] = {
            image: product.image,
            description: product.description
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
// Helper function to get auth token
function getAuthToken() {
    return window.adminAuth?.getToken() || '';
}

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
            const response = await fetch(BRAND_API, {
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('📦 Raw brands response:', data);

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

            console.log('✅ Brands fetched:', state.brands.length, state.brands);
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

        const response = await fetch(BRAND_API, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Brand created:', data);
        return data;
    } catch (error) {
        console.error('❌ Failed to create brand:', error);
        throw error;
    }
}

async function updateBrand(brandId, brandData = {}, imageFile = null) {
    console.log('✏️ Updating brand:', { brandId, imageProvided: !!imageFile, brandData });

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
    console.log('✅ Brand updated:', updatedBrand);

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
        const response = await fetch(`${BRAND_API}/${brandId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Brand deleted:', data);
        return data;
    } catch (error) {
        console.error(`❌ Failed to delete brand ${brandId}:`, error);
        throw error;
    }
}

async function fetchCategories() {
    console.log('🔄 Fetching categories...');
    state.categoriesLoading = true;
    state.categoriesError = null;
    renderCategories();

    try {
        const response = handleUnauthorized(await authorizedFetch(CATEGORY_ENDPOINT));
        console.log('📡 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        console.log('📦 Raw API response:', payload);

        const documents = Array.isArray(payload?.data?.documents)
            ? payload.data.documents
            : Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload)
                    ? payload
                    : [];

        console.log('📋 Extracted documents:', documents);

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

        console.log('✅ Normalized categories:', normalized);

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
        console.error('❌ Failed to fetch categories:', error);
        state.categoriesError = 'تعذر تحميل الفئات. يرجى المحاولة مرة أخرى.';
    } finally {
        state.categoriesLoading = false;
        renderCategories();
        hydrateFilters(); // تحديث فلتر الفئات في قسم المنتجات
    }
}

async function fetchProducts() {
    console.log('🔄 Fetching products...');
    state.productsLoading = true;
    state.productsError = null;
    renderProducts();

    try {
        const response = handleUnauthorized(await authorizedFetch(PRODUCT_ENDPOINT));
        console.log('📡 Products response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        console.log('📦 Raw products response:', payload);

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
                    description: extras?.description || product.description
                };
            });

        console.log('✅ Normalized products:', normalized);

        state.products = normalized;
        syncProductExtras(normalized);
    } catch (error) {
        console.error('❌ Failed to fetch products:', error);
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

    console.log('📦 Product FormData entries:');
    for (let [key, value] of formData.entries()) {
        console.log(`  ${key}:`, value instanceof File ? `File(${value.name})` : value);
    }

    return { body: formData, headers: null };
}

async function createProduct(payload, imageFiles = []) {
    console.log('➕ Creating product:', payload);
    console.log('📸 Image files:', imageFiles.length);

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
                console.log(`📎 Added image ${index + 1}:`, file.name);
            });
        }

        const response = await authorizedFetch(PRODUCT_ENDPOINT, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Create product error response:', data);
            const errorMessage = data.message || `HTTP ${response.status} - ${response.statusText}`;
            throw new Error(errorMessage);
        }

        console.log('✅ Product created successfully:', data);
        return data;
    } catch (error) {
        console.error('❌ Failed to create product:', error);
        throw error;
    }
}

// دالة تحديث المنتج
async function updateProduct(productId, payload, imageFiles = []) {
    console.log('✏️ Updating product:', { productId, files: imageFiles.length });

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

        if (imageFiles && imageFiles.length > 0) {
            imageFiles.forEach((file, index) => {
                if (file instanceof File) {
                    formData.append('images', file);
                    console.log(`📎 Added image ${index + 1}:`, file.name);
                }
            });
        }

        const response = await authorizedFetch(`${PRODUCT_ENDPOINT}/${encodeURIComponent(productId)}`, {
            method: 'PATCH',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Update product error:', data);
            const errorMessage = data.message || `HTTP ${response.status} - ${response.statusText}`;
            throw new Error(errorMessage);
        }

        console.log('✅ Product updated successfully:', data);

        const updatedProduct = data.data || data;

        if (updatedProduct) {
            upsertProductExtras(productId, {
                image: updatedProduct.images?.[0] || updatedProduct.image || '',
                description: updatedProduct.description || ''
            });
        }

        return updatedProduct;
    } catch (error) {
        console.error('❌ Failed to update product:', error);
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

    const skuMarkup = product.sku
        ? `
            <div class="product-details-card">
                <span class="product-details-label">رمز المنتج (SKU)</span>
                <span class="product-details-value">${product.sku}</span>
            </div>
        `
        : '';

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
                ${product.image ? `
                    <div class="product-details-image">
                        <img src="${product.image}" alt="${product.name}">
                    </div>
                ` : ''}
                <div class="product-details-info">
                    <h3 class="product-details-title">${product.name}</h3>
                    ${product.description ? `<p class="product-details-description">${product.description}</p>` : ''}
                    <div class="product-details-stats">
                        <div class="product-details-card">
                            <span class="product-details-label">السعر</span>
                            <span class="product-details-value price">${formatCurrency(product.price)}</span>
                        </div>
                        ${stockMarkup}
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

async function deleteProduct(productId, { productName } = {}) {
    console.log('🗑️ Deleting product:', productId);

    if (!productId) return;

    const confirmationMessage = productName
        ? `هل أنت متأكد من حذف المنتج "${productName}"؟ لا يمكن التراجع عن هذا الإجراء.`
        : 'هل أنت متأكد من حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء.';

    if (!confirm(confirmationMessage)) {
        return;
    }

    try {
        const response = handleUnauthorized(await authorizedFetch(`${PRODUCT_ENDPOINT}/${encodeURIComponent(productId)}`, {
            method: 'DELETE'
        }));

        console.log('📡 Delete product status:', response.status);

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error('❌ Delete product error:', errorBody);
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        await fetchProducts();
        showToast('success', 'حذف المنتج', 'تم حذف المنتج بنجاح');
    } catch (error) {
        console.error('❌ Failed to delete product:', error);
        showToast('error', 'حذف المنتج', error.message || 'حدث خطأ غير متوقع');
    }
}

async function createCategory(payload, extras = {}, imageFile = null) {
    console.log('➕ Creating category:', { payload, extras, hasFile: !!imageFile });
    
    try {
        const { body, headers } = buildCategoryRequestOptions(payload, {
            description: extras.description
        }, imageFile);

        console.log('📤 Request body type:', body instanceof FormData ? 'FormData' : 'JSON');

        const response = handleUnauthorized(await authorizedFetch(CATEGORY_ENDPOINT, {
            method: 'POST',
            headers: headers || undefined,
            body
        }));

        console.log('📡 Create response status:', response.status);

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error('❌ Create error:', errorBody);
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const responseData = await response.json();
        console.log('✅ Create response:', responseData);

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
        console.error('❌ Failed to create category:', error);
        showToast('error', 'إضافة الفئة', error.message || 'حدث خطأ غير متوقع');
    }
}

async function updateCategory(categoryId, payload, extras = {}, imageFile = null) {
    console.log('✏️ Updating category:', { categoryId, payload, extras, hasFile: !!imageFile });
    
    if (!categoryId) return;
    
    try {
        const { body, headers } = buildCategoryRequestOptions(payload, {
            description: extras.description
        }, imageFile);

        console.log('📤 Update request body type:', body instanceof FormData ? 'FormData' : 'JSON');

        const response = handleUnauthorized(await authorizedFetch(`${CATEGORY_ENDPOINT}/${encodeURIComponent(categoryId)}`, {
            method: 'PATCH',
            headers: headers || undefined,
            body
        }));

        console.log('📡 Update response status:', response.status);

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error('❌ Update error:', errorBody);
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const responseData = await response.json();
        console.log('✅ Update response:', responseData);

        const document = responseData?.data?.category
            ?? responseData?.data
            ?? responseData;

        if (document && typeof document === 'object') {
            const normalized = normalizeCategory(document, 0);
            if (normalized) {
                upsertCategory(normalized);
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
        console.error('❌ Failed to update category:', error);
        showToast('error', 'تحديث الفئة', error.message || 'حدث خطأ غير متوقع');
    }
}

async function deleteCategory(categoryId) {
    console.log('🗑️ Deleting category:', categoryId);

    if (!categoryId) return;

    try {
        const response = handleUnauthorized(await authorizedFetch(`${CATEGORY_ENDPOINT}/${encodeURIComponent(categoryId)}`, {
            method: 'DELETE'
        }));

        console.log('📡 Delete response status:', response.status);

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error('❌ Delete error:', errorBody);
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        console.log('✅ Category deleted successfully');

        await fetchCategories();
        showToast('success', 'حذف الفئة', 'تم حذف الفئة بنجاح');
    } catch (error) {
        console.error('❌ Failed to delete category:', error);
        showToast('error', 'حذف الفئة', error.message || 'حدث خطأ غير متوقع');
    }
}

function buildSubcategoryRequestOptions(payload = {}, imageFile = null) {
    const dataPayload = { ...payload };

    if (imageFile instanceof File) {
        delete dataPayload.image;
        const formData = new FormData();
        Object.entries(dataPayload).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                formData.append(key, value);
            }
        });
        formData.append('image', imageFile);

        console.log('📦 Subcategory FormData entries:');
        for (let [key, value] of formData.entries()) {
            console.log(`  ${key}:`, value instanceof File ? `File(${value.name})` : value);
        }

        return { body: formData, headers: null };
    }

    console.log('📦 Subcategory JSON payload:', dataPayload);
    return {
        body: JSON.stringify(dataPayload),
        headers: { 'Content-Type': 'application/json' }
    };
}

function buildSubcategoryFormData(formData) {
    if (!(formData instanceof FormData)) {
        return {
            categoryId: '',
            originalCategoryId: '',
            subcategoryId: '',
            payload: {},
            imageFile: null
        };
    }

    const categoryId = getFormValue(formData, 'categoryId');
    const originalCategoryId = getFormValue(formData, 'originalCategoryId');
    const subcategoryId = getFormValue(formData, 'id');
    const name = getFormValue(formData, 'name');
    const slug = getFormValue(formData, 'slug') || slugify(name);
    const descriptionField = form.querySelector('[name="description"]');
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

    if (!categoryId) {
        console.warn('⚠️ fetchSubcategories called without categoryId');
        return [];
    }

    if (!force && state.subcategoriesLoading[categoryId]) {
        return getSubcategories(categoryId);
    }

    console.log('🔄 Fetching subcategories for category:', categoryId);
    setSubcategoryLoading(categoryId, true);
    setSubcategoryError(categoryId, null);

    try {
        const response = handleUnauthorized(await authorizedFetch(SUBCATEGORY_ENDPOINT(categoryId)));
        console.log('📡 Subcategories response status:', response.status);

        if (!response.ok) {
            if (response.status === 404) {
                console.info('ℹ️ No subcategories found for category:', categoryId);
                state.subcategories[categoryId] = [];
                setSubcategoryError(categoryId, null);
                return [];
            }

            const errorBody = await response.json().catch(() => ({}));
            console.error('❌ Fetch subcategories error:', errorBody);
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const payload = await response.json();
        console.log('📦 Raw subcategories response:', payload);

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

    console.log('➕ Creating subcategory:', { categoryId, payload, hasFile: !!imageFile });

    try {
        const { body, headers } = buildSubcategoryRequestOptions(payload, imageFile);

        const response = handleUnauthorized(await authorizedFetch(SUBCATEGORY_ENDPOINT(categoryId), {
            method: 'POST',
            headers: headers || undefined,
            body
        }));

        console.log('📡 Create subcategory status:', response.status);

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error('❌ Create subcategory error:', errorBody);
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const responseData = await response.json();
        console.log('✅ Create subcategory response:', responseData);

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

    console.log('✏️ Updating subcategory:', { categoryId, subcategoryId, payload, hasFile: !!imageFile, previousCategoryId });

    try {
        const { body, headers } = buildSubcategoryRequestOptions(payload, imageFile);

        const response = handleUnauthorized(await authorizedFetch(SUBCATEGORY_DETAIL_ENDPOINT(categoryId, subcategoryId), {
            method: 'PATCH',
            headers: headers || undefined,
            body
        }));

        console.log('📡 Update subcategory status:', response.status);

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error('❌ Update subcategory error:', errorBody);
            const message = errorBody?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const responseData = await response.json();
        console.log('✅ Update subcategory response:', responseData);

        const document = responseData?.data?.subcategory
            ?? responseData?.data
            ?? responseData;

        const normalized = normalizeSubcategory(document, 0, categoryId) || {
            id: subcategoryId,
            ...payload,
            categoryId
        };

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

        if (previousCategoryId && previousCategoryId !== categoryId) {
            removeSubcategory(previousCategoryId, subcategoryId);
        }

        await fetchSubcategories(categoryId, { force: true });
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

    console.log('🗑️ Deleting subcategory:', { categoryId, subcategoryId });

    try {
        const response = handleUnauthorized(await authorizedFetch(SUBCATEGORY_DETAIL_ENDPOINT(categoryId, subcategoryId), {
            method: 'DELETE'
        }));

        console.log('📡 Delete subcategory status:', response.status);

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

        console.log('📦 FormData entries:');
        for (let [key, value] of formData.entries()) {
            console.log(`  ${key}:`, value instanceof File ? `File(${value.name})` : value);
        }

        return { body: formData, headers: null };
    }

    console.log('📦 JSON payload:', dataPayload);

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

function updateProductImagePreview(image) {
    const preview = document.getElementById('productImagePreview');
    if (!preview) return;

    if (image) {
        preview.innerHTML = `<img src="${image}" alt="صورة المنتج">`;
        preview.classList.add('has-image');
    } else {
        preview.innerHTML = '<span class="image-preview__placeholder">لم يتم اختيار صورة</span>';
        preview.classList.remove('has-image');
    }
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

    console.log('🖼️ Selected image:', file.name, file.type, file.size);

    try {
        const dataUrl = await readFileAsDataUrl(file);
        input.dataset.previewImage = dataUrl;
        updateCategoryImagePreview(dataUrl);
        console.log('✅ Image preview updated');
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

    console.log('🖼️ Selected subcategory image:', file.name, file.type, file.size);

    try {
        const dataUrl = await readFileAsDataUrl(file);
        input.dataset.previewImage = dataUrl;
        updateSubcategoryImagePreview(dataUrl);
        console.log('✅ Subcategory image preview updated');
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

    console.log('🖼️ Selected brand image:', file.name, file.type, file.size);

    try {
        const dataUrl = await readFileAsDataUrl(file);
        updateBrandImagePreview(dataUrl);
        console.log('✅ Brand image preview updated');
    } catch (error) {
        console.error('❌ Failed to preview brand image:', error);
        showToast('error', 'صورة العلامة التجارية', 'تعذر معاينة ملف الصورة المحدد');
    }
}

async function handleProductImageChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;

    const file = input.files?.[0] || null;

    if (!file) {
        input.dataset.previewImage = '';
        updateProductImagePreview(input.dataset.originalImage || input.form?.dataset.productImageOriginal || '');
        return;
    }

    console.log('🖼️ Selected product image:', `${file.name} (${Math.round(file.size / 1024)} KB)`);

    try {
        const dataUrl = await readFileAsDataUrl(file);
        input.dataset.previewImage = dataUrl;
        updateProductImagePreview(dataUrl);
    } catch (error) {
        console.error('❌ Failed to preview product image:', error);
        showToast('error', 'صورة المنتج', 'تعذر معاينة ملف الصورة المحدد');
        input.value = '';
        updateProductImagePreview(input.dataset.originalImage || input.form?.dataset.productImageOriginal || '');
    }
}

// ===== Form Handlers =====
async function handleCategoryFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form || form.dataset.entity !== 'category') return;

    console.log('📝 Submitting category form...');

    const formData = new FormData(form);
    const mode = form.dataset.mode || 'create';
    const id = formData.get('id');

    const name = getFormValue(formData, 'name');
    const slug = getFormValue(formData, 'slug') || slugify(name);
    const description = getFormValue(formData, 'description');
    const imageInput = form.querySelector('#categoryImage');
    const imageFile = imageInput?.files?.[0];

    console.log('📋 Form data:', { mode, id, name, slug, hasFile: !!imageFile });

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
            console.log('✅ Image converted to base64');
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

    const normalizedDescription = description || '';
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

        if (normalizedDescription !== originalDescription) {
            extras.description = normalizedDescription;
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
        extras.description = normalizedDescription;

        await createCategory(payload, extras, imageFile);
    }
}

async function handleBrandFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form || form.dataset.entity !== 'brand') return;

    console.log('📝 Submitting brand form...');

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
    if (!confirm('هل أنت متأكد من حذف هذه العلامة التجارية؟')) return;

    try {
        await deleteBrand(brandId);
        showToast('success', 'حذف العلامة التجارية', 'تم حذف العلامة التجارية بنجاح');
        await fetchBrands();
        renderBrands();
    } catch (error) {
        console.error('❌ Delete brand error:', error);
        showToast('error', 'خطأ', error.message || 'حدث خطأ أثناء حذف العلامة التجارية');
    }
}

async function handleSubcategoryFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form || form.dataset.entity !== 'subcategory') return;

    console.log('📝 Submitting subcategory form...');

    const formData = new FormData(form);
    const mode = form.dataset.mode || 'create';
    const {
        categoryId,
        originalCategoryId,
        subcategoryId,
        payload,
        imageFile
    } = buildSubcategoryFormData(formData);

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

    try {
        if (mode === 'edit' && subcategoryId) {
            await updateSubcategory(
                categoryId,
                subcategoryId,
                payload,
                imageFile,
                {
                    previousCategoryId: originalCategoryId && originalCategoryId !== categoryId
                        ? originalCategoryId
                        : null
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
    
    console.log(' populateProductModal called with productId:', productId);
    console.log(' Current state.categories:', state.categories);
    console.log(' Current state.subcategories:', state.subcategories);
    console.log(' Current state.brands:', state.brands);
    
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
            console.log('🔄 Category changed to:', categoryId);
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
        const product = state.products.find(p => p.id === productId);
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
        setFieldValue(form, 'price', product.price);
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
        const productImageSource = product.images?.[0] || '';
        updateProductImagePreview(productImageSource);
        form.dataset.productImageOriginal = productImageSource;
    } else {
        // وضع الإضافة: إعداد النموذج فارغاً
        title.textContent = 'إضافة منتج جديد';
        delete form.dataset.entityId;
        setFieldValue(form, 'id', '');
        form.dataset.productImageOriginal = '';
        updateProductImagePreview('');
        
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

    console.log('📝 Populating category form:', { category, extras });

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
    return STATUS_META[status]?.label || status;
}

function getStatusBadge(status) {
    const entry = STATUS_META[status] || { label: status, class: 'status-default' };
    return `<span class="status-badge ${entry.class}">${entry.label}</span>`;
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
        const shippingCost = Number(order.raw?.shippingCost ?? order.raw?.shippingPrice ?? order.raw?.deliveryFee ?? order.shipping?.cost ?? 0) || 0;
        const discountValue = Number(order.raw?.discount ?? order.raw?.discountValue ?? 0) || 0;
        const totalValue = Number(order.total);
        const resolvedTotal = Number.isFinite(totalValue) ? totalValue : (subtotal + shippingCost - discountValue);

        return {
            customer: {
                name: order.customer || order.user?.name || '-',
                email: order.customerEmail || order.user?.email || '-',
                phone: order.customerPhone || order.user?.phone || '-'
            },
            shipping: order.shipping || order.raw?.shippingAddress || null,
            paymentMethod: order.payment,
            date: order.date,
            items,
            summary: {
                subtotal,
                shipping: shippingCost,
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
            return {
                customer: { name: mockOrder.customer, email: '-', phone: '-' },
                shipping: { line: '-', city: '-', country: '-' },
                paymentMethod: mockOrder.payment,
                date: mockOrder.date,
                items: [{ name: 'تفاصيل المنتجات غير متاحة', quantity, price: unitPrice }],
                summary: {
                    subtotal: unitPrice * quantity,
                    shipping: 0,
                    discount: 0,
                    total: mockOrder.total
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
function buildPrintItemsRows(items = []) {
    if (!items.length) {
        return '<tr><td colspan="4">لا توجد منتجات مضافة</td></tr>';
    }

    return items.map(item => {
        const quantity = item.quantity ?? 1;
        const price = item.price ?? 0;
        const total = quantity * price;
        return `
            <tr>
                <td>${item.name}</td>
                <td>${quantity}</td>
                <td>${formatCurrency(price)}</td>
                <td>${formatCurrency(total)}</td>
            </tr>
        `;
    }).join('');
}

function printOrder(orderId) {
    const normalized = normalizeOrderId(orderId);
    const details = getOrderDetails(normalized);
    const order = getOrderById(normalized);

    if (!details) {
        showToast('error', 'طباعة الفاتورة', 'تعذر العثور على بيانات الطلب للطباعة');
        return;
    }

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
        showToast('error', 'طباعة الفاتورة', 'يبدو أن النوافذ المنبثقة محظورة');
        return;
    }

    const summary = details.summary || {
        subtotal: order?.total || 0,
        shipping: 0,
        discount: 0,
        total: order?.total || 0
    };

    win.document.write(`
        <!doctype html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="utf-8" />
            <title>فاتورة طلب ${normalized}</title>
            <style>
                body { font-family: 'Cairo', sans-serif; padding: 24px; color: #2d3436; }
                h1 { margin-bottom: 8px; }
                .meta { margin-bottom: 20px; }
                .meta span { display: inline-block; min-width: 140px; }
                table { width: 100%; border-collapse: collapse; margin-top: 18px; }
                th, td { border: 1px solid #dfe6e9; padding: 10px 12px; text-align: right; }
                th { background: #fafafa; }
                .summary { margin-top: 24px; width: 320px; }
                .summary div { display: flex; justify-content: space-between; padding: 6px 0; }
                .summary div.total { font-weight: 700; border-top: 1px solid #dfe6e9; margin-top: 6px; padding-top: 12px; }
            </style>
        </head>
        <body>
            <h1>فاتورة طلب ${normalized}</h1>
            <div class="meta">
                <p><span>العميل:</span> ${details.customer?.name || order?.customer || '-'}</p>
                <p><span>البريد:</span> ${details.customer?.email || '-'}</p>
                <p><span>الهاتف:</span> ${details.customer?.phone || '-'}</p>
                <p><span>تاريخ الطلب:</span> ${details.date || order?.date || '-'}</p>
                <p><span>طريقة الدفع:</span> ${details.paymentMethod || order?.payment || '-'}</p>
            </div>
            <h2>قائمة المنتجات</h2>
            <table>
                <thead>
                    <tr>
                        <th>المنتج</th>
                        <th>الكمية</th>
                        <th>سعر الوحدة</th>
                        <th>الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${buildPrintItemsRows(details.items)}
                </tbody>
            </table>
            <div class="summary">
                <div><span>المجموع الفرعي:</span><span>${formatCurrency(summary.subtotal || 0)}</span></div>
                <div><span>الشحن:</span><span>${formatCurrency(summary.shipping || 0)}</span></div>
                <div><span>الخصم:</span><span>${formatCurrency(summary.discount || 0)}</span></div>
                <div class="total"><span>الإجمالي:</span><span>${formatCurrency(summary.total || 0)}</span></div>
            </div>
        </body>
        </html>
    `);

    win.document.close();
    win.focus();
    setTimeout(() => {
        win.print();
        win.close();
    }, 100);

    showToast('success', 'طباعة الفاتورة', `تم إرسال طلب ${normalized} للطباعة`);
}

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

    const ordersRows = orders.map(order => `
        <tr>
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
    if (Array.isArray(state.customers) && state.customers.length > 0 && Array.isArray(state.orders)) {
        updateCustomersOrdersInfo();
    }

    let customers = Array.isArray(state.customers) ? state.customers.slice() : [];

    if ((!customers || customers.length === 0) && state.orders?.length) {
        createCustomersFromOrders();
        updateCustomersOrdersInfo();
        customers = Array.isArray(state.customers) ? state.customers.slice() : [];
    }

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

    // 1. الطلبات اليومية (طلبات تاريخ اليوم فقط)
    const dailyOrdersCount = orders.filter(order => {
        const orderDate = getOrderDate(order);
        return isSameDay(orderDate, now);
    }).length;

    // 2. إجمالي الإيرادات لهذا الشهر (استثناء الملغاة)
    const monthlyRevenue = orders
        .filter(order => order.status !== 'cancelled')
        .filter(order => {
            const orderDate = getOrderDate(order);
            return isSameMonth(orderDate, now);
        })
        .reduce((sum, order) => sum + (Number(order.total) || 0), 0);

    // 3. العملاء الجدد (المضافون اليوم وفق تواريخ الإنشاء)
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

    // 4. المنتجات منخفضة المخزون (٥ أو أقل)
    const lowStockProducts = products.filter(product => {
        const stockValue = product.stock ?? product.quantity ?? product.count ?? 0;
        return Number.isFinite(stockValue) && stockValue <= 5;
    });

    // تحديث العناصر في HTML باستخدام IDs
    const ordersEl = document.getElementById('dailyOrdersCount');
    const revenueEl = document.getElementById('monthlyRevenue');
    const customersEl = document.getElementById('newCustomersCount');
    const lowStockEl = document.getElementById('lowStockCount');
    const lowStockCard = document.getElementById('lowStockCard');

    if (ordersEl) ordersEl.textContent = formatNumber(dailyOrdersCount);
    if (revenueEl) revenueEl.textContent = formatCurrency(monthlyRevenue);
    if (customersEl) customersEl.textContent = formatNumber(dailyNewCustomers);
    if (lowStockEl) lowStockEl.textContent = lowStockProducts.length;

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

    console.log('📊 Overview stats updated:', {
        dailyOrdersCount,
        monthlyRevenue,
        dailyNewCustomers,
        lowStockCount: lowStockProducts.length
    });
}

function renderOverview() {
    // تحديث الإحصائيات
    updateOverviewStats();
    
    // تحديث جدول أحدث الطلبات
    const body = document.getElementById('overviewOrdersBody');
    if (!body) return;
    
    const today = new Date();
    const todaysOrders = (state.orders || []).filter(order => {
        const orderDate = getOrderDate(order);
        return isSameDay(orderDate, today);
    });

    if (todaysOrders.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 20px; color: #95a5a6;">
                    لا توجد طلبات مسجلة اليوم
                </td>
            </tr>
        `;
        return;
    }
    
    const sortedTodaysOrders = todaysOrders
        .slice()
        .sort((a, b) => {
            const dateA = getOrderDate(a);
            const dateB = getOrderDate(b);
            if (!dateA) return 1;
            if (!dateB) return -1;
            return dateB - dateA;
        })
        .slice(0, 5);

    body.innerHTML = sortedTodaysOrders.map((order, index) => {
        const orderDateObj = getOrderDate(order);
        const displayDate = orderDateObj
            ? orderDateObj.toLocaleString('ar-EG', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })
            : (order.date || '-');

        const customerName = order.customer || order.user?.name || '-';

        return `
        <tr data-id="${order.id}">
            <td>${index + 1}</td>
            <td>${order.id}</td>
            <td>${customerName}</td>
            <td>${formatCurrency(order.total)}</td>
            <td>${displayDate}</td>
            <td>
                <button class="action-btn view-order" data-order-id="${order.id}" title="عرض التفاصيل"><i class="fas fa-eye"></i></button>
                <button class="action-btn print-order" data-order-id="${order.id}" title="طباعة الفاتورة"><i class="fas fa-print"></i></button>
            </td>
        </tr>`;
    }).join('');
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
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>لا توجد منتجات حالياً</h3>
                <p>استخدم زر "إضافة منتج جديد" لإنشاء أول منتج.</p>
            </div>
        `;
        return;
    }

    const filterFns = [
        filterBySearch(state.filters.productSearch, ['name', 'sku']),
        state.filters.productCategory !== 'all' ? item => normalizeFilterValue(item.categoryId || item.categorySlug) === normalizeFilterValue(state.filters.productCategory) : () => true
    ];

    const filtered = applyFilters(source, filterFns);
    if (!filtered.length) {
        grid.innerHTML = `<div class="empty-state">
            <i class="fas fa-box-open"></i>
            <h3>لا توجد منتجات مطابقة</h3>
            <p>حاول تعديل البحث أو الفلاتر</p>
        </div>`;
        return;
    }

    grid.innerHTML = filtered.map(product => `
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
    `).join('');
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

    list.innerHTML = filteredCategories.map(category => {
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
    }).join('');
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

function renderBanners() {
    const grid = document.getElementById('bannersGrid');
    if (!grid) return;

    grid.innerHTML = mockData.banners.map(banner => `
        <div class="banner-card" data-id="${banner.id}">
            <div class="banner-preview">
                <img src="${banner.image}" alt="${banner.title}">
            </div>
            <div class="banner-info">
                <h3>${banner.title}</h3>
                <p>${banner.placement}</p>
                <div class="banner-actions">
                    <button class="btn-secondary btn-sm" data-open-modal="bannerModal" data-modal-mode="edit" data-entity="banner" data-entity-id="${banner.id}"><i class="fas fa-edit"></i> تعديل</button>
                    <button class="btn-danger btn-sm" data-action="delete" data-entity="banner" data-entity-id="${banner.id}"><i class="fas fa-trash"></i> حذف</button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderPages() {
    const list = document.getElementById('pagesList');
    if (!list) return;

    list.innerHTML = mockData.pages.map(page => `
        <div class="page-item" data-id="${page.id}">
            <i class="fas fa-file-alt"></i>
            <div class="page-info">
                <h3>${page.title}</h3>
                <p>آخر تحديث: ${page.updatedAt}</p>
            </div>
            <button class="btn-secondary btn-sm" data-action="edit-page" data-entity="page" data-entity-id="${page.id}"><i class="fas fa-edit"></i> تعديل</button>
        </div>
    `).join('');
}

function renderFeatures() {
    const grid = document.getElementById('featuresGrid');
    if (!grid) return;

    grid.innerHTML = mockData.features.map(feature => `
        <div class="feature-card" data-id="${feature.id}">
            <i class="${feature.icon}"></i>
            <h3>${feature.title}</h3>
            <p>${feature.description}</p>
            <div class="feature-actions">
                <button class="btn-secondary btn-sm" data-open-modal="featureModal" data-modal-mode="edit" data-entity="feature" data-entity-id="${feature.id}"><i class="fas fa-edit"></i> تعديل</button>
                <button class="btn-danger btn-sm" data-action="delete" data-entity="feature" data-entity-id="${feature.id}"><i class="fas fa-trash"></i> حذف</button>
            </div>
        </div>
    `).join('');
}

/**
 * عرض قائمة العملاء
 */
function renderCustomers() {
    const body = document.getElementById('customersTableBody');
    if (!body) {
        console.warn('⚠️ customersTableBody element not found!');
        return;
    }

    console.log('🎨 Rendering customers...', {
        loading: state.customersLoading,
        error: state.customersError,
        count: state.customers?.length || 0
    });

    if (state.customersLoading) {
        body.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: #e74c3c;"></i>
                    <p style="margin-top: 10px;">جاري تحميل العملاء...</p>
                </td>
            </tr>
        `;
        return;
    }

    if (state.customersError) {
        body.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: #f39c12;"></i>
                    <p style="margin-top: 10px; color: #e74c3c;">${state.customersError}</p>
                    <button class="btn-primary" onclick="fetchCustomers()" style="margin-top: 15px;">إعادة المحاولة</button>
                </td>
            </tr>
        `;
        return;
    }

    let customers = state.customers || [];
    
    // تطبيق البحث بالاسم أو رقم الهاتف
    const searchTerm = state.filters?.customerSearch?.toLowerCase() || '';
    if (searchTerm) {
        customers = customers.filter(customer => {
            const name = (customer.name || '').toLowerCase();
            const phone = (customer.phone || '').toLowerCase();
            return name.includes(searchTerm) || phone.includes(searchTerm);
        });
    }
    
    if (!customers.length) {
        const message = searchTerm 
            ? `لا توجد نتائج للبحث عن "${state.filters.customerSearch}"`
            : 'لا يوجد عملاء حالياً';
        
        body.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-users" style="font-size: 24px; color: #95a5a6;"></i>
                    <p style="margin-top: 10px;">${message}</p>
                </td>
            </tr>
        `;
        return;
    }

    console.log('✅ Rendering', customers.length, 'customers');
    
    body.innerHTML = customers.map((customer, index) => {
        const isFromOrders = customer.isFromOrders;
        const nameWithBadge = isFromOrders 
            ? `${customer.name || '-'} <span style="font-size: 10px; background: #f39c12; color: white; padding: 2px 6px; border-radius: 3px; margin-right: 5px;" title="تم استخراجه من الطلبات">من الطلبات</span>`
            : (customer.name || '-');
        
        return `
            <tr data-id="${customer._id || customer.id}" ${isFromOrders ? 'style="background-color: rgba(243, 156, 18, 0.05);"' : ''}>
                <td>${index + 1}</td>
                <td>${nameWithBadge}</td>
                <td>${customer.email || '-'}</td>
                <td>${customer.phone || '-'}</td>
                <td>${customer.lastOrder || '-'}</td>
                <td>
                    <button class="action-btn" onclick="viewCustomerDetails('${customer._id || customer.id}')" title="عرض التفاصيل">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn" onclick="viewCustomerOrders('${customer._id || customer.id}')" title="عرض الطلبات">
                        <i class="fas fa-shopping-cart"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderTopProducts() {
    const analyticsData = calculateAnalyticsData();
    renderTopProductsTable(analyticsData.topProducts || []);
}

function renderAnalyticsFilters() {
    const select = document.getElementById('analyticsRangeFilter');
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

function renderUsers(users = []) {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = users.map(user => `
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
    `).join('');
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
    
    console.log('🔄 Populating subcategories for category:', categoryId);
    
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

    // البحث عن الفئات الفرعية للفئة المحددة
    console.log('🔍 Searching for subcategories in state:', {
        'categoryId': categoryId,
        'state.subcategories': state.subcategories,
        'state.categories': state.categories
    });
    
    // الحصول على الفئات الفرعية
    const categorySubcategories = [];
    
    // البحث في state.subcategories
    if (state.subcategories && state.subcategories[categoryId]) {
        categorySubcategories.push(...state.subcategories[categoryId]);
        console.log('📋 Found subcategories in state.subcategories:', categorySubcategories);
    } 
    
    // البحث في كائن الفئة
    if (state.categories) {
        const category = state.categories.find(cat => cat.id === categoryId);
        if (category && category.subcategories) {
            categorySubcategories.push(...category.subcategories);
            console.log('📋 Found subcategories in category object:', category.subcategories);
        }
    }
    
    // إزالة التكرارات
    const uniqueSubcategories = Array.from(new Map(categorySubcategories.map(item => [item.id, item])).values());
    console.log('📋 Unique subcategories:', uniqueSubcategories);
    
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

    const orderStatusFilter = document.getElementById('orderStatusFilter');
    if (orderStatusFilter) {
        orderStatusFilter.innerHTML = `
            <option value="all">كل الحالات</option>
            <option value="new">طلبات جديدة</option>
            <option value="delivered">طلبات تم توصيلها</option>
        `;
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

function renderDashboard() {
    renderOverview();
    renderProducts();
    renderCategories();
    renderSubcategories();
    renderCollections();
    renderPromotions();
    renderBanners();
    renderPages();
    renderFeatures();
    renderOrders();
    renderCustomers();
    renderTopProducts();
    renderAnalyticsFilters();
    renderAuditLogs();
    renderUsers();
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
    console.log('🔀 Switching to section:', targetSection);
    
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

        // تحميل الرسوم البيانية بشكل lazy عند الحاجة
        if (targetSection === 'overview') {
            // جلب البيانات إذا لم تكن محملة
            if (!state.customers || state.customers.length === 0) {
                fetchCustomers(true); // بصمت
            }
            if (!state.products || state.products.length === 0) {
                fetchProducts();
            }
            
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

    if (targetSection === 'subcategories' && state.filters.subcategoryCategory) {
        fetchSubcategories(state.filters.subcategoryCategory, { force: true });
    }
    
    // جلب العملاء عند الانتقال لقسم العملاء
    if (targetSection === 'customers' && (!state.customers || state.customers.length === 0)) {
        fetchCustomers();
    }

    if (targetSection === 'brands') {
        if (!Array.isArray(state.brands) || state.brands.length === 0) {
            fetchBrands()
                .then(() => renderBrands())
                .catch(error => console.error('❌ Failed to load brands:', error));
        } else {
            renderBrands();
        }
    }

    refreshSectionData(targetSection);
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
            hydrateSettingsForms?.();
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
    console.log(`🔔 Toast [${type}]:`, title, '-', message);
    
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
    
    console.log('📊 Monthly sales calculated:', { months, sales });
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
    console.log('📊 Loading overview charts...');
    console.log('📦 Current orders count:', state.orders?.length || 0);
    
    // رسم المبيعات الشهرية
    const salesCtx = document.getElementById('salesChart');
    if (salesCtx) {
        const salesData = calculateMonthlySales();
        console.log('💰 Sales data for chart:', salesData);
        
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
                            callback: function(value) {
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
    
    console.log('📊 Analytics stats updated:', {
        totalRevenue: data.totalRevenue,
        avgBasket: data.avgBasket,
        topProducts: data.topProducts.length
    });
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
    console.log('📊 Loading analytics charts...');
    
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
                            callback: function(value) {
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
document.addEventListener('click', function(e) {
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

        if (confirm(`هل أنت متأكد من حذف الفئة الفرعية "${subcategoryName}"؟`)) {
            deleteSubcategory(categoryId, subcategoryId).catch(() => {
                // يتم التعامل مع رسائل الخطأ داخل deleteSubcategory بالفعل
            });
        }
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

        if (confirm(`هل أنت متأكد من حذف الفئة "${category.name}"؟`)) {
            deleteCategory(categoryId);
        }
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

document.addEventListener('input', function(e) {
    if (e.target.id === 'messagesSearchInput') {
        renderMessagesList(e.target.value || '');
    }
});

document.addEventListener('keydown', function(e) {
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
            
            const response = await fetch(UPLOAD_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                },
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
document.addEventListener('change', async function(e) {
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
document.addEventListener('click', function(e) {
    const uploadArea = e.target.closest('.image-upload-area');
    if (uploadArea && !e.target.matches('input[type="file"]')) {
        const input = uploadArea.querySelector('input[type="file"]');
        if (input) {
            input.click();
        }
    }
});

document.addEventListener('change', function(e) {
    if (e.target.matches('.image-upload-area input[type="file"]')) {
        const files = e.target.files;
        if (files.length > 0) {
            showToast('success', 'تحميل الصور', `تم اختيار ${files.length} صورة`);
        }
    }
});

// ===== Initialize =====
// نقطة البداية الرئيسية عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing dashboard...');

    // تهيئة السمة (الوضع الفاتح/الداكن)
    initTheme();

    // استعادة القسم المحفوظ أو الذهاب للنظرة العامة
    const savedSection = loadCurrentSection();
    console.log('📌 Restoring section:', savedSection);
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
    renderDashboard();
    setupProductFilters();

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
    fetchCategories();
    fetchProducts();

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
    console.log('📦 Raw orders payload:', payload);
    
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
    console.log('📋 Extracted orders array:', source.length, 'orders');
    
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
    
    // استخراج السعر الإجمالي
    const total = order.totalOrderPrice ?? order.totalAmount ?? order.total ?? order.amount ?? 0;
    
    // استخراج عناصر الطلب وتحويلها للتنسيق المطلوب
    const items = extractOrderItems(order);
    
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
    
    // استخراج حالة الطلب
    const status = resolveOrderStatus(order);
    
    // طريقة الدفع
    const payment = order.paymentMethod || order.payment_method || order.payment || 'نقدي';
    
    // التاريخ
    const createdAtSource = order.createdAt || order.created_at || order.date || order.createdDate;
    const createdAtDate = parseDateValue(createdAtSource);
    const dateValue = createdAtDate ? formatDateInputValue(createdAtDate) : '';
    const dateDisplay = createdAtDate ? formatDate(createdAtDate) : '-';

    if (!id) {
        console.warn('⚠️ Order without ID:', order);
        return null;
    }

    return {
        id: String(id),
        userId: primaryUserId ? String(primaryUserId) : null,
        userIds,
        userEmails,
        userPhones,
        user: {
            _id: primaryUserId ? String(primaryUserId) : null,
            name: customer.name || '',
            email: customer.email || '',
            phone: customer.phone || ''
        },
        customer: customer.name || 'غير معروف',
        customerEmail: customer.email || '',
        customerPhone: customer.phone || '',
        total: Number(total) || 0,
        items: items.totalCount,
        itemsDetails: itemsDetails,
        payment,
        status,
        date: dateDisplay,
        dateValue,
        shipping: order.shippingAddress || null,
        isPaid: order.isPaid || false,
        isDelivered: order.isDelivered || false,
        isCanceled: order.isCanceled || false,
        raw: order
    };
}

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    return String(phone).replace(/[^0-9+]/g, '').replace(/^[^0-9+]*/, '');
}

function extractOrderIdentifiers(order = {}) {
    const ids = new Set();
    const emails = new Set();
    const phones = new Set();

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
        const normalized = normalizePhoneNumber(value);
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

    // إضافة بيانات من العناوين أو الحقول الأخرى
    if (order.shippingAddress) {
        pushEmail(order.shippingAddress.email);
        pushPhone(order.shippingAddress.phone);
        pushId(order.shippingAddress.userId || order.shippingAddress.customerId);
    }

    // إضافة بيانات من الحقول الشائعة في الـ API
    pushEmail(order.userEmail || order.customerEmail);
    pushPhone(order.userPhone || order.customerPhone);

    return { ids, emails, phones };
}

function doesOrderBelongToCustomer(order, customer) {
    if (!order || !customer) return false;

    const customerIds = new Set();
    const addCustomerId = (value) => {
        if (value === null || value === undefined) return;
        const normalized = String(value).trim();
        if (normalized) customerIds.add(normalized);
    };

    addCustomerId(customer._id);
    addCustomerId(customer.id);
    addCustomerId(customer.userId);
    if (customer.user && typeof customer.user === 'object') {
        addCustomerId(customer.user._id || customer.user.id);
    }

    const orderIds = order.userIds || [];
    for (const id of orderIds) {
        if (customerIds.has(String(id))) {
            return true;
        }
    }

    if (order.userId && customerIds.has(String(order.userId))) {
        return true;
    }

    const customerEmails = new Set(
        [customer.email, customer.contactEmail, customer.user?.email]
            .filter(Boolean)
            .map(email => String(email).trim().toLowerCase())
    );
    const orderEmails = order.userEmails || [];
    for (const email of orderEmails) {
        if (customerEmails.has(email)) {
            return true;
        }
    }

    const customerPhones = new Set(
        [customer.phone, customer.contactPhone, customer.user?.phone]
            .filter(Boolean)
            .map(normalizePhoneNumber)
            .filter(Boolean)
    );
    const orderPhones = (order.userPhones || []).map(normalizePhoneNumber).filter(Boolean);
    for (const phone of orderPhones) {
        if (customerPhones.has(phone)) {
            return true;
        }
    }

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
    if (order.isCanceled || order.isCancelled) return 'cancelled';
    if (order.isDelivered) return 'delivered';
    if (order.isPaid) return 'processing';
    
    const status = order.status || order.state || order.orderStatus;
    return status ? String(status).toLowerCase() : 'new';
}

/**
 * جلب الطلبات من API
 */
async function fetchOrders() {
    console.log('🔄 Fetching orders from API...');
    state.ordersLoading = true;
    state.ordersError = null;
    renderOrders();

    try {
        const response = await authorizedFetch(ORDER_ENDPOINT);
        console.log('📡 Orders response status:', response.status);

        const handled = handleUnauthorized(response);
        if (handled !== response) return; // تم إعادة التوجيه للتسجيل

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const payload = await response.json();
        console.log('📦 Raw orders response:', payload);

        const normalized = normalizeOrdersPayload(payload);
        console.log(`✅ Normalized ${normalized.length} orders`);

        state.orders = normalized;
        state.ordersError = null;
        
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
        
        showToast('success', 'تحميل الطلبات', `تم تحميل ${normalized.length} طلب بنجاح`);
    } catch (error) {
        console.error('❌ Failed to fetch orders:', error);
        state.orders = [];
        state.ordersError = error?.message || 'تعذر تحميل الطلبات. حاول مرة أخرى.';
        showToast('error', 'خطأ في تحميل الطلبات', state.ordersError);
    } finally {
        state.ordersLoading = false;
        renderOrders();
        renderOverview();
        
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
    
    console.log('🚚 Updating delivery status for order:', orderId);
    
    try {
        const response = await authorizedFetch(`${ORDER_ENDPOINT}/${orderId}/deliver`, {
            method: 'PATCH'
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody?.message || `HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log('✅ Delivery status updated:', result);

        // تحديث الطلب في الحالة المحلية
        const orderIndex = state.orders.findIndex(o => o.id === orderId);
        if (orderIndex !== -1) {
            state.orders[orderIndex].isDelivered = true;
            state.orders[orderIndex].status = 'delivered';
        }

        // إعادة عرض الطلبات
        renderOrders();
        renderOverview();
        
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
        filtered = filtered.filter(order => {
            if (state.filters.orderStatus === 'delivered') {
                return order.status === 'delivered';
            }
            // "new" يعبر عن الطلبات غير المسلّمة بعد
            return order.status !== 'delivered';
        });
    }

    // Filter by date
    if (state.filters.orderDate) {
        filtered = filtered.filter(order => order.dateValue === state.filters.orderDate);
    }

    return filtered;
}

/**
 * عرض جدول الطلبات
 * يعرض قائمة الطلبات مع الفلاتر المطبقة
 */
function renderOrders() {
    const body = document.getElementById('ordersTableBody');
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

    body.innerHTML = filtered.map((order, index) => `
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
                <button class="action-btn" onclick="viewOrderDetails('${order.id}')" title="عرض التفاصيل">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn" onclick="printOrder('${order.id}')" title="طباعة">
                    <i class="fas fa-print"></i>
                </button>
                ${!order.isDelivered ? `
                    <button class="action-btn" onclick="updateOrderDeliveryStatus('${order.id}')" title="تأكيد التسليم" style="color: #27ae60;">
                        <i class="fas fa-truck"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
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

    console.log('📋 Order details:', order);
    
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

    // محتوى النافذة
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
                    <p><strong>الحالة:</strong> ${getStatusBadge(order.status)}</p>
                    <p><strong>طريقة الدفع:</strong> ${order.payment}</p>
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
                <h3 style="color: #e74c3c; margin-bottom: 15px;">الإجمالي</h3>
                <p style="font-size: 1.5em; font-weight: bold; color: #27ae60;">${formatCurrency(order.total)}</p>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // إظهار النافذة
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
    
    // إغلاق النافذة
    const closeBtn = modal.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(modal);
            }, 300);
        });
    }
    
    // إغلاق عند النقر خارج المحتوى
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(modal);
            }, 300);
        }
    });
    
    // إغلاق بمفتاح ESC
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            modal.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleKeyDown);
            }, 300);
        }
    };
    document.addEventListener('keydown', handleKeyDown);
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
                <div class="total">
                    <strong>الإجمالي الكلي:</strong> ${formatCurrency(order.total)}
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
    
    // طباعة تلقائية بعد تحميل المحتوى
    setTimeout(() => {
        win.print();
        win.close();
    }, 250);

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

const USERS_ENDPOINT = `${ADMIN_API_BASE_URL}/users`;

/**
 * إنشاء عملاء من الطلبات للعملاء المفقودين
 */
function createCustomersFromOrders() {
    if (!state.orders || state.orders.length === 0) return;
    
    console.log('🔄 Creating customers from orders...');
    
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
            isFromOrders: true // علامة للتمييز
        };
        
        if (userId) processedIds.add(userId);
        if (customerInfo.email) existingCustomerEmails.add(customerInfo.email.toLowerCase());
        
        newCustomers.push(newCustomer);
    });
    
    if (newCustomers.length > 0) {
        console.log(`✅ Created ${newCustomers.length} customers from orders`);
        state.customers = [...(state.customers || []), ...newCustomers];
    }
}

/**
 * تحديث معلومات الطلبات للعملاء الموجودين
 */
function updateCustomersOrdersInfo() {
    if (!state.customers || state.customers.length === 0) return;
    
    console.log('🔄 Updating customers orders info...');
    
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
            console.log(`📊 ${customer.name}: ${ordersCount} طلب/طلبات`);
        }
        
        // إيجاد آخر طلب
        let lastOrder = '-';
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
                lastOrder = orderDate.toLocaleDateString('ar-EG');
            }
        }
        
        return {
            ...customer,
            ordersCount,
            lastOrder
        };
    });
    
    // إعادة عرض العملاء إذا كان القسم نشطاً
    const customersSection = document.getElementById('customers');
    if (customersSection && customersSection.classList.contains('active')) {
        renderCustomers();
    }
    
    console.log('✅ Customers orders info updated:', state.customers.filter(c => c.ordersCount > 0).length, 'with orders /', state.customers.length, 'total');
}

/**
 * جلب العملاء من API
 * @param {boolean} silent - إذا كان true، لا تظهر رسالة النجاح
 */
async function fetchCustomers(silent = false) {
    console.log('🔄 Fetching customers from API...');
    state.customersLoading = true;
    state.customersError = null;
    renderCustomers();
    
    try {
        const response = await authorizedFetch(USERS_ENDPOINT);
        console.log('📡 Customers response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const payload = await response.json();
        console.log('📦 Raw customers response:', payload);

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

        console.log('👥 Total users:', allUsers.length, '| Customers (non-admin):', fetchedCustomers.length, '| Total orders:', state.orders?.length || 0);

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
                    lastOrder = orderDate.toLocaleDateString('ar-EG');
                }
            }
            
            if (ordersCount > 0) {
                console.log(`📊 Customer ${customer.name || customer.email}: ${ordersCount} orders, last: ${lastOrder}`);
            }
            
            return {
                ...customer,
                ordersCount,
                lastOrder
            };
        });
        
        console.log('✅ Customers with orders info:', customersWithOrders.filter(c => c.ordersCount > 0).length, '/', customersWithOrders.length);
        
        state.customers = customersWithOrders;
        
        // إنشاء عملاء من الطلبات للعملاء المفقودين
        if (state.orders && state.orders.length > 0) {
            createCustomersFromOrders();
            // تحديث معلومات الطلبات للعملاء الجدد
            updateCustomersOrdersInfo();
        }
        
        state.customersError = null;
        
        if (!silent) {
            showToast('success', 'تحميل العملاء', `تم تحميل ${state.customers.length} عميل بنجاح`);
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
    console.log('🔄 Fetching users from API...');
    
    try {
        const response = await authorizedFetch(USERS_ENDPOINT);
        console.log('📡 Users response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const payload = await response.json();
        console.log('📦 Raw users response:', payload);

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
    
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
        return;
    }
    
    console.log('🗑️ Deleting user:', userId);
    
    try {
        const response = await authorizedFetch(`${USERS_ENDPOINT}/${userId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody?.message || `HTTP ${response.status}`);
        }

        console.log('✅ User deleted successfully');
        
        showToast('success', 'حذف المستخدم', 'تم حذف المستخدم بنجاح');
        
        // إعادة تحميل قائمة المستخدمين
        await fetchUsers();
    } catch (error) {
        console.error('❌ Failed to delete user:', error);
        showToast('error', 'خطأ في الحذف', error.message || 'حدث خطأ أثناء حذف المستخدم');
    }
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
    
    console.log('🔐 Changing password for user:', userId);
    
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
        console.log('✅ Password changed successfully:', result);
        
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
    const customer = state.customers?.find(c => (c._id || c.id) === customerId);
    
    if (!customer) {
        showToast('error', 'خطأ', 'لم يتم العثور على العميل');
        return;
    }
    
    console.log('📋 Customer details:', customer);
    
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
    
    // بناء قائمة العناوين
    const addressesHTML = customer.addresses && customer.addresses.length > 0
        ? customer.addresses.map((addr, index) => `
            <div style="background: var(--bg-light); color: var(--text-main); padding: 15px; border-radius: 8px; margin-bottom: 10px; border-right: 3px solid var(--primary);">
                <h4 style="color: #e74c3c; margin-bottom: 10px;">
                    <i class="fas fa-map-marker-alt"></i> عنوان ${index + 1} (${addr.type === 'home' ? 'المنزل' : addr.type === 'work' ? 'العمل' : addr.type})
                </h4>
                <p style="margin: 5px 0; color: var(--text-main);"><strong>التفاصيل:</strong> ${addr.details || '-'}</p>
                <p style="margin: 5px 0; color: var(--text-main);"><strong>المدينة:</strong> ${addr.city || '-'}</p>
                <p style="margin: 5px 0; color: var(--text-main);"><strong>الرمز البريدي:</strong> ${addr.postalCode || '-'}</p>
                <p style="margin: 5px 0; color: var(--text-main);"><strong>الهاتف:</strong> <a href="tel:${addr.phone}" style="color: #27ae60; text-decoration: none;">${addr.phone || '-'}</a></p>
            </div>
        `).join('')
        : '<p style="color: var(--text-muted);">لا توجد عناوين مسجلة</p>';
    
    modal.innerHTML = `
        <div class="order-details-content" style="
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
                <i class="fas fa-user-circle" style="margin-left: 10px; color: #e74c3c;"></i>
                تفاصيل العميل
            </h2>
            
            <div style="margin-bottom: 25px;">
                <h3 style="color: #e74c3c; margin-bottom: 15px;">
                    <i class="fas fa-info-circle"></i> المعلومات الأساسية
                </h3>
                <div style="background: var(--bg-light); padding: 15px; border-radius: 8px;">
                    <p style="margin: 8px 0; color: var(--text-main);"><strong>الاسم:</strong> ${customer.name || '-'}</p>
                    <p style="margin: 8px 0; color: var(--text-main);"><strong>البريد الإلكتروني:</strong> ${customer.email || '-'}</p>
                    <p style="margin: 8px 0; color: var(--text-main);"><strong>رقم الهاتف:</strong> <a href="tel:${customer.phone}" style="color: #27ae60; text-decoration: none;">${customer.phone || '-'}</a></p>
                </div>
            </div>
            
            <div style="margin-bottom: 25px;">
                <h3 style="color: #e74c3c; margin-bottom: 15px;">
                    <i class="fas fa-map-marked-alt"></i> العناوين المسجلة (${customer.addresses?.length || 0})
                </h3>
                <div style="color: var(--text-main);">
                    ${addressesHTML}
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 25px;">
                <button class="btn-primary" onclick="viewCustomerOrders('${customerId}')" style="margin-left: 10px;">
                    <i class="fas fa-shopping-cart"></i> عرض طلبات العميل
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
    
    // إغلاق النافذة
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

/**
 * عرض طلبات العميل
 * @param {string} customerId - معرف العميل
 */
function viewCustomerOrders(customerId) {
    const customer = state.customers?.find(c => (c._id || c.id) === customerId);
    
    if (!customer) {
        showToast('error', 'خطأ', 'لم يتم العثور على العميل');
        return;
    }
    
    // تصفية الطلبات الخاصة بهذا العميل
    const customerOrders = state.orders?.filter(order => 
        order.userId === customerId || order.user?._id === customerId || order.user?.id === customerId
    ) || [];
    
    console.log('📦 Customer orders:', customerOrders);
    
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
                    ${customerOrders.map(order => `
                        <tr style="color: var(--text-main);">
                            <td style="padding: 10px; border: 1px solid var(--border);">${order.id}</td>
                            <td style="padding: 10px; border: 1px solid var(--border);">${order.date}</td>
                            <td style="padding: 10px; border: 1px solid var(--border);"><strong>${formatCurrency(order.total)}</strong></td>
                            <td style="padding: 10px; border: 1px solid var(--border);">${getStatusBadge(order.status)}</td>
                            <td style="padding: 10px; border: 1px solid var(--border);">
                                <button class="action-btn" onclick="viewOrderDetails('${order.id}')" title="عرض التفاصيل">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="action-btn" onclick="printOrder('${order.id}')" title="طباعة">
                                    <i class="fas fa-print"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `
        : '<p style="text-align: center; color: var(--text-muted); padding: 40px;">لا توجد طلبات لهذا العميل</p>';
    
    modal.innerHTML = `
        <div class="order-details-content" style="
            background: var(--bg-base);
            color: var(--text-main);
            padding: 30px;
            border-radius: 12px;
            width: 90%;
            max-width: 900px;
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
                <i class="fas fa-shopping-cart" style="margin-left: 10px; color: #e74c3c;"></i>
                طلبات العميل: ${customer.name}
            </h2>
            
            <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; margin-bottom: 20px; color: var(--text-main);">
                <p style="margin: 5px 0;"><strong>إجمالي الطلبات:</strong> ${customerOrders.length}</p>
                <p style="margin: 5px 0;"><strong>البريد الإلكتروني:</strong> ${customer.email}</p>
            </div>
            
            ${ordersHTML}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
    
    // إغلاق النافذة
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
    console.log('🚀 Initializing dashboard...');

    // إعداد فلاتر الطلبات
    setupOrderFilters();
    setupModalCancels();

    // إضافة مستمع حدث لتحديث الفئات الفرعية عند تغيير الفئة الرئيسية
    const categorySelect = document.getElementById('productCategory');
    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            const categoryId = e.target.value;
            console.log('🔽 Selected category changed to:', categoryId);
            populateSubcategoryOptions(categoryId);
        });
    }

    // جلب البيانات الأولية من API
    fetchOrders();

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

        setDateInputsDisabled(true);
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

    console.log('Dashboard initialized');
});