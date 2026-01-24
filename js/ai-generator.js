/**
 * ai-generator.js - AI問題生成機能
 * OpenAI Responses API (GPT-5 mini) + Structured Outputsを使用
 */

// ==================== 状態管理 ====================

const AIState = {
    generatedQuestions: [],
    selectedQuestions: new Set(),
    uploadedImages: [],
    targetSetId: null,
    newSetName: null,
    MAX_IMAGES: 3
};

// ==================== APIキー管理 ====================

function saveApiKey(key) {
    if (!key || !key.trim()) {
        localStorage.removeItem('openai_api_key');
        return;
    }
    localStorage.setItem('openai_api_key', btoa(key.trim()));
}

function getApiKey() {
    const encoded = localStorage.getItem('openai_api_key');
    if (!encoded) return null;
    try {
        return atob(encoded);
    } catch (e) {
        console.error('APIキーの復号に失敗:', e);
        return null;
    }
}

function deleteApiKey() {
    localStorage.removeItem('openai_api_key');
}

function hasApiKey() {
    return !!getApiKey();
}

// ==================== UI更新 ====================

function updateApiKeyUI() {
    const apiKeyInput = document.getElementById('openai-api-key');
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

// ==================== プロンプト生成 ====================

function buildSystemPrompt(questionType, isLanguageLearning, audioLang, numImages, mode) {
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

    return `教育問題作成プロ。素材から高品質問題を作成。
${imageInstruction}

**原則**
1. 素材の内容のみ使用
2. 問題文と選択肢を分離
3. 画像の選択肢はA,B,C,Dに変換
4. **解説は必ずMarkdown形式で記述**。問題文はMarkdownマストではない。
5. **タイトルは問題内容がわかりやすい短い見出しを付ける**（答えを含んでも良い。学習時は非表示のため）
${modeInstruction}

**出題形式**
${typeInstruction}
どの形式でも4択必須(minLength:1)

**ルール**

1. **問題文**: 
   - 選択肢内容を含めない。問いのみ
   - 複数の要素がある場合は改行で見やすく

2. **選択肢(本試験レベル)**:
   - 正解をA-Dにランダム配置
   - ひっかけ: 部分的正解や微妙な誤り
   - 具体的で明確

3. **Markdown表**: 比較/計算/分類/数値で使用。無駄な多用避ける。

4. **LaTeX数式**: 数学/物理/化学で必須。
   インライン:\`$F=ma$\`
   ディスプレイ:\`$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$\`

5. **解説(Markdown必須・200-300文字)**:

   **必須フォーマット:**
   - 正解理由を**太字**で強調
   - 誤答は箇条書き(- または番号)で整理
   - 改行を適切に使い読みやすく

   **重要: 選択肢シャッフル対応**
   - 解説では「A」「B」「C」「D」などの選択肢キーを**絶対に使わない**
   - 代わりに選択肢の内容そのものを引用して説明する
   - shuffleReady: true を必ず設定

   **良い例:**
   \`\`\`
   **正解は「ROEが高いほど効率的」です。** ROE(自己資本利益率)が高いほど、株主資本を効率的に活用していることを示します。

   **誤答解説:**
   - 「逆である」という選択肢 → 誤り。ROEは株主資本の効率性を示します
   - 「ROAと自己資本比率」という選択肢 → 誤り。別の指標です
   - 「正しいが理由が異なる」という選択肢 → 部分的に正解ですが、より本質的な理由があります

   **覚え方:** E=Equity(株主資本)、A=Assets(総資産)
   \`\`\`

   **悪い例(これは避ける - 選択肢キーを使用):**
   \`\`\`
   正解はB。A:逆。C:無関係。D:正しいがBがより本質的。
   \`\`\`

6. **タイピング(typing/both)**:
   4択必須+typingAnswer+acceptableAnswers
   caseSensitive=false, strictMatch=true

${languageInstruction}

**重要: すべての問題文と解説でMarkdownを活用し、改行・太字・箇条書きを使って読みやすくすること**

JSON Schemaに厳密準拠。`;
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

async function callOpenAIAPIText(systemPrompt, userPrompt) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('APIキーが設定されていません');
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-5-mini',
            input: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            text: {
                format: {
                    type: 'json_schema',
                    name: 'quiz_questions',
                    strict: true,
                    schema: getQuestionSchema()
                }
            }
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
    
    if (data.output && Array.isArray(data.output)) {
        const messageItem = data.output.find(item => item.type === 'message');
        if (messageItem && messageItem.content && Array.isArray(messageItem.content)) {
            const textContent = messageItem.content.find(c => c.type === 'output_text');
            if (textContent && textContent.text) {
                return textContent.text;
            }
        }
    }
    
    return data.output_text || JSON.stringify(data.output?.[0]);
}

async function callOpenAIAPIWithImages(systemPrompt, userPrompt, images) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('APIキーが設定されていません');
    }

    const imageContents = images.map(img => ({
        type: 'input_image',
        image_url: `data:${img.mimeType};base64,${img.base64}`
    }));

    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-5-mini',
            input: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        ...imageContents,
                        { type: 'input_text', text: userPrompt }
                    ]
                }
            ],
            text: {
                format: {
                    type: 'json_schema',
                    name: 'quiz_questions',
                    strict: true,
                    schema: getQuestionSchema()
                }
            }
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
    
    if (data.output && Array.isArray(data.output)) {
        const messageItem = data.output.find(item => item.type === 'message');
        if (messageItem && messageItem.content && Array.isArray(messageItem.content)) {
            const textContent = messageItem.content.find(c => c.type === 'output_text');
            if (textContent && textContent.text) {
                return textContent.text;
            }
        }
    }
    
    return data.output_text || JSON.stringify(data.output?.[0]);
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
                    <span class="choice-text markdown-content" data-markdown="${QuizUI.escapeHtml(choiceText)}">${QuizUI.escapeHtml(choiceText)}</span>
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
                    <div class="ai-preview-explanation">
                        <div class="ai-preview-explanation-label">💡 解説</div>
                        <div class="ai-preview-explanation-text markdown-content" data-markdown="${QuizUI.escapeHtml(q.explanation_md || '解説はありません')}"></div>
                    </div>
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

    if (sourceText) sourceText.value = '';
    if (instruction) instruction.value = '';

    clearAllImages();
    AIState.targetSetId = null;
    AIState.newSetName = null;
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

        // ★ modeを追加
        const systemPrompt = buildSystemPrompt(
            questionType,
            isLanguageLearning,
            audioLang,
            isImageInput ? AIState.uploadedImages.length : 0,
            mode  // ← 追加
        );
        const userPrompt = buildUserPrompt(mode, isImageInput ? '' : sourceText, instruction);

        let response;
        if (isImageInput) {
            response = await callOpenAIAPIWithImages(systemPrompt, userPrompt, AIState.uploadedImages);
        } else {
            response = await callOpenAIAPIText(systemPrompt, userPrompt);
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

// ==================== イベント ====================

function initAIGenerator() {
    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => {
            const input = document.getElementById('openai-api-key');
            const key = input?.value.trim();

            if (key === '••••••••••••••••') {
                QuizUI.showToast('APIキーは既に設定されています', 'info');
                return;
            }

            if (!key) {
                QuizUI.showToast('APIキーを入力してください', 'error');
                return;
            }

            if (!key.startsWith('sk-')) {
                QuizUI.showToast('有効なOpenAI APIキーを入力してください', 'error');
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
            const input = document.getElementById('openai-api-key');
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

    setupPreviewModalEvents();
    updateApiKeyUI();
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
    initAIGenerator,
    showPreviewModal,
    hidePreviewModal,
    addSelectedQuestions,
    getQuestionSchema
};

window.generateQuestions = generateQuestions;