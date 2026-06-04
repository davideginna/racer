import { test } from "node:test";
import assert from "node:assert/strict";
import {
  posAt, maxSpeedAt, centerlinePoints, TRACK_LENGTH, TRACK_RADIUS,
  V_MAX_CURVE,
} from "../js/track.js";

test("la pista ha lunghezza positiva", () => {
  assert.ok(TRACK_LENGTH > 0);
});

test("la pista e' un anello chiuso: posAt(0) ~ posAt(LEN)", () => {
  const a = posAt(0);
  const b = posAt(TRACK_LENGTH);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
});

test("continuita': passi piccoli -> spostamenti piccoli", () => {
  let prev = posAt(0);
  for (let s = 5; s <= TRACK_LENGTH; s += 5) {
    const p = posAt(s);
    assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) < 10, `salto a s=${s}`);
    prev = p;
  }
});

test("maxSpeedAt: cerchio -> limite costante", () => {
  for (let s = 0; s < TRACK_LENGTH; s += TRACK_LENGTH / 20)
    assert.equal(maxSpeedAt(s), V_MAX_CURVE);
});

test("TRACK_LENGTH coincide con la circonferenza del centerline", () => {
  assert.ok(Math.abs(TRACK_LENGTH - 2 * Math.PI * TRACK_RADIUS) < 1e-9);
});

test("centerlinePoints restituisce punti", () => {
  assert.ok(centerlinePoints().length > 10);
});
