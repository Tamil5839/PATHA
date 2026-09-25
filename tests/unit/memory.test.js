import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPattern, tokenize, range } from '../../src/core/patterns.js';
import {
  updateStat,
  statusOf,
  roundResults,
  applyRoundResults,
  linkStrength,
  weakLinksIn,
  summarize,
  ALPHA,
  STRONG,
  WEAK,
} from '../../src/core/memory.js';

const NOW = 1_700_000_000_000;
const fresh = () => ({ links: {}, words: {} });
const round = (level, items, scores) => {
  const tokens = tokenize(buildPattern(level, items));
  return { tokens, results: roundResults(tokens, typeof scores === 'function' ? tokens.map(scores) : scores) };
};

describe('link strength updates', () => {
  test('jaṭā updates the forward and backward directions separately', () => {
    const m = fresh();
    // tokens: 0 1 | 1 0 | 0 1  → the backward word ("0" in "1 0") is missed
    const { tokens, results } = round('jata', [0, 1], [1, 1, 1, 0, 1, 1]);
    assert.equal(tokens.length, 6);
    applyRoundResults(m, results, NOW);
    assert.deepEqual(m.links[0].f, { s: 1, n: 1, last: NOW });
    assert.deepEqual(m.links[0].b, { s: 0, n: 1, last: NOW });
    assert.equal(statusOf(m.links[0].f.s), 'strong');
    assert.equal(statusOf(m.links[0].b.s), 'weak');
    assert.equal(linkStrength(m, 0), 0, 'combined strength is the weaker direction');
    // word 0 was recited three times, missed once
    assert.equal(Math.round(m.words[0].s * 1000), 667);
    assert.equal(m.words[1].s, 1);
  });

  test('successive rounds move strength by ALPHA toward the new score', () => {
    const m = fresh();
    applyRoundResults(m, round('jata', [0, 1], [1, 1, 1, 0, 1, 1]).results, NOW);
    applyRoundResults(m, round('jata', [0, 1], () => 1).results, NOW + 1);
    assert.equal(m.links[0].b.s, ALPHA); // 0 → 0 + ALPHA × (1 − 0)
    assert.equal(m.links[0].b.n, 2);
    assert.equal(m.links[0].f.s, 1);
    // a later miss drops a strong link to shaky
    applyRoundResults(m, round('krama', [0, 1], [1, 0]).results, NOW + 2);
    assert.equal(m.links[0].f.s, 1 - ALPHA);
    assert.equal(statusOf(m.links[0].f.s), 'shaky');
  });

  test('krama trains forward links only; pada trains positions only', () => {
    const m = fresh();
    applyRoundResults(m, round('krama', [4, 5, 6], () => 1).results, NOW);
    assert.deepEqual(Object.keys(m.links), ['4', '5']);
    assert.ok(m.links[4].f && !m.links[4].b);
    const p = fresh();
    applyRoundResults(p, round('pada', [4, 5, 6], () => 1).results, NOW);
    assert.deepEqual(p.links, {});
    assert.deepEqual(Object.keys(p.words), ['4', '5', '6']);
  });

  test('ghana: one update per link direction per round, from the mean score', () => {
    const m = fresh();
    const { tokens, results } = round('ghana', [0, 1, 2], (t) => (t.link?.dir === 'b' && t.link.index === 1 ? 0.5 : 1));
    applyRoundResults(m, results, NOW);
    assert.equal(tokens.length, 19);
    assert.equal(m.links[1].b.s, 0.5);
    assert.equal(m.links[1].b.n, 1);
    assert.equal(m.links[1].f.s, 1);
    assert.equal(m.links[0].b.s, 1);
  });

  test('unanswered words (an unfinished round) are skipped', () => {
    const m = fresh();
    const { results } = round('samhita', [0, 1, 2], [1, null, null]);
    applyRoundResults(m, results, NOW);
    assert.deepEqual(Object.keys(m.words), ['0']);
    assert.deepEqual(m.links, {});
  });

  test('stats: first observation, clamping, status thresholds', () => {
    assert.deepEqual(updateStat(undefined, 0.5, 7), { s: 0.5, n: 1, last: 7 });
    assert.equal(updateStat(null, 3, 7).s, 1);
    assert.equal(statusOf(undefined), 'new');
    assert.equal(statusOf(STRONG), 'strong');
    assert.equal(statusOf(STRONG - 0.01), 'shaky');
    assert.equal(statusOf(WEAK), 'shaky');
    assert.equal(statusOf(WEAK - 0.01), 'weak');
  });

  test('weakLinksIn lists practised links below strong, weakest first', () => {
    const m = fresh();
    m.links[2] = { f: { s: 0.6, n: 2, last: 0 } };
    m.links[3] = { f: { s: 0.95, n: 2, last: 0 }, b: { s: 0.3, n: 1, last: 0 } };
    m.links[5] = { f: { s: 0.9, n: 2, last: 0 } };
    assert.deepEqual(weakLinksIn(m, 0, 10), [
      { index: 3, s: 0.3 },
      { index: 2, s: 0.6 },
    ]);
    assert.deepEqual(weakLinksIn(m, 3, 5), [{ index: 3, s: 0.3 }]);
    assert.equal(linkStrength(m, 9), null);
  });
});

describe('round summary', () => {
  test('counts and accuracy', () => {
    const s = summarize([1, 1, 0.5, 0]);
    assert.deepEqual(s, { total: 4, answered: 4, got: 2, unsure: 1, missed: 1, accuracy: 0.625, complete: true, perfect: false });
    assert.equal(summarize([1, 1]).perfect, true);
    assert.equal(summarize([1, null]).complete, false);
    assert.equal(summarize([1, null]).perfect, false);
    assert.equal(summarize([]).complete, false);
  });

  test('range helper', () => {
    assert.deepEqual(range(3, 6), [3, 4, 5]);
  });
});
