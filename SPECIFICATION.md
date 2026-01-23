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
