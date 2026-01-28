/**
 * SM-2 間隔反復アルゴリズム
 * SuperMemo 2 アルゴリズムの実装
 */

// ==================== SM-2 アルゴリズム ====================

/**
 * SM-2アルゴリズムで次回復習日を計算（カスタマイズ版）
 *
 * 変更点:
 * - 不正解時: リセットではなく1段階戻す（intervalを半分に）
 * - 完全習得: 90日 → 21日（約3週間）
 * - 復習間隔: 1日 → 3日 → 7日 → 14日 → 21日
 *
 * @param {Object} card - カード情報
 * @param {number} quality - 回答品質 (0-5)
 *   5: 完璧 (即答)
 *   4: 正解 (少し考えた)
 *   3: 正解 (かなり考えた)
 *   2: 不正解だが思い出せた
 *   1: 不正解
 *   0: 完全に忘れていた
 * @returns {Object} 更新されたカード情報
 */
function calculateSM2(card, quality) {
    // デフォルト値を設定
    let easeFactor = card.easeFactor || 2.5;
    let interval = card.interval || 0;
    let repetitions = card.repetitions || 0;

    // quality < 3 の場合は1段階戻す（リセットではない）
    if (quality < 3) {
        // repetitionsを1減らす（最小0）
        repetitions = Math.max(0, repetitions - 1);
        // intervalを半分に（最小1日）
        interval = Math.max(1, Math.floor(interval / 2));
    } else {
        // repetitionsを増加
        repetitions += 1;

        // intervalを計算（3週間でマスターを目指す）
        if (repetitions === 1) {
            interval = 1;  // 1日後
        } else if (repetitions === 2) {
            interval = 3;  // 3日後
        } else if (repetitions === 3) {
            interval = 7;  // 1週間後
        } else if (repetitions === 4) {
            interval = 14; // 2週間後
        } else {
            interval = 21; // 3週間後（完全習得）
        }

        // easeFactor を更新（参考値として保持）
        easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

        // easeFactor の最小値は 1.3
        if (easeFactor < 1.3) {
            easeFactor = 1.3;
        }
    }

    // 次回復習日を計算
    const nextReviewDate = Date.now() + interval * 24 * 60 * 60 * 1000;

    return {
        easeFactor: Math.round(easeFactor * 100) / 100, // 小数点2桁
        interval,
        repetitions,
        nextReviewDate
    };
}

/**
 * 復習が必要な問題を取得(SM-2版)
 * @param {Array} allStats - 全統計データ
 * @returns {Array} 復習が必要な問題IDのリスト
 */
function getQuestionsForReview(allStats) {
    const now = Date.now();
    
    // ★ 今日の終わりまでを基準にする
    const today = new Date(now);
    today.setHours(23, 59, 59, 999);
    const todayEnd = today.getTime();
    
    const reviewQuestions = allStats.filter(stat => {
        // 完全習得済みは除外
        if (getMasteryLevel(stat) === 'completed') return false;
        
        // nextReviewDateが設定されていない場合は復習不要
        if (!stat.nextReviewDate) return false;
        
        // 今日の終わりまでに復習日が来ている問題
        return stat.nextReviewDate <= todayEnd;
    });

    // 次回復習日が古い順(最優先)でソート
    reviewQuestions.sort((a, b) => a.nextReviewDate - b.nextReviewDate);

    return reviewQuestions;
}

/**
 * 今日の新規問題を取得（未学習問題）
 * @param {Array} allQuestions - 全問題
 * @param {Array} allStats - 全統計データ
 * @param {number} limit - 1日の新規問題数上限
 * @returns {Array} 新規問題のリスト
 */
function getNewQuestionsForToday(allQuestions, allStats, limit = 20) {
    const studiedIds = new Set(allStats.map(s => s.question_id));
    const newQuestions = allQuestions.filter(q => !studiedIds.has(q.id));
    
    // ランダムに選択
    const shuffled = [...newQuestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, limit);
}

// ==================== 使用例 ====================

/**
 * 今日の学習内容を取得
 * @param {Array} baseQuestions - ベースとなる問題配列(セット選択済み)。省略時は全問題を取得
 * @param {number} dailyLimit - 出題数上限（デフォルト: 10）
 * @param {number} newLimit - 新規問題の上限（デフォルト: dailyLimitの半分）
 */
async function getTodayStudyPlan(baseQuestions = null, dailyLimit = 10, newLimit = null) {
    const allQuestions = baseQuestions || await QuizDB.getAllQuestions();
    const allStats = await QuizDB.getAllStats();

    // 統計データをMapに変換(高速検索用)
    const statsMap = new Map();
    allStats.forEach(stat => {
        statsMap.set(stat.question_id, stat);
    });

    // ベース問題のIDセットを作成
    const baseQuestionIds = new Set(allQuestions.map(q => q.id));

    // 復習が必要な問題(完全習得済みは除外、ベース問題に含まれるもののみ)
    const allReviewQuestions = getQuestionsForReview(allStats);
    const reviewQuestions = allReviewQuestions.filter(stat => baseQuestionIds.has(stat.question_id));

    // 新規問題を取得(statsに記録がない問題)
    const newQuestions = allQuestions.filter(q => !statsMap.has(q.id));

    // ★ 新規問題の数を決定
    // newLimitが指定されていればそれを使用、そうでなければdailyLimitの半分を上限とする
    const maxNewQuestions = newLimit !== null ? newLimit : Math.ceil(dailyLimit / 2);
    const selectedNewQuestions = newQuestions.slice(0, Math.min(maxNewQuestions, newQuestions.length));

    return {
        review: reviewQuestions.map(s => s.question_id),
        new: selectedNewQuestions.map(q => q.id),
        total: reviewQuestions.length + selectedNewQuestions.length
    };
}

