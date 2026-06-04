// Controller UI: flusso schermate, lobby/QR, macchina a stati della gara.
import {
  createRoom, addPlayer, roomExists, listenRoom, setRoomState,
  writeCar, serverNow, leaveRoom, deleteRoom,
} from "./net.js";
import { Game } from "./game.js";
import { audio } from "./audio.js";
import { sortRanking } from "./rank.js";

// ---- Base URL condivisibile (QR/link) ----
// Per le prove in locale apri il PC sull'IP LAN (es. http://192.168.68.112:8000):
// location.origin diventa quell'IP e il QR ci punta da solo, raggiungibile dai telefoni.
// localhost NON e' raggiungibile dagli altri device. Se proprio devi aprire via localhost,
// imposta LAN_HOST con "IP:porta" del PC per forzarlo nei link.
const LAN_HOST = ""; // es. "192.168.68.112:8000"; vuoto = usa l'host corrente
function shareBase() {
  if (LAN_HOST) return `${location.protocol}//${LAN_HOST}${location.pathname}`;
  return `${location.origin}${location.pathname}`;
}

// ---- identita' giocatore (persiste nella tab). Colore e nome li assegna il server. ----
function makeIdentity() {
  let id = sessionStorage.getItem("playerId");
  if (!id) { id = "p" + Math.random().toString(36).slice(2, 9); sessionStorage.setItem("playerId", id); }
  return { id };
}

const me = makeIdentity();
const $ = (id) => document.getElementById(id);
const screens = ["home", "lobby", "countdown", "race", "finish-anim", "results"];
function show(name) {
  for (const s of screens) $("screen-" + s).classList.toggle("active", s === name);
}
// 1 -> "1st", 2 -> "2nd", ... (eccezioni 11-13)
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

let code = null;       // codice stanza corrente
let room = null;       // ultimo snapshot stanza
let game = null;       // istanza Game (durante la gara)
let unsub = null;      // listener Firebase
let cdTimer = null;    // ticker countdown

// ============ HOME ============
$("btn-create").onclick = async () => {
  audio.resume(); audio.confirm();
  $("home-error").textContent = "";
  try {
    code = await createRoom(me);
    enterRoom();
  } catch (e) {
    console.error(e);
    audio.back();
    $("home-error").textContent = "Firebase error: " + e.message;
  }
};

// Entra in una stanza esistente per codice. Mostra eventuali errori in home. true se entrato.
async function joinRoom(c) {
  c = (c || "").trim().toUpperCase();
  $("home-error").textContent = "";
  if (c.length !== 4) { audio.back(); $("home-error").textContent = "4-character code"; return false; }
  try {
    if (!(await roomExists(c))) { audio.back(); $("home-error").textContent = "Room not found"; return false; }
    audio.confirm();
    code = c;
    await addPlayer(code, me);
    enterRoom();
    return true;
  } catch (e) {
    console.error(e);
    audio.back();
    $("home-error").textContent = "Firebase error: " + e.message;
    return false;
  }
}

$("btn-join").onclick = () => { audio.resume(); joinRoom($("input-code").value); };

// deep link da QR: ?room=XXXX -> prefill + join diretto (errori visibili in home)
(async () => {
  const param = new URLSearchParams(location.search).get("room");
  if (!param) return;
  const c = param.toUpperCase();
  $("input-code").value = c; // visibile e ritentabile col tasto Join se l'auto-join fallisce
  await joinRoom(c);
})();

// ============ ROOM LISTENER (macchina a stati) ============
function enterRoom() {
  if (unsub) unsub();
  unsub = listenRoom(code, (data) => {
    if (!data) { show("home"); return; }
    room = data;
    handleState();
  });
}

// Esci dalla partita: l'host chiude la stanza (rimossa dal DB), gli altri escono e basta.
async function exitMatch() {
  if (!code) { show("home"); return; }
  const wasHost = room && room.host === me.id;
  const leaving = code;
  if (game) { game.stop(); game = null; }
  audio.stopMusic();
  if (unsub) { unsub(); unsub = null; } // stop listener locale prima di toccare il DB
  screenLocked = false; finishAnimShown = false;
  room = null; code = null;
  show("home");
  try {
    if (wasHost) await deleteRoom(leaving);
    else await leaveRoom(leaving, me.id);
  } catch (e) { console.error(e); }
}

let screenLocked = false;     // se true, l'animazione di arrivo blocca i cambi di schermata
let finishAnimShown = false;  // riarmato all'inizio di ogni gara

