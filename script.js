// Render proxy base (no trailing slash path in code except route)
const API_BASE = "https://teru-ai-proxy-u76v.onrender.com";

// DOM refs
const keywordsEl = document.getElementById('keywords');
const toneEl = document.getElementById('tone');
const formatEl = document.getElementById('format');

const genTitlesBtn = document.getElementById('genTitles');
const genArticleBtn = document.getElementById('genArticle');
const clearBtn = document.getElementById('clear');

const titlesArea = document.getElementById('titlesArea');
const titleSuggestionsEl = document.getElementById('titleSuggestions');
const manualTitleEl = document.getElementById('manualTitle');
const useManualBtn = document.getElementById('useManual');

const articleArea = document.getElementById('articleArea');
const selectedTitleEl = document.getElementById('selectedTitle');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const copyBtn = document.getElementById('copy');
const downloadBtn = document.getElementById('download');

let selectedTitle = '';

// helpers
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');
const charCount = s => s ? s.length : 0;

function stripHTMLToText(html){
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
    .replace(/<[^>]+>/g,'')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

async function proxyChat(body){
  const res = await fetch(API_BASE + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const txt = await res.text();
    throw new Error("Proxy error: " + res.status + " " + txt);
  }
  return await res.json();
}

// prompts
function buildTitlePrompt(keywords, tone){
  return `あなたはSEOに強い日本語コピーライターです。以下のキーワードを必ず含め、クリックされやすい魅力的なタイトルを3案提案してください。
各タイトルは30〜60文字で、数字・疑問・ベネフィットなどのフックを入れてください。
口調: ${tone}
キーワード: ${keywords}

出力形式:
1) タイトル案A
2) タイトル案B
3) タイトル案C`;
}

function buildArticlePrompt(title, keywords, tone, format){
  const fmt = format === 'html' ? 'HTML（見出しは<h1><h2><h3>、本文は<p>）' : 'テキスト（#見出し記法）';
  return `あなたはSEO検定1級レベルの日本語ライターです。以下の条件で完全な記事だけを${fmt}で出力してください（途中で切らない）。
タイトル: ${title}
キーワード: ${keywords}
口調: ${tone}

必須条件:
- 導入（リード）は300文字以上。共感＋問題提起を含める。
- 本文は、導入 → H2（3つ以上） → 各H2の下にH3を2つ以上（各300文字以上）とする。
- 最後に「まとめ」を1回だけ配置し、300文字以上の自然な本文（結論＋行動喚起）を書く。まとめ以降は何も出力しない。
- FAQは生成しない。
- すべてのH2の見出しに主要キーワードまたは派生語を含める。
- 検索意図（インフォメーショナル/トランザクショナル/ナビゲーショナル）を冒頭で明示する。`;
}

// parse titles safely
function parseTitles(raw){
  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const titles = [];
  for(const line of lines){
    const m = line.match(/^\d+\)\s*(.+)$/); // ← 正しい正規表現（バックスラッシュは1つ）
    if(m){ titles.push(m[1].trim()); }
  }
  // フォーマット外の返答対策：行頭がダッシュ等でない文も拾う（最大3件）
  if(titles.length === 0){
    for(const line of lines){
      if(!/^[-*]/.test(line) && line.length >= 5){
        titles.push(line);
        if(titles.length >= 3) break;
      }
    }
  }
  return titles.slice(0,3);
}

// events
genTitlesBtn.addEventListener('click', async ()=>{
  const keywords = keywordsEl.value.trim();
  const tone = toneEl.value;
  if(!keywords) return alert("キーワードを入力してください。");
  titleSuggestionsEl.innerHTML = "生成中…";
  show(titlesArea);
  hide(articleArea);
  selectedTitle = '';
  selectedTitleEl.textContent = '（未選択）';

  try{
    const prompt = buildTitlePrompt(keywords, tone);
    const data = await proxyChat({
      model: "gpt-4-turbo",
      messages: [{role:"system",content:"あなたは有能なコピーライターです。"}, {role:"user",content:prompt}],
      max_tokens: 400,
      temperature: 0.6
    });
    const text = data.choices?.[0]?.message?.content || "";
    const titles = parseTitles(text);
    if(!titles.length){
      titleSuggestionsEl.innerHTML = "<div class='status'>タイトル候補の抽出に失敗しました。</div>";
      return;
    }
    titleSuggestionsEl.innerHTML = titles.map((t,i)=>
      `<button class="title-btn" data-title="${t}">${i+1}. ${t}</button>`
    ).join("");
    document.querySelectorAll(".title-btn").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const t = btn.getAttribute("data-title");
        manualTitleEl.value = t;
        selectedTitle = t;
        selectedTitleEl.textContent = t;
        show(articleArea);
      });
    });
  }catch(err){
    console.error(err);
    titleSuggestionsEl.innerHTML = "<div class='status'>エラー: " + err.message + "</div>";
  }
});

