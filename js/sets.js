/**
 * sets.js - セット管理画面
 * 問題セットのCRUD、セット選択UI、一括操作を担当
 */

// ==================== セット管理画面 ====================

/**
 * セット管理画面を更新
 */
async function refreshSetsScreen() {
    try {
        const sets = await QuizDB.getAllQuestionSets();

        // セット数を表示
        document.getElementById('sets-count').textContent = I18n.t('sets.count', { count: sets.length });

        // リストを表示
        const listContainer = document.getElementById('sets-list');
        if (listContainer) {
            if (sets.length === 0) {
                listContainer.innerHTML = `<p class="empty-message">${I18n.t('sets.empty')}</p>`;
            } else {
                listContainer.innerHTML = sets.map(set => {
                    const questionCount = set.questionIds?.length || 0;
                    return `
                    <div class="set-item ${set.enabled ? '' : 'disabled'}" data-id="${set.id}">
                        <div class="set-item-content">
                            <div class="set-item-header">
                                <span class="set-item-name">${QuizUI.escapeHtml(set.name)}</span>
                                <span class="set-item-count">(${questionCount}問)</span>
                            </div>
                            ${set.description ? `<div class="set-item-description">${QuizUI.escapeHtml(set.description)}</div>` : ''}
                        </div>
                        <div class="set-item-actions">
                            <label class="set-toggle">
                                <input type="checkbox" ${set.enabled ? 'checked' : ''} onchange="toggleSetEnabled('${set.id}', this.checked)">
                                ${I18n.t('sets.enabled')}
                            </label>
                            <button class="btn btn-small btn-edit" onclick="editSet('${set.id}')">${I18n.t('manage.action.edit')}</button>
                            <button class="btn btn-small btn-danger" onclick="deleteSetConfirm('${set.id}')">${I18n.t('manage.action.delete')}</button>
                        </div>
                    </div>
                `}).join('');
            }
        }

    } catch (error) {
        console.error('セット一覧の更新エラー:', error);
        QuizUI.showToast('セット一覧の取得に失敗しました', 'error');
    }
}

/**
 * セットエディタを表示
 */
async function showSetEditor(setId) {
    AppState.sets.editingId = setId;
    AppState.sets.questionSearchQuery = '';
    AppState.sets.questionFilterTag = '';
    AppState.sets.selectedQuestions.clear();

    const editorTitle = document.getElementById('set-editor-title');
    const setName = document.getElementById('set-name');
    const setDescription = document.getElementById('set-description');
    const setEnabled = document.getElementById('set-enabled');
    const questionsSection = document.getElementById('set-questions-section');
    const searchInput = document.getElementById('set-questions-search-input');
    const tagFilter = document.getElementById('set-questions-filter-tag');
    const selectAllCheckbox = document.getElementById('set-select-all-questions');

    // フォームをリセット
    setName.value = '';
    setDescription.value = '';
    setEnabled.checked = true;
    if (searchInput) searchInput.value = '';
    if (tagFilter) tagFilter.value = '';
    if (selectAllCheckbox) selectAllCheckbox.checked = false;

    if (setId) {
        // 編集モード
        editorTitle.textContent = I18n.t('sets.editor.titleEdit');
        const set = await QuizDB.getQuestionSet(setId);

        if (set) {
            AppState.sets.currentSet = set;
            setName.value = set.name || '';
            setDescription.value = set.description || '';
            setEnabled.checked = set.enabled !== false;

            // タグ選択肢を更新
            await updateSetQuestionsTagFilter(set);

            // 問題一覧を表示
            if (questionsSection) {
                questionsSection.style.display = 'block';
                await renderSetQuestions(set);
            }
        }
    } else {
        // 新規作成モード
        editorTitle.textContent = I18n.t('sets.editor.titleAdd');
        AppState.sets.currentSet = null;
        if (questionsSection) {
            questionsSection.style.display = 'none';
        }
    }

    document.getElementById('set-editor').style.display = 'block';
    document.getElementById('sets-list-container').style.display = 'none';
}

/**
 * セット内問題のタグフィルター選択肢を更新
 */
