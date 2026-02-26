/**
 * study.js - 統合モード機能（完全版）
 * 学習→4択→タイピングの統合学習フローを担当
 * 4択とタイピング両方正解した時のみSM-2更新
 */

// ==================== 選択肢シャッフル関連 ====================

/**
 * 選択肢のシャッフルマッピングを生成
 * @returns {Object} { displayMapping, reverseMapping }
 *   displayMapping: 表示位置 -> 元のキー (例: {A: 'C', B: 'A', C: 'D', D: 'B'})
 *   reverseMapping: 元のキー -> 表示位置 (例: {A: 'B', B: 'D', C: 'A', D: 'C'})
 */
function createChoiceShuffleMapping() {
    const originalKeys = ['A', 'B', 'C', 'D'];
    const shuffledKeys = QuizUI.shuffleArray([...originalKeys]);

    const displayMapping = {};
    const reverseMapping = {};

    shuffledKeys.forEach((originalKey, index) => {
        const displayKey = originalKeys[index];
        displayMapping[displayKey] = originalKey;
        reverseMapping[originalKey] = displayKey;
    });

    return { displayMapping, reverseMapping };
}

/**
 * 解説文中の選択肢キー（A, B, C, D）を置換
 * マーカー方式（{{A}}, {{B}}, {{C}}, {{D}}）を優先し、
 * マーカーがない場合は従来のパターン検出にフォールバック
 *
 * @param {string} explanation - 解説文
 * @param {Object} reverseMapping - 元キー -> 表示キーのマッピング
 * @returns {string} 置換後の解説文
 */
function replaceChoiceKeysInExplanation(explanation, reverseMapping) {
    if (!explanation || !reverseMapping) return explanation;

    // マーカー方式のチェック: {{A}}, {{B}}, {{C}}, {{D}} が存在するか
    const hasMarkers = /\{\{[A-D]\}\}/.test(explanation);

    if (hasMarkers) {
        // マーカー方式: {{A}} → シャッフル後のキーに置換
        let result = explanation;

        // 一時プレースホルダーで衝突を回避
        for (const [originalKey, newKey] of Object.entries(reverseMapping)) {
            result = result.replace(new RegExp(`\\{\\{${originalKey}\\}\\}`, 'g'), `__MARKER_${newKey}__`);
        }
        // プレースホルダーを実際のキーに置換
        result = result.replace(/__MARKER_([A-D])__/g, '$1');

        return result;
    }

    // 従来方式: パターン検出による置換（後方互換性のため維持）
    let result = explanation;

    // 置換パターン（順序重要：長いパターンから先に）
    // 選択肢A, 選択肢B などのパターン
    for (const [originalKey, newKey] of Object.entries(reverseMapping)) {
        // 「選択肢A」→「選択肢X」
        result = result.replace(new RegExp(`選択肢${originalKey}`, 'g'), `選択肢__TEMP_${newKey}__`);
    }
    // 一時プレースホルダーを戻す
    result = result.replace(/__TEMP_([A-D])__/g, '$1');

    // 各パターンを順番に置換（一時プレースホルダー使用で衝突回避）
    for (const [originalKey, newKey] of Object.entries(reverseMapping)) {
        // (A) → (X)
        result = result.replace(new RegExp(`\\(${originalKey}\\)`, 'g'), `(__TEMP_${newKey}__)`);
        // （A） → （X）（全角括弧）
        result = result.replace(new RegExp(`（${originalKey}）`, 'g'), `（__TEMP_${newKey}__）`);
        // A: → X:（行中）
        result = result.replace(new RegExp(`([^a-zA-Z])${originalKey}:`, 'g'), `$1__TEMP_${newKey}__:`);
        // A: → X:（行頭）
        result = result.replace(new RegExp(`^${originalKey}:`, 'gm'), `__TEMP_${newKey}__:`);
        // A： → X：（全角コロン）
        result = result.replace(new RegExp(`([^a-zA-Z])${originalKey}：`, 'g'), `$1__TEMP_${newKey}__：`);
        // A. → X.（ただし小数点は除外）
        result = result.replace(new RegExp(`([^a-zA-Z0-9])${originalKey}\\.([^0-9])`, 'g'), `$1__TEMP_${newKey}__.$2`);
        // 「Aが正解」「Aは正解」などのパターン
        result = result.replace(new RegExp(`([^a-zA-Z])${originalKey}(が|は|を|の|も)`, 'g'), `$1__TEMP_${newKey}__$2`);
        // 「正解はA」「答えはAです」などのパターン
        result = result.replace(new RegExp(`(正解|答え)(は|が)${originalKey}(です|でした)?([。、.\\s]|$)`, 'g'), `$1$2__TEMP_${newKey}__$3$4`);
        // **A:** などMarkdown太字内
        result = result.replace(new RegExp(`\\*\\*${originalKey}:\\*\\*`, 'g'), `**__TEMP_${newKey}__:**`);
        result = result.replace(new RegExp(`\\*\\*${originalKey}：\\*\\*`, 'g'), `**__TEMP_${newKey}__：**`);
    }

    // 一時プレースホルダーを実際のキーに置換
    result = result.replace(/__TEMP_([A-D])__/g, '$1');

    return result;
}

// ==================== 統合モード関連 ====================

/**
 * 統合モードを開始
 */
