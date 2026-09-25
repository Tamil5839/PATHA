import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPattern, tokenize, range, notation } from '../../src/core/patterns.js';
import {
  emptyProgress,
  recordRound,
  getPassage,
  isWoven,
  highestCleared,
  recommendedLevel,
  reviewLevel,
  passageStates,
  bridgesNeedingWork,
  spanKey,
} from '../../src/core/progress.js';
import { weakLinkWindows, drillPatterns } from '../../src/core/drills.js';
import { createText, rechunk, passageItems, bridgeOf, passageOfWord, defaultTitle, newId } from '../../src/core/textModel.js';
import { unitText } from '../../src/core/segment.js';

const D = 20000;
const NOW = 1_700_000_000_000;

/** Run a passage round at a level where every word scores `score(t)`. */
function play(progress, span, level, score, day = D) {
  const tokens = tokenize(buildPattern(level, range(span.start, span.end)));
  return recordRound(progress, {
    kind: 'passage',
    span,
    level,
    tokens,
    scores: tokens.map(typeof score === 'function' ? score : () => score),
    now: NOW + day,
    today: day,
  });
}

describe('level ladder', () => {
  const span = { start: 0, end: 4 };

  test('a complete round with no misses clears its level', () => {
    const p = emptyProgress('t1');
    const out = play(p, span, 'samhita', 1);
    assert.equal(out.cleared, true);
    assert.equal(out.newlyCleared, true);
    assert.equal(highestCleared(getPassage(p, span)), 1);
    assert.equal(recommendedLevel(getPassage(p, span)), 'pada');
    assert.equal(play(p, span, 'samhita', 1).newlyCleared, false);
  });

  test('a missed word means the level is not cleared', () => {
    const p = emptyProgress('t1');
    const out = play(p, span, 'krama', (t) => (t.k === 3 ? 0 : 1));
    assert.equal(out.cleared, false);
    assert.equal(highestCleared(getPassage(p, span)), 0);
    assert.equal(recommendedLevel(getPassage(p, span)), 'samhita');
    assert.equal(recommendedLevel(null), 'samhita');
    assert.equal(reviewLevel(null), 'samhita');
  });

  test('woven after a perfect ghana on two different days', () => {
    const p = emptyProgress('t1');
    assert.equal(play(p, span, 'ghana', 1, D).woven, false);
    assert.equal(play(p, span, 'ghana', 1, D).woven, false, 'twice on the same day is not enough');
    assert.equal(play(p, span, 'ghana', (t) => (t.k === 0 ? 0.5 : 1), D + 1).woven, false, 'not error-free');
    const out = play(p, span, 'ghana', 1, D + 2);
    assert.equal(out.woven, true);
    assert.equal(out.newlyWoven, true);
    assert.equal(isWoven(getPassage(p, span)), true);
    assert.equal(recommendedLevel(getPassage(p, span)), 'ghana');
    assert.equal(reviewLevel(getPassage(p, span)), 'ghana');
    assert.equal(play(p, span, 'ghana', 1, D + 3).newlyWoven, false);
  });

  test('an unfinished round updates links but not the ladder or schedule', () => {
    const p = emptyProgress('t1');
    const tokens = tokenize(buildPattern('samhita', [0, 1, 2, 3]));
    const out = recordRound(p, { kind: 'passage', span, level: 'samhita', tokens, scores: [1, 1, null, null], now: NOW, today: D });
    assert.equal(out.summary.complete, false);
    assert.equal(p.links[0].f.s, 1);
    const rec = getPassage(p, span);
    assert.equal(rec.rounds, 0);
    assert.equal(rec.sr, null);
    assert.deepEqual(rec.cleared, {});
  });

  test('complete rounds schedule the passage', () => {
    const p = emptyProgress('t1');
    play(p, span, 'samhita', 1, D);
    const rec = getPassage(p, span);
    assert.equal(rec.sr.due, D + 1);
    assert.equal(rec.history.length, 1);
    const [state] = passageStates(p, [span], D + 1);
    assert.equal(state.due, true);
    assert.equal(state.stage, 'learning');
    assert.equal(state.next, 'pada');
  });
});

