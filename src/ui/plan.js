// Choosing what to practise next.

import { passageStates, reviewLevel, bridgesNeedingWork } from '../core/progress.js';
import { weakLinksIn } from '../core/memory.js';
import { link } from './router.js';

/** @typedef {import('../core/textModel.js').Text} Text */
/** @typedef {import('../core/progress.js').Progress} Progress */

/**
 * The most useful next practice for a text:
 *  1. passages due for review (most overdue, then most weak links)
 *  2. passages SM-2 asks to repeat today
 *  3. passages part-way up the ladder
 *  4. the first new passage (starting with Watch)
 *  5. bridges between practised passages
 *  6. otherwise the weakest unwoven passage at ghana
 * @param {Text} text
 * @param {Progress} progress
 * @param {number} today
 * @returns {{ href: string, label: string, reason: string }}
 */
export function nextPractice(text, progress, today) {
  const states = passageStates(progress, text.passages, today);
  const to = (/** @type {number} */ p, /** @type {string} */ level, /** @type {string} */ mode) => link(['practice', text.id, p], { level, mode });

  const due = states.filter((s) => s.due).sort((a, b) => b.overdue - a.overdue || b.weak - a.weak || a.index - b.index)[0];
  if (due) return { href: to(due.index, reviewLevel(due.rec), 'recall'), label: `Review passage ${due.index + 1}`, reason: 'due' };

  const again = states.find((s) => s.again);
  if (again) return { href: to(again.index, reviewLevel(again.rec), 'recall'), label: `Repeat passage ${again.index + 1}`, reason: 'again' };

  const climbing = states.find((s) => s.stage === 'learning' && s.next !== 'ghana');
  if (climbing) return { href: to(climbing.index, climbing.next, 'recall'), label: `Continue passage ${climbing.index + 1}`, reason: 'learning' };

  const fresh = states.find((s) => s.stage === 'new');
  if (fresh) return { href: to(fresh.index, 'samhita', 'watch'), label: `Start passage ${fresh.index + 1}`, reason: 'new' };

  const bridges = bridgesNeedingWork(progress, text.passages);
  if (bridges.length) return { href: link(['practice', text.id, `b${bridges[0]}`], { level: 'jata', mode: 'recall' }), label: `Join passages ${bridges[0] + 1} and ${bridges[0] + 2}`, reason: 'bridge' };

  const unwoven = states.filter((s) => s.stage !== 'woven').sort((a, b) => b.weak - a.weak || a.index - b.index)[0];
  if (unwoven) return { href: to(unwoven.index, 'ghana', 'recall'), label: `Weave passage ${unwoven.index + 1}`, reason: 'weave' };

  return { href: link(['final', text.id]), label: 'Take the final test', reason: 'final' };
}

/**
 * Weak or shaky practised links anywhere in a text.
 * @param {Text} text
 * @param {Progress} progress
 */
export function weakLinkCount(text, progress) {
  return weakLinksIn(progress, 0, text.units.length).length;
}
