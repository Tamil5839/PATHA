import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { segmentText, joinUnits } from '../../src/core/segment.js';
import { chunkUnits, bridgeSpan, suggestChunkMode, clampMaxWords, splitBalanced } from '../../src/core/chunk.js';

const GETTYSBURG_1 =
  'Four score and seven years ago our fathers brought forth on this continent, a new nation, ' +
  'conceived in Liberty, and dedicated to the proposition that all men are created equal.\n\n' +
  'Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived ' +
  'and so dedicated, can long endure. We are met on a great battle-field of that war.';

const HOPE =
  'HOPE is the thing with feathers\nThat perches in the soul,\nAnd sings the tune without the words,\nAnd never stops at all,\n\n' +
  'And sweetest in the gale is heard;\nAnd sore must be the storm\nThat could abash the little bird\nThat kept so many warm.';

/** Passages as strings, for readable assertions. */
function passages(units, spans) {
  return spans.map((s) => joinUnits(units.slice(s.start, s.end)).replace(/\n+/g, ' / '));
}

function assertPartition(units, spans, max) {
  assert.equal(spans[0].start, 0);
  assert.equal(spans[spans.length - 1].end, units.length);
  for (let i = 0; i < spans.length; i++) {
    assert.ok(spans[i].end > spans[i].start, 'non-empty');
    assert.ok(spans[i].end - spans[i].start <= max, `at most ${max} words`);
    if (i > 0) assert.equal(spans[i].start, spans[i - 1].end, 'contiguous');
  }
}

describe('chunking into passages', () => {
  test('sentences, with long sentences split in balanced pieces at pauses', () => {
    const units = segmentText(GETTYSBURG_1);
    const spans = chunkUnits(units, { mode: 'sentence', maxWords: 12 });
    assertPartition(units, spans, 12);
    assert.deepEqual(passages(units, spans), [
      'Four score and seven years ago our fathers brought forth',
      'on this continent, a new nation, conceived in Liberty,',
      'and dedicated to the proposition that all men are created equal.',
      'Now we are engaged in a great civil war,',
      'testing whether that nation,',
      'or any nation so conceived and so dedicated, can long endure.',
      'We are met on a great battle-field of that war.',
    ]);
  });

  test('passages never cross a paragraph (stanza) break', () => {
    const units = segmentText(GETTYSBURG_1);
    for (const max of [3, 5, 8, 12, 20, 30]) {
      for (const mode of ['sentence', 'line', 'fixed']) {
        const spans = chunkUnits(units, { mode, maxWords: max });
        assertPartition(units, spans, max);
        for (const s of spans) assert.equal(units[s.start].para, units[s.end - 1].para);
      }
    }
  });

  test('lines of verse are grouped while they fit', () => {
    const units = segmentText(HOPE);
    assert.equal(suggestChunkMode(units), 'line');
    const spans = chunkUnits(units, { mode: 'line', maxWords: 12 });
    assertPartition(units, spans, 12);
    assert.deepEqual(passages(units, spans), [
      'HOPE is the thing with feathers / That perches in the soul,',
      'And sings the tune without the words, / And never stops at all,',
      // 7 + 6 words would exceed 12, so this stanza groups as 7 | 6 | 6 + 5
      'And sweetest in the gale is heard;',
      'And sore must be the storm',
      'That could abash the little bird / That kept so many warm.',
    ]);
  });

  test('fixed size spreads words evenly', () => {
    const units = segmentText('a b c d e f g h i j k l m n o p q r s t u v w x y');
    const spans = chunkUnits(units, { mode: 'fixed', maxWords: 12 });
    assert.deepEqual(spans.map((s) => s.end - s.start), [9, 8, 8]);
  });

  test('fragments shorter than three words join a neighbour', () => {
    const units = segmentText('Yes. We shall go on to the end. We shall fight. No.');
    const spans = chunkUnits(units, { mode: 'sentence', maxWords: 12 });
    assert.deepEqual(passages(units, spans), ['Yes. We shall go on to the end.', 'We shall fight. No.']);
  });

  test('prose defaults to sentences; the word limit is clamped', () => {
    assert.equal(suggestChunkMode(segmentText(GETTYSBURG_1)), 'sentence');
    assert.equal(clampMaxWords(1), 3);
    assert.equal(clampMaxWords(99), 30);
    assert.equal(clampMaxWords('abc'), 12);
    assert.deepEqual(chunkUnits([], {}), []);
  });

  test('splitBalanced prefers punctuation breaks', () => {
    const units = segmentText('one two three four, five six seven eight nine ten');
    assert.deepEqual(splitBalanced(units, 0, units.length, 6), [
      { start: 0, end: 4 },
      { start: 4, end: 10 },
    ]);
  });
});

describe('bridges between passages', () => {
  test('last two words of one passage and first two of the next', () => {
    const spans = [
      { start: 0, end: 5 },
      { start: 5, end: 6 },
      { start: 6, end: 10 },
    ];
    assert.deepEqual(bridgeSpan(spans, 0), { start: 3, end: 6 });
    assert.deepEqual(bridgeSpan(spans, 1), { start: 5, end: 8 });
    assert.equal(bridgeSpan(spans, 2), null);
    assert.deepEqual(bridgeSpan(spans, 0, 1), { start: 4, end: 6 });
  });
});
