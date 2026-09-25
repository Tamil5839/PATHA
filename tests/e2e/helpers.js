import { expect } from '@playwright/test';
import { createText } from '../../src/core/textModel.js';
import { buildPattern, tokenize, range } from '../../src/core/patterns.js';
import { sampleById } from '../../src/core/samples.js';

/** Open the app and wait until it has loaded its data. */
export async function openApp(page, hash = '#/') {
  await page.goto(`./${hash}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

/**
 * Add a sample text through the UI; returns its id.
 * @param {import('@playwright/test').Page} page
 * @param {string} sampleId
 */
export async function addSample(page, sampleId) {
  await openApp(page, `#/add?sample=${sampleId}`);
  await page.getByRole('button', { name: 'Save text' }).click();
  await page.waitForURL(/#\/text\//);
  return decodeURIComponent(page.url().split('#/text/')[1]);
}

/**
 * The same text model the app builds for a sample, computed in Node.
 * @param {string} sampleId
 */
export function sampleModel(sampleId) {
  const s = sampleById(sampleId);
  if (!s) throw new Error(`no sample ${sampleId}`);
  return createText({ raw: s.text, lang: s.lang, unitMode: s.unitMode, chunk: { mode: s.chunkMode, maxWords: 12 } });
}

/**
 * The first letter of every word recited in a pattern, in order.
 * @param {string} sampleId
 * @param {'samhita'|'pada'|'krama'|'jata'|'ghana'} level
 * @param {number} passage
 */
export function firstLetters(sampleId, level, passage) {
  const model = sampleModel(sampleId);
  const span = model.passages[passage];
  return tokenize(buildPattern(level, range(span.start, span.end))).map((t) => [...model.units[t.item].core][0]);
}

/**
 * Type answers one key at a time.
 * @param {import('@playwright/test').Page} page
 * @param {string[]} letters
 */
export async function typeLetters(page, letters) {
  const input = page.locator('.letter-input');
  await expect(input).toBeFocused();
  for (const l of letters) await page.keyboard.type(l);
}

/** Wait for pending storage writes (before a reload). */
export async function flush(page) {
  await page.evaluate(() => /** @type {any} */ (window).__patha.flush());
}
