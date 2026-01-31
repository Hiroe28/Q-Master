/**
 * ai-generator.js - AI問題生成機能
 * Anthropic Messages API (Claude Sonnet 4.5) を使用
 */

// ==================== 状態管理 ====================

const AIState = {
    generatedQuestions: [],
    selectedQuestions: new Set(),
    uploadedImages: [],
    targetSetId: null,
    newSetName: null,
    pendingRequestId: null, // バックグラウンド生成用
    MAX_IMAGES: 3,
    backgroundGenerating: false // バックグラウンド生成中フラグ
};

// ==================== APIキー管理 ====================

function saveApiKey(key) {
    if (!key || !key.trim()) {
        localStorage.removeItem('anthropic_api_key');
        return;
    }
    localStorage.setItem('anthropic_api_key', btoa(key.trim()));
}

function getApiKey() {
    const encoded = localStorage.getItem('anthropic_api_key');
    if (!encoded) return null;
    try {
        return atob(encoded);
    } catch (e) {
        console.error('APIキーの復号に失敗:', e);
        return null;
    }
}

function deleteApiKey() {
    localStorage.removeItem('anthropic_api_key');
}

function hasApiKey() {
    return !!getApiKey();
}

// ==================== UI更新 ====================

function updateApiKeyUI() {
    const apiKeyInput = document.getElementById('anthropic-api-key');
    const statusEl = document.getElementById('api-key-status');
    const generatorDisabled = document.getElementById('ai-generator-disabled');
    const generatorForm = document.getElementById('ai-generator-form');

    if (hasApiKey()) {
        if (apiKeyInput) apiKeyInput.value = '••••••••••••••••';
        if (statusEl) {
            statusEl.textContent = '✅ APIキーが設定されています';
            statusEl.className = 'api-key-status api-key-set';
        }
        if (generatorDisabled) generatorDisabled.style.display = 'none';
        if (generatorForm) generatorForm.style.display = 'block';
    } else {
        if (apiKeyInput) apiKeyInput.value = '';
        if (statusEl) {
            statusEl.textContent = '❌ APIキーが設定されていません';
            statusEl.className = 'api-key-status api-key-not-set';
        }
        if (generatorDisabled) generatorDisabled.style.display = 'block';
        if (generatorForm) generatorForm.style.display = 'none';
    }
}

async function updateSetOptions() {
    const selectEl = document.getElementById('ai-select-set');
    if (!selectEl) return;

    try {
        const sets = await QuizDB.getAllQuestionSets();
        selectEl.innerHTML = '';

        if (sets.length === 0) {
            selectEl.innerHTML = '<option value="">セットがありません</option>';
            return;
        }

        sets.forEach(set => {
            const option = document.createElement('option');
            option.value = set.id;
            option.textContent = `${set.name} (${set.questionIds?.length || 0}問)`;
            selectEl.appendChild(option);
        });
    } catch (error) {
        console.error('セット一覧の取得エラー:', error);
    }
}

// ==================== 画像処理 ====================

async function imageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve({
                base64,
                mimeType: file.type || 'image/jpeg'
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function updateImagePreviews() {
    const previewContainer = document.getElementById('ai-images-preview');
    const uploadArea = document.getElementById('ai-image-upload-area');

    if (!previewContainer) return;

    previewContainer.innerHTML = '';

    AIState.uploadedImages.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = 'ai-image-preview-item';
        div.innerHTML = `
            <img src="data:${img.mimeType};base64,${img.base64}" alt="画像 ${index + 1}">
            <button type="button" class="ai-remove-image-btn" data-index="${index}">✕</button>
            <span class="ai-image-number">${index + 1}</span>
        `;
        previewContainer.appendChild(div);
    });

    if (uploadArea) {
        uploadArea.style.display = AIState.uploadedImages.length >= AIState.MAX_IMAGES ? 'none' : 'block';
    }
}

async function addImage(file) {
    if (AIState.uploadedImages.length >= AIState.MAX_IMAGES) {
        QuizUI.showToast(`画像は最大${AIState.MAX_IMAGES}枚までです`, 'warning');
        return;
    }

    if (file.size > 20 * 1024 * 1024) {
        QuizUI.showToast('画像サイズは20MB以下にしてください', 'error');
        return;
    }

    try {
        const imageData = await imageToBase64(file);
        AIState.uploadedImages.push(imageData);
        updateImagePreviews();
    } catch (error) {
        console.error('画像の読み込みエラー:', error);
        QuizUI.showToast('画像の読み込みに失敗しました', 'error');
    }
}

function removeImage(index) {
    AIState.uploadedImages.splice(index, 1);
    updateImagePreviews();
}

function clearAllImages() {
    AIState.uploadedImages = [];
    updateImagePreviews();

    const fileInput = document.getElementById('ai-image-upload');
    if (fileInput) fileInput.value = '';
}

// ==================== JSON Schema ====================

