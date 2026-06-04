// Motore di gara: fisica della propria auto, sync con Firebase, rendering.
import {
  posAt, maxSpeedAt, TRACK_LENGTH, TRACK_RADIUS, bounds, V_MAX_STRAIGHT,
} from "./track.js";
import { writeCar, serverNow } from "./net.js";
import { audio } from "./audio.js";
import { shortestWrapDiff, RACE_COLORS, LANE_OFFSETS } from "./util.js";
import { sortRanking } from "./rank.js";

const ACCEL = 520;        // accelerazione (unita'/s^2)
const FRICTION = 280;     // decelerazione naturale
const GRIP_LOSS = 1400;   // perdita aderenza sopra il limite di curva
const WRITE_MS = 80;      // frequenza scrittura su Firebase (~12.5 Hz)
const CRASH_DUR = 0.6;    // durata animazione testacoda (s)

export class Game {
  constructor(canvas, { code, myId, laps, startAt, players, showEmpty = true }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.code = code;
    this.myId = myId;
    this.laps = laps;
    this.startAt = startAt;      // ora server di inizio gara
    this.showEmpty = showEmpty;  // se true le corsie vuote restano visibili (fioche) sullo sfondo
    this.activeLanes = new Set(); // indici corsia (colorIndex) occupati da un giocatore
    this._updateActiveLanes(players);
    this.accelerating = false;
    this.crashTimer = 0;
    this.lastWrite = 0;
    this.running = true;
    this.onFinish = null;

    // auto locale (autoritativa) + remote
    const me = players[myId];
    this.car = { s: 0, v: 0, lap: 0, finished: false, finishTime: 0,
                 name: me.name, color: me.color, lapTimes: [], lapStart: startAt,
                 colorIndex: RACE_COLORS.indexOf(me.color) };
    this.remotes = {}; // id -> { name, color, s, v, lap, finished, displayS }

    this._bindInput();
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  // Stato giocatori in arrivo da Firebase (chiamato dall'app)
  syncFromDB(players) {
    for (const [id, p] of Object.entries(players || {})) {
      if (id === this.myId) continue;
      const r = this.remotes[id] || { displayS: p.s || 0 };
      Object.assign(r, p);
      this.remotes[id] = r;
    }
    // rimuovi chi e' uscito
    for (const id of Object.keys(this.remotes))
      if (!players[id]) delete this.remotes[id];
    this._updateActiveLanes(players);
  }

  // Corsie occupate = colorIndex di ogni giocatore presente nella stanza.
  _updateActiveLanes(players) {
    this.activeLanes = new Set();
    for (const p of Object.values(players || {})) {
      const i = RACE_COLORS.indexOf(p.color);
      if (i >= 0) this.activeLanes.add(i);
    }
  }

  start() { requestAnimationFrame((t) => this._loop(t)); }
  stop() { this.running = false; }

  _bindInput() {
    const on = () => { this.accelerating = true; };
    const off = () => { this.accelerating = false; };
    this.canvas.addEventListener("pointerdown", on);
    this.canvas.addEventListener("pointerup", off);
    this.canvas.addEventListener("pointercancel", off);
    this.canvas.addEventListener("pointerleave", off);
    window.addEventListener("keydown", (e) => { if (e.code === "Space") on(); });
    window.addEventListener("keyup", (e) => { if (e.code === "Space") off(); });
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    // pad include lo spread delle 5 corsie offsettate dal centerline
    const laneSpread = Math.max(...LANE_OFFSETS) - Math.min(...LANE_OFFSETS);
    const pad = 80 + laneSpread;
    this.scale = Math.min(this.canvas.width / (bounds.W + pad),
                          this.canvas.height / (bounds.H + pad));
    this.ox = this.canvas.width / 2;
    this.oy = this.canvas.height / 2;
  }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min((now - (this._last || now)) / 1000, 0.05);
    this._last = now;

    const started = serverNow() >= this.startAt;
    if (started) { this._physics(dt); audio.engine(this.car.v / V_MAX_STRAIGHT); }
    this._interpolate(dt);
    this._render(started);

    if (started && now - this.lastWrite > WRITE_MS) {
      this.lastWrite = now;
      const c = this.car;
      writeCar(this.code, this.myId, { s: c.s, v: c.v, lap: c.lap,
        finished: c.finished, finishTime: c.finishTime });
    }
    requestAnimationFrame((t) => this._loop(t));
  }

