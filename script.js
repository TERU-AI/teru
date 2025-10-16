// script.js（Renderプロキシ連携版）
// 記事生成: GPT-4-turbo
// アイキャッチ生成: gpt-image-1-mini（軽量・高速）
// CORS回避：Render側プロキシ経由

const PROXY_URL = "https://teru-ai-proxy.onrender.com"; // ← RenderのデプロイURLに置き換え

function charCount(s){ return s ? s.length : 0; }
function copyToClipboard(t){ navigator.clipboard.writeText(t); alert("コピーしました"); }
function downloadText(name, text){ const b=new Blob([text]); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); }

function buildArticlePrompt(keywords, tone, format) {
  return `あなたはSEO検定1級レベルの日本語ライターです。キーワード「${keywords}」で、3000文字以上の記事を${format==='html'?'HTML':'プレーンテキスト'}で作成してください。
条件:
- タイトル・導入・H2×3以上・H3×3以上・まとめを含める
- 実践的内容を多く入れる
- 主要キーワードを自然に散りばめる
- 口調: ${tone}`;
}

// プロキシ経由でChat呼び出し
async function callChat(messages, max_tokens=2000, temperature=0.3){
  const res = await fetch(`${https://teru-ai-proxy.onrender.com}/v1/chat`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ messages, max_tokens, temperature })
  });
  if(!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

// プロキシ経由でImage呼び出し
async function callImage(prompt, size="1200x630"){
  const res = await fetch(`${PROXY_URL}/v1/image`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ prompt, size })
  });
  if(!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.data?.[0]?.b64_json;
}

// メイン処理
async function generateArticle(){
  const kw = document.getElementById("keywords").value.trim();
  const tone = document.getElementById("tone").value;
  const format = document.getElementById("format").value;
  const img = document.getElementById("generateImage").checked;
  const status = document.getElementById("status");
  const result = document.getElementById("result");

  if(!kw){ alert("キーワードを入力してください。"); return; }

  status.textContent = "生成中...";
  result.textContent = "";

  try {
    const prompt = buildArticlePrompt(kw, tone, format);
    const content = await callChat([{role:"user", content:prompt}], 2000, 0.3);
    result.textContent = content;
    status.textContent = `記事生成完了（${charCount(content)}文字）`;

    if(img){
      const imgPrompt = `ブログ用アイキャッチ画像。テーマ: ${kw}, シンプルで明るく視認性高い構図`;
      const b64 = await callImage(imgPrompt);
      document.getElementById("eyecatch").src = "data:image/jpeg;base64," + b64;
      document.getElementById("eyecatch").style.display = "block";
    }
  } catch(e){
    status.textContent = "エラー: " + e.message;
  }
}