async function startIntegratedMode() {
    try {
        const flow = 'full';
        AppState.integrated.flow = flow;

        const phases = ['learn', 'quiz', 'typing'];
        AppState.integrated.phases = phases;
        AppState.integrated.currentPhaseIndex = 0;
        AppState.integrated.currentQuestionIndex = 0;
        AppState.integrated.isFlipped = false;
        AppState.integrated.phaseCompleted = false;

        // 問題ごとの結果を記録するMap
        AppState.integrated.questionResults = new Map();
        AppState.integrated.failedQuestions = [];
        AppState.integrated.isRetryMode = false; // 復習モードフラグ
        AppState.integrated.retriedQuestions = new Set();
        AppState.integrated.progressSaved = false;

        // シャッフルモードの設定を読み込む
        const shuffleModeCheckbox = document.getElementById('shuffle-choices-mode');
        AppState.quiz.shuffleMode = shuffleModeCheckbox?.checked || false;
        AppState.quiz.currentChoiceMapping = null;

        const setCheckboxes = document.querySelectorAll('#quiz-set-checkboxes input[type="checkbox"]:checked');
        const selectedSetIds = Array.from(setCheckboxes).map(cb => cb.value);
        AppState.quiz.selectedSets = selectedSetIds;

        const mode = AppState.quiz.mode || 'random';

        // ベースとなる問題を取得
        let baseQuestions;
        if (selectedSetIds.length > 0) {
            const questionSet = new Set();
            for (const setId of selectedSetIds) {
                const setQuestions = await QuizDB.getQuestionsBySet(setId);
                setQuestions.forEach(q => questionSet.add(JSON.stringify(q)));
            }
            baseQuestions = Array.from(questionSet).map(q => JSON.parse(q));
        } else {
            baseQuestions = await QuizDB.getAllQuestions();
        }

        // 出題モードに応じて問題を選択
        let questions = [];

        if (mode === 'today') {
            const selectedCount = parseInt(
                document.querySelector('input[name="question-count"]:checked')?.value || '10'
            );

            // 先取り学習オプションを取得
            const earlyLearningCheckbox = document.getElementById('early-learning-mode');
            const includeEarlyReview = earlyLearningCheckbox?.checked || false;

            // 未学習を含まないオプションを取得
            const excludeUnlearnedCheckbox = document.getElementById('exclude-unlearned-mode');
            const excludeUnlearned = excludeUnlearnedCheckbox?.checked || false;

            // 出題数に応じて新規問題の上限を設定（未学習を除外する場合は0）
            const newQuestionsLimit = excludeUnlearned ? 0 : Math.ceil(selectedCount / 2);
            const studyPlan = await SM2.getTodayStudyPlan(baseQuestions, selectedCount, newQuestionsLimit, includeEarlyReview);

            const newQuestions = [];
            // 未学習を除外しない場合のみ新規問題を追加
            if (!excludeUnlearned) {
                for (const id of studyPlan.new) {
                    const q = baseQuestions.find(bq => bq.id === id);
                    if (q) newQuestions.push(q);
                }
            }

            const reviewQuestions = [];
            for (const id of studyPlan.review) {
                const q = baseQuestions.find(bq => bq.id === id);
                if (q) reviewQuestions.push(q);
            }

            // 先取り学習問題を追加
            const earlyReviewQuestions = [];
            if (studyPlan.earlyReview) {
                for (const id of studyPlan.earlyReview) {
                    const q = baseQuestions.find(bq => bq.id === id);
                    if (q) earlyReviewQuestions.push(q);
                }
            }

            const shuffledReview = QuizUI.shuffleArray(reviewQuestions);
            const shuffledEarlyReview = QuizUI.shuffleArray(earlyReviewQuestions);
            const allQuestions = [...newQuestions, ...shuffledReview, ...shuffledEarlyReview];
            questions = allQuestions.slice(0, selectedCount);

        } else if (mode === 'unanswered') {
            const allStats = await QuizDB.getAllStats();
            const answeredIds = new Set(allStats.map(s => s.question_id));
            questions = baseQuestions.filter(q => !answeredIds.has(q.id));
        } else if (mode === 'tag') {
            QuizCore.updateSelectedTags('quiz-tag-checkboxes');
            const selectedTags = AppState.quiz.selectedTags;

            if (selectedTags.length === 0) {
                QuizUI.showToast(I18n.t('toast.selectTag'), 'warning');
                return;
            }

            questions = baseQuestions.filter(q => {
                if (!q.tags || q.tags.length === 0) return false;
                return selectedTags.some(tag => q.tags.includes(tag));
            });
        } else {
            questions = baseQuestions;
        }

        if (questions.length === 0) {
            if (mode === 'unanswered') {
                QuizUI.showToast(I18n.t('toast.allAnswered'), 'info');
            } else {
                QuizUI.showToast(I18n.t('toast.noQuestions'), 'warning');
            }
            return;
        }

        if (mode !== 'today') {
            questions = QuizUI.shuffleArray(questions);
        }

        AppState.integrated.allQuestions = questions;
        AppState.quiz.format = 'integrated';
        AppState.quiz.seenQuestions = new Set();

        // 学習開始前のstatsを保存（進捗変化の表示用）
        AppState.integrated.beforeStats = new Map();
        for (const q of questions) {
            try {
                const stats = await QuizDB.getStats(q.id);
                if (stats) {
                    AppState.integrated.beforeStats.set(q.id, {
                        interval: stats.interval || 0,
                        repetitions: stats.repetitions || 0
                    });
                }
            } catch (e) {
                // 取得失敗は無視
            }
        }

        document.getElementById('quiz-start').style.display = 'none';
        document.getElementById('quiz-content').style.display = 'block';

        await startPhase(0);

    } catch (error) {
        console.error('統合モード開始エラー:', error);
        QuizUI.showToast('統合モードの開始に失敗しました', 'error');
    }
}

/**
 * フェーズを開始
 * @param {number} phaseIndex - フェーズインデックス (0: 学習, 1: 4択, 2: タイピング)
 */
async function startPhase(phaseIndex) {
    AppState.integrated.currentPhaseIndex = phaseIndex;
    AppState.integrated.currentQuestionIndex = 0;

    const phaseName = AppState.integrated.phases[phaseIndex];
    const allQuestions = AppState.integrated.allQuestions;

    console.log(`🎯 フェーズ ${phaseIndex} (${phaseName}) を開始`);
    console.log(`📊 全問題数: ${allQuestions.length}`);

    let phaseQuestions = [];

    if (phaseName === 'learn') {
        // 学習フェーズ: 未学習問題のみ
        const allStats = await QuizDB.getAllStats();
        const studiedIds = new Set(allStats.map(s => s.question_id));
        phaseQuestions = allQuestions.filter(q => !studiedIds.has(q.id));
        
        console.log(`📚 学習フェーズ: ${phaseQuestions.length}/${allQuestions.length}問 (未学習のみ)`);

        if (phaseQuestions.length === 0) {
            console.log('✅ 未学習問題がないため、学習フェーズをスキップします');
            await startPhase(phaseIndex + 1);
            return;
        }

    } else if (phaseName === 'quiz') {
        // 4択フェーズ: 全問題
        phaseQuestions = [...allQuestions];
        console.log(`📝 4択フェーズ: ${phaseQuestions.length}問 (全問題)`);

    } else if (phaseName === 'typing') {
        // タイピングフェーズ: 4択で正解した問題のみ
        phaseQuestions = allQuestions.filter(q => {
            if (!(q.type === 'typing' || q.type === 'both') || !q.typingAnswer) {
                return false;
            }
            const result = AppState.integrated.questionResults.get(q.id);
            return result?.quizCorrect === true; // 4択で正解した問題のみ
        });
        
        console.log(`⌨️ タイピングフェーズ: ${phaseQuestions.length}問 (4択正解のみ)`);

        if (phaseQuestions.length === 0) {
            console.log('✅ タイピング対象問題がないため、完了処理へ');
            await finishAllPhases();
            return;
        }
    }

    AppState.integrated.phaseQuestions = phaseQuestions;

    showCurrentQuestionInPhase();
}

/**
 * 現在のフェーズの現在の問題を表示
 * @param {boolean} showAnswered - true: 解答済み状態で表示（前へ戻った時）
 */
