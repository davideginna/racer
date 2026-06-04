import { test } from "node:test";
import assert from "node:assert/strict";
import { randomCode, shortestWrapDiff, freeColor, RACE_COLORS, MAX_PLAYERS } from "../js/util.js";

test("randomCode: lunghezza richiesta", () => {
  assert.equal(randomCode().length, 4);
  assert.equal(randomCode(6).length, 6);
});

test("randomCode: niente caratteri ambigui (0/O/1/I)", () => {
  let out = "";
  for (let i = 0; i < 200; i++) out += randomCode(8);
  assert.ok(!/[01OI]/.test(out));
});

test("randomCode: deterministico con rng iniettato", () => {
  const rng = () => 0; // sempre primo carattere -> "AAAA"
  assert.equal(randomCode(4, rng), "AAAA");
});

test("shortestWrapDiff: caso semplice senza wrap", () => {
  assert.equal(shortestWrapDiff(30, 10, 100), 20);
});

test("shortestWrapDiff: sceglie la via piu' corta oltre il traguardo", () => {
  // da 90 a 10 su pista 100: avanti +20, non indietro -80
  assert.equal(shortestWrapDiff(10, 90, 100), 20);
  // da 10 a 90: indietro -20, non avanti +80
  assert.equal(shortestWrapDiff(90, 10, 100), -20);
});

test("freeColor: primo colore libero", () => {
  assert.equal(freeColor([]), RACE_COLORS[0]);
  assert.equal(freeColor([RACE_COLORS[0]]), RACE_COLORS[1]);
});

test("freeColor: null quando stanza piena (max 5)", () => {
  assert.equal(MAX_PLAYERS, 5);
  assert.equal(freeColor(RACE_COLORS), null);
});
