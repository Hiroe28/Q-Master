/**
 * db.js - IndexedDB操作モジュール
 * クイズアプリのデータ永続化を担当
 */

const DB_NAME = 'quiz_app_db';
const DB_VERSION = 3;

// データベース接続を保持
let db = null;

/**
 * UUIDを生成
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * データベースを初期化
 */
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDBの初期化に失敗しました:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDBに接続しました');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            const oldVersion = event.oldVersion;

            // questionsストア
            if (!database.objectStoreNames.contains('questions')) {
                const questionsStore = database.createObjectStore('questions', { keyPath: 'id' });
                questionsStore.createIndex('created_at', 'created_at', { unique: false });
                questionsStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                questionsStore.createIndex('sets', 'sets', { unique: false, multiEntry: true });
            } else if (oldVersion < 2) {
                // 既存DBの場合、setsインデックスを追加
                const transaction = event.target.transaction;
                const store = transaction.objectStore('questions');
                if (!store.indexNames.contains('sets')) {
                    store.createIndex('sets', 'sets', { unique: false, multiEntry: true });
                }
            }

            // question_setsストア(新規 - Phase 1)
            if (!database.objectStoreNames.contains('question_sets')) {
                const setsStore = database.createObjectStore('question_sets', { keyPath: 'id' });
                setsStore.createIndex('enabled', 'enabled', { unique: false });
                setsStore.createIndex('created_at', 'created_at', { unique: false });
            }

            // assetsストア(画像など)
            if (!database.objectStoreNames.contains('assets')) {
                const assetsStore = database.createObjectStore('assets', { keyPath: 'id' });
                assetsStore.createIndex('created_at', 'created_at', { unique: false });
            }

            // attemptsストア(解答履歴)
            if (!database.objectStoreNames.contains('attempts')) {
                const attemptsStore = database.createObjectStore('attempts', { keyPath: 'id' });
                attemptsStore.createIndex('question_id', 'question_id', { unique: false });
                attemptsStore.createIndex('timestamp', 'timestamp', { unique: false });
            }

            // statsストア(統計情報)
            if (!database.objectStoreNames.contains('stats')) {
                const statsStore = database.createObjectStore('stats', { keyPath: 'question_id' });
                statsStore.createIndex('wrong_count', 'wrong_count', { unique: false });
                statsStore.createIndex('last_wrong_at', 'last_wrong_at', { unique: false });
            }

            // pending_questionsストア(バックグラウンド生成された問題の一時保存)
            if (!database.objectStoreNames.contains('pending_questions')) {
                const pendingStore = database.createObjectStore('pending_questions', { keyPath: 'id' });
                pendingStore.createIndex('created_at', 'created_at', { unique: false });
                pendingStore.createIndex('status', 'status', { unique: false });
            }

            // notificationsストア(通知管理)
            if (!database.objectStoreNames.contains('notifications')) {
                const notificationsStore = database.createObjectStore('notifications', { keyPath: 'id' });
                notificationsStore.createIndex('created_at', 'created_at', { unique: false });
                notificationsStore.createIndex('read', 'read', { unique: false });
            }

            console.log('データベーススキーマを作成しました');
        };
    });
}

/**
 * トランザクションを取得
 */
function getTransaction(storeNames, mode = 'readonly') {
    if (!db) {
        throw new Error('データベースが初期化されていません');
    }
    return db.transaction(storeNames, mode);
}

/**
 * オブジェクトストアを取得
 */
function getStore(storeName, mode = 'readonly') {
    const tx = getTransaction(storeName, mode);
    return tx.objectStore(storeName);
}

// ==================== Questions ====================

/**
 * 問題を追加
 */
