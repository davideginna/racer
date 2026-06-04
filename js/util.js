// Funzioni pure, senza dipendenze (testabili con node).

// Palette gara: un colore per giocatore, max 5. Ordine = ordine di assegnazione.
// rosso, arancione, giallo, verde, blu.
export const RACE_COLORS = ["#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#2d6cff"];
export const MAX_PLAYERS = RACE_COLORS.length;
// Nome del giocatore = nome del colore.
export const COLOR_NAMES = {
  "#ff3b30": "Red",
  "#ff9500": "Orange",
  "#ffd60a": "Yellow",
  "#34c759": "Green",
  "#2d6cff": "Blue",
};

// Raggio relativo al centerline per ogni corsia (5 cerchi concentrici).
// Indice = colorIndex: rosso=interno (negativo), blu=esterno (positivo).
export const LANE_OFFSETS = [-100, -50, 0, 50, 100];

// Versione piu' scura di un colore esadecimale (per le auto).
export function darken(hex, factor = 0.5) {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = (i) => Math.max(0, Math.round(parseInt(m[i], 16) * factor)).toString(16).padStart(2, "0");
  return `#${c(1)}${c(2)}${c(3)}`;
}

// Primo colore libero tra quelli gia' usati; null se la stanza e' piena.
export function freeColor(usedColors) {
  const used = new Set(usedColors);
  return RACE_COLORS.find((c) => !used.has(c)) || null;
}

// Codice stanza: caratteri non ambigui (niente O/0, I/1). rng iniettabile per i test.
export function randomCode(len = 4, rng = Math.random) {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += A[Math.floor(rng() * A.length)];
  return s;
}

// Differenza piu' corta su una pista circolare di lunghezza `len`.
// Serve a interpolare le auto remote gestendo il wrap del traguardo.
export function shortestWrapDiff(target, current, len) {
  let d = target - current;
  if (d > len / 2) d -= len;
  if (d < -len / 2) d += len;
  return d;
}