function handleState() {
  if (screenLocked) return;
  const state = room.state;
  if (state === "lobby")      renderLobby();
  else if (state === "countdown") renderCountdown();
  else if (state === "racing") renderRacing();
  else if (state === "finished") renderResults();
}

// Anim fullscreen "ARRIVATO!" quando il giocatore locale taglia il traguardo.
function showFinishAnim() {
  if (finishAnimShown) return;
  finishAnimShown = true;
  screenLocked = true;
  // posizione di arrivo (classifica al momento del traguardo)
  const rank = game ? game.ranking() : [];
  const pos = rank.findIndex((r) => r.id === me.id) + 1;
  $("finish-pos").textContent = pos > 0 ? ordinal(pos) : "";
  show("finish-anim");
  // riavvia l'animazione di banner + posizione (force reflow)
  document.querySelectorAll(".finish-banner").forEach((el) => {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  });
  setTimeout(() => {
    screenLocked = false;
    if (room) handleState();
  }, 1800);
}

// Disegna il QR sul canvas usando la lib globale `qrcode` (vendorata in locale).
function drawQR(canvas, text) {
  if (typeof window.qrcode !== "function") return false;
  const qr = window.qrcode(0, "M"); // tipo auto, correzione errori media
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = 6, margin = 2;
  const size = (n + margin * 2) * cell;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + "px"; canvas.style.height = size + "px";
  canvas.style.display = "block";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c))
        ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  return true;
}

// ============ LOBBY ============
let qrDrawn = false;
function renderLobby() {
  show("lobby");
  // reset gara precedente
  if (game) { game.stop(); game = null; }
  $("lobby-code").textContent = code;

  if (!qrDrawn) {
    const url = `${shareBase()}?room=${code}`;
    $("lobby-url").textContent = url;
    if (!drawQR($("qr"), url)) {
      console.warn("Libreria QR non caricata: uso solo codice + link");
      $("qr").style.display = "none";
    }
    qrDrawn = true;
  }

  const players = room.players || {};
  const list = $("player-list");
  list.innerHTML = "";
  for (const p of Object.values(players)) {
    const li = document.createElement("li");
    li.textContent = p.name;
    li.style.setProperty("--p-color", p.color);
    list.appendChild(li);
  }

  const isHost = room.host === me.id;
  const n = Object.keys(players).length;
  $("btn-start").hidden = !isHost;
  $("btn-start").disabled = n < 1;
  // selettore giri: solo l'host puo' cambiarlo, evidenzia quello scelto
  const laps = room.laps || 3;
  $("laps-picker").querySelectorAll("button").forEach((b) => {
    b.classList.toggle("sel", +b.dataset.laps === laps);
    b.disabled = !isHost;
  });
  // toggle corsie vuote (default: mostrate)
  const showEmpty = room.showEmpty !== false;
  $("btn-lanes").setAttribute("aria-checked", String(showEmpty));
  $("btn-lanes").disabled = !isHost;
  $("lobby-hint").textContent = isHost
    ? `${n} player(s) ready`
    : "Waiting for the host to start…";
}

// listener selettore giri (una sola volta): l'host imposta room.laps
$("laps-picker").querySelectorAll("button").forEach((b) => {
  b.onclick = () => {
    if (room && room.host === me.id) { audio.click(); setRoomState(code, { laps: +b.dataset.laps }); }
  };
});

// listener toggle corsie vuote: l'host inverte room.showEmpty
$("btn-lanes").onclick = () => {
  if (room && room.host === me.id) {
    audio.click();
    setRoomState(code, { showEmpty: room.showEmpty === false });
  }
};

$("btn-start").onclick = () => {
  audio.confirm();
  // avvio sincronizzato: countdown parte da 3 (3-2-1-GO).
  setRoomState(code, { state: "countdown", startAt: serverNow() + 3000 });
};