async function addQuestion(questionData) {
    return new Promise((resolve, reject) => {
        const store = getStore('questions', 'readwrite');
        const question = {
            id: generateUUID(),
            title: questionData.title || '',
            body_md: questionData.body_md || '',
            choices: questionData.choices || { A: '', B: '', C: '', D: '' },
            answer: questionData.answer || 'A',
            explanation_md: questionData.explanation_md || '',
            tags: questionData.tags || [],
            asset_ids: questionData.asset_ids || [],
            // Phase 1: 問題セット機能
            sets: questionData.sets || [],
            // Phase 3: タイピングモード
            type: questionData.type || 'multiple-choice',
            typingAnswer: questionData.typingAnswer || '',
            acceptableAnswers: questionData.acceptableAnswers || [],
            caseSensitive: questionData.caseSensitive !== undefined ? questionData.caseSensitive : false,
            strictMatch: questionData.strictMatch !== undefined ? questionData.strictMatch : true,
            // Phase 3: 語学学習モード
            isLanguageLearning: questionData.isLanguageLearning || false,
            audioEnabled: questionData.audioEnabled || false,
            audioLang: questionData.audioLang || 'en-US',
            // 選択肢シャッフル対応
            shuffleReady: questionData.shuffleReady || false,
            created_at: Date.now(),
            updated_at: Date.now()
        };

        const request = store.add(question);
        request.onsuccess = () => resolve(question);
        request.onerror = () => reject(request.error);
    });
}

/**
 * IDを指定して問題を追加(インポート用)
 * IDが指定されていない場合は自動生成
 */
async function addQuestionWithId(questionData) {
    return new Promise((resolve, reject) => {
        const store = getStore('questions', 'readwrite');
        const question = {
            id: questionData.id || generateUUID(),
            title: questionData.title || '',
            body_md: questionData.body_md || '',
            choices: questionData.choices || { A: '', B: '', C: '', D: '' },
            answer: questionData.answer || 'A',
            explanation_md: questionData.explanation_md || '',
            tags: questionData.tags || [],
            asset_ids: questionData.asset_ids || [],
            // Phase 1: 問題セット機能
            sets: questionData.sets || [],
            // Phase 3: タイピングモード
            type: questionData.type || 'multiple-choice',
            typingAnswer: questionData.typingAnswer || '',
            acceptableAnswers: questionData.acceptableAnswers || [],
            caseSensitive: questionData.caseSensitive !== undefined ? questionData.caseSensitive : false,
            strictMatch: questionData.strictMatch !== undefined ? questionData.strictMatch : true,
            // Phase 3: 語学学習モード
            isLanguageLearning: questionData.isLanguageLearning || false,
            audioEnabled: questionData.audioEnabled || false,
            audioLang: questionData.audioLang || 'en-US',
            // 選択肢シャッフル対応
            shuffleReady: questionData.shuffleReady || false,
            created_at: questionData.created_at || Date.now(),
            updated_at: questionData.updated_at || Date.now()
        };

        const request = store.put(question); // put を使うと既存があれば上書き
        request.onsuccess = () => resolve(question);
        request.onerror = () => reject(request.error);
    });
}

/**
 * アセットをIDを指定して追加(インポート用)
 */
