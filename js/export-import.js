/**
 * export-import.js - エクスポート/インポート機能
 * データのバックアップと復元を担当
 */

// ==================== エクスポート機能 ====================

/**
 * 全データをZIPファイルとしてエクスポート
 */
async function exportToZip() {
    try {
        QuizUI.showLoading('エクスポート準備中...');

        // JSZipライブラリを使用
        const zip = new JSZip();

        // 問題データを取得
        const questions = await QuizDB.getAllQuestions();
        zip.file('questions.json', JSON.stringify(questions, null, 2));

        // 統計データを取得
        const stats = await QuizDB.getAllStats();
        zip.file('stats.json', JSON.stringify(stats, null, 2));

        // 解答履歴を取得
        const attempts = await QuizDB.getAllAttempts();
        zip.file('attempts.json', JSON.stringify(attempts, null, 2));

        // 問題セットを取得
        const questionSets = await QuizDB.getAllQuestionSets();
        zip.file('question_sets.json', JSON.stringify(questionSets, null, 2));

        // 画像データを取得してimagesフォルダに追加
        const assets = await QuizDB.getAllAssets();
        const imagesFolder = zip.folder('images');
        const assetMeta = [];

        for (const asset of assets) {
            if (asset.blob) {
                // BlobをBase64に変換して保存
                const base64 = await blobToBase64(asset.blob);
                imagesFolder.file(`${asset.id}.dat`, base64);
                assetMeta.push({
                    id: asset.id,
                    mime: asset.mime,
                    filename: asset.filename,
                    created_at: asset.created_at
                });
            }
        }
        zip.file('assets.json', JSON.stringify(assetMeta, null, 2));

        // ZIPファイルを生成
        QuizUI.showLoading('ZIPファイル生成中...');
        const content = await zip.generateAsync({ type: 'blob' });

        // ダウンロード
        const filename = `quiz_backup_${formatDateForFilename(new Date())}.zip`;
        downloadBlob(content, filename);

        QuizUI.hideLoading();
        QuizUI.showToast('エクスポートが完了しました', 'success');

    } catch (error) {
        QuizUI.hideLoading();
        console.error('エクスポートエラー:', error);
        QuizUI.showToast('エクスポートに失敗しました: ' + error.message, 'error');
    }
}

/**
 * 問題データのみをJSONでエクスポート
 * @param {boolean} includeSystemFields - ID等のシステムフィールドを含めるか（デフォルト: false）
 */
async function exportQuestionsJson(includeSystemFields = false) {
    try {
        const questions = await QuizDB.getAllQuestions();

        // システムフィールドを除外したクリーンなデータを作成
        const cleanQuestions = questions.map(q => {
            if (includeSystemFields) {
                return q;
            }
            // IDやタイムスタンプを除外
            return {
                title: q.title,
                body_md: q.body_md,
                choices: q.choices,
                answer: q.answer,
                explanation_md: q.explanation_md,
                tags: q.tags
                // id, asset_ids, created_at, updated_at は除外
            };
        });

        const blob = new Blob([JSON.stringify(cleanQuestions, null, 2)], { type: 'application/json' });
        const filename = `questions_${formatDateForFilename(new Date())}.json`;
        downloadBlob(blob, filename);
        QuizUI.showToast('問題データをエクスポートしました', 'success');
    } catch (error) {
        console.error('エクスポートエラー:', error);
        QuizUI.showToast('エクスポートに失敗しました', 'error');
    }
}

/**
 * 問題データをシステムフィールド込みでエクスポート（バックアップ用）
 */
async function exportQuestionsJsonFull() {
    try {
        const questions = await QuizDB.getAllQuestions();
        const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
        const filename = `questions_full_${formatDateForFilename(new Date())}.json`;
        downloadBlob(blob, filename);
        QuizUI.showToast('問題データ(全項目)をエクスポートしました', 'success');
    } catch (error) {
        console.error('エクスポートエラー:', error);
        QuizUI.showToast('エクスポートに失敗しました', 'error');
    }
}

/**
 * 統計データのみをJSONでエクスポート
 */
async function exportProgressJson() {
    try {
        const stats = await QuizDB.getAllStats();
        const attempts = await QuizDB.getAllAttempts();
        const data = { stats, attempts };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const filename = `progress_${formatDateForFilename(new Date())}.json`;
        downloadBlob(blob, filename);
        QuizUI.showToast('進捗データをエクスポートしました', 'success');
    } catch (error) {
        console.error('エクスポートエラー:', error);
        QuizUI.showToast('エクスポートに失敗しました', 'error');
    }
}

