'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../assets/trainer-core.js');

const questions=Array.from({length:32},(_,i)=>({
 id:'q'+i,grade:i<25?'2級':'3級',answer_status:i===0?'unofficial':'official',answer_number:1
}));
function stateWithMistakes(){
 const state=C.blank();state.settings.grade='2級';
 questions.forEach((q,i)=>{
  if(i>=25)return;
  state.records[q.id]={attempts:2,mistakes:1,correct:1,pending:i%2===0,
   lastChoice:1,lastCorrect:i%2!==0,updatedAt:Date.now()};
 });
 return state;
}
test('defaults new and existing learner settings to ten review questions',()=>{
 assert.equal(C.blank().settings.reviewCount,10);
 const existing=C.blank();delete existing.settings.reviewCount;
 assert.equal(C.validate(existing,questions).settings.reviewCount,10);
 for(const value of [5,10,20,50,0]){
  const state=C.blank();state.settings.reviewCount=value;
  assert.equal(C.validate(state,questions).settings.reviewCount,value);
 }
 const corrupt=C.blank();corrupt.settings.reviewCount=100000;
 assert.equal(C.validate(corrupt,questions).settings.reviewCount,10);
});
test('series review picks unique random questions and respects count limit',()=>{
 const state=stateWithMistakes(),before=JSON.stringify(state);
 for(const [count,expected] of [[5,5],[10,10],[20,20],[50,25],[0,25]]){
  const selected=C.reviewIds(questions,state,1,count,()=>0.21);
  assert.equal(selected.length,expected);
  assert.equal(new Set(selected).size,selected.length);
  assert.ok(selected.every(id=>id.startsWith('q')&&Number(id.slice(1))<25));
 }
 assert.equal(JSON.stringify(state),before,'choosing a review must not mutate saved records');
});
test('current mistakes review only includes pending questions and honors official filter',()=>{
 const state=stateWithMistakes();state.settings.source='official';
 const selected=C.reviewIds(questions,state,0,0,()=>0.17);
 const expected=questions.filter(q=>q.grade==='2級'&&q.answer_status==='official'&&state.records[q.id].pending).map(q=>q.id);
 assert.deepEqual(selected.slice().sort(),expected.slice().sort());
 assert.ok(!selected.includes('q0'));
 const sampled=C.reviewIds(questions,state,0,5,()=>0.7);
 assert.equal(sampled.length,5);
});
test('selected review creates a resumable session with only its selected problems',()=>{
 const state=stateWithMistakes();
 state.settings.reviewCount=5;
 const selected=C.reviewIds(questions,state,1,undefined,()=>0.41);
 assert.equal(C.begin(state,selected,'series',1710000000000),true);
 assert.equal(state.session.ids.length,5);
 const restored=C.validate(state,questions);
 assert.equal(restored.session.ids.length,5);
 assert.equal(restored.settings.reviewCount,5);
});
