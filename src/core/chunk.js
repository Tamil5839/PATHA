// Splitting a text's units into passages, and bridges between passages.

/** @typedef {import('./segment.js').Unit} Unit */
/** @typedef {'sentence'|'line'|'fixed'} ChunkMode */
/** @typedef {{ start: number, end: number }} Span  unit indices, end exclusive */

export const CHUNK_MODES = /** @type {ChunkMode[]} */ (['sentence', 'line', 'fixed']);
export const MAX_WORDS_MIN = 3;
export const MAX_WORDS_MAX = 30;
export const DEFAULT_MAX_WORDS = 12;
const MIN_WORDS = 3;

/**
 * Split units into passages.
 *  - sentence: one sentence per passage (default)
 *  - line: lines of verse, consecutive lines grouped while they fit
 *  - fixed: evenly sized passages within each paragraph
 * Passages never exceed maxWords and never span a paragraph (stanza) break.
 * Long sentences or lines are split into pieces at the text's natural pauses
 * (punctuation, line ends), keeping pieces reasonably even. In sentence mode,
 * fragments shorter than three words join a neighbour when they fit.
 * @param {Unit[]} units
 * @param {{ mode?: ChunkMode, maxWords?: number }} [options]
 * @returns {Span[]}
 */
export function chunkUnits(units, { mode = 'sentence', maxWords = DEFAULT_MAX_WORDS } = {}) {
  if (units.length === 0) return [];
  const max = clampMaxWords(maxWords);
  const min = Math.min(MIN_WORDS, max);
  const paragraphs = runs(units, { start: 0, end: units.length }, (u) => u.para);

  if (mode === 'fixed') {
    return paragraphs.flatMap((p) => evenSplit(p, max));
  }
  if (mode === 'line') {
    return paragraphs.flatMap((p) => {
      const lines = runs(units, p, (u) => u.line).flatMap((l) => splitBalanced(units, l.start, l.end, max, min));
      return groupAtoms(units, lines, max, min);
    });
  }
  const sentences = paragraphs.flatMap((p) => runs(units, p, (u) => u.sent));
  const spans = sentences.flatMap((s) => splitBalanced(units, s.start, s.end, max, min));
  return mergeFragments(units, spans, max, min);
}

/** @param {number|string} value */
export function clampMaxWords(value) {
  const v = Math.round(Number(value));
  if (!Number.isFinite(v)) return DEFAULT_MAX_WORDS;
  return Math.min(MAX_WORDS_MAX, Math.max(MAX_WORDS_MIN, v));
}

/**
 * Maximal runs of units within a span that share a key.
 * @param {Unit[]} units
 * @param {Span} span
 * @param {(u: Unit) => unknown} key
 * @returns {Span[]}
 */
function runs(units, span, key) {
  /** @type {Span[]} */
  const out = [];
  let start = span.start;
  for (let i = span.start + 1; i <= span.end; i++) {
    if (i === span.end || key(units[i]) !== key(units[i - 1])) {
      out.push({ start, end: i });
      start = i;
    }
  }
  return out;
}

/**
 * Split a span into the fewest pieces of at most max units, as equal in
 * size as possible (25 words at 12 → 9, 8, 8).
 * @param {Span} span
 * @param {number} max
 * @returns {Span[]}
 */
function evenSplit(span, max) {
  const length = span.end - span.start;
  const count = Math.ceil(length / max);
  const base = Math.floor(length / count);
  const extra = length % count;
  /** @type {Span[]} */
  const out = [];
  let start = span.start;
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push({ start, end: start + size });
    start += size;
  }
  return out;
}

// Cost of a passage boundary after a unit, by the pause that follows it
// (none, comma, clause or line end, sentence end, paragraph end).
const BREAK_COST = [10, 2, 1, 0, 0];

/**
 * Group consecutive atoms (spans) into passages of at most max units.
 * Dynamic programming over group boundaries. Each passage costs a little, so
 * fewer passages are preferred; uneven or very short passages cost more;
 * and ending a passage where the text does not pause costs the most.
 * @param {Unit[]} units
 * @param {Span[]} atoms  consecutive, non-empty spans
 * @param {number} max
 * @param {number} min
 * @returns {Span[]}
 */
