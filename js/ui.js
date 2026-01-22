/**
 * ui.js - UI操作モジュール
 * Markdownレンダリング、LaTeX、画像表示などを担当
 */

// ==================== Markdown + LaTeX レンダリング ====================

/**
 * MarkdownをHTMLに変換（XSS対策込み）
 */
function renderMarkdown(mdText) {
    if (!mdText) return '';

    // markedの設定
    marked.setOptions({
        breaks: true,         // 改行を<br>に変換
        gfm: true,            // GitHub Flavored Markdown
        headerIds: false,     // ヘッダーIDを無効化
        mangle: false         // メールアドレスの難読化を無効化
    });

    // Markdownをパース
    let html = marked.parse(mdText);

    // DOMPurifyでサニタイズ（XSS対策）
    html = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target'],  // target属性を許可
        ADD_TAGS: ['iframe']   // 必要に応じて追加
    });

    return html;
}

/**
 * 要素内のLaTeXをレンダリング
 */
function renderLaTeX(element) {
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false,
            errorColor: '#cc0000'
        });
    }
}

/**
 * MarkdownをレンダリングしてLaTeXも処理
 */
function renderContent(mdText, targetElement) {
    const html = renderMarkdown(mdText);
    targetElement.innerHTML = html;
    renderLaTeX(targetElement);
}

// ==================== 画像表示 ====================

/**
 * アセットIDから画像URLを生成（Blob URL）
 * キャッシュ管理も行う
 */
const blobUrlCache = new Map();

async function getAssetUrl(assetId) {
    // キャッシュチェック
    if (blobUrlCache.has(assetId)) {
        return blobUrlCache.get(assetId);
    }

    try {
        const asset = await QuizDB.getAsset(assetId);
        if (asset && asset.blob) {
            const url = URL.createObjectURL(asset.blob);
            blobUrlCache.set(assetId, url);
            return url;
        }
    } catch (error) {
        console.error('アセット取得エラー:', error);
    }
    return null;
}

/**
 * Blob URLを解放
 */
function revokeAssetUrl(assetId) {
    if (blobUrlCache.has(assetId)) {
        URL.revokeObjectURL(blobUrlCache.get(assetId));
        blobUrlCache.delete(assetId);
    }
}

/**
 * 全Blob URLを解放
 */
function revokeAllAssetUrls() {
    blobUrlCache.forEach(url => URL.revokeObjectURL(url));
    blobUrlCache.clear();
}

/**
 * 画像要素を生成
 */
async function createImageElement(assetId, className = 'question-image') {
    const url = await getAssetUrl(assetId);
    if (!url) return null;

    const img = document.createElement('img');
    img.src = url;
    img.className = className;
    img.onclick = () => showImageModal(url);
    img.alt = '問題画像';
    return img;
}

/**
 * 画像を拡大表示するモーダル
 */
function showImageModal(imageUrl) {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');

    if (modal && modalImg) {
        modalImg.src = imageUrl;
        modal.classList.add('active');
    }
}

/**
 * モーダルを閉じる
 */
function closeImageModal() {
    const modal = document.getElementById('image-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// ==================== トースト通知 ====================

/**
 * トースト通知を表示
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // フェードイン
    setTimeout(() => toast.classList.add('show'), 10);

    // 自動で消す
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==================== 確認ダイアログ ====================

/**
 * 確認ダイアログを表示
 */
function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const messageEl = document.getElementById('confirm-message');
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');

        if (!modal || !messageEl || !yesBtn || !noBtn) {
            resolve(window.confirm(message));
            return;
        }

        messageEl.textContent = message;
        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
            yesBtn.onclick = null;
            noBtn.onclick = null;
        };

        yesBtn.onclick = () => {
            cleanup();
            resolve(true);
        };

        noBtn.onclick = () => {
            cleanup();
            resolve(false);
        };
    });
}

// ==================== ローディング ====================

/**
 * ローディング表示
 */
function showLoading(message = '読み込み中...') {
    const loading = document.getElementById('loading');
    const loadingMessage = document.getElementById('loading-message');
    if (loading) {
        if (loadingMessage) loadingMessage.textContent = message;
        loading.classList.add('active');
    }
}

/**
 * ローディング非表示
 */
function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.remove('active');
    }
}

// ==================== 画面切り替え ====================

/**
 * 画面を切り替え
 */
function showScreen(screenId) {
    // 全画面を非表示
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    // 指定画面を表示
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }

    // ナビゲーションの更新
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.screen === screenId) {
            btn.classList.add('active');
        }
    });
}

// ==================== フォームヘルパー ====================

/**
 * フォームデータを取得
 */
function getFormData(formId) {
    const form = document.getElementById(formId);
    if (!form) return null;

    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => {
        data[key] = value;
    });
    return data;
}

/**
 * フォームをリセット
 */
function resetForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
        form.reset();
    }
}

/**
 * 要素の表示/非表示
 */
function toggleElement(elementId, show) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = show ? '' : 'none';
    }
}

// ==================== タグ入力ヘルパー ====================

/**
 * タグ入力フィールドを初期化
 */
function initTagInput(inputId, tagsContainerId) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(tagsContainerId);

    if (!input || !container) return;

    const tags = new Set();

    function renderTags() {
        container.innerHTML = '';
        tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.innerHTML = `${escapeHtml(tag)} <button type="button" class="tag-remove">&times;</button>`;
            tagEl.querySelector('.tag-remove').onclick = () => {
                tags.delete(tag);
                renderTags();
            };
            container.appendChild(tagEl);
        });
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const value = input.value.trim();
            if (value) {
                tags.add(value);
                input.value = '';
                renderTags();
            }
        }
    });

    return {
        getTags: () => Array.from(tags),
        setTags: (newTags) => {
            tags.clear();
            newTags.forEach(tag => tags.add(tag));
            renderTags();
        },
        clear: () => {
            tags.clear();
            renderTags();
        }
    };
}

// ==================== ユーティリティ ====================

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 配列をシャッフル
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * 日付をフォーマット
 */
function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== キーボードショートカット ====================

/**
 * キーボードショートカットを設定
 */
function setupKeyboardShortcuts(handlers) {
    document.addEventListener('keydown', (e) => {
        // 入力中は無視
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        const key = e.key.toUpperCase();
        if (handlers[key]) {
            e.preventDefault();
            handlers[key]();
        }
    });
}

// ==================== グローバルエクスポート ====================

window.QuizUI = {
    renderMarkdown,
    renderLaTeX,
    renderContent,
    getAssetUrl,
    revokeAssetUrl,
    revokeAllAssetUrls,
    createImageElement,
    showImageModal,
    closeImageModal,
    showToast,
    showConfirm,
    showLoading,
    hideLoading,
    showScreen,
    getFormData,
    resetForm,
    toggleElement,
    initTagInput,
    escapeHtml,
    shuffleArray,
    formatDate,
    setupKeyboardShortcuts
};
