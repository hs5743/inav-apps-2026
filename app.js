import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  projectId: "inav-apps-2026",
  appId: "1:841679321046:web:c17f1798e2f1bbf062d677",
  storageBucket: "inav-apps-2026.firebasestorage.app",
  apiKey: "AIzaSyC4Ne9KNduc4p4dKhwjDCOKoZ9J_ne_ckM",
  authDomain: "inav-apps-2026.firebaseapp.com",
  messagingSenderId: "841679321046"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const ADMIN_EMAILS = ["hs5743@gapp.hcc.edu.tw"];
const SCENARIOS = window.SCENARIOS || [];
const STRATEGIES = window.STRATEGIES || [];
const byId = id => document.getElementById(id);

const avatars = [
  { key: "avatar-1", icon: "explore", color: "bg-ocean", label: "指南針" },
  { key: "avatar-2", icon: "psychology", color: "bg-coral", label: "覺察" },
  { key: "avatar-3", icon: "forum", color: "bg-mint", label: "溝通" },
  { key: "avatar-4", icon: "route", color: "bg-amber", label: "路線" },
  { key: "avatar-5", icon: "shield", color: "bg-violet", label: "守護" },
  { key: "avatar-6", icon: "lightbulb", color: "bg-ocean", label: "點子" },
  { key: "avatar-7", icon: "diversity_3", color: "bg-mint", label: "合作" },
  { key: "avatar-8", icon: "auto_awesome", color: "bg-violet", label: "絕招" }
];

const categoryStyle = {
  "溝通": { icon: "forum", color: "#176b87" },
  "覺察": { icon: "favorite", color: "#d95d4f" },
  "決策": { icon: "route", color: "#d88a16" },
  "守護": { icon: "shield", color: "#1f9a8a" },
  "萬用": { icon: "auto_awesome", color: "#5b5f97" }
};

let myName = "";
let myRoom = "";
let amILeader = false;
let selectedAvatarKey = "avatar-1";
let currentState = null;
let currentHand = [];
let activeCard = null;
let unsubscribeRoom = null;
let unsubscribePlayers = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function sanitize(value, maxLength) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function roomRef(room = myRoom) {
  return doc(db, "rooms", room);
}

function playersRef(room = myRoom) {
  return collection(db, "rooms", room, "players");
}

function playerRef(room = myRoom, name = myName) {
  return doc(db, "rooms", room, "players", name);
}

function screen(id) {
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  byId(id).classList.add("active");
}

function showLoading(text) {
  byId("loadingText").textContent = text || "處理中...";
  byId("loading").classList.remove("hidden");
}

function hideLoading() {
  byId("loading").classList.add("hidden");
}

function toast(message, type = "info") {
  const el = byId("toast");
  el.textContent = message;
  el.className = "toast" + (type === "error" ? " error" : "");
  el.classList.remove("hidden");
  window.setTimeout(() => el.classList.add("hidden"), 3200);
}

function avatarMeta(key) {
  return avatars.find(a => a.key === key) || avatars[0];
}

function avatarHtml(key, small = false) {
  const avatar = avatarMeta(key);
  return `<div class="avatar-dot ${small ? "small" : ""} ${avatar.color}"><span class="material-symbols-outlined">${avatar.icon}</span></div>`;
}

function renderAvatarPicker() {
  byId("avatarPicker").innerHTML = avatars.map(a => `
    <button type="button" class="avatar-choice ${a.key === selectedAvatarKey ? "selected" : ""}" data-avatar="${a.key}" title="${escapeHtml(a.label)}">
      <div class="avatar-dot ${a.color}" style="margin:0 auto;"><span class="material-symbols-outlined">${a.icon}</span></div>
      <div class="small-label" style="margin:6px 0 0;">${escapeHtml(a.label)}</div>
    </button>
  `).join("");
  document.querySelectorAll("[data-avatar]").forEach(btn => btn.addEventListener("click", () => {
    selectedAvatarKey = btn.dataset.avatar;
    renderAvatarPicker();
  }));
}

function dealHand() {
  const pool = STRATEGIES.slice(0, 52);
  const hand = [];
  while (hand.length < 5 && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    hand.push(pool.splice(idx, 1)[0]);
  }
  if (STRATEGIES[52]) hand.push(STRATEGIES[52]);
  return hand;
}