async function showCurrentQuestionInPhase(showAnswered = false) {
    const phaseQuestions = AppState.integrated.phaseQuestions;
    const questionIndex = AppState.integrated.currentQuestionIndex;

    if (questionIndex >= phaseQuestions.length) {
        console.log('✅ このフェーズの全問題が完了しました');
        await moveToNextPhase();
        return;
    }

    // ★ 問題表示時にスクロール位置をリセット
    scrollToTop();

    const question = phaseQuestions[questionIndex];
    const phaseName = AppState.integrated.phases[AppState.integrated.currentPhaseIndex];

    console.log(`📄 ${phaseName}フェーズ: 問題 ${questionIndex + 1}/${phaseQuestions.length} - ${question.title || question.id.substring(0, 8)}`);

    // 進捗表示を更新
    document.getElementById('quiz-progress').textContent =
        `${questionIndex + 1} / ${phaseQuestions.length}`;

    // フェーズラベルを更新
    const phaseLabelEl = document.getElementById('quiz-phase-label');
    if (phaseLabelEl) {
        const phaseLabels = {
            'learn': I18n.t('quiz.phase.learn'),
            'quiz': I18n.t('quiz.phase.quiz'),
            'typing': I18n.t('quiz.phase.typing')
        };
        const phaseClasses = {
            'learn': 'phase-learn',
            'quiz': 'phase-quiz',
            'typing': 'phase-typing'
        };
        phaseLabelEl.textContent = phaseLabels[phaseName] || phaseName;
        phaseLabelEl.className = 'quiz-phase-label ' + (phaseClasses[phaseName] || '');
    }

    // フェーズフロー（全体の流れ）を更新
    updatePhaseFlow();

    // 復習モードの場合はretry-badgeを表示
    const retryBadge = document.getElementById('retry-badge');
    if (retryBadge) {
        if (AppState.integrated.isRetryMode) {
            retryBadge.style.display = 'block';
        } else {
            retryBadge.style.display = 'none';
        }
    }

    // すべてのコンテナを非表示
    document.getElementById('choices-container').style.display = 'none';
    document.getElementById('typing-container').style.display = 'none';
    document.getElementById('explanation-container').style.display = 'none';
    document.getElementById('typing-result').style.display = 'none';
    document.getElementById('integrated-learn-container').style.display = 'none';
    document.getElementById('explanation-container').style.display = 'none';

    // アクションボタンをリセット（フェーズ表示関数で必要に応じて再表示される）
    document.getElementById('skip-question-btn').style.display = 'none';
    document.getElementById('next-question-btn').style.display = 'none';
    document.getElementById('mark-completed-btn').style.display = 'none';

    const questionContainer = document.querySelector('.question-container');

    // 前へボタンの表示制御（最初の問題では非表示）
    const prevQuizBtn = document.getElementById('prev-question-btn');
    const prevLearnBtn = document.getElementById('integrated-prev-btn');
    const showPrevBtn = questionIndex > 0;

    if (prevQuizBtn) {
        prevQuizBtn.style.display = showPrevBtn ? 'inline-block' : 'none';
    }
    if (prevLearnBtn) {
        prevLearnBtn.style.display = showPrevBtn ? 'inline-block' : 'none';
    }

    // フェーズに応じた表示
    if (phaseName === 'learn') {
        if (questionContainer) questionContainer.style.display = 'none';
        await showIntegratedLearnPhase(question, showAnswered);
    } else if (phaseName === 'quiz') {
        if (questionContainer) questionContainer.style.display = 'block';
        await showIntegratedQuizPhase(question, showAnswered);
    } else if (phaseName === 'typing') {
        if (questionContainer) questionContainer.style.display = 'block';
        await showIntegratedTypingPhase(question, showAnswered);
    }

    // モバイル対策: コンテンツ描画完了後に再度スクロール位置をリセット
    scrollToTop();
}

/**
 * 次のフェーズへ移動
 */
async function moveToNextPhase() {
    const currentPhaseIndex = AppState.integrated.currentPhaseIndex;
    const phases = AppState.integrated.phases;

    if (currentPhaseIndex < phases.length - 1) {
        // 次のフェーズへ
        await startPhase(currentPhaseIndex + 1);
    } else {
        // すべて完了
        await finishAllPhases();
    }
}

/**
 * 全フェーズ完了後の処理
 */
async function finishAllPhases() {
    console.log('🏁 全フェーズ完了、結果を集計中...');
    AppState.integrated.progressSaved = false;

    const allQuestions = AppState.integrated.allQuestions;
    const failedQuestions = [];

    // 各問題の結果を確認
    for (const question of allQuestions) {
        const result = AppState.integrated.questionResults.get(question.id);
        
        const hasTyping = (question.type === 'typing' || question.type === 'both') && question.typingAnswer;
        
        let isPassed = false;
        
        if (hasTyping) {
            // タイピング対応問題：4択とタイピング両方正解が必要
            isPassed = result?.quizCorrect === true && result?.typingCorrect === true;
        } else {
            // 4択のみ問題：4択正解のみでOK
            isPassed = result?.quizCorrect === true;
        }

        if (!isPassed) {
            failedQuestions.push(question);
            console.log(`❌ 失敗: ${question.title || question.id.substring(0, 8)} (4択:${result?.quizCorrect}, タイピング:${result?.typingCorrect})`);
        } else {
            // 両方正解した問題のみSM-2統計を更新
            if (!AppState.quiz.seenQuestions.has(question.id)) {
                const wasRetried = AppState.integrated.retriedQuestions.has(question.id);
                if (!wasRetried) {
                    // 初回正解: 通常通りstats更新（interval増加）
                    await QuizDB.updateStats(question.id, true);
                    console.log(`✅ 合格&統計更新: ${question.title || question.id.substring(0, 8)}`);
                } else {
                    // リトライ後正解: statsを更新しない（interval現状維持）
                    console.log(`🔄 リトライ合格（進捗維持）: ${question.title || question.id.substring(0, 8)}`);
                }
                AppState.quiz.seenQuestions.add(question.id);
            }
        }
    }

    if (failedQuestions.length > 0) {
        console.log(`🔄 ${failedQuestions.length}問を4択からやり直します`);

        // 失敗問題をリトライ済みSetに記録（低品質スコアで更新するため）
        failedQuestions.forEach(q => {
            AppState.integrated.retriedQuestions.add(q.id);
        });

        // 失敗した問題で再スタート
        AppState.integrated.allQuestions = failedQuestions;

        // 復習モードフラグを設定
        AppState.integrated.isRetryMode = true;

        // 失敗した問題の結果をリセット
        failedQuestions.forEach(q => {
            AppState.integrated.questionResults.delete(q.id);
        });

        // 4択フェーズから再開（学習フェーズはスキップ）
        await startPhase(1);
    } else {
        console.log('🎉 全問題クリア！');
        showIntegratedResult();
    }
}

/**
 * フェーズ内の次の問題へ移動
 */
async function moveToNextQuestionInPhase() {
    console.log('🔄 次の問題へ');
    AppState.integrated.currentQuestionIndex++;
    AppState.integrated.isFlipped = false;
    AppState.integrated.phaseCompleted = false;
    AppState.quiz.answered = false;

    // ★ 画面を一番上にスクロール
    scrollToTop();

    // 既に解答済みの問題に移動する場合は解答済み状態で表示
    const showAnswered = isCurrentQuestionAnsweredInPhase();
    await showCurrentQuestionInPhase(showAnswered);
}

/**
 * 現在のフェーズで現在の問題が既に解答済みかどうかを判定
 * @returns {boolean} 解答済みならtrue
 */
function isCurrentQuestionAnsweredInPhase() {
    const phaseQuestions = AppState.integrated.phaseQuestions;
    const questionIndex = AppState.integrated.currentQuestionIndex;

    if (questionIndex >= phaseQuestions.length) return false;

    const question = phaseQuestions[questionIndex];
    const result = AppState.integrated.questionResults.get(question.id);
    if (!result) return false;

    const phaseName = AppState.integrated.phases[AppState.integrated.currentPhaseIndex];

    if (phaseName === 'quiz') {
        return result.quizCorrect !== null && result.quizCorrect !== undefined;
    } else if (phaseName === 'typing') {
        return result.typingCorrect !== null && result.typingCorrect !== undefined;
    } else if (phaseName === 'learn') {
        return result.learnSeen === true;
    }

    return false;
}

/**
 * 画面を一番上にスクロールする
 * モバイルブラウザではDOM更新前のscrollTop設定が反映されない場合があるため、
 * requestAnimationFrameで描画後にも再度スクロールをリセットする
 */
function scrollToTop() {
    // メインコンテンツエリアをスクロール
    const appMain = document.querySelector('.app-main');
    if (appMain) {
        appMain.scrollTop = 0;
    }
    // bodyとhtmlも念のためスクロール
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // モバイルブラウザ対策: 描画サイクル後に再度スクロールリセット
    requestAnimationFrame(() => {
        if (appMain) {
            appMain.scrollTop = 0;
        }
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    });
}

/**
 * フラッシュカードの先頭にスクロールする
 */
