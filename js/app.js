/**
 * app.js - メインアプリケーション
 * アプリの初期化とイベントリスナー設定を担当
 * 各機能モジュールを統合する
 */

// ==================== 初期化 ====================

/**
 * アプリケーション初期化
 */
async function initApp() {
    try {
        // 多言語対応の初期化（最初に実行）
        await I18n.init();
        console.log('多言語設定を初期化しました');

        // データベース初期化
        await QuizDB.initDB();
        console.log('アプリケーションを初期化しました');

        // イベントリスナーを設定
        setupEventListeners();

        // キーボードショートカットを設定
        setupKeyboardShortcuts();

        // 画像モーダルのクリックイベント
        document.getElementById('image-modal')?.addEventListener('click', () => {
            QuizUI.closeImageModal();
        });

        // タグ入力の初期化
        AppState.tagInput = QuizUI.initTagInput('tag-input', 'tags-container');

        // AI生成機能の初期化
        if (typeof AIGenerator !== 'undefined') {
            AIGenerator.initAIGenerator();
        }

        // 通知システムの初期化
        if (typeof NotificationUI !== 'undefined') {
            await NotificationUI.init();
            console.log('通知システムを初期化しました');
        }

        // 学習画面を初期表示
        QuizCore.showQuizStart();
        QuizUI.showScreen('quiz-screen');

        // Service Worker登録
        registerServiceWorker();

    } catch (error) {
        console.error('初期化エラー:', error);
        QuizUI.showToast('アプリの初期化に失敗しました', 'error');
    }
}

/**
 * 管理画面タブを切り替え
 */
function switchManageTab(tabName) {
    // タブボタンの状態を更新
    document.querySelectorAll('.manage-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // タブコンテンツの表示を切り替え
    document.querySelectorAll('.manage-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabName);
    });

    // タブに応じた初期化処理
    if (tabName === 'sets-tab') {
        QuizSets.refreshSetsScreen();
    } else if (tabName === 'ai-tab') {
        // AI生成機能のUI更新
        if (typeof AIGenerator !== 'undefined') {
            AIGenerator.updateApiKeyUI();
            AIGenerator.updateSetOptions();
        }
    }
}

/**
 * Service Workerを登録
 */
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker登録成功:', registration);
        } catch (error) {
            console.error('Service Worker登録失敗:', error);
        }
    }
}

// ==================== イベントリスナー ====================

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
    // ナビゲーション
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const screenId = btn.dataset.screen;

            // 画面切り替え時にno-scrollクラスをリセット（学習フェーズ中断時の対策）
            document.querySelector('.app-main')?.classList.remove('no-scroll');

            QuizUI.showScreen(screenId);

            // 画面に応じた初期化
            if (screenId === 'quiz-screen') {
                QuizCore.showQuizStart();
            } else if (screenId === 'manage-screen') {
                QuizManage.refreshManageScreen();
                // 管理画面を開いたときは「問題一覧」タブをアクティブに
                switchManageTab('questions-tab');
            }
        });
    });

    // 管理画面タブの切り替え
    document.querySelectorAll('.manage-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchManageTab(tabName);
        });
    });

    // 復習スケジュールの折りたたみ
    const scheduleHeader = document.getElementById('schedule-header');
    const scheduleContent = document.getElementById('schedule-content');
    const scheduleToggle = document.getElementById('schedule-toggle');

    if (scheduleHeader && scheduleContent && scheduleToggle) {
        scheduleHeader.addEventListener('click', () => {
            scheduleContent.classList.toggle('expanded');
            scheduleToggle.classList.toggle('expanded');
        });
    }

    // ツールチップの制御
    setupTooltips();

    // クイズ画面
    setupQuizEventListeners();

    // 管理画面
    setupManageEventListeners();

    // インポート/エクスポート
    setupExportImportEventListeners();
}

/**
 * クイズ画面のイベントリスナー
 */
