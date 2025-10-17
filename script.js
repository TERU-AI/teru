// SEO-Expert フロントロジック（GPT-4-turbo向け）
// PROXY: Render proxy that forwards to OpenAI (no API key in browser)
const API_BASE = "https://teru-ai-proxy-u76v.onrender.com"; // <- your proxy

// DOM
const keywordsEl = document.getElementById("keywords");
const toneEl = document.getElementById("tone");
const formatEl = document.getElementById("format");
const seoExpertEl = document.getElementById("seoExpert");
const titleSuggestEl = document.getElementById("titleSuggest");
const generateImageEl = document.getElementById("generateImage");

const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const titleBox = document.getElementById("titleSuggestions");
const eyecatch = document.getElementById("eyecatchPreview");
const imageStatus = document.getElementById("imageStatus");
const downloadImageLink = document.getElementById("downloadImage");

// Helpers
const charCount = s => s ? s.length : 0;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function callChatCompletions(payload) {
  // forwards to proxy which calls OpenAI
  const res = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Proxy/chat error: ${res.status} ${txt}`);
  }
  const text = await res.json();
  // return full API response (choices)
  return text;
}

async function callImageGenerations(payload) {
  const res = await fetch(`${API_BASE}/v1/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Proxy/image error: ${res.status} ${txt}`);
  }
  const json = await res.json();
  return json;
}

// Build prompts
function buildSEOExpertSystem() {
  return `あなたはSEO検定1級の合格レベルを満たすプロの日本語ウェブライター兼コンテンツストラテジストです。出力は指定に厳密に従い、読みやすく信頼感のある日本語で書いてください。`;
}

function buildSEOExpertUser(keywords, tone, format) {
  const kw = keywords.split(/[、,]/).map(s=>s.trim()).filter(Boolean).slice(0,5).join("、");
  return `以下の条件に従って日本語の記事を作成してください。

条件:
- 主要キーワード: ${kw}
- 文字数: 導入文を含め**必ず3000文字以上**にしてください（途中で切れないよう完全な記事を出力）。
- 構成: SEOタイトル（70字以内目安）、メタディスクリプション（120-160字推奨）、H1,H2,H3を適切に配置。
- H2を**3つ以上**作成し、それぞれのH2配下に**H3を3つ以上**含め、それぞれH3は実践的な手順・具体例・チェックリストを含めること。
- 各見出しは適切な語句を使い、H2/H3にキーワードまたは派生語を入れてください。
- 冒頭200文字以内に主要キーワードを1回以上入れること。
- 記事中に内部リンク候補（アンカーテキストとURL）を3件提示すること。
- FAQを3件追加（Q/A形式で短めに回答）。
- 最後にまとめ（結論・CTA）を必ず入れること。
- 出力フォーマット: ${format === 'html' ? 'HTML（hタグ、pタグを使用）' : 'プレーンテキスト（見出しは # で表記）'}。
- 口調: ${tone}
- 検索意図（インフォメーショナル/トランザクショナル/ナビゲーショナル のどれを想定したか）を冒頭で明記すること。
- SEOチェックリスト（タイトル長、メタ長、Hタグの有無、主要キーワード出現回数、内部リンク有無、外部参照の提案）を最後に追記すること。

出力例（HTMLの場合の簡略）:
<h1>タイトル</h1>
<p>導入（リード）</p>
<h2>見出し1</h2>
<h3>小見出し1-1</h3>
<p>...</p>

上記を厳密に守って、読みやすく信頼性の高い記事を作成してください。参考の記載が必要なら「参考: 公式サイトや信頼できる情報源を確認してください」と追記してください。`;
}

function buildTitlePrompt(keywords, tone) {
  return `あなたはプロのコピーライターです。次のキーワードに基づき、クリックされやすくSEOに強い日本語のタイトル案を3つ提案してください。各案は30～60文字で、数字・ベネフィット・疑問を一つ以上含めてください。\nキーワード: ${keywords}\n口調: ${tone}\n出力フォーマット:\n1) タイトルA\n2) タイトルB\n3) タイトルC`;
}

// Generate loop ensuring >= targetChars
async function generateWithEnsure(promptSystem, promptUser, format, targetChars=3000) {
  // initial request
  const messages = [
    { role: "system", content: promptSystem },
    { role: "user", content: promptUser }
  ];
  let payload = {
    model: "gpt-4-turbo",
    messages,
    temperature: 0.2,
    max_tokens: 2500
  };

  let response = await callChatCompletions(payload);
  let content = (response.choices?.[0]?.message?.content) || "";

  // If too short and target requested, do continuations
  let attempts = 0;
  while (charCount(content) < targetChars && attempts < 6) {
    attempts++;
    statusEl.textContent = `追記リクエスト中…（試行 ${attempts}） 現在 ${charCount(content)}文字`;
    // Ask to continue with context
    const contMessages = [
      { role: "system", content: promptSystem },
      { role: "user", content: `既に生成された本文を以下に示します。続きを書いて、全体で少なくとも${targetChars}文字以上になるようにしてください。同じ口調と構成を保ってください。\n\n=== 既存 ===\n${content}\n\n=== 続き ===` }
    ];
    payload.messages = contMessages;
    payload.max_tokens = 1500;
    const contResp = await callChatCompletions(payload);
    const addition = (contResp.choices?.[0]?.message?.content) || "";
    content = content + "\n\n" + addition;
    await wait(300); // small delay
  }
  return content;
}

// main generate handler
document.getElementById("generate").addEventListener("click", async () => {
  const keywords = (keywordsEl.value || "").trim();
  if (!keywords) { alert("キーワードを入力してください"); return; }

  const tone = toneEl.value;
  const format = formatEl.value;
  const seoExpert = seoExpertEl.checked;
  const doTitle = titleSuggestEl.checked;
  const doImage = generateImageEl.checked;

  // reset UI
  statusEl.textContent = "処理開始…";
  resultEl.textContent = "";
  titleBox.innerHTML = "";
  eyecatch.style.display = "none";
  imageStatus.textContent = "（生成オフ）";

  try {
    // Title suggestions (optional)
    if (doTitle) {
      statusEl.textContent = "タイトル案を生成中…";
      const titlePrompt = buildTitlePrompt(keywords, tone);
      const titleRes = await callChatCompletions({
        model: "gpt-4-turbo",
        messages: [{ role: "user", content: titlePrompt }],
        temperature: 0.6,
        max_tokens: 300
      });
      const titleText = titleRes.choices?.[0]?.message?.content || "";
      // simple parse lines
      titleBox.innerHTML = titleText.split(/\n/).map(line => `<div>${line}</div>`).join("");
    }

    // Article generation
    statusEl.textContent = "記事を生成中（初回）…";
    let finalContent = "";
    if (seoExpert) {
      const system = buildSEOExpertSystem();
      const userPrompt = buildSEOExpertUser(keywords, tone, format);
      finalContent = await generateWithEnsure(system, userPrompt, format, 3000);
    } else {
      // Basic prompt
      const basicSystem = "あなたは役に立つアシスタントです。日本語でわかりやすく記事を書いてください。";
      const basicUser = `キーワード: ${keywords}\n口調: ${tone}\n出力形式: ${format}\n簡潔かつ実用的な記事を作成してください。`;
      const resp = await callChatCompletions({
        model: "gpt-4-turbo",
        messages: [{ role: "system", content: basicSystem }, { role: "user", content: basicUser }],
        temperature: 0.3,
        max_tokens: 2000
      });
      finalContent = resp.choices?.[0]?.message?.content || "";
    }

    // Output formatting
    if (format === "text") {
      // keep as-is
      resultEl.textContent = finalContent;
    } else {
      // HTML expected — ensure safe display in <pre>
      resultEl.textContent = finalContent;
    }
    statusEl.textContent = `生成完了（${charCount(finalContent)}文字）`;

    // Image generation (optional)
    if (doImage) {
      try {
        imageStatus.textContent = "アイキャッチ生成中…";
        // Build simple prompt
        const imgPrompt = `ブログのアイキャッチ画像（1200x630px）を作成してください。テーマ: ${keywords}. シンプルで視認性が良く、テキストを重ねられる余白を上部に確保してください。`;
        const imgResp = await callImageGenerations({
          model: "gpt-image-1-mini",
          prompt: imgPrompt,
          size: "1200x630",
          response_format: "b64_json"
        });
        const b64 = imgResp.data?.[0]?.b64_json;
        if (b64) {
          const url = "data:image/jpeg;base64," + b64;
          eyecatch.src = url;
          eyecatch.style.display = "block";
          downloadImageLink.href = url;
          downloadImageLink.style.display = "inline-block";
          imageStatus.textContent = "画像生成完了";
        } else {
          imageStatus.textContent = "画像生成に失敗しました。";
        }
      } catch (ie) {
        console.error(ie);
        imageStatus.textContent = "画像生成エラー";
      }
    }

  } catch (err) {
    console.error(err);
    statusEl.textContent = "エラーが発生しました。コンソールを確認してください。";
  }
});

// copy / download
document.getElementById("copy").addEventListener("click", () => {
  navigator.clipboard.writeText(resultEl.textContent || "").then(()=>alert("コピーしました"));
});
document.getElementById("download").addEventListener("click", () => {
  const blob = new Blob([resultEl.textContent || ""], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `article-${Date.now()}.txt`;
  a.click();
});
document.getElementById("clear").addEventListener("click", () => {
  keywordsEl.value = "";
  resultEl.textContent = "";
  titleBox.innerHTML = "";
  eyecatch.style.display = "none";
  statusEl.textContent = "—";
});