// ==================== インポート機能 ====================

/**
 * ZIPファイルからインポート
 */
async function importFromZip(file) {
    try {
        QuizUI.showLoading('ZIPファイルを読み込み中...');

        const zip = await JSZip.loadAsync(file);

        // 問題データをインポート
        const questionsFile = zip.file('questions.json');
        if (questionsFile) {
            const questionsText = await questionsFile.async('string');
            const questions = JSON.parse(questionsText);
            await importQuestions(questions, false); // 既存データを保持
        }

        // 画像データをインポート
        const assetsFile = zip.file('assets.json');
        if (assetsFile) {
            QuizUI.showLoading('画像を読み込み中...');
            const assetsText = await assetsFile.async('string');
            const assetMeta = JSON.parse(assetsText);

            for (const meta of assetMeta) {
                const imageFile = zip.file(`images/${meta.id}.dat`);
                if (imageFile) {
                    const base64 = await imageFile.async('string');
                    const blob = base64ToBlob(base64, meta.mime);
                    await importAsset(meta.id, blob, meta.filename, meta.created_at);
                }
            }
        }

        // 統計データをインポート
        const statsFile = zip.file('stats.json');
        if (statsFile) {
            const statsText = await statsFile.async('string');
            const stats = JSON.parse(statsText);
            await importStats(stats);
        }

        // 解答履歴をインポート
        const attemptsFile = zip.file('attempts.json');
        if (attemptsFile) {
            const attemptsText = await attemptsFile.async('string');
            const attempts = JSON.parse(attemptsText);
            await importAttempts(attempts);
        }

        // 問題セットをインポート
        const setsFile = zip.file('question_sets.json');
        if (setsFile) {
            const setsText = await setsFile.async('string');
            const questionSets = JSON.parse(setsText);
            await importQuestionSets(questionSets);
        }

        QuizUI.hideLoading();
        QuizUI.showToast('インポートが完了しました', 'success');

        // 画面を更新
        if (typeof refreshManageScreen === 'function') {
            refreshManageScreen();
        }

    } catch (error) {
        QuizUI.hideLoading();
        console.error('インポートエラー:', error);
        QuizUI.showToast('インポートに失敗しました: ' + error.message, 'error');
    }
}

/**
 * JSONファイルから問題をインポート
 */
async function importFromJson(file) {
    try {
        QuizUI.showLoading('ファイルを読み込み中...');

        const text = await readFileAsText(file);
        const data = JSON.parse(text);

        // 配列の場合は問題データ
        if (Array.isArray(data)) {
            await importQuestions(data, false);
        } else if (data.stats || data.attempts) {
            // 進捗データ
            if (data.stats) await importStats(data.stats);
            if (data.attempts) await importAttempts(data.attempts);
        } else if (data.questions) {
            // questions キーを持つオブジェクト
            await importQuestions(data.questions, false);
            // 問題セットもあればインポート
            if (data.question_sets) {
                await importQuestionSets(data.question_sets);
            }
        }

        QuizUI.hideLoading();
        QuizUI.showToast('インポートが完了しました', 'success');

        // 画面を更新
        if (typeof refreshManageScreen === 'function') {
            refreshManageScreen();
        }

    } catch (error) {
        QuizUI.hideLoading();
        console.error('インポートエラー:', error);
        QuizUI.showToast('インポートに失敗しました: ' + error.message, 'error');
    }
}

/**
 * 問題データをインポート
 */
async function importQuestions(questions, clearExisting = false) {
    if (clearExisting) {
        // 既存データを削除
        const existing = await QuizDB.getAllQuestions();
        for (const q of existing) {
            await QuizDB.deleteQuestion(q.id);
        }
    }

    let importCount = 0;
    for (const q of questions) {
        try {
            // QuizDBモジュールを使って追加（IDがなければ自動生成）
            await QuizDB.addQuestionWithId(q);
            importCount++;
        } catch (error) {
            console.error('問題のインポートエラー:', error);
        }
    }
    console.log(`${importCount}件の問題をインポートしました`);
    return importCount;
}

/**
 * アセットをインポート
 */
async function importAsset(id, blob, filename, created_at) {
    return await QuizDB.addAssetWithId(id, blob, filename, created_at);
}

/**
 * 統計データをインポート
 */
async function importStats(stats) {
    for (const stat of stats) {
        try {
            await QuizDB.addStatsData(stat);
        } catch (error) {
            console.error('統計データのインポートエラー:', error);
        }
    }
}

/**
 * 解答履歴をインポート
 */