function setupQuizEventListeners() {
    // 出題モード選択
    document.getElementById('quiz-mode')?.addEventListener('change', (e) => {
        AppState.quiz.mode = e.target.value;
        const tagSelectContainer = document.getElementById('quiz-tag-select-container');
        const questionCountSelect = document.getElementById('question-count-select');
        const earlyLearningOption = document.getElementById('early-learning-option');

        if (tagSelectContainer) {
            tagSelectContainer.style.display = e.target.value === 'tag' ? 'block' : 'none';
        }

        // 「今日の学習」モードのみ問題数選択と先取り学習オプションを表示
        const isTodayMode = e.target.value === 'today';
        if (questionCountSelect) {
            questionCountSelect.style.display = isTodayMode ? 'block' : 'none';
        }
        if (earlyLearningOption) {
            earlyLearningOption.style.display = isTodayMode ? 'block' : 'none';
        }
    });

    // クイズ開始ボタン
    document.getElementById('start-quiz-btn')?.addEventListener('click', QuizCore.startQuiz);

    // ★ 選択肢ボタン（統合モード用に変更）
    document.querySelectorAll('.choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!AppState.quiz.answered) {
                // 統合モードの解答処理を呼び出す
                QuizIntegrated.handleIntegratedQuizAnswer(btn.dataset.choice);
            }
        });
    });

    // タイピング入力のEnterキー
    document.getElementById('typing-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !AppState.quiz.answered) {
            // ★ 統合モードのタイピング解答処理を呼び出す
            QuizIntegrated.handleIntegratedTypingAnswer();
        }
    });

    // ★ 解答ボタン(タイピングモード)
    document.getElementById('submit-answer-btn')?.addEventListener('click', () => {
        QuizIntegrated.handleIntegratedTypingAnswer();
    });

    // クイズ終了ボタン
    document.getElementById('end-quiz-btn')?.addEventListener('click', QuizCore.endQuiz);

    // 習得済みボタン(クイズ画面)
    document.getElementById('mark-completed-btn')?.addEventListener('click', QuizCore.markCurrentAsCompleted);

    // 統合モード: フラッシュカードクリック
    document.getElementById('integrated-flashcard')?.addEventListener('click', QuizIntegrated.flipIntegratedCard);

    // 統合モード: 次へボタン
    document.getElementById('integrated-next-phase-btn')?.addEventListener('click', QuizIntegrated.nextIntegratedLearnPhase);

    // 前へボタン（4択/タイピングフェーズ用）
    document.getElementById('prev-question-btn')?.addEventListener('click', QuizIntegrated.moveToPrevQuestionInPhase);

    // 前へボタン（学習フェーズ用）
    document.getElementById('integrated-prev-btn')?.addEventListener('click', QuizIntegrated.moveToPrevQuestionInPhase);

    // ★ 次へボタン（統合モードで使用）
    document.getElementById('next-question-btn')?.addEventListener('click', async () => {
        if (AppState.integrated.phaseCompleted) {
            await QuizIntegrated.moveToNextQuestionInPhase();
        }
    });

    // ★ スキップボタン（削除 - 統合モードでは使わない）
    // document.getElementById('skip-question-btn')?.addEventListener('click', QuizCore.skipQuestion);
}

/**
 * 管理画面のイベントリスナー
 */
