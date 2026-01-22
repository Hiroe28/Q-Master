/**
 * study.js - 統合モード機能（完全版）
 * 学習→4択→タイピングの統合学習フローを担当
 * 4択とタイピング両方正解した時のみSM-2更新
 */

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

            // 1日の問題数に応じて新規問題の上限を設定（約半分を新規に割り当て）
            const newQuestionsLimit = Math.ceil(selectedCount / 2);
            const studyPlan = await SM2.getTodayStudyPlan(baseQuestions, selectedCount, newQuestionsLimit);

            const newQuestions = [];
            for (const id of studyPlan.new) {
                const q = baseQuestions.find(bq => bq.id === id);
                if (q) newQuestions.push(q);
            }

            const reviewQuestions = [];
            for (const id of studyPlan.review) {
                const q = baseQuestions.find(bq => bq.id === id);
                if (q) reviewQuestions.push(q);
            }

            const shuffledReview = QuizUI.shuffleArray(reviewQuestions);
            const allQuestions = [...newQuestions, ...shuffledReview];
            questions = allQuestions.slice(0, selectedCount);

        } else if (mode === 'unanswered') {
            const allStats = await QuizDB.getAllStats();
            const answeredIds = new Set(allStats.map(s => s.question_id));
            questions = baseQuestions.filter(q => !answeredIds.has(q.id));
        } else if (mode === 'tag') {
            QuizCore.updateSelectedTags('quiz-tag-checkboxes');
            const selectedTags = AppState.quiz.selectedTags;

            if (selectedTags.length === 0) {
                QuizUI.showToast('タグを選択してください', 'warning');
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
                QuizUI.showToast('未解答の問題がありません。すべての問題を解答済みです!', 'info');
            } else {
                QuizUI.showToast('出題できる問題がありません', 'warning');
            }
            return;
        }

        if (mode !== 'today') {
            questions = QuizUI.shuffleArray(questions);
        }

        AppState.integrated.allQuestions = questions;
        AppState.quiz.format = 'integrated';
        AppState.quiz.seenQuestions = new Set();

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
            'learn': '📚 新規学習',
            'quiz': '📝 4択テスト',
            'typing': '⌨️ タイピング'
        };
        const phaseClasses = {
            'learn': 'phase-learn',
            'quiz': 'phase-quiz',
            'typing': 'phase-typing'
        };
        phaseLabelEl.textContent = phaseLabels[phaseName] || phaseName;
        phaseLabelEl.className = 'quiz-phase-label ' + (phaseClasses[phaseName] || '');
    }

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
        showIntegratedLearnPhase(question, showAnswered);
    } else if (phaseName === 'quiz') {
        if (questionContainer) questionContainer.style.display = 'block';
        showIntegratedQuizPhase(question, showAnswered);
    } else if (phaseName === 'typing') {
        if (questionContainer) questionContainer.style.display = 'block';
        showIntegratedTypingPhase(question, showAnswered);
    }

    // アクションボタンの表示
    document.getElementById('skip-question-btn').style.display = 'none';
    document.getElementById('next-question-btn').style.display = 'none';
    document.getElementById('mark-completed-btn').style.display = 'none';
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
                await QuizDB.updateStats(question.id, true);
                AppState.quiz.seenQuestions.add(question.id);
                console.log(`✅ 合格&統計更新: ${question.title || question.id.substring(0, 8)}`);
            }
        }
    }

    if (failedQuestions.length > 0) {
        console.log(`🔄 ${failedQuestions.length}問を4択からやり直します`);

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

    await showCurrentQuestionInPhase();
}

/**
 * 画面を一番上にスクロールする
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
 * 統合モード結果を表示
 */