async function updateSetQuestionsTagFilter(set) {
    const tagFilter = document.getElementById('set-questions-filter-tag');
    if (!tagFilter) return;

    const questions = await QuizDB.getQuestionsBySet(set.id);
    const tagsSet = new Set();
    questions.forEach(q => {
        (q.tags || []).forEach(tag => tagsSet.add(tag));
    });

    const tags = Array.from(tagsSet).sort();
    tagFilter.innerHTML = `<option value="">${I18n.t('manage.filter.allTags')}</option>`;
    tags.forEach(tag => {
        tagFilter.innerHTML += `<option value="${QuizUI.escapeHtml(tag)}">${QuizUI.escapeHtml(tag)}</option>`;
    });
}

/**
 * セットエディタを非表示
 */
function hideSetEditor() {
    document.getElementById('set-editor').style.display = 'none';
    document.getElementById('sets-list-container').style.display = 'block';
    AppState.sets.editingId = null;
    AppState.sets.currentSet = null;
    AppState.sets.questionSearchQuery = '';
    AppState.sets.questionFilterTag = '';
    AppState.sets.selectedQuestions.clear();
}

/**
 * セットに含まれる問題一覧を表示
 */
async function renderSetQuestions(set) {
    const container = document.getElementById('set-questions-list');
    const countEl = document.getElementById('set-questions-count');

    if (!container) return;

    let questions = await QuizDB.getQuestionsBySet(set.id);
    const totalCount = questions.length;

    // タグフィルター
    if (AppState.sets.questionFilterTag) {
        questions = questions.filter(q =>
            q.tags && q.tags.includes(AppState.sets.questionFilterTag)
        );
    }

    // 検索フィルター
    if (AppState.sets.questionSearchQuery) {
        const query = AppState.sets.questionSearchQuery.toLowerCase();
        questions = questions.filter(q =>
            (q.title && q.title.toLowerCase().includes(query)) ||
            (q.body_md && q.body_md.toLowerCase().includes(query))
        );
    }

    // フィルターされた問題IDのリストを保存（すべて選択用）
    AppState.sets.filteredQuestionIds = questions.map(q => q.id);

    if (countEl) {
        const isFiltered = AppState.sets.questionSearchQuery || AppState.sets.questionFilterTag;
        if (isFiltered && questions.length !== totalCount) {
            countEl.textContent = `${questions.length}/${totalCount}`;
        } else {
            countEl.textContent = totalCount;
        }
    }

    // 選択カウントを更新
    updateSetSelectedCount();

    if (questions.length === 0) {
        const isFiltered = AppState.sets.questionSearchQuery || AppState.sets.questionFilterTag;
        if (isFiltered) {
            container.innerHTML = `<p class="empty-message" style="padding: 16px;">${I18n.t('sets.noMatchingQuestions')}</p>`;
        } else {
            container.innerHTML = `<p class="empty-message" style="padding: 16px;">${I18n.t('manage.empty')}</p>`;
        }
    } else {
        container.innerHTML = questions.map(q => {
            const isSelected = AppState.sets.selectedQuestions.has(q.id);
            const tagsHtml = (q.tags || []).map(tag =>
                `<span class="tag-small">${QuizUI.escapeHtml(tag)}</span>`
            ).join('');
            return `
            <div class="set-question-item">
                <input type="checkbox" class="set-question-checkbox" data-question-id="${q.id}"
                    ${isSelected ? 'checked' : ''} onchange="toggleSetQuestionSelection('${q.id}', this.checked)">
                <div class="set-question-info">
                    <span class="set-question-title">${QuizUI.escapeHtml(q.title || q.body_md?.substring(0, 50) || I18n.t('manage.untitled'))}</span>
                    <div class="set-question-tags">${tagsHtml}</div>
                </div>
                <button class="btn btn-small btn-danger" onclick="removeQuestionFromSetUI('${q.id}', '${set.id}')">${I18n.t('sets.removeFromSet')}</button>
            </div>
        `}).join('');
    }
}

/**
 * セット内問題の選択を切り替え
 */
function toggleSetQuestionSelection(questionId, selected) {
    if (selected) {
        AppState.sets.selectedQuestions.add(questionId);
    } else {
        AppState.sets.selectedQuestions.delete(questionId);
    }
    updateSetSelectedCount();
    updateSetSelectAllCheckbox();
}

