'use strict';
const QUESTIONS=(window.RETRY_QUESTIONS||[]);
const BY_ID=new Map(QUESTIONS.map(q=>[q.id,q]));
const KEY='eiken-retry-notebook-v1';
const C=TrainerCore;
const app=document.getElementById('app');
globalThis.MonstudyMaterial?.setActivityGuard(()=>Boolean(page==="quiz" && state.session));
let state=C.blank(),page='home',series=1,recordFilter='mistakes',toastTimer,readOnly=false,suppressCloudSave=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function showAlert(message){const el=document.getElementById('storageAlert');el.textContent=message;el.hidden=false;}
try{const raw=localStorage.getItem(KEY);if(raw)state=C.validate(JSON.parse(raw),QUESTIONS);}catch(e){readOnly=true;showAlert('保存された記録を読み込めませんでした。元の記録を保護するため、保存を停止しています。「記録」からバックアップを取り込むか、初期化してください。');}
function cloudSaveAllowed(){const session=state.session;return !session||session.index>=session.ids.length;}
function persist({cloud=null}={}){if(readOnly)return false;try{state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));const shouldCloud=cloud===true||(cloud!==false&&cloudSaveAllowed());if(!suppressCloudSave&&shouldCloud)window.firebaseRetryCloud?.saveSoon?.();return true;}catch(e){showAlert('記録をブラウザに保存できません。この画面では学習を続けられますが、閉じる前に「記録を保存」でバックアップしてください。');return false;}}
function toast(message){clearTimeout(toastTimer);const el=document.getElementById('toast');el.textContent=message;el.hidden=false;toastTimer=setTimeout(()=>el.hidden=true,4500);}
const stats=q=>C.stat(state,q.id);
const FINALIZED_SESSION_KEY='eiken-retry-finalized-sessions-v1';
let finalizedSessions=new Set();
try{finalizedSessions=new Set(JSON.parse(localStorage.getItem(FINALIZED_SESSION_KEY)||'[]'));}catch{}
let finalizeRetryTimer=0,finalizingSession='';
function rememberFinalizedSession(id){finalizedSessions.add(String(id));try{localStorage.setItem(FINALIZED_SESSION_KEY,JSON.stringify([...finalizedSessions].slice(-100)));}catch{}}
async function finalizeCompletedSession(session=state.session){
  if(!session||session.index<session.ids.length||session.answers.length<session.ids.length||finalizedSessions.has(String(session.id))||finalizingSession===String(session.id))return;
  const api=window.EnglishPlayroomCoins;
  if(!api?.recordRetrySession){clearTimeout(finalizeRetryTimer);finalizeRetryTimer=setTimeout(()=>void finalizeCompletedSession(session),350);return;}
  finalizingSession=String(session.id);
  const attempts=session.answers.map(answer=>{
    const q=BY_ID.get(answer.id),r=q?stats(q):null;
    return q?{questionId:q.id,grade:q.grade,correct:!!answer.correct,first:typeof answer.first==='boolean'?answer.first:(r?.attempts===1),previousMistakes:Number.isInteger(answer.previousMistakes)?answer.previousMistakes:Math.max(0,(r?.mistakes||0)-(answer.correct?0:1)),previousWrongAt:Number.isFinite(answer.previousWrongAt)?answer.previousWrongAt:0,series:session.mode==='series'}:null;
  }).filter(Boolean);
  try{
    const result=await api.recordRetrySession({sessionId:String(session.id),attempts});
    if(result?.reason!=='signed-out')rememberFinalizedSession(session.id);
  }catch(error){console.warn('Retry session finalize deferred',error);}
  finally{finalizingSession='';}
}