function setupManageEventListeners() {
    // 検索
    document.getElementById('search-input')?.addEventListener('input', (e) => {
        AppState.manage.searchQuery = e.target.value;
        QuizManage.filterQuestionList();
    });

    // タグ絞り込み
    document.getElementById('filter-tag')?.addEventListener('change', (e) => {
        AppState.manage.filterTag = e.target.value || null;
        QuizManage.filterQuestionList();
    });

    // セット所属フィルター
    document.getElementById('filter-set')?.addEventListener('change', (e) => {
        AppState.manage.filterSet = e.target.value || '';
        QuizManage.filterQuestionList();
    });

    // 学習状態フィルター
    document.getElementById('filter-mastery')?.addEventListener('change', (e) => {
        AppState.manage.filterMastery = e.target.value || '';
        QuizManage.filterQuestionList();
    });

    // 新規追加ボタン
    document.getElementById('add-question-btn')?.addEventListener('click', () => {
        showQuestionEditorExtended(null);
    });

    // 保存ボタン
    document.getElementById('save-question-btn')?.addEventListener('click', saveQuestionExtended);

    // キャンセルボタン
    document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
        QuizManage.hideQuestionEditor();
    });

    // 画像アップロード
    document.getElementById('image-upload')?.addEventListener('change', QuizManage.handleImageUpload);

    // タブ切り替え
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            QuizManage.switchEditorTab(tabName);
        });
    });

    // JSON保存ボタン
    document.getElementById('save-json-btn')?.addEventListener('click', QuizManage.saveFromJson);

    // JSONキャンセルボタン
    document.getElementById('cancel-json-btn')?.addEventListener('click', () => {
        QuizManage.hideQuestionEditor();
    });

    // プレビューボタン(フォーム)
    document.getElementById('preview-form-btn')?.addEventListener('click', () => {
        QuizManage.updatePreview('form');
    });

    // プレビューボタン(JSON)
    document.getElementById('preview-json-btn')?.addEventListener('click', () => {
        QuizManage.updatePreview('json');
    });

    // セット管理画面のイベントリスナー
    setupSetsEventListeners();

    // 出題形式選択時のタイピング設定表示切替
    document.querySelectorAll('input[name="question-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const typingSettings = document.getElementById('typing-settings');
            if (typingSettings) {
                const showTyping = e.target.value === 'typing' || e.target.value === 'both';
                typingSettings.style.display = showTyping ? 'block' : 'none';
            }
        });
    });

    // 語学学習モード選択時の音声設定表示切替
    const languageLearningCheckbox = document.getElementById('language-learning');
    if (languageLearningCheckbox) {
        languageLearningCheckbox.addEventListener('change', (e) => {
            const audioSettings = document.getElementById('audio-settings');
            if (audioSettings) {
                audioSettings.style.display = e.target.checked ? 'block' : 'none';
            }
        });
    }

    // 一括操作関連のイベントリスナー
    setupBulkActionsEventListeners();
}

/**
 * 一括操作関連のイベントリスナー
 */
function setupBulkActionsEventListeners() {
    // すべて選択チェックボックス
    document.getElementById('select-all-questions')?.addEventListener('change', (e) => {
        QuizSets.toggleSelectAllQuestions(e.target.checked);
    });

    // セットに追加ボタン
    document.getElementById('bulk-add-to-set-btn')?.addEventListener('click', () => {
        QuizSets.showSetSelectModal();
    });

    // 一括削除ボタン
    document.getElementById('bulk-delete-btn')?.addEventListener('click', () => {
        QuizSets.deleteSelectedQuestions();
    });

    // セット選択モーダルのキャンセルボタン
    document.getElementById('set-select-cancel')?.addEventListener('click', () => {
        QuizSets.hideSetSelectModal();
    });

    // セット選択モーダルの追加ボタン
    document.getElementById('set-select-confirm')?.addEventListener('click', () => {
        QuizSets.addSelectedQuestionsToSets();
    });
}

/**
 * セット管理画面のイベントリスナー
 */
function setupSetsEventListeners() {
    // 新規セット作成ボタン
    document.getElementById('add-set-btn')?.addEventListener('click', () => {
        QuizSets.showSetEditor(null);
    });

    // セット保存ボタン
    document.getElementById('save-set-btn')?.addEventListener('click', QuizSets.saveSet);

    // セットキャンセルボタン
    document.getElementById('cancel-set-btn')?.addEventListener('click', QuizSets.hideSetEditor);

    // セット内問題検索
    document.getElementById('set-questions-search-input')?.addEventListener('input', (e) => {
        AppState.sets.questionSearchQuery = e.target.value;
        if (AppState.sets.currentSet) {
            QuizSets.renderSetQuestions(AppState.sets.currentSet);
        }
    });

    // セット内問題タグフィルター
    document.getElementById('set-questions-filter-tag')?.addEventListener('change', (e) => {
        AppState.sets.questionFilterTag = e.target.value;
        if (AppState.sets.currentSet) {
            QuizSets.renderSetQuestions(AppState.sets.currentSet);
        }
    });

    // セット内問題すべて選択
    document.getElementById('set-select-all-questions')?.addEventListener('change', (e) => {
        QuizSets.toggleSetSelectAllQuestions(e.target.checked);
    });

    // セット内問題一括除外
    document.getElementById('set-bulk-remove-btn')?.addEventListener('click', () => {
        QuizSets.removeSelectedQuestionsFromSet();
    });
}