  _physics(dt) {
    const c = this.car;
    if (c.finished) { c.v *= 0.9; c.s += c.v * dt; return; }

    if (this.crashTimer > 0) {
      this.crashTimer -= dt;
    } else if (this.accelerating) {
      c.v += ACCEL * dt;
    } else {
      c.v -= FRICTION * dt;
    }
    c.v = Math.max(0, Math.min(c.v, V_MAX_STRAIGHT));

    // limite di curva: se troppo veloce perdi aderenza, poi testacoda
    const safe = maxSpeedAt(c.s);
    if (c.v > safe) {
      c.v -= GRIP_LOSS * dt;
      if (c.v > safe * 1.35) {
        this.crashTimer = CRASH_DUR;
        c.v = safe * 0.35;
        audio.crash();
        // segna l'inizio del testacoda per far girare anche l'auto degli altri
        writeCar(this.code, this.myId, { crashAt: serverNow() });
      }
    }

    const prev = c.s;
    c.s += c.v * dt;
    // giro completato quando si supera la linea (wrap di s)
    if (c.s >= TRACK_LENGTH) {
      c.s -= TRACK_LENGTH;
      c.lap++;
      // registra il tempo del giro appena concluso
      const now = serverNow();
      c.lapTimes.push(now - c.lapStart);
      c.lapStart = now;
      audio.lap();
      if (c.lap >= this.laps && !c.finished) {
        c.finished = true;
        c.finishTime = now;
        this.onFinish && this.onFinish();
      }
      // scrivi subito anche finished/finishTime: lo stato "finished" della stanza
      // viene promosso dall'altro client appena vede questo aggiornamento.
      writeCar(this.code, this.myId, {
        lapTimes: c.lapTimes, lap: c.lap,
        finished: c.finished, finishTime: c.finishTime,
      });
    }
  }

  _interpolate(dt) {
    const k = Math.min(1, dt * 8); // fattore lerp
    for (const r of Object.values(this.remotes)) {
      let target = r.s ?? 0;
      // estrapola un po' con la velocita' nota per nascondere la latenza
      target += (r.v ?? 0) * 0.05;
      // gestisci il wrap della pista scegliendo la direzione piu' corta
      const diff = shortestWrapDiff(target, r.displayS, TRACK_LENGTH);
      if (Math.abs(diff) > TRACK_LENGTH * 0.45) r.displayS = target; // snap se troppo lontano
      else r.displayS += diff * k;
      r.displayS = ((r.displayS % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
    }
  }

  _render(started) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // ===== 5 cerchi concentrici (uno per corsia) =====
    // Corsia attiva (giocatore presente) = accesa. Vuota = fioca sullo sfondo, o nascosta.
    for (let i = 0; i < LANE_OFFSETS.length; i++) {
      const on = this.activeLanes.has(i);
      if (!on && !this.showEmpty) continue;
      const r = TRACK_RADIUS + LANE_OFFSETS[i];
      ctx.globalAlpha = on ? 1 : 0.15;
      ctx.strokeStyle = RACE_COLORS[i];
      ctx.shadowColor = RACE_COLORS[i];
      ctx.shadowBlur = on ? 14 : 0;
      ctx.lineWidth = on ? 4 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // traguardo: barra bianca perpendicolare attraverso tutte le corsie
    const sp = posAt(0);
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(sp.angle);
    const halfSpan = Math.max(...LANE_OFFSETS) + 16;
    ctx.fillStyle = "#fff";
    ctx.fillRect(-4, -halfSpan, 8, halfSpan * 2);
    ctx.restore();

    // auto: linee al neon sulla linea di mezzo
    for (const r of Object.values(this.remotes)) {
      const elapsed = r.crashAt ? (serverNow() - r.crashAt) / 1000 : Infinity;
      const spin = elapsed < CRASH_DUR ? elapsed / CRASH_DUR : 0;
      const idx = RACE_COLORS.indexOf(r.color);
      this._drawHead(ctx, r.displayS, r.color, false, spin, idx);
    }
    const mySpin = this.crashTimer > 0 ? 1 - this.crashTimer / CRASH_DUR : 0;
    this._drawHead(ctx, this.car.s, this.car.color, true, mySpin, this.car.colorIndex);

    ctx.restore();
  }

  // Auto = rettangolo del colore della propria corsia, posizionato sul cerchio
  // del proprio raggio (centerline + LANE_OFFSETS[colorIndex]).
  _drawHead(ctx, s, color, mine, spin = 0, colorIndex = 0) {
    const center = posAt(s);
    // perpendicolare verso l'esterno: (sin(a), -cos(a))
    const off = LANE_OFFSETS[colorIndex] ?? 0;
    const cx = center.x + Math.sin(center.angle) * off;
    const cy = center.y - Math.cos(center.angle) * off;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(center.angle + spin * Math.PI * 4);
    ctx.shadowColor = spin > 0 ? "#ff3b30" : color;
    ctx.shadowBlur = mine ? 18 : 14;
    const w = mine ? 26 : 22;
    const h = mine ? 18 : 16;
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // velo bianco semitrasparente: rende l'auto piu' chiara/lucente del cerchio
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    if (mine) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }

  // classifica: chi ha fatto piu' giri e piu' strada e' davanti
  ranking() {
    return sortRanking([
      { id: this.myId, ...this.car },
      ...Object.entries(this.remotes).map(([id, r]) => ({ id, ...r })),
    ]);
  }
}
