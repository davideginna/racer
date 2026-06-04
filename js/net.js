// Livello rete: tutta l'interazione con Firebase Realtime Database.
import { db, authReady } from "./firebase-config.js";
import { randomCode, freeColor, COLOR_NAMES } from "./util.js";
import {
  ref, set, update, get, onValue, onDisconnect, remove, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Offset tra orologio locale e server Firebase, per sincronizzare il countdown.
let serverOffset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
  serverOffset = snap.val() || 0;
});
export const serverNow = () => Date.now() + serverOffset;

export async function createRoom(player, laps = 3) {
  await authReady;
  let code;
  // ritenta finche trova un codice libero
  for (let i = 0; i < 5; i++) {
    code = randomCode();
    const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) break;
  }
  const roomRef = ref(db, `rooms/${code}`);
  await set(roomRef, {
    state: "lobby",
    host: player.id,
    createdAt: serverTimestamp(),
    laps,
  });
  // quando l'host si disconnette, rimuovi l'intera stanza (niente nodi orfani sul DB)
  onDisconnect(roomRef).remove();
  await addPlayer(code, player);
  return code;
}

export async function roomExists(code) {
  await authReady;
  const snap = await get(ref(db, `rooms/${code}/state`));
  return snap.exists();
}

export async function addPlayer(code, player) {
  await authReady;
  const snap = await get(ref(db, `rooms/${code}/players`));
  const players = snap.val() || {};
  // rejoin: mantieni il colore gia' assegnato
  let color = players[player.id]?.color;
  if (!color) {
    color = freeColor(Object.values(players).map((p) => p.color));
    if (!color) throw new Error("Stanza piena (max 5 giocatori)");
  }
  const name = COLOR_NAMES[color] || player.name;
  const p = ref(db, `rooms/${code}/players/${player.id}`);
  await set(p, { name, color, joinedAt: serverTimestamp(),
                 s: 0, v: 0, lap: 0, finished: false, finishTime: 0, lapTimes: [] });
  // se il device si disconnette, Firebase rimuove il giocatore in automatico
  onDisconnect(p).remove();
  return color;
}

export function listenRoom(code, cb) {
  return onValue(ref(db, `rooms/${code}`), (snap) => cb(snap.val()));
}

export function writeCar(code, playerId, carState) {
  // update = scrive solo i campi passati, non l'intero nodo
  return update(ref(db, `rooms/${code}/players/${playerId}`), carState);
}

export function setRoomState(code, patch) {
  return update(ref(db, `rooms/${code}`), patch);
}

export function leaveRoom(code, playerId) {
  return remove(ref(db, `rooms/${code}/players/${playerId}`));
}

// L'host chiude la stanza: rimuove l'intero nodo. Gli altri client ricevono null
// dal listener (.info reactive) e tornano alla home.
export function deleteRoom(code) {
  return remove(ref(db, `rooms/${code}`));
}