const PROFILE_KEY='eiken-retry-profile-v1';
let profile={equippedTitle:'',updatedAt:0};
try{
  const p=JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}');
  if(p&&typeof p.equippedTitle==='string')profile.equippedTitle=p.equippedTitle;
  if(p&&Number.isFinite(p.updatedAt))profile.updatedAt=p.updatedAt;
}catch{}
function persistProfile(){
  try{profile.updatedAt=Date.now();localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));if(!suppressCloudSave)window.firebaseRetryCloud?.saveSoon?.();}catch{}
}
function scope(){return QUESTIONS.filter(q=>(!state.settings.grade||q.grade===state.settings.grade)&&(state.settings.source!=='official'||q.answer_status==='official'));}
function selected(value,current){return value===current?' selected':'';}
function filters(withCount=false){return `<div class="filters"><label>難易度<select id="grade">${['4級','3級','準2級','2級','準1級',''].map(g=>`<option value="${g}"${selected(g,state.settings.grade)}>${g?g+'程度':'すべて'} · ${QUESTIONS.filter(q=>!g||q.grade===g).length}問</option>`).join('')}</select></label><label>解答の範囲<select id="source"><option value="all"${selected('all',state.settings.source)}>すべての問題</option><option value="official"${selected('official',state.settings.source)}>公式解答のある問題のみ</option></select></label>${withCount?`<label>新しい問題の出題数<select id="count">${[5,10,20,50,0].map(n=>`<option value="${n}"${selected(n,state.settings.count)}>${n?n+'問':'未挑戦のすべて'}</option>`).join('')}</select></label>`:''}</div>`;}
function answerLabel(q){return q.answer_status==='official'?'公式解答':q.answer_status==='external_key'?'外部の解答例（非公式）':'AIによる暫定解答';}
function sourceNote(){return '';}
function sourceLink(q){return '';}
function navigate(next){if(page==='quiz'&&next!=='quiz')closeScreenAway();page=next;render();window.scrollTo({top:0,behavior:'instant'});}
function resumeBlock(){const s=state.session;if(!s)return '';const finished=s.index>=s.ids.length;return `<div class="resume"><div><b>${finished?'前回の結果を確認できます':'途中の学習が残っています'}</b><div class="note">${s.mode==='new'?'新しい問題':s.mode==='series'?'間違えた問題シリーズ':'間違えた問題の解き直し'} · ${s.answers.length} / ${s.ids.length}問 回答済み</div></div><button class="btn secondary" data-action="resume">${finished?'結果を見る':'続きから再開'} →</button></div>`;}
function home(){const qs=scope(),fresh=qs.filter(q=>!stats(q).attempts).length,ever=qs.filter(q=>stats(q).mistakes>0).length,pending=qs.filter(q=>stats(q).pending).length,correct=qs.filter(q=>stats(q).lastCorrect===true).length;return `<section class="hero"><div><div class="eyebrow">SMALL STEPS. LASTING PROGRESS.</div><h1>間違いを、<br>自分だけの問題集に。</h1><p>一度間違えた問題は、正解してもずっと残る。<br>苦手の深さに合わせて、何度でも解き直そう。</p></div><div class="hero-seal" aria-hidden="true"><span>YOUR RETRY NOTE</span><b>↻</b><span>ひとつずつ、できるへ。</span></div></section>${resumeBlock()}${filters(true)}<div class="stats"><div class="stat"><span>未挑戦</span><b>${fresh}</b><em>問</em></div><div class="stat hot"><span>一度でも間違えた</span><b>${ever}</b><em>問</em></div><div class="stat"><span>直近の回答が不正解</span><b>${pending}</b><em>問</em></div><div class="stat"><span>直近の回答が正解</span><b>${correct}</b><em>問</em></div></div><div class="grid"><section class="panel feature"><div class="eyebrow">01 / PRACTICE</div><h2>新しい問題に挑戦</h2><p>まだ解いていない問題からランダムに出題。回答すると、その場で正誤と完成した英文を確認できます。</p><button class="btn" data-action="start-new"${fresh?'':' disabled'}>${fresh?'学習を始める →':'この範囲の未挑戦はありません'}</button></section><section class="panel feature primary"><div class="eyebrow">02 / MY RETRY SERIES</div><h2>間違えた問題シリーズ</h2><p>１回以上・２回以上・３回以上…。過去に間違えた回数を選んで、苦手な問題をまとめて解き直そう。</p><button class="btn" data-page="review">シリーズを選ぶ <span aria-hidden="true">↗</span></button></section></div><div class="steps"><div class="step"><b>01</b>まずは解く</div><div class="step"><b>02</b>間違いを蓄積</div><div class="step"><b>03</b>選んで解き直す</div></div><p class="note">「新しい問題」は未挑戦だけ。シリーズへの所属は、復習で正解しても消えません。</p>${sourceNote()}`;}
function questionRow(q,showAnswer=false){const r=stats(q);return `<div class="list-row"><div><small>${esc(q.grade)} · ${q.year}年度 第${q.session}回 · 問${q.question_number}　／　累計${r.mistakes}回ミス</small><p>${esc(q.question.replace('(____)','（　　）'))}</p>${showAnswer?`<div class="note">解答：${q.answer_number}. ${esc(q.answer_text)}　${answerLabel(q)}</div>`:''}</div><span class="status${r.lastCorrect?' done':''}">${r.lastCorrect?'直近は正解':'直近は不正解'}</span></div>`;}
function review(){const qs=scope(),max=Math.max(3,...qs.map(q=>stats(q).mistakes)),levels=[...new Set([...Array.from({length:Math.min(max,20)},(_,i)=>i+1),...qs.map(q=>stats(q).mistakes).filter(n=>n>20)])].sort((a,b)=>a-b);const pool=series===0?C.pool(QUESTIONS,state,'review'):C.pool(QUESTIONS,state,'series',series);return `<section class="section-head"><div class="eyebrow">MY RETRY SERIES</div><h1>間違いは、学びの記録。</h1><p>正解した後も、シリーズからは外れません。いつでも選んで復習できます。</p></section>${filters()}<div class="chips" role="group" aria-label="間違えた回数を選ぶ">${levels.map(n=>`<button class="chip${series===n?' active':''}" data-series="${n}" aria-pressed="${series===n}">${n}回以上間違えた<b>${qs.filter(q=>stats(q).mistakes>=n).length}</b></button>`).join('')}<button class="chip${series===0?' active':''}" data-series="0" aria-pressed="${series===0}">直近の不正解だけ<b>${qs.filter(q=>stats(q).pending).length}</b></button></div><section class="panel"><div class="row spread"><div><span class="tag">${series?`累計${series}回以上のミス`:'現在の苦手'}</span><h2 style="margin-top:10px">${series?`${series}回以上間違えた問題`:'直近の回答が不正解の問題'}</h2><p class="muted" style="margin-top:8px">${pool.length}問 ${series?'· 復習で正解した問題も含みます':'· 正解した問題はここから外れます'}</p></div><button class="btn" data-action="start-series"${pool.length?'':' disabled'}>この${pool.length}問を解き直す →</button></div>${pool.length?`<p class="note" style="margin-top:18px">全${pool.length}問をランダムな順番で出題します。終了後は「今回間違えた問題だけ」も選べます。</p><details><summary>このシリーズの問題を見る</summary><div class="list">${pool.map(q=>questionRow(q)).join('')}</div></details>`:'<div class="empty"><div class="empty-symbol" aria-hidden="true">◎</div><h3>このシリーズは、まだ０問です。</h3><p>学習中の間違いが自動で記録されます。</p><button class="btn secondary" data-page="home">新しい問題に進む</button></div>'}</section><div class="notice">回数は累計です。２回間違えた問題は「１回以上」と「２回以上」の両方に入ります。正解しても、ミス回数は減りません。</div>${sourceNote()}`;}
function newSession(mode,ids){if(!ids.length){toast('対象の問題がありません。');return;}if(state.session && state.session.index<state.session.ids.length && !confirm('途中の学習を終了して、新しく始めますか？これまでの回答とミス回数は残ります。'))return;closeScreenAway();C.begin(state,C.shuffle(ids),mode);persist();navigate('quiz');}
function questionHtml(text){return esc(text).replace(/\(____\)/g,'<span class="blank" aria-label="空所">?</span>').replace(/\s+([AB])\s*:/g,'\n$1:');}
function quiz(){const s=state.session;if(!s)return '<section class="panel empty"><h2>学習を始めましょう</h2><button class="btn" data-page="home">学習へ</button></section>';if(s.index>=s.ids.length)return summaryView();const q=BY_ID.get(s.ids[s.index]),a=s.answers[s.index],r=stats(q);const modeLabel=s.mode==='new'?'新しい問題':s.mode==='series'?'間違えた問題':'今回の復習';return `<div class="quiz-wrap"><div class="quiz-progress-compact"><span>問題 ${s.index+1}/${s.ids.length}</span><span>${s.answers.filter(a=>a.correct).length}問正解</span></div><div class="progress compact" role="progressbar" aria-label="学習の進み具合" aria-valuenow="${s.answers.length}" aria-valuemin="0" aria-valuemax="${s.ids.length}"><i style="width:${s.answers.length/s.ids.length*100}%"></i></div><section class="panel quiz-card">${a?`<button class="btn" style="width:100%" data-action="next">${state.session.index+1===state.session.ids.length?'結果を見る':'次の問題へ'} →</button>`:''}<div class="question" id="question">${questionHtml(q.question)}</div><div class="options" role="group" aria-labelledby="question">${q.choices.map(c=>`<button class="option${a?(c.number===q.answer_number?' correct':c.number===a.choice?' wrong':''):''}" data-choice="${c.number}"${a?' disabled':''}><span class="num">${c.number}</span><span class="word">${esc(c.text)}</span>${a&&c.number===q.answer_number?'<span aria-label="正解">✓</span>':a&&c.number===a.choice?'<span aria-label="不正解">×</span>':''}</button>`).join('')}</div>${a?feedback(q,a,r):'<button class="btn ghost" style="margin-top:18px;width:100%" data-choice="0">わからない · 間違いとして記録</button>'}<div class="quiz-actions-bottom"><button class="btn ghost compact-back" data-page="home">← 保存して戻る</button><span class="tag compact-mode">${modeLabel}</span></div><p class="bottom-note">回答は選択時に記録されます</p></section></div>`;}
function feedback(q,a,r){return `<div id="feedback" class="feedback${a.correct?'':' wrong'}" role="status" tabindex="-1"><h3>${a.correct?'✓ 正解！':'もう一度、覚えよう。'}</h3><div>解答：<strong class="answer">${q.answer_number}. ${esc(q.answer_text)}</strong></div>${!a.correct?`<p class="note">あなたの回答：${a.choice?esc(q.choices[a.choice-1].text):'わからない'}</p>`:''}<div class="filled">${esc(q.question).replace('(____)',`<strong>${esc(q.answer_text)}</strong>`).replace(/\s+([AB])\s*:/g,'\n$1:')}</div><div id="choiceTranslations" style="margin-top:18px;padding:16px;background:#fff;border:1px solid var(--line);border-radius:12px"><b>すべての選択肢の意味</b><div class="note" style="margin-top:8px">日本語訳を読み込んでいます…</div></div><div id="quickTip" style="margin-top:12px;padding:14px 16px;background:#f7f3df;border-radius:12px"><b>💡 ワンポイント</b><div class="note" style="margin-top:6px">正解語と文脈を確認中です…</div></div><p class="note" style="margin-top:14px">${a.correct?(r.mistakes?`今回の解き直しはクリア。「${r.mistakes}回以上間違えた問題」までのシリーズには引き続き残ります。`:'この問題は「新しい問題」から外れます。'): `累計${r.mistakes}回のミスとして記録しました。終了後、今回間違えた問題だけを解き直せます。`}</p><button id="next" class="btn" data-action="next">${state.session.index+1===state.session.ids.length?'結果を見る':'次の問題へ'} →</button></div>`;}
function summaryView(){finishScreenLog();const s=state.session,total=s.answers.length,correct=s.answers.filter(a=>a.correct).length,retry=C.retryIds(state);return `<div class="quiz-wrap"><section class="panel summary"><div class="eyebrow">ROUND COMPLETE</div><h1>${retry.length?'ここから、もうひと伸び。':'この回はクリア！'}</h1><div class="summary-score">${correct}<span> / ${total}問 正解</span></div><p class="note">プレイ中の画面離脱：${s.screenAway?.count||0}回 ／ 合計${Math.round((s.screenAway?.totalMs||0)/1000)}秒<br>画面離脱はタブ・アプリの切り替え等の記録です。不正を判定するものではありません。</p><p>${retry.length?`次に取り組むのは、今回間違えた${retry.length}問だけ。`:'今回の全問に正解しました。おつかれさまでした！'}</p><p class="note">過去のミス回数と、間違えた問題シリーズはそのまま残ります。</p><div class="summary-actions">${retry.length?`<button class="btn" data-action="retry-round">今回間違えた${retry.length}問だけ解く ↻</button>`:''}<button class="btn secondary" data-page="review">シリーズを選び直す</button><button class="btn ghost" data-page="home">ホームへ</button></div></section><details class="panel" style="margin-top:20px"><summary>この回の回答を確認する</summary>${s.answers.map(a=>{const q=BY_ID.get(a.id);return `<div class="list-row"><div><small>${q.year}年度 第${q.session}回 · 問${q.question_number}</small><p>${esc(q.question)}</p><div class="note">あなた：${a.choice?esc(q.choices[a.choice-1].text):'わからない'} ／ 解答：${esc(q.answer_text)}</div></div><span class="status${a.correct?' done':''}">${a.correct?'正解':'不正解'}</span></div>`;}).join('')}</details></div>`;}
function history(){const qs=scope(),all=qs.filter(q=>stats(q).attempts),ever=all.filter(q=>stats(q).mistakes),misses=all.reduce((sum,q)=>sum+stats(q).mistakes,0),attempts=all.reduce((sum,q)=>sum+stats(q).attempts,0);const listed=(recordFilter==='all'?all:ever).sort((a,b)=>stats(b).mistakes-stats(a).mistakes);return `<section class="section-head"><div class="eyebrow">YOUR LEARNING LOG</div><h1>積み重ねた、学び。</h1><p>正解できた後も、これまでの間違いを記録し続けます。</p></section>${filters()}<div class="stats"><div class="stat"><span>挑戦した問題</span><b>${all.length}</b><em>問</em></div><div class="stat"><span>回答した回数</span><b>${attempts}</b><em>回</em></div><div class="stat hot"><span>間違えた問題</span><b>${ever.length}</b><em>問</em></div><div class="stat"><span>累計のミス</span><b>${misses}</b><em>回</em></div></div><section class="panel"><div class="row spread"><h2>問題ごとの記録</h2><label class="note">表示 <select id="recordFilter"><option value="mistakes"${selected('mistakes',recordFilter)}>一度でも間違えた問題</option><option value="all"${selected('all',recordFilter)}>挑戦した全問題</option></select></label></div>${listed.length?`<div class="list">${listed.map(q=>questionRow(q,true)).join('')}</div>`:'<div class="empty"><p>まだ記録がありません。</p></div>'}</section><section class="panel data-block"><h2>記録を持ち運ぶ</h2><p>この端末・ブラウザに自動保存します。別の端末へ移すときや、ブラウザのデータを消す前には、記録ファイルを保存してください。保存・取り込みの対象は、選択中の級に関係なく全記録です。</p><div class="row"><button class="btn secondary" data-action="export">記録を保存</button><button class="btn ghost" data-action="import">記録を取り込む</button></div><details><summary>収録問題と解答について</summary><p>４級・３級・準２級・２級・準１級、計${QUESTIONS.length}問を収録しています。公式解答を優先し、入手できなかった回は外部の解答例（非公式）またはAIによる暫定解答を使用しています。採点に使う解答は、各問題の回答後に表示します。公式解答のみを使う場合は、上の「解答の範囲」で切り替えてください。</p><p>シリーズは累計のミス回数で決まります。例：不正解 → 正解 → 不正解なら２回ミス。「１回以上」と「２回以上」の両方に入ります。</p></details><details><summary>記録の初期化</summary><p>すべての級のミス回数・回答記録・途中の学習を削除します。必要なら先に記録を保存してください。</p><button class="btn danger" data-action="reset">すべての学習記録を削除</button></details></section>`;}
// Embedded meanings are available without translation requests or cached failures.
const CHOICE_JA = (window.RETRY_CHOICE_JA||{});
function choiceJapanese(text) {
 const key=String(text).trim().toLowerCase();
 return Object.prototype.hasOwnProperty.call(CHOICE_JA,key)?CHOICE_JA[key]:'';
}
function completedEnglish(q){return q.question.replace('(____)',q.answer_text);}
function cleanJa(s){return s&&s!=='訳を取得できませんでした'?s:'';}
function phraseAroundBlank(q,left=3,right=3){
 const marker='__ANSWER__',raw=q.question.replace('(____)',marker).replace(/([.,!?;:()])/g,' $1 '),parts=raw.split(/\s+/).filter(Boolean),i=parts.indexOf(marker);
 if(i<0)return q.answer_text;
 const before=parts.slice(Math.max(0,i-left),i),after=parts.slice(i+1,i+1+right);
 return [...before,q.answer_text,...after].join(' ').replace(/\s+([.,!?;:])/g,'$1');
}
function choiceShape(q){
 const cs=q.choices.map(c=>c.text.trim()),lower=cs.map(x=>x.toLowerCase());
 return {cs,lower,single:cs.every(x=>/^[-A-Za-z']+$/.test(x)),hasIng:lower.some(x=>/ing$/.test(x)),hasTo:lower.some(x=>/^to\s+/.test(x)),hasEd:lower.some(x=>/(ed|en)$/.test(x))};
}
function contextSignal(q){
 const t=q.question;
 const tests=[
  [/\balthough\b|\bthough\b|\beven though\b/i,['逆接','although / though の後ろと主節は、内容が対照的になります。']],
  [/\bhowever\b|\bbut\b|\byet\b/i,['逆接','but / however / yet の前後で意味が反対方向に動くことが多いので、両側を比べます。']],
  [/\bbecause\b|\bsince\b/i,['理由','because / since が「理由」を示します。理由と結論が自然につながる語を選びます。']],
  [/\btherefore\b|\bthus\b|\bas a result\b/i,['結果','therefore / thus / as a result は「結果」のサインです。直前の原因から何が起こるかを考えます。']],
  [/\bfor example\b|\bfor instance\b|\bsuch as\b/i,['具体例','for example / such as の後ろは具体例です。抽象的な意味を具体例から逆算できます。']],
  [/\bin fact\b|\bspecifically\b/i,['言い換え・具体化','in fact / specifically の後ろが、前の内容を詳しく説明しています。']],
  [/\binstead of\b|\brather than\b/i,['対比・選択','instead of / rather than は「AではなくB」という対比を作ります。']],
  [/\buntil\b|\bbefore\b|\bafter\b|\bwhen\b|\bwhile\b/i,['時間関係','before / after / when / while / until で出来事の順序を整理すると選びやすくなります。']],
  [/\bif\b|\bunless\b/i,['条件','if / unless は条件を示します。条件節と主節の意味・時制をセットで確認します。']]
 ];
 for(const [re,v] of tests)if(re.test(t))return v;return null;
}
function exactGrammarInsight(q){
 const raw=q.question.replace(/\s+/g,' '),c=completedEnglish(q).replace(/\s+/g,' '),a=q.answer_text.trim(),al=a.toLowerCase(),sh=choiceShape(q);
 const around=q.review_phrase||phraseAroundBlank(q,4,5);
 // 0) 正解そのものが定型表現なら、文中の別構文よりこちらを最優先。
 const exact={
  'as long as':'<strong>as long as</strong> は「<strong>～する限り／～という条件なら</strong>」。条件を表す接続詞です。',
  'as soon as':'<strong>as soon as</strong> は「<strong>～するとすぐに</strong>」。2つの出来事が続けて起こることを表します。',
  'rather than':'<strong>rather than</strong> は「<strong>～ではなくて</strong>」。前後に同じ文法形を置いて選択・対比を作ります。',
  'instead of':'<strong>instead of + 名詞 / V-ing</strong> は「<strong>～の代わりに／～せずに</strong>」。of は前置詞なので、動詞なら -ing 形です。',
  'because of':'<strong>because of + 名詞</strong> は「～のために」。<strong>because + S + V</strong> との形の違いを確認しましょう。',
  'in spite of':'<strong>in spite of + 名詞</strong> は「<strong>～にもかかわらず</strong>」。後ろには名詞（句）が続きます。',
  'no wonder':'<strong>no wonder (that) ...</strong> は「～なのも当然だ」。後ろの内容が、その状況が当然である理由になります。',
  'in common':'<strong>have ... in common</strong> は「共通して～を持つ／共通点がある」。<strong>in common</strong> をひとかたまりで覚えます。',
  'on purpose':'<strong>on purpose</strong> は「わざと、故意に」。<strong>by accident / by mistake</strong>「偶然に／間違って」と対比すると覚えやすいです。',
  'by mistake':'<strong>by mistake</strong> は「間違って」。意図的ではないことを表し、<strong>on purpose</strong>「わざと」と対照的です。',
  'according to':'<strong>according to + 情報源</strong> は「～によると」。人・資料・報告など、情報の出どころを示します。',
  'in addition to':'<strong>in addition to + 名詞 / V-ing</strong> は「～に加えて」。to は前置詞です。',
  'aside from':'<strong>aside from</strong> は「～は別として／～に加えて」。文脈によって除外または追加の意味になります。',
  'except for':'<strong>except for</strong> は「～を除いて」。全体から例外を取り出す表現です。',
  'out of the question':'<strong>out of the question</strong> は「問題外で、不可能で」。ひとかたまりの決まり文句です。',
  'all the more':'<strong>all the more</strong> は「なおさら、いっそう」。前に述べた事情によって程度がさらに強まることを表します。',
  'as a whole':'<strong>as a whole</strong> は「全体として」。細部ではなく全体評価を述べるときに使います。',
  'in turn':'<strong>in turn</strong> は「今度は／順番に」。前の人から次の人へ行為・影響が移る流れを表します。',
  'by far':'<strong>by far</strong> は比較級・最上級を強めて「はるかに／断然」。特に最上級とよく使います。',
  'and so on':'<strong>and so on</strong> は「～など」。同じ種類の例がまだ続くことを示します。',
  'one another':'<strong>one another</strong> は「お互いに」。複数の人・ものが互いに同じ動作をするときに使います。',
  'each other':'<strong>each other</strong> は「お互いに」。目的語として使われることが多い表現です。'
 };
 if(exact[al])return exact[al];
 if(al==='despite')return `<strong>despite + 名詞</strong> は「<strong>～にもかかわらず</strong>」。despite の後ろに of は付けません。`;
 // 1) 空所そのものが作る強調・結果・目的。
 if(al==='that' && /^it\s+(?:is|was)\s+because\b[^.?!]{0,220}\(____\)/i.test(raw))return `<strong>It is because A that B</strong> は「<strong>BなのはAだからだ</strong>」という強調構文です。because 以下の「理由」を強調しています。途中の <strong>so + 副詞</strong> は程度を表すだけで、ここを <strong>so that（～するために）</strong> と取らないのがポイントです。`;
 if(al==='that' && /\bso\s+[^.?!]{1,45}\(____\)/i.test(raw))return `<strong>so + 形容詞 / 副詞 + that S + V</strong> は「<strong>とても…なので～</strong>」という結果の構文です。so と that の間に程度を表す語が入ります。`;
 if(al==='that' && /\bsuch\s+[^.?!]{1,55}\(____\)/i.test(raw))return `<strong>such + (a/an) + 形容詞 + 名詞 + that ...</strong> は「とても…なので～」という結果を表します。`;
 if(al==='that' && /\bso\s*\(____\)/i.test(raw))return `<strong>so that S can/could ...</strong> の that なら「Sが～できるように」という目的を作ります。前後の助動詞まで含めて確認しましょう。`;
 if(al==='in order' && /\(____\)\s+to\b/i.test(raw))return `<strong>in order to + 動詞の原形</strong> は「<strong>～するために</strong>」。目的をはっきり示す表現です。`;
 // 2) 正解の形そのものが文法を示すもの。
 if(/^being\s+\S+/i.test(a) && /(?:ed|en|treated|known|seen|taken|given|made|built|written|done|said|told)$/i.test(a))return `<strong>being + 過去分詞</strong> は「<strong>～されること／～されている状態</strong>」という受動の動名詞です。この文では動作を受ける側なので受動形になります。`;
 if(/^(?:am|is|are|was|were|be|been|being)\s+\S+/i.test(a) && /^\s*(?:by\b|to\b|for\b|with\b|at\b|on\b|in\b|from\b|[.,!?])/i.test(raw.split('(____)')[1]||''))return `<strong>be動詞 + 過去分詞</strong> の受動態です。「主語が～する」のではなく「<strong>主語が～される</strong>」関係になっています。`;
 if(/^(?:have|has|had)\s+\S+/i.test(a))return `<strong>have / has / had + 過去分詞</strong> は完了形です。この問題では周囲の時表現と出来事の前後関係から、現在完了か過去完了かを判断します。`;
 if(/^to\s+[a-z]+/i.test(a)){
  if(/\btoo\s+[^.?!]{0,35}\(____\)/i.test(raw))return `<strong>too + 形容詞 / 副詞 + to do</strong> は「<strong>～するには…すぎる</strong>／あまりに…なので～できない」という頻出構文です。`;
  if(/\benough\s+\(____\)/i.test(raw))return `<strong>形容詞 / 副詞 + enough to do</strong> は「<strong>～するのに十分…だ</strong>」という形です。`;
  return `<strong>to + 動詞の原形</strong> の不定詞です。<strong>${esc(around)}</strong> の中で、目的・補語・結果など何を表しているかを確認しましょう。`;
 }
 // 3) 空所の直前・直後が決める語法。raw の (____) を中心に判定する。
 if(/would (?:you )?mind\s+\(____\)/i.test(raw))return `<strong>Would you mind V-ing ...?</strong> は「～していただけますか」。<strong>mind の後ろは動名詞（V-ing）</strong>です。`;
 if(/(?:can't|cannot|couldn't|could not) help\s+\(____\)/i.test(raw))return `<strong>can't help V-ing</strong> は「<strong>～せずにはいられない</strong>」。help の後ろが -ing になる決まり表現です。`;
 if(/\b(?:enjoy|finish|avoid|mind|practice|consider|suggest|recommend|admit|deny|quit|keep)\s+\(____\)/i.test(raw))return `直前の動詞は後ろに <strong>V-ing（動名詞）</strong> を取ります。正解語だけでなく、<strong>前の動詞 + V-ing</strong> のセットで覚えましょう。`;
 if(/\blook forward to\s+\(____\)/i.test(raw))return `<strong>look forward to + 名詞 / V-ing</strong> は「～を楽しみにする」。この <strong>to は前置詞</strong>なので、動詞なら -ing 形です。`;
 if(/\b(?:be|am|is|are|was|were|been|being|get|gets|got) used to\s+\(____\)/i.test(raw))return `<strong>be/get used to + 名詞 / V-ing</strong> は「～に慣れている／慣れる」。この <strong>to は前置詞</strong>です。`;
 if(/\bused to\s+\(____\)/i.test(raw))return `<strong>used to + 動詞の原形</strong> は「以前は～したものだ／～だった」。<strong>be used to V-ing</strong> と区別します。`;
 if(/\b(?:decide|hope|plan|promise|agree|learn|manage|refuse|choose|expect|want|need|try)\s+\(____\)/i.test(raw) && /^to\b/i.test(a))return `直前の動詞は後ろに <strong>to不定詞</strong> を取る語法です。動詞と <strong>to do</strong> をセットで覚えましょう。`;
 if(/\b(?:ask|tell|want|allow|expect|encourage|advise|invite|force|enable)\s+[^.?!]{1,35}\s+\(____\)/i.test(raw) && /^to\b/i.test(a))return `<strong>動詞 + 人 + to do</strong> の形です。「人に～するよう…する」という語法を確認します。`;
 if(/\blet\s+[^.?!]{1,30}\s+\(____\)/i.test(raw))return `<strong>let + 人 + 動詞の原形</strong>「人に～させる」。let の後ろでは <strong>to を付けません</strong>。`;
 if(/\bmake\s+[^.?!]{1,30}\s+\(____\)/i.test(raw))return `<strong>make + 人 + 動詞の原形</strong>「人に～させる」という使役の形です。受動態では <strong>be made to do</strong> になります。`;
 if(/\bkeep\s+[^.?!]{1,35}\s+\(____\)/i.test(raw))return `<strong>keep + O + C</strong> は「<strong>OをCの状態にしておく</strong>」。空所は目的語の状態を説明します。`;
 if(/\bneed(?:s|ed)? to\s+\(____\)/i.test(raw) && /^be\s+/i.test(a))return `<strong>need to be + 過去分詞</strong> は「～される必要がある」。主語が動作を受けるので受動態です。`;
 // 4) 比較・関係詞・相関表現（空所がその構成要素のとき）。
 if(al==='to' && /\bprefer(?:s|red)?\b[^.?!]{0,55}\(____\)/i.test(raw))return `<strong>prefer A to B</strong> は「<strong>BよりAを好む</strong>」。比較相手の前は <strong>to</strong> です。`;
 if(al==='as' && /\b(?:as|so)\s+[^.?!]{1,25}\s+\(____\)/i.test(raw))return `<strong>as + 形容詞 / 副詞 + as</strong> は「～と同じくらい…」。否定では <strong>not as/so ... as</strong> になります。`;
 if(al==='than')return `<strong>比較級 + than</strong> の形です。「～より…」という比較なので、何と何を比べているかを確認します。`;
 if(al==='why' && /\bthe reason\s+\(____\)/i.test(raw))return `<strong>the reason why S + V</strong> は「<strong>SがVする理由</strong>」。reason と why の組み合わせです。`;
 if(al==='where')return `<strong>where</strong> は場所を表す疑問詞・関係副詞です。この文では空所の前後から、「どこで／～する場所」のどちらかを判断します。`;
 if(al==='when')return `<strong>when</strong> は時を表す疑問詞・関係副詞です。「いつ／～するとき」のどちらの働きかを文全体で確認します。`;
 if(['who','whom','whose','which'].includes(al) || (al==='that'&&!/^it\s+(?:is|was)\s+because/i.test(raw))){
  const mm={who:'人を受け、後ろで主語になることが多い関係代名詞',whom:'人を受け、後ろで目的語になる関係代名詞',whose:'「～の」と所有を表す関係代名詞',which:'物・事を受ける関係代名詞',that:'人・物のどちらにも使える関係代名詞'};
  if(mm[al])return `<strong>${esc(a)}</strong> は ${mm[al]} です。先行詞が「人か物か」と、後ろの節で何が欠けているかを確認します。`;
 }
 if(al==='other' && /\bone\b[^.?!]{0,80}\b\(____\)/i.test(raw))return `<strong>one ... the other ...</strong> は「一方は…、もう一方は…」。2つのものを対比するときの定番表現です。`;
 if(/^do i$/i.test(a) && /\bso\s+\(____\)/i.test(raw))return `<strong>So + 助動詞 + 主語</strong> は「<strong>～もそうです</strong>」。直前の肯定内容に同意する倒置です。`;
 if(al==='had' && /\(____\)\s+better\b/i.test(raw))return `<strong>had better + 動詞の原形</strong> は「～したほうがよい」。かなり強めの助言です。`;
 if(al==='unless')return `<strong>unless = if ... not</strong>「<strong>～しない限り</strong>」。unless 自体に否定の意味があります。`;
 // 5) 選択肢の語形差が中心の問題。
 if(sh.hasIng&&sh.hasTo)return `選択肢に <strong>to do / V-ing</strong> の違いがあります。空所直前の語がどちらを取るかが決め手です。`;
 if(sh.single&&(sh.hasIng||sh.hasEd))return `選択肢の語形が似ています。<strong>能動か受動か／動作か状態か／時制は何か</strong>を文の主語と動詞から判断します。`;
 return '';
}
function slotInsight(q){
 const t=q.question,a=q.answer_text,idx=t.indexOf('(____)');if(idx<0)return '';
 const before=t.slice(0,idx).trim(),after=t.slice(idx+6).trim(),prev=(before.match(/([A-Za-z']+)\s*$/)||[])[1]||'',next=(after.match(/^([A-Za-z']+)/)||[])[1]||'',pl=prev.toLowerCase(),nl=next.toLowerCase();
 const phrase=q.review_phrase||phraseAroundBlank(q,2,3),al=q.answer_text.trim().toLowerCase();
 if(q.review_role==='grammar'&&['in','on','at','for','to','of','by','with','from','about','into','over','under','up','down','out','off','through','across','against','along','away','around','without','within','during','among','between'].includes(al))return `<strong>${esc(q.answer_text)}</strong> は単独の日本語訳だけでなく、前後の語との結びつきで決まります。この問題では <strong>${esc(phrase)}</strong> が定着させたい形です。前置詞まで含めて1セットで覚えましょう。`;
 if(q.review_role==='grammar'&&al==='another')return `<strong>another + 単数名詞</strong> は「もう1つの／別の」。<strong>other + 複数名詞</strong> や <strong>the other</strong> と区別します。`;
 if(q.review_role==='grammar'&&al==='other')return `<strong>other</strong> は「ほかの」。後ろに名詞を置く用法と、<strong>the other</strong>「（2つのうち）もう一方」の形を文脈で見分けます。`;
 if(q.review_role==='grammar'&&['much','many','few','little'].includes(al))return `<strong>${esc(q.answer_text)}</strong> は数量を表す語です。数えられる名詞か数えられない名詞か、また肯定・否定の意味を確認して選びます。`;
 if(q.review_role==='grammar'&&['how','why','where','when','what','who'].includes(al))return `<strong>${esc(q.answer_text)}</strong> は疑問詞です。後ろに続く内容が「方法・理由・場所・時・物・人」のどれを求めているかで判断します。`;
 if(q.review_role==='verb')return `空所は<strong>動詞</strong>が入る位置です。この問題では <strong>${esc(phrase)}</strong> という語のつながりで覚えると、意味と語法を一緒に確認できます。`;
 if(q.review_role==='noun')return `空所は<strong>名詞</strong>が中心になる位置です。<strong>${esc(phrase)}</strong> というまとまりを見て、「何・誰・どんな事柄」を置くのかを考えます。`;
 if(q.review_role==='adjective')return `空所は<strong>形容詞</strong>として名詞や主語の状態を説明する位置です。<strong>${esc(phrase)}</strong> の形で確認しましょう。`;
 if(q.review_role==='adverb')return `空所は<strong>副詞</strong>として動作・程度・文全体を説明する位置です。<strong>${esc(phrase)}</strong> の中で何を修飾しているかを見るのがポイントです。`;
 if(q.review_role==='participle')return `過去分詞・形容詞的な形が入る位置です。<strong>${esc(phrase)}</strong> で「～された状態」なのか受動の動作なのかを確認します。`;
 if(/^(a|an|the|this|that|my|your|his|her|our|their|some|any|many|several|each|every)$/.test(pl))return `直前が <strong>${esc(prev)}</strong> なので、名詞または名詞を修飾する語が入りやすい位置です。`;
 if(/^(very|so|too|quite|really|extremely|rather)$/.test(pl))return `<strong>${esc(prev)}</strong> の後ろなので、形容詞・副詞として意味が通るかを確認します。`;
 if(nl&&/^(to|for|of|with|about|from|into|on|at|by)$/.test(nl))return `正解語は直後の <strong>${esc(next)}</strong> と結びつきます。<strong>${esc(phrase)}</strong> を1つの語のまとまりとして覚えましょう。`;
 return '';
}
function phraseInsight(q){
 const a=q.answer_text.trim(),al=a.toLowerCase(),p=q.review_phrase||phraseAroundBlank(q,2,4);
 if(!/\s/.test(a))return '';
 if(/^to\s+[a-z]+/i.test(a))return `<strong>${esc(a)}</strong> は to不定詞です。文中では <strong>${esc(p)}</strong> という形になっており、to 以下が目的・結果・補語などの役割を持ちます。`;
 const words=al.split(/\s+/),last=words[words.length-1];
 if(['up','down','out','off','in','on','away','back','over','through','around','along','across'].includes(last))return `<strong>${esc(a)}</strong> は句動詞です。動詞と最後の <strong>${esc(last)}</strong> を切り離さず、<strong>${esc(p)}</strong> のまとまりで覚えましょう。`;
 if(['for','with','into','from','to','of','at','about','against'].includes(last))return `<strong>${esc(a)}</strong> は前置詞まで含めて語法が決まる表現です。<strong>${esc(p)}</strong> のように「後ろに何が続くか」までセットで覚えるのが効果的です。`;
 return `<strong>${esc(a)}</strong> は複数語で1つの意味を作る定型表現です。<strong>${esc(p)}</strong> の文脈ごと覚えると、単語をばらばらに暗記するより使いやすくなります。`;
}
function lexicalInsight(q){
 const a=q.answer_text.trim(),p=q.review_phrase||phraseAroundBlank(q,2,4);
 if(q.review_role==='phrase'||q.review_role==='infinitive')return phraseInsight(q);
 if(/ly$/i.test(a))return `<strong>${esc(a)}</strong> は -ly で終わる副詞です。この文では <strong>${esc(p)}</strong> の中で、動作や程度をどのように説明しているかがポイントです。`;
 if(/(tion|sion|ment|ness|ity|ance|ence|ship|hood|ism)$/i.test(a))return `<strong>${esc(a)}</strong> は名詞になりやすい語尾を持ちます。<strong>${esc(p)}</strong> の中で「事柄・状態・性質」のどれを表すかを確認しましょう。`;
 if(/(ous|ful|less|ive|able|ible|al|ic|ary|ory)$/i.test(a))return `<strong>${esc(a)}</strong> は形容詞になりやすい語尾です。<strong>${esc(p)}</strong> の中で、どの名詞・主語を説明しているかを見ます。`;
 return '';
}
function clueInsight(q){
 const clue=(q.review_clue||'').trim(); if(!clue)return '';
 const sig=contextSignal(q);
 const prefix=sig?`<strong>${esc(sig[0])}</strong>：${esc(sig[1])}`:'この問題では、周囲の説明が正解を絞る手がかりになります。';
 return `${prefix}<br><span class="note">文脈の手がかり：</span> <strong>${esc(clue)}</strong>`;
}
function smartTipHtml(q,correctJa,fullJa,phraseJa){
 if(q.manual_tip){const lines=String(q.manual_tip).split(/\n+/).map(x=>`<div style=\"margin-top:7px;line-height:1.9\">${esc(x)}</div>`).join('');return `<b>💡 ワンポイント</b><div style=\"margin-top:7px\"><div><strong>${esc(q.answer_text)}</strong> ＝「${esc(correctJa||'意味を確認してください')}」</div>${fullJa?`<div style=\"margin-top:7px\"><span class=\"note\">完成文の意味：</span> ${esc(fullJa)}</div>`:''}<div style=\"margin-top:10px;padding-top:9px;border-top:1px solid #e3dcc0\"><strong>📘 この問題のポイント</strong>${lines}</div></div>`;}
 const grammar=exactGrammarInsight(q),slot=slotInsight(q),lex=lexicalInsight(q),clue=clueInsight(q),phrase=q.review_phrase||phraseAroundBlank(q,3,4);
 const main=grammar||lex||slot;
 const parts=[];
 if(main)parts.push(main);
 // 文法問題では文法解説を主役にし、語彙問題では文脈ヒントを必ず足す。
 if(clue && (!grammar || q.review_role==='vocab' || q.review_role==='noun' || q.review_role==='verb' || q.review_role==='adjective' || q.review_role==='adverb'))parts.push(clue);
 if(phrase&&phrase.toLowerCase()!==q.answer_text.toLowerCase()){
  parts.push(`<span class="note">覚えるまとまり：</span> <strong>${esc(phrase)}</strong>${phraseJa?` ＝「${esc(phraseJa)}」`:''}`);
 }
 return `<b>💡 ワンポイント</b><div style="margin-top:7px"><div><strong>${esc(q.answer_text)}</strong> ＝「${esc(correctJa||'意味を確認してください')}」</div>${fullJa?`<div style="margin-top:7px"><span class="note">完成文の意味：</span> ${esc(fullJa)}</div>`:''}${parts.length?`<div style="margin-top:10px;line-height:1.9">${parts.join('<br>')}</div>`:''}</div>`;
}
function loadLearningHelp(q){
 const box=document.getElementById('choiceTranslations'),tip=document.getElementById('quickTip');if(!box||!tip)return;
 const jas=q.choices.map(c=>c.ja||choiceJapanese(c.text));
 box.innerHTML='<b>すべての選択肢の意味</b>'+q.choices.map((c,i)=>`<div style="display:grid;grid-template-columns:28px 1fr;gap:8px;margin-top:8px"><b>${c.number}</b><div><span style="font-family:Georgia,serif">${esc(c.text)}</span> <span class="muted">＝ ${esc(jas[i])}</span></div></div>`).join('');
 const correctJa=jas[q.answer_number-1];
 tip.innerHTML=smartTipHtml(q,correctJa,q.question_ja||'',q.review_phrase_ja||'');
}

function cloneJson(x){return JSON.parse(JSON.stringify(x));}
function mergeStateFromCloud(remoteInput){
  let remote;
  try{remote=C.validate(remoteInput,QUESTIONS);}catch{return false;}
  const local=state;
  const merged=C.blank();
  const ids=new Set([...Object.keys(local.records||{}),...Object.keys(remote.records||{})]);
  for(const id of ids){
    const a=local.records[id],b=remote.records[id];
    if(!a)merged.records[id]=b;
    else if(!b)merged.records[id]=a;
    else if((b.updatedAt||0)>(a.updatedAt||0))merged.records[id]=b;
    else if((a.updatedAt||0)>(b.updatedAt||0))merged.records[id]=a;
    else merged.records[id]=(b.attempts||0)>(a.attempts||0)?b:a;
  }
  const remoteIsNewer=(remote.updatedAt||0)>(local.updatedAt||0);
  merged.screenLogs=[...new Map([...(remote.screenLogs||[]),...(local.screenLogs||[])].map(r=>[r.id,r])).values()].sort((a,b)=>a.endedAt-b.endedAt).slice(-100);
  merged.settings=cloneJson(remoteIsNewer?remote.settings:local.settings);
  merged.session=cloneJson(remoteIsNewer?remote.session:local.session);
  merged.updatedAt=Math.max(Number(local.updatedAt)||0,Number(remote.updatedAt)||0);
  try{state=C.validate(merged,QUESTIONS);}catch{
    state=remoteIsNewer?remote:local;
  }
  return true;
}
function applyCloudSnapshot(payload){
  if(!payload||typeof payload!=='object')return false;
  suppressCloudSave=true;
  try{
    if(payload.state)mergeStateFromCloud(payload.state);
    const rp=payload.profile&&typeof payload.profile==='object'?payload.profile:null;
    if(rp){
      const remoteTime=Number(rp.updatedAt)||0,localTime=Number(profile.updatedAt)||0;
      if(remoteTime>localTime){
        profile={
          equippedTitle:typeof rp.equippedTitle==='string'?rp.equippedTitle:'',
          updatedAt:remoteTime
        };
      }
    }
    localStorage.setItem(KEY,JSON.stringify(state));
    localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));

    render();
    return true;
  }catch(e){
    console.error(e);
    return false;
  }finally{
    suppressCloudSave=false;
  }
}
window.retryAppBridge={
  getCloudPayload:()=>({
    app:'eiken-retry-notebook',
    schemaVersion:1,
    state:cloneJson(state),
    profile:cloneJson(profile)
  }),
  applyCloudSnapshot,
  notify:(message)=>toast(message),
  canCloudSave:()=>cloudSaveAllowed()
};

// Track only an active quiz. blur + visibilitychange describe one departure.
let screenAwayStart=null,screenAwaySession=null;
function activeScreenSession(){const s=state.session;return !readOnly&&page==='quiz'&&s&&s.index<s.ids.length?s:null;}
function openScreenAway(){const s=activeScreenSession();if(!s||screenAwayStart!==null)return;s.screenAway||={count:0,totalMs:0};s.screenAway.count++;screenAwayStart=Date.now();screenAwaySession=s;persist();}
function closeScreenAway(){if(screenAwayStart===null)return;const s=screenAwaySession;if(s?.screenAway)s.screenAway.totalMs+=Math.max(0,Date.now()-screenAwayStart);screenAwayStart=null;screenAwaySession=null;persist();}
function finishScreenLog(){const s=state.session;if(!s||s.index<s.ids.length)return;closeScreenAway();const logs=state.screenLogs||=[];if(logs.some(r=>r.id===s.id))return;logs.push({id:s.id,startedAt:s.startedAt,endedAt:Date.now(),mode:s.mode,total:s.answers.length,correct:s.answers.filter(a=>a.correct).length,count:s.screenAway?.count||0,totalMs:s.screenAway?.totalMs||0});state.screenLogs=logs.slice(-100);persist();}
window.addEventListener('blur',openScreenAway);
window.addEventListener('focus',()=>{if(!document.hidden)closeScreenAway();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)openScreenAway();else closeScreenAway();});
window.addEventListener('pagehide',()=>{closeScreenAway();if(cloudSaveAllowed())window.firebaseRetryCloud?.saveNow?.();});
function render(){document.querySelectorAll('nav [data-page]').forEach(b=>{const active=b.dataset.page===page;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});app.innerHTML=page==='home'?home():page==='review'?review():page==='history'?history():quiz();if(page==='quiz'&&state.session&&state.session.index<state.session.ids.length&&state.session.answers[state.session.index]){const q=BY_ID.get(state.session.ids[state.session.index]);if(q)setTimeout(()=>loadLearningHelp(q),0);}if(state.session&&state.session.index>=state.session.ids.length)setTimeout(()=>void finalizeCompletedSession(state.session),0);}
function exportState(){const payload={...state,app:'eiken-retry-notebook',profile:{equippedTitle:profile.equippedTitle||''},exportedAt:new Date().toISOString()};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='eiken-learning-record-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('記録ファイルを保存しました。');}
// The daily challenge promises progress after one answer, not after a full session.
function recordRetryChallengeAnswer(){
  const api=window.EnglishPlayroomCoins,uid=api?.getUserId?.();
  if(!uid||typeof api.recordLearningActivity!=='function')return;
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const key='monstudy-retry-challenge-day:'+uid+':'+day;
  try{if(localStorage.getItem(key)==='1')return;}catch{}
  // Keep retry cloud answer uploads batched at the end of a session.
  void Promise.resolve(api.recordLearningActivity('eiken-retry')).then(()=>{
    try{localStorage.setItem(key,'1');}catch{}
  }).catch(error=>console.warn('Retry challenge activity deferred',error));
}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.page){navigate(b.dataset.page);return;}if(b.dataset.series!==undefined){series=Number(b.dataset.series);render();return;}if(b.dataset.choice!==undefined){const s=state.session;if(!s)return;const q=BY_ID.get(s.ids[s.index]);if(!q)return;if(C.answer(state,q,Number(b.dataset.choice))){persist();recordRetryChallengeAnswer();render();loadLearningHelp(q);}return;}switch(b.dataset.action){case'start-new':{let qs=C.pool(QUESTIONS,state,'new');qs=C.shuffle(qs);if(state.settings.count)qs=qs.slice(0,state.settings.count);newSession('new',qs.map(q=>q.id));break;}case'start-series':newSession(series?'series':'review',C.pool(QUESTIONS,state,series?'series':'review',series).map(q=>q.id));break;case'resume':navigate('quiz');break;case'next':if(C.advance(state)){const finished=state.session.index>=state.session.ids.length;persist({cloud:finished});render();if(finished)void finalizeCompletedSession(state.session);window.scrollTo({top:0,behavior:'instant'});}break;case'retry-round':newSession('review',C.retryIds(state));break;case'export':exportState();break;case'import':document.getElementById('importFile').click();break;case'reset':if(confirm('すべての級の学習記録を削除します。元に戻せません。削除しますか？')){state=C.blank();readOnly=false;try{localStorage.removeItem(KEY);localStorage.removeItem(PROFILE_KEY);profile={equippedTitle:'',updatedAt:0};document.getElementById('storageAlert').hidden=true;}catch{}persist();navigate('home');toast('学習記録を初期化しました。');}break;}});
document.addEventListener('change',e=>{if(['grade','source','count'].includes(e.target.id)){state.settings[e.target.id]=e.target.id==='count'?Number(e.target.value):e.target.value;persist();render();}if(e.target.id==='recordFilter'){recordFilter=e.target.value;render();}});
document.getElementById('importFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>5*1024*1024)throw Error('ファイルが大きすぎます。');const incoming=JSON.parse(await f.text());if(incoming.app!=='eiken-retry-notebook')throw Error('このアプリの記録ファイルを選んでください。');const restored=C.validate(incoming,QUESTIONS);if(!confirm('この端末の全学習記録を、ファイルの記録で置き換えますか？'))return;state=restored;readOnly=false;profile={equippedTitle:typeof incoming.profile?.equippedTitle==='string'?incoming.profile.equippedTitle:'',updatedAt:Number(incoming.profile?.updatedAt)||Date.now()};persistProfile();document.getElementById('storageAlert').hidden=true;const saved=persist();navigate('history');toast(saved?'学習記録を取り込みました。':'取り込みましたが、自動保存できません。');}catch(err){alert('取り込めませんでした：'+err.message);}finally{e.target.value='';}});
window.addEventListener('storage',e=>{
  if(e.key===PROFILE_KEY){try{const p=JSON.parse(e.newValue||'{}');profile={equippedTitle:typeof p.equippedTitle==='string'?p.equippedTitle:''};render();}catch{}return;}
  if(e.key!==KEY)return;
  try{state=e.newValue?C.validate(JSON.parse(e.newValue),QUESTIONS):C.blank();render();toast('別のタブで更新された記録を読み込みました。');}
  catch{showAlert('別のタブの記録を読み込めません。画面を再読み込みしてください。');readOnly=true;}
});
render();
