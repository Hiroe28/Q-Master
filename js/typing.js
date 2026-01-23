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

// ==================== 語学学習用タイピングモード ====================

/**
 * 句読点かどうかを判定
 * @param {string} char - 文字
 * @returns {boolean}
 */
function isPunctuation(char) {
    return /^[.,?!:;。、？！：；]$/.test(char);
}

/**
 * 正解文字列をトークンに分割
 * @param {string} answer - 正解文字列
 * @returns {Array} トークンの配列 [{type: 'word'|'punctuation'|'space', value: string}]
 */
function tokenizeAnswer(answer) {
    const tokens = [];
    let currentWord = '';

    for (let i = 0; i < answer.length; i++) {
        const char = answer[i];

        if (char === ' ') {
            // 現在の単語を確定
            if (currentWord) {
                tokens.push({ type: 'word', value: currentWord });
                currentWord = '';
            }
            tokens.push({ type: 'space', value: ' ' });
        } else if (isPunctuation(char)) {
            // 現在の単語を確定
            if (currentWord) {
                tokens.push({ type: 'word', value: currentWord });
                currentWord = '';
            }
            tokens.push({ type: 'punctuation', value: char });
        } else {
            // 単語の一部（アポストロフィー、ハイフン含む）
            currentWord += char;
        }
    }

    // 最後の単語を確定
    if (currentWord) {
        tokens.push({ type: 'word', value: currentWord });
    }

    return tokens;
}

/**
 * トークンからマスク表示を生成
 * @param {Array} tokens - トークンの配列
 * @returns {string} マスク文字列
 */
function generateMask(tokens) {
    return tokens.map(token => {
        if (token.type === 'word') {
            return '_'.repeat(token.value.length);
        } else {
            return token.value;
        }
    }).join('');
}

/**
 * 語学学習用タイピングUIを生成
 * @param {Array} tokens - トークンの配列
 * @returns {HTMLElement} 入力UI要素
 */
function createSelectiveTypingUI(tokens) {
    const container = document.createElement('div');
    container.className = 'selective-typing-container';

    let inputIndex = 0;

    tokens.forEach((token, tokenIndex) => {
        if (token.type === 'word') {
            const inputWrapper = document.createElement('span');
            inputWrapper.className = 'selective-typing-input-wrapper';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'selective-typing-input';
            input.dataset.index = inputIndex;
            input.dataset.tokenIndex = tokenIndex;
            input.dataset.expected = token.value;
            input.placeholder = '_'.repeat(token.value.length);
            input.style.width = `${Math.max(token.value.length * 0.8, 1.5)}em`;
            input.autocomplete = 'off';
            input.autocapitalize = 'off';
            input.spellcheck = false;

            // キーイベントハンドラ
            input.addEventListener('keydown', handleSelectiveTypingKeydown);
            input.addEventListener('input', handleSelectiveTypingInput);

            inputWrapper.appendChild(input);
            container.appendChild(inputWrapper);
            inputIndex++;
        } else if (token.type === 'punctuation') {
            const span = document.createElement('span');
            span.className = 'selective-typing-punctuation';
            span.textContent = token.value;
            container.appendChild(span);
        } else if (token.type === 'space') {
            const span = document.createElement('span');
            span.className = 'selective-typing-space';
            span.textContent = ' ';
            container.appendChild(span);
        }
    });

    return container;
}

/**
 * 語学学習用タイピングのキーダウンハンドラ
 */
function handleSelectiveTypingKeydown(e) {
    const input = e.target;
    const container = input.closest('.selective-typing-container');
    const inputs = container.querySelectorAll('.selective-typing-input');
    const currentIndex = parseInt(input.dataset.index);

    if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();

        if (e.shiftKey) {
            // 前のフィールドへ
            if (currentIndex > 0) {
                inputs[currentIndex - 1].focus();
            }
        } else {
            // 次のフィールドへ
            if (currentIndex < inputs.length - 1) {
                inputs[currentIndex + 1].focus();
            } else {
                // 最後のフィールドでEnterを押したら送信
                if (e.key === 'Enter') {
                    document.getElementById('submit-answer-btn')?.click();
                }
            }
        }
    } else if (e.key === 'ArrowRight' && input.selectionStart === input.value.length) {
        // カーソルが末尾で右矢印を押したら次のフィールドへ
        if (currentIndex < inputs.length - 1) {
            e.preventDefault();
            inputs[currentIndex + 1].focus();
            inputs[currentIndex + 1].setSelectionRange(0, 0);
        }
    } else if (e.key === 'ArrowLeft' && input.selectionStart === 0) {
        // カーソルが先頭で左矢印を押したら前のフィールドへ
        if (currentIndex > 0) {
            e.preventDefault();
            const prevInput = inputs[currentIndex - 1];
            prevInput.focus();
            prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
        }
    }
}

