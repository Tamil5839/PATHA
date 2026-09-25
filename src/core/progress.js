// Progress of one text: word/link memory, the level ladder of each passage,
// spaced-repetition schedules, bridge practice and final tests.

import { LEVELS, LEVEL_IDS } from './patterns.js';
import { applyRoundResults, roundResults, summarize, weakLinksIn, linkStrength, STRONG } from './memory.js';
import { review, qualityOf, isDue, needsAnotherPass } from './scheduler.js';

/** @typedef {import('./patterns.js').LevelId} LevelId */
/** @typedef {import('./patterns.js').Token} Token */
/** @typedef {import('./memory.js').RoundSummary} RoundSummary */
/** @typedef {import('./memory.js').RoundResults} RoundResults */
/** @typedef {import('./scheduler.js').Schedule} Schedule */
/** @typedef {{ start: number, end: number }} Span */

/**
 * @typedef {Object} PassageRecord
 * @property {Partial<Record<LevelId, number>>} cleared  day each level was first cleared
 * @property {number[]} perfectGhanaDays  days with a perfect ghana round
 * @property {Schedule|null} sr           spaced-repetition schedule
 * @property {number} rounds              recall rounds completed
 * @property {number} lastAt              last practice (ms)
 * @property {{ day: number, level: LevelId, acc: number }[]} history  recent rounds
 */

/**
 * @typedef {Object} Progress
 * @property {string} textId
 * @property {Record<string, import('./memory.js').LinkEntry>} links
 * @property {Record<string, import('./memory.js').Stat>} words
 * @property {Record<string, PassageRecord>} passages  keyed by "start-end"
 * @property {Record<string, { rounds: number, lastAt: number }>} bridges  keyed by "start-end"
 * @property {{ at: number, day: number, accuracy: number, missed: number[] }[]} finals
 * @property {number} updatedAt
 */

const HISTORY_LIMIT = 20;
const FINALS_LIMIT = 20;

/**
 * @param {string} textId
 * @returns {Progress}
 */
export function emptyProgress(textId) {
  return { textId, links: {}, words: {}, passages: {}, bridges: {}, finals: [], updatedAt: 0 };
}

/** @param {Span} span */
export function spanKey(span) {
  return `${span.start}-${span.end}`;
}

/** @returns {PassageRecord} */
function emptyPassage() {
  return { cleared: {}, perfectGhanaDays: [], sr: null, rounds: 0, lastAt: 0, history: [] };
}

/**
 * The passage record, if any (does not create one).
 * @param {Progress} progress
 * @param {Span} span
 * @returns {PassageRecord|null}
 */
export function getPassage(progress, span) {
  return progress.passages[spanKey(span)] ?? null;
}

/**
 * A passage is cleared at a level by a complete round with no missed words
 * and at least 90% accuracy.
 * @param {RoundSummary} summary
 */
export function clearsLevel(summary) {
  return summary.complete && summary.missed === 0 && summary.accuracy >= 0.9;
}

/**
 * A passage is woven once ghana has been recited with no errors on two
 * different days.
 * @param {PassageRecord|null|undefined} rec
 */
export function isWoven(rec) {
  return (rec?.perfectGhanaDays?.length ?? 0) >= 2;
}

/**
 * Rank (1..5) of the highest level cleared, 0 if none.
 * @param {PassageRecord|null|undefined} rec
 */
export function highestCleared(rec) {
  if (!rec) return 0;
  let best = 0;
  for (const level of LEVELS) if (rec.cleared[level.id] != null) best = Math.max(best, level.rank);
  return best;
}

/**
 * The level to practise next: the one after the highest cleared, or ghana.
 * @param {PassageRecord|null|undefined} rec
 * @returns {LevelId}
 */
export function recommendedLevel(rec) {
  const rank = highestCleared(rec);
  return LEVEL_IDS[Math.min(rank, LEVEL_IDS.length - 1)];
}

/**
 * Level for a scheduled review: the highest level cleared so far (at least
 * saṃhitā).
 * @param {PassageRecord|null|undefined} rec
 * @returns {LevelId}
 */
export function reviewLevel(rec) {
  const rank = highestCleared(rec);
  return LEVEL_IDS[Math.max(0, rank - 1)];
}

/**
 * @typedef {Object} RoundOutcome
 * @property {RoundSummary} summary
 * @property {RoundResults} results
 * @property {number} quality        0..5
 * @property {boolean} cleared       this round cleared its level
 * @property {boolean} newlyCleared  first time this level was cleared
 * @property {boolean} woven
 * @property {boolean} newlyWoven
 */