function scrollToFlashcard() {
    const flashcard = document.getElementById('integrated-flashcard');
    if (flashcard) {
        // フラッシュカードを画面の上部に表示
        flashcard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * フェーズ内の前の問題へ移動
 */
async function moveToPrevQuestionInPhase() {
    const questionIndex = AppState.integrated.currentQuestionIndex;

    if (questionIndex <= 0) {
        console.log('⚠️ これ以上前の問題はありません');
        return;
    }

    console.log('🔙 前の問題へ');
    AppState.integrated.currentQuestionIndex--;

    // 画面を一番上にスクロール
    scrollToTop();

    // 前の問題を表示（解答済みの状態で）
    await showCurrentQuestionInPhase(true); // true = 解答済みとして表示
}

/**
 * フェーズフロー（全体の流れ）を更新表示
 */
function updatePhaseFlow() {
    const flowEl = document.getElementById('quiz-phase-flow');
    if (!flowEl) return;

    const phases = AppState.integrated.phases;
    const currentPhaseIndex = AppState.integrated.currentPhaseIndex;
    const allQuestions = AppState.integrated.allQuestions;

    // 各フェーズの情報を計算
    const phaseInfo = [];

    for (let i = 0; i < phases.length; i++) {
        const phaseName = phases[i];
        let count = 0;
        let label = '';
        let icon = '';

        if (phaseName === 'learn') {
            // 学習フェーズ：未学習問題数（フェーズ開始時に計算済み）
            if (i === currentPhaseIndex) {
                count = AppState.integrated.phaseQuestions?.length || 0;
            } else if (i < currentPhaseIndex) {
                count = 0; // 完了済み
            } else {
                // まだ開始していないので推定
                count = '?';
            }
            label = I18n.t('quiz.phaseFlow.learn');
            icon = '📚';
        } else if (phaseName === 'quiz') {
            // 4択フェーズ：全問題数
            count = allQuestions.length;
            label = I18n.t('quiz.phaseFlow.quiz');
            icon = '📝';
        } else if (phaseName === 'typing') {
            // タイピングフェーズ：タイピング対応問題数（最大値）
            if (i === currentPhaseIndex) {
                count = AppState.integrated.phaseQuestions?.length || 0;
            } else if (i < currentPhaseIndex) {
                count = 0; // 完了済み
            } else {
                // タイピング対応問題数を計算
                const typingCount = allQuestions.filter(q =>
                    (q.type === 'typing' || q.type === 'both') && q.typingAnswer
                ).length;
                count = typingCount > 0 ? `〜${typingCount}` : 0;
            }
            label = I18n.t('quiz.phaseFlow.typing');
            icon = '⌨️';
        }

        phaseInfo.push({
            name: phaseName,
            label,
            icon,
            count,
            isCurrent: i === currentPhaseIndex,
            isCompleted: i < currentPhaseIndex
        });
    }

    // HTMLを生成
    const flowHtml = phaseInfo.map((info, index) => {
        let className = 'phase-flow-item';
        if (info.isCurrent) className += ' current';
        if (info.isCompleted) className += ' completed';

        const countText = info.count === 0 ? '' :
                         (typeof info.count === 'string' ? info.count : `${info.count}問`);

        const arrow = index < phaseInfo.length - 1 ? '<span class="phase-flow-arrow">→</span>' : '';

        // 完了済みフェーズは✓表示
        if (info.isCompleted) {
            return `<span class="${className}"><span class="phase-flow-icon">✓</span>${info.label}</span>${arrow}`;
        }

        return `<span class="${className}"><span class="phase-flow-icon">${info.icon}</span>${info.label}${countText ? ` <span class="phase-flow-count">${countText}</span>` : ''}</span>${arrow}`;
    }).join('');

    flowEl.innerHTML = flowHtml;
}

/**
 * 統合モード結果を表示
 */
async function showIntegratedResult() {
    // 画面スクロールを有効に戻す
    document.querySelector('.app-main')?.classList.remove('no-scroll');

    document.getElementById('quiz-content').style.display = 'none';
    document.getElementById('quiz-result').style.display = 'block';

    const total = AppState.quiz.seenQuestions.size;

    document.getElementById('result-total').innerHTML = I18n.t('quiz.result.total', { count: total });

    let detailHtml = '';

    // seenQuestionsにある問題の統計を取得
    for (const questionId of AppState.quiz.seenQuestions) {
        try {
            const stats = await QuizDB.getStats(questionId);
            const question = await QuizDB.getQuestion(questionId);

            if (!question) continue;

            // タイトルとタグ・セット情報を表示
            const questionLabel = await formatQuestionLabel(question, true);

            // 復習間隔の変化を取得して％計算
            const beforeStats = AppState.integrated.beforeStats?.get(questionId);
            const beforeInterval = beforeStats?.interval || 0;
            const afterInterval = stats?.interval || 0;

            // ％計算（interval / 21 * 100、最大100%）
            const beforePercent = Math.min(Math.round(beforeInterval / 21 * 100), 100);
            const afterPercent = Math.min(Math.round(afterInterval / 21 * 100), 100);

            // 進捗変化の表示（％→％形式）
            let progressText = '';
            if (beforeInterval === 0 && afterInterval > 0) {
                progressText = `<span class="progress-new">✨ 新規 → ${afterPercent}%</span>`;
            } else if (afterPercent > beforePercent) {
                progressText = `<span class="progress-up">📈 ${beforePercent}% → ${afterPercent}%</span>`;
            } else if (afterPercent === beforePercent) {
                progressText = `<span class="progress-same">→ ${afterPercent}% 維持</span>`;
            } else {
                progressText = `<span class="progress-down">📉 ${beforePercent}% → ${afterPercent}%</span>`;
            }

            detailHtml += `
                <div class="result-question-item">
                    <div class="result-question-header">
                        <div class="result-question-label">${questionLabel}</div>
                    </div>
                    <div class="result-question-progress">
                        ${progressText}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('結果表示エラー:', error);
        }
    }

    document.getElementById('result-stats').innerHTML = detailHtml;
}

/**
 * 問題のラベルをフォーマット（タグとセット情報）- 結果画面用
 * @param {Object} question - 問題オブジェクト
 * @param {boolean} showTitle - タイトルを表示するか（デフォルト: false）
 * @returns {string} フォーマットされたラベル（HTML）
 */
async function formatQuestionLabel(question, showTitle = false) {
    const parts = [];

    // タイトルを表示（showTitleがtrueの場合）
    if (showTitle && question.title) {
        parts.push(`<span class="result-title">${QuizUI.escapeHtml(question.title)}</span>`);
    }

    // タグを表示（最大2つ）
    if (question.tags && question.tags.length > 0) {
        const displayTags = question.tags.slice(0, 2).map(tag =>
            `<span class="result-tag">${QuizUI.escapeHtml(tag)}</span>`
        ).join('');
        parts.push(displayTags);
    }

    // セット名を表示（最初の1つ）
    if (question.sets && question.sets.length > 0) {
        try {
            const set = await QuizDB.getQuestionSet(question.sets[0]);
            if (set) {
                parts.push(`<span class="result-set">📦 ${QuizUI.escapeHtml(set.name)}</span>`);
            }
        } catch (e) {
            // セット取得失敗は無視
        }
    }

    // 何もない場合は問題の冒頭を表示
    if (parts.length === 0) {
        const bodyPreview = (question.body_md || '').substring(0, 30);
        return `<span class="result-body-preview">${QuizUI.escapeHtml(bodyPreview)}${bodyPreview.length >= 30 ? '...' : ''}</span>`;
    }

    return parts.join(' ');
}

/**
 * クイズ中に表示するラベルを生成（タイトルの代わりにタグ・セット）
 * @param {Object} question - 問題オブジェクト
 * @returns {string} プレーンテキストのラベル
 */
async function getQuizDisplayLabel(question) {
    const parts = [];

    // タグを表示（最大2つ）
    if (question.tags && question.tags.length > 0) {
        const displayTags = question.tags.slice(0, 2).map(tag => `#${tag}`).join(' ');
        parts.push(displayTags);
    }

    // セット名を表示（最初の1つ）
    if (question.sets && question.sets.length > 0) {
        try {
            const set = await QuizDB.getQuestionSet(question.sets[0]);
            if (set) {
                parts.push(`📦 ${set.name}`);
            }
        } catch (e) {
            // セット取得失敗は無視
        }
    }

    // 何もない場合は「問題」を表示
    if (parts.length === 0) {
        return I18n.t('quiz.question');
    }

    return parts.join('  ');
}


/**
 * 統合モード: 学習フェーズを表示
 * @param {Object} question - 問題データ
 * @param {boolean} showAnswered - 解答済み状態で表示するか
 */
async function showIntegratedLearnPhase(question, showAnswered = false) {
    const container = document.getElementById('integrated-learn-container');
    const flashcard = document.getElementById('integrated-flashcard');

    // 学習フェーズ中は画面スクロールを無効化
    document.querySelector('.app-main')?.classList.add('no-scroll');

    // quiz-actionsを非表示にする
    const quizActions = document.querySelector('.quiz-actions');
    if (quizActions) {
        quizActions.style.display = 'none';
    }

    // ★ 重要: コンテナを一旦非表示にする
    container.style.display = 'none';

    // ★ 確実にフリップ状態をリセット（強制的に表面を表示）
    flashcard.classList.remove('flipped');
    
    // 強制リフロー
    void flashcard.offsetHeight;
    
    AppState.integrated.isFlipped = false;
    AppState.integrated.phaseCompleted = false;

    // 問題を表示（タイトルの代わりにタグ・セット情報）
    const learnLabel = await getQuizDisplayLabel(question);
    document.getElementById('integrated-question-title').textContent = learnLabel;
    QuizUI.renderContent(question.body_md || '', document.getElementById('integrated-question-body'));

    // 画像を表示
    const imagesContainer = document.getElementById('integrated-question-images');
    imagesContainer.innerHTML = '';
    if (question.asset_ids && question.asset_ids.length > 0) {
        for (const assetId of question.asset_ids) {
            const img = await QuizUI.createImageElement(assetId);
            if (img) {
                img.classList.add('flashcard-image');
                imagesContainer.appendChild(img);
            }
        }
    }

    // シャッフルモードの判定（学習フェーズ用）
    const shouldShuffleLearn = AppState.quiz.shuffleMode && question.shuffleReady === true;
    let learnMapping = null;
    if (shouldShuffleLearn) {
        learnMapping = createChoiceShuffleMapping();
        AppState.quiz.currentChoiceMapping = learnMapping;
    } else {
        AppState.quiz.currentChoiceMapping = null;
    }

    // 選択肢を表示(4択問題の場合)
    const choicesContainer = document.getElementById('integrated-choices');
    if (choicesContainer) {
        if (question.choices && (question.type !== 'typing')) {
            const choiceHtml = ['A', 'B', 'C', 'D'].map(displayKey => {
                // シャッフル時は元のキーから内容を取得
                const originalKey = learnMapping ? learnMapping.displayMapping[displayKey] : displayKey;
                const choiceText = question.choices[originalKey] || '';
                if (!choiceText) return '';
                return `
                    <div class="integrated-choice-item">
                        <span class="integrated-choice-label">${displayKey}</span>
                        <span class="integrated-choice-text">${QuizUI.escapeHtml(choiceText)}</span>
                    </div>
                `;
            }).join('');
            choicesContainer.innerHTML = choiceHtml;
            choicesContainer.style.display = 'flex';
        } else {
            choicesContainer.innerHTML = '';
            choicesContainer.style.display = 'none';
        }
    }

    // 音声ボタンは最初は非表示(裏返した時に表示)
    const speakBtn = document.getElementById('integrated-speak-btn');
    if (speakBtn) {
        speakBtn.style.display = 'none';
        AppState.integrated.currentLearnQuestion = question;
    }

    // 答えを表示
    let answerText = '';
    if (question.type === 'typing' || question.type === 'both') {
        answerText = question.typingAnswer || '';
    } else {
        const correctChoice = question.answer;
        // シャッフル時は表示キーを使用
        const displayKey = learnMapping ? learnMapping.reverseMapping[correctChoice] : correctChoice;
        answerText = `${displayKey}: ${question.choices[correctChoice] || ''}`;
    }
    QuizUI.renderContent(answerText, document.getElementById('integrated-answer'));

    // 解説を表示（シャッフル時はキーを置換）
    let explanationText = question.explanation_md || I18n.t('quiz.noExplanation');
    if (learnMapping) {
        explanationText = replaceChoiceKeysInExplanation(explanationText, learnMapping.reverseMapping);
    }
    QuizUI.renderContent(explanationText, document.getElementById('integrated-explanation'));

    // 次のステップボタンを非表示(カードを裏返すまで)
    document.getElementById('integrated-next-phase-btn').style.display = 'none';

    // ★ 少し待ってからコンテナを表示（DOM更新完了を待つ）
    setTimeout(() => {
        // 解答済み状態でなければ、確実に表面を表示
        if (!showAnswered) {
            flashcard.classList.remove('flipped');
        }
        
        container.style.display = 'block';

        // スクロール位置をリセット
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const frontContent = flashcard.querySelector('.flashcard-front .flashcard-content');
                const backContent = flashcard.querySelector('.flashcard-back .flashcard-content');
                
                if (frontContent) {
                    frontContent.scrollTop = 0;
                    console.log('表面のスクロール位置をリセット:', frontContent.scrollTop);
                }
                if (backContent) {
                    backContent.scrollTop = 0;
                    console.log('裏面のスクロール位置をリセット:', backContent.scrollTop);
                }
            });
        });

        // 解答済み状態で表示する場合(前へ戻った時)
        if (showAnswered) {
            flashcard.classList.add('flipped');
            AppState.integrated.isFlipped = true;
            AppState.integrated.phaseCompleted = true;
            document.getElementById('integrated-next-phase-btn').style.display = 'inline-block';

            // 音声ボタンも表示
            const speakBtn = document.getElementById('integrated-speak-btn');
            if (speakBtn && question.isLanguageLearning && question.audioEnabled) {
                speakBtn.style.display = 'inline-block';
            }
        }
    }, 50);
}

