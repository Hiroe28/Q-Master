# Q-Master 完全設計書 v3.0


### データベース状態

- **DB_VERSION**: 5
- **ストア**: `questions`, `question_sets`, `assets`, `attempts`, `stats`, `pending_questions`, `notifications`, `prompt_templates`
- **新規インデックス**: `questions.sets` (multiEntry)

### 技術スタック
- Vanilla JavaScript (ES6+)
- IndexedDB (version 5)
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
│   ├── ai-generator.css         # AI問題生成機能
│   └── notifications.css        # 通知システム
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
│   ├── notifications.js         # 通知システム
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
| notifications.css | 通知ベル、通知パネル、バッジ |

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
| ai-generator.js | AIGenerator | AI問題生成機能 |
| notifications.js | NotificationUI | 通知システム |

---

## 💾 データ構造

### IndexedDB スキーマ

**データベース名**: `quiz_app_db`
**バージョン**: 5

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
                                         // true: マーカー方式または従来方式でシャッフル対応
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

## ⏩ 先取り学習機能

### 概要
「今日の学習」モードにおいて、今日の復習対象が少ない場合に、明日以降に予定されている復習問題を先取りして学習できる機能。学習完了時期を早めたい場合に有効。

### 有効条件
- 出題モードが「今日の学習」の場合のみ利用可能
- 「先取り学習を含める」チェックボックスをONにする
- 今日の復習対象問題数が出題数上限に達していない場合に先取り問題が追加される

### 先取り対象
- 明日〜7日後までに復習予定の問題
- 完全習得（interval >= 21日）した問題は除外
- 次回復習日が近い順に選択される

### ダッシュボード表示
学習ダッシュボードに「先取り可能」として、先取り学習可能な問題数を表示。先取り可能な問題がない場合は非表示。

### 技術仕様

```javascript
// sm2.js
SM2.getEarlyReviewQuestions(allStats, daysAhead = 7)
// 明日以降〜daysAhead日後までの復習予定問題を取得

SM2.getEarlyReviewStats(baseQuestionIds = null)
// 先取り可能な問題数と問題リストを取得

SM2.getTodayStudyPlan(baseQuestions, dailyLimit, newLimit, includeEarlyReview)
// includeEarlyReview: true の場合、先取り問題も含める
// 返り値に earlyReview 配列が追加される
```

### 学習フロー
1. 今日の復習対象 + 新規問題を優先
2. 余裕があれば先取り問題を追加
3. 先取りした問題も通常通りSM-2で評価・更新される

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

---

## 🔀 選択肢シャッフルモード

### 概要
学習効果を高めるため、4択問題の選択肢順序をランダムにシャッフルする機能。解説文中の選択肢参照も自動的に置換される。

### 有効条件
- 問題の `shuffleReady: true` が設定されている
- 学習画面で「選択肢シャッフル」オプションが有効

### マーカー方式（推奨）

解説文で選択肢キーを参照する際に、`{{A}}`, `{{B}}`, `{{C}}`, `{{D}}` のマーカー記法を使用する方式。

```markdown
**正解は{{A}}です。**

**誤答解説:**
- {{B}}: この説明は誤りです
- {{C}}: 別の概念と混同しています
- {{D}}: 部分的に正しいですが、{{A}}がより適切です
```

**メリット:**
- 意図した箇所のみ置換される
- 通常の「A」「B」等の文字は置換されない
- 問題作成者が置換箇所を明確に把握できる

### 従来方式（後方互換性）

マーカーがない場合、以下のパターンを自動検出して置換:

| パターン | 例 |
|---------|-----|
| 選択肢X | 選択肢A → 選択肢B |
| (X) / （X） | (A) → (B) |
| X: / X： | A: → B: |
| Xが/Xは/Xを | Aが正解 → Bが正解 |
| 正解はX | 正解はA → 正解はB |
| **X:** | **A:** → **B:** |

### 判定ロジック

```javascript
// マーカーが存在すればマーカー方式、なければ従来方式
if (/\{\{[A-D]\}\}/.test(explanation)) {
    // マーカー方式: {{A}} のみ置換
} else {
    // 従来方式: パターン検出による置換
}
```

### AI問題生成との連携

AI問題生成機能では、マーカー方式で解説を生成するよう指示される。
生成された問題は自動的に `shuffleReady: true` が設定される。

---

## 🔄 バックグラウンド問題生成機能

### 概要
AI問題生成の待ち時間を改善するため、バックグラウンドで問題を生成し、完了時に通知する機能。ユーザーは生成中も他の操作を続けられる。

### フロー
1. ユーザーが「バックグラウンドで生成」ボタンをクリック
2. 生成リクエストがキューに追加され、フォームがリセットされる
3. バックグラウンドでAPI呼び出しが実行される
4. 生成完了時に通知が作成され、ヘッダーの🔔アイコンにバッジが表示される
5. 通知パネルで「確認する」をクリックすると、プレビューモーダルが表示される
6. ユーザーは問題を選択して追加できる

### データベーススキーマ

#### pending_questions ストア
```javascript
{
  id: 'uuid',
  status: 'pending' | 'generating' | 'completed' | 'error',
  questions: [...],              // 生成された問題配列
  targetSetId: 'set-id' | null,  // 追加先セット
  newSetName: 'セット名' | null, // 新規セット名
  error: null | '...',           // エラーメッセージ
  created_at: timestamp,
  completed_at: timestamp | null
}
```

#### notifications ストア
```javascript
{
  id: 'uuid',
  type: 'ai_generation' | 'info' | 'error',
  title: '通知タイトル',
  message: '通知メッセージ',
  data: { pendingRequestId: '...' },  // 関連データ
  read: false,
  created_at: timestamp
}
```

### UI構成

#### ヘッダー通知アイコン
```html
<button id="notification-bell" class="notification-bell">
  <span class="bell-icon">🔔</span>
  <span id="notification-badge" class="notification-badge">3</span>
</button>
```

#### 通知パネル
- 未読通知は青い背景でハイライト
- 各通知に「確認する」ボタンと削除ボタン
- 「すべて既読」ボタン
- 30日以上前の通知は自動削除

#### AI生成ボタン
- 「問題を生成する」: 従来通りローディング表示で待機
- 「バックグラウンドで生成」: フォームをリセットしてバックグラウンド実行

### 技術仕様

```javascript
// NotificationUI モジュール
NotificationUI.init()              // 初期化
NotificationUI.updateBadge()       // バッジ更新
NotificationUI.openPanel()         // パネル表示
NotificationUI.addNotification()   // 通知追加

// AIGenerator 追加関数
AIGenerator.generateQuestionsBackground()  // バックグラウンド生成
AIGenerator.updateBackgroundIndicator()    // インジケーター更新
```

### モバイル対応
- 通知パネルは画面幅に合わせてレスポンシブ表示
- 小さい画面では画面端からのマージンを調整
- タッチ操作に適したボタンサイズ

