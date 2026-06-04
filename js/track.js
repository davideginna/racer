// Pista: cerchio. Tutte le corsie sono cerchi concentrici offsettati dal centerline.
// La posizione di un'auto e' un numero `s` = arc-length lungo il cerchio centrale.
// posAt(s) -> coordinate + direzione (tangente).

const R = 320;            // raggio del centerline
const TAU = Math.PI * 2;

export const TRACK_RADIUS = R;
export const TRACK_LENGTH = TAU * R;
export const ROAD_WIDTH = 5;       // legacy: non piu' usato (corsie singole linee)
export const V_MAX_STRAIGHT = 720; // velocita' massima raggiungibile
export const V_MAX_CURVE = 360;    // velocita' sicura (pista interamente curva)

// margine = max offset corsie per il bounding box (fit canvas)
const MAX_OFFSET = 100;
export const bounds = {
  W: 2 * (R + MAX_OFFSET),
  H: 2 * (R + MAX_OFFSET),
  hw: R + MAX_OFFSET,
  hh: R + MAX_OFFSET,
};

function wrap(s) { return ((s % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH; }

// Cerchio percorso in senso orario sullo schermo (y-down).
export function posAt(s) {
  const theta = wrap(s) / R;
  const x = R * Math.cos(theta);
  const y = R * Math.sin(theta);
  // tangente = derivata della posizione rispetto a s
  const angle = Math.atan2(Math.cos(theta), -Math.sin(theta));
  return { x, y, angle };
}

// Tutta la pista e' curva: limite di velocita' costante.
export function maxSpeedAt(_s) {
  return V_MAX_CURVE;
}

export function centerlinePoints(step = 10) {
  const pts = [];
  for (let s = 0; s <= TRACK_LENGTH; s += step) pts.push(posAt(s));
  return pts;
}