/**
 * 統合モード: 4択フェーズを表示
 * @param {Object} question - 問題データ
 * @param {boolean} showAnswered - 解答済み状態で表示するか
 */
async function showIntegratedQuizPhase(question, showAnswered = false) {
    // 画面スクロールを有効に戻す
    document.querySelector('.app-main')?.classList.remove('no-scroll');

    // ★ 追加: quiz-actionsを表示する
    const quizActions = document.querySelector('.quiz-actions');
    if (quizActions) {
        quizActions.style.display = 'flex';
    }

    // 問題情報を表示（タイトルの代わりにタグ・セット情報）
    const quizLabel = await getQuizDisplayLabel(question);
    document.getElementById('question-title').textContent = quizLabel;
    QuizUI.renderContent(question.body_md, document.getElementById('question-body'));

    // 画像
    const imagesContainer = document.getElementById('question-images');
    imagesContainer.innerHTML = '';
    if (question.asset_ids && question.asset_ids.length > 0) {
        for (const assetId of question.asset_ids) {
            const img = await QuizUI.createImageElement(assetId);
            if (img) imagesContainer.appendChild(img);
        }
    }

    // 選択肢を表示
    const choicesContainer = document.getElementById('choices-container');
    choicesContainer.style.display = 'block';

    // 解答結果を取得
    const result = AppState.integrated.questionResults.get(question.id);
    const wasAnswered = result?.quizCorrect !== null && result?.quizCorrect !== undefined;

    // シャッフルモードの判定
    const shouldShuffle = AppState.quiz.shuffleMode && question.shuffleReady === true;

    // シャッフルマッピングを取得または生成
    let mapping = null;
    if (shouldShuffle) {
        if (showAnswered && result?.choiceMapping) {
            // 解答済みの場合は保存されたマッピングを使用
            mapping = result.choiceMapping;
        } else if (!showAnswered) {
            // 新規表示の場合はマッピングを生成
            mapping = createChoiceShuffleMapping();
        }
        AppState.quiz.currentChoiceMapping = mapping;
    } else {
        AppState.quiz.currentChoiceMapping = null;
    }

    document.querySelectorAll('.choice-btn').forEach(btn => {
        btn.classList.remove('correct', 'incorrect', 'selected');
        const displayKey = btn.dataset.choice; // 表示上のキー（A, B, C, D）

        // シャッフル時は元のキーから内容を取得
        const originalKey = mapping ? mapping.displayMapping[displayKey] : displayKey;
        QuizUI.renderContent(question.choices[originalKey] || '', btn.querySelector('.choice-text'));

        // 解答済みとして表示する場合
        if (showAnswered && wasAnswered) {
            btn.disabled = true;
            // 正解の表示位置を計算
            const correctDisplayKey = mapping ? mapping.reverseMapping[question.answer] : question.answer;
            if (displayKey === correctDisplayKey) {
                btn.classList.add('correct');
            } else if (result.selectedDisplayChoice === displayKey && !result.quizCorrect) {
                btn.classList.add('incorrect');
            }
        } else {
            btn.disabled = false;
        }
    });

    // 音声ボタンは最初は非表示(解答後に表示)
    const speakBtn = document.getElementById('speak-btn');
    if (speakBtn) {
        speakBtn.style.display = 'none';
    }

    // 解答済みとして表示する場合
    if (showAnswered && wasAnswered) {
        AppState.quiz.answered = true;
        AppState.quiz.selectedChoice = result.selectedChoice;
        AppState.integrated.phaseCompleted = true;

        // 解説を表示（シャッフル時はキーを置換）
        const explanationContainer = document.getElementById('explanation-container');
        explanationContainer.style.display = 'block';
        document.getElementById('result-text').textContent = result.quizCorrect ? I18n.t('quiz.result.correct') : I18n.t('quiz.result.incorrect');
        document.getElementById('result-text').className = result.quizCorrect ? 'result-text correct' : 'result-text incorrect';

        let explanationText = question.explanation_md || I18n.t('quiz.noExplanation');
        if (mapping) {
            explanationText = replaceChoiceKeysInExplanation(explanationText, mapping.reverseMapping);
        }
        QuizUI.renderContent(explanationText, document.getElementById('explanation-body'));

        // 次へボタンを表示
        const nextBtn = document.getElementById('next-question-btn');
        nextBtn.textContent = '次へ (N)';
        nextBtn.style.display = 'inline-block';
    } else {
        AppState.quiz.answered = false;
        AppState.quiz.selectedChoice = null;
        AppState.integrated.phaseCompleted = false;
    }

}

