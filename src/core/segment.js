// Splitting text into memorisable units (words, characters or phrases).
//
// Punctuation stays attached to the units for display ("Liberty,") but is
// kept apart from the unit's core ("Liberty"), which is what recall checks.

/** @typedef {'word'|'char'|'phrase'} UnitMode */
export const UNIT_MODES = /** @type {UnitMode[]} */ (['word', 'char', 'phrase']);

/**
 * @typedef {Object} Unit
 * @property {string} pre   punctuation before the word, e.g. an opening quote
 * @property {string} core  the word itself
 * @property {string} post  punctuation after the word, e.g. "," or ".”"
 * @property {boolean} sp   whitespace followed the unit in the original text
 * @property {number} line  0-based line number
 * @property {number} para  0-based paragraph (stanza) number
 * @property {number} sent  0-based sentence number
 * @property {number} brk   pause after the unit: 0 none, 1 comma, 2 clause or
 *                          line end, 3 sentence end, 4 paragraph or text end
 */

/** @typedef {{ s: string, at: number, kind: 'word'|'space'|'punct' }} Piece */

// Characters that join two words into one unit when written without spaces
// ("well-known", "भाषा-ज्ञान"). Apostrophes inside words are normally kept
// by the word segmenter already; they are listed for the regex fallback.
const JOINERS = new Set(['-', '‐', '‑', "'", '’']);
// Punctuation that does not break a phrase in phrase mode.
const PHRASE_INNER = /^[-'‐‑’·・]$/u;
const SENTENCE_END = /[.!?।॥。！？؟…۔]/u;
const CLAUSE_END = /[;:—–؛；：]|--/u;
const COMMA = /[,،、，]/u;

/**
 * Normalise pasted text: NFC, Unix newlines, no trailing spaces, at most one
 * blank line between paragraphs, no leading or trailing blank space.
 * @param {string} raw
 */
export function normalizeText(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v  -   ]/g, ' ')
    .replace(/[ ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}

function hasSegmenter() {
  return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
}

/** @param {string} s */
function classify(s) {
  if (/^\s+$/u.test(s)) return 'space';
  if (/[\p{L}\p{N}]/u.test(s)) return 'word';
  return 'punct';
}

/**
 * @param {string} text
 * @param {string} lang
 * @returns {Piece[]}
 */
function wordPieces(text, lang) {
  if (hasSegmenter()) {
    try {
      const seg = new Intl.Segmenter(lang || undefined, { granularity: 'word' });
      return Array.from(seg.segment(text), (x) => ({
        s: x.segment,
        at: x.index,
        kind: /** @type {Piece['kind']} */ (x.isWordLike ? 'word' : classify(x.segment)),
      }));
    } catch {
      // fall through to the regex splitter
    }
  }
  /** @type {Piece[]} */
  const out = [];
  const re = /(\s+)|([\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*)|([^\s\p{L}\p{M}\p{N}])/gu;
  let m;
  while ((m = re.exec(text))) {
    out.push({ s: m[0], at: m.index, kind: m[1] ? 'space' : m[2] ? 'word' : 'punct' });
  }
  return out;
}

/**
 * Grapheme clusters ("user-perceived characters").
 * @param {string} text
 * @param {string} [lang]
 * @returns {{ s: string, at: number }[]}
 */
export function graphemes(text, lang) {
  if (hasSegmenter()) {
    try {
      const seg = new Intl.Segmenter(lang || undefined, { granularity: 'grapheme' });
      return Array.from(seg.segment(text), (x) => ({ s: x.segment, at: x.index }));
    } catch {
      // fall through
    }
  }
  const out = [];
  const re = /\P{M}\p{M}*|\p{M}+/gu;
  let m;
  while ((m = re.exec(text))) out.push({ s: m[0], at: m.index });
  return out;
}

/** @param {string} text @param {string} lang @returns {Piece[]} */
function charPieces(text, lang) {
  return graphemes(text, lang).map((g) => ({ ...g, kind: /** @type {Piece['kind']} */ (classify(g.s)) }));
}

/** @param {string} text @param {string} lang @returns {Piece[]} */
function phrasePieces(text, lang) {
  /** @type {Piece[]} */
  const out = [];
  /** @type {Piece|null} */
  let run = null;
  for (const g of graphemes(text, lang)) {
    const kind = classify(g.s);
    const inner = kind === 'punct' && !/\p{P}/u.test(g.s); // symbols stay inside phrases
    const joiner = kind === 'punct' && PHRASE_INNER.test(g.s) && run !== null;
    if (kind === 'word' || inner || joiner) {
      if (run) run.s += g.s;
      else run = { s: g.s, at: g.at, kind: 'word' };
    } else {
      if (run) out.push(run);
      run = null;
      out.push({ s: g.s, at: g.at, kind });
    }
  }
  if (run) out.push(run);
  // A phrase ending in a joiner ("well-") gives the joiner back as punctuation.
  return out.flatMap((p) => {
    const last = p.s.slice(-1);
    if (p.kind === 'word' && p.s.length > 1 && PHRASE_INNER.test(last)) {
      return [
        { s: p.s.slice(0, -1), at: p.at, kind: /** @type {const} */ ('word') },
        { s: last, at: p.at + p.s.length - 1, kind: /** @type {const} */ ('punct') },
      ];
    }
    return [p];
  });
}

/**
 * Merge runs of whitespace pieces (segmenters emit each line break alone).
 * @param {Piece[]} pieces
 * @returns {Piece[]}
 */
function mergeSpaces(pieces) {
  /** @type {Piece[]} */
  const out = [];
  for (const p of pieces) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === 'space' && p.kind === 'space') prev.s += p.s;
    else out.push({ ...p });
  }
  return out;
}