/**
 * 語学学習用タイピングの入力ハンドラ
 */
function handleSelectiveTypingInput(e) {
    const input = e.target;
    const expected = input.dataset.expected;
    const value = input.value;

    // 入力文字数が期待文字数に達したら次のフィールドへ自動移動
    if (value.length >= expected.length) {
        const container = input.closest('.selective-typing-container');
        const inputs = container.querySelectorAll('.selective-typing-input');
        const currentIndex = parseInt(input.dataset.index);

        if (currentIndex < inputs.length - 1) {
            inputs[currentIndex + 1].focus();
        }
    }
}

/**
 * 語学学習用タイピングの回答を収集
 * @param {HTMLElement} container - 入力コンテナ
 * @param {Array} tokens - トークンの配列
 * @returns {string} ユーザーの回答文字列
 */
function collectSelectiveTypingAnswer(container, tokens) {
    const inputs = container.querySelectorAll('.selective-typing-input');
    let inputIndex = 0;

    return tokens.map(token => {
        if (token.type === 'word') {
            const input = inputs[inputIndex];
            inputIndex++;
            return input ? input.value : '';
        } else {
            return token.value;
        }
    }).join('');
}

/**
 * 語学学習用の回答を正規化
 * @param {string} str - 文字列
 * @returns {string} 正規化された文字列
 */
function normalizeForLanguageLearning(str) {
    return str
        // 小文字に統一
        .toLowerCase()
        // スマートクォートを通常のアポストロフィーに統一
        .replace(/['']/g, "'")
        // 各種ダッシュをハイフンに統一
        .replace(/[‐–—−]/g, '-')
        // 連続スペースを1つに
        .replace(/\s+/g, ' ')
        // 前後の空白を削除
        .trim();
}

/**
 * 語学学習用タイピング回答を判定
 * @param {string} userInput - ユーザーの入力
 * @param {Object} question - 問題オブジェクト
 * @returns {boolean} 正解かどうか
 */
function validateLanguageLearningAnswer(userInput, question) {
    if (!question.typingAnswer) return false;

    const normalizedInput = normalizeForLanguageLearning(userInput);
    const normalizedAnswer = normalizeForLanguageLearning(question.typingAnswer);

    // 完全一致で判定
    if (normalizedInput === normalizedAnswer) {
        return true;
    }

    // 許容する別解もチェック
    if (question.acceptableAnswers && question.acceptableAnswers.length > 0) {
        for (const alt of question.acceptableAnswers) {
            if (normalizedInput === normalizeForLanguageLearning(alt)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * 語学学習用タイピングの各フィールドの正誤を表示
 * @param {HTMLElement} container - 入力コンテナ
 * @param {Array} tokens - トークンの配列
 */
function showSelectiveTypingResults(container, tokens) {
    const inputs = container.querySelectorAll('.selective-typing-input');
    let inputIndex = 0;

    tokens.forEach(token => {
        if (token.type === 'word') {
            const input = inputs[inputIndex];
            if (input) {
                const expected = normalizeForLanguageLearning(token.value);
                const actual = normalizeForLanguageLearning(input.value);

                input.disabled = true;
                if (actual === expected) {
                    input.classList.add('correct');
                } else {
                    input.classList.add('incorrect');
                }
            }
            inputIndex++;
        }
    });
}

/**
 * 語学学習用タイピングUIかどうかを判定
 * @param {Object} question - 問題オブジェクト
 * @returns {boolean}
 */
function isSelectiveTypingQuestion(question) {
    return question.isLanguageLearning === true && question.typingAnswer;
}

// グローバルにエクスポート
window.QuizTyping = {
    validateTypingAnswer,
    submitTypingAnswer,
    speakCurrentQuestion,
    getTypingQuestions,
    // 語学学習用
    tokenizeAnswer,
    generateMask,
    createSelectiveTypingUI,
    collectSelectiveTypingAnswer,
    normalizeForLanguageLearning,
    validateLanguageLearningAnswer,
    showSelectiveTypingResults,
    isSelectiveTypingQuestion
};