/**
 * 統合モード: タイピングフェーズを表示
 * @param {Object} question - 問題データ
 * @param {boolean} showAnswered - 解答済み状態で表示するか
 */
async function showIntegratedTypingPhase(question, showAnswered = false) {
    // 画面スクロールを有効に戻す
    document.querySelector('.app-main')?.classList.remove('no-scroll');

    // ★ 追加: quiz-actionsを表示する
    const quizActions = document.querySelector('.quiz-actions');
    if (quizActions) {
        quizActions.style.display = 'flex';
    }

    // 問題情報を表示（タイトルの代わりにタグ・セット情報）
    const typingLabel = await getQuizDisplayLabel(question);
    document.getElementById('question-title').textContent = typingLabel;
    QuizUI.renderContent(question.body_md, document.getElementById('question-body'));

    // 画像
    const imagesContainer = document.getElementById('question-images');
    imagesContainer.innerHTML = '';
    if (question.asset_ids && question.asset_ids.length > 0) {
        for (const assetId of question.asset_ids) {
            const img = await QuizUI.createImageElement(assetId);
            if (img) imagesContainer.appendChild(img);
        }
    }

    // タイピングコンテナを表示
    const typingContainer = document.getElementById('typing-container');
    typingContainer.style.display = 'block';

    // 解答結果を取得
    const result = AppState.integrated.questionResults.get(question.id);
    const wasAnswered = result?.typingCorrect !== null && result?.typingCorrect !== undefined;

    // 語学学習モードかどうか判定
    const isSelectiveMode = question.isLanguageLearning === true && question.typingAnswer;

    // 入力欄の取得・参照用
    const typingInput = document.getElementById('typing-input');
    const typingInputArea = document.querySelector('.typing-input-area');
    const selectiveContainer = typingContainer.querySelector('.selective-typing-container');

    // 語学学習モード用のトークンを保存
    let tokens = null;
    if (isSelectiveMode) {
        tokens = QuizTyping.tokenizeAnswer(question.typingAnswer);
        AppState.integrated.currentTokens = tokens;
    }

    if (isSelectiveMode) {
        // 語学学習モード: 既存の通常入力を非表示、selective UIを生成
        if (typingInput) typingInput.style.display = 'none';

        // 既存のselective-typing-containerを削除
        if (selectiveContainer) {
            selectiveContainer.remove();
        }

        // 新しいselective typing UIを生成
        const selectiveUI = QuizTyping.createSelectiveTypingUI(tokens);
        typingInputArea.appendChild(selectiveUI);

        // 解答済みとして表示する場合
        if (showAnswered && wasAnswered) {
            // 保存された回答を各フィールドに設定
            if (result.tokenAnswers) {
                const inputs = selectiveUI.querySelectorAll('.selective-typing-input');
                result.tokenAnswers.forEach((value, index) => {
                    if (inputs[index]) {
                        inputs[index].value = value;
                    }
                });
            }
            // 正誤表示
            QuizTyping.showSelectiveTypingResults(selectiveUI, tokens);
            document.getElementById('submit-answer-btn').disabled = true;

            showTypingResultUI(result, question, true);
            AppState.quiz.answered = true;
            AppState.integrated.phaseCompleted = true;
        } else {
            // 通常の初期表示
            document.getElementById('submit-answer-btn').disabled = false;
            document.getElementById('typing-result').style.display = 'none';

            // 最初の入力フィールドにフォーカス
            const firstInput = selectiveUI.querySelector('.selective-typing-input');
            if (firstInput) {
                firstInput.focus();
            }

            AppState.quiz.answered = false;
            AppState.integrated.phaseCompleted = false;
        }
    } else {
        // 通常モード: 既存のselective UIを削除、通常入力を表示
        if (selectiveContainer) {
            selectiveContainer.remove();
        }
        if (typingInput) typingInput.style.display = 'block';

        // 解答済みとして表示する場合
        if (showAnswered && wasAnswered) {
            if (typingInput) {
                typingInput.value = result.userAnswer || '';
                typingInput.disabled = true;
            }
            document.getElementById('submit-answer-btn').disabled = true;

            showTypingResultUI(result, question, false);
            AppState.quiz.answered = true;
            AppState.integrated.phaseCompleted = true;
        } else {
            // 通常の初期表示
            if (typingInput) {
                typingInput.value = '';
                typingInput.disabled = false;
                typingInput.focus();
            }
            document.getElementById('submit-answer-btn').disabled = false;
            document.getElementById('typing-result').style.display = 'none';

            AppState.quiz.answered = false;
            AppState.integrated.phaseCompleted = false;
        }
    }

    // 音声ボタンは最初は非表示（解答後に表示）
    const speakBtn = document.getElementById('speak-btn');
    if (speakBtn) {
        speakBtn.style.display = 'none';
        AppState.integrated.currentTypingQuestion = question;
    }
}

