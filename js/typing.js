/**
 * typing.js - タイピングモード機能
 * タイピング解答の検証、送信、音声読み上げを担当
 */

// ==================== タイピングモード関連 ====================

/**
 * タイピング回答を判定
 * @param {string} userInput - ユーザーの入力
 * @param {Object} question - 問題オブジェクト
 * @returns {boolean} 正解かどうか
 */
function validateTypingAnswer(userInput, question) {
    if (!question.typingAnswer) return false;

    let input = userInput.trim();

    // 許容する答えリスト
    let answers = [question.typingAnswer];
    if (question.acceptableAnswers && question.acceptableAnswers.length > 0) {
        answers = [...answers, ...question.acceptableAnswers];
    }

    // 大文字小文字を区別しない場合
    if (!question.caseSensitive) {
        input = input.toLowerCase();
        answers = answers.map(a => a.toLowerCase());
    }

    // 完全一致判定
    return answers.includes(input);
}

/**
 * タイピング回答を送信(通常モード用)
 */
async function submitTypingAnswer() {
    if (AppState.quiz.answered) return;

    // 統合モードの場合は専用の処理
    if (AppState.quiz.format === 'integrated') {
        await QuizIntegrated.handleIntegratedTypingAnswer();
        return;
    }

    const input = document.getElementById('typing-input');
    const userAnswer = input?.value.trim();

    if (!userAnswer) {
        QuizUI.showToast('答えを入力してください', 'warning');
        return;
    }

    AppState.quiz.answered = true;

    const question = AppState.quiz.questions[AppState.quiz.currentIndex];
    const isCorrect = validateTypingAnswer(userAnswer, question);

    // 再出題かどうかを確認
    const isRetry = AppState.quiz.retryQuestions.has(question.id);

    // 解答を記録
    await QuizDB.addAttempt(question.id, userAnswer, isCorrect);

    // 再出題でない場合のみ統計を更新
    if (!isRetry) {
        await QuizDB.updateStats(question.id, isCorrect);
        AppState.quiz.seenQuestions.add(question.id);
    }

    // 間違えた場合はキューに追加
    if (!isCorrect) {
        AppState.quiz.wrongQueue.push({
            question: question,
            originalIndex: AppState.quiz.currentIndex
        });
    }

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

    // 入力を無効化
    if (input) input.disabled = true;
    document.getElementById('submit-answer-btn').disabled = true;

    // 🔊 音声ボタンを解答後に表示してイベント設定
    const speakBtn = document.getElementById('speak-btn');
    if (speakBtn && question.isLanguageLearning && question.audioEnabled) {
        speakBtn.style.display = 'inline-block';
        // ★ クリックイベントを設定
        speakBtn.onclick = () => speakCurrentQuestion();
    }

    // 解説を表示
    const explanationContainer = document.getElementById('explanation-container');
    const explanationBody = document.getElementById('explanation-body');
    if (explanationContainer) {
        explanationContainer.style.display = 'block';
        document.getElementById('result-text').style.display = 'none'; // 重複を避ける
    }
    if (explanationBody) {
        QuizUI.renderContent(question.explanation_md || '解説はありません', explanationBody);
    }

    // ボタン表示切替
    document.getElementById('next-question-btn').style.display = 'inline-block';
    document.getElementById('skip-question-btn').style.display = 'none';
}

/**
 * 音声読み上げ
 */
function speakCurrentQuestion() {
    const question = AppState.quiz.questions[AppState.quiz.currentIndex];
    if (!question || !question.isLanguageLearning || !question.audioEnabled) return;

    if (!('speechSynthesis' in window)) {
        QuizUI.showToast('音声合成に対応していません', 'warning');
        return;
    }

    // Markdown記号を除去
    const text = (question.typingAnswer || '').replace(/[#*`_\[\]]/g, '');
    const lang = question.audioLang || 'en-US';

    // 進行中の音声を停止
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.volume = 1.0;

    utterance.onerror = (event) => {
        console.error('音声合成エラー:', event);
    };

    window.speechSynthesis.speak(utterance);
}

/**
 * タイピング対応の問題を取得
 * @param {Array} questions - 問題の配列
 * @returns {Array} タイピング対応問題の配列
 */
function getTypingQuestions(questions) {
    return questions.filter(q =>
        q.type === 'typing' || q.type === 'both'
    );
}

// グローバルにエクスポート
window.QuizTyping = {
    validateTypingAnswer,
    submitTypingAnswer,
    speakCurrentQuestion,
    getTypingQuestions
};