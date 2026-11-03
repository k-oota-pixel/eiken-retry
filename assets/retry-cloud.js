import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signOut, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://k-oota-pixel.github.io/english-playroom/auth-session.js?v=2.3.1";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAllLjPcGhygMSEIORXhKZOaDjYvpSJ4EQ",
  authDomain: "eiken-retry.firebaseapp.com",
  projectId: "eiken-retry",
  storageBucket: "eiken-retry.firebasestorage.app",
  messagingSenderId: "231308672297",
  appId: "1:231308672297:web:5e8b8ede3a0246c2318b38",
  measurementId: "G-8CWR37L5K0"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({prompt:"select_account"});

const loginBtn=document.getElementById("firebaseLogin");
const logoutBtn=document.getElementById("firebaseLogout");
const authLabel=document.getElementById("authLabel");
const cloudNote=document.getElementById("cloudNote");
const cloudDot=document.getElementById("cloudDot");

let currentUser=null;
let cloudReady=false;
let authReady=false;
let signingIn=false;
let loginAttempt=0;
let saveTimer=null;
let saving=false;
let saveAgain=false;

function setCloudUI(mode,label,note){
  cloudDot.className="cloud-dot"+(mode?` ${mode}`:"");
  authLabel.textContent=label;
  cloudNote.textContent=note||"";
}
function shortName(user){
  const name=(user?.displayName||"").trim();
  if(name)return name.length>10?name.slice(0,10)+"…":name;
  return "ログイン中";
}
function cloudRef(user){
  return doc(db,"users",user.uid,"apps","eiken-retry");
}
function resetLoggedOutUI(note="端末保存"){
  signingIn=false;
  loginBtn.disabled=!authReady;
  loginBtn.classList.remove("signed-in");
  logoutBtn.hidden=true;
  setCloudUI("","Googleログイン",note);
}
function loginErrorMessage(err){
  switch(err?.code){
    case "auth/popup-blocked":
      return "Googleログイン画面がブロックされました。ブラウザでこのサイトのポップアップを許可して、もう一度押してください。";
    case "auth/popup-closed-by-user":
      return "Googleログインをキャンセルしました。";
    case "auth/cancelled-popup-request":
      return "ログイン処理をやり直してください。";
    case "auth/unauthorized-domain":
      return "このサイトがFirebaseの承認済みドメインに登録されていません。";
    case "auth/network-request-failed":
      return "通信エラーでGoogleログインできませんでした。ネット接続を確認してください。";
    default:
      return `Googleログインを完了できませんでした${err?.code?`（${err.code}）`:""}。`;
  }
}
async function saveNow(){
  if(!currentUser||!cloudReady||saving)return;
  saving=true;
  const savingUid=currentUser.uid;
  clearTimeout(saveTimer);
  saveTimer=null;
  setCloudUI("busy",shortName(currentUser),"同期中…");
  try{
    const payload=window.retryAppBridge?.getCloudPayload?.();
    if(!payload)throw new Error("学習記録を取得できません。");
    await setDoc(cloudRef(currentUser),{
      ...payload,
      clientSavedAt:Date.now(),
      serverSavedAt:serverTimestamp()
    },{merge:true});
    if(currentUser?.uid===savingUid)document.dispatchEvent(new CustomEvent("retry-cloud-saved",{detail:{uid:savingUid}}));
    setCloudUI("ok",shortName(currentUser),"クラウド保存済み");
  }catch(err){
    console.error("Cloud save failed",err);
    setCloudUI("error",shortName(currentUser),"保存エラー");
    window.retryAppBridge?.notify?.("クラウド保存に失敗しました。Firestoreのルールを確認してください。");
  }finally{
    saving=false;
    if(saveAgain){saveAgain=false;saveSoon();}
  }
}
function saveSoon(){
  if(!currentUser||!cloudReady)return;
  if(saving){saveAgain=true;return;}
  clearTimeout(saveTimer);
  saveTimer=setTimeout(saveNow,700);
}
window.firebaseRetryCloud={saveSoon,saveNow};

loginBtn.addEventListener("click",async()=>{
  if(currentUser||!authReady||signingIn)return;

  signingIn=true;
  const attempt=++loginAttempt;
  loginBtn.disabled=true;
  setCloudUI("busy","Googleを開いています…","別ウィンドウで認証");

  // If the Google window is hidden behind the browser or blocked without a prompt,
  // don't leave the app looking frozen forever.
  const slowTimer=setTimeout(()=>{
    if(signingIn&&attempt===loginAttempt){
      setCloudUI("busy","Google認証待ち","別ウィンドウを確認");
      window.retryAppBridge?.notify?.("Googleのログイン画面を確認してください。表示されない場合は、このサイトのポップアップを許可してください。");
    }
  },4500);

  const recoverTimer=setTimeout(()=>{
    if(signingIn&&attempt===loginAttempt&&!currentUser){
      signingIn=false;
      loginBtn.disabled=false;
      setCloudUI("error","Googleログイン","再試行できます");
      window.retryAppBridge?.notify?.("認証が完了していません。Google画面が出なかった場合はポップアップを許可して、もう一度お試しください。");
    }
  },20000);

  try{
    await signInWithPopup(auth,provider);
  }catch(err){
    console.error("Google sign-in failed",err);
    if(attempt===loginAttempt){
      signingIn=false;
      loginBtn.disabled=false;
      setCloudUI("error","Googleログイン","認証できませんでした");
      window.retryAppBridge?.notify?.(loginErrorMessage(err));
    }
  }finally{
    clearTimeout(slowTimer);
    clearTimeout(recoverTimer);
    if(attempt===loginAttempt && !currentUser){
      signingIn=false;
      loginBtn.disabled=false;
    }
  }
});

logoutBtn.addEventListener("click",async()=>{
  try{
    if(window.retryAppBridge?.canCloudSave?.()!==false)await saveNow();
    await signOut(auth);
  }catch(err){
    console.error(err);
    window.retryAppBridge?.notify?.("ログアウトできませんでした。");
  }
});

try{
  await setPersistence(auth,browserLocalPersistence);
}catch(err){
  console.error("Auth persistence setup failed",err);
}

onAuthStateChanged(auth,async user=>{
  authReady=true;
  currentUser=user||null;
  cloudReady=false;
  loginAttempt++;

  if(!user){
    resetLoggedOutUI("端末保存");
    return;
  }

  signingIn=false;
  loginBtn.disabled=true;
  logoutBtn.hidden=false;
  loginBtn.classList.add("signed-in");
  setCloudUI("busy",shortName(user),"クラウド読込中…");

  try{
    const ref=cloudRef(user);
    const snap=await getDoc(ref);
    if(snap.exists()){
      const ok=window.retryAppBridge?.applyCloudSnapshot?.(snap.data());
      if(!ok)throw new Error("クラウド記録の形式を確認できません。");
      window.retryAppBridge?.notify?.("クラウドの学習記録と同期しました。");
      cloudReady=true;
      setCloudUI("ok",shortName(user),"クラウド同期済み");
    }else{
      window.retryAppBridge?.notify?.("このアカウントのクラウド保存を開始しました。");
      cloudReady=true;
      await saveNow();
    }
  }catch(err){
    console.error("Cloud load failed",err);
    cloudReady=false;
    setCloudUI("error",shortName(user),"Firestore設定を確認");
    window.retryAppBridge?.notify?.("ログインは成功しましたが、クラウド記録を読み書きできません。Firestoreのルールを確認してください。");
  }finally{
    loginBtn.disabled=false;
  }
});