/**
 * タイピング結果UIを表示（共通処理）
 */
function showTypingResultUI(result, question, isSelectiveMode) {
    const typingResult = document.getElementById('typing-result');
    const resultText = document.getElementById('typing-result-text');
    const userAnswerEl = document.getElementById('user-answer');
    const correctAnswerEl = document.getElementById('correct-answer');

    if (typingResult) typingResult.style.display = 'block';
    if (resultText) {
        resultText.textContent = result.typingCorrect ? I18n.t('quiz.result.correctTyping') : I18n.t('quiz.result.incorrectTyping');
        resultText.className = result.typingCorrect ? 'result-text correct' : 'result-text incorrect';
    }
    if (userAnswerEl) userAnswerEl.textContent = result.userAnswer || '';
    if (correctAnswerEl) correctAnswerEl.textContent = question.typingAnswer;

    // 解説を表示
    const explanationContainer = document.getElementById('explanation-container');
    if (explanationContainer) {
        explanationContainer.style.display = 'block';
        document.getElementById('result-text').style.display = 'none';
    }
    QuizUI.renderContent(question.explanation_md || I18n.t('quiz.noExplanation'), document.getElementById('explanation-body'));

    // 次へボタンを表示
    const nextBtn = document.getElementById('next-question-btn');
    nextBtn.textContent = '次へ (N)';
    nextBtn.style.display = 'inline-block';
}

/**
 * 統合モード: フラッシュカードを裏返す
 */
function flipIntegratedCard(event) {
    // スクロール中や.flashcard-content内のクリックは無視
    if (event && event.target.closest('.flashcard-content')) {
        return;
    }
    
    const flashcard = document.getElementById('integrated-flashcard');
    const question = AppState.integrated.currentLearnQuestion;

    if (!AppState.integrated.isFlipped) {
        flashcard.classList.add('flipped');
        AppState.integrated.isFlipped = true;
        AppState.integrated.phaseCompleted = true;

        // 学習フェーズで閲覧済みとして記録（前へ/次へナビゲーション用）
        if (question) {
            let result = AppState.integrated.questionResults.get(question.id);
            if (!result) {
                result = { quizCorrect: null, typingCorrect: null, selectedChoice: null };
                AppState.integrated.questionResults.set(question.id, result);
            }
            result.learnSeen = true;
        }

        // ★ 裏返した時に裏面のスクロール位置をリセット
        requestAnimationFrame(() => {
            const backContent = flashcard.querySelector('.flashcard-back .flashcard-content');
            if (backContent) {
                backContent.scrollTop = 0;
                console.log('裏面表示時のスクロール位置をリセット:', backContent.scrollTop);
            }
        });

        // 裏返した時に音声ボタンを表示してイベント設定
        const speakBtn = document.getElementById('integrated-speak-btn');
        if (speakBtn && question && question.isLanguageLearning && question.audioEnabled) {
            speakBtn.style.display = 'inline-block';
            speakBtn.onclick = (event) => {
                event.stopPropagation();
                const textToSpeak = question.typingAnswer || question.body_md || '';
                speakText(textToSpeak, question.audioLang || 'en-US');
            };
        }

        // 次のステップボタンを表示
        document.getElementById('integrated-next-phase-btn').style.display = 'inline-block';
    } else {
        flashcard.classList.remove('flipped');
        AppState.integrated.isFlipped = false;

        // ★ 表に戻した時に表面のスクロール位置をリセット
        requestAnimationFrame(() => {
            const frontContent = flashcard.querySelector('.flashcard-front .flashcard-content');
            if (frontContent) {
                frontContent.scrollTop = 0;
                console.log('表面表示時のスクロール位置をリセット:', frontContent.scrollTop);
            }
        });

        // 表に戻した時は音声ボタンを非表示
        const speakBtn = document.getElementById('integrated-speak-btn');
        if (speakBtn) {
            speakBtn.style.display = 'none';
        }
    }
}

/**
 * 統合モード: 4択フェーズで選択肢を選んだ時の処理
 */
async function handleIntegratedQuizAnswer(choice) {
    if (AppState.quiz.answered) return;

    AppState.quiz.answered = true;
    AppState.quiz.selectedChoice = choice;
    AppState.integrated.phaseCompleted = true;

    const question = AppState.integrated.phaseQuestions[AppState.integrated.currentQuestionIndex];
    const mapping = AppState.quiz.currentChoiceMapping;

    // シャッフル時は表示キーから元のキーに変換して正解判定
    const displayChoice = choice; // ユーザーが選んだ表示上のキー
    const originalChoice = mapping ? mapping.displayMapping[displayChoice] : displayChoice;
    const isCorrect = originalChoice === question.answer;

    // 結果を記録
    let result = AppState.integrated.questionResults.get(question.id);
    if (!result) {
        result = { quizCorrect: null, typingCorrect: null, selectedChoice: null };
        AppState.integrated.questionResults.set(question.id, result);
    }
    result.quizCorrect = isCorrect;
    result.selectedChoice = originalChoice; // 元のキーを記録
    result.selectedDisplayChoice = displayChoice; // 表示上のキーも記録
    result.choiceMapping = mapping; // マッピング情報を保存（前へ戻った時用）

    console.log(`📝 4択結果: ${isCorrect ? '✅正解' : '❌不正解'}${mapping ? ' (シャッフル)' : ''}`);

    // 解答を記録（統計には影響しない）
    await QuizDB.addAttempt(question.id, originalChoice, isCorrect);

    // ボタンの表示更新
    document.querySelectorAll('.choice-btn').forEach(btn => {
        const btnDisplayChoice = btn.dataset.choice;
        btn.disabled = true;

        // 正解の表示位置を計算
        const correctDisplayKey = mapping ? mapping.reverseMapping[question.answer] : question.answer;

        if (btnDisplayChoice === correctDisplayKey) {
            btn.classList.add('correct');
        } else if (btnDisplayChoice === displayChoice && !isCorrect) {
            btn.classList.add('incorrect');
        }
    });

    // 音声ボタンを解答後に表示してイベント設定(語学学習問題の場合)
    const speakBtn = document.getElementById('speak-btn');
    if (speakBtn && question.isLanguageLearning && question.audioEnabled) {
        speakBtn.style.display = 'inline-block';
        speakBtn.onclick = () => {
            const correctChoice = question.answer;
            const textToSpeak = question.typingAnswer || question.choices[correctChoice] || question.body_md || '';
            speakText(textToSpeak, question.audioLang || 'en-US');
        };
    }

    // 解説を表示（シャッフル時はキーを置換）
    const explanationContainer = document.getElementById('explanation-container');
    explanationContainer.style.display = 'block';
    document.getElementById('result-text').textContent = isCorrect ? I18n.t('quiz.result.correct') : I18n.t('quiz.result.incorrect');
    document.getElementById('result-text').className = isCorrect ? 'result-text correct' : 'result-text incorrect';

    let explanationText = question.explanation_md || I18n.t('quiz.noExplanation');
    if (mapping) {
        explanationText = replaceChoiceKeysInExplanation(explanationText, mapping.reverseMapping);
    }
    QuizUI.renderContent(explanationText, document.getElementById('explanation-body'));

    // 次へボタンを表示（イベントリスナーはapp.jsで設定済み）
    const nextBtn = document.getElementById('next-question-btn');
    if (nextBtn) {
        nextBtn.textContent = '次へ (N)';
        nextBtn.style.display = 'inline-block';
    }
}