function getQuestionSchema() {
    return {
        type: "object",
        properties: {
            questions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string", default: "" },
                        body_md: { type: "string", minLength: 1 },
                        choices: {
                            type: "object",
                            properties: {
                                A: { type: "string", minLength: 1 },
                                B: { type: "string", minLength: 1 },
                                C: { type: "string", minLength: 1 },
                                D: { type: "string", minLength: 1 }
                            },
                            required: ["A", "B", "C", "D"],
                            additionalProperties: false
                        },
                        answer: { type: "string", enum: ["A", "B", "C", "D"] },
                        explanation_md: { type: "string", default: "" },
                        type: { type: "string", enum: ["multiple-choice", "typing", "both"] },
                        typingAnswer: { type: "string", default: "" },
                        acceptableAnswers: {
                            type: "array",
                            items: { type: "string" },
                            default: []
                        },
                        caseSensitive: { type: "boolean", default: false },
                        strictMatch: { type: "boolean", default: true },
                        isLanguageLearning: { type: "boolean", default: false },
                        audioEnabled: { type: "boolean", default: false },
                        audioLang: { type: "string", default: "en-US" },
                        shuffleReady: { type: "boolean", default: true }
                    },
                    required: [
                        "title", "body_md", "choices", "answer", "explanation_md",
                        "type", "typingAnswer", "acceptableAnswers",
                        "caseSensitive", "strictMatch",
                        "isLanguageLearning", "audioEnabled", "audioLang",
                        "shuffleReady"
                    ],
                    additionalProperties: false
                }
            }
        },
        required: ["questions"],
        additionalProperties: false
    };
}

// ==================== プロンプトテンプレート ====================

/**
 * デフォルトのシステムプロンプトテンプレート
 * ジャンル・難易度・タグを動的に挿入して使用
 */
const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `あなたは教育問題作成のプロフェッショナルです。
与えられた情報から、高品質な学習問題を作成してください。以下の形式で、適切な難易度の問題を作成します。できる限り、全ての情報をマスターできるようにお願い致します。

**対象ジャンル**: {{GENRE}}
**難易度レベル**: {{DIFFICULTY}}
**タグ**: {{TAGS}}

問題文や解説では、適切な箇所でMarkdownの表を活用してください。
- 複数の概念や制度を比較する場合
- 計算過程を整理して示す場合
- 分類や体系を整理する場合
- 数値データを見やすく提示する場合
などで表を使うと、理解しやすくなります。無駄な多用は避けてください。

**タイトル**: 問題内容がわかりやすい短い見出しを付けてください。答えを含んでも構いません(学習時は非表示のため)。

**正答の配置**: 正答はA,B,C,Dにランダムにしてバランスよく配置し、どれかに偏らないようにしてください。

---

## 【選択肢シャッフル対応 - 最重要】

このアプリは選択肢シャッフル機能を搭載しています。解説で選択肢を参照する際は、**必ずマーカー方式を使用**してください。

### **マーカー方式とは**

解説中で選択肢を参照する際、\`{{A}}\`, \`{{B}}\`, \`{{C}}\`, \`{{D}}\`の記法を使います。
シャッフル時、アプリが自動的に正しい選択肢キーに置換します。

### **なぜマーカー方式が必要か**

- シャッフル時、選択肢の**内容**は移動しますが、**ラベル(A,B,C,D)は固定**です
- 例: 元々「A: 正解」だったものが、シャッフル後は「C: 正解」の位置に移動
- マーカーを使わないと、解説と実際の選択肢が一致しなくなります

### **必須ルール**

1. **すべての問題で\`shuffleReady: true\`を設定**
2. **解説では必ず\`{{A}}\`, \`{{B}}\`, \`{{C}}\`, \`{{D}}\`を使用**
3. **生のA, B, C, Dは絶対に使わない**

---

## 【解説の書き方 - 重要】

### **簡潔さを最優先**
- 解説は全体で**200〜300文字程度**を目安に
- 冗長な説明は避け、要点を簡潔に

### **構成**
1. **正解の理由**(1〜2文) - \`**正解は{{A}}です。**\`のように太字で強調
2. **誤答の理由**(各1文) - マーカー(\`{{B}}:\`, \`{{C}}:\`など)を使って簡潔に説明
3. **覚え方や補足**(1文) - 必要な場合のみ

### **Markdown形式必須**
- 改行・太字・箇条書きを活用
- 表は本当に必要な場合のみ(1つまで)
- 読みやすさ最優先

---

## 【解説の良い例】

### 例: 理科(生物)

✅ **良い例(マーカー方式・簡潔で読みやすい):**
\`\`\`markdown
**正解は{{C}}です。** ミトコンドリアは細胞内でATPを生成する「エネルギー工場」です。

**誤答の理由:**
- {{A}}: 葉緑体は光合成を行う器官で、植物細胞にのみ存在します
- {{B}}: リボソームはタンパク質を合成する器官です
- {{D}}: ゴルジ体はタンパク質の修飾・輸送を行います

**覚え方:** ミト=ATP、リボ=タンパク質
\`\`\`

---

## 【タグ設定】

タグは生成された問題に自動的に設定されます。
指定されたタグ: {{TAGS}}

---

## 【LaTeX数式】

数学・物理・化学で必須。
インライン:\`$F=ma$\`
ディスプレイ:\`$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$\`

---

## 【出力形式】

必ずJSON形式で出力してください。questionsキーの配列として問題を含めてください。
`;

// ==================== プロンプト生成 ====================

/**
 * ジャンル・難易度・タグを含むシステムプロンプトを構築
 */
