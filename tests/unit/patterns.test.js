import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPattern,
  notation,
  tokenize,
  countWords,
  range,
  LEVELS,
  LEVEL_IDS,
  levelById,
  isLevelId,
} from '../../src/core/patterns.js';

const letters = (n) => 'abcdefghijklmnopqrstuvwxyz'.slice(0, n).split('');
const show = (level, n) => notation(buildPattern(level, letters(n)));

// Expected outputs are written out by hand (not generated) so that the tests
// pin the exact recitation order, including how each pattern ends.
const EXPECTED = {
  0: { samhita: '', pada: '', krama: '', jata: '', ghana: '' },
  1: { samhita: 'a', pada: 'a', krama: 'a', jata: 'a', ghana: 'a' },
  2: {
    samhita: 'ab',
    pada: 'a | b',
    krama: 'ab',
    jata: 'ab ba ab',
    ghana: 'ab ba ab',
  },
  3: {
    samhita: 'abc',
    pada: 'a | b | c',
    krama: 'ab | bc',
    jata: 'ab ba ab | bc cb bc',
    ghana: 'ab ba abc cba abc | bc cb bc',
  },
  4: {
    samhita: 'abcd',
    pada: 'a | b | c | d',
    krama: 'ab | bc | cd',
    jata: 'ab ba ab | bc cb bc | cd dc cd',
    ghana: 'ab ba abc cba abc | bc cb bcd dcb bcd | cd dc cd',
  },
  5: {
    samhita: 'abcde',
    pada: 'a | b | c | d | e',
    krama: 'ab | bc | cd | de',
    jata: 'ab ba ab | bc cb bc | cd dc cd | de ed de',
    ghana: 'ab ba abc cba abc | bc cb bcd dcb bcd | cd dc cde edc cde | de ed de',
  },
  10: {
    samhita: 'abcdefghij',
    pada: 'a | b | c | d | e | f | g | h | i | j',
    krama: 'ab | bc | cd | de | ef | fg | gh | hi | ij',
    jata:
      'ab ba ab | bc cb bc | cd dc cd | de ed de | ef fe ef | fg gf fg | gh hg gh | hi ih hi | ij ji ij',
    ghana:
      'ab ba abc cba abc | bc cb bcd dcb bcd | cd dc cde edc cde | de ed def fed def | ' +
      'ef fe efg gfe efg | fg gf fgh hgf fgh | gh hg ghi ihg ghi | hi ih hij jih hij | ij ji ij',
  },
};

describe('pattern generator: exact output', () => {
  for (const [n, byLevel] of Object.entries(EXPECTED)) {
    for (const [level, expected] of Object.entries(byLevel)) {
      test(`${level} with ${n} word(s)`, () => {
        assert.equal(show(level, Number(n)), expected);
      });
    }
  }
});