/**
 * Group pieces into units, attaching punctuation to neighbouring words.
 * @param {Piece[]} rawPieces
 * @param {boolean} mergeJoiners
 */
function group(rawPieces, mergeJoiners) {
  const pieces = mergeSpaces(rawPieces);
  /** @type {(Unit & { at: number })[]} */
  const units = [];
  let prefix = '';
  let prefixAt = -1;
  /** @type {(Unit & { at: number })|null} */
  let last = null;
  /** @type {Piece['kind']|null} */
  let prevKind = null;
  let line = 0;
  let para = 0;

  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.kind === 'space') {
      const newlines = (p.s.match(/\n/g) || []).length;
      if (last && !prefix) {
        last.sp = true;
        if (newlines >= 2) last.brk = Math.max(last.brk, 4);
        else if (newlines === 1) last.brk = Math.max(last.brk, 2);
      }
      if (prefix && newlines === 0) prefix += ' ';
      line += newlines;
      if (newlines >= 2) para += 1;
    } else if (p.kind === 'punct') {
      if (prefix && prevKind === 'punct') {
        prefix += p.s; // continuing a run of opening punctuation
      } else if (last && (prevKind === 'word' || prevKind === 'punct')) {
        last.post += p.s; // attached directly after a word
      } else {
        // After whitespace or at the start: it opens the next word if a word
        // follows directly (after any further marks), or if it is an opening
        // bracket or quote; otherwise it is a standalone mark, like a spaced
        // dash, and closes the previous word.
        let j = i + 1;
        while (pieces[j] && pieces[j].kind === 'punct') j++;
        const opensWord = Boolean(pieces[j] && pieces[j].kind === 'word');
        const opening = /^[\p{Ps}\p{Pi}]+$/u.test(p.s);
        if (!last || opensWord || opening) {
          if (!prefix) prefixAt = p.at;
          prefix += p.s;
        } else {
          last.post += ` ${p.s}`;
        }
      }
    } else {
      const joinable =
        mergeJoiners && last && prevKind === 'punct' && !prefix && JOINERS.has(last.post);
      if (joinable && last) {
        last.core += last.post + p.s;
        last.post = '';
      } else {
        last = {
          pre: prefix,
          core: p.s,
          post: '',
          sp: false,
          line,
          para,
          sent: 0,
          brk: 0,
          at: prefix ? prefixAt : p.at,
        };
        units.push(last);
        prefix = '';
        prefixAt = -1;
      }
    }
    prevKind = p.kind;
  }
  if (prefix && last) last.post += ` ${prefix.trim()}`; // stray trailing marks
  return units;
}

/**
 * Sentence start offsets. Single line breaks are treated as spaces so that a
 * sentence may run across the lines of a poem; blank lines still separate.
 * @param {string} text
 * @param {string} lang
 * @returns {number[]}
 */
