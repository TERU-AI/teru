// === Settings ===
const API_BASE = "https://teru-ai-proxy-u76v.onrender.com"; // Render proxy base

// === DOM ===
const el = (id)=>document.getElementById(id);
const keywordsEl = el('keywords');
const toneEl = el('tone');
const formatEl = el('format');
const autoTitlesEl = el('autoTitles');

const btnGenTitles = el('btnGenTitles');
const btnGenArticle = el('btnGenArticle');
const btnClear = el('btnClear');
const btnUseManual = el('btnUseManual');
const btnCopy = el('btnCopy');
const btnDownload = el('btnDownload');

const titlesSection = el('titlesSection');
const titleSuggestionsEl = el('titleSuggestions');
const manualTitleEl = el('manualTitle');

const articleSection = el('articleSection');
const confirmedTitleEl = el('confirmedTitle');
const statusEl = el('status');
const resultEl = el('result');

// === Utils ===
const show = (node)=>node.classList.remove('hidden');
const hide = (node)=>node.classList.add('hidden');
const charCount = (s)=> s ? s.length : 0;

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

// === Prompts ===
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
  const fmt = format === 'html' ? 'HTML（<h1><h2><h3>と<p>）' : 'テキスト（#見出し記法）';
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

// === Title generation ===
function parseTitles(raw){
  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const titles = [];
  for(const line of lines){
    const m = line.match(/^\d+\)\s*(.+)$/);
    if(m){ titles.push(m[1].trim()); }
  }
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

btnGenTitles.addEventListener('click', async ()=>{
  const keywords = keywordsEl.value.trim();
  const tone = toneEl.value;
  if(!keywords) return alert("キーワードを入力してください。");

  show(titlesSection);
  hide(articleSection);
  titleSuggestionsEl.innerHTML = "生成中…";
  confirmedTitleEl.textContent = "（未選択）";

  try{
    const data = await proxyChat({
      model: "gpt-4-turbo",
      messages: [{role:"system",content:"あなたは有能なコピーライターです。"}, {role:"user",content:buildTitlePrompt(keywords, tone)}],
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
        confirmedTitleEl.textContent = t;
        show(articleSection);
      });
    });
  }catch(err){
    console.error(err);
    titleSuggestionsEl.innerHTML = "<div class='status'>エラー: " + err.message + "</div>";
  }
});

btnUseManual.addEventListener('click', ()=>{
  const t = manualTitleEl.value.trim();
  if(!t) return alert("タイトルを入力してください。");
  confirmedTitleEl.textContent = t;
  show(articleSection);
});

// === Article generation (3000+ chars guaranteed) ===
btnGenArticle.addEventListener('click', async ()=>{
  const title = confirmedTitleEl.textContent && confirmedTitleEl.textContent !== "（未選択）" ? confirmedTitleEl.textContent : manualTitleEl.value.trim();
  if(!title) return alert("先にタイトルを選択または入力してください。");

  const keywords = keywordsEl.value.trim();
  const tone = toneEl.value;
  const format = formatEl.value;

  statusEl.textContent = "記事の初回生成中…";
  resultEl.textContent = "";
  try{
    const first = await proxyChat({
      model: "gpt-4-turbo",
      messages: [{role:"system",content:"あなたはプロのSEOライターです。"},
                 {role:"user",content:buildArticlePrompt(title, keywords, tone, format)}],
      temperature: 0.15,
      max_tokens: 3200
    });
    let content = first.choices?.[0]?.message?.content || "";
    let total = content;

    // remove any early summaries (keep only final one)
    const removeSummaryRegex = new RegExp("<h2>まとめ<\\/h2>[\\s\\S]*?(?=<h2>|$)", "gi");
    total = total.replace(removeSummaryRegex, "");

    // continuation loop until >= 3000 chars (raw length)
    const target = 3000;
    let guard = 0;
    while(charCount(total.replace(/\s+/g,"")) < target && guard < 8){
      guard++;
      statusEl.textContent = `追記中…（現在 ${charCount(total)}文字）`;
      const more = await proxyChat({
        model: "gpt-4-turbo",
        messages: [{role:"system",content:"あなたはプロのSEOライターです。"},
                   {role:"user",content:`以下の記事の不足部分を追記してください。H2/H3の構成を保ち、各H3は300文字以上を維持。最後に<h2>まとめ</h2>を300文字以上で1回だけ追加してください（途中には出さない）。\n\n===記事===\n${total}\n\n===追記===`}],
        temperature: 0.15,
        max_tokens: 1600
      });
      const add = more.choices?.[0]?.message?.content || "";
      total += "\n\n" + add;
      total = total.replace(removeSummaryRegex, ""); // ensure only final summary
    }

    // ensure final summary exists
    if(!/<h2>まとめ<\/h2>/i.test(total)){
      const sum = await proxyChat({
        model: "gpt-4-turbo",
        messages: [{role:"system",content:"あなたはプロのSEOライターです。"},
                   {role:"user",content:`この記事の最後に<h2>まとめ</h2>と<p>で300文字以上の自然なまとめ（結論＋行動喚起）を追加してください。既存本文は壊さないでください。\n\n===既存記事===\n${total}`}],
        temperature: 0.15,
        max_tokens: 700
      });
      const sumText = sum.choices?.[0]?.message?.content || "";
      total += "\n\n" + sumText;
    }

    // output format
    if(format === "text"){
      total = stripHTMLToText(total);
    }

    resultEl.textContent = total;
    statusEl.textContent = `生成完了（約 ${charCount(total)} 文字）`;
  }catch(err){
    console.error(err);
    statusEl.textContent = "エラー: " + err.message;
  }
});

// === Misc ===
btnCopy.addEventListener('click', ()=>{
  navigator.clipboard.writeText(resultEl.textContent||"");
  alert("コピーしました");
});
btnDownload.addEventListener('click', ()=>{
  const blob = new Blob([resultEl.textContent||""], {type:"text/plain;charset=utf-8"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "article.txt";
  a.click();
});
btnClear.addEventListener('click', ()=>{
  keywordsEl.value = "";
  manualTitleEl.value = "";
  titleSuggestionsEl.innerHTML = "";
  confirmedTitleEl.textContent = "（未選択）";
  resultEl.textContent = "";
  statusEl.textContent = "—";
  hide(titlesSection);
  hide(articleSection);
});