describe('pattern generator: structure', () => {
  test('matches the specification examples for a b c d e verbatim', () => {
    const w = letters(5);
    assert.deepEqual(buildPattern('samhita', w), [[['a', 'b', 'c', 'd', 'e']]]);
    assert.deepEqual(buildPattern('pada', w), [[['a']], [['b']], [['c']], [['d']], [['e']]]);
    assert.deepEqual(buildPattern('krama', w), [
      [['a', 'b']],
      [['b', 'c']],
      [['c', 'd']],
      [['d', 'e']],
    ]);
    assert.deepEqual(buildPattern('jata', w)[0], [
      ['a', 'b'],
      ['b', 'a'],
      ['a', 'b'],
    ]);
    assert.deepEqual(buildPattern('ghana', w), [
      [['a', 'b'], ['b', 'a'], ['a', 'b', 'c'], ['c', 'b', 'a'], ['a', 'b', 'c']],
      [['b', 'c'], ['c', 'b'], ['b', 'c', 'd'], ['d', 'c', 'b'], ['b', 'c', 'd']],
      [['c', 'd'], ['d', 'c'], ['c', 'd', 'e'], ['e', 'd', 'c'], ['c', 'd', 'e']],
      // Closing convention: the final pair falls back to the jaṭā form.
      [['d', 'e'], ['e', 'd'], ['d', 'e']],
    ]);
  });

  test('single word yields exactly that word at every level', () => {
    for (const level of LEVEL_IDS) {
      assert.deepEqual(buildPattern(level, ['x']), [[['x']]]);
    }
  });

  test('empty input yields an empty pattern at every level', () => {
    for (const level of LEVEL_IDS) assert.deepEqual(buildPattern(level, []), []);
  });

  test('steps per level follow n, n, n-1, n-1, n-1', () => {
    for (const n of [2, 3, 7, 12]) {
      const w = range(0, n);
      assert.equal(buildPattern('samhita', w).length, 1);
      assert.equal(buildPattern('pada', w).length, n);
      assert.equal(buildPattern('krama', w).length, n - 1);
      assert.equal(buildPattern('jata', w).length, n - 1);
      assert.equal(buildPattern('ghana', w).length, n - 1);
    }
  });

  test('word counts per level', () => {
    // ghana: (n-2) full steps of 13 words + one closing jaṭā step of 6 words
    for (const n of [2, 3, 5, 10, 12]) {
      const w = range(0, n);
      assert.equal(countWords(buildPattern('samhita', w)), n);
      assert.equal(countWords(buildPattern('pada', w)), n);
      assert.equal(countWords(buildPattern('krama', w)), 2 * (n - 1));
      assert.equal(countWords(buildPattern('jata', w)), 6 * (n - 1));
      assert.equal(countWords(buildPattern('ghana', w)), 13 * (n - 2) + 6);
    }
  });

  test('works on arbitrary item values (e.g. global word indices)', () => {
    assert.equal(notation(buildPattern('krama', [7, 8, 9])), '78 | 89');
    assert.deepEqual(buildPattern('ghana', [7, 8, 9])[0][3], [9, 8, 7]);
  });

  test('does not mutate its input', () => {
    const w = ['a', 'b', 'c'];
    const p = buildPattern('samhita', w);
    p[0][0].push('z');
    assert.deepEqual(w, ['a', 'b', 'c']);
  });

  test('rejects unknown levels', () => {
    assert.throws(() => buildPattern(/** @type {any} */ ('mala'), ['a', 'b']), /Unknown level/);
    assert.throws(() => levelById('rekha'), /Unknown level/);
    assert.equal(isLevelId('ghana'), true);
    assert.equal(isLevelId('ratha'), false);
  });

  test('level ladder metadata is ordered samhita → ghana', () => {
    assert.deepEqual(LEVEL_IDS, ['samhita', 'pada', 'krama', 'jata', 'ghana']);
    assert.deepEqual(
      LEVELS.map((l) => l.rank),
      [1, 2, 3, 4, 5],
    );
  });
});

describe('tokenize: which links each recited word exercises', () => {
  const linkOf = (t) => (t.link ? `${t.link.dir}${t.link.index}` : '-');

  test('samhita exercises every forward link once', () => {
    const tokens = tokenize(buildPattern('samhita', [0, 1, 2, 3]));
    assert.deepEqual(tokens.map(linkOf), ['-', 'f0', 'f1', 'f2']);
  });

  test('pada exercises no links (isolated words)', () => {
    const tokens = tokenize(buildPattern('pada', [0, 1, 2]));
    assert.deepEqual(tokens.map(linkOf), ['-', '-', '-']);
  });

  test('krama: pauses between pairs are not links', () => {
    const tokens = tokenize(buildPattern('krama', [0, 1, 2]));
    assert.deepEqual(tokens.map((t) => t.item), [0, 1, 1, 2]);
    assert.deepEqual(tokens.map(linkOf), ['-', 'f0', '-', 'f1']);
  });

  test('jata trains each link forward twice and backward once', () => {
    const tokens = tokenize(buildPattern('jata', [0, 1]));
    assert.deepEqual(tokens.map((t) => t.item), [0, 1, 1, 0, 0, 1]);
    assert.deepEqual(tokens.map(linkOf), ['-', 'f0', '-', 'b0', '-', 'f0']);
  });

  test('ghana exercises forward and backward links across triples', () => {
    const tokens = tokenize(buildPattern('ghana', [0, 1, 2]));
    assert.deepEqual(
      tokens.map((t) => t.item),
      [0, 1, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 1, 2, 2, 1, 1, 2],
    );
    assert.deepEqual(tokens.map(linkOf), [
      '-', 'f0', '-', 'b0', '-', 'f0', 'f1', '-', 'b1', 'b0', '-', 'f0', 'f1',
      '-', 'f1', '-', 'b1', '-', 'f1',
    ]);
    const count = (key) => tokens.filter((t) => linkOf(t) === key).length;
    assert.equal(count('f0'), 3);
    assert.equal(count('b0'), 2);
    assert.equal(count('f1'), 4);
    assert.equal(count('b1'), 2);
  });

  test('token metadata: step, segment, position and running index', () => {
    const tokens = tokenize(buildPattern('jata', [4, 5, 6]));
    const t = tokens[9]; // step 1 ("56 65 56"), segment 1 ("65"), second word
    assert.deepEqual(
      { item: t.item, step: t.step, seg: t.seg, pos: t.pos, k: t.k },
      { item: 5, step: 1, seg: 1, pos: 1, k: 9 },
    );
    assert.deepEqual(t.link, { index: 5, dir: 'b' });
  });
});
