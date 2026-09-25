import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sm2,
  review,
  isDue,
  needsAnotherPass,
  qualityOf,
  dayNumber,
  newSchedule,
  overdueBy,
  INITIAL_EF,
  MIN_EF,
  DAY_MS,
} from '../../src/core/scheduler.js';

describe('SM-2', () => {
  test('intervals grow on success: 1, 6, then × EF', () => {
    let s = { reps: 0, interval: 0, ef: INITIAL_EF };
    const intervals = [];
    for (let i = 0; i < 4; i++) {
      s = sm2(s, 5);
      intervals.push(s.interval);
    }
    assert.deepEqual(intervals, [1, 6, 16, 45]);
    assert.equal(s.ef, 2.9);
    assert.equal(s.reps, 4);
  });

  test('intervals shrink on failure and repetitions restart', () => {
    const before = { reps: 4, interval: 45, ef: 2.9 };
    const after = sm2(before, 2);
    assert.equal(after.interval, 1);
    assert.equal(after.reps, 0);
    assert.ok(after.interval < before.interval);
    assert.equal(after.ef, 2.58);
    // relearning then grows again
    assert.equal(sm2(after, 4).interval, 1);
    assert.equal(sm2(sm2(after, 4), 4).interval, 6);
  });

  test('easiness factor never drops below 1.3', () => {
    let s = { reps: 0, interval: 0, ef: INITIAL_EF };
    for (let i = 0; i < 5; i++) s = sm2(s, 0);
    assert.equal(s.ef, MIN_EF);
  });

  test('quality 3 keeps the interval growing but lowers EF', () => {
    const s = sm2({ reps: 2, interval: 6, ef: 2.5 }, 3);
    assert.equal(s.interval, 15);
    assert.equal(s.ef, 2.36);
  });
});

describe('passage schedules', () => {
  const D = 20000;

  test('a new passage is due the day after its first good round', () => {
    const s = review(null, 5, D);
    assert.deepEqual(s, { reps: 1, interval: 1, ef: 2.6, due: D + 1, last: D, lastQ: 5 });
    assert.equal(isDue(s, D), false);
    assert.equal(isDue(s, D + 1), true);
    assert.equal(overdueBy(s, D + 3), 2);
  });

  test('reviews on the due day follow SM-2', () => {
    let s = review(null, 5, D);
    s = review(s, 5, s.due);
    assert.equal(s.interval, 6);
    assert.equal(s.due, D + 1 + 6);
    s = review(s, 1, s.due);
    assert.equal(s.interval, 1);
    assert.equal(s.due, D + 7 + 1);
  });

  test('practising early never pushes the review further out', () => {
    const s = review(review(null, 5, D), 5, D + 1); // due on D + 7
    const early = review(s, 5, D + 3);
    assert.deepEqual(early, s);
  });

  test('a failed early round brings the review forward to tomorrow', () => {
    const s = review(review(null, 5, D), 5, D + 1); // due on D + 7
    const failed = review(s, 1, D + 3);
    assert.equal(failed.due, D + 4);
    assert.equal(failed.reps, 0);
  });

  test('a round below quality 4 asks for another pass the same day', () => {
    const s = review(null, 3, D);
    assert.equal(needsAnotherPass(s, D), true);
    const again = review(s, 5, D);
    assert.equal(needsAnotherPass(again, D), false);
    assert.equal(again.due, s.due, 'the extra pass does not reschedule');
    assert.equal(needsAnotherPass(s, D + 1), false);
    assert.equal(needsAnotherPass(null, D), false);
  });

  test('new schedules and due checks', () => {
    assert.equal(isDue(null, D), false);
    assert.deepEqual(newSchedule(D), { reps: 0, interval: 0, ef: 2.5, due: D, last: null, lastQ: 0 });
  });
});

describe('quality and days', () => {
  test('quality from round accuracy', () => {
    assert.equal(qualityOf({ accuracy: 1, perfect: true, missed: 0 }), 5);
    assert.equal(qualityOf({ accuracy: 0.95, perfect: false, missed: 0 }), 4);
    assert.equal(qualityOf({ accuracy: 0.95, perfect: false, missed: 1 }), 3);
    assert.equal(qualityOf({ accuracy: 0.8, perfect: false, missed: 2 }), 3);
    assert.equal(qualityOf({ accuracy: 0.6, perfect: false, missed: 3 }), 2);
    assert.equal(qualityOf({ accuracy: 0.3, perfect: false, missed: 5 }), 1);
    assert.equal(qualityOf({ accuracy: 0.1, perfect: false, missed: 9 }), 0);
  });

  test('day numbers are whole local days', () => {
    const noon = new Date(2026, 8, 25, 12, 0, 0).getTime();
    const morning = new Date(2026, 8, 25, 0, 5, 0).getTime();
    const night = new Date(2026, 8, 25, 23, 55, 0).getTime();
    const tomorrow = new Date(2026, 8, 26, 0, 5, 0).getTime();
    assert.equal(dayNumber(morning), dayNumber(noon));
    assert.equal(dayNumber(night), dayNumber(noon));
    assert.equal(dayNumber(tomorrow), dayNumber(noon) + 1);
    assert.equal(dayNumber(noon + 7 * DAY_MS), dayNumber(noon) + 7);
  });
});
