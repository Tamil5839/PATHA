import { test, expect } from '@playwright/test';
import { openApp, addSample, firstLetters, typeLetters, sampleModel } from './helpers.js';

test.describe('practice: watch, recall, check', () => {
  test('watch draws the braid as the pattern plays', async ({ page }) => {
    const id = await addSample(page, 'mutanabbi');
    await page.goto(`./#/practice/${id}/0?level=jata&mode=watch`);
    const beads = page.locator('.braid .bead');
    await expect(beads).toHaveCount(8);
    await expect(page.locator('.braid .thread')).toHaveCount(0);
    await page.getByLabel('Tempo').fill('150');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.recitation .w.is-current')).toHaveCount(1);
    await expect.poll(() => page.locator('.braid .thread').count()).toBeGreaterThan(3);
    await page.getByRole('button', { name: 'Pause' }).click();
    // Jump to the last step and let it finish.
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Next step' }).click();
    await expect(page.locator('.step-counter')).toHaveText('Step 7 of 7');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByText('The weave is complete.')).toBeVisible({ timeout: 15_000 });
    // jaṭā on 8 words: 7 steps × (2 forward + 1 backward) link threads + turnaround loops
    expect(await page.locator('.braid .thread').count()).toBeGreaterThanOrEqual(21);
    await page.getByRole('button', { name: 'Now recall it' }).click();
    await expect(page.getByRole('tab', { name: 'Recall' })).toHaveAttribute('aria-selected', 'true');
  });

  test('watch respects reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const id = await addSample(page, 'nij-bhasha');
    await page.goto(`./#/practice/${id}/0?level=krama&mode=watch`);
    await page.getByLabel('Tempo').fill('150');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect.poll(() => page.locator('.braid .thread').count()).toBeGreaterThan(1);
    await expect(page.locator('.bead.is-pulse')).toHaveCount(0);
    const dash = await page.locator('.braid .thread-core').first().evaluate((el) => el.style.strokeDasharray);
    expect(dash).toBe('');
  });

  test('first letters reveal words; a slip is marked shaky; check colours the links', async ({ page }) => {
    const id = await addSample(page, 'gettysburg');
    await page.goto(`./#/practice/${id}/0?level=krama&mode=recall`);
    await expect(page.locator('.cue')).toContainText('From the beginning');
    const letters = firstLetters('gettysburg', 'krama', 0);
    // Answer the first two words, then slip once on the third.
    await typeLetters(page, letters.slice(0, 3));
    await expect(page.locator('.slot.is-revealed')).toHaveCount(3);
    await expect(page.locator('.slot.is-revealed').first()).toHaveText('Four');
    await page.keyboard.type('q');
    await expect(page.locator('.slot.is-current')).toHaveClass(/is-wrong/);
    await typeLetters(page, letters.slice(3));
    await expect(page.locator('.outcome')).toContainText('17 of 18 right first time · 1 unsure');
    await expect(page.locator('.outcome')).toContainText('You cleared Krama');
    await expect(page.locator('.braid .thread.is-shaky')).toHaveCount(1);
    await expect(page.locator('.braid .thread.is-strong')).toHaveCount(8);
    await page.getByText('Every link, in words').click();
    await expect(page.locator('.link-row.is-shaky')).toContainText('and');
    // the level ladder moved up and suggests jaṭā next
    await expect(page.getByRole('radio', { name: /Jaṭā/ })).toHaveClass(/is-suggested/);
  });

  test('two slips or Reveal mark a word as missed', async ({ page }) => {
    const id = await addSample(page, 'nij-bhasha');
    await page.goto(`./#/practice/${id}/0?level=samhita&mode=recall`);
    await page.keyboard.type('x');
    await page.keyboard.type('x');
    await expect(page.locator('.slot.is-miss')).toHaveCount(1);
    await page.getByRole('button', { name: 'Reveal word' }).click();
    await expect(page.locator('.slot.is-miss')).toHaveCount(2);
    await typeLetters(page, firstLetters('nij-bhasha', 'samhita', 0).slice(2));
    await expect(page.locator('.outcome')).toContainText('2 missed');
    await expect(page.locator('.outcome')).toContainText('To clear this level');
  });

  test('tap to reveal with self-grading, including marking one word', async ({ page }) => {
    const id = await addSample(page, 'basho');
    await page.goto(`./#/practice/${id}/0?level=jata&mode=recall`);
    await page.getByRole('radio', { name: 'Tap to reveal' }).click();
    await expect(page.getByRole('button', { name: /Reveal/ })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('.slot.is-shown')).toHaveCount(6);
    await page.locator('.slot.is-shown').nth(3).click(); // mark one word missed
    await page.getByRole('button', { name: /Got it/ }).click();
    await page.keyboard.press('Space');
    await page.keyboard.press('2'); // unsure
    await expect(page.locator('.outcome')).toContainText('1 missed');
    await expect(page.locator('.outcome')).toContainText('6 unsure');
    await expect(page.locator('.braid .thread.is-weak, .braid .thread.is-shaky').first()).toBeVisible();
  });

  test('the level picker, mode tabs and passage navigation work by keyboard', async ({ page }) => {
    const id = await addSample(page, 'hope');
    await page.goto(`./#/practice/${id}/0?level=krama&mode=watch`);
    const krama = page.getByRole('radio', { name: /Krama/ });
    await krama.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: /Jaṭā/ })).toBeFocused();
    await expect(page.getByRole('radio', { name: /Jaṭā/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page).toHaveURL(/level=jata/);
    const watchTab = page.getByRole('tab', { name: 'Watch' });
    await watchTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Recall' })).toBeFocused();
    await expect(page.locator('.letter-input')).toBeVisible();
    await page.getByRole('link', { name: 'Next passage' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Passage 2 of ${sampleModel('hope').passages.length}`);
  });

  test('a bridge joins one passage to the next', async ({ page }) => {
    const id = await addSample(page, 'nij-bhasha');
    for (const p of [0, 1]) {
      await page.goto(`./#/practice/${id}/${p}?level=samhita&mode=recall`);
      await typeLetters(page, firstLetters('nij-bhasha', 'samhita', p));
      await expect(page.locator('.outcome')).toBeVisible();
    }
    await page.goto(`./#/text/${id}`);
    await page.getByRole('link', { name: 'Practise bridge' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bridge: passages 1 → 2');
    const model = sampleModel('nij-bhasha');
    // jaṭā over the last two words of passage 1 and first two of passage 2
    const words = model.units.slice(6, 10).map((u) => [...u.core][0]);
    const jata = [0, 1, 1, 0, 0, 1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 2, 2, 3].map((i) => words[i]);
    await typeLetters(page, jata);
    await expect(page.locator('.outcome')).toBeVisible();
    await page.goto(`./#/text/${id}`);
    await expect(page.locator('.bridge-row')).toHaveAttribute('aria-label', /Strong join/);
  });

  test('weak-link drill builds mini patterns around weak links', async ({ page }) => {
    const id = await addSample(page, 'gettysburg');
    await page.goto(`./#/practice/${id}/0?level=krama&mode=recall`);
    const letters = firstLetters('gettysburg', 'krama', 0);
    // Miss the 4th recited word ("and", arriving from "score").
    await typeLetters(page, letters.slice(0, 3));
    await page.getByRole('button', { name: 'Reveal word' }).click();
    await typeLetters(page, letters.slice(4));
    await page.getByRole('link', { name: /Drill weak links/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Weak-link drill');
    await page.getByRole('radio', { name: /Jaṭā/ }).click();
    await page.getByRole('button', { name: 'Begin' }).click();
    // window: words 0..3 (Four score and seven) around link 1 (score → and)
    await expect(page.locator('.cue')).toContainText('From the beginning of the text');
    const w = ['F', 's', 'a', 's'];
    const jata = [0, 1, 1, 0, 0, 1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 2, 2, 3].map((i) => w[i]);
    await page.locator('.letter-input').focus();
    await typeLetters(page, jata);
    await expect(page.locator('.outcome')).toContainText('100%');
    await expect(page.locator('.drill-result .braid')).toHaveCount(1);
  });

  test('final test recites the whole text from first letters', async ({ page }) => {
    const id = await addSample(page, 'mutanabbi');
    await page.goto(`./#/final/${id}`);
    await page.getByRole('button', { name: 'Begin the final test' }).click();
    await expect(page.getByRole('radio')).toHaveCount(0); // first letters only
    const letters = firstLetters('mutanabbi', 'samhita', 0);
    await typeLetters(page, letters.slice(0, 5));
    await page.getByRole('button', { name: 'Reveal word' }).click();
    await typeLetters(page, letters.slice(6));
    await expect(page.locator('.outcome')).toContainText('7 of 8 words right first time');
    await expect(page.locator('.missed-list mark')).toHaveText('والرمح');
    await page.goto(`./#/text/${id}`);
    await expect(page.locator('.final-list')).toContainText('88%');
  });

  test('home suggests what to practise next', async ({ page }) => {
    await addSample(page, 'hope');
    await openApp(page, '#/');
    await expect(page.locator('.leaf-card')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Start passage 1' })).toBeVisible();
    await page.getByRole('link', { name: 'Start passage 1' }).click();
    await expect(page.getByRole('tab', { name: 'Watch' })).toHaveAttribute('aria-selected', 'true');
  });
});