/**
 * セット内問題のすべて選択/解除
 */
function toggleSetSelectAllQuestions(selected) {
    const filteredIds = AppState.sets.filteredQuestionIds || [];
    filteredIds.forEach(id => {
        if (selected) {
            AppState.sets.selectedQuestions.add(id);
        } else {
            AppState.sets.selectedQuestions.delete(id);
        }
    });

    // チェックボックスの表示を更新
    document.querySelectorAll('.set-question-checkbox').forEach(checkbox => {
        checkbox.checked = selected;
    });

    updateSetSelectedCount();
}

/**
 * セット内問題の選択カウントを更新
 */
function updateSetSelectedCount() {
    const countEl = document.getElementById('set-selected-count');
    if (countEl) {
        countEl.textContent = I18n.t('manage.bulk.selectedCount', { count: AppState.sets.selectedQuestions.size });
    }
}

/**
 * すべて選択チェックボックスの状態を更新
 */
function updateSetSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('set-select-all-questions');
    const filteredIds = AppState.sets.filteredQuestionIds || [];
    if (selectAllCheckbox && filteredIds.length > 0) {
        const allSelected = filteredIds.every(id => AppState.sets.selectedQuestions.has(id));
        selectAllCheckbox.checked = allSelected;
    }
}

/**
 * 選択した問題をセットから一括除外
 */
async function removeSelectedQuestionsFromSet() {
    if (AppState.sets.selectedQuestions.size === 0) {
        QuizUI.showToast('問題を選択してください', 'warning');
        return;
    }

    const count = AppState.sets.selectedQuestions.size;
    const confirmed = await QuizUI.showConfirm(I18n.t('confirm.removeFromSet', { count }));

    if (!confirmed) return;

    try {
        const setId = AppState.sets.currentSet.id;
        const questionIds = Array.from(AppState.sets.selectedQuestions);

        for (const qId of questionIds) {
            await QuizDB.removeQuestionFromSet(qId, setId);
        }

        // 選択をクリア
        AppState.sets.selectedQuestions.clear();
        document.getElementById('set-select-all-questions').checked = false;

        QuizUI.showToast(I18n.t('toast.removedFromSet', { count }), 'success');

        // セット情報を再取得して表示を更新
        const set = await QuizDB.getQuestionSet(setId);
        if (set) {
            AppState.sets.currentSet = set;
            await updateSetQuestionsTagFilter(set);
            await renderSetQuestions(set);
        }
    } catch (error) {
        console.error('一括除外エラー:', error);
        QuizUI.showToast('除外に失敗しました', 'error');
    }
}

/**
 * セットを保存
 */
async function saveSet() {
    try {
        const name = document.getElementById('set-name').value.trim();
        const description = document.getElementById('set-description').value.trim();
        const enabled = document.getElementById('set-enabled').checked;

        if (!name) {
            QuizUI.showToast('セット名を入力してください', 'error');
            return;
        }

        if (AppState.sets.editingId) {
            // 更新
            await QuizDB.updateQuestionSet(AppState.sets.editingId, {
                name,
                description,
                enabled
            });
            QuizUI.showToast('セットを更新しました', 'success');
        } else {
            // 新規作成
            await QuizDB.createQuestionSet({
                name,
                description,
                enabled
            });
            QuizUI.showToast('セットを作成しました', 'success');
        }

        hideSetEditor();
        await refreshSetsScreen();

    } catch (error) {
        console.error('セット保存エラー:', error);
        QuizUI.showToast('保存に失敗しました', 'error');
    }
}

/**
 * セットを編集
 */
function editSet(id) {
    showSetEditor(id);
}

/**
 * セット削除の確認
 */
async function deleteSetConfirm(id) {
    const confirmed = await QuizUI.showConfirm(I18n.t('confirm.deleteSet'));
    if (confirmed) {
        try {
            await QuizDB.deleteQuestionSet(id);
            QuizUI.showToast('セットを削除しました', 'success');
            await refreshSetsScreen();
        } catch (error) {
            console.error('削除エラー:', error);
            QuizUI.showToast('削除に失敗しました', 'error');
        }
    }
}

/**
 * セットの有効/無効を切り替え
 */