// ============ COUNTDOWN ============
function renderCountdown() {
  show("countdown");
  // crea il Game gia' ora (gira in background, fisica bloccata fino a startAt)
  if (!game) {
    game = new Game($("game"), {
      code, myId: me.id, laps: room.laps || 3,
      startAt: room.startAt, players: room.players,
      showEmpty: room.showEmpty !== false,
    });
    game.onFinish = () => { showFinishAnim(); checkAllFinished(); };
    finishAnimShown = false;
    game.start();
  }
  game.startAt = room.startAt;
  game.showEmpty = room.showEmpty !== false;
  game.syncFromDB(room.players);

  if (cdTimer) cancelAnimationFrame(cdTimer);
  let lastShown = null;
  const tick = () => {
    const left = room.startAt - serverNow();
    if (left <= 0) {
      if (lastShown !== "go") {
        audio.go(); audio.startMusic();
        // mostra subito la pista senza aspettare il round-trip Firebase
        show("race");
      }
      lastShown = "go";
      // l'host promuove lo stato per gli altri client
      if (room.host === me.id && room.state === "countdown")
        setRoomState(code, { state: "racing" });
      return;
    }
    const n = Math.ceil(left / 1000);
    if (n !== lastShown) { audio.count(); lastShown = n; }
    $("countdown-num").textContent = n;
    cdTimer = requestAnimationFrame(tick);
  };
  tick();
}

// ============ RACING ============
function renderRacing() {
  show("race");
  if (!game) { // join a gara gia' iniziata
    game = new Game($("game"), {
      code, myId: me.id, laps: room.laps || 3,
      startAt: room.startAt, players: room.players,
      showEmpty: room.showEmpty !== false,
    });
    game.onFinish = () => { showFinishAnim(); checkAllFinished(); };
    finishAnimShown = false;
    game.start();
  }
  game.showEmpty = room.showEmpty !== false;
  game.syncFromDB(room.players);
  audio.startMusic(); // idempotente: se entri a gara gia' iniziata
  $("hud-lap").textContent = `Lap ${Math.min((game.car.lap + 1), game.laps)}/${game.laps}`;
  const rank = game.ranking();
  const pos = rank.findIndex((r) => r.id === me.id) + 1;
  $("hud-pos").textContent = `Position ${pos}/${rank.length}`;
  // se ho gia' finito, rivaluta a ogni update DB: cosi' il flag "finished" dell'altro
  // (arrivato dopo il mio onFinish, es. in un pareggio) promuove comunque la gara.
  if (game.car.finished) checkAllFinished();
}

function checkAllFinished() {
  const players = room.players || {};
  const ids = Object.keys(players);
  // ognuno controlla; se tutti hanno finito, promuovi a "finished"
  const allDone = ids.length > 0 && ids.every((id) =>
    id === me.id ? game.car.finished : players[id].finished);
  if (allDone) setRoomState(code, { state: "finished" });
}

// ============ RESULTS ============
function renderResults() {
  if (game) game.stop();
  audio.stopMusic(); audio.finish();
  show("results");
  // Per la propria auto sovrascrivi con i dati locali (la sync DB puo' essere indietro
  // di pochi ms quando lo stato passa a "finished").
  const all = Object.entries(room.players || {}).map(([id, p]) => {
    if (id === me.id && game?.car) {
      return { id, ...p,
        finished: game.car.finished,
        finishTime: game.car.finishTime,
        lapTimes: game.car.lapTimes };
    }
    return { id, ...p };
  });
  const players = sortRanking(all);
  const fmt = (ms) => (ms / 1000).toFixed(2) + "s";
  const startAt = room.startAt || 0;
  const ol = $("results-list");
  ol.innerHTML = "";
  for (const p of players) {
    const laps = Array.isArray(p.lapTimes) ? p.lapTimes
                 : p.lapTimes ? Object.values(p.lapTimes) : [];
    const total = p.finished && p.finishTime ? p.finishTime - startAt : null;

    const li = document.createElement("li");
    li.style.color = p.color;

    const head = document.createElement("div");
    head.className = "res-head";
    head.textContent = `${p.name}${p.id === me.id ? " (you)" : ""} — ` +
      (total != null ? fmt(total) : "DNF");
    li.appendChild(head);

    if (laps.length) {
      const det = document.createElement("div");
      det.className = "res-laps";
      det.textContent = laps.map((t, i) => `Lap${i + 1} ${fmt(t)}`).join("  ·  ");
      li.appendChild(det);
    }
    ol.appendChild(li);
  }
  $("btn-again").hidden = room.host !== me.id;
}

$("btn-again").onclick = () => {
  audio.confirm();
  game = null;
  setRoomState(code, { state: "lobby" });
  // resetta la propria auto per il nuovo giro
  writeCar(code, me.id, { s: 0, v: 0, lap: 0, finished: false, finishTime: 0, lapTimes: [] });
};

// Uscita dalla partita: croce in gara o tasto ESC.
$("btn-exit").onclick = () => { audio.back(); exitMatch(); };
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && code) { audio.back(); exitMatch(); }
});

show("home");

// PWA: registra il service worker (path relativo -> ok anche su GitHub Pages)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