function pickScenario(history = []) {
  const recent = Array.isArray(history) ? history.slice(-8) : [];
  let index = Math.floor(Math.random() * SCENARIOS.length);
  let guard = 0;
  while (recent.includes(index) && guard < 30) {
    index = Math.floor(Math.random() * SCENARIOS.length);
    guard++;
  }
  return { index, history: [...recent, index].slice(-12) };
}

function buildState(roomData, players) {
  return {
    roomID: myRoom,
    status: roomData.status || "ACTIVE",
    roundState: roomData.roundState || "LOBBY",
    roundCount: Number(roomData.roundCount) || 0,
    leaderMessage: roomData.leaderMessage || "歡迎來到人際導航員，請等待組員加入。",
    scenario: Number.isInteger(roomData.scenarioIdx) && roomData.scenarioIdx >= 0 ? SCENARIOS[roomData.scenarioIdx] : null,
    playerCount: players.length,
    players,
    updatedAt: roomData.updatedAt,
    serverTime: new Date().toISOString()
  };
}

async function login(isLeader) {
  myName = sanitize(byId("playerName").value, 16);
  myRoom = sanitize(byId("roomCode").value, 24).toUpperCase();
  amILeader = Boolean(isLeader);
  if (!myName || !myRoom) return toast("請輸入姓名與房間代碼。", "error");
  showLoading("連線建立中...");
  try {
    await runTransaction(db, async tx => {
      const rRef = roomRef();
      const pRef = playerRef();
      const roomSnap = await tx.get(rRef);
      const playerSnap = await tx.get(pRef);
      if (!roomSnap.exists()) {
        if (!amILeader) throw new Error("房間尚未建立，請確認房間代碼或請組長先建立。");
        tx.set(rRef, {
          status: "ACTIVE",
          scenarioIdx: -1,
          roundState: "LOBBY",
          roundCount: 0,
          leaderMessage: "歡迎來到人際導航員，請等待組員加入。",
          scenarioHistory: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      const base = playerSnap.exists() ? playerSnap.data() : {};
      tx.set(pRef, {
        name: myName,
        isLeader: Boolean(base.isLeader || amILeader),
        avatarKey: selectedAvatarKey,
        hand: Array.isArray(base.hand) && base.hand.length ? base.hand : dealHand(),
        playedCard: base.playedCard || null,
        customText: base.customText || "",
        score: Number(base.score) || 0,
        votedFor: base.votedFor || "",
        joinedAt: base.joinedAt || serverTimestamp(),
        lastActiveAt: serverTimestamp()
      }, { merge: true });
      tx.update(rRef, { updatedAt: serverTimestamp() });
    });
    screen("gameScreen");
    byId("leaderPanel").classList.toggle("hidden", !amILeader);
    subscribeRoom();
  } catch (error) {
    toast(error.message || "連線失敗。", "error");
  } finally {
    hideLoading();
  }
}

function subscribeRoom() {
  if (unsubscribeRoom) unsubscribeRoom();
  if (unsubscribePlayers) unsubscribePlayers();
  let roomData = null;
  let players = [];
  const publish = () => {
    if (!roomData) return;
    const state = buildState(roomData, players);
    renderState(state);
  };
  unsubscribeRoom = onSnapshot(roomRef(), snap => {
    if (!snap.exists()) {
      toast("這個房間已被解散。", "error");
      leaveGame();
      return;
    }
    roomData = snap.data();
    publish();
  }, err => toast(err.message, "error"));
  unsubscribePlayers = onSnapshot(playersRef(), snap => {
    players = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name, "zh-Hant"));
    publish();
  }, err => toast(err.message, "error"));
}

async function refreshState() {
  if (!myRoom) return;
  showLoading("重新整理中...");
  try {
    const [roomSnap, playersSnap] = await Promise.all([getDoc(roomRef()), getDocs(playersRef())]);
    if (!roomSnap.exists()) throw new Error("找不到房間。");
    const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderState(buildState(roomSnap.data(), players));
  } catch (error) {
    toast(error.message, "error");
  } finally {
    hideLoading();
  }
}

function renderState(state) {
  const me = state.players.find(p => p.name === myName);
  if (!me) return;
  currentState = state;
  currentHand = Array.isArray(me.hand) ? me.hand : [];
  selectedAvatarKey = me.avatarKey || selectedAvatarKey;
  const avatar = avatarMeta(me.avatarKey);
  byId("uiRoom").textContent = state.roomID;
  byId("uiRound").textContent = state.roundCount;
  byId("uiScore").textContent = me.score || 0;
  byId("uiIdentity").textContent = (me.isLeader ? "組長 " : "玩家 ") + me.name;
  byId("headerAvatar").className = `avatar-icon ${avatar.color}`;
  byId("headerAvatar").innerHTML = `<span class="material-symbols-outlined">${avatar.icon}</span>`;
  byId("myBadge").textContent = (me.isLeader ? "組長 " : "玩家 ") + me.name + "｜你";
  byId("uiMessage").textContent = state.leaderMessage;
  byId("syncMeta").textContent = `組員 ${state.players.length} 位｜${new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  renderScenario(state);
  renderPlayers(state, me);
  renderLeaderPanel(state);
  renderAction(state, me);
}

function renderScenario(state) {
  const panel = byId("scenarioPanel");
  if (!state.scenario) {
    panel.innerHTML = `<div class="scenario-body"><h2>等待組長發布第一個任務</h2><p>組員加入後，組長可以開始新任務。每一輪會抽出一個校園情境，大家選策略並說明理由。</p></div>`;
    return;
  }
  const [id, type, text, feeling] = state.scenario;
  panel.innerHTML = `<div class="scenario-top"><span>任務 ${escapeHtml(id)}</span><span>${escapeHtml(type)}</span></div>
    <div class="scenario-body">
      <h2>${escapeHtml(text)}</h2>
      <div class="feelings"><span>可能感受：${escapeHtml(feeling)}</span><span>想想安全、尊重、有效</span></div>
    </div>`;
}

function renderPlayers(state, me) {
  byId("playersList").innerHTML = state.players.map(p => {
    const done = state.roundState === "PLAYING" ? Boolean(p.playedCard) : state.roundState === "VOTING" ? Boolean(p.votedFor) : true;
    return `<div class="player-row ${p.name === me.name ? "me" : ""}">
      ${avatarHtml(p.avatarKey, true)}
      <div class="grow"><strong>${escapeHtml(p.name)} ${p.isLeader ? "★" : ""} ${p.name === me.name ? "｜你" : ""}</strong><small>總分 ${Number(p.score) || 0}</small></div>
      <span class="material-symbols-outlined" style="color:${done ? "#1f9a8a" : "#d88a16"}">${done ? "check_circle" : "pending"}</span>
    </div>`;
  }).join("");
}

function renderLeaderPanel(state) {
  if (!amILeader) return;
  const stage = state.roundState;
  byId("stageLabel").textContent = stage;
  byId("btnStartRound").classList.toggle("hidden", !(stage === "LOBBY" || stage === "ROUND_RESULT"));
  byId("btnVoting").classList.toggle("hidden", stage !== "PLAYING");
  byId("btnResult").classList.toggle("hidden", stage !== "VOTING");
  byId("btnGameOver").classList.toggle("hidden", stage === "GAMEOVER");
  byId("leaderProgress").innerHTML = state.players.map(p => {
    const text = stage === "PLAYING" ? (p.playedCard ? "已出牌" : "思考中") : stage === "VOTING" ? (p.votedFor ? "已投票" : "待投票") : "待命";
    return `<div class="progress-row"><span>${escapeHtml(p.name)}</span><strong style="margin-left:auto;">${text}</strong></div>`;
  }).join("");
}

function renderAction(state, me) {
  byId("handWrapper").classList.add("hidden");
  byId("voteWrapper").classList.add("hidden");
  if (state.roundState === "LOBBY") {
    byId("actionTitle").textContent = "大廳等待中";
    byId("actionHint").textContent = amILeader ? "組員到齊後，按下「開始新任務」。" : "請等待組長開始第一輪。";
    return;
  }
  if (state.roundState === "PLAYING") {
    if (me.playedCard) {
      byId("actionTitle").textContent = "你已出牌";
      byId("actionHint").textContent = "請等待其他組員完成，接著輪流說明你的策略理由。";
      return;
    }
    byId("actionTitle").textContent = "選擇你的策略卡";
    byId("actionHint").textContent = "點擊卡片看詳細說明，並在彈窗中出牌。";
    byId("handWrapper").classList.remove("hidden");
    renderHand(currentHand);
    return;
  }
  if (state.roundState === "VOTING") {
    byId("actionTitle").textContent = me.votedFor ? "你已完成投票" : "輪流發表並投票";
    byId("actionHint").textContent = "請聽完大家的理由，再選出最安全、尊重、有效的對策。";
    byId("voteWrapper").classList.remove("hidden");
    renderVoteArea(state, me, "VOTING");
    return;
  }
  byId("actionTitle").textContent = state.roundState === "ROUND_RESULT" ? "本輪結算" : "遊戲結束";
  byId("actionHint").textContent = state.roundState === "ROUND_RESULT" ? "請討論高票策略的理由，也可以補充不同情況下的選擇。" : "回顧今天最想帶走的一個人際導航策略。";
  byId("voteWrapper").classList.remove("hidden");
  renderVoteArea(state, me, state.roundState);
}

function renderHand(hand) {
  byId("handArea").innerHTML = hand.map(card => {
    const style = categoryStyle[card[1]] || categoryStyle["萬用"];
    return `<button class="strategy-card" type="button" data-card="${escapeHtml(card[0])}">
      <span class="material-symbols-outlined" style="color:${style.color}">${style.icon}</span>
      <h3>${escapeHtml(card[2])}</h3>
      <p>${escapeHtml(card[3])}</p>
      <strong>能力：${escapeHtml(card[4])}</strong>
    </button>`;
  }).join("");
  document.querySelectorAll("[data-card]").forEach(btn => btn.addEventListener("click", () => openCardModal(btn.dataset.card)));
}

function openCardModal(cardId) {
  const card = currentHand.find(c => c && c[0] === cardId);
  if (!card) return toast("找不到這張策略卡，請重新整理後再試。", "error");
  activeCard = card;
  byId("modalCategory").textContent = `${card[1]}｜${card[0]}`;
  byId("modalTitle").textContent = card[2];
  byId("modalGuide").textContent = card[3];
  byId("modalSkill").textContent = card[4];
  byId("modalTip").textContent = card[5] || "請判斷這個方法是否安全、尊重、有效。";
  byId("blankCardBox").classList.toggle("hidden", card[0] !== "C053");
  byId("blankCardText").value = "";
  byId("cardModal").classList.remove("hidden");
}

function closeCardModal() {
  activeCard = null;
  byId("cardModal").classList.add("hidden");
}

async function playActiveCard() {
  if (!activeCard || !currentState) return;
  const customText = activeCard[0] === "C053" ? sanitize(byId("blankCardText").value, 80) : "";
  if (activeCard[0] === "C053" && !customText) return toast("請先寫下你的空白絕招。", "error");
  showLoading("正在出牌...");
  try {
    await runTransaction(db, async tx => {
      const rSnap = await tx.get(roomRef());
      const pSnap = await tx.get(playerRef());
      if (!rSnap.exists() || !pSnap.exists()) throw new Error("找不到房間或玩家資料。");
      const room = rSnap.data();
      const player = pSnap.data();
      if (room.roundState !== "PLAYING") throw new Error("目前不是出牌階段。");
      if (player.playedCard) throw new Error("你本輪已經出牌了。");
      const hand = Array.isArray(player.hand) ? player.hand : [];
      if (activeCard[0] !== "C053" && !hand.some(card => card[0] === activeCard[0])) throw new Error("你的手牌裡沒有這張卡。");
      const nextHand = activeCard[0] === "C053" ? hand : hand.filter(card => card[0] !== activeCard[0]);
      tx.update(playerRef(), { hand: nextHand, playedCard: activeCard, customText, lastActiveAt: serverTimestamp() });
      tx.update(roomRef(), { updatedAt: serverTimestamp() });
    });
    closeCardModal();
    toast("已送出策略卡。");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    hideLoading();
  }
}

function renderVoteArea(state, me, mode) {
  const players = state.players.map(p => ({ ...p, votes: state.players.filter(v => v.votedFor === p.name).length }));
  const sorted = players.sort((a, b) => mode === "ROUND_RESULT" ? b.votes - a.votes || b.score - a.score : b.score - a.score);
  byId("voteArea").innerHTML = sorted.map(p => {
    const isMe = p.name === myName;
    const card = p.playedCard;
    const voteButton = mode === "VOTING" && !me.votedFor && !isMe && card
      ? `<button class="btn ghost vote-btn" type="button" data-target="${escapeHtml(p.name)}"><span class="material-symbols-outlined">thumb_up</span>投票</button>`
      : "";
    const played = card
      ? card[0] === "C053"
        ? `<div class="vote-card"><strong>空白絕招：</strong>${escapeHtml(p.customText)}</div>`
        : `<div class="vote-card"><strong>${escapeHtml(card[2])}</strong><br>${escapeHtml(card[3])}</div>`
      : `<div class="vote-card">尚未出牌</div>`;
    const result = mode !== "VOTING" ? `<span class="stage-pill">本輪 ${p.votes} 票</span>` : "";
    return `<div class="vote-row">
      <div>${avatarHtml(p.avatarKey, true)} <strong>${escapeHtml(p.name)} ${p.isLeader ? "★" : ""} ${isMe ? "｜你" : ""}</strong> ${result}<span class="stage-pill">總分 ${Number(p.score) || 0}</span>${played}</div>
      <div>${voteButton}</div>
    </div>`;
  }).join("");
  document.querySelectorAll(".vote-btn").forEach(btn => btn.addEventListener("click", () => submitVote(btn.dataset.target)));
}

async function submitVote(targetName) {
  showLoading("正在投票...");
  try {
    await runTransaction(db, async tx => {
      const rSnap = await tx.get(roomRef());
      const voterSnap = await tx.get(playerRef());
      const targetSnap = await tx.get(playerRef(myRoom, targetName));
      if (!rSnap.exists() || !voterSnap.exists() || !targetSnap.exists()) throw new Error("投票資料不完整。");
      if (rSnap.data().roundState !== "VOTING") throw new Error("目前不是投票階段。");
      if (targetName === myName) throw new Error("不能投給自己。");
      if (voterSnap.data().votedFor) throw new Error("你本輪已經投過票了。");
      if (!targetSnap.data().playedCard) throw new Error("這位同學尚未出牌。");
      tx.update(playerRef(), { votedFor: targetName, lastActiveAt: serverTimestamp() });
      tx.update(playerRef(myRoom, targetName), { score: increment(1) });
      tx.update(roomRef(), { updatedAt: serverTimestamp() });
    });
    toast("投票完成。");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    hideLoading();
  }
}

async function changeState(nextState) {
  if (!amILeader) return toast("只有組長可以操作。", "error");
  showLoading("階段切換中...");
  try {
    const playerSnaps = nextState === "PLAYING" ? await getDocs(playersRef()) : null;
    await runTransaction(db, async tx => {
      const rSnap = await tx.get(roomRef());
      if (!rSnap.exists()) throw new Error("找不到房間。");
      const room = rSnap.data();
      const patch = { roundState: nextState, updatedAt: serverTimestamp() };
      if (nextState === "PLAYING") {
        const pick = pickScenario(room.scenarioHistory || []);
        patch.roundCount = Number(room.roundCount || 0) + 1;
        patch.scenarioIdx = pick.index;
        patch.scenarioHistory = pick.history;
        patch.leaderMessage = `第 ${patch.roundCount} 輪開始。請先讀情境，再選一張最合適的策略卡。`;
        playerSnaps.docs.forEach(playerDoc => {
          const p = playerDoc.data();
          tx.update(doc(db, "rooms", myRoom, "players", playerDoc.id), {
            playedCard: null,
            customText: "",
            votedFor: "",
            hand: Array.isArray(p.hand) && p.hand.length ? p.hand : dealHand(),
            lastActiveAt: serverTimestamp()
          });
        });
      } else if (nextState === "VOTING") {
        patch.leaderMessage = "請輪流說明策略理由，再投給最安全、尊重、有效的對策。";
      } else if (nextState === "ROUND_RESULT") {
        patch.leaderMessage = "本輪結果公布。請討論：哪些策略最能照顧自己，也尊重別人？";
      } else if (nextState === "GAMEOVER") {
        patch.status = "ENDED";
        patch.leaderMessage = "遊戲結束。請回顧今天最想帶走的一個人際策略。";
      }
      tx.update(roomRef(), patch);
    });
  } catch (error) {
    toast(error.message, "error");
  } finally {
    hideLoading();
  }
}

async function sendBroadcast() {
  const message = sanitize(byId("broadcastInput").value, 80);
  if (!message) return toast("請先輸入提醒文字。", "error");
  showLoading("廣播發送中...");
  try {
    await updateDoc(roomRef(), { leaderMessage: message, updatedAt: serverTimestamp() });
    byId("broadcastInput").value = "";
  } catch (error) {
    toast(error.message, "error");
  } finally {
    hideLoading();
  }
}

function leaveGame() {
  if (unsubscribeRoom) unsubscribeRoom();
  if (unsubscribePlayers) unsubscribePlayers();
  unsubscribeRoom = null;
  unsubscribePlayers = null;
  currentState = null;
  myName = "";
  myRoom = "";
  amILeader = false;
  screen("loginScreen");
}

async function loadAdminData() {
  const user = auth.currentUser;
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    toast("請先使用授權教師帳號登入。", "error");
    return;
  }
  showLoading("讀取房間資料...");
  try {
    const roomsSnap = await getDocs(query(collection(db, "rooms")));
    const rows = [];
    for (const roomDoc of roomsSnap.docs) {
      const playersSnap = await getDocs(playersRef(roomDoc.id));
      const room = roomDoc.data();
      rows.push({
        roomID: roomDoc.id,
        state: room.roundState || "LOBBY",
        roundCount: room.roundCount || 0,
        players: playersSnap.size,
        updatedAt: room.updatedAt && room.updatedAt.toDate ? room.updatedAt.toDate() : null
      });
    }
    rows.sort((a, b) => (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0));
    byId("adminRows").innerHTML = rows.map(r => `<tr>
      <td>${escapeHtml(r.roomID)}</td>
      <td>${escapeHtml(r.state)}</td>
      <td>${Number(r.roundCount) || 0}</td>
      <td>${Number(r.players) || 0}</td>
      <td>${r.updatedAt ? r.updatedAt.toLocaleString("zh-TW") : ""}</td>
      <td><button class="btn coral delete-room" type="button" data-room="${escapeHtml(r.roomID)}"><span class="material-symbols-outlined">delete</span>解散</button></td>
    </tr>`).join("") || `<tr><td colspan="6">目前沒有房間。</td></tr>`;
    document.querySelectorAll(".delete-room").forEach(btn => btn.addEventListener("click", () => deleteRoom(btn.dataset.room)));
  } catch (error) {
    toast(error.message, "error");
  } finally {
    hideLoading();
  }
}

async function deleteRoom(room) {
  const user = auth.currentUser;
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    toast("請先使用授權教師帳號登入。", "error");
    return;
  }
  if (!confirm(`確定要解散房間「${room}」並刪除玩家資料？`)) return;
  showLoading("刪除房間中...");
  try {
    const playersSnap = await getDocs(playersRef(room));
    await Promise.all(playersSnap.docs.map(playerDoc => deleteDoc(doc(db, "rooms", room, "players", playerDoc.id))));
    await deleteDoc(roomRef(room));
    await loadAdminData();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    hideLoading();
  }
}

async function adminLogin() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    toast(error.message || "Google 登入失敗，請確認登入功能已啟用。", "error");
  }
}

async function adminLogout() {
  await signOut(auth);
}

function renderAdminAuth(user) {
  const allowed = Boolean(user && ADMIN_EMAILS.includes(user.email));
  byId("adminUserLabel").textContent = user ? `${user.email}${allowed ? "｜已授權" : "｜未授權"}` : "尚未登入";
  byId("adminDashboard").classList.toggle("hidden", !allowed);
  byId("adminLoginBtn").classList.toggle("hidden", allowed);
  if (!allowed) byId("adminRows").innerHTML = "";
  if (allowed && byId("adminScreen").classList.contains("active")) loadAdminData();
}

function bindEvents() {
  byId("joinBtn").addEventListener("click", () => login(false));
  byId("createBtn").addEventListener("click", () => login(true));
  byId("adminBtn").addEventListener("click", () => {
    screen("adminScreen");
    renderAdminAuth(auth.currentUser);
  });
  byId("backLoginBtn").addEventListener("click", () => screen("loginScreen"));
  byId("refreshBtn").addEventListener("click", refreshState);
  byId("leaveBtn").addEventListener("click", leaveGame);
  byId("broadcastBtn").addEventListener("click", sendBroadcast);
  byId("adminLoginBtn").addEventListener("click", adminLogin);
  byId("adminLogoutBtn").addEventListener("click", adminLogout);
  byId("loadAdminBtn").addEventListener("click", loadAdminData);
  byId("closeModalBtn").addEventListener("click", closeCardModal);
  byId("cancelCardBtn").addEventListener("click", closeCardModal);
  byId("playCardBtn").addEventListener("click", playActiveCard);
  document.querySelectorAll("[data-state]").forEach(btn => btn.addEventListener("click", () => changeState(btn.dataset.state)));
}

renderAvatarPicker();
bindEvents();
onAuthStateChanged(auth, renderAdminAuth);