/**
 * 統合モード: タイピングフェーズで解答した時の処理
 */
async function handleIntegratedTypingAnswer() {
    if (AppState.quiz.answered) return;

    const question = AppState.integrated.phaseQuestions[AppState.integrated.currentQuestionIndex];
    const isSelectiveMode = question.isLanguageLearning === true && question.typingAnswer;
    const typingContainer = document.getElementById('typing-container');

    let userAnswer = '';
    let tokenAnswers = null;

    if (isSelectiveMode) {
        // 語学学習モード: selective typing UIから回答を収集
        const selectiveContainer = typingContainer.querySelector('.selective-typing-container');
        const tokens = AppState.integrated.currentTokens;

        if (selectiveContainer && tokens) {
            userAnswer = QuizTyping.collectSelectiveTypingAnswer(selectiveContainer, tokens);

            // 各フィールドの回答を保存（前へ戻った時用）
            const inputs = selectiveContainer.querySelectorAll('.selective-typing-input');
            tokenAnswers = Array.from(inputs).map(input => input.value);
        }

        // 入力チェック（単語部分が未入力かどうか）
        const hasEmptyInput = tokenAnswers && tokenAnswers.some(v => !v.trim());
        if (hasEmptyInput) {
            QuizUI.showToast('すべての単語を入力してください', 'warning');
            return;
        }
    } else {
        // 通常モード
        const input = document.getElementById('typing-input');
        userAnswer = input?.value.trim() || '';

        if (!userAnswer) {
            QuizUI.showToast('答えを入力してください', 'warning');
            return;
        }
    }

    AppState.quiz.answered = true;
    AppState.integrated.phaseCompleted = true;

    // 判定（語学学習モードは専用の判定関数を使用）
    let isCorrect;
    if (isSelectiveMode) {
        isCorrect = QuizTyping.validateLanguageLearningAnswer(userAnswer, question);
    } else {
        isCorrect = QuizTyping.validateTypingAnswer(userAnswer, question);
    }

    // 結果を記録
    let result = AppState.integrated.questionResults.get(question.id);
    if (!result) {
        result = { quizCorrect: null, typingCorrect: null, selectedChoice: null, userAnswer: null };
        AppState.integrated.questionResults.set(question.id, result);
    }
    result.typingCorrect = isCorrect;
    result.userAnswer = userAnswer;
    if (tokenAnswers) {
        result.tokenAnswers = tokenAnswers;
    }

    console.log(`⌨️ タイピング結果: ${isCorrect ? '✅正解' : '❌不正解'}${isSelectiveMode ? ' (語学学習モード)' : ''}`);

    // 解答を記録（統計には影響しない）
    await QuizDB.addAttempt(question.id, userAnswer, isCorrect);

    // 語学学習モードの場合、各フィールドの正誤を表示
    if (isSelectiveMode) {
        const selectiveContainer = typingContainer.querySelector('.selective-typing-container');
        const tokens = AppState.integrated.currentTokens;
        if (selectiveContainer && tokens) {
            QuizTyping.showSelectiveTypingResults(selectiveContainer, tokens);
        }
    } else {
        const input = document.getElementById('typing-input');
        if (input) input.disabled = true;
    }

    // 結果を表示
    const typingResult = document.getElementById('typing-result');
    const resultText = document.getElementById('typing-result-text');
    const userAnswerEl = document.getElementById('user-answer');
    const correctAnswerEl = document.getElementById('correct-answer');

    if (typingResult) typingResult.style.display = 'block';
    if (resultText) {
        resultText.textContent = isCorrect ? I18n.t('quiz.result.correctTyping') : I18n.t('quiz.result.incorrectTyping');
        resultText.className = isCorrect ? 'result-text correct' : 'result-text incorrect';
    }
    if (userAnswerEl) userAnswerEl.textContent = userAnswer;
    if (correctAnswerEl) correctAnswerEl.textContent = question.typingAnswer;

    document.getElementById('submit-answer-btn').disabled = true;

    // 音声ボタンを解答後に表示してイベント設定
    const speakBtn = document.getElementById('speak-btn');
    if (speakBtn && question.isLanguageLearning && question.audioEnabled) {
        speakBtn.style.display = 'inline-block';
        speakBtn.onclick = () => {
            const textToSpeak = question.typingAnswer || question.body_md || '';
            speakText(textToSpeak, question.audioLang || 'en-US');
        };
    }

    // 解説を表示
    const explanationContainer = document.getElementById('explanation-container');
    if (explanationContainer) {
        explanationContainer.style.display = 'block';
        document.getElementById('result-text').style.display = 'none';
    }
    QuizUI.renderContent(question.explanation_md || I18n.t('quiz.noExplanation'), document.getElementById('explanation-body'));

    // 次へボタンを表示（イベントリスナーはapp.jsで設定済み）
    const nextBtn = document.getElementById('next-question-btn');
    if (nextBtn) {
        nextBtn.textContent = '次へ (N)';
        nextBtn.style.display = 'inline-block';
    }
}

/**
 * テキストを音声で読み上げる（共通関数）
 */
function speakText(text, lang = 'en-US') {
    if (!('speechSynthesis' in window)) {
        console.warn('音声合成に対応していません');
        QuizUI.showToast('お使いのブラウザは音声合成に対応していません', 'warning');
        return;
    }

    window.speechSynthesis.cancel();

    const cleanText = text.replace(/[#*`$\\[\]_]/g, '').trim();

    if (!cleanText) {
        console.warn('読み上げるテキストがありません');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.volume = 1.0;

    utterance.onerror = (event) => {
        console.error('音声合成エラー:', event);
    };

    window.speechSynthesis.speak(utterance);
}

/**
 * セッション中の進捗を保存（途中退出対策）
 * visibilitychange/pagehide/ナビ移動時に呼ばれる
 */
async function saveSessionProgress() {
    if (AppState.quiz.format !== 'integrated') return;
    if (!AppState.integrated.allQuestions?.length) return;
    if (AppState.integrated.progressSaved) return;

    console.log('💾 セッション途中の進捗を保存中...');

    for (const question of AppState.integrated.allQuestions) {
        // 既にこのセッションで統計更新済みならスキップ
        if (AppState.quiz.seenQuestions.has(question.id)) continue;

        const result = AppState.integrated.questionResults.get(question.id);
        if (!result) continue; // 未回答の問題はスキップ

        const hasTyping = (question.type === 'typing' || question.type === 'both') && question.typingAnswer;
        const isPassed = hasTyping
            ? (result.quizCorrect === true && result.typingCorrect === true)
            : (result.quizCorrect === true);

        if (isPassed) {
            const wasRetried = AppState.integrated.retriedQuestions.has(question.id);
            await QuizDB.updateStats(question.id, !wasRetried);
        } else {
            await QuizDB.updateStats(question.id, false);
        }
        AppState.quiz.seenQuestions.add(question.id);
    }

    AppState.integrated.progressSaved = true;
    console.log('💾 進捗保存完了');
}

// グローバルにエクスポート
window.QuizIntegrated = {
    startIntegratedMode,
    startPhase,
    showCurrentQuestionInPhase,
    moveToNextPhase,
    moveToNextQuestionInPhase,
    moveToPrevQuestionInPhase,
    showIntegratedResult,
    showIntegratedLearnPhase,
    showIntegratedQuizPhase,
    showIntegratedTypingPhase,
    flipIntegratedCard,
    nextIntegratedLearnPhase: moveToNextQuestionInPhase,
    handleIntegratedQuizAnswer,
    handleIntegratedTypingAnswer,
    saveSessionProgress,
    speakText,
    scrollToTop
};