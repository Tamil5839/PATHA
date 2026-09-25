// Spaced repetition per passage, using the SM-2 algorithm
// (P. A. Wozniak, 1990), as in its widely used form:
//
//   if q ≥ 3:  interval = 1, then 6, then round(interval × EF); reps += 1
//   else:      reps = 0; interval = 1
//   EF = max(1.3, EF + 0.1 − (5 − q) × (0.08 + (5 − q) × 0.02))
//
// q is the quality of a recall round, 0..5, derived from its accuracy.
// Days are whole local calendar days, so a review is due "today" regardless
// of the time it was last done.
//
// Two rules adapt SM-2 to free practice:
//   * Practising a passage before it is due never pushes its review further
//     out; but a failed early round brings the next review forward to
//     tomorrow, like any failure.
//   * As SM-2 recommends, a passage scoring below 4 is offered again the same
//     day until it scores at least 4.

/** @typedef {import('./memory.js').RoundSummary} RoundSummary */

/**
 * @typedef {Object} Schedule
 * @property {number} reps      successful reviews in a row
 * @property {number} interval  days until the next review
 * @property {number} ef        easiness factor (≥ 1.3)
 * @property {number} due       day number of the next review
 * @property {number|null} last day number of the last counted review
 * @property {number} lastQ     best quality reached on the last review day
 */

export const DAY_MS = 86_400_000;
export const INITIAL_EF = 2.5;
export const MIN_EF = 1.3;

/**
 * Local calendar day number (days since 1970-01-01 in local time).
 * @param {number} [ms]
 */
export function dayNumber(ms = Date.now()) {
  const offset = new Date(ms).getTimezoneOffset() * 60_000;
  return Math.floor((ms - offset) / DAY_MS);
}

/**
 * Quality 0..5 of a round from its summary.
 * 5 perfect · 4 ≥ 90% with no misses · 3 ≥ 75% · 2 ≥ 50% · 1 ≥ 25% · 0 below
 * @param {Pick<RoundSummary, 'accuracy'|'perfect'|'missed'>} summary
 */
export function qualityOf(summary) {
  const a = summary.accuracy;
  if (summary.perfect) return 5;
  if (a >= 0.9 && summary.missed === 0) return 4;
  if (a >= 0.75) return 3;
  if (a >= 0.5) return 2;
  if (a >= 0.25) return 1;
  return 0;
}

/**
 * One SM-2 step.
 * @param {{ reps: number, interval: number, ef: number }} state
 * @param {number} q  0..5
 * @returns {{ reps: number, interval: number, ef: number }}
 */
export function sm2({ reps, interval, ef }, q) {
  let nextReps;
  let nextInterval;
  if (q >= 3) {
    if (reps === 0) nextInterval = 1;
    else if (reps === 1) nextInterval = 6;
    else nextInterval = Math.round(interval * ef);
    nextReps = reps + 1;
  } else {
    nextReps = 0;
    nextInterval = 1;
  }
  const d = 5 - q;
  const nextEf = Math.max(MIN_EF, Math.round((ef + (0.1 - d * (0.08 + d * 0.02))) * 1000) / 1000);
  return { reps: nextReps, interval: nextInterval, ef: nextEf };
}

/**
 * @param {number} today
 * @returns {Schedule}
 */
export function newSchedule(today) {
  return { reps: 0, interval: 0, ef: INITIAL_EF, due: today, last: null, lastQ: 0 };
}

/**
 * Update a passage's schedule after a complete recall round.
 * @param {Schedule|null|undefined} schedule
 * @param {number} q      quality 0..5
 * @param {number} today  day number
 * @returns {Schedule}
 */
export function review(schedule, q, today) {
  const cur = schedule ?? newSchedule(today);
  const early = cur.last !== null && today < cur.due;
  if (early && q >= 3) {
    return cur.last === today ? { ...cur, lastQ: Math.max(cur.lastQ, q) } : cur;
  }
  const next = sm2(cur, q);
  return { ...next, due: today + next.interval, last: today, lastQ: q };
}

/**
 * @param {Schedule|null|undefined} schedule
 * @param {number} today
 */
export function isDue(schedule, today) {
  return Boolean(schedule) && /** @type {Schedule} */ (schedule).due <= today;
}

/**
 * Reviewed today but scored below 4: SM-2 asks for another pass today.
 * @param {Schedule|null|undefined} schedule
 * @param {number} today
 */
export function needsAnotherPass(schedule, today) {
  return Boolean(schedule) && schedule.last === today && schedule.lastQ < 4;
}

/**
 * Days overdue (0 when due today, negative when not yet due).
 * @param {Schedule} schedule
 * @param {number} today
 */
export function overdueBy(schedule, today) {
  return today - schedule.due;
}
