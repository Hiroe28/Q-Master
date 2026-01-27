# Q-Master 完全設計書 v2.0


### データベース状態

- **DB_VERSION**: 2
- **ストア**: `questions`, `question_sets`, `assets`, `attempts`, `stats`
- **新規インデックス**: `questions.sets` (multiEntry)

### 技術スタック
- Vanilla JavaScript (ES6+)
- IndexedDB (version 2)
- Marked.js (Markdown)
- KaTeX (LaTeX)
- DOMPurify (XSS対策)
- JSZip

---

## 📁 フォルダ構成

### 現在の構成
```
quiz-app/
├── index.html                   # メインHTML
├── manifest.webmanifest
├── sw.js
├── sample-data.json             # サンプルデータ
├── README.md
├── css/
│   ├── base.css                 # リセット、CSS変数、基本設定
│   ├── layout.css               # ヘッダー、ナビ、メインコンテンツ、PWA対応
│   ├── components.css           # ボタン、フォーム、タグ、モーダル等
│   ├── quiz.css                 # クイズ画面、選択肢、解説、結果
│   ├── manage.css               # 管理画面、問題一覧、エディタ
│   ├── study.css                # 学習ダッシュボード、フラッシュカード
│   ├── sets.css                 # セット管理画面
│   └── ai-generator.css         # AI問題生成機能
├── js/
│   ├── db.js                    # データベース操作 (IndexedDB)
│   ├── ui.js                    # UI・レンダリング
│   ├── i18n.js                  # 多言語対応 (国際化)
│   ├── export-import.js         # インポート/エクスポート
│   ├── sm2.js                   # SM-2アルゴリズム
│   ├── state.js                 # 共有状態管理 (AppState)
│   ├── quiz.js                  # クイズ画面コア機能
│   ├── manage.js                # 管理画面・問題エディタ
│   ├── sets.js                  # セット管理・一括操作
│   ├── study.js                 # 学習
│   ├── typing.js                # タイピングモード
│   ├── ai-generator.js          # AI問題生成機能
│   └── app.js                   # 初期化・イベント設定
├── locales/                     # 多言語リソース
│   ├── ja.json                  # 日本語
│   ├── ja-kids.json             # 日本語（こども向け・ひらがな）
│   └── en.json                  # 英語
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

**CSS構成:**
| ファイル | 責務 |
|---------|------|
| base.css | リセット、CSS変数、基本設定、Markdownスタイル |
| layout.css | ヘッダー、ナビゲーション、メインコンテンツ、PWA対応 |
| components.css | ボタン、フォーム、タグ、バッジ、モーダル、トースト、ローディング |
| quiz.css | クイズ画面、選択肢、解説、結果画面、タイピングモード |
| manage.css | 管理画面、問題一覧、エディタ、タブ、プレビュー、インポート/エクスポート |
| study.css | 学習ダッシュボード、フラッシュカード、統合モード |
| sets.css | セット管理画面、セットエディタ |
| ai-generator.css | AI問題生成、APIキー設定、プレビューモーダル |

**JSモジュール構成:**
| ファイル | グローバル名 | 責務 |
|---------|-------------|------|
| state.js | AppState | アプリケーション共有状態 |
| i18n.js | I18n | 多言語対応（言語切替、翻訳取得） |
| quiz.js | QuizCore | クイズ開始、問題表示、4択解答 |
| manage.js | QuizManage | 問題一覧、エディタ、プレビュー |
| sets.js | QuizSets | セットCRUD、一括操作 |
| typing.js | QuizTyping | タイピング解答判定 |
| study.js | QuizIntegrated | 学習→4択→タイピング統合フロー |
| app.js | - | 初期化、イベントリスナー設定 |
| ai-generator.js | - | AI問題生成機能 |

---

## 💾 データ構造

### IndexedDB スキーマ

**データベース名**: `quiz_app_db`  
**バージョン**: 2（Phase 1実装時に更新）

#### 1. questions（既存 + 拡張）
```javascript
{
  id: 'uuid',                            // 主キー
  title: '問題タイトル',                 // 省略可
  body_md: '問題文(Markdown)',           // 必須
  choices: {                             // 必須
    A: '選択肢A',
    B: '選択肢B',
    C: '選択肢C',
    D: '選択肢D'
  },
  answer: 'A',                           // 必須: 'A'|'B'|'C'|'D'
  explanation_md: '解説(Markdown)',      // 省略可
  tags: ['タグ1', 'タグ2'],              // 省略可（検索用）
  asset_ids: ['asset-id-1', ...],        // 省略可（画像）
  created_at: 1234567890,
  updated_at: 1234567890,
  
  // ===== Phase 1: 問題セット機能 =====
  sets: ['set-id-1', 'set-id-2'],        // この問題が属するセット
  
  // ===== Phase 3: タイピングモード =====
  type: 'both',                          // 'multiple-choice' | 'typing' | 'both'
  typingAnswer: 'beautiful',             // 短答の正解（単語・数字）
  acceptableAnswers: ['beautiful', 'Beautiful'],  // 許容する別解
  caseSensitive: false,                  // 大文字小文字を区別するか
  strictMatch: true,                     // 完全一致（短答式は基本true）
  
  // ===== Phase 3: 語学学習モード =====
  isLanguageLearning: true,              // 語学学習問題か（選択式タイピング有効）
  audioEnabled: true,                    // 音声読み上げ有効
  audioLang: 'en-US',                    // 読み上げ言語

  // ===== 語学学習タイピング =====
  // isLanguageLearning: true の問題では「選択式タイピング」が有効
  // - 句読点（. , ? ! : ;）は固定表示（ユーザー入力不要）
  // - スペースで単語を分割し、各単語ごとに入力フィールドを表示
  // - アポストロフィー（' '）とハイフン（- 等）は単語内文字として扱う
  // - マスク表示: 文字数と同数の _ を表示（例: "don't" → "_____"）
  // - 判定: 大文字小文字区別なし、クォート・ダッシュ類を正規化して完全一致

  // ===== 選択肢シャッフル対応 =====
  shuffleReady: true                     // 選択肢シャッフルに対応している問題か
                                         // true: 解説で「A」「B」等のキー名を使わない問題
                                         // false/未設定: シャッフル非対応（既存問題）
}
```

**インデックス:**
- `created_at`
- `tags` (multiEntry)
- `sets` (multiEntry) ← Phase 1で追加

#### 2. question_sets（新規 - Phase 1）
```javascript
{
  id: 'uuid',                            // 主キー
  name: '英単語セット1',                 // 必須
  description: 'TOEIC頻出単語',          // 省略可
  questionIds: ['q-id-1', 'q-id-2'],    // このセットに含まれる問題ID
  enabled: true,                         // 学習対象に含めるか
  created_at: 1234567890,
  updated_at: 1234567890
}
```

**インデックス:**
- `enabled`
- `created_at`

#### 3. stats（既存）
```javascript
{
  question_id: 'uuid',                   // 主キー
  // SM-2アルゴリズム用
  easeFactor: 2.5,
  interval: 0,
  repetitions: 0,
  nextReviewDate: null,
  lastReviewDate: null,
  totalReviews: 0,
  // 互換性用
  wrong_count: 0,
  last_wrong_at: null,
  last_correct_at: null
}
```

#### 4. attempts（既存）
```javascript
{
  id: 'uuid',
  question_id: 'uuid',
  selected: 'A',
  correct: true,
  timestamp: 1234567890
}
```

#### 5. assets（既存）
```javascript
{
  id: 'uuid',
  mime: 'image/png',
  blob: Blob,
  filename: 'image.png',
  created_at: 1234567890
}
```

---

## 🌐 多言語対応（i18n）

### 概要
アプリケーションUIを複数言語で表示する機能。言語設定はLocalStorageに保存され、次回起動時に自動的に適用される。

### 対応言語
| コード | 言語名 | 説明 |
|--------|--------|------|
| ja | 日本語 | 標準日本語（デフォルト） |
| ja-kids | にほんご（こどもよう） | ひらがな・カタカナ主体の子供向け表示 |
| en | English | 英語 |

### 実装方式

#### 1. 翻訳リソース（locales/*.json）
```javascript
// locales/ja.json の例
{
  "nav.study": "学習",
  "nav.manage": "管理",
  "quiz.start": "クイズを開始",
  "manage.questionCount": "全{{count}}問",  // パラメータ置換
  ...
}
```

#### 2. HTML属性による静的翻訳
```html
<!-- data-i18n属性で翻訳キーを指定 -->
<span data-i18n="nav.study">学習</span>