async function toggleSetEnabled(setId, enabled) {
    try {
        await QuizDB.updateQuestionSet(setId, { enabled });
        QuizUI.showToast(enabled ? 'セットを有効にしました' : 'セットを無効にしました', 'success');
        await refreshSetsScreen();
    } catch (error) {
        console.error('セット更新エラー:', error);
        QuizUI.showToast('更新に失敗しました', 'error');
    }
}

/**
 * 問題をセットから除外（UI）
 */
async function removeQuestionFromSetUI(questionId, setId) {
    try {
        await QuizDB.removeQuestionFromSet(questionId, setId);
        QuizUI.showToast('問題をセットから除外しました', 'success');

        // セット情報を再取得して表示を更新
        const set = await QuizDB.getQuestionSet(setId);
        if (set) {
            await renderSetQuestions(set);
        }
    } catch (error) {
        console.error('問題除外エラー:', error);
        QuizUI.showToast('除外に失敗しました', 'error');
    }
}

/**
 * セットチェックボックスをレンダリング
 */
async function renderSetCheckboxes(containerId, selectedSets = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const sets = await QuizDB.getAllQuestionSets();

    if (sets.length === 0) {
        container.innerHTML = `<div class="set-checkboxes-empty">${I18n.t('sets.noSets')}</div>`;
        return;
    }

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
            updateSelectedSets(containerId);
        });
    });
}

/**
 * 選択されたセットを更新
 */
function updateSelectedSets(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const selectedSets = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);

    // 状態を更新
    if (containerId === 'quiz-set-checkboxes') {
        AppState.quiz.selectedSets = selectedSets;
    }
}

/**
 * 問題編集画面のセットチェックボックスを取得
 */
function getSelectedSetsFromForm() {
    const container = document.getElementById('question-sets-checkboxes');
    if (!container) return [];

    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);
}

// ==================== 一括操作関連 ====================

/**
 * 問題の選択を切り替え
 */
function toggleQuestionSelection(questionId, selected) {
    if (selected) {
        AppState.manage.selectedQuestions.add(questionId);
    } else {
        AppState.manage.selectedQuestions.delete(questionId);
    }
    updateSelectedCount();

    // 「すべて選択」チェックボックスの状態を更新
    const selectAllCheckbox = document.getElementById('select-all-questions');
    const allCheckboxes = document.querySelectorAll('.question-item-checkbox');
    if (selectAllCheckbox && allCheckboxes.length > 0) {
        selectAllCheckbox.checked = AppState.manage.selectedQuestions.size === allCheckboxes.length;
    }
}

/**
 * すべて選択/解除
 */
function toggleSelectAllQuestions(selected) {
    const checkboxes = document.querySelectorAll('.question-item-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = selected;
        const questionId = checkbox.dataset.questionId;
        if (selected) {
            AppState.manage.selectedQuestions.add(questionId);
        } else {
            AppState.manage.selectedQuestions.delete(questionId);
        }
    });
    updateSelectedCount();
}

/**
 * 選択カウントを更新
 */
function updateSelectedCount() {
    const countEl = document.getElementById('selected-count');
    if (countEl) {
        countEl.textContent = I18n.t('manage.bulk.selectedCount', { count: AppState.manage.selectedQuestions.size });
    }
}

/**
 * セット選択モーダルを表示
 */
async function showSetSelectModal() {
    if (AppState.manage.selectedQuestions.size === 0) {
        QuizUI.showToast('問題を選択してください', 'warning');
        return;
    }

    const modal = document.getElementById('set-select-modal');
    const message = document.getElementById('set-select-message');
    const container = document.getElementById('set-select-checkboxes');

    if (message) {
        message.textContent = `${AppState.manage.selectedQuestions.size}件の問題をセットに追加します`;
    }

    // セット一覧を取得して表示
    const sets = await QuizDB.getAllQuestionSets();

    if (sets.length === 0) {
        container.innerHTML = `<p class="empty-message">${I18n.t('sets.noSetsCreate')}</p>`;
    } else {
        container.innerHTML = sets.map(set => {
            const questionCount = set.questionIds?.length || 0;
            return `
                <div class="set-checkbox-item">
                    <input type="checkbox" id="modal-set-${set.id}" value="${set.id}">
                    <label for="modal-set-${set.id}">${QuizUI.escapeHtml(set.name)}</label>
                    <span class="set-checkbox-count">(${questionCount}問)</span>
                </div>
            `;
        }).join('');
    }

    modal.classList.add('active');
}