function groupAtoms(units, atoms, max, min) {
  const m = atoms.length;
  if (m === 0) return [];
  const total = atoms[m - 1].end - atoms[0].start;
  if (total <= max) return [{ start: atoms[0].start, end: atoms[m - 1].end }];
  const target = total / Math.ceil(total / max);
  const cost = new Array(m + 1).fill(Infinity);
  const from = new Array(m + 1).fill(-1);
  cost[0] = 0;
  for (let j = 1; j <= m; j++) {
    for (let i = j - 1; i >= 0; i--) {
      const size = atoms[j - 1].end - atoms[i].start;
      if (size > max && i < j - 1) break;
      if (cost[i] === Infinity) continue;
      const d = (size - target) / max;
      const groupCost = 3 + 4 * d * d + (size < min ? 10 : 0);
      const breakCost = j < m ? (BREAK_COST[units[atoms[j - 1].end - 1].brk] ?? 10) : 0;
      const c = cost[i] + groupCost + breakCost;
      if (c < cost[j]) {
        cost[j] = c;
        from[j] = i;
      }
    }
  }
  /** @type {Span[]} */
  const out = [];
  for (let j = m; j > 0; j = from[j]) out.unshift({ start: atoms[from[j]].start, end: atoms[j - 1].end });
  return out;
}

/**
 * Split units[start, end) into passages of at most max units, breaking at
 * natural pauses (see groupAtoms).
 * @param {Unit[]} units
 * @param {number} start
 * @param {number} end
 * @param {number} max
 * @param {number} [min]
 * @returns {Span[]}
 */
export function splitBalanced(units, start, end, max, min = MIN_WORDS) {
  const atoms = [];
  for (let i = start; i < end; i++) atoms.push({ start: i, end: i + 1 });
  return groupAtoms(units, atoms, max, min);
}

/**
 * @param {Unit[]} units
 * @param {Span} a
 * @param {Span} b  the span right after a
 */
function sameParagraph(units, a, b) {
  return units[a.end - 1].para === units[b.start].para;
}

/**
 * Merge spans shorter than min into a neighbour in the same paragraph, when
 * the result fits in max. The smaller neighbour is preferred.
 * @param {Unit[]} units
 * @param {Span[]} spans
 * @param {number} max
 * @param {number} min
 */
function mergeFragments(units, spans, max, min) {
  const out = spans.map((s) => ({ ...s }));
  for (let i = 0; i < out.length; ) {
    const cur = out[i];
    const size = cur.end - cur.start;
    if (size >= min) {
      i++;
      continue;
    }
    const prev = out[i - 1];
    const next = out[i + 1];
    const canPrev = prev && sameParagraph(units, prev, cur) && cur.end - prev.start <= max;
    const canNext = next && sameParagraph(units, cur, next) && next.end - cur.start <= max;
    let into = null;
    if (canPrev && canNext) into = prev.end - prev.start <= next.end - next.start ? 'prev' : 'next';
    else if (canPrev) into = 'prev';
    else if (canNext) into = 'next';
    if (into === 'prev') {
      prev.end = cur.end;
      out.splice(i, 1);
      i = Math.max(0, i - 1);
    } else if (into === 'next') {
      next.start = cur.start;
      out.splice(i, 1);
    } else {
      i++;
    }
  }
  return out;
}

/**
 * Suggest how to split a text: by lines for verse (several short lines),
 * otherwise by sentences.
 * @param {Unit[]} units
 * @returns {ChunkMode}
 */
export function suggestChunkMode(units) {
  const lines = new Map();
  for (const u of units) {
    const k = `${u.para}:${u.line}`;
    lines.set(k, (lines.get(k) || 0) + 1);
  }
  if (lines.size < 3) return 'sentence';
  const avg = units.length / lines.size;
  return avg <= 10 ? 'line' : 'sentence';
}

/**
 * The bridge between passage p and passage p + 1: the last `size` words of
 * one and the first `size` words of the next.
 * @param {Span[]} passages
 * @param {number} p
 * @param {number} [size]
 * @returns {Span|null}
 */
export function bridgeSpan(passages, p, size = 2) {
  const a = passages[p];
  const b = passages[p + 1];
  if (!a || !b) return null;
  const left = Math.min(size, a.end - a.start);
  const right = Math.min(size, b.end - b.start);
  return { start: a.end - left, end: b.start + right };
}