/**
 * エクスポート/インポートのイベントリスナー
 */
function setupExportImportEventListeners() {
    // ZIPエクスポート
    document.getElementById('export-zip-btn')?.addEventListener('click', () => {
        QuizExport.exportToZip();
    });

    // JSONエクスポート
    document.getElementById('export-json-btn')?.addEventListener('click', () => {
        QuizExport.exportQuestionsJson();
    });

    // インポート
    document.getElementById('import-file')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.name.endsWith('.zip')) {
            await QuizExport.importFromZip(file);
        } else if (file.name.endsWith('.json')) {
            await QuizExport.importFromJson(file);
        } else {
            QuizUI.showToast('対応していないファイル形式です', 'error');
        }

        // ファイル入力をリセット
        e.target.value = '';
    });

    // サンプルデータインポート
    document.getElementById('import-sample-btn')?.addEventListener('click', () => {
        QuizExport.importSampleData();
    });

    // 全データ削除
    document.getElementById('clear-data-btn')?.addEventListener('click', () => {
        QuizExport.clearAllData();
    });
}

/**
 * ツールチップの表示制御
 */
function setupTooltips() {
    // 全てのinfo-iconをクリックでトグル
    document.querySelectorAll('.info-tooltip-wrapper').forEach(wrapper => {
        const icon = wrapper.querySelector('.info-icon');
        if (icon) {
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // 他のツールチップを閉じる
                document.querySelectorAll('.info-tooltip-wrapper.show-tooltip').forEach(other => {
                    if (other !== wrapper) {
                        other.classList.remove('show-tooltip');
                    }
                });

                // このツールチップをトグル
                wrapper.classList.toggle('show-tooltip');
            });
        }
    });

    // 外側クリックでツールチップを閉じる
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.info-tooltip-wrapper')) {
            document.querySelectorAll('.info-tooltip-wrapper.show-tooltip').forEach(wrapper => {
                wrapper.classList.remove('show-tooltip');
            });
        }
    });
}

/**
 * キーボードショートカット
 */
function setupKeyboardShortcuts() {
    // 統合モード用のキーボードショートカット
    QuizUI.setupKeyboardShortcuts({
        // ★ A,B,C,Dキーは削除（統合モードでは使わない）
        'N': () => {
            // 統合モードの次へボタンをクリック
            const nextBtn = document.getElementById('next-question-btn');
            if (nextBtn && nextBtn.style.display !== 'none' && !nextBtn.disabled) {
                nextBtn.click();
            }
        }
        // ★ Sキー（スキップ）も削除
    });
}

// ==================== 関数の拡張(セット選択、タイピング設定等) ====================

/**
 * showQuestionEditorの拡張版(セット選択・出題形式を追加)
 */
async function showQuestionEditorExtended(questionId) {
    await QuizManage.showQuestionEditor(questionId);

    // セット選択肢を更新
    const question = questionId ? await QuizDB.getQuestion(questionId) : null;
    await QuizSets.renderSetCheckboxes('question-sets-checkboxes', question?.sets || []);

    // 出題形式を設定
    if (question?.type) {
        const typeRadio = document.querySelector(`input[name="question-type"][value="${question.type}"]`);
        if (typeRadio) typeRadio.checked = true;

        // タイピング設定を表示
        const typingSettings = document.getElementById('typing-settings');
        if (typingSettings) {
            const showTyping = question.type === 'typing' || question.type === 'both';
            typingSettings.style.display = showTyping ? 'block' : 'none';
        }

        // タイピング用の値を設定
        if (document.getElementById('typing-answer')) {
            document.getElementById('typing-answer').value = question.typingAnswer || '';
        }
        if (document.getElementById('acceptable-answers')) {
            document.getElementById('acceptable-answers').value = (question.acceptableAnswers || []).join(', ');
        }
        if (document.getElementById('case-sensitive')) {
            document.getElementById('case-sensitive').checked = question.caseSensitive || false;
        }
    }

    // 語学学習モードを設定
    if (document.getElementById('language-learning')) {
        document.getElementById('language-learning').checked = question?.isLanguageLearning || false;
    }
    const audioSettings = document.getElementById('audio-settings');
    if (audioSettings) {
        audioSettings.style.display = question?.isLanguageLearning ? 'block' : 'none';
    }
    if (document.getElementById('audio-lang')) {
        document.getElementById('audio-lang').value = question?.audioLang || 'en-US';
    }
}