/**
 * セット選択モーダルを非表示
 */
function hideSetSelectModal() {
    const modal = document.getElementById('set-select-modal');
    modal.classList.remove('active');
}

/**
 * 選択した問題をセットに追加
 */
async function addSelectedQuestionsToSets() {
    const container = document.getElementById('set-select-checkboxes');
    const selectedSetIds = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);

    if (selectedSetIds.length === 0) {
        QuizUI.showToast('追加先のセットを選択してください', 'warning');
        return;
    }

    try {
        QuizUI.showLoading('問題を追加中...');

        const questionIds = Array.from(AppState.manage.selectedQuestions);
        let addedCount = 0;

        for (const setId of selectedSetIds) {
            for (const qId of questionIds) {
                await QuizDB.addQuestionToSet(qId, setId);
                addedCount++;
            }
        }

        hideSetSelectModal();
        QuizUI.hideLoading();

        // 選択をクリア
        AppState.manage.selectedQuestions.clear();
        document.getElementById('select-all-questions').checked = false;

        QuizUI.showToast(`${questionIds.length}件の問題を${selectedSetIds.length}個のセットに追加しました`, 'success');

        // リストを更新（DBから最新データを取得）
        await QuizManage.refreshManageScreen();

    } catch (error) {
        QuizUI.hideLoading();
        console.error('セット追加エラー:', error);
        QuizUI.showToast('追加に失敗しました', 'error');
    }
}

/**
 * 選択した問題を一括削除
 */
async function deleteSelectedQuestions() {
    if (AppState.manage.selectedQuestions.size === 0) {
        QuizUI.showToast('問題を選択してください', 'warning');
        return;
    }

    const count = AppState.manage.selectedQuestions.size;
    const confirmed = await QuizUI.showConfirm(I18n.t('confirm.deleteQuestions', { count }));

    if (!confirmed) {
        return;
    }

    try {
        QuizUI.showLoading('問題を削除中...');

        const questionIds = Array.from(AppState.manage.selectedQuestions);
        let deletedCount = 0;

        for (const qId of questionIds) {
            try {
                await QuizDB.deleteQuestion(qId);
                deletedCount++;
            } catch (error) {
                console.error('問題削除エラー:', qId, error);
            }
        }

        QuizUI.hideLoading();

        // 選択をクリア
        AppState.manage.selectedQuestions.clear();
        const selectAllCheckbox = document.getElementById('select-all-questions');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }

        QuizUI.showToast(`${deletedCount}件の問題を削除しました`, 'success');

        // リストを更新
        await refreshManageScreen();

    } catch (error) {
        QuizUI.hideLoading();
        console.error('一括削除エラー:', error);
        QuizUI.showToast('削除に失敗しました', 'error');
    }
}

// グローバルにエクスポート
window.QuizSets = {
    refreshSetsScreen,
    showSetEditor,
    hideSetEditor,
    saveSet,
    editSet,
    deleteSetConfirm,
    toggleSetEnabled,
    removeQuestionFromSetUI,
    renderSetQuestions,
    renderSetCheckboxes,
    updateSelectedSets,
    getSelectedSetsFromForm,
    toggleQuestionSelection,
    toggleSelectAllQuestions,
    updateSelectedCount,
    showSetSelectModal,
    hideSetSelectModal,
    addSelectedQuestionsToSets,
    deleteSelectedQuestions,
    updateSetQuestionsTagFilter,
    toggleSetQuestionSelection,
    toggleSetSelectAllQuestions,
    updateSetSelectedCount,
    removeSelectedQuestionsFromSet
};

// HTMLのonclickから直接呼ばれる関数をwindowに登録
window.editSet = editSet;
window.deleteSetConfirm = deleteSetConfirm;
window.toggleSetEnabled = toggleSetEnabled;
window.removeQuestionFromSetUI = removeQuestionFromSetUI;
window.toggleQuestionSelection = toggleQuestionSelection;
window.toggleSetQuestionSelection = toggleSetQuestionSelection;