function buildSystemPrompt(questionType, isLanguageLearning, audioLang, numImages, mode, promptSettings = {}) {
    const { genre, difficulty, tags } = promptSettings;
    let typeInstruction = '';

    if (questionType === 'multiple-choice') {
        typeInstruction = 'すべての問題を4択のみ(type: "multiple-choice")で作成。';
    } else if (questionType === 'typing') {
        typeInstruction = 'すべての問題をタイピング(type: "typing")で作成。4択+typingAnswer/acceptableAnswers必須。';
    } else if (questionType === 'both') {
        typeInstruction = 'すべての問題を4択+タイピング(type: "both")で作成。4択+typingAnswer/acceptableAnswers必須。';
    } else {
        typeInstruction = '問題に応じて適切な形式を選択。どの形式でも4択は必須。タイピングは、解答が簡単なタイピングで入力可能な場合のみ使用。';
    }

    let languageInstruction = '';
    if (isLanguageLearning) {
        languageInstruction = `語学学習問題: isLanguageLearning=true, audioEnabled=true, audioLang="${audioLang}"`;
    }

    // ★ モード別の問題数指示を追加
    let modeInstruction = '';
    if (mode === 'exact') {
        modeInstruction = `
**重要: 問題数の指定**
- **素材に含まれる問題数分のみ作成**
- 素材が1問なら1問、5問なら5問を正確に生成
- 勝手に問題数を増やさない
- 画像の場合、画像内の問題数を正確にカウントして生成
`;
    } else if (mode === 'reference') {
        modeInstruction = `
**問題数の指定**
- 素材を参考に関連問題を5-10問程度作成
- ユーザーの追加指示で問題数が指定されている場合はそれに従う
`;
    }

    let imageInstruction = '';
    if (numImages > 0) {
        imageInstruction = `
**画像${numImages}枚から問題作成**

**最重要: 画像の選択肢処理**
画像に選択肢(ア、イ、ウ、エなど)がある場合:
- **問題文には選択肢内容を含めない**
- 選択肢のみ抽出してA,B,C,Dに変換
- 「ア→A」「イ→B」「ウ→C」「エ→D」

良い例: 
問題文「クラウドサービス派生データはどれか。」
A「データの再入力が不要なデータ」
B「サービス維持に使われるデータ」

悪い例:
問題文「次から選べ。ア:データA、イ:データB...」

**画像内容を網羅**
- 教科書: 全重要概念を問題化
- 用語集: 各項目1問(最大10問)
- 表/グラフ: 各行列の内容

**Markdown活用(必須)**
- 問題文・解説は改行・箇条書きを使用
- 読みやすさ最優先
- 平文の羅列は避ける

`;
    }

    // ジャンル・難易度・タグが指定されている場合はデフォルトテンプレートを使用
    const genreText = genre || '指定なし（素材から判断）';
    const difficultyText = difficulty || '指定なし（素材から判断）';
    const tagsText = tags && tags.length > 0 ? tags.join(', ') : '指定なし（素材から判断）';

    // デフォルトテンプレートにパラメータを挿入
    let basePrompt = DEFAULT_SYSTEM_PROMPT_TEMPLATE
        .replace('{{GENRE}}', genreText)
        .replace('{{DIFFICULTY}}', difficultyText)
        .replace(/\{\{TAGS\}\}/g, tagsText);

    // 追加の指示を構築
    let additionalInstructions = '';

    // 画像処理の指示
    if (numImages > 0) {
        additionalInstructions += `
---

## 【画像からの問題作成】

**画像${numImages}枚から問題を作成してください。**

**最重要: 画像の選択肢処理**
画像に選択肢(ア、イ、ウ、エなど)がある場合:
- **問題文には選択肢内容を含めない**
- 選択肢のみ抽出してA,B,C,Dに変換
- 「ア→A」「イ→B」「ウ→C」「エ→D」

**画像内容を網羅**
- 教科書: 全重要概念を問題化
- 用語集: 各項目1問(最大10問)
- 表/グラフ: 各行列の内容
`;
    }

    // 出題形式の指示
    additionalInstructions += `
---

## 【出題形式】

${typeInstruction}
どの形式でも4択必須(minLength:1)
`;

    // モード別の問題数指示
    if (modeInstruction) {
        additionalInstructions += modeInstruction;
    }

    // 語学学習の指示
    if (languageInstruction) {
        additionalInstructions += `
---

## 【語学学習設定】

${languageInstruction}
`;
    }

    // タイピング形式の指示
    if (questionType === 'typing' || questionType === 'both') {
        additionalInstructions += `
---

## 【タイピング問題の設定】

- 4択必須 + typingAnswer + acceptableAnswers を設定
- caseSensitive: false
- strictMatch: true
`;
    }

    // タグを問題に含める指示
    if (tags && tags.length > 0) {
        additionalInstructions += `
---

## 【重要: タグの設定】

すべての問題に以下のタグを設定してください:
\`\`\`json
"tags": ${JSON.stringify(tags)}
\`\`\`
`;
    }

    return basePrompt + additionalInstructions;
}


function buildUserPrompt(mode, content, instruction) {
    let prompt = '';
    
    if (mode === 'exact') {
        prompt = `**指示: この素材に含まれる問題をそのまま使って問題を作成**

重要: 素材に含まれる問題数分だけ作成してください。勝手に問題数を増やさないでください。
- 素材が1問なら1問のみ
- 素材が5問なら5問のみ
- 画像の場合、画像内の問題数を正確にカウントして生成`;
    } else {
        prompt = `**指示: この素材を参考に関連問題を作成**

素材の内容をベースに、関連する問題を5-10問程度作成してください。`;
    }

    if (content) {
        prompt += `\n\n【素材】\n${content}`;
    }

    if (instruction && instruction.trim()) {
        prompt += `\n\n【追加指示】\n${instruction}`;
    }

    return prompt;
}

// ==================== API呼び出し ====================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250514';
const ANTHROPIC_VERSION = '2023-06-01';