describe('passage states, bridges and final tests', () => {
  test('stages, due flags and weak-link counts', () => {
    const p = emptyProgress('t1');
    const spans = [{ start: 0, end: 3 }, { start: 3, end: 6 }];
    play(p, spans[0], 'krama', (t) => (t.k === 1 ? 0 : 1));
    const states = passageStates(p, spans, D);
    assert.equal(states[0].stage, 'learning');
    assert.equal(states[0].weak, 1);
    assert.equal(states[0].due, false);
    assert.equal(states[0].again, true, 'scored below 4, so SM-2 asks for another pass');
    assert.equal(states[1].stage, 'new');
    assert.equal(states[1].due, false);
  });

  test('bridges need work once both neighbours are practised', () => {
    const p = emptyProgress('t1');
    const spans = [{ start: 0, end: 3 }, { start: 3, end: 6 }];
    play(p, spans[0], 'samhita', 1);
    assert.deepEqual(bridgesNeedingWork(p, spans), []);
    play(p, spans[1], 'samhita', 1);
    assert.deepEqual(bridgesNeedingWork(p, spans), [0]);
    const bridge = { start: 1, end: 5 };
    const tokens = tokenize(buildPattern('jata', range(1, 5)));
    recordRound(p, { kind: 'bridge', span: bridge, tokens, scores: tokens.map(() => 1), now: NOW, today: D });
    assert.equal(p.bridges[spanKey(bridge)].rounds, 1);
    assert.deepEqual(bridgesNeedingWork(p, spans), []);
    assert.equal(p.links[2].f.s, 1, 'the cross-passage link was trained');
  });

  test('final test records accuracy and missed words', () => {
    const p = emptyProgress('t1');
    const tokens = tokenize(buildPattern('samhita', range(0, 5)));
    const out = recordRound(p, { kind: 'final', tokens, scores: [1, 0, 1, 0.5, 1], now: NOW, today: D });
    assert.equal(p.finals.length, 1);
    assert.deepEqual(p.finals[0], { at: NOW, day: D, accuracy: 0.7, missed: [1] });
    assert.equal(out.summary.missed, 1);
  });
});

describe('weak-link drills', () => {
  test('windows surround the weakest links and merge while short', () => {
    const m = { links: {}, words: {} };
    m.links[2] = { f: { s: 0.4, n: 1, last: 0 } };
    m.links[3] = { b: { s: 0.6, n: 1, last: 0 } };
    m.links[9] = { f: { s: 0.2, n: 1, last: 0 } };
    m.links[12] = { f: { s: 0.95, n: 1, last: 0 } };
    const { links, windows } = weakLinkWindows(m, 11);
    assert.deepEqual(links, [2, 3, 9]);
    // link 2 → words 1..4, link 3 → words 2..5 (merged), link 9 → words 8..10 (clipped)
    assert.deepEqual(windows, [
      { start: 1, end: 6 },
      { start: 8, end: 11 },
    ]);
  });

  test('limit keeps only the weakest links', () => {
    const m = { links: {}, words: {} };
    for (let i = 0; i < 20; i += 4) m.links[i] = { f: { s: i / 40, n: 1, last: 0 } };
    const { links } = weakLinkWindows(m, 30, { limit: 2 });
    assert.deepEqual(links, [0, 4]);
  });

  test('mini jaṭā / ghana patterns over each window', () => {
    const [ghana] = drillPatterns([{ start: 5, end: 8 }], 'ghana');
    assert.equal(notation(ghana.pattern), '56 65 567 765 567 | 67 76 67');
    const [jata] = drillPatterns([{ start: 5, end: 7 }], 'jata');
    assert.equal(notation(jata.pattern), '56 65 56');
  });
});

describe('text model', () => {
  test('createText segments and chunks, with direction and joiner', () => {
    const t = createText({ title: '  Doha ', raw: 'निज भाषा उन्नति अहै, सब उन्नति को मूल।\r\n', lang: 'hi', now: NOW });
    assert.equal(t.title, 'Doha');
    assert.equal(t.raw, 'निज भाषा उन्नति अहै, सब उन्नति को मूल।');
    assert.equal(t.units.length, 8);
    assert.deepEqual(t.passages, [{ start: 0, end: 8 }]);
    assert.equal(t.dir, 'ltr');
    assert.equal(t.joiner, ' ');
    assert.match(t.id, /^t_[0-9a-f]{16}$/);
    assert.equal(t.createdAt, NOW);

    const ar = createText({ raw: 'الخيل والليل والبيداء تعرفني', lang: 'ar' });
    assert.equal(ar.dir, 'rtl');
    assert.equal(ar.title, 'الخيل والليل والبيداء تعرفني');

    const ja = createText({ raw: '古池や蛙飛び込む水の音', lang: 'ja', unitMode: 'char', chunk: { mode: 'fixed', maxWords: 6 } });
    assert.equal(ja.joiner, '');
    assert.deepEqual(ja.passages, [{ start: 0, end: 6 }, { start: 6, end: 11 }]);
    assert.equal(unitText(ja.units[0]), '古');
  });

  test('rechunk keeps units; helpers find passages and bridges', () => {
    const t = createText({ raw: 'a b c d e f g h i j', chunk: { mode: 'fixed', maxWords: 5 } });
    assert.deepEqual(passageItems(t, 1), [5, 6, 7, 8, 9]);
    assert.deepEqual(bridgeOf(t, 0), { start: 3, end: 7 });
    assert.equal(bridgeOf(t, 1), null);
    assert.equal(passageOfWord(t, 6), 1);
    const r = rechunk(t, { mode: 'fixed', maxWords: 4 });
    assert.equal(r.units, t.units);
    assert.equal(r.passages.length, 3);
    assert.deepEqual(passageItems(r, 9), []);
  });

  test('default titles and ids', () => {
    assert.equal(defaultTitle('Short line\nsecond'), 'Short line');
    assert.equal(defaultTitle('x'.repeat(60)), `${'x'.repeat(40)}…`);
    assert.notEqual(newId(), newId());
  });
});
