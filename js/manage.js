/**
 * manage.js - 管理画面
 * 問題一覧表示、問題エディタ、プレビュー機能を担当
 */

// ==================== 管理画面 ====================

/**
 * 問題の出題形式バッジを生成
 * @param {string} type - 'multiple-choice' | 'typing' | 'both' | undefined
 * @returns {string} HTML string
 */
function getQuestionTypeBadge(type) {
    if (!type || type === 'multiple-choice') {
        return '<span class="type-badge type-multiple-choice">📝 4択</span>';
    } else if (type === 'typing') {
        return '<span class="type-badge type-typing">⌨️ タイピング</span>';
    } else if (type === 'both') {
        return '<span class="type-badge type-both">📝⌨️ 両方</span>';
    }
    return '';
}

/**
 * 管理画面を更新
 */
async function refreshManageScreen() {
    try {
        const questions = await QuizDB.getAllQuestions();
        AppState.manage.questions = questions;

        // タグ選択肢を更新
        const tags = await QuizDB.getAllTags();
        const filterTag = document.getElementById('filter-tag');
        if (filterTag) {
            const currentValue = filterTag.value;
            filterTag.innerHTML = '<option value="">全てのタグ</option>';
            tags.forEach(tag => {
                filterTag.innerHTML += `<option value="${QuizUI.escapeHtml(tag)}">${QuizUI.escapeHtml(tag)}</option>`;
            });
            filterTag.value = currentValue;
        }

        // 問題数を表示
        document.getElementById('question-count').textContent = `全${questions.length}問`;

        // リストを表示
        filterQuestionList();

    } catch (error) {
        console.error('管理画面の更新エラー:', error);
        QuizUI.showToast('問題一覧の取得に失敗しました', 'error');
    }
}

/**
 * 問題リストをフィルタリング
 */