async function addAssetWithId(id, blob, filename, created_at) {
    return new Promise((resolve, reject) => {
        const store = getStore('assets', 'readwrite');
        const asset = {
            id: id || generateUUID(),
            mime: blob.type,
            blob: blob,
            filename: filename || 'image',
            created_at: created_at || Date.now()
        };

        const request = store.put(asset);
        request.onsuccess = () => resolve(asset);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 統計データを直接追加(インポート用)
 */
async function addStatsData(statsData) {
    return new Promise((resolve, reject) => {
        const store = getStore('stats', 'readwrite');
        const request = store.put(statsData);
        request.onsuccess = () => resolve(statsData);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 解答履歴を直接追加(インポート用)
 */
async function addAttemptData(attemptData) {
    return new Promise((resolve, reject) => {
        const store = getStore('attempts', 'readwrite');
        const request = store.put(attemptData);
        request.onsuccess = () => resolve(attemptData);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 問題を更新
 */
async function updateQuestion(id, questionData) {
    return new Promise((resolve, reject) => {
        const store = getStore('questions', 'readwrite');
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
            const existing = getRequest.result;
            if (!existing) {
                reject(new Error('問題が見つかりません'));
                return;
            }

            const updated = {
                ...existing,
                ...questionData,
                id: id, // IDは変更不可
                updated_at: Date.now()
            };

            const putRequest = store.put(updated);
            putRequest.onsuccess = () => resolve(updated);
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * 問題を削除
 */
async function deleteQuestion(id) {
    return new Promise(async (resolve, reject) => {
        try {
            // まず関連するアセットを削除
            const question = await getQuestion(id);
            if (question && question.asset_ids) {
                for (const assetId of question.asset_ids) {
                    await deleteAsset(assetId);
                }
            }

            // 問題を削除
            const store = getStore('questions', 'readwrite');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);

            // 関連する統計も削除
            await deleteStats(id);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * 問題を取得
 */
async function getQuestion(id) {
    return new Promise((resolve, reject) => {
        const store = getStore('questions');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 全問題を取得
 */
async function getAllQuestions() {
    return new Promise((resolve, reject) => {
        const store = getStore('questions');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * タグで問題を検索
 */
async function getQuestionsByTag(tag) {
    return new Promise((resolve, reject) => {
        const store = getStore('questions');
        const index = store.index('tags');
        const request = index.getAll(tag);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 全タグを取得
 */
async function getAllTags() {
    const questions = await getAllQuestions();
    const tagSet = new Set();
    questions.forEach(q => {
        if (q.tags) {
            q.tags.forEach(tag => tagSet.add(tag));
        }
    });
    return Array.from(tagSet).sort();
}

// ==================== Assets ====================

/**
 * アセット(画像など)を追加
 */
async function addAsset(blob, filename) {
    return new Promise((resolve, reject) => {
        const store = getStore('assets', 'readwrite');
        const asset = {
            id: generateUUID(),
            mime: blob.type,
            blob: blob,
            filename: filename || 'image',
            created_at: Date.now()
        };

        const request = store.add(asset);
        request.onsuccess = () => resolve(asset);
        request.onerror = () => reject(request.error);
    });
}

/**
 * アセットを取得
 */
async function getAsset(id) {
    return new Promise((resolve, reject) => {
        const store = getStore('assets');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * アセットを削除
 */
async function deleteAsset(id) {
    return new Promise((resolve, reject) => {
        const store = getStore('assets', 'readwrite');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * 全アセットを取得
 */
async function getAllAssets() {
    return new Promise((resolve, reject) => {
        const store = getStore('assets');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// ==================== Attempts ====================

/**
 * 解答を記録
 */
async function addAttempt(questionId, selected, correct) {
    return new Promise((resolve, reject) => {
        const store = getStore('attempts', 'readwrite');
        const attempt = {
            id: generateUUID(),
            question_id: questionId,
            selected: selected,
            correct: correct,
            timestamp: Date.now()
        };

        const request = store.add(attempt);
        request.onsuccess = () => resolve(attempt);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 問題の解答履歴を取得
 */
async function getAttemptsByQuestion(questionId) {
    return new Promise((resolve, reject) => {
        const store = getStore('attempts');
        const index = store.index('question_id');
        const request = index.getAll(questionId);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 全解答履歴を取得
 */
async function getAllAttempts() {
    return new Promise((resolve, reject) => {
        const store = getStore('attempts');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// ==================== Stats ====================

/**
 * 統計を更新(解答後に呼ぶ) - SM-2対応版
 * @param {string} questionId - 問題ID
 * @param {boolean} correct - 正解かどうか
 */
async function updateStats(questionId, correct) {
    return new Promise((resolve, reject) => {
        const store = getStore('stats', 'readwrite');
        const getRequest = store.get(questionId);

        getRequest.onsuccess = () => {
            let stats = getRequest.result || {
                question_id: questionId,
                // SM-2用フィールド
                easeFactor: 2.5,
                interval: 0,
                repetitions: 0,
                nextReviewDate: null,
                totalReviews: 0,
                lastReviewDate: null,
                // 既存フィールド(互換性のため残す)
                wrong_count: 0,
                last_wrong_at: null,
                last_correct_at: null
            };

            // SM-2での品質判定: 正解なら4、不正解なら1
            const quality = correct ? 4 : 1;

            // SM-2アルゴリズムで次回復習日を計算
            const sm2Result = SM2.calculateSM2(stats, quality);

            // 統計を更新
            stats = {
                ...stats,
                ...sm2Result,
                lastReviewDate: Date.now(),
                totalReviews: (stats.totalReviews || 0) + 1,
                // 既存の統計も更新(互換性のため)
                wrong_count: correct ? stats.wrong_count || 0 : (stats.wrong_count || 0) + 1,
                last_correct_at: correct ? Date.now() : stats.last_correct_at,
                last_wrong_at: correct ? stats.last_wrong_at : Date.now()
            };

            // デバッグ用ログ
            console.log('📊 統計更新:', {
                questionId: questionId.substring(0, 8) + '...',
                correct,
                repetitions: stats.repetitions,
                interval: stats.interval,
                nextReview: new Date(stats.nextReviewDate).toLocaleString('ja-JP'),
                masteryLevel: SM2.getMasteryLevelDescription(stats)
            });

            const putRequest = store.put(stats);
            putRequest.onsuccess = () => resolve(stats);
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * 統計をリセット(復習完了時など)
 */
async function resetStats(questionId) {
    return new Promise((resolve, reject) => {
        const store = getStore('stats', 'readwrite');
        const stats = {
            question_id: questionId,

            // SM-2用の新フィールド
            easeFactor: 2.5,        // 難易度係数(デフォルト2.5)
            interval: 0,            // 次回までの日数
            repetitions: 0,         // 連続正解回数
            nextReviewDate: null,   // 次回復習日(タイムスタンプ)
            lastReviewDate: null,   // 最終復習日
            totalReviews: 0,        // 総復習回数

            // 既存フィールド(互換性のため残す)
            wrong_count: 0,
            last_wrong_at: null,
            last_correct_at: Date.now()
        };

        const request = store.put(stats);
        request.onsuccess = () => resolve(stats);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 問題を復習リストに追加(手動マーク用)
 */
async function markForReview(questionId) {
    return new Promise((resolve, reject) => {
        const store = getStore('stats', 'readwrite');
        const getRequest = store.get(questionId);

        getRequest.onsuccess = () => {
            let stats = getRequest.result || {
                question_id: questionId,
                easeFactor: 2.5,
                interval: 0,
                repetitions: 0,
                nextReviewDate: null,
                totalReviews: 0,
                lastReviewDate: null,
                wrong_count: 0,
                last_wrong_at: null,
                last_correct_at: null
            };

            // 復習リストに追加(wrong_countを増やす)
            stats.wrong_count = (stats.wrong_count || 0) + 1;
            stats.last_wrong_at = Date.now();

            const putRequest = store.put(stats);
            putRequest.onsuccess = () => resolve(stats);
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * 問題を手動で完全習得済みにする
 */
async function markAsCompleted(questionId) {
    return new Promise((resolve, reject) => {
        const store = getStore('stats', 'readwrite');
        const getRequest = store.get(questionId);

        getRequest.onsuccess = () => {
            let stats = getRequest.result || {
                question_id: questionId,
                easeFactor: 2.5,
                interval: 0,
                repetitions: 0,
                nextReviewDate: null,
                totalReviews: 0,
                lastReviewDate: null,
                wrong_count: 0,
                last_wrong_at: null,
                last_correct_at: null
            };

            // intervalを21日に設定して完全習得状態にする
            stats.interval = 21;
            stats.nextReviewDate = Date.now() + 21 * 24 * 60 * 60 * 1000;

            console.log('✅ 手動で完全習得済みに設定:', {
                questionId: questionId.substring(0, 8) + '...',
                interval: stats.interval,
                masteryLevel: SM2.getMasteryLevelDescription(stats)
            });

            const putRequest = store.put(stats);
            putRequest.onsuccess = () => resolve(stats);
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * 完全習得済みの問題を再学習対象に戻す
 */
async function restartLearning(questionId) {
    return new Promise((resolve, reject) => {
        const store = getStore('stats', 'readwrite');
        const stats = {
            question_id: questionId,
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReviewDate: Date.now(), // すぐに復習対象
            lastReviewDate: null,
            totalReviews: 0,
            wrong_count: 0,
            last_wrong_at: null,
            last_correct_at: null
        };

        console.log('🔄 再学習対象に設定:', {
            questionId: questionId.substring(0, 8) + '...',
            masteryLevel: SM2.getMasteryLevelDescription(stats)
        });

        const request = store.put(stats);
        request.onsuccess = () => resolve(stats);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 問題の統計を取得
 */
async function getStats(questionId) {
    return new Promise((resolve, reject) => {
        const store = getStore('stats');
        const request = store.get(questionId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 全統計を取得
 */
async function getAllStats() {
    return new Promise((resolve, reject) => {
        const store = getStore('stats');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 統計を削除
 */
async function deleteStats(questionId) {
    return new Promise((resolve, reject) => {
        const store = getStore('stats', 'readwrite');
        const request = store.delete(questionId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * 復習が必要な問題を取得
 * 条件: wrong_count > 0 かつ (last_correct_at が null または last_correct_at < last_wrong_at)
 */
async function getReviewQuestions() {
    const allStats = await getAllStats();
    const reviewStats = allStats.filter(s => {
        if (s.wrong_count <= 0) return false;
        if (!s.last_correct_at) return true;
        if (!s.last_wrong_at) return false;
        return s.last_correct_at < s.last_wrong_at;
    });

    // 間違い回数が多い順にソート
    reviewStats.sort((a, b) => b.wrong_count - a.wrong_count);

    const questions = [];
    for (const stat of reviewStats) {
        const question = await getQuestion(stat.question_id);
        if (question) {
            questions.push({ ...question, stats: stat });
        }
    }

    return questions;
}

/**
 * 未解答の問題を取得
 * 条件: statsに記録がない問題 = 一度も解いたことがない問題
 */
async function getUnansweredQuestions() {
    const allQuestions = await getAllQuestions();
    const allStats = await getAllStats();
    
    // statsに記録があるquestion_idのSetを作成
    const answeredQuestionIds = new Set(allStats.map(s => s.question_id));
    
    // statsに記録がない問題のみを抽出
    const unansweredQuestions = allQuestions.filter(q => !answeredQuestionIds.has(q.id));
    
    return unansweredQuestions;
}

// ==================== Question Sets ====================

/**
 * 問題セットを作成
 */
async function createQuestionSet(setData) {
    return new Promise((resolve, reject) => {
        const store = getStore('question_sets', 'readwrite');
        const set = {
            id: generateUUID(),
            name: setData.name,
            description: setData.description || '',
            questionIds: setData.questionIds || [],
            enabled: setData.enabled !== undefined ? setData.enabled : true,
            created_at: Date.now(),
            updated_at: Date.now()
        };

        const request = store.add(set);
        request.onsuccess = () => resolve(set);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 全問題セットを取得
 */
async function getAllQuestionSets() {
    return new Promise((resolve, reject) => {
        const store = getStore('question_sets');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 問題セットを取得
 */
async function getQuestionSet(setId) {
    return new Promise((resolve, reject) => {
        const store = getStore('question_sets');
        const request = store.get(setId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 問題セットを更新
 */
async function updateQuestionSet(setId, updates) {
    return new Promise((resolve, reject) => {
        const store = getStore('question_sets', 'readwrite');
        const getRequest = store.get(setId);

        getRequest.onsuccess = () => {
            const existing = getRequest.result;
            if (!existing) {
                reject(new Error('セットが見つかりません'));
                return;
            }

            const updated = {
                ...existing,
                ...updates,
                id: setId,
                updated_at: Date.now()
            };

            const putRequest = store.put(updated);
            putRequest.onsuccess = () => resolve(updated);
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * 問題セットを削除
 */
async function deleteQuestionSet(setId) {
    return new Promise(async (resolve, reject) => {
        try {
            // 全問題のsetsフィールドからこのセットIDを削除
            const set = await getQuestionSet(setId);
            if (set && set.questionIds) {
                for (const qId of set.questionIds) {
                    await removeQuestionFromSet(qId, setId);
                }
            }

            const store = getStore('question_sets', 'readwrite');
            const request = store.delete(setId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * 問題をセットに追加
 */
async function addQuestionToSet(questionId, setId) {
    // 問題のsetsフィールドに追加
    const question = await getQuestion(questionId);
    if (question) {
        const sets = question.sets || [];
        if (!sets.includes(setId)) {
            sets.push(setId);
            await updateQuestion(questionId, { sets });
        }
    }

    // セットのquestionIdsに追加
    const set = await getQuestionSet(setId);
    if (set) {
        const questionIds = set.questionIds || [];
        if (!questionIds.includes(questionId)) {
            questionIds.push(questionId);
            await updateQuestionSet(setId, { questionIds });
        }
    }
}

/**
 * 問題をセットから削除
 */
async function removeQuestionFromSet(questionId, setId) {
    // 問題のsetsフィールドから削除
    const question = await getQuestion(questionId);
    if (question && question.sets) {
        const sets = question.sets.filter(id => id !== setId);
        await updateQuestion(questionId, { sets });
    }

    // セットのquestionIdsから削除
    const set = await getQuestionSet(setId);
    if (set && set.questionIds) {
        const questionIds = set.questionIds.filter(id => id !== questionId);
        await updateQuestionSet(setId, { questionIds });
    }
}

/**
 * 複数の問題をセットに追加
 */
async function addMultipleQuestionsToSet(questionIds, setId) {
    for (const qId of questionIds) {
        await addQuestionToSet(qId, setId);
    }
}

/**
 * 複数の問題をセットから削除
 */
async function removeMultipleQuestionsFromSet(questionIds, setId) {
    for (const qId of questionIds) {
        await removeQuestionFromSet(qId, setId);
    }
}

/**
 * セットに含まれる問題を取得
 */
async function getQuestionsBySet(setId) {
    const set = await getQuestionSet(setId);
    if (!set || !set.questionIds) return [];

    const questions = [];
    for (const qId of set.questionIds) {
        const q = await getQuestion(qId);
        if (q) questions.push(q);
    }
    return questions;
}

/**
 * 有効なセットを取得
 */
async function getEnabledSets() {
    const allSets = await getAllQuestionSets();
    return allSets.filter(s => s.enabled);
}

/**
 * 有効なセットに含まれる問題を取得
 */
async function getQuestionsByEnabledSets() {
    const enabledSets = await getEnabledSets();
    const questionIdSet = new Set();

    for (const set of enabledSets) {
        if (set.questionIds) {
            set.questionIds.forEach(id => questionIdSet.add(id));
        }
    }

    const questions = [];
    for (const qId of questionIdSet) {
        const q = await getQuestion(qId);
        if (q) questions.push(q);
    }
    return questions;
}

// ==================== 学習ストリーク統計 ====================

const STREAK_STORAGE_KEY = 'quiz-app-best-streak';

/**
 * 指定日の開始・終了タイムスタンプを取得
 * @param {Date} date - 日付
 * @returns {Object} { start, end }
 */
function getDayRange(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start: start.getTime(), end: end.getTime() };
}

/**
 * 日付をローカル時刻でYYYY-MM-DD形式の文字列に変換
 * @param {Date} date - 日付オブジェクト
 * @returns {string} YYYY-MM-DD形式の文字列
 */
function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 日別の学習問題数を取得（過去n日間）
 * @param {number} days - 取得する日数（デフォルト: 7）
 * @returns {Promise<Map<string, number>>} 日付文字列 -> 問題数のMap
 */
async function getDailyStudyCounts(days = 7) {
    const attempts = await getAllAttempts();
    const dailyCounts = new Map();

    // 今日から過去n日間の日付を初期化（ローカル時刻）
    const today = new Date();
    for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = formatLocalDate(date); // ローカル時刻でYYYY-MM-DD形式
        dailyCounts.set(dateStr, 0);
    }

    // 各attemptを日付ごとにカウント（ローカル時刻で判定）
    for (const attempt of attempts) {
        const attemptDate = new Date(attempt.timestamp);
        const dateStr = formatLocalDate(attemptDate); // ローカル時刻でYYYY-MM-DD形式
        if (dailyCounts.has(dateStr)) {
            dailyCounts.set(dateStr, dailyCounts.get(dateStr) + 1);
        }
    }

    return dailyCounts;
}

/**
 * 今日の学習問題数を取得（ユニーク問題数）
 * @returns {Promise<number>}
 */
async function getTodayStudyCount() {
    const attempts = await getAllAttempts();
    const today = new Date();
    const { start, end } = getDayRange(today);

    // 今日のユニーク問題をカウント
    const todayQuestions = new Set();
    for (const attempt of attempts) {
        if (attempt.timestamp >= start && attempt.timestamp <= end) {
            todayQuestions.add(attempt.question_id);
        }
    }

    return todayQuestions.size;
}

/**
 * 連続学習日数（ストリーク）を計算
 * @returns {Promise<number>}
 */
async function calculateStreak() {
    const attempts = await getAllAttempts();

    // 日別に学習があったかをチェック（ローカル時刻で判定）
    const studyDays = new Set();
    for (const attempt of attempts) {
        const dateStr = formatLocalDate(new Date(attempt.timestamp));
        studyDays.add(dateStr);
    }

    if (studyDays.size === 0) return 0;

    // 今日からさかのぼって連続日数を計算（ローカル時刻）
    let streak = 0;
    const today = new Date();
    const todayStr = formatLocalDate(today);

    // 今日学習していない場合は、昨日から計算開始
    let checkDate = new Date(today);
    if (!studyDays.has(todayStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
    }

    // 連続して学習した日数をカウント
    while (true) {
        const dateStr = formatLocalDate(checkDate);
        if (studyDays.has(dateStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }

    return streak;
}

/**
 * 自己ベストストリークを取得
 * @returns {number}
 */
function getBestStreak() {
    const stored = localStorage.getItem(STREAK_STORAGE_KEY);
    return stored ? parseInt(stored, 10) : 0;
}

/**
 * 自己ベストストリークを更新
 * @param {number} streak - 現在のストリーク
 */
function updateBestStreak(streak) {
    const currentBest = getBestStreak();
    if (streak > currentBest) {
        localStorage.setItem(STREAK_STORAGE_KEY, streak.toString());
    }
}

/**
 * 学習ストリーク統計を取得
 * @returns {Promise<Object>} { currentStreak, bestStreak, todayCount, weeklyData }
 */
async function getLearningStreakStats() {
    const currentStreak = await calculateStreak();
    const bestStreak = getBestStreak();
    const todayCount = await getTodayStudyCount();
    const dailyCounts = await getDailyStudyCounts(7);

    // 自己ベストを更新
    updateBestStreak(currentStreak);

    // 週間データを配列に変換（新しい日付から古い日付の順）
    const weeklyData = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = formatLocalDate(date); // ローカル時刻でYYYY-MM-DD形式
        const dayOfWeek = date.getDay(); // 0=日, 1=月, ..., 6=土
        weeklyData.push({
            date: dateStr,
            dayOfWeek,
            count: dailyCounts.get(dateStr) || 0,
            isToday: i === 0
        });
    }

    return {
        currentStreak,
        bestStreak: Math.max(bestStreak, currentStreak),
        todayCount,
        weeklyData
    };
}

// ==================== Pending Questions (バックグラウンド生成) ====================

/**
 * バックグラウンド生成リクエストを追加
 * @param {Object} requestData - 生成リクエストデータ
 */
async function addPendingRequest(requestData) {
    return new Promise((resolve, reject) => {
        const store = getStore('pending_questions', 'readwrite');
        const request = {
            id: generateUUID(),
            status: 'pending', // pending, generating, completed, error
            questions: [],
            targetSetId: requestData.targetSetId || null,
            newSetName: requestData.newSetName || null,
            error: null,
            created_at: Date.now(),
            completed_at: null
        };

        const dbRequest = store.add(request);
        dbRequest.onsuccess = () => resolve(request);
        dbRequest.onerror = () => reject(dbRequest.error);
    });
}

/**
 * バックグラウンド生成リクエストを更新
 */
async function updatePendingRequest(id, updates) {
    return new Promise((resolve, reject) => {
        const store = getStore('pending_questions', 'readwrite');
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
            const existing = getRequest.result;
            if (!existing) {
                reject(new Error('リクエストが見つかりません'));
                return;
            }

            const updated = { ...existing, ...updates };
            const putRequest = store.put(updated);
            putRequest.onsuccess = () => resolve(updated);
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * バックグラウンド生成リクエストを取得
 */
async function getPendingRequest(id) {
    return new Promise((resolve, reject) => {
        const store = getStore('pending_questions');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 全バックグラウンド生成リクエストを取得
 */
async function getAllPendingRequests() {
    return new Promise((resolve, reject) => {
        const store = getStore('pending_questions');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 完了したバックグラウンド生成リクエストを取得
 */
async function getCompletedPendingRequests() {
    const all = await getAllPendingRequests();
    return all.filter(r => r.status === 'completed');
}

/**
 * バックグラウンド生成リクエストを削除
 */
async function deletePendingRequest(id) {
    return new Promise((resolve, reject) => {
        const store = getStore('pending_questions', 'readwrite');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ==================== Notifications (通知管理) ====================

/**
 * 通知を追加
 * @param {Object} notificationData - 通知データ
 */
async function addNotification(notificationData) {
    return new Promise((resolve, reject) => {
        const store = getStore('notifications', 'readwrite');
        const notification = {
            id: generateUUID(),
            type: notificationData.type || 'info', // ai_generation, info, error
            title: notificationData.title || '',
            message: notificationData.message || '',
            data: notificationData.data || null, // 関連データ（pendingRequestIdなど）
            read: false,
            created_at: Date.now()
        };

        const request = store.add(notification);
        request.onsuccess = () => resolve(notification);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 通知を既読にする
 */
async function markNotificationAsRead(id) {
    return new Promise((resolve, reject) => {
        const store = getStore('notifications', 'readwrite');
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
            const notification = getRequest.result;
            if (!notification) {
                reject(new Error('通知が見つかりません'));
                return;
            }

            notification.read = true;
            const putRequest = store.put(notification);
            putRequest.onsuccess = () => resolve(notification);
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * 全通知を既読にする
 */
async function markAllNotificationsAsRead() {
    const notifications = await getAllNotifications();
    for (const notification of notifications) {
        if (!notification.read) {
            await markNotificationAsRead(notification.id);
        }
    }
}

/**
 * 通知を取得
 */
async function getNotification(id) {
    return new Promise((resolve, reject) => {
        const store = getStore('notifications');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 全通知を取得（新しい順）
 */
async function getAllNotifications() {
    return new Promise((resolve, reject) => {
        const store = getStore('notifications');
        const request = store.getAll();
        request.onsuccess = () => {
            const notifications = request.result || [];
            // 新しい順にソート
            notifications.sort((a, b) => b.created_at - a.created_at);
            resolve(notifications);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * 未読通知の数を取得
 */
async function getUnreadNotificationCount() {
    const notifications = await getAllNotifications();
    return notifications.filter(n => !n.read).length;
}

/**
 * 通知を削除
 */
async function deleteNotification(id) {
    return new Promise((resolve, reject) => {
        const store = getStore('notifications', 'readwrite');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * 古い通知を削除（30日以上前）
 */
async function deleteOldNotifications() {
    const notifications = await getAllNotifications();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const notification of notifications) {
        if (notification.created_at < thirtyDaysAgo) {
            await deleteNotification(notification.id);
        }
    }
}

// ==================== エクスポート ====================

// グローバルにエクスポート
window.QuizDB = {
    initDB,
    generateUUID,
    // Questions
    addQuestion,
    addQuestionWithId,
    updateQuestion,
    deleteQuestion,
    getQuestion,
    getAllQuestions,
    getQuestionsByTag,
    getAllTags,
    // Assets
    addAsset,
    addAssetWithId,
    getAsset,
    deleteAsset,
    getAllAssets,
    // Attempts
    addAttempt,
    addAttemptData,
    getAttemptsByQuestion,
    getAllAttempts,
    // Stats
    updateStats,
    resetStats,
    getStats,
    getAllStats,
    deleteStats,
    addStatsData,
    getUnansweredQuestions,
    markAsCompleted,
    restartLearning,
    // Question Sets (Phase 1)
    createQuestionSet,
    getAllQuestionSets,
    getQuestionSet,
    updateQuestionSet,
    deleteQuestionSet,
    addQuestionToSet,
    removeQuestionFromSet,
    addMultipleQuestionsToSet,
    removeMultipleQuestionsFromSet,
    getQuestionsBySet,
    getEnabledSets,
    getQuestionsByEnabledSets,
    // Learning Streak Stats
    getLearningStreakStats,
    // Pending Questions (バックグラウンド生成)
    addPendingRequest,
    updatePendingRequest,
    getPendingRequest,
    getAllPendingRequests,
    getCompletedPendingRequests,
    deletePendingRequest,
    // Notifications (通知管理)
    addNotification,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    getNotification,
    getAllNotifications,
    getUnreadNotificationCount,
    deleteNotification,
    deleteOldNotifications
};