import { test, expect } from '@playwright/test';
import { addSample, firstLetters, typeLetters, flush } from './helpers.js';

test.describe('review and spaced repetition', () => {
  test('a passage comes due the next day and is scheduled further after a good review', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T09:00:00') });
    const id = await addSample(page, 'nij-bhasha');
    await page.goto(`./#/practice/${id}/0?level=samhita&mode=recall`);
    await typeLetters(page, firstLetters('nij-bhasha', 'samhita', 0));
    await expect(page.locator('.outcome')).toContainText('Next review: tomorrow');
    await flush(page);

    await page.goto('./#/review');
    await expect(page.getByText('All caught up.')).toBeVisible();
    await expect(page.locator('#review-badge')).toBeHidden();

    // The next morning, the passage is due.
    await page.clock.setFixedTime(new Date('2026-09-26T08:00:00'));
    await page.reload();
    await expect(page.locator('#review-badge')).toHaveText('1');
    await page.goto('./#/review');
    await expect(page.getByRole('heading', { name: 'Due today' })).toBeVisible();
    await page.getByRole('link', { name: /Recall · Saṃhitā/ }).click();
    await typeLetters(page, firstLetters('nij-bhasha', 'samhita', 0));
    await expect(page.locator('.outcome')).toContainText('Next review: in 6 days');
    await page.goto('./#/review');
    await expect(page.getByText('All caught up.')).toBeVisible();
  });

  test('a shaky round is offered again the same day', async ({ page }) => {
    const id = await addSample(page, 'nij-bhasha');
    await page.goto(`./#/practice/${id}/0?level=samhita&mode=recall`);
    const letters = firstLetters('nij-bhasha', 'samhita', 0);
    await typeLetters(page, letters.slice(0, 2));
    await page.getByRole('button', { name: 'Reveal word' }).click();
    await page.getByRole('button', { name: 'Reveal word' }).click();
    await typeLetters(page, letters.slice(4));
    await expect(page.locator('.outcome')).toContainText('2 missed');
    await page.goto('./#/review');
    await expect(page.getByRole('heading', { name: 'One more pass today' })).toBeVisible();
    await expect(page.locator('#review-badge')).toHaveText('1');
  });
});
