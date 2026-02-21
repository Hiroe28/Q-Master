/**
 * state.js - アプリケーション共有状態管理
 * 全モジュールで共有される状態オブジェクトを定義
 */

// ==================== 状態管理 ====================

const AppState = {
    // クイズ画面の状態
    quiz: {
        questions: [],          // 現在の出題リスト
        currentIndex: 0,        // 現在の問題インデックス
        answered: false,        // 回答済みフラグ
        selectedChoice: null,   // 選択した回答
        mode: 'random',         // 出題モード: random, tag, review
        format: 'multiple-choice', // 出題形式: multiple-choice, typing
        selectedTags: [],       // 選択されたタグ(複数)
        selectedSets: [],       // 選択されたセット(複数)
        seenQuestions: new Set(), // このセッションで統計更新した問題ID
        shuffleMode: false,     // 選択肢シャッフルモードON/OFF
        currentChoiceMapping: null // 現在の問題の選択肢マッピング {displayMapping, reverseMapping}
    },
    // 学習モード（フラッシュカード）の状態
    study: {
        questions: [],          // 学習する問題リスト
        currentIndex: 0,        // 現在の問題インデックス
        isFlipped: false,       // カードが裏返されているか
        knewCount: 0,           // 「知ってた」の数
        didntKnowCount: 0,      // 「知らなかった」の数
        selectedSets: [],       // 選択されたセット
        order: 'random'         // 出題順: random, new-first, review-first
    },
    // 管理画面の状態
    manage: {
        questions: [],          // 問題一覧
        editingId: null,        // 編集中の問題ID
        searchQuery: '',        // 検索クエリ
        filterTag: null,        // 絞り込みタグ
        filterSet: '',          // セット絞り込み: '' = 全て, 'no-set' = セット未所属
        filterMastery: '',      // 学習状態フィルター: '' = 全て, 'not-started' = 未学習, 'in-progress' = 学習中, 'completed' = 習得済み
        selectedQuestions: new Set() // 一括操作用に選択された問題ID
    },
    // セット管理画面の状態
    sets: {
        editingId: null,        // 編集中のセットID
        currentSet: null,       // 現在編集中のセット情報
        questionSearchQuery: '', // セット内問題の検索クエリ
        questionFilterTag: '',  // セット内問題のタグフィルター
        selectedQuestions: new Set() // セット内で選択された問題ID
    },
    // 統合モードの状態
    integrated: {
        flow: 'learn-quiz',     // 学習フロー: learn-quiz, learn-typing, quiz-typing, full
        phases: [],             // フェーズの配列 ['learn', 'quiz', 'typing']
        currentPhaseIndex: 0,   // 現在のフェーズインデックス (0: 学習, 1: 4択, 2: タイピング)
        currentQuestionIndex: 0, // 現在のフェーズ内での問題インデックス
        phaseQuestions: [],     // 現在のフェーズで出題する問題リスト
        allQuestions: [],       // 全問題（元データ）
        isFlipped: false,       // 学習フェーズでカードが裏返されているか
        phaseCompleted: false,  // 現在のフェーズが完了したか
        questionResults: new Map(), // 問題ごとの結果 questionId -> {quizCorrect: bool, typingCorrect: bool}
        failedQuestions: [],    // 失敗した問題のリスト
        retriedQuestions: new Set(), // リトライに回された問題のID
        progressSaved: false    // 途中退出時の進捗保存済みフラグ

    },
    // タグ入力ヘルパー
    tagInput: null
};

// グローバルにエクスポート
window.AppState = AppState;