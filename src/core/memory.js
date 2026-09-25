// Link-based memory model.
//
// The unit of memory is the LINK between adjacent words: link i joins word i
// to word i + 1 of the text. Forward (i → i+1) and backward (i+1 → i)
// directions are tracked separately, since jaṭā and ghana train both. Each
// word's knowledge of its own position is tracked as well.
//
// Every stat is an exponential moving average of recall scores:
//   first observation:  s = score
//   afterwards:         s = s + ALPHA × (score − s)
// A round contributes one update per link direction and per word: the mean
// of that round's scores for it, so a ghana round (many repetitions) moves a
// link no faster than a krama round.

/** @typedef {import('./patterns.js').Token} Token */
/** @typedef {{ s: number, n: number, last: number }} Stat  strength 0..1, updates, last update (ms) */
/** @typedef {{ f?: Stat, b?: Stat }} LinkEntry */
/** @typedef {'new'|'weak'|'shaky'|'strong'} Status */

export const ALPHA = 0.35;
/** Strength at or above which a link counts as strong (gold). */
export const STRONG = 0.8;
/** Strength below which a link counts as weak (red); in between is shaky (amber). */
export const WEAK = 0.5;

/** Scores for one recited word. */
export const SCORE = Object.freeze({ got: 1, unsure: 0.5, missed: 0 });

/** @param {number} x */
function round4(x) {
  return Math.round(x * 10000) / 10000;
}

/**
 * @param {Stat|undefined|null} stat
 * @param {number} score  0..1
 * @param {number} now    ms timestamp
 * @returns {Stat}
 */
export function updateStat(stat, score, now) {
  const x = Math.min(1, Math.max(0, score));
  if (!stat || !stat.n) return { s: round4(x), n: 1, last: now };
  return { s: round4(stat.s + ALPHA * (x - stat.s)), n: stat.n + 1, last: now };
}

/**
 * @param {number|null|undefined} strength
 * @returns {Status}
 */
export function statusOf(strength) {
  if (strength == null || Number.isNaN(strength)) return 'new';
  if (strength >= STRONG) return 'strong';
  if (strength >= WEAK) return 'shaky';
  return 'weak';
}

/**
 * @typedef {Object} RoundResults
 * @property {{ index: number, dir: 'f'|'b', mean: number, count: number }[]} links
 * @property {{ item: number, mean: number, count: number }[]} words
 */

/**
 * Aggregate one round: the mean score of each link direction and each word
 * it exercised. Unanswered tokens (score null) are skipped.
 * @param {Token[]} tokens
 * @param {(number|null)[]} scores  one per token
 * @returns {RoundResults}
 */
export function roundResults(tokens, scores) {
  /** @type {Map<string, { index: number, dir: 'f'|'b', sum: number, count: number }>} */
  const links = new Map();
  /** @type {Map<number, { item: number, sum: number, count: number }>} */
  const words = new Map();
  tokens.forEach((t, k) => {
    const score = scores[k];
    if (score == null) return;
    const w = words.get(t.item) ?? { item: t.item, sum: 0, count: 0 };
    w.sum += score;
    w.count += 1;
    words.set(t.item, w);
    if (t.link) {
      const key = `${t.link.index}${t.link.dir}`;
      const l = links.get(key) ?? { index: t.link.index, dir: t.link.dir, sum: 0, count: 0 };
      l.sum += score;
      l.count += 1;
      links.set(key, l);
    }
  });
  return {
    links: [...links.values()]
      .map(({ index, dir, sum, count }) => ({ index, dir, mean: sum / count, count }))
      .sort((a, b) => a.index - b.index || a.dir.localeCompare(b.dir)),
    words: [...words.values()]
      .map(({ item, sum, count }) => ({ item, mean: sum / count, count }))
      .sort((a, b) => a.item - b.item),
  };
}

/**
 * @typedef {Object} MemoryRecord
 * @property {Record<string, LinkEntry>} links
 * @property {Record<string, Stat>} words
 */

/**
 * Apply a round's results to a text's memory record (mutates it).
 * @param {MemoryRecord} memory
 * @param {RoundResults} results
 * @param {number} now
 */
export function applyRoundResults(memory, results, now) {
  for (const l of results.links) {
    const entry = (memory.links[l.index] ??= {});
    entry[l.dir] = updateStat(entry[l.dir], l.mean, now);
  }
  for (const w of results.words) {
    memory.words[w.item] = updateStat(memory.words[w.item], w.mean, now);
  }
}

/**
 * Combined strength of a link: its weaker practised direction, or null if
 * never practised.
 * @param {MemoryRecord} memory
 * @param {number} index
 */
export function linkStrength(memory, index) {
  const e = memory.links[index];
  if (!e) return null;
  const values = [e.f, e.b].filter(Boolean).map((s) => /** @type {Stat} */ (s).s);
  return values.length ? Math.min(...values) : null;
}

/**
 * Practised links below STRONG within [start, end) word range, weakest first.
 * @param {MemoryRecord} memory
 * @param {number} start  first word index
 * @param {number} end    one past the last word index
 * @returns {{ index: number, s: number }[]}
 */
export function weakLinksIn(memory, start, end) {
  const out = [];
  for (let i = start; i + 1 < end; i++) {
    const s = linkStrength(memory, i);
    if (s != null && s < STRONG) out.push({ index: i, s });
  }
  return out.sort((a, b) => a.s - b.s || a.index - b.index);
}

/**
 * @typedef {Object} RoundSummary
 * @property {number} total     words in the pattern
 * @property {number} answered  words answered
 * @property {number} got
 * @property {number} unsure
 * @property {number} missed
 * @property {number} accuracy  mean score of answered words (0..1)
 * @property {boolean} complete every word answered
 * @property {boolean} perfect  complete with every word correct first time
 */

/**
 * @param {(number|null)[]} scores
 * @returns {RoundSummary}
 */
export function summarize(scores) {
  let answered = 0;
  let got = 0;
  let unsure = 0;
  let missed = 0;
  let sum = 0;
  for (const s of scores) {
    if (s == null) continue;
    answered++;
    sum += s;
    if (s >= 1) got++;
    else if (s > 0) unsure++;
    else missed++;
  }
  const complete = answered === scores.length && scores.length > 0;
  return {
    total: scores.length,
    answered,
    got,
    unsure,
    missed,
    accuracy: answered ? sum / answered : 0,
    complete,
    perfect: complete && got === scores.length,
  };
}