useManualBtn.addEventListener('click', ()=>{
  const t = manualTitleEl.value.trim();
  if(!t) return alert("タイトルを入力してください。");
  selectedTitle = t;
  selectedTitleEl.textContent = t;
  show(articleArea);
});

genArticleBtn.addEventListener('click', async ()=>{
  if(!selectedTitle) return alert("先にタイトルを選択または入力してください。");
  const keywords = keywordsEl.value.trim();
  const tone = toneEl.value;
  const format = formatEl.value;

  statusEl.textContent = "記事の初回生成中…";
  resultEl.textContent = "";
  try{
    const prompt = buildArticlePrompt(selectedTitle, keywords, tone, format);
    const data = await proxyChat({
      model: "gpt-4-turbo",
      messages: [{role:"system",content:"あなたはプロのSEOライターです。"}, {role:"user",content:prompt}],
      temperature: 0.15,
      max_tokens: 3500
    });
    let content = data.choices?.[0]?.message?.content || "";

    // 途中の「まとめ」を一旦削除（最後に1回だけ）
    content = content.replace(new RegExp("<h2>まとめ<\\/h2>[\\s\\S]*?(?=<h2>|$)", "gi"), "");

    // 3,000文字相当まで追記要求（必要時のみ）
    const minChars = 3000;
    const compactLen = content.replace(/\s+/g,"").length;
    if(compactLen < minChars){
      const contPrompt = `以下の記事を3000文字以上になるように不足箇所を追記してください。各H3は300文字以上を維持し、最後に<h2>まとめ</h2>を1回だけ（300文字以上）追加します。既存のまとめは削除対象です。

===記事===
${content}

===追記===`;
      const more = await proxyChat({
        model: "gpt-4-turbo",
        messages: [{role:"system",content:"あなたはプロのSEOライターです。"}, {role:"user",content:contPrompt}],
        temperature: 0.15,
        max_tokens: 1800
      });
      const addition = more.choices?.[0]?.message?.content || "";
      content += "\n\n" + addition;
      content = content.replace(new RegExp("<h2>まとめ<\\/h2>[\\s\\S]*?(?=<h2>|$)", "gi"), "");
    }

    // 最後のまとめが無い場合は追加生成
    if(!/<h2>まとめ<\/h2>/i.test(content)){
      const sumRes = await proxyChat({
        model: "gpt-4-turbo",
        messages: [{role:"system",content:"あなたはプロのSEOライターです。"}, {role:"user",content:`この記事の最後に<h2>まとめ</h2>と<p>で300文字以上の自然なまとめ（結論＋行動喚起）を追加してください。既存本文は壊さないでください。\n\n===既存記事===\n${content}`}],
        temperature: 0.15,
        max_tokens: 700
      });
      const sumText = sumRes.choices?.[0]?.message?.content || "";
      content += "\n\n" + sumText;
    }

    // テキスト形式に変換
    if(format === "text"){
      content = stripHTMLToText(content);
    }

    resultEl.textContent = content;
    statusEl.textContent = "生成完了（約 " + charCount(content) + " 文字）";
    show(articleArea);
  }catch(err){
    console.error(err);
    statusEl.textContent = "エラー: " + err.message;
  }
});

copyBtn.addEventListener('click', ()=>{
  navigator.clipboard.writeText(resultEl.textContent||"");
  alert("コピーしました");
});
downloadBtn.addEventListener('click', ()=>{
  const blob = new Blob([resultEl.textContent||""], {type:"text/plain;charset=utf-8"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "article.txt";
  a.click();
});

clearBtn.addEventListener('click', ()=>{
  keywordsEl.value = "";
  manualTitleEl.value = "";
  titleSuggestionsEl.innerHTML = "";
  selectedTitle = "";
  selectedTitleEl.textContent = "（未選択）";
  resultEl.textContent = "";
  statusEl.textContent = "—";
  hide(titlesArea);
  hide(articleArea);
});