async function importAttempts(attempts) {
    for (const attempt of attempts) {
        try {
            await QuizDB.addAttemptData(attempt);
        } catch (error) {
            console.error('解答履歴のインポートエラー:', error);
        }
    }
}

/**
 * 問題セットをインポート
 */
async function importQuestionSets(questionSets) {
    for (const set of questionSets) {
        try {
            // 既存のセットがあるかチェック
            const existing = await QuizDB.getQuestionSet(set.id);
            if (existing) {
                // 更新
                await QuizDB.updateQuestionSet(set.id, set);
            } else {
                // 新規作成（IDを保持）
                await createQuestionSetWithId(set);
            }
        } catch (error) {
            console.error('問題セットのインポートエラー:', error);
        }
    }
}

/**
 * IDを指定して問題セットを作成（インポート用）
 */
async function createQuestionSetWithId(setData) {
    return new Promise((resolve, reject) => {
        const transaction = indexedDB.open('quiz_app_db').onsuccess = (event) => {
            const db = event.target.result;
            const tx = db.transaction(['question_sets'], 'readwrite');
            const store = tx.objectStore('question_sets');

            const set = {
                id: setData.id || QuizDB.generateUUID(),
                name: setData.name,
                description: setData.description || '',
                questionIds: setData.questionIds || [],
                enabled: setData.enabled !== undefined ? setData.enabled : true,
                created_at: setData.created_at || Date.now(),
                updated_at: setData.updated_at || Date.now()
            };

            const request = store.put(set);
            request.onsuccess = () => resolve(set);
            request.onerror = () => reject(request.error);
        };
    });
}

/**
 * サンプルデータをインポート
 */
async function importSampleData() {
    // 確認ダイアログ
    const confirmed = await QuizUI.showConfirm('サンプル問題（3問）を追加しますか？');
    if (!confirmed) return;

    try {
        QuizUI.showLoading('サンプルデータを読み込み中...');

        const response = await fetch('sample-data.json');
        if (!response.ok) {
            throw new Error('サンプルデータの取得に失敗しました');
        }

        const data = await response.json();
        const count = await importQuestions(data.questions || data, false);

        // 問題セットもあればインポート
        if (data.question_sets && data.question_sets.length > 0) {
            await importQuestionSets(data.question_sets);
        }

        QuizUI.hideLoading();
        QuizUI.showToast(`${count}件のサンプル問題を追加しました`, 'success');

        // 画面を更新
        if (typeof refreshManageScreen === 'function') {
            refreshManageScreen();
        }

    } catch (error) {
        QuizUI.hideLoading();
        console.error('サンプルデータのインポートエラー:', error);
        QuizUI.showToast('サンプルデータのインポートに失敗しました', 'error');
    }
}

// ==================== ユーティリティ関数 ====================

/**
 * BlobをBase64文字列に変換
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Base64文字列をBlobに変換
 */
function base64ToBlob(base64, mimeType) {
    const byteString = atob(base64.split(',')[1]);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
    }
    return new Blob([uint8Array], { type: mimeType });
}

/**
 * ファイルをテキストとして読み込む
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

/**
 * Blobをダウンロード
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * ファイル名用に日付をフォーマット
 */
function formatDateForFilename(date) {
    return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * 全データを削除
 */
async function clearAllData() {
    const confirmed = await QuizUI.showConfirm('全てのデータを削除しますか？この操作は取り消せません。');
    if (!confirmed) return;

    try {
        QuizUI.showLoading('データを削除中...');

        // 全問題を削除
        const questions = await QuizDB.getAllQuestions();
        for (const q of questions) {
            await QuizDB.deleteQuestion(q.id);
        }

        // 全統計を削除
        const stats = await QuizDB.getAllStats();
        for (const s of stats) {
            await QuizDB.deleteStats(s.question_id);
        }

        // 全問題セットを削除
        const sets = await QuizDB.getAllQuestionSets();
        for (const set of sets) {
            await QuizDB.deleteQuestionSet(set.id);
        }

        QuizUI.hideLoading();
        QuizUI.showToast('全データを削除しました', 'success');

        // 画面を更新
        if (typeof refreshManageScreen === 'function') {
            refreshManageScreen();
        }

    } catch (error) {
        QuizUI.hideLoading();
        console.error('削除エラー:', error);
        QuizUI.showToast('削除に失敗しました', 'error');
    }
}

// ==================== グローバルエクスポート ====================

window.QuizExport = {
    exportToZip,
    exportQuestionsJson,
    exportQuestionsJsonFull,
    exportProgressJson,
    importFromZip,
    importFromJson,
    importQuestions,
    importSampleData,
    clearAllData
};