<!-- placeholder翻訳 -->
<input data-i18n-placeholder="manage.search.placeholder" placeholder="検索...">

<!-- innerHTML翻訳（HTMLを含む場合） -->
<p data-i18n-html="data.help.backup">...</p>
```

#### 3. JavaScript動的翻訳
```javascript
// 基本的な翻訳
I18n.t('manage.empty')  // → "問題がありません"

// パラメータ付き翻訳
I18n.t('manage.questionCount', { count: 10 })  // → "全10問"
I18n.t('manage.status.daysLater', { days: 3 }) // → "3日後"
```

### I18nモジュール API

```javascript
const I18n = {
  currentLocale: 'ja',           // 現在の言語コード
  translations: {},              // 読み込まれた翻訳データ
  availableLocales: [...],       // 利用可能な言語リスト
  STORAGE_KEY: 'quiz-app-locale', // LocalStorageキー

  // 初期化（app.js起動時に呼び出し）
  async init(),

  // 言語切替
  async setLocale(locale),

  // 翻訳取得
  t(key, params = {}),

  // UI全体を更新（data-i18n属性を持つ要素）
  updateUI()
};
```

### 言語セレクター
ヘッダー右上に言語選択ドロップダウンを配置。選択した言語は即座に反映され、LocalStorageに保存される。

```html
<select id="language-select" class="language-select">
  <option value="ja">日本語</option>
  <option value="ja-kids">にほんご（こどもよう）</option>
  <option value="en">English</option>