/**
 * 習得状況の統計を取得
 */
async function getMasteryStats() {
    const allQuestions = await QuizDB.getAllQuestions();
    const allStats = await QuizDB.getAllStats();
    
    // 統計データをMapに変換
    const statsMap = new Map();
    allStats.forEach(stat => {
        statsMap.set(stat.question_id, stat);
    });
    
    let completed = 0;  // 完全習得（90日以上）
    let mastered = 0;   // 習得済み（7-89日）
    let learning = 0;   // 学習中（1-6日）
    let newCount = 0;   // 未学習
    
    allQuestions.forEach(q => {
        const stats = statsMap.get(q.id);
        const level = getMasteryLevel(stats);
        
        if (level === 'completed') {
            completed++;
        } else if (level === 'mastered') {
            mastered++;
        } else if (level === 'learning') {
            learning++;
        } else {
            newCount++;
        }
    });
    
    return {
        completed,
        mastered,
        learning,
        new: newCount,
        total: allQuestions.length
    };
}

// ==================== マスタリーレベル判定 ====================

/**
 * 問題のマスタリーレベルを判定
 * @param {Object} stats - 統計データ
 * @returns {string} 'completed' | 'mastered' | 'learning' | 'new'
 */
function getMasteryLevel(stats) {
    if (!stats || stats.interval === undefined) {
        return 'new'; // 未学習
    }

    if (stats.interval >= 21) {
        return 'completed'; // 完全習得（21日以上 = 3週間）
    }

    if (stats.interval >= 7) {
        return 'mastered'; // 習得済み（7-20日）
    }

    if (stats.interval > 0) {
        return 'learning'; // 学習中（1-6日）
    }

    return 'new'; // 未学習
}

/**
 * マスタリーレベルの説明を取得（デバッグ用）
 * @param {Object} stats - 統計データ
 * @returns {string} レベルの説明
 */
function getMasteryLevelDescription(stats) {
    if (!stats) return '未学習';
    
    const level = getMasteryLevel(stats);
    const descriptions = {
        'completed': `完全習得 (${stats.interval}日間隔, ${stats.repetitions}回連続正解)`,
        'mastered': `習得済み (${stats.interval}日間隔, ${stats.repetitions}回連続正解)`,
        'learning': `学習中 (${stats.interval}日間隔, ${stats.repetitions}回連続正解)`,
        'new': '未学習'
    };
    
    return descriptions[level] || '未学習';
}

/**
 * 復習スケジュールの統計を取得
 */
async function getReviewScheduleStats() {
    const allQuestions = await QuizDB.getAllQuestions();
    const allStats = await QuizDB.getAllStats();
    
    // 統計データをMapに変換
    const statsMap = new Map();
    allStats.forEach(stat => {
        statsMap.set(stat.question_id, stat);
    });
    
    const now = Date.now();
    const today = new Date(now);
    today.setHours(23, 59, 59, 999); // 今日の終わり
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);
    
    const inWeek = new Date(today);
    inWeek.setDate(inWeek.getDate() + 7);
    
    let todayCount = 0;
    let tomorrowCount = 0;
    let within3DaysCount = 0;
    let withinWeekCount = 0;
    let masteredCount = 0;     // 8-20日
    let completedCount = 0;    // 21日以上
    let newCount = 0;
    
    allQuestions.forEach(q => {
        const stats = statsMap.get(q.id);
        
        // 未学習
        if (!stats || !stats.interval || stats.interval === 0) {
            newCount++;
            return;
        }
        
        // 完全習得(21日以上)
        if (stats.interval >= 21) {
            completedCount++;
            return;
        }

        // nextReviewDateがない場合は未学習扱い
        if (!stats.nextReviewDate) {
            newCount++;
            return;
        }

        const nextReview = stats.nextReviewDate;

        // 長期定着(8-20日) - 習熟度カテゴリとしてカウント
        if (stats.interval >= 8) {
            masteredCount++;
            // 今日復習が必要な場合はtodayCountにもカウント
            if (nextReview <= today.getTime()) {
                todayCount++;
            }
            return;
        }

        // 学習中(1-7日)はスケジュールで判定
        if (nextReview <= today.getTime()) {
            todayCount++;
        } else if (nextReview <= tomorrow.getTime()) {
            tomorrowCount++;
        } else if (nextReview <= in3Days.getTime()) {
            within3DaysCount++;
        } else if (nextReview <= inWeek.getTime()) {
            withinWeekCount++;
        }
    });
    
    return {
        today: todayCount,
        tomorrow: tomorrowCount,
        within3Days: within3DaysCount,
        withinWeek: withinWeekCount,
        mastered: masteredCount,
        completed: completedCount,
        new: newCount,
        total: allQuestions.length
    };
}

// ==================== エクスポート ====================

window.SM2 = {
    calculateSM2,
    getQuestionsForReview,
    getNewQuestionsForToday,
    getTodayStudyPlan,
    getMasteryStats,
    getMasteryLevel,
    getMasteryLevelDescription,
    getReviewScheduleStats
};