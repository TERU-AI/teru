// teru-ai-seo-plus-lite (GPT-4-turbo article + lightweight image model)
// Client-side; user must supply their OpenAI API key.
// NOTE: This client-side approach uses the user's OpenAI key and quota.

function saveKeyToLocal() {
  const k = document.getElementById('apiKey').value.trim();
  if (k) { localStorage.setItem('teru_ai_openai_key', k); alert('APIキーをローカルに保存しました（ブラウザのみ）。'); }
}
function loadKeyFromLocal() {
  const k = localStorage.getItem('teru_ai_openai_key');
  if (k) document.getElementById('apiKey').value = k;
}
function downloadText(filename, text) {
  const blob = new Blob([text], {type: 'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function copyToClipboard(text){
  navigator.clipboard.writeText(text).then(()=>{ alert('コピーしました'); }).catch(()=>{ alert('コピーに失敗しました'); });
}
function charCount(s){ return s ? s.length : 0; }

function buildTitlePrompt(keywords, tone) {
  return `あなたはクリックされやすい見出し（タイトル）を作るプロのコピーライターです。
次のキーワードに基づいて、魅力的でSEOに強い日本語のタイトルを3案提案してください。
各案は30〜60文字で、数字・疑問・ベネフィットを含めてください。
口調: ${tone}
キーワード: ${keywords}

出力フォーマット:
1) タイトル案A
2) タイトル案B
3) タイトル案C`;
}

function buildArticlePrompt(keywords, tone, format) {
  return `あなたはSEO検定1級レベルのプロの日本語ライターです。
以下の条件を守り、出力は${format === 'html' ? 'HTML' : 'プレーンテキスト'}で返してください。
- キーワード: ${keywords}
- 文字数: 冒頭を含め必ず3000文字以上
- 構成: タイトル、導入、H2×3（各H2にH3×3）、まとめ
- 口調: ${tone}`;
}

function buildContinuePrompt(existing) {
  return `以下は既に生成された記事の一部です。続きを書いてください。目標：合計で少なくとも3000文字以上になること。
===既存記事===
${existing}
===続き===`;
}

async function callChat(apiKey, messages, max_tokens=2000, temperature=0.2, model='gpt-4-turbo') {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens, temperature })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error('API error: ' + txt);
  }
  const data = await resp.json();
  return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;
}

async function callImageLight(apiKey, prompt, size="1200x630") {
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method:'POST',
    headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-image-1-mini', prompt: prompt + " --simple --low-detail --fast", size: size, response_format: 'b64_json' })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error('Image API error: ' + txt);
  }
  const data = await resp.json();
  return data.data && data.data[0] && data.data[0].b64_json ? data.data[0].b64_json : null;
}

async function generateTitleSuggestions(apiKey, keywords, tone) {
  const container = document.getElementById('titleSuggestions');
  container.textContent = 'タイトル候補を生成中...';
  try {
    const prompt = buildTitlePrompt(keywords, tone);
    const res = await callChat(apiKey, [{role:'user', content: prompt}], 800, 0.6);
    container.textContent = res || '（候補なし）';
  } catch (err) {
    container.textContent = 'タイトル生成エラー: ' + err.message;
  }
}

async function generateArticle() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const keywords = document.getElementById('keywords').value.trim();
  const tone = document.getElementById('tone').value;
  const seoMode = document.getElementById('seoMode').checked;
  const format = document.getElementById('format').value;
  const genTitle = document.getElementById('generateTitleAuto').checked;
  const genImage = document.getElementById('generateImage').checked;
  const imageStyle = document.getElementById('imageStyle').value;

  const status = document.getElementById('status');
  const result = document.getElementById('result');
  const titleBox = document.getElementById('titleSuggestions');
  const eyecatchPreview = document.getElementById('eyecatchPreview');
  const imageStatus = document.getElementById('imageStatus');
  const downloadImage = document.getElementById('downloadImage');

  if (!apiKey || !keywords) { alert('APIキーとキーワードを入力してください。'); return; }

  status.textContent = '処理開始...';
  result.textContent = '';
  titleBox.textContent = '';

  try {
    if (genTitle) await generateTitleSuggestions(apiKey, keywords, tone);

    status.textContent = '記事の初回生成中...';
    let content = await callChat(apiKey, [{role:'user', content: buildArticlePrompt(keywords, tone, format)}], 2000, 0.2);
    content = (content || '').trim();
    status.textContent = `初回生成完了（${charCount(content)}文字）`;

    if (seoMode) {
      const target = 3000;
      let attempts = 0;
      while (charCount(content) < target && attempts < 6) {
        attempts++;
        status.textContent = `追記リクエスト中…（試行 ${attempts}） 現在 ${charCount(content)}文字`;
        const cont = await callChat(apiKey, [{role:'user', content: buildContinuePrompt(content)}], 1500, 0.2);
        content = content + "\\n\\n" + ((cont || '').trim());
        status.textContent = `追記完了（${charCount(content)}文字）`;
        await new Promise(r=>setTimeout(r, 300));
      }
      if (charCount(content) < target) {
        status.textContent = `注意: 目標の${target}文字に到達できませんでした（${charCount(content)}文字）`;
      } else {
        status.textContent = `生成完了（${charCount(content)}文字）`;
      }
    }

    result.textContent = (format === 'text') ? content.replace(/<\/?[^>]+(>|$)/g, '\\n') : content;

    if (genImage) {
      try {
        imageStatus.textContent = 'アイキャッチ（軽量）生成中...';
        eyecatchPreview.style.display = 'none';
        downloadImage.style.display = 'none';

        const promptImg = `Simple blog cover: ${keywords}. Style: ${imageStyle}. Minimal details, bold shapes, clear focal point, space for title overlay.`;
        const b64 = await callImageLight(apiKey, promptImg, "1200x630");
        if (!b64) throw new Error('画像が生成されませんでした');
        let dataUrl = 'data:image/jpeg;base64,' + b64;

        await new Promise((resolve)=>{
          const img = new Image();
          img.onload = function(){
            const canvas = document.createElement('canvas');
            canvas.width = 1200;
            canvas.height = 630;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            eyecatchPreview.src = dataUrl;
            eyecatchPreview.style.display = 'block';
            downloadImage.href = dataUrl;
            downloadImage.style.display = 'inline-block';
            imageStatus.textContent = '生成完了（軽量）';
            resolve();
          };
          img.onerror = function(){ imageStatus.textContent = '画像ロード失敗'; resolve(); };
          img.src = dataUrl;
        });
      } catch (imgErr) {
        imageStatus.textContent = '画像生成エラー: ' + imgErr.message;
      }
    } else {
      imageStatus.textContent = '（生成オフ）';
    }

  } catch (err) {
    status.textContent = 'エラー';
    result.textContent = 'エラー: ' + err.message;
  }
}

document.getElementById('saveKey').addEventListener('click', saveKeyToLocal);
document.getElementById('generate').addEventListener('click', generateArticle);
document.getElementById('clear').addEventListener('click', ()=>{ document.getElementById('result').textContent=''; document.getElementById('status').textContent='—'; document.getElementById('titleSuggestions').textContent=''; document.getElementById('eyecatchPreview').style.display='none'; document.getElementById('imageStatus').textContent='（生成オフ）'; });
document.getElementById('copy').addEventListener('click', ()=>{ copyToClipboard(document.getElementById('result').textContent); });
document.getElementById('download').addEventListener('click', ()=>{ downloadText('article.txt', document.getElementById('result').textContent); });

loadKeyFromLocal();