/**
 * saveQuestionの拡張版(セット・出題形式を保存)
 */
async function saveQuestionExtended() {
    try {
        const title = document.getElementById('q-title').value.trim();
        const body_md = document.getElementById('q-body').value.trim();
        const choiceA = document.getElementById('q-choice-a').value.trim();
        const choiceB = document.getElementById('q-choice-b').value.trim();
        const choiceC = document.getElementById('q-choice-c').value.trim();
        const choiceD = document.getElementById('q-choice-d').value.trim();
        const answer = document.getElementById('q-answer').value;
        const explanation_md = document.getElementById('q-explanation').value.trim();
        const tags = AppState.tagInput?.getTags() || [];

        // バリデーション
        if (!body_md) {
            QuizUI.showToast('問題文を入力してください', 'error');
            return;
        }

        // アップロードされた画像のIDを取得
        const asset_ids = [];
        document.querySelectorAll('.uploaded-image-item').forEach(item => {
            asset_ids.push(item.dataset.assetId);
        });

        // 出題形式を取得
        const type = document.querySelector('input[name="question-type"]:checked')?.value || 'multiple-choice';

        // タイピング設定を取得
        const typingAnswer = document.getElementById('typing-answer')?.value.trim() || '';
        const acceptableAnswersStr = document.getElementById('acceptable-answers')?.value.trim() || '';
        const acceptableAnswers = acceptableAnswersStr ? acceptableAnswersStr.split(',').map(s => s.trim()).filter(s => s) : [];
        const caseSensitive = document.getElementById('case-sensitive')?.checked || false;

        // 語学学習モードを取得
        const isLanguageLearning = document.getElementById('language-learning')?.checked || false;
        const audioLang = document.getElementById('audio-lang')?.value || 'en-US';

        // 所属セットを取得
        const sets = QuizSets.getSelectedSetsFromForm();

        const questionData = {
            title,
            body_md,
            choices: { A: choiceA, B: choiceB, C: choiceC, D: choiceD },
            answer,
            explanation_md,
            tags,
            asset_ids,
            type,
            typingAnswer,
            acceptableAnswers,
            caseSensitive,
            isLanguageLearning,
            audioLang,
            sets
        };

        if (AppState.manage.editingId) {
            // 更新
            const oldQuestion = await QuizDB.getQuestion(AppState.manage.editingId);
            await QuizDB.updateQuestion(AppState.manage.editingId, questionData);

            // セットの関連付けを更新
            const oldSets = oldQuestion?.sets || [];
            const newSets = sets;

            // 削除されたセットから問題を除外
            for (const setId of oldSets) {
                if (!newSets.includes(setId)) {
                    await QuizDB.removeQuestionFromSet(AppState.manage.editingId, setId);
                }
            }

            // 追加されたセットに問題を追加
            for (const setId of newSets) {
                if (!oldSets.includes(setId)) {
                    await QuizDB.addQuestionToSet(AppState.manage.editingId, setId);
                }
            }

            QuizUI.showToast('問題を更新しました', 'success');
        } else {
            // 新規追加
            const newQuestion = await QuizDB.addQuestion(questionData);

            // セットに問題を追加
            for (const setId of sets) {
                await QuizDB.addQuestionToSet(newQuestion.id, setId);
            }

            QuizUI.showToast('問題を追加しました', 'success');
        }

        QuizManage.hideQuestionEditor();
        await QuizManage.refreshManageScreen();

    } catch (error) {
        console.error('保存エラー:', error);
        QuizUI.showToast('保存に失敗しました', 'error');
    }
}

// ==================== グローバル関数をエクスポート ====================

// 拡張版関数をwindowに登録
window.editQuestion = showQuestionEditorExtended;

// ==================== 初期化実行 ====================

document.addEventListener('DOMContentLoaded', initApp);