async function showIntegratedResult() {
    // 画面スクロールを有効に戻す
    document.querySelector('.app-main')?.classList.remove('no-scroll');

    document.getElementById('quiz-content').style.display = 'none';
    document.getElementById('quiz-result').style.display = 'block';

    const total = AppState.quiz.seenQuestions.size;
    const allQuestions = AppState.integrated.allQuestions;
    const questionResults = AppState.integrated.questionResults;

    document.getElementById('result-total').innerHTML = `全${total}問完了しました`;

    let detailHtml = '';
    // 各問題の詳細結果を生成
    // let detailHtml = `
    //     <div class="result-stats-detail">
    //         <p>✅ <strong>学習完了!</strong></p>
    //         <p>📚 学習 → 📝 4択 → ⌨️ タイピングの順で学習しました</p>
    //         <p>🎯 ${total}問の統計を更新しました</p>
    //     </div>
    //     <div class="result-questions-list">
    //         <h3>📊 各問題の結果</h3>
    // `;

    // 全問題（元データ）から結果を取得
    const originalQuestions = AppState.integrated.allQuestions.length > 0
        ? AppState.integrated.allQuestions
        : Array.from(AppState.quiz.seenQuestions).map(id => ({ id }));

    // seenQuestionsにある問題の統計を取得
    for (const questionId of AppState.quiz.seenQuestions) {
        try {
            const stats = await QuizDB.getStats(questionId);
            const question = await QuizDB.getQuestion(questionId);

            if (!question) continue;

            const title = question.title || question.id.substring(0, 8);
            const hasTyping = (question.type === 'typing' || question.type === 'both') && question.typingAnswer;

            // 次回復習日を計算
            let nextReviewText = '';
            if (stats && stats.next_review) {
                const nextReview = new Date(stats.next_review);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((nextReview - today) / (1000 * 60 * 60 * 24));

                if (diffDays <= 0) {
                    nextReviewText = '今日復習';
                } else if (diffDays === 1) {
                    nextReviewText = '明日復習';
                } else {
                    nextReviewText = `${diffDays}日後に復習`;
                }
            } else {
                nextReviewText = '初回学習完了';
            }

            // 習熟度インジケーター
            let masteryLevel = '';
            if (stats) {
                const interval = stats.interval || 0;
                if (interval >= 21) {
                    masteryLevel = '<span class="mastery-high">🌟 定着</span>';
                } else if (interval >= 7) {
                    masteryLevel = '<span class="mastery-mid">📈 成長中</span>';
                } else {
                    masteryLevel = '<span class="mastery-low">🌱 学習中</span>';
                }
            }

            detailHtml += `
                <div class="result-question-item">
                    <div class="result-question-title">${QuizUI.escapeHtml(title)}</div>
                    <div class="result-question-badges">
                        <span class="badge badge-success">✅ 合格</span>
                        ${hasTyping ? '<span class="badge badge-typing">⌨️</span>' : ''}
                        ${masteryLevel}
                    </div>
                    <div class="result-question-next">📅 ${nextReviewText}</div>
                </div>
            `;
        } catch (error) {
            console.error('結果表示エラー:', error);
        }
    }

    detailHtml += '</div>';
    document.getElementById('result-stats').innerHTML = detailHtml;
}


/**
 * 統合モード: 学習フェーズを表示
 * @param {Object} question - 問題データ
 * @param {boolean} showAnswered - 解答済み状態で表示するか
 */