async function filterQuestionList() {
    let questions = [...AppState.manage.questions];

    // タグ絞り込み
    if (AppState.manage.filterTag) {
        questions = questions.filter(q =>
            q.tags && q.tags.includes(AppState.manage.filterTag)
        );
    }

    // セット所属フィルター
    if (AppState.manage.filterSet === 'no-set') {
        questions = questions.filter(q =>
            !q.sets || q.sets.length === 0
        );
    }

    // 学習状態フィルター
    if (AppState.manage.filterMastery) {
        const allStats = await QuizDB.getAllStats();
        const statsMap = new Map();
        allStats.forEach(s => statsMap.set(s.question_id, s));

        questions = questions.filter(q => {
            const stats = statsMap.get(q.id);
            const masteryLevel = SM2.getMasteryLevel(stats);

            switch (AppState.manage.filterMastery) {
                case 'not-started':
                    return masteryLevel === 'new'; // 未学習
                case 'in-progress':
                    return masteryLevel === 'learning' || masteryLevel === 'mastered' // 学習中
                case 'completed':
                    return masteryLevel === 'completed'; // 完全習得
                default:
                    return true;
            }
        });
    }

    // 検索
    if (AppState.manage.searchQuery) {
        const query = AppState.manage.searchQuery.toLowerCase();
        questions = questions.filter(q =>
            (q.title && q.title.toLowerCase().includes(query)) ||
            (q.body_md && q.body_md.toLowerCase().includes(query))
        );
    }

    // ソート(更新日時の降順)
    questions.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

    // 全統計を取得してマスタリーレベルをチェック
    const allStats = await QuizDB.getAllStats();
    const statsMap = new Map();
    allStats.forEach(s => statsMap.set(s.question_id, s));

    // 全セットを取得してマップを作成
    const allSets = await QuizDB.getAllQuestionSets();
    const setsMap = new Map();
    allSets.forEach(s => setsMap.set(s.id, s));

    // 一括操作エリアの表示
    const bulkActions = document.getElementById('bulk-actions');
    if (bulkActions) {
        bulkActions.style.display = questions.length > 0 ? 'flex' : 'none';
    }

    // 表示
    const listContainer = document.getElementById('question-list');
    if (listContainer) {
        if (questions.length === 0) {
            listContainer.innerHTML = '<p class="empty-message">問題がありません</p>';
        } else {
            listContainer.innerHTML = questions.map(q => {
                // 問題文のプレビュー(最初の50文字、Markdown記号を除去)
                const bodyPreview = (q.body_md || '').replace(/[#*`$\\[\]]/g, '').slice(0, 50);

                // 作成日をフォーマット
                const createdDate = q.created_at ? new Date(q.created_at).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }) : '-';

                // マスタリーレベルを取得
                const stats = statsMap.get(q.id);
                const masteryLevel = SM2.getMasteryLevel(stats);
                const isCompleted = masteryLevel === 'completed';

                // 達成率を計算 (interval / 21 * 100、最大100%)
                const interval = stats?.interval || 0;
                const progressPercent = Math.min(Math.round(interval / 21 * 100), 100);

                // 次回学習日を計算
                let nextReviewText = '';
                if (!stats || !stats.nextReviewDate) {
                    nextReviewText = '未学習';
                } else if (isCompleted) {
                    nextReviewText = '習得済み';
                } else {
                    const now = Date.now();
                    const nextReview = stats.nextReviewDate;
                    const daysUntil = Math.ceil((nextReview - now) / (24 * 60 * 60 * 1000));

                    if (daysUntil <= 0) {
                        nextReviewText = '📌 今日';
                    } else if (daysUntil === 1) {
                        nextReviewText = '明日';
                    } else if (daysUntil <= 7) {
                        nextReviewText = `${daysUntil}日後`;
                    } else {
                        const nextDate = new Date(nextReview);
                        nextReviewText = nextDate.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
                    }
                }

                // セット所属状況を取得
                const questionSets = (q.sets || []).map(setId => setsMap.get(setId)).filter(s => s);
                const setNames = questionSets.map(s => s.name);
                const belongsToSet = setNames.length > 0;

                // 選択状態を確認
                const isSelected = AppState.manage.selectedQuestions.has(q.id);

                return `
                <div class="question-item with-checkbox ${isCompleted ? 'question-item-completed' : ''}" data-id="${q.id}">
                    <input type="checkbox" class="question-item-checkbox" data-question-id="${q.id}" ${isSelected ? 'checked' : ''} onchange="toggleQuestionSelection('${q.id}', this.checked)">
                    <div class="question-item-content">
                        <div class="question-item-title">
                            ${isCompleted ? '<span class="completed-badge">✓ 習得済み</span>' : ''}
                            ${getQuestionTypeBadge(q.type)}
                            ${QuizUI.escapeHtml(q.title || '無題')}
                        </div>
                        <div class="question-item-preview">${QuizUI.escapeHtml(bodyPreview)}${bodyPreview.length >= 50 ? '...' : ''}</div>
                        <div class="question-item-progress">
                            <div class="progress-bar-mini">
                                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
                            </div>
                            <span class="progress-text">${progressPercent}%</span>
                            <span class="next-review-text">${nextReviewText}</span>
                        </div>
                        <div class="question-item-meta">
                            <span class="question-item-date">📅 ${createdDate}</span>
                            <div class="question-item-sets">
                                ${belongsToSet
                                    ? setNames.map(name => `<span class="set-badge">${QuizUI.escapeHtml(name)}</span>`).join('')
                                    : '<span class="no-set-badge">セット未所属</span>'
                                }
                            </div>
                            <div class="question-item-tags">
                                ${(q.tags || []).map(tag => `<span class="tag-small">${QuizUI.escapeHtml(tag)}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="question-item-actions">
                        ${isCompleted
                            ? `<button class="btn btn-small btn-secondary" onclick="restartQuestionLearning('${q.id}')" title="再度学習する">
                                🔄 再学習
                            </button>`
                            : `<button class="btn btn-small btn-success" onclick="markQuestionAsCompleted('${q.id}')" title="習得済みにする">
                                ✓ 習得済み
                            </button>`
                        }
                        <button class="btn btn-small btn-edit" onclick="editQuestion('${q.id}')">編集</button>
                        <button class="btn btn-small btn-danger" onclick="deleteQuestionConfirm('${q.id}')">削除</button>
                    </div>
                </div>
            `}).join('');
        }
    }

    // 選択カウントを更新
    QuizSets.updateSelectedCount();
}

/**
 * 問題エディタを表示
 */
async function showQuestionEditor(questionId) {
    AppState.manage.editingId = questionId;

    const editorTitle = document.getElementById('editor-title');
    const form = document.getElementById('question-form');
    const jsonInput = document.getElementById('json-input');

    // フォームをリセット
    form.reset();
    document.getElementById('uploaded-images').innerHTML = '';
    AppState.tagInput?.clear();
    if (jsonInput) jsonInput.value = '';

    // プレビューを非表示
    document.getElementById('form-preview-area').style.display = 'none';
    document.getElementById('json-preview-area').style.display = 'none';

    if (questionId) {
        // 編集モード
        editorTitle.textContent = '問題を編集';
        const question = await QuizDB.getQuestion(questionId);

        if (question) {
            // フォーム入力タブにデータを設定
            document.getElementById('q-title').value = question.title || '';
            document.getElementById('q-body').value = question.body_md || '';
            document.getElementById('q-choice-a').value = question.choices?.A || '';
            document.getElementById('q-choice-b').value = question.choices?.B || '';
            document.getElementById('q-choice-c').value = question.choices?.C || '';
            document.getElementById('q-choice-d').value = question.choices?.D || '';
            document.getElementById('q-answer').value = question.answer || 'A';
            document.getElementById('q-explanation').value = question.explanation_md || '';

            // タグを設定
            AppState.tagInput?.setTags(question.tags || []);

            // 画像を表示
            if (question.asset_ids && question.asset_ids.length > 0) {
                const container = document.getElementById('uploaded-images');
                for (const assetId of question.asset_ids) {
                    const url = await QuizUI.getAssetUrl(assetId);
                    if (url) {
                        const div = document.createElement('div');
                        div.className = 'uploaded-image-item';
                        div.dataset.assetId = assetId;
                        div.innerHTML = `
                            <img src="${url}" alt="アップロード画像">
                            <button type="button" class="remove-image-btn" onclick="removeUploadedImage('${assetId}')">&times;</button>
                        `;
                        container.appendChild(div);
                    }
                }
            }

            // シャッフル対応フラグを設定
            const shuffleReadyCheckbox = document.getElementById('shuffle-ready');
            if (shuffleReadyCheckbox) {
                shuffleReadyCheckbox.checked = question.shuffleReady === true;
            }

            // JSON入力タブにもデータを設定
            if (jsonInput) {
                const jsonData = {
                    title: question.title || '',
                    body_md: question.body_md || '',
                    choices: question.choices || { A: '', B: '', C: '', D: '' },
                    answer: question.answer || 'A',
                    explanation_md: question.explanation_md || '',
                    tags: question.tags || [],
                    sets: question.sets || [],
                    type: question.type || 'multiple-choice',
                    typingAnswer: question.typingAnswer || '',
                    acceptableAnswers: question.acceptableAnswers || [],
                    caseSensitive: question.caseSensitive || false,
                    strictMatch: question.strictMatch !== undefined ? question.strictMatch : true,
                    isLanguageLearning: question.isLanguageLearning || false,
                    audioEnabled: question.audioEnabled || false,
                    audioLang: question.audioLang || 'en-US',
                    shuffleReady: question.shuffleReady || false
                };
                jsonInput.value = JSON.stringify(jsonData, null, 2);
            }
        }
    } else {
        // 新規作成モード
        editorTitle.textContent = '問題を追加';

        // 新規作成時はシャッフル対応フラグをリセット
        const shuffleReadyCheckbox = document.getElementById('shuffle-ready');
        if (shuffleReadyCheckbox) {
            shuffleReadyCheckbox.checked = false;
        }
    }

    document.getElementById('question-editor').style.display = 'block';
    document.getElementById('question-list-container').style.display = 'none';

    // JSONボタンのラベルを更新
    const saveJsonBtn = document.getElementById('save-json-btn');
    if (saveJsonBtn) {
        if (questionId) {
            saveJsonBtn.textContent = '更新';
        } else {
            saveJsonBtn.textContent = 'JSONから追加';
        }
    }
}

/**
 * 問題エディタを非表示
 */
function hideQuestionEditor() {
    document.getElementById('question-editor').style.display = 'none';
    document.getElementById('question-list-container').style.display = 'block';
    AppState.manage.editingId = null;
    // タブをリセット
    switchEditorTab('form');
    // JSONinput をクリア
    const jsonInput = document.getElementById('json-input');
    if (jsonInput) jsonInput.value = '';
    // プレビューを非表示
    document.getElementById('form-preview-area').style.display = 'none';
    document.getElementById('json-preview-area').style.display = 'none';
}


/**
 * エディタのタブを切り替え
 */
function switchEditorTab(tabName) {
    // タブボタンの状態を更新
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // タブコンテンツの表示を切り替え
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tab === tabName);
    });

    // JSONInputモードのボタンテキストを更新
    const saveJsonBtn = document.getElementById('save-json-btn');
    if (saveJsonBtn) {
        if (AppState.manage.editingId) {
            saveJsonBtn.textContent = '更新';
        } else {
            saveJsonBtn.textContent = 'JSONから追加';
        }
    }
}


/**
 * JSONから問題を追加/更新
 */
async function saveFromJson() {
    try {
        const jsonInput = document.getElementById('json-input');
        const jsonText = jsonInput?.value.trim();

        if (!jsonText) {
            QuizUI.showToast('JSONを入力してください', 'error');
            return;
        }

        let data;
        try {
            data = JSON.parse(jsonText);
        } catch (e) {
            QuizUI.showToast('JSONの形式が正しくありません: ' + e.message, 'error');
            return;
        }

        // 編集モードかどうかをチェック
        if (AppState.manage.editingId) {
            // ========== 更新モード(単一の問題のみ) ==========

            // 配列が渡された場合はエラー
            if (Array.isArray(data)) {
                QuizUI.showToast('編集モードでは単一の問題のみ更新できます', 'error');
                return;
            }

            // バリデーション
            if (!data.body_md && !data.title) {
                QuizUI.showToast('問題文またはタイトルが必要です', 'error');
                return;
            }

            // 既存の問題を更新
            await QuizDB.updateQuestion(AppState.manage.editingId, data);
            QuizUI.showToast('問題を更新しました', 'success');

        } else {
            // ========== 新規追加モード ==========

            // 配列でない場合は配列に変換
            const questions = Array.isArray(data) ? data : [data];

            // バリデーション
            for (const q of questions) {
                if (!q.body_md && !q.title) {
                    QuizUI.showToast('問題文またはタイトルが必要です', 'error');
                    return;
                }
            }

            // 問題を追加
            let addedCount = 0;
            for (const q of questions) {
                try {
                    await QuizDB.addQuestionWithId(q);
                    addedCount++;
                } catch (error) {
                    console.error('問題の追加エラー:', error);
                }
            }

            QuizUI.showToast(`${addedCount}件の問題を追加しました`, 'success');
        }

        // エディタを閉じて画面を更新
        hideQuestionEditor();
        await refreshManageScreen();

    } catch (error) {
        console.error('JSON保存エラー:', error);
        QuizUI.showToast('保存に失敗しました: ' + error.message, 'error');
    }
}

/**
 * 画像をアップロード
 */
async function handleImageUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const container = document.getElementById('uploaded-images');

    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            QuizUI.showToast('画像ファイルのみアップロードできます', 'error');
            continue;
        }

        // サイズチェック(10MB上限)
        if (file.size > 10 * 1024 * 1024) {
            QuizUI.showToast('画像サイズは10MB以下にしてください', 'error');
            continue;
        }

        try {
            const asset = await QuizDB.addAsset(file, file.name);
            const url = await QuizUI.getAssetUrl(asset.id);

            const div = document.createElement('div');
            div.className = 'uploaded-image-item';
            div.dataset.assetId = asset.id;
            div.innerHTML = `
                <img src="${url}" alt="アップロード画像">
                <button type="button" class="remove-image-btn" onclick="removeUploadedImage('${asset.id}')">&times;</button>
            `;
            container.appendChild(div);

        } catch (error) {
            console.error('画像アップロードエラー:', error);
            QuizUI.showToast('画像のアップロードに失敗しました', 'error');
        }
    }

    // 入力をリセット
    event.target.value = '';
}

/**
 * アップロード画像を削除
 */
async function removeUploadedImage(assetId) {
    const item = document.querySelector(`.uploaded-image-item[data-asset-id="${assetId}"]`);
    if (item) {
        item.remove();
    }
    // 注: 実際のアセットは問題保存時に整理する
}

/**
 * 問題を保存
 */
async function saveQuestion() {
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

        // シャッフル対応フラグを取得
        const shuffleReady = document.getElementById('shuffle-ready')?.checked || false;

        const questionData = {
            title,
            body_md,
            choices: { A: choiceA, B: choiceB, C: choiceC, D: choiceD },
            answer,
            explanation_md,
            tags,
            asset_ids,
            shuffleReady
        };

        if (AppState.manage.editingId) {
            // 更新
            await QuizDB.updateQuestion(AppState.manage.editingId, questionData);
            QuizUI.showToast('問題を更新しました', 'success');
        } else {
            // 新規追加
            await QuizDB.addQuestion(questionData);
            QuizUI.showToast('問題を追加しました', 'success');
        }

        hideQuestionEditor();
        await refreshManageScreen();

    } catch (error) {
        console.error('保存エラー:', error);
        QuizUI.showToast('保存に失敗しました', 'error');
    }
}

/**
 * 問題を編集
 */
function editQuestion(id) {
    showQuestionEditor(id);
}

/**
 * 問題削除の確認
 */
async function deleteQuestionConfirm(id) {
    const confirmed = await QuizUI.showConfirm('この問題を削除しますか?');
    if (confirmed) {
        try {
            await QuizDB.deleteQuestion(id);
            QuizUI.showToast('問題を削除しました', 'success');
            await refreshManageScreen();
        } catch (error) {
            console.error('削除エラー:', error);
            QuizUI.showToast('削除に失敗しました', 'error');
        }
    }
}

/**
 * 問題を習得済みにする(管理画面から)
 */
async function markQuestionAsCompleted(questionId) {
    try {
        await QuizDB.markAsCompleted(questionId);
        QuizUI.showToast('習得済みにしました', 'success');
        await refreshManageScreen();
    } catch (error) {
        console.error('習得済み設定エラー:', error);
        QuizUI.showToast('エラーが発生しました', 'error');
    }
}

/**
 * 完全習得済み問題を再学習対象にする
 */
async function restartQuestionLearning(questionId) {
    try {
        await QuizDB.restartLearning(questionId);
        QuizUI.showToast('再学習対象にしました', 'success');
        await refreshManageScreen();
    } catch (error) {
        console.error('再学習設定エラー:', error);
        QuizUI.showToast('エラーが発生しました', 'error');
    }
}

/**
 * プレビューを更新
 * @param {string} mode - 'form' または 'json'
 */
async function updatePreview(mode) {
    try {
        let questionData = null;
        let previewPrefix = '';

        if (mode === 'form') {
            questionData = getQuestionDataFromForm();
            previewPrefix = 'form-preview';
            const previewArea = document.getElementById('form-preview-area');
            if (previewArea) {
                previewArea.style.display = 'block';
            }
        } else if (mode === 'json') {
            questionData = getQuestionDataFromJson();
            previewPrefix = 'json-preview';
            const previewArea = document.getElementById('json-preview-area');
            if (previewArea) {
                previewArea.style.display = 'block';
            }
        }

        if (!questionData) {
            QuizUI.showToast('プレビューデータを取得できませんでした', 'warning');
            return;
        }

        // プレビューをレンダリング
        await renderPreview(questionData, previewPrefix);

    } catch (error) {
        console.error('プレビュー更新エラー:', error);
        QuizUI.showToast('プレビューの更新に失敗しました: ' + error.message, 'error');
    }
}

/**
 * フォーム入力から問題データを取得
 */
function getQuestionDataFromForm() {
    return {
        title: document.getElementById('q-title')?.value || '',
        body_md: document.getElementById('q-body')?.value || '',
        choices: {
            A: document.getElementById('q-choice-a')?.value || '',
            B: document.getElementById('q-choice-b')?.value || '',
            C: document.getElementById('q-choice-c')?.value || '',
            D: document.getElementById('q-choice-d')?.value || ''
        },
        answer: document.getElementById('q-answer')?.value || 'A',
        explanation_md: document.getElementById('q-explanation')?.value || '',
        tags: AppState.tagInput?.getTags() || [],
        asset_ids: Array.from(document.querySelectorAll('.uploaded-image-item')).map(item => item.dataset.assetId)
    };
}

/**
 * JSON入力から問題データを取得
 */
function getQuestionDataFromJson() {
    const jsonInput = document.getElementById('json-input');
    const jsonText = jsonInput?.value.trim();

    if (!jsonText) {
        return null;
    }

    try {
        const data = JSON.parse(jsonText);

        // 配列の場合は最初の要素を使用
        if (Array.isArray(data)) {
            if (data.length === 0) return null;
            return data[0];
        }

        return data;
    } catch (error) {
        console.error('JSON解析エラー:', error);
        return null;
    }
}

/**
 * プレビューをレンダリング
 * @param {Object} questionData - 問題データ
 * @param {string} prefix - IDのプレフィックス ('form-preview' または 'json-preview')
 */
async function renderPreview(questionData, prefix) {
    // タイトル
    const titleEl = document.getElementById(`${prefix}-title`);
    if (titleEl) {
        titleEl.textContent = questionData.title || '問題タイトル';
    }

    // 問題文
    const bodyEl = document.getElementById(`${prefix}-body`);
    if (bodyEl) {
        QuizUI.renderContent(questionData.body_md || '', bodyEl);
    }

    // 画像
    const imagesContainer = document.getElementById(`${prefix}-images`);
    if (imagesContainer) {
        imagesContainer.innerHTML = '';
        if (questionData.asset_ids && questionData.asset_ids.length > 0) {
            for (const assetId of questionData.asset_ids) {
                const img = await QuizUI.createImageElement(assetId, 'preview-image');
                if (img) {
                    imagesContainer.appendChild(img);
                }
            }
        }
    }

    // 選択肢
    const choices = ['A', 'B', 'C', 'D'];
    choices.forEach(choice => {
        const choiceEl = document.getElementById(`${prefix}-choice-${choice.toLowerCase()}`);
        if (choiceEl) {
            QuizUI.renderContent(questionData.choices?.[choice] || '', choiceEl);
        }
    });

    // 正解
    const answerEl = document.getElementById(`${prefix}-answer`);
    if (answerEl) {
        answerEl.textContent = questionData.answer || 'A';
    }

    // 解説
    const explanationEl = document.getElementById(`${prefix}-explanation`);
    if (explanationEl) {
        QuizUI.renderContent(questionData.explanation_md || '解説はありません', explanationEl);
    }

    // タグ
    const tagsEl = document.getElementById(`${prefix}-tags-list`);
    if (tagsEl) {
        if (questionData.tags && questionData.tags.length > 0) {
            tagsEl.innerHTML = questionData.tags.map(tag =>
                `<span class="tag-small">${QuizUI.escapeHtml(tag)}</span>`
            ).join(' ');
        } else {
            tagsEl.textContent = 'なし';
        }
    }
}

// グローバルにエクスポート
window.QuizManage = {
    refreshManageScreen,
    filterQuestionList,
    showQuestionEditor,
    hideQuestionEditor,
    switchEditorTab,
    saveFromJson,
    handleImageUpload,
    removeUploadedImage,
    saveQuestion,
    editQuestion,
    deleteQuestionConfirm,
    markQuestionAsCompleted,
    restartQuestionLearning,
    updatePreview,
    getQuestionDataFromForm,
    getQuestionDataFromJson,
    renderPreview,
    getQuestionTypeBadge
};

// HTMLから直接呼ばれる関数をwindowに登録
window.refreshManageScreen = refreshManageScreen;
window.editQuestion = editQuestion;
window.deleteQuestionConfirm = deleteQuestionConfirm;
window.removeUploadedImage = removeUploadedImage;
window.markQuestionAsCompleted = markQuestionAsCompleted;
window.restartQuestionLearning = restartQuestionLearning;