function sentenceStarts(text, lang) {
  const flat = text.replace(/([^\n])\n(?!\n)/g, '$1 ');
  if (hasSegmenter()) {
    try {
      const seg = new Intl.Segmenter(lang || undefined, { granularity: 'sentence' });
      return Array.from(seg.segment(flat), (x) => x.index);
    } catch {
      // fall through
    }
  }
  const starts = [0];
  const re = /[.!?।॥。！？؟]+["'”’)\]]*\s+|\n\n+/gu;
  let m;
  while ((m = re.exec(flat))) {
    const end = m.index + m[0].length;
    if (end < flat.length) starts.push(end);
  }
  return starts;
}

/**
 * Split text into units.
 * @param {string} text   normalised text (see normalizeText)
 * @param {{ lang?: string, mode?: UnitMode }} [options]
 * @returns {Unit[]}
 */
export function segmentText(text, { lang = 'en', mode = 'word' } = {}) {
  const src = normalizeText(text);
  if (!src) return [];
  const pieces =
    mode === 'char' ? charPieces(src, lang) : mode === 'phrase' ? phrasePieces(src, lang) : wordPieces(src, lang);
  const units = group(pieces, mode === 'word');

  const starts = sentenceStarts(src, lang);
  let s = 0;
  for (const u of units) {
    while (s + 1 < starts.length && starts[s + 1] <= u.at) s++;
    u.sent = s;
  }
  // Renumber sentences so that they count only sentences containing units.
  let prev = -1;
  let n = -1;
  for (const u of units) {
    if (u.sent !== prev) {
      prev = u.sent;
      n++;
    }
    u.sent = n;
  }

  units.forEach((u, i) => {
    let brk = u.brk;
    if (SENTENCE_END.test(u.post)) brk = Math.max(brk, 3);
    else if (CLAUSE_END.test(u.post)) brk = Math.max(brk, 2);
    else if (COMMA.test(u.post)) brk = Math.max(brk, 1);
    const nextUnit = units[i + 1];
    if (nextUnit && nextUnit.sent !== u.sent) brk = Math.max(brk, 3);
    if (!nextUnit) brk = 4;
    u.brk = brk;
  });

  return units.map(({ at, ...u }) => u);
}

/**
 * Display text of a unit, with its punctuation.
 * @param {Pick<Unit, 'pre'|'core'|'post'>} u
 */
export function unitText(u) {
  return u.pre + u.core + u.post;
}

/**
 * Reassemble units as continuous text, keeping line and paragraph breaks.
 * @param {Unit[]} units
 * @param {string} joiner  separator where the original had whitespace
 */
export function joinUnits(units, joiner = ' ') {
  let out = '';
  units.forEach((u, i) => {
    out += unitText(u);
    const next = units[i + 1];
    if (!next) return;
    if (next.para !== u.para) out += '\n\n';
    else if (next.line !== u.line) out += '\n';
    else if (u.sp) out += joiner || ' ';
  });
  return out;
}

/**
 * Choose the separator used between units when words are shown out of their
 * original order (e.g. "ba" in jaṭā). Texts written without spaces (Chinese,
 * Japanese, Thai) and character units use no separator.
 * @param {Unit[]} units
 * @param {UnitMode} mode
 */
export function chooseJoiner(units, mode) {
  if (mode === 'char') return '';
  if (mode === 'phrase') return ' ';
  let spaced = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < units.length; i++) {
    if (units[i].line !== units[i + 1].line) continue;
    pairs++;
    if (units[i].sp) spaced++;
  }
  if (pairs === 0) return ' ';
  return spaced / pairs >= 0.5 ? ' ' : '';
}

/**
 * Suggest a unit mode for a text: phrases for Chinese/Japanese text that has
 * phrase breaks, characters when it has none, words otherwise.
 * @param {string} text
 * @param {string} lang
 * @returns {UnitMode}
 */
export function suggestUnitMode(text, lang) {
  const base = String(lang).split('-')[0];
  if (base !== 'zh' && base !== 'ja') return 'word';
  const phrases = segmentText(text, { lang, mode: 'phrase' });
  if (phrases.length >= 2) {
    const avg = phrases.reduce((n, u) => n + [...u.core].length, 0) / phrases.length;
    if (avg <= 12) return 'phrase';
  }
  return 'char';
}