async function callClaudeAPIText(systemPrompt, userPrompt) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('APIキーが設定されていません');
    }

    const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [
                { role: 'user', content: userPrompt }
            ]
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
            throw new Error('APIキーが無効です');
        } else if (response.status === 429) {
            throw new Error('API利用制限に達しました');
        } else {
            throw new Error(errorData.error?.message || `APIエラー: ${response.status}`);
        }
    }

    const data = await response.json();

    // Anthropic Messages APIのレスポンス形式
    if (data.content && Array.isArray(data.content)) {
        const textContent = data.content.find(c => c.type === 'text');
        if (textContent && textContent.text) {
            return textContent.text;
        }
    }

    throw new Error('APIからの応答を解析できませんでした');
}

async function callClaudeAPIWithImages(systemPrompt, userPrompt, images) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('APIキーが設定されていません');
    }

    // Anthropic形式の画像コンテンツを作成
    const imageContents = images.map(img => ({
        type: 'image',
        source: {
            type: 'base64',
            media_type: img.mimeType,
            data: img.base64
        }
    }));

    const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: [
                        ...imageContents,
                        { type: 'text', text: userPrompt }
                    ]
                }
            ]
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
            throw new Error('APIキーが無効です');
        } else if (response.status === 429) {
            throw new Error('API利用制限に達しました');
        } else {
            throw new Error(errorData.error?.message || `APIエラー: ${response.status}`);
        }
    }

    const data = await response.json();

    // Anthropic Messages APIのレスポンス形式
    if (data.content && Array.isArray(data.content)) {
        const textContent = data.content.find(c => c.type === 'text');
        if (textContent && textContent.text) {
            return textContent.text;
        }
    }

    throw new Error('APIからの応答を解析できませんでした');
}

function parseAIResponse(response) {
    try {
        return JSON.parse(response);
    } catch (error) {
        console.warn('JSON解析失敗、フォールバック:', error);
        
        let jsonStr = response;
        const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
            jsonStr = jsonBlockMatch[1];
        }

        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }

        try {
            return JSON.parse(jsonStr);
        } catch (parseError) {
            console.error('JSON解析エラー:', parseError);
            throw new Error('AIの応答を解析できませんでした');
        }
    }
}

// ==================== バリデーション ====================

function validateQuestions(questions, expectedType) {
    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('問題が生成されませんでした');
    }

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];

        if (!q.body_md) {
            throw new Error(`問題${i + 1}: 問題文が必要です`);
        }
        if (!q.choices || !q.choices.A) {
            throw new Error(`問題${i + 1}: 選択肢が必要です`);
        }
        if (!q.answer) {
            q.answer = 'A';
        }
        if (!q.type) {
            q.type = 'multiple-choice';
        }
        if (expectedType && expectedType !== 'auto') {
            q.type = expectedType;
        }

        if (q.type === 'typing' || q.type === 'both') {
            if (!q.typingAnswer) {
                q.typingAnswer = q.choices.A;
            }
            if (!q.acceptableAnswers || q.acceptableAnswers.length === 0) {
                q.acceptableAnswers = [q.typingAnswer];
            }
            if (q.caseSensitive === undefined) {
                q.caseSensitive = false;
            }
            if (q.strictMatch === undefined) {
                q.strictMatch = true;
            }
        }

        if (q.isLanguageLearning === undefined) {
            q.isLanguageLearning = false;
        }
        if (q.audioEnabled === undefined) {
            q.audioEnabled = false;
        }
        if (!q.audioLang) {
            q.audioLang = 'en-US';
        }

        // AI生成問題はシャッフル対応として設定
        if (q.shuffleReady === undefined) {
            q.shuffleReady = true;
        }
    }
}

// ==================== モーダル ====================

