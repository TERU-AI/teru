// Settings
const API_BASE = "https://teru-ai-proxy-u76v.onrender.com";
const MODEL = "gpt-4-turbo";

// Constraints
const MIN_H2 = 4;
const MIN_H3_PER_H2 = 3;
const MIN_H3_CHARS = 300;
const TARGET_CHARS = 3000;

// DOM
const el = (id)=>document.getElementById(id);
const show = (n)=>n.classList.remove('hidden');
const hide = (n)=>n.classList.add('hidden');
const charCount = (s)=>s?s.length:0;

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

// API
async function proxyChat(body){
  const res = await fetch(API_BASE + "/chat/completions", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const txt = await res.text();
    throw new Error("Proxy error: " + res.status + " " + txt);
  }
  return await res.json();
}

// Prompts
function buildTitlePrompt(keywords,tone){
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
  return `次のブログタイトルとキーワードで、Google検索の1ページ目上位サイトに共通するH2見出しの要素を抽象化・一般化して、リライトしたH2候補を8個以上提案してください。
- コピーは厳禁。一般化・言い換え・要素分解で独自性を確保する。
- 主要キーワードまたは派生語をH2に含める。
- 出力は「H2: ...」形式の箇条書き。

タイトル: ${title}
キーワード: ${keywords}`;
}

function buildArticlePromptWithPlan(title, keywords, tone, format, planH2List){
  const fmt = format === 'html' ? 'HTML（<h1><h2><h3>と<p>）' : 'テキスト（#見出し記法）';
  const joined = planH2List.slice(0,10).map(h=>`- ${h}`).join('\n');
  return `あなたはSEO検定1級レベルの日本語ライターです。次のH2候補プランから最低4つ以上を採用し、以下の厳密な条件で完全な記事を${fmt}で出力してください（途中で切らない）。
タイトル: ${title}
キーワード: ${keywords}
口調: ${tone}

採用候補（参考・必要に応じて調整可、ただしキーワードは見出しに自然に含める）:
${joined}

厳密条件:
- 導入（リード）は300文字以上。共感＋問題提起＋読むメリットを含める。
- 本文は、導入 → H2（4つ以上） → 各H2の下にH3を3つ以上配置し、各H3の本文は300文字以上にする。
- Google検索の1ページ目の上位記事の構成要素を参考に、リライト・加筆して有益性を高める（コピーは不可）。
- 最後に「まとめ」を1回だけ配置し、300文字以上の自然な本文（結論＋具体的行動）を書く。まとめ以降は何も出力しない。
- FAQは生成しない。
- すべてのH2の見出しに主要キーワードまたは派生語を1回以上含める。
- 文章は冗長にせず、例・手順・注意点・チェックリストなど具体性を重視する。`;
}

function buildContinuationPrompt(current){
  return `以下の記事はまだ条件を満たしていません。続きと加筆を行い、下記のすべてを満たしてください。
必須:
- 総文字数を少なくとも${TARGET_CHARS}文字にする
- H2を${MIN_H2}つ以上、各H2ごとにH3を${MIN_H3_PER_H2}つ以上
- すべてのH3本文を${MIN_H3_CHARS}文字以上に拡張（具体例・データ・手順・注意点を追加）
- まとめは末尾に1回だけ（300文字以上）、途中には出さない
- Google検索1ページ目の上位記事を参考に、構成・内容をリライト・加筆（コピーは不可）

===現状記事===
${current}

===続きと加筆（条件を厳守）===`;
}

// Helpers
function parseTitles(raw){
  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const titles = [];
  for(const line of lines){
    const m = line.match(/^\d+\)\s*(.+)$/);
    if(m){ titles.push(m[1].trim()); }
  }
  if(!titles.length){
    for(const line of lines){
      if(!/^[-*]/.test(line) && line.length>=5){
        titles.push(line);
        if(titles.length>=3) break;
      }
    }
  }
  return titles.slice(0,3);
}

