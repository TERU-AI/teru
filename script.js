// === Settings ===
const API_BASE = "https://teru-ai-proxy-u76v.onrender.com"; // Render proxy

// === DOM helpers ===
const el = (id)=>document.getElementById(id);
const show = (node)=>node.classList.remove('hidden');
const hide = (node)=>node.classList.add('hidden');
const charCount = (s)=> s ? s.length : 0;

// === Elements ===
const keywordsEl = el('keywords');
const toneEl = el('tone');
const formatEl = el('format');

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

// === API proxy ===
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

function buildSERPPlanPrompt(title, keywords){
  return `次のブログタイトルとキーワードで、Google検索の1ページ目上位サイトに共通するH2見出しの要素を抽象化・一般化して、リライトしたH2候補を少なくとも6個提案してください。
- コピーは厳禁。一般化・言い換え・要素分解で独自性を確保する。
- 主要キーワードまたは派生語をH2に含める。
- 出力は「H2: ...」形式の箇条書き。

タイトル: ${title}
キーワード: ${keywords}`;
}

function buildArticlePromptWithPlan(title, keywords, tone, format, planH2List){
  const fmt = format === 'html' ? 'HTML（<h1><h2><h3>と<p>）' : 'テキスト（#見出し記法）';
  const joined = planH2List.slice(0,8).map(h=>`- ${h}`).join('\n');
  return `あなたはSEO検定1級レベルの日本語ライターです。次のH2候補プランから最低4つ以上を採用し、以下の厳密な条件で完全な記事を${fmt}で出力してください（途中で切らない）。
タイトル: ${title}
キーワード: ${keywords}
口調: ${tone}

採用候補（参考・必要に応じて調整可、ただしキーワードは見出しに自然に含める）:
${joined}

厳密条件:
- 導入（リード）は400文字以上。共感＋問題提起＋読むメリットを含める。
- 本文は、導入 → H2（4つ以上） → 各H2の下にH3を4つ以上配置し、各H3の本文は300文字以上にする。
- 最後に「まとめ」を1回だけ配置し、500文字以上の自然な本文（結論＋具体的行動）を書く。まとめ以降は何も出力しない。
- FAQは生成しない。
- すべてのH2の見出しに主要キーワードまたは派生語を1回以上含める。
- 文章は冗長にせず、例・手順・注意点・チェックリストなど具体性を重視する。`;
}

// === Title generation ===
function parseTitles(raw){
  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const titles = [];
  for(const line of lines){
    const m = line.match(/^(\d+)\)\s*(.+)$/);
    if(m){ titles.push(m[2].trim()); }
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

// === Event: Title Generation ===
btnGenTitles.addEventListener('click', async ()=>{
  const keywords = keywordsEl.value.trim();
  const tone = toneEl.value;
  if(!keywords) return alert("キーワードを入力してください。");
  show(titlesSection); hide(articleSection);
  titleSuggestionsEl.innerHTML = "生成中…"; confirmedTitleEl.textContent = "（未選択）";

  try{
    const data = await proxyChat({
      model: "gpt-4-turbo",
      messages: [
        {role:"system",content:"あなたは有能なコピーライターです。"},
        {role:"user",content:buildTitlePrompt(keywords, tone)}
      ],
      max_tokens: 400,
      temperature: 0.6
    });
    const text = data.choices?.[0]?.message?.content || "";
    const titles = parseTitles(text);
    if(!titles.length){ titleSuggestionsEl.innerHTML = "<div class='status'>タイトル抽出に失敗しました。</div>"; return; }
    titleSuggestionsEl.innerHTML = titles.map((t,i)=>`<button class="title-btn" data-title="${t}">${i+1}. ${t}</button>`).join("");
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

// === Manual Title Use ===
btnUseManual.addEventListener('click', ()=>{
  const t = manualTitleEl.value.trim();
  if(!t) return alert("タイトルを入力してください。");
  confirmedTitleEl.textContent = t;
  show(articleSection);
});

// === Article Generation ===
btnGenArticle.addEventListener('click', async ()=>{
  const title = confirmedTitleEl.textContent && confirmedTitleEl.textContent !== "（未選択）" ? confirmedTitleEl.textContent : manualTitleEl.value.trim();
  if(!title) return alert("先にタイトルを選択または入力してください。");

  const keywords = keywordsEl.value.trim();
  const tone = toneEl.value;
  const format = formatEl.value;

  statusEl.textContent = "SERP見出しプラン作成中…";
  resultEl.textContent = "";

  try{
    // Step1: SERP-like H2 plan
    const planRes = await proxyChat({
      model: "gpt-4-turbo",
      messages: [
        {role:"system",content:"あなたは熟練のSEOコンテンツプランナーです。"},
        {role:"user",content:buildSERPPlanPrompt(title, keywords)}
      ],
      temperature: 0.3,
      max_tokens: 600
    });
    const planText = planRes.choices?.[0]?.message?.content || "";
    const planH2 = planText.split(/\r?\n/).map(l=>l.replace(/^H2:\s*/i,'').trim()).filter(l=>l);

    // Step2: Generate main article
    statusEl.textContent = "本文の初回生成中…";
    const articleRes = await proxyChat({
      model: "gpt-4-turbo",
      messages: [
        {role:"system",content:"あなたはプロのSEOライターです。"},
        {role:"user",content:buildArticlePromptWithPlan(title, keywords, tone, format, planH2)}
      ],
      temperature: 0.2,
      max_tokens: 3200
    });
    let total = articleRes.choices?.[0]?.message?.content || "";

    // === Remove early summaries ===
    total = total.replace(/<h2>まとめ<\/h2>[\s\S]*?(?=<h2>|$)/gi, "");

    // === Continuation loop ===
    const target = 3200;
    let guard = 0;
    while(charCount(total.replace(/\s+/g,"")) < target && guard < 8){
      guard++;
      statusEl.textContent = `追記中…（現在 ${charCount(total)}文字）`;
      const contRes = await proxyChat({
        model: "gpt-4-turbo",
        messages: [
          {role:"system",content:"あなたはプロのSEOライターです。"},
          {role:"user",content:`以下の記事を条件に従い追記してください。H3を4つ以上、各H3は300文字以上で具体例や手順を追加。最後に<h2>まとめ</h2>（500文字以上）を1回だけ末尾に追加。\n\n===記事===\n${total}\n\n===追記===`}
        ],
        temperature: 0.18,
        max_tokens: 1600
      });
      const add = contRes.choices?.[0]?.message?.content || "";
      total += "\n\n" + add;
      total = total.replace(/<h2>まとめ<\/h2>[\s\S]*?(?=<h2>|$)/gi, "");
    }

    // === Ensure single summary ===
    if(!/<h2>まとめ<\/h2>/i.test(total)){
      const sumRes = await proxyChat({
        model: "gpt-4-turbo",
        messages: [
          {role:"system",content:"あなたはプロのSEOライターです。"},
          {role:"user",content:`この記事の最後に<h2>まとめ</h2>と<p>で500文字以上の自然なまとめ（結論＋行動喚起）を追加してください。既存本文は壊さないでください。\n\n===既存記事===\n${total}`}
        ],
        temperature: 0.15,
        max_tokens: 700
      });
      total += "\n\n" + (sumRes.choices?.[0]?.message?.content || "");
    }

    // === Output format ===
    let out = total;
    if(format === "text"){
      out = out
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
        .replace(/<[^>]+>/g,'')
        .replace(/\n{3,}/g,'\n\n')
        .trim();
    }

    resultEl.textContent = out;
    statusEl.textContent = `生成完了（約 ${charCount(out)} 文字）`;
    show(articleSection);
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
