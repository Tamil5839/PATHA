// Recitation pattern generator.
//
// Vocabulary used throughout Patha:
//   pattern  = the whole recitation of a passage at one level: a list of steps
//   step     = one unit of the pattern, recited before a longer pause ("|")
//   segment  = words recited together without a pause, e.g. "ab" or "cba"
//   item     = one word (in the app, a word's index in the whole text)
//
// Conventions (sources and reasoning in docs/PATTERNS.md):
//   * Ghana's final pair has no third word, so it is recited in jaṭā form
//     ("de ed de"). Traditional sources state that for the last two words
//     ghana is the same as jaṭā.
//   * The traditional closing repetition of the final word with "iti"
//     (e.g. "e iti e") is Sanskrit-specific and is omitted at every level.
//   * A passage of a single word yields just that word at every level;
//     an empty passage yields an empty pattern.

/** @typedef {'samhita'|'pada'|'krama'|'jata'|'ghana'} LevelId */

/**
 * @typedef {Object} Level
 * @property {LevelId} id
 * @property {number} rank        1..5, the order of the ladder
 * @property {string} name        IAST name
 * @property {string} deva        Devanagari name
 * @property {string} plain       Short English gloss
 * @property {string} scheme      Letter illustration for five words
 * @property {string} blurb       One-sentence description
 */

/** @type {Level[]} */
export const LEVELS = [
  {
    id: 'samhita',
    rank: 1,
    name: 'Saṃhitā',
    deva: 'संहिता',
    plain: 'Continuous',
    scheme: 'a b c d e',
    blurb: 'The passage as one continuous recitation.',
  },
  {
    id: 'pada',
    rank: 2,
    name: 'Pada',
    deva: 'पद',
    plain: 'Word by word',
    scheme: 'a | b | c | d | e',
    blurb: 'Each word on its own, with a pause after it.',
  },
  {
    id: 'krama',
    rank: 3,
    name: 'Krama',
    deva: 'क्रम',
    plain: 'Overlapping pairs',
    scheme: 'ab | bc | cd | de',
    blurb: 'Each word joined to the next, one pair at a time.',
  },
  {
    id: 'jata',
    rank: 4,
    name: 'Jaṭā',
    deva: 'जटा',
    plain: 'Braided pairs',
    scheme: 'ab ba ab | bc cb bc | …',
    blurb: 'Each pair forward, backward and forward again.',
  },
  {
    id: 'ghana',
    rank: 5,
    name: 'Ghana',
    deva: 'घन',
    plain: 'The full weave',
    scheme: 'ab ba abc cba abc | bc cb bcd dcb bcd | …',
    blurb: 'Pairs and triples woven back and forth, so every word is locked to its neighbours.',
  },
];

/** @type {LevelId[]} */
export const LEVEL_IDS = LEVELS.map((l) => l.id);

/** @param {string} id */
export function levelById(id) {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`Unknown level: ${id}`);
  return level;
}

/** @param {string} id */
export function isLevelId(id) {
  return LEVEL_IDS.includes(/** @type {LevelId} */ (id));
}

/**
 * @template T
 * @typedef {T[][][]} Pattern  steps → segments → items
 */

/**
 * Build the recitation pattern for a list of items (usually word indices).
 * @template T
 * @param {LevelId} level
 * @param {readonly T[]} items
 * @returns {Pattern<T>}
 */
export function buildPattern(level, items) {
  const w = [...items];
  const n = w.length;
  if (n === 0) return [];
  if (n === 1) return [[[w[0]]]];
  switch (level) {
    case 'samhita':
      return [[w]];
    case 'pada':
      return w.map((x) => [[x]]);
    case 'krama': {
      const steps = [];
      for (let i = 0; i + 1 < n; i++) steps.push([[w[i], w[i + 1]]]);
      return steps;
    }
    case 'jata': {
      const steps = [];
      for (let i = 0; i + 1 < n; i++) steps.push(jataStep(w[i], w[i + 1]));
      return steps;
    }
    case 'ghana': {
      const steps = [];
      for (let i = 0; i + 1 < n; i++) {
        const a = w[i];
        const b = w[i + 1];
        if (i + 2 < n) {
          const c = w[i + 2];
          steps.push([[a, b], [b, a], [a, b, c], [c, b, a], [a, b, c]]);
        } else {
          // Final pair: no third word exists, so the pair is recited as jaṭā.
          steps.push(jataStep(a, b));
        }
      }
      return steps;
    }
    default:
      throw new Error(`Unknown level: ${level}`);
  }
}

/**
 * @template T
 * @param {T} a
 * @param {T} b
 * @returns {T[][]}
 */
function jataStep(a, b) {
  return [[a, b], [b, a], [a, b]];
}

/**
 * Compact letter notation, as used in the documentation:
 * items in a segment are concatenated, segments are separated by spaces and
 * steps by " | ". Samhita of a b c d e is therefore "abcde".
 * @param {Pattern<string|number>} pattern
 * @returns {string}
 */
export function notation(pattern) {
  return pattern.map((step) => step.map((seg) => seg.join('')).join(' ')).join(' | ');
}

/**
 * @typedef {Object} LinkRef
 * @property {number} index  link between word `index` and word `index + 1`
 * @property {'f'|'b'} dir   'f' = forward (index → index+1), 'b' = backward
 */

/**
 * @typedef {Object} Token
 * @property {number} item   word index
 * @property {number} step   step index within the pattern
 * @property {number} seg    segment index within the step
 * @property {number} pos    position within the segment
 * @property {number} k      position in the flat token sequence
 * @property {LinkRef|null} link  the link exercised by arriving at this word
 *   from the previous word of the same segment (null at segment starts)
 */

/**
 * Flatten a numeric pattern into the sequence of words to recite, noting
 * which word-to-word link each word exercises. Words recited together in a
 * segment exercise the link between them; a pause (segment or step
 * boundary) does not. Link identity is positional: the link between the
 * words at indices i and i+1 of the text is link i.
 * @param {Pattern<number>} pattern
 * @returns {Token[]}
 */
export function tokenize(pattern) {
  /** @type {Token[]} */
  const tokens = [];
  pattern.forEach((step, si) => {
    step.forEach((seg, gi) => {
      seg.forEach((item, pi) => {
        /** @type {LinkRef|null} */
        let link = null;
        if (pi > 0) {
          const prev = seg[pi - 1];
          if (item === prev + 1) link = { index: prev, dir: 'f' };
          else if (item === prev - 1) link = { index: item, dir: 'b' };
        }
        tokens.push({ item, step: si, seg: gi, pos: pi, k: tokens.length, link });
      });
    });
  });
  return tokens;
}

/**
 * Number of words recited in a pattern.
 * @param {Pattern<unknown>} pattern
 */
export function countWords(pattern) {
  let count = 0;
  for (const step of pattern) for (const seg of step) count += seg.length;
  return count;
}

/**
 * Consecutive integers from start (inclusive) to end (exclusive).
 * @param {number} start
 * @param {number} end
 */
export function range(start, end) {
  const out = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}
