/**
 * quiz.js - クイズ画面コア機能
 * クイズ開始画面の表示とダッシュボード更新を担当
 * 実際のクイズは統合モード（study.js）で処理
 */

// ==================== クイズ画面 ====================

/**
 * クイズ開始画面を表示
 */
async function showQuizStart() {
    document.getElementById('quiz-start').style.display = 'block';
    document.getElementById('quiz-content').style.display = 'none';
    document.getElementById('quiz-result').style.display = 'none';

    // タグ選択肢を更新(チェックボックス形式)
    await renderTagCheckboxes('quiz-tag-checkboxes', AppState.quiz.selectedTags);

    // セット選択肢を更新し、表示/非表示を制御
    await updateSetSelectContainer();

    // ダッシュボードを更新
    await updateStudyDashboard();
}

/**
 * セット選択コンテナの表示/非表示を制御
 */
async function updateSetSelectContainer() {
    const container = document.getElementById('quiz-set-select-container');
    if (!container) return;

    // 全セットを取得
    const sets = await QuizDB.getAllQuestionSets();

    // 問題が1つ以上あるセットのみフィルタ
    const setsWithQuestions = sets.filter(set => set.questionIds && set.questionIds.length > 0);

    // 問題があるセットが無ければコンテナを非表示
    if (setsWithQuestions.length === 0) {
        container.style.display = 'none';
        return;
    }

    // 問題があるセットがあれば表示
    container.style.display = 'block';

    // セットチェックボックスをレンダリング（問題があるセットのみ）
    await renderSetCheckboxesFiltered('quiz-set-checkboxes', setsWithQuestions, AppState.quiz.selectedSets || []);
}

/**
 * 問題があるセットのみチェックボックスをレンダリング
 */
async function renderSetCheckboxesFiltered(containerId, sets, selectedSets = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = sets.map(set => {
        const isChecked = selectedSets.includes(set.id);
        const checkboxId = `${containerId}-${set.id}`;
        const questionCount = set.questionIds?.length || 0;
        return `
            <div class="set-checkbox-item">
                <input type="checkbox"
                       id="${checkboxId}"
                       value="${set.id}"
                       ${isChecked ? 'checked' : ''}>
                <label for="${checkboxId}">${QuizUI.escapeHtml(set.name)}</label>
                <span class="set-checkbox-count">(${questionCount}問)</span>
            </div>
        `;
    }).join('');

    // チェックボックスの変更イベント
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            QuizSets.updateSelectedSets(containerId);
        });
    });
}

/**
 * 学習ダッシュボードを更新
 */
async function updateStudyDashboard() {
    try {
        // 今日の学習計画を取得
        const studyPlan = await SM2.getTodayStudyPlan();

        // 未学習の問題数を取得
        const allQuestions = await QuizDB.getAllQuestions();
        const allStats = await QuizDB.getAllStats();
        const statsMap = new Map(allStats.map(s => [s.question_id, s]));
        const unstudiedCount = allQuestions.filter(q => !statsMap.has(q.id)).length;

        // 今日学習できる数を表示
        document.getElementById('today-review-count').textContent = studyPlan.review.length;
        document.getElementById('today-unstudied-count').textContent = unstudiedCount;

        // 復習スケジュール統計を取得
        const scheduleStats = await SM2.getReviewScheduleStats();

        document.getElementById('today-due-count').textContent = scheduleStats.today + '問';
        document.getElementById('tomorrow-due-count').textContent = scheduleStats.tomorrow + '問';
        document.getElementById('within-3days-count').textContent = scheduleStats.within3Days + '問';
        document.getElementById('within-week-count').textContent = scheduleStats.withinWeek + '問';
        document.getElementById('mastered-count').textContent = scheduleStats.mastered + '問';
        document.getElementById('completed-count').textContent = scheduleStats.completed + '問';
        document.getElementById('new-count').textContent = scheduleStats.new + '問';

    } catch (error) {
        console.error('ダッシュボード更新エラー:', error);
    }
}

/**
 * 問題を習得済みにする(クイズ画面から)
 */
async function markCurrentAsCompleted() {
    try {
        const question = AppState.quiz.questions[AppState.quiz.currentIndex];
        if (!question) return;

        await QuizDB.markAsCompleted(question.id);
        QuizUI.showToast('習得済みにしました', 'success');
    } catch (error) {
        console.error('習得済み設定エラー:', error);
        QuizUI.showToast('エラーが発生しました', 'error');
    }
}

/**
 * タグチェックボックスをレンダリング
 * @param {string} containerId - チェックボックスを表示するコンテナID
 * @param {Array} selectedTags - 選択済みタグの配列
 */
async function renderTagCheckboxes(containerId, selectedTags = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tags = await QuizDB.getAllTags();

    if (tags.length === 0) {
        container.innerHTML = '<div class="tag-checkboxes-empty">タグがありません</div>';
        return;
    }

    container.innerHTML = tags.map(tag => {
        const isChecked = selectedTags.includes(tag);
        const checkboxId = `${containerId}-${tag.replace(/\s+/g, '-')}`;
        return `
            <div class="tag-checkbox-item">
                <input type="checkbox"
                       id="${checkboxId}"
                       value="${QuizUI.escapeHtml(tag)}"
                       ${isChecked ? 'checked' : ''}>
                <label for="${checkboxId}">${QuizUI.escapeHtml(tag)}</label>
            </div>
        `;
    }).join('');

    // チェックボックスの変更イベント
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            updateSelectedTags(containerId);
        });
    });
}

/**
 * 選択されたタグを更新
 * @param {string} containerId - チェックボックスコンテナID
 */
function updateSelectedTags(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const selectedTags = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);

    // 状態を更新
    if (containerId === 'quiz-tag-checkboxes') {
        AppState.quiz.selectedTags = selectedTags;
    } else if (containerId === 'review-tag-checkboxes') {
        AppState.review.selectedTags = selectedTags;
    }
}

/**
 * クイズを開始
 */
async function startQuiz() {
    try {
        const mode = document.getElementById('quiz-mode')?.value || 'random';
        AppState.quiz.mode = mode;

        // 常に統合モードを呼び出す
        await QuizIntegrated.startIntegratedMode();

    } catch (error) {
        console.error('クイズ開始エラー:', error);
        QuizUI.showToast('クイズの開始に失敗しました', 'error');
    }
}

/**
 * クイズを終了
 */
function endQuiz() {
    // 画面スクロールを有効に戻す
    document.querySelector('.app-main')?.classList.remove('no-scroll');
    showQuizStart();
}

// グローバルにエクスポート
window.QuizCore = {
    showQuizStart,
    updateStudyDashboard,
    markCurrentAsCompleted,
    renderTagCheckboxes,
    updateSelectedTags,
    startQuiz,
    endQuiz
};

// HTMLから直接呼ばれる関数をwindowに登録
window.markCurrentAsCompleted = markCurrentAsCompleted;
window.updateStudyDashboard = updateStudyDashboard;