async function showIntegratedLearnPhase(question, showAnswered = false) {
    const container = document.getElementById('integrated-learn-container');
    const flashcard = document.getElementById('integrated-flashcard');
    const flashcardInner = flashcard?.querySelector('.flashcard-inner');

    // 学習フェーズ中は画面スクロールを無効化
    document.querySelector('.app-main')?.classList.add('no-scroll');

    // ★ ステップ1: コンテナ全体を非表示にする
    container.style.display = 'none';
    
    // ★ ステップ2: 非表示の状態でトランジション無効化 + フリップ状態リセット
    if (flashcardInner) {
        flashcardInner.style.transition = 'none';
    }
    flashcard.classList.remove('flipped');
    AppState.integrated.isFlipped = false;
    AppState.integrated.phaseCompleted = false;
    
    // 強制リフロー
    if (flashcardInner) {
        flashcardInner.offsetHeight;
    }

    // 問題を表示
    document.getElementById('integrated-question-title').textContent = question.title || '問題';
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

    // 選択肢を表示（4択問題の場合）
    const choicesContainer = document.getElementById('integrated-choices');
    if (choicesContainer) {
        if (question.choices && (question.type !== 'typing')) {
            const choiceHtml = ['A', 'B', 'C', 'D'].map(choice => {
                const choiceText = question.choices[choice] || '';
                if (!choiceText) return '';
                return `
                    <div class="integrated-choice-item">
                        <span class="integrated-choice-label">${choice}</span>
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
        answerText = `${correctChoice}: ${question.choices[correctChoice] || ''}`;
    }
    QuizUI.renderContent(answerText, document.getElementById('integrated-answer'));

    // 解説を表示
    QuizUI.renderContent(question.explanation_md || '解説はありません', document.getElementById('integrated-explanation'));

    // 次のステップボタンを非表示(カードを裏返すまで)
    document.getElementById('integrated-next-phase-btn').style.display = 'none';

    // ★ ステップ3: トランジションを再有効化してからコンテナを表示
    setTimeout(() => {
        if (flashcardInner) {
            flashcardInner.style.transition = '';
        }
        container.style.display = 'block';

        // 解答済み状態で表示する場合（前へ戻った時）
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

    // 問題情報を表示
    document.getElementById('question-title').textContent = question.title || '問題';
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

    document.querySelectorAll('.choice-btn').forEach(btn => {
        btn.classList.remove('correct', 'incorrect', 'selected');
        const choice = btn.dataset.choice;
        QuizUI.renderContent(question.choices[choice] || '', btn.querySelector('.choice-text'));

        // 解答済みとして表示する場合
        if (showAnswered && wasAnswered) {
            btn.disabled = true;
            if (choice === question.answer) {
                btn.classList.add('correct');
            } else if (result.selectedChoice === choice && !result.quizCorrect) {
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

        // 解説を表示
        const explanationContainer = document.getElementById('explanation-container');
        explanationContainer.style.display = 'block';
        document.getElementById('result-text').textContent = result.quizCorrect ? '正解!' : '不正解...';
        document.getElementById('result-text').className = result.quizCorrect ? 'result-text correct' : 'result-text incorrect';
        QuizUI.renderContent(question.explanation_md || '解説はありません', document.getElementById('explanation-body'));

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

    // 問題情報を表示
    document.getElementById('question-title').textContent = question.title || '問題';
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

    // 入力欄
    const typingInput = document.getElementById('typing-input');

    // 解答済みとして表示する場合
    if (showAnswered && wasAnswered) {
        if (typingInput) {
            typingInput.value = result.userAnswer || '';
            typingInput.disabled = true;
        }
        document.getElementById('submit-answer-btn').disabled = true;

        // 結果を表示
        const typingResult = document.getElementById('typing-result');
        const resultText = document.getElementById('typing-result-text');
        const userAnswerEl = document.getElementById('user-answer');
        const correctAnswerEl = document.getElementById('correct-answer');

        if (typingResult) typingResult.style.display = 'block';
        if (resultText) {
            resultText.textContent = result.typingCorrect ? '正解!' : '不正解...';
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
        QuizUI.renderContent(question.explanation_md || '解説はありません', document.getElementById('explanation-body'));

        // 次へボタンを表示
        const nextBtn = document.getElementById('next-question-btn');
        nextBtn.textContent = '次へ (N)';
        nextBtn.style.display = 'inline-block';

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

    // 音声ボタンは最初は非表示（解答後に表示）
    const speakBtn = document.getElementById('speak-btn');
    if (speakBtn) {
        speakBtn.style.display = 'none';
        AppState.integrated.currentTypingQuestion = question;
    }

}

/**
 * 統合モード: フラッシュカードを裏返す
 */
function flipIntegratedCard() {
    const flashcard = document.getElementById('integrated-flashcard');
    const question = AppState.integrated.currentLearnQuestion;

    if (!AppState.integrated.isFlipped) {
        flashcard.classList.add('flipped');
        AppState.integrated.isFlipped = true;
        AppState.integrated.phaseCompleted = true;

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
    const isCorrect = choice === question.answer;

    // 結果を記録
    let result = AppState.integrated.questionResults.get(question.id);
    if (!result) {
        result = { quizCorrect: null, typingCorrect: null, selectedChoice: null };
        AppState.integrated.questionResults.set(question.id, result);
    }
    result.quizCorrect = isCorrect;
    result.selectedChoice = choice; // 選択した選択肢を記録

    console.log(`📝 4択結果: ${isCorrect ? '✅正解' : '❌不正解'}`);

    // 解答を記録（統計には影響しない）
    await QuizDB.addAttempt(question.id, choice, isCorrect);

    // ボタンの表示更新
    document.querySelectorAll('.choice-btn').forEach(btn => {
        const btnChoice = btn.dataset.choice;
        btn.disabled = true;

        if (btnChoice === question.answer) {
            btn.classList.add('correct');
        } else if (btnChoice === choice && !isCorrect) {
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

    // 解説を表示
    const explanationContainer = document.getElementById('explanation-container');
    explanationContainer.style.display = 'block';
    document.getElementById('result-text').textContent = isCorrect ? '正解!' : '不正解...';
    document.getElementById('result-text').className = isCorrect ? 'result-text correct' : 'result-text incorrect';
    QuizUI.renderContent(question.explanation_md || '解説はありません', document.getElementById('explanation-body'));

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

    const input = document.getElementById('typing-input');
    const userAnswer = input?.value.trim();

    if (!userAnswer) {
        QuizUI.showToast('答えを入力してください', 'warning');
        return;
    }

    AppState.quiz.answered = true;
    AppState.integrated.phaseCompleted = true;

    const question = AppState.integrated.phaseQuestions[AppState.integrated.currentQuestionIndex];
    const isCorrect = QuizTyping.validateTypingAnswer(userAnswer, question);

    // 結果を記録
    let result = AppState.integrated.questionResults.get(question.id);
    if (!result) {
        result = { quizCorrect: null, typingCorrect: null, selectedChoice: null, userAnswer: null };
        AppState.integrated.questionResults.set(question.id, result);
    }
    result.typingCorrect = isCorrect;
    result.userAnswer = userAnswer; // ユーザーの入力を記録

    console.log(`⌨️ タイピング結果: ${isCorrect ? '✅正解' : '❌不正解'}`);

    // 解答を記録（統計には影響しない）
    await QuizDB.addAttempt(question.id, userAnswer, isCorrect);

    // 結果を表示
    const typingResult = document.getElementById('typing-result');
    const resultText = document.getElementById('typing-result-text');
    const userAnswerEl = document.getElementById('user-answer');
    const correctAnswerEl = document.getElementById('correct-answer');

    if (typingResult) typingResult.style.display = 'block';
    if (resultText) {
        resultText.textContent = isCorrect ? '正解!' : '不正解...';
        resultText.className = isCorrect ? 'result-text correct' : 'result-text incorrect';
    }
    if (userAnswerEl) userAnswerEl.textContent = userAnswer;
    if (correctAnswerEl) correctAnswerEl.textContent = question.typingAnswer;

    if (input) input.disabled = true;
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
    QuizUI.renderContent(question.explanation_md || '解説はありません', document.getElementById('explanation-body'));

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
    speakText,
    scrollToTop
};