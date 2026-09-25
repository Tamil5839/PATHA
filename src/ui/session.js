// A practice session: the pattern being recited and the answers so far.

import { buildPattern, tokenize, range } from '../core/patterns.js';
import { recordRound, getPassage } from '../core/progress.js';
import { dayNumber } from '../core/scheduler.js';
import { drillPatterns } from '../core/drills.js';
import * as store from './store.js';

/** @typedef {import('../core/textModel.js').Text} Text */
/** @typedef {import('../core/patterns.js').LevelId} LevelId */
/** @typedef {import('../core/patterns.js').Token} Token */
/** @typedef {{ start: number, end: number }} Span */

/**
 * @typedef {Object} Session
 * @property {'passage'|'bridge'|'drill'|'final'} kind
 * @property {Text} text
 * @property {Span|null} span
 * @property {LevelId} level
 * @property {number[][][]} steps
 * @property {Token[]} tokens
 * @property {(number|null)[]} scores     per token: 1, 0.5, 0, or null (not yet)
 * @property {number[]} wrong             wrong attempts per token
 * @property {Span[]} windows             drill windows (drill sessions)
 */

/**
 * @param {{ text: Text, kind: Session['kind'], span?: Span|null, level: LevelId, windows?: Span[] }} spec
 * @returns {Session}
 */
export function createSession({ text, kind, span = null, level, windows = [] }) {
  /** @type {number[][][]} */
  let steps;
  if (kind === 'drill') {
    steps = drillPatterns(windows, level === 'jata' ? 'jata' : 'ghana').flatMap((d) => d.pattern);
  } else if (kind === 'final') {
    steps = buildPattern('samhita', range(0, text.units.length));
  } else {
    const s = /** @type {Span} */ (span);
    steps = buildPattern(level, range(s.start, s.end));
  }
  const tokens = tokenize(steps);
  return {
    kind,
    text,
    span,
    level,
    steps,
    tokens,
    scores: new Array(tokens.length).fill(null),
    wrong: new Array(tokens.length).fill(0),
    windows,
  };
}

/** Index of the first unanswered token, or tokens.length when done. */
export function cursor(/** @type {Session} */ session) {
  const k = session.scores.indexOf(null);
  return k === -1 ? session.tokens.length : k;
}

/**
 * Save a finished (or abandoned) round to the text's progress.
 * @param {Session} session
 */
export function commitSession(session) {
  const progress = store.getProgress(session.text.id);
  const now = Date.now();
  const outcome = recordRound(progress, {
    kind: session.kind,
    span: session.span ?? undefined,
    level: session.level,
    tokens: session.tokens,
    scores: session.scores,
    now,
    today: dayNumber(now),
  });
  store.saveProgress(progress);
  const rec = session.kind === 'passage' && session.span ? getPassage(progress, session.span) : null;
  return { outcome, rec };
}