</select>
```

### 翻訳キー命名規則
```
{画面}.{セクション}.{要素}

例:
- nav.study          → ナビゲーション > 学習
- quiz.start         → クイズ画面 > 開始ボタン
- manage.empty       → 管理画面 > 空状態メッセージ
- toast.questionSaved → トースト > 問題保存完了
- confirm.deleteQuestion → 確認ダイアログ > 問題削除
```

---

## 🔥 連続学習日数（ストリーク）機能

### 概要
学習の継続を促進するため、連続学習日数を表示する機能。学習画面のトップに表示され、モチベーション維持に役立つ。

### 表示要素
1. **週間カレンダー** - 過去7日間の学習状況
   - 学習した日: その日に回答した問題数を表示
   - 学習していない日: ×マーク
   - 今日（未学習）: 空の丸
2. **今日の学習数** - 今日学習した問題数
3. **現在のストリーク** - 連続学習日数
4. **自己ベスト** - 過去最長の連続学習日数（LocalStorageに保存）

### データ取得
`attemptsストア`のタイムスタンプから日別の学習状況を算出。

```javascript
// db.js
QuizDB.getLearningStreakStats()
// 返り値: { currentStreak, bestStreak, todayCount, weeklyData }
```

### UI構成（index.html）
```html
<div class="streak-card">
  <div class="streak-header">...</div>
  <div class="streak-calendar">
    <div id="streak-week" class="streak-week">...</div>
  </div>
  <div class="streak-today-count">...</div>
  <div class="streak-stats">
    <div class="streak-stat-item">現在の記録</div>
    <div class="streak-fire">🔥</div>
    <div class="streak-stat-item">自己ベスト</div>
  </div>
</div>
```

### ストリーク計算ロジック
1. 今日学習していれば今日からカウント開始
2. 今日学習していなければ昨日からカウント開始
3. 連続して学習した日数をカウント

### LocalStorage
- キー: `quiz-app-best-streak`
- 自己ベスト記録を永続化