function showPreviewModal(questions) {
    AIState.generatedQuestions = questions;
    AIState.selectedQuestions = new Set(questions.map((_, i) => i));

    const modal = document.getElementById('ai-preview-modal');
    const listContainer = document.getElementById('ai-preview-list');

    if (!modal || !listContainer) return;

    listContainer.innerHTML = questions.map((q, index) => {
        const typeBadge = getTypeBadgeHTML(q.type);

        const choicesHtml = ['A', 'B', 'C', 'D'].map(choice => {
            const isCorrect = q.answer === choice;
            const choiceText = q.choices?.[choice] || '';
            if (!choiceText) return '';
            return `
                <div class="ai-preview-choice ${isCorrect ? 'correct' : ''}">
                    <span class="choice-label">${choice}</span>
                    <span class="choice-text">${QuizUI.escapeHtml(choiceText)}</span>
                    ${isCorrect ? '<span class="correct-mark">✓ 正解</span>' : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="ai-preview-item" data-index="${index}">
                <label class="ai-preview-checkbox">
                    <input type="checkbox" class="ai-question-checkbox" data-index="${index}" checked>
                </label>
                <div class="ai-preview-item-content">
                    <div class="ai-preview-item-header">
                        ${typeBadge}
                        <span class="ai-preview-item-title">${QuizUI.escapeHtml(q.title || `問題 ${index + 1}`)}</span>
                    </div>
                    <div class="ai-preview-item-body markdown-content" data-markdown="${QuizUI.escapeHtml(q.body_md || '')}"></div>
                    <div class="ai-preview-choices">
                        ${choicesHtml}
                    </div>
                    <details class="ai-preview-explanation-details">
                        <summary class="ai-preview-explanation-toggle">💡 解説を見る</summary>
                        <div class="ai-preview-explanation-content markdown-content" data-markdown="${QuizUI.escapeHtml(q.explanation_md || '解説はありません')}"></div>
                    </details>
                </div>
            </div>
        `;
    }).join('');

    // Markdownレンダリングを適用
    listContainer.querySelectorAll('.markdown-content[data-markdown]').forEach(el => {
        const markdown = el.getAttribute('data-markdown');
        if (markdown) {
            QuizUI.renderContent(markdown, el);
        }
    });

    const selectAllCheckbox = document.getElementById('ai-select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = true;
    }

    updateSelectedCount();
    modal.classList.add('active');
}

function getTypeBadgeHTML(type) {
    if (!type || type === 'multiple-choice') {
        return '<span class="type-badge type-multiple-choice">📝 4択</span>';
    } else if (type === 'typing') {
        return '<span class="type-badge type-typing">⌨️ タイピング</span>';
    } else if (type === 'both') {
        return '<span class="type-badge type-both">📝⌨️ 両方</span>';
    }
    return '';
}

function hidePreviewModal() {
    const modal = document.getElementById('ai-preview-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    AIState.generatedQuestions = [];
    AIState.selectedQuestions.clear();
}

function updateSelectedCount() {
    const countEl = document.getElementById('ai-selected-count');
    if (countEl) {
        countEl.textContent = `${AIState.selectedQuestions.size}問選択中`;
    }

    const addBtn = document.getElementById('ai-preview-add');
    if (addBtn) {
        addBtn.disabled = AIState.selectedQuestions.size === 0;
    }
}

function toggleQuestionSelection(index, checked) {
    if (checked) {
        AIState.selectedQuestions.add(index);
    } else {
        AIState.selectedQuestions.delete(index);
    }
    updateSelectedCount();

    const selectAllCheckbox = document.getElementById('ai-select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = AIState.selectedQuestions.size === AIState.generatedQuestions.length;
    }
}

function toggleSelectAll(checked) {
    document.querySelectorAll('.ai-question-checkbox').forEach((checkbox, index) => {
        checkbox.checked = checked;
        if (checked) {
            AIState.selectedQuestions.add(index);
        } else {
            AIState.selectedQuestions.delete(index);
        }
    });
    updateSelectedCount();
}

// ==================== 問題追加 ====================

async function addSelectedQuestions() {
    if (AIState.selectedQuestions.size === 0) {
        QuizUI.showToast('追加する問題を選択してください', 'error');
        return;
    }

    try {
        QuizUI.showLoading('問題を追加中...');

        const selectedQuestions = Array.from(AIState.selectedQuestions)
            .sort((a, b) => a - b)
            .map(index => AIState.generatedQuestions[index]);

        let setId = AIState.targetSetId;

        if (AIState.newSetName) {
            const newSet = await QuizDB.createQuestionSet({
                name: AIState.newSetName,
                description: 'AI生成問題',
                enabled: true
            });
            setId = newSet.id;
        }

        let addedCount = 0;
        const addedQuestionIds = [];

        for (const q of selectedQuestions) {
            try {
                if (setId) {
                    q.sets = [setId];
                }

                const added = await QuizDB.addQuestion(q);
                addedCount++;
                addedQuestionIds.push(added.id);
            } catch (error) {
                console.error('問題の追加エラー:', error);
            }
        }

        if (setId && addedQuestionIds.length > 0) {
            const set = await QuizDB.getQuestionSet(setId);
            if (set) {
                const questionIds = [...(set.questionIds || []), ...addedQuestionIds];
                await QuizDB.updateQuestionSet(setId, { questionIds });
            }
        }

        QuizUI.hideLoading();
        hidePreviewModal();

        let message = `${addedCount}問を追加しました`;
        if (setId) {
            const set = await QuizDB.getQuestionSet(setId);
            if (set) {
                message += `(セット: ${set.name})`;
            }
        }
        QuizUI.showToast(message, 'success');

        // pendingRequestがある場合は削除
        if (AIState.pendingRequestId) {
            await QuizDB.deletePendingRequest(AIState.pendingRequestId);
            AIState.pendingRequestId = null;
        }

        resetGeneratorForm();

        if (typeof refreshManageScreen === 'function') {
            await refreshManageScreen();
        }

    } catch (error) {
        QuizUI.hideLoading();
        console.error('追加エラー:', error);
        QuizUI.showToast('追加に失敗しました: ' + error.message, 'error');
    }
}

function resetGeneratorForm() {
    const sourceText = document.getElementById('ai-source-text');
    const instruction = document.getElementById('ai-instruction');
    const genre = document.getElementById('ai-genre');
    const difficulty = document.getElementById('ai-difficulty');
    const tags = document.getElementById('ai-tags');

    if (sourceText) sourceText.value = '';
    if (instruction) instruction.value = '';
    if (genre) genre.value = '';
    if (difficulty) difficulty.value = '';
    if (tags) tags.value = '';

    clearAllImages();
    AIState.targetSetId = null;
    AIState.newSetName = null;
}

// ==================== プロンプトテンプレート管理 ====================

/**
 * 保存済みテンプレートのセレクトボックスを更新
 */
async function updateTemplateSelect() {
    const selectEl = document.getElementById('ai-template-select');
    if (!selectEl) return;

    try {
        const templates = await QuizDB.getAllPromptTemplates();

        // 最初のオプションを保持
        const firstOption = selectEl.options[0];
        selectEl.innerHTML = '';
        selectEl.appendChild(firstOption);

        templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            option.dataset.genre = template.genre || '';
            option.dataset.difficulty = template.difficulty || '';
            option.dataset.tags = (template.defaultTags || []).join(', ');
            selectEl.appendChild(option);
        });
    } catch (error) {
        console.error('テンプレート一覧の取得エラー:', error);
    }
}

/**
 * 現在の設定をテンプレートとして保存
 */
async function saveCurrentTemplate() {
    const genre = document.getElementById('ai-genre')?.value.trim() || '';
    const difficulty = document.getElementById('ai-difficulty')?.value.trim() || '';
    const tagsInput = document.getElementById('ai-tags')?.value.trim() || '';
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

    if (!genre && !difficulty && tags.length === 0) {
        QuizUI.showToast('保存する設定を入力してください', 'error');
        return;
    }

    // テンプレート名を入力
    const name = prompt(I18n.t('ai.prompt.templateName'));
    if (!name || !name.trim()) {
        return;
    }

    try {
        await QuizDB.addPromptTemplate({
            name: name.trim(),
            genre,
            difficulty,
            defaultTags: tags
        });

        QuizUI.showToast(I18n.t('ai.prompt.templateSaved'), 'success');
        await updateTemplateSelect();
    } catch (error) {
        console.error('テンプレート保存エラー:', error);
        QuizUI.showToast('保存に失敗しました', 'error');
    }
}

/**
 * テンプレートを選択して適用
 */
async function applyTemplate(templateId) {
    if (!templateId) return;

    try {
        const template = await QuizDB.getPromptTemplate(templateId);
        if (!template) return;

        const genreEl = document.getElementById('ai-genre');
        const difficultyEl = document.getElementById('ai-difficulty');
        const tagsEl = document.getElementById('ai-tags');

        if (genreEl) genreEl.value = template.genre || '';
        if (difficultyEl) difficultyEl.value = template.difficulty || '';
        if (tagsEl) tagsEl.value = (template.defaultTags || []).join(', ');

    } catch (error) {
        console.error('テンプレート適用エラー:', error);
    }
}

// ==================== メイン生成 ====================

async function generateQuestions() {
    try {
        const sourceType = document.querySelector('input[name="ai-source-type"]:checked')?.value || 'text';
        const sourceText = document.getElementById('ai-source-text')?.value.trim();
        const mode = document.querySelector('input[name="ai-creation-mode"]:checked')?.value || 'exact';
        const questionType = document.querySelector('input[name="ai-question-type"]:checked')?.value || 'both';
        const isLanguageLearning = document.getElementById('ai-language-learning')?.checked || false;
        const audioLang = document.getElementById('ai-audio-lang')?.value || 'en-US';
        const instruction = document.getElementById('ai-instruction')?.value.trim() || '';
        const targetSetOption = document.querySelector('input[name="ai-target-set"]:checked')?.value || 'none';

        // プロンプト設定を取得
        const genre = document.getElementById('ai-genre')?.value.trim() || '';
        const difficulty = document.getElementById('ai-difficulty')?.value.trim() || '';
        const tagsInput = document.getElementById('ai-tags')?.value.trim() || '';
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

        if (sourceType === 'text' && !sourceText) {
            QuizUI.showToast('素材テキストを入力してください', 'error');
            return;
        }

        if (sourceType === 'image' && AIState.uploadedImages.length === 0) {
            QuizUI.showToast('画像をアップロードしてください', 'error');
            return;
        }

        if (!hasApiKey()) {
            QuizUI.showToast('APIキーが設定されていません', 'error');
            return;
        }

        AIState.targetSetId = null;
        AIState.newSetName = null;

        if (targetSetOption === 'existing') {
            AIState.targetSetId = document.getElementById('ai-select-set')?.value;
            if (!AIState.targetSetId) {
                QuizUI.showToast('セットを選択してください', 'error');
                return;
            }
        } else if (targetSetOption === 'new') {
            AIState.newSetName = document.getElementById('ai-new-set-name')?.value.trim();
            if (!AIState.newSetName) {
                QuizUI.showToast('新規セット名を入力してください', 'error');
                return;
            }
        }

        QuizUI.showLoading('問題を生成中...');

        const isImageInput = sourceType === 'image';
        
        // ★ ローディングメッセージを状況に応じて変更
        let loadingMessage = '問題を生成中...';
        
        if (isImageInput) {
            loadingMessage = `画像${AIState.uploadedImages.length}枚から問題を生成中...`;
        } else {
            loadingMessage = '問題を生成中...';
        }
        
        QuizUI.showLoading(loadingMessage);

        // プロンプト設定を構築
        const promptSettings = { genre, difficulty, tags };
        const systemPrompt = buildSystemPrompt(
            questionType,
            isLanguageLearning,
            audioLang,
            isImageInput ? AIState.uploadedImages.length : 0,
            mode,
            promptSettings
        );
        const userPrompt = buildUserPrompt(mode, isImageInput ? '' : sourceText, instruction);

        let response;
        if (isImageInput) {
            response = await callClaudeAPIWithImages(systemPrompt, userPrompt, AIState.uploadedImages);
        } else {
            response = await callClaudeAPIText(systemPrompt, userPrompt);
        }

        const result = parseAIResponse(response);
        validateQuestions(result.questions, questionType);

        QuizUI.hideLoading();
        showPreviewModal(result.questions);

    } catch (error) {
        QuizUI.hideLoading();
        console.error('生成エラー:', error);
        QuizUI.showToast('生成に失敗しました: ' + error.message, 'error');
    }
}

// ==================== バックグラウンド生成 ====================

/**
 * バックグラウンドで問題を生成
 * UIをブロックせずに生成処理を実行し、完了時に通知
 */
async function generateQuestionsBackground() {
    try {
        const sourceType = document.querySelector('input[name="ai-source-type"]:checked')?.value || 'text';
        const sourceText = document.getElementById('ai-source-text')?.value.trim();
        const mode = document.querySelector('input[name="ai-creation-mode"]:checked')?.value || 'exact';
        const questionType = document.querySelector('input[name="ai-question-type"]:checked')?.value || 'both';
        const isLanguageLearning = document.getElementById('ai-language-learning')?.checked || false;
        const audioLang = document.getElementById('ai-audio-lang')?.value || 'en-US';
        const instruction = document.getElementById('ai-instruction')?.value.trim() || '';
        const targetSetOption = document.querySelector('input[name="ai-target-set"]:checked')?.value || 'none';

        // プロンプト設定を取得
        const genre = document.getElementById('ai-genre')?.value.trim() || '';
        const difficulty = document.getElementById('ai-difficulty')?.value.trim() || '';
        const tagsInput = document.getElementById('ai-tags')?.value.trim() || '';
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

        if (sourceType === 'text' && !sourceText) {
            QuizUI.showToast('素材テキストを入力してください', 'error');
            return;
        }

        if (sourceType === 'image' && AIState.uploadedImages.length === 0) {
            QuizUI.showToast('画像をアップロードしてください', 'error');
            return;
        }

        if (!hasApiKey()) {
            QuizUI.showToast('APIキーが設定されていません', 'error');
            return;
        }

        // ターゲットセット情報を取得
        let targetSetId = null;
        let newSetName = null;

        if (targetSetOption === 'existing') {
            targetSetId = document.getElementById('ai-select-set')?.value;
            if (!targetSetId) {
                QuizUI.showToast('セットを選択してください', 'error');
                return;
            }
        } else if (targetSetOption === 'new') {
            newSetName = document.getElementById('ai-new-set-name')?.value.trim();
            if (!newSetName) {
                QuizUI.showToast('新規セット名を入力してください', 'error');
                return;
            }
        }

        // 画像データをコピー（フォームリセット前に保持）
        const imagesToProcess = [...AIState.uploadedImages];

        // pendingRequestを作成
        const pendingRequest = await QuizDB.addPendingRequest({
            targetSetId,
            newSetName
        });

        // ステータスを生成中に更新
        await QuizDB.updatePendingRequest(pendingRequest.id, { status: 'generating' });

        // フォームをリセットしてUIを解放
        resetGeneratorForm();
        QuizUI.showToast('バックグラウンドで問題を生成中...完了時に通知します', 'info');

        // バックグラウンドフラグを設定
        AIState.backgroundGenerating = true;
        updateBackgroundIndicator();

        // バックグラウンドで生成処理を実行
        try {
            const isImageInput = sourceType === 'image';
            const promptSettings = { genre, difficulty, tags };
            const systemPrompt = buildSystemPrompt(
                questionType,
                isLanguageLearning,
                audioLang,
                isImageInput ? imagesToProcess.length : 0,
                mode,
                promptSettings
            );
            const userPrompt = buildUserPrompt(mode, isImageInput ? '' : sourceText, instruction);

            let response;
            if (isImageInput) {
                response = await callClaudeAPIWithImages(systemPrompt, userPrompt, imagesToProcess);
            } else {
                response = await callClaudeAPIText(systemPrompt, userPrompt);
            }

            const result = parseAIResponse(response);
            validateQuestions(result.questions, questionType);

            // 完了状態に更新
            await QuizDB.updatePendingRequest(pendingRequest.id, {
                status: 'completed',
                questions: result.questions,
                completed_at: Date.now()
            });

            // 通知を追加
            await NotificationUI.addNotification({
                type: 'ai_generation',
                title: 'AI問題生成完了',
                message: `${result.questions.length}問の問題が生成されました`,
                data: {
                    pendingRequestId: pendingRequest.id,
                    questionCount: result.questions.length
                }
            });

        } catch (error) {
            console.error('バックグラウンド生成エラー:', error);

            // エラー状態に更新
            await QuizDB.updatePendingRequest(pendingRequest.id, {
                status: 'error',
                error: error.message
            });

            // エラー通知
            await NotificationUI.addNotification({
                type: 'error',
                title: 'AI問題生成エラー',
                message: error.message,
                data: {
                    pendingRequestId: pendingRequest.id
                }
            });
        }

        // バックグラウンドフラグを解除
        AIState.backgroundGenerating = false;
        updateBackgroundIndicator();

    } catch (error) {
        console.error('バックグラウンド生成開始エラー:', error);
        QuizUI.showToast('生成の開始に失敗しました: ' + error.message, 'error');
        AIState.backgroundGenerating = false;
        updateBackgroundIndicator();
    }
}

/**
 * バックグラウンド生成中インジケーターを更新
 */
function updateBackgroundIndicator() {
    const indicator = document.getElementById('background-generating-indicator');
    if (indicator) {
        indicator.style.display = AIState.backgroundGenerating ? 'flex' : 'none';
    }
}

// ==================== イベント ====================

function initAIGenerator() {
    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => {
            const input = document.getElementById('anthropic-api-key');
            const key = input?.value.trim();

            if (key === '••••••••••••••••') {
                QuizUI.showToast('APIキーは既に設定されています', 'info');
                return;
            }

            if (!key) {
                QuizUI.showToast('APIキーを入力してください', 'error');
                return;
            }

            if (!key.startsWith('sk-ant-')) {
                QuizUI.showToast('有効なAnthropic APIキーを入力してください（sk-ant-で始まる形式）', 'error');
                return;
            }

            saveApiKey(key);
            updateApiKeyUI();
            QuizUI.showToast('APIキーを保存しました', 'success');
        });
    }

    const deleteApiKeyBtn = document.getElementById('delete-api-key-btn');
    if (deleteApiKeyBtn) {
        deleteApiKeyBtn.addEventListener('click', async () => {
            const confirmed = await QuizUI.showConfirm('APIキーを削除しますか?');
            if (confirmed) {
                deleteApiKey();
                updateApiKeyUI();
                QuizUI.showToast('APIキーを削除しました', 'success');
            }
        });
    }

    const toggleApiKeyBtn = document.getElementById('toggle-api-key-btn');
    if (toggleApiKeyBtn) {
        toggleApiKeyBtn.addEventListener('click', () => {
            const input = document.getElementById('anthropic-api-key');
            if (input) {
                if (input.type === 'password') {
                    const key = getApiKey();
                    if (key) {
                        input.type = 'text';
                        input.value = key;
                        toggleApiKeyBtn.textContent = '🙈';
                    }
                } else {
                    input.type = 'password';
                    if (hasApiKey()) {
                        input.value = '••••••••••••••••';
                    }
                    toggleApiKeyBtn.textContent = '👁️';
                }
            }
        });
    }

    const sourceTypeRadios = document.querySelectorAll('input[name="ai-source-type"]');
    sourceTypeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const textSection = document.getElementById('ai-text-input-section');
            const imageSection = document.getElementById('ai-image-input-section');

            if (textSection) {
                textSection.style.display = radio.value === 'text' ? 'block' : 'none';
            }
            if (imageSection) {
                imageSection.style.display = radio.value === 'image' ? 'block' : 'none';
            }
        });
    });

    const imageUpload = document.getElementById('ai-image-upload');
    if (imageUpload) {
        imageUpload.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    await addImage(file);
                }
            }
            e.target.value = '';
        });
    }

    const imagesPreview = document.getElementById('ai-images-preview');
    if (imagesPreview) {
        imagesPreview.addEventListener('click', (e) => {
            if (e.target.classList.contains('ai-remove-image-btn')) {
                const index = parseInt(e.target.dataset.index, 10);
                removeImage(index);
            }
        });
    }

    const uploadArea = document.getElementById('ai-image-upload-area');
    const uploadLabel = uploadArea?.querySelector('.ai-image-upload-label');
    if (uploadLabel) {
        uploadLabel.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadLabel.classList.add('dragover');
        });

        uploadLabel.addEventListener('dragleave', () => {
            uploadLabel.classList.remove('dragover');
        });

        uploadLabel.addEventListener('drop', async (e) => {
            e.preventDefault();
            uploadLabel.classList.remove('dragover');

            const files = Array.from(e.dataTransfer.files || []);
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    await addImage(file);
                }
            }
        });
    }

    const languageLearningCheckbox = document.getElementById('ai-language-learning');
    if (languageLearningCheckbox) {
        languageLearningCheckbox.addEventListener('change', () => {
            const audioSettings = document.getElementById('ai-audio-settings');
            if (audioSettings) {
                audioSettings.style.display = languageLearningCheckbox.checked ? 'block' : 'none';
            }
        });
    }

    const targetSetRadios = document.querySelectorAll('input[name="ai-target-set"]');
    targetSetRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const existingSelect = document.getElementById('ai-existing-set-select');
            const newInput = document.getElementById('ai-new-set-input');

            if (existingSelect) {
                existingSelect.style.display = radio.value === 'existing' ? 'block' : 'none';
            }
            if (newInput) {
                newInput.style.display = radio.value === 'new' ? 'block' : 'none';
            }

            if (radio.value === 'existing') {
                updateSetOptions();
            }
        });
    });

    const generateBtn = document.getElementById('generate-questions-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateQuestions);
    }

    // バックグラウンド生成ボタン
    const generateBgBtn = document.getElementById('generate-questions-bg-btn');
    if (generateBgBtn) {
        generateBgBtn.addEventListener('click', generateQuestionsBackground);
    }

    // テンプレート保存ボタン
    const saveTemplateBtn = document.getElementById('ai-save-template-btn');
    if (saveTemplateBtn) {
        saveTemplateBtn.addEventListener('click', saveCurrentTemplate);
    }

    // テンプレート選択
    const templateSelect = document.getElementById('ai-template-select');
    if (templateSelect) {
        templateSelect.addEventListener('change', (e) => {
            applyTemplate(e.target.value);
        });
    }

    setupPreviewModalEvents();
    updateApiKeyUI();
    updateTemplateSelect();
}