/**
 * Record a recall round. Link and word strengths are updated for every
 * answered word; the ladder and schedule only for complete passage rounds.
 * @param {Progress} progress  mutated
 * @param {{
 *   kind: 'passage'|'bridge'|'drill'|'final',
 *   span?: Span,
 *   level?: LevelId,
 *   tokens: Token[],
 *   scores: (number|null)[],
 *   now: number,
 *   today: number,
 * }} round
 * @returns {RoundOutcome}
 */
export function recordRound(progress, round) {
  const { kind, span, level, tokens, scores, now, today } = round;
  const summary = summarize(scores);
  const results = roundResults(tokens, scores);
  applyRoundResults(progress, results, now);
  progress.updatedAt = now;

  const quality = qualityOf(summary);
  /** @type {RoundOutcome} */
  const outcome = {
    summary,
    results,
    quality,
    cleared: false,
    newlyCleared: false,
    woven: false,
    newlyWoven: false,
  };

  if (kind === 'passage' && span && level) {
    const key = spanKey(span);
    const rec = (progress.passages[key] ??= emptyPassage());
    const wasWoven = isWoven(rec);
    rec.lastAt = now;
    if (summary.complete) {
      rec.rounds += 1;
      rec.history.push({ day: today, level, acc: Math.round(summary.accuracy * 1000) / 1000 });
      if (rec.history.length > HISTORY_LIMIT) rec.history.splice(0, rec.history.length - HISTORY_LIMIT);
      outcome.cleared = clearsLevel(summary);
      if (outcome.cleared && rec.cleared[level] == null) {
        rec.cleared[level] = today;
        outcome.newlyCleared = true;
      }
      if (level === 'ghana' && summary.perfect && !rec.perfectGhanaDays.includes(today)) {
        rec.perfectGhanaDays.push(today);
      }
      rec.sr = review(rec.sr, quality, today);
    }
    outcome.woven = isWoven(rec);
    outcome.newlyWoven = outcome.woven && !wasWoven;
  } else if (kind === 'bridge' && span) {
    const key = spanKey(span);
    const rec = (progress.bridges[key] ??= { rounds: 0, lastAt: 0 });
    if (summary.complete) rec.rounds += 1;
    rec.lastAt = now;
  } else if (kind === 'final' && summary.answered > 0) {
    progress.finals.push({
      at: now,
      day: today,
      accuracy: Math.round(summary.accuracy * 1000) / 1000,
      missed: tokens.filter((_, k) => scores[k] === 0).map((t) => t.item),
    });
    if (progress.finals.length > FINALS_LIMIT) progress.finals.splice(0, progress.finals.length - FINALS_LIMIT);
  }
  return outcome;
}

/**
 * @typedef {Object} PassageState
 * @property {number} index
 * @property {Span} span
 * @property {PassageRecord|null} rec
 * @property {'new'|'learning'|'woven'} stage
 * @property {boolean} due
 * @property {boolean} again     SM-2: another pass today
 * @property {number} overdue    days overdue (0 = due today)
 * @property {number} weak       weak or shaky links inside the passage
 * @property {LevelId} next      recommended level
 */

/**
 * State of every passage of a text on a given day.
 * @param {Progress} progress
 * @param {Span[]} passages
 * @param {number} today
 * @returns {PassageState[]}
 */
export function passageStates(progress, passages, today) {
  return passages.map((span, index) => {
    const rec = getPassage(progress, span);
    const due = isDue(rec?.sr, today);
    return {
      index,
      span,
      rec,
      stage: isWoven(rec) ? 'woven' : rec && rec.rounds > 0 ? 'learning' : 'new',
      due,
      again: !due && needsAnotherPass(rec?.sr, today),
      overdue: rec?.sr ? today - rec.sr.due : 0,
      weak: weakLinksIn(progress, span.start, span.end).length,
      next: recommendedLevel(rec),
    };
  });
}

/**
 * Bridges that need practice: both neighbouring passages have been
 * practised, and the link across the boundary is unpractised or not strong.
 * @param {Progress} progress
 * @param {Span[]} passages
 * @returns {number[]} indices p of bridges between passage p and p + 1
 */
export function bridgesNeedingWork(progress, passages) {
  const out = [];
  for (let p = 0; p + 1 < passages.length; p++) {
    const a = getPassage(progress, passages[p]);
    const b = getPassage(progress, passages[p + 1]);
    if (!a?.rounds || !b?.rounds) continue;
    const s = linkStrength(progress, passages[p].end - 1);
    if (s == null || s < STRONG) out.push(p);
  }
  return out;
}
