'use strict';
const TrainerCore = (() => {
  const blank = () => ({version:1,records:{},session:null,settings:{grade:'準2級',source:'all',count:10},updatedAt:0});
  const stat = (state,id) => state.records[id] || {attempts:0,mistakes:0,correct:0,pending:false,lastChoice:null,lastCorrect:null,updatedAt:0};
  function pool(questions,state,mode,filter=0) {
    return questions.filter(q => (!state.settings.grade || q.grade===state.settings.grade) && (state.settings.source!=='official' || q.answer_status==='official') && (mode==='new' ? stat(state,q.id).attempts===0 : (mode==='series' ? stat(state,q.id).mistakes>=Math.max(1,filter) : stat(state,q.id).pending)));
  }
  function shuffle(items,rng=Math.random) {const a=[...items]; for(let i=a.length-1;i>0;i--){let j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function begin(state,ids,mode,now=Date.now()) {
    if(!ids.length) return false;
    state.session={id:String(now),mode,ids:[...new Set(ids)],index:0,answers:[],startedAt:now,screenAway:{count:0,totalMs:0}};return true;
  }
  function answer(state,question,choice,now=Date.now()) {
    const s=state.session;
    if(!s || s.ids[s.index]!==question.id || s.answers.length!==s.index || ![0,1,2,3,4].includes(choice)) return null;
    const correct=choice===question.answer_number, old=stat(state,question.id);
    state.records[question.id]={attempts:old.attempts+1,mistakes:old.mistakes+(correct?0:1),correct:old.correct+(correct?1:0),pending:!correct,lastChoice:choice,lastCorrect:correct,updatedAt:now};
    const result={id:question.id,choice,correct,at:now,wasPending:old.pending};s.answers.push(result);state.updatedAt=now;return result;
  }
  function advance(state) {const s=state.session;if(!s || s.answers.length!==s.index+1)return false;s.index++;return true;}
  function retryIds(state) {return (state.session?.answers||[]).filter(a=>!a.correct && stat(state,a.id).pending).map(a=>a.id);}
  function validate(input,questions) {
    if(!input || input.version!==1 || !input.records || typeof input.records!=='object' || Array.isArray(input.records))throw Error('対応していない記録ファイルです。');
    const valid=new Map(questions.map(q=>[q.id,q]));const out=blank();
    const integer=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000;
    for(const [id,r] of Object.entries(input.records)) {
      if(!valid.has(id))continue;
      if(!r || !integer(r.attempts)||!integer(r.mistakes)||!integer(r.correct)||r.attempts!==r.mistakes+r.correct||r.attempts<1||typeof r.pending!=='boolean'||typeof r.lastCorrect!=='boolean'||r.pending===r.lastCorrect||![0,1,2,3,4].includes(r.lastChoice)||!Number.isFinite(r.updatedAt)||r.mistakes<(r.pending?1:0)||r.correct<(r.lastCorrect?1:0))throw Error('記録データの形式が正しくありません。');
      out.records[id]={attempts:r.attempts,mistakes:r.mistakes,correct:r.correct,pending:r.pending,lastChoice:r.lastChoice,lastCorrect:r.lastCorrect,updatedAt:r.updatedAt};
    }
    const cfg=input.settings||{};out.settings={grade:['4級','3級','準2級','2級','準1級',''].includes(cfg.grade)?cfg.grade:'準2級',source:cfg.source==='official'?'official':'all',count:[5,10,20,50,0].includes(cfg.count)?cfg.count:10};
    const s=input.session;
    if(s) {
      if(!Array.isArray(s.ids)||!s.ids.length||s.ids.length>questions.length||new Set(s.ids).size!==s.ids.length||s.ids.some(id=>!valid.has(id))||!integer(s.index)||s.index>s.ids.length||!Array.isArray(s.answers)||s.answers.length<s.index||s.answers.length>Math.min(s.index+1,s.ids.length)||!['new','review','series'].includes(s.mode))throw Error('途中の学習記録が正しくありません。');
      const answers=s.answers.map((a,i)=>{if(!a||a.id!==s.ids[i]||![0,1,2,3,4].includes(a.choice)||typeof a.correct!=='boolean'||a.correct!==(a.choice===valid.get(a.id).answer_number)||!Number.isFinite(a.at)||!out.records[a.id])throw Error('回答記録が正しくありません。');return {id:a.id,choice:a.choice,correct:a.correct,at:a.at,wasPending:!!a.wasPending};});
      out.session={id:String(s.id),mode:s.mode,ids:s.ids.slice(),index:s.index,answers,startedAt:Number(s.startedAt)||0};
    }
    out.screenLogs=Array.isArray(input.screenLogs)?input.screenLogs.filter(r=>r&&typeof r.id==='string'&&Number.isFinite(r.endedAt)&&Number.isSafeInteger(r.count)&&r.count>=0&&Number.isFinite(r.totalMs)&&r.totalMs>=0).slice(-100):[];
    if(out.session&&s.screenAway){const a=s.screenAway;out.session.screenAway={count:Number.isSafeInteger(a.count)&&a.count>=0?a.count:0,totalMs:Number.isFinite(a.totalMs)&&a.totalMs>=0?a.totalMs:0};}
    out.updatedAt=Number(input.updatedAt)||0;return out;
  }
  return {blank,stat,pool,shuffle,begin,answer,advance,retryIds,validate};
})();
if(typeof module!=='undefined')module.exports=TrainerCore;