function setupPreviewModalEvents() {
    const closeBtn = document.getElementById('ai-preview-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', hidePreviewModal);
    }

    const cancelBtn = document.getElementById('ai-preview-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hidePreviewModal);
    }

    const addBtn = document.getElementById('ai-preview-add');
    if (addBtn) {
        addBtn.addEventListener('click', addSelectedQuestions);
    }

    const selectAllCheckbox = document.getElementById('ai-select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            toggleSelectAll(e.target.checked);
        });
    }

    const listContainer = document.getElementById('ai-preview-list');
    if (listContainer) {
        listContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('ai-question-checkbox')) {
                const index = parseInt(e.target.dataset.index, 10);
                toggleQuestionSelection(index, e.target.checked);
            }
        });
    }

    const modal = document.getElementById('ai-preview-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hidePreviewModal();
            }
        });
    }
}

window.AIGenerator = {
    saveApiKey,
    getApiKey,
    deleteApiKey,
    hasApiKey,
    updateApiKeyUI,
    updateSetOptions,
    generateQuestions,
    generateQuestionsBackground,
    initAIGenerator,
    showPreviewModal,
    hidePreviewModal,
    addSelectedQuestions,
    getQuestionSchema,
    updateBackgroundIndicator,
    updateTemplateSelect,
    saveCurrentTemplate,
    applyTemplate
};

window.generateQuestions = generateQuestions;