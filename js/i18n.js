/**
 * i18n.js - 国際化（多言語対応）モジュール
 * 言語切り替え、翻訳テキスト管理を担当
 */

const I18n = {
    currentLocale: 'ja',
    translations: {},
    availableLocales: [
        { code: 'ja', name: '日本語' },
        { code: 'ja-kids', name: 'にほんご（こどもよう）' },
        { code: 'en', name: 'English' }
    ],
    STORAGE_KEY: 'quiz-app-locale',

    /**
     * 初期化 - 保存された言語設定を読み込んで適用
     */
    async init() {
        const savedLocale = localStorage.getItem(this.STORAGE_KEY) || 'ja';
        await this.setLocale(savedLocale);
        this.setupLanguageSelector();
    },

    /**
     * 言語を設定
     */
    async setLocale(locale) {
        try {
            // 利用可能な言語かチェック
            const isValid = this.availableLocales.some(l => l.code === locale);
            if (!isValid) {
                locale = 'ja';
            }

            const response = await fetch(`locales/${locale}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load locale: ${locale}`);
            }
            this.translations = await response.json();
            this.currentLocale = locale;
            localStorage.setItem(this.STORAGE_KEY, locale);

            // HTML lang属性を更新
            document.documentElement.lang = locale.startsWith('ja') ? 'ja' : locale;

            // UIを更新
            this.updateUI();

            // 言語セレクターの選択状態を更新
            const selector = document.getElementById('language-select');
            if (selector) {
                selector.value = locale;
            }

            console.log(`言語を ${locale} に設定しました`);
        } catch (error) {
            console.error('言語ファイルの読み込みに失敗:', error);
            // フォールバック: 日本語を試行
            if (locale !== 'ja') {
                await this.setLocale('ja');
            }
        }
    },

    /**
     * 翻訳テキストを取得
     * @param {string} key - 翻訳キー（ドット区切り）
     * @param {object} params - 置換パラメータ（オプション）
     * @returns {string} 翻訳されたテキスト
     */
    t(key, params = {}) {
        let text = this.translations[key];

        if (text === undefined) {
            console.warn(`翻訳キーが見つかりません: ${key}`);
            return key;
        }

        // パラメータ置換 {{param}} 形式
        Object.keys(params).forEach(param => {
            text = text.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
        });

        return text;
    },

    /**
     * data-i18n属性を持つ全要素のテキストを更新
     */
    updateUI() {
        // テキストコンテンツ
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translated = this.t(key);
            if (translated !== key) {
                el.textContent = translated;
            }
        });

        // placeholder属性
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translated = this.t(key);
            if (translated !== key) {
                el.placeholder = translated;
            }
        });

        // title属性（ツールチップ）
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const translated = this.t(key);
            if (translated !== key) {
                el.title = translated;
            }
        });

        // aria-label属性
        document.querySelectorAll('[data-i18n-aria]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria');
            const translated = this.t(key);
            if (translated !== key) {
                el.setAttribute('aria-label', translated);
            }
        });

        // value属性（option要素など）
        document.querySelectorAll('[data-i18n-value]').forEach(el => {
            const key = el.getAttribute('data-i18n-value');
            const translated = this.t(key);
            if (translated !== key) {
                el.value = translated;
            }
        });

        // HTML内容（マークダウン等）
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            const translated = this.t(key);
            if (translated !== key) {
                el.innerHTML = translated;
            }
        });
    },

    /**
     * 言語選択ドロップダウンのイベント設定
     */
    setupLanguageSelector() {
        const selector = document.getElementById('language-select');
        if (selector) {
            selector.value = this.currentLocale;
            selector.addEventListener('change', async (e) => {
                await this.setLocale(e.target.value);
                // 動的コンテンツも再描画が必要な場合はイベントを発火
                window.dispatchEvent(new CustomEvent('localeChanged', {
                    detail: { locale: this.currentLocale }
                }));
            });
        }
    },

    /**
     * 現在の言語コードを取得
     */
    getLocale() {
        return this.currentLocale;
    },

    /**
     * 利用可能な言語リストを取得
     */
    getAvailableLocales() {
        return this.availableLocales;
    }
};

// グローバルに公開
window.I18n = I18n;
