import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRanking } from "../js/rank.js";

test("chi finisce prima e' davanti", () => {
  const r = sortRanking([
    { id: "b", finished: true, finishTime: 200 },
    { id: "a", finished: true, finishTime: 100 },
  ]);
  assert.deepEqual(r.map((p) => p.id), ["a", "b"]);
});

test("chi ha finito precede chi non ha finito", () => {
  const r = sortRanking([
    { id: "live", finished: false, lap: 5, s: 999 },
    { id: "done", finished: true, finishTime: 500 },
  ]);
  assert.deepEqual(r.map((p) => p.id), ["done", "live"]);
});

test("non finiti: piu' giri davanti, poi piu' strada", () => {
  const r = sortRanking([
    { id: "x", finished: false, lap: 1, s: 900 },
    { id: "y", finished: false, lap: 2, s: 10 },
    { id: "z", finished: false, lap: 1, s: 950 },
  ]);
  assert.deepEqual(r.map((p) => p.id), ["y", "z", "x"]);
});

test("non muta l'array originale", () => {
  const input = [{ id: "a", s: 1 }, { id: "b", s: 2 }];
  const copy = [...input];
  sortRanking(input);
  assert.deepEqual(input, copy);
});