function toTextFromHTML(html){
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
    .replace(/<[^>]+>/g,'')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

function enforceSingleSummary(html){
  const re = new RegExp("<h2>まとめ<\\/h2>[\\s\\S]*?(?=<h2>|$)","gi");
  // keep last occurrence only
  const matches = [...html.matchAll(re)];
  if(matches.length<=1) return html;
  const last = matches[matches.length-1][0];
  // remove all then append last
  html = html.replace(re,"");
  return html + "\n\n" + last;
}

// UI events
el('btnGenTitles').addEventListener('click', async ()=>{
  const keywords = keywordsEl.value.trim();
  const tone = toneEl.value;
  if(!keywords) return alert("キーワードを入力してください。");

  show(titlesSection); hide(articleSection);
  titleSuggestionsEl.innerHTML = "生成中…"; confirmedTitleEl.textContent = "（未選択）";

  try{
    const data = await proxyChat({
      model: MODEL,
      messages: [{role:"system",content:"あなたは有能なコピーライターです。"}, {role:"user",content:buildTitlePrompt(keywords, tone)}],
      max_tokens: 400, temperature: 0.6
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
    titleSuggestionsEl.innerHTML = "<div class='status'>エラー: "+ err.message +"</div>";
  }
});

el('btnUseManual').addEventListener('click', ()=>{
  const t = manualTitleEl.value.trim();
  if(!t) return alert("タイトルを入力してください。");
  confirmedTitleEl.textContent = t;
  show(articleSection);
});

el('btnGenArticle').addEventListener('click', async ()=>{
  const title = confirmedTitleEl.textContent && confirmedTitleEl.textContent!=="（未選択）" ? confirmedTitleEl.textContent : manualTitleEl.value.trim();
  if(!title) return alert("先にタイトルを選択または入力してください。");

  const keywords = keywordsEl.value.trim();
  const tone = toneEl.value;
  const format = formatEl.value;

  statusEl.textContent = "SERP見出しプラン作成中…";
  resultEl.textContent = "";
  try{
    // Step1 plan
    const planRes = await proxyChat({
      model: MODEL,
      messages: [{role:"system",content:"あなたは熟練のSEOコンテンツプランナーです。"}, {role:"user",content:buildSERPPlanPrompt(title, keywords)}],
      temperature: 0.3, max_tokens: 700
    });
    const planText = planRes.choices?.[0]?.message?.content || "";
    const planH2 = planText.split(/\r?\n/).map(l=>l.replace(/^H2:\s*/i,'').trim()).filter(Boolean);

    // Step2 draft
    statusEl.textContent = "本文の初回生成中…";
    const draftRes = await proxyChat({
      model: MODEL,
      messages: [{role:"system",content:"あなたはプロのSEOライターです。"},
                 {role:"user",content:buildArticlePromptWithPlan(title,keywords,tone,format,planH2)}],
      temperature: 0.18, max_tokens: 3200
    });
    let total = draftRes.choices?.[0]?.message?.content || "";

    // remove early summaries
    total = enforceSingleSummary(total.replace(/<h2>まとめ<\/h2>[\s\S]*?(?=<h2>|$)/gi,""));

    // Loop: enforce TARGET_CHARS and structure
    let guard = 0;
    while(guard < 10){
      const compactLen = charCount(total.replace(/\s+/g,''));
      const h2Count = (total.match(/<h2\b[^>]*>/gi)||[]).length;
      const h3Count = (total.match(/<h3\b[^>]*>/gi)||[]).length;
      if(compactLen >= TARGET_CHARS && h2Count >= MIN_H2 && h3Count >= MIN_H2*MIN_H3_PER_H2) break;

      guard++;
      statusEl.textContent = `追記中…（H2:${h2Count} / H3:${h3Count} / 文字数:${compactLen}）`;
      const contRes = await proxyChat({
        model: MODEL,
        messages: [{role:"system",content:"あなたはプロのSEOライターです。"},
          {role:"user",content:buildContinuationPrompt(total)}],
        temperature: 0.18, max_tokens: 1800
      });
      const add = contRes.choices?.[0]?.message?.content || "";
      total = enforceSingleSummary((total + "\n\n" + add).replace(/<h2>まとめ<\/h2>[\s\S]*?(?=<h2>|$)/gi,""));
    }

    // if text format requested
    let out = total;
    if(format === "text"){
      out = toTextFromHTML(total);
    }

    resultEl.textContent = out;
    const finalLen = charCount(out);
    statusEl.textContent = `生成完了（約 ${finalLen} 文字）`;
    show(articleSection);
  }catch(err){
    console.error(err);
    statusEl.textContent = "エラー: " + err.message;
  }
});

// Misc
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

// Title generation shortcut (optional separate step)
el('btnGenTitles').click = null;  # no-op placeholder
