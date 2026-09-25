import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openApp, addSample, firstLetters, typeLetters } from './helpers.js';

/** Fail on serious or critical accessibility violations. */
async function audit(page, label) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`);
  expect(summary, `${label}: ${summary.join('\n')}`).toEqual([]);
}

test.describe('accessibility', () => {
  for (const theme of ['light', 'dark']) {
    test(`every screen passes an automated audit (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openApp(page, '#/');
      await audit(page, 'home (empty)');
      await openApp(page, '#/add?sample=gettysburg');
      await audit(page, 'add');
      const id = await addSample(page, 'gettysburg');
      await audit(page, 'text');
      await page.goto(`./#/practice/${id}/0?level=ghana&mode=watch`);
      await audit(page, 'watch');
      await page.goto(`./#/practice/${id}/0?level=krama&mode=recall`);
      await audit(page, 'recall');
      await typeLetters(page, firstLetters('gettysburg', 'krama', 0));
      await expect(page.locator('.outcome')).toBeVisible();
      await audit(page, 'check');
      await page.goto(`./#/practice/${id}/0?level=krama&mode=recall`);
      await page.getByRole('radio', { name: 'Tap to reveal' }).click();
      await page.keyboard.press('Space');
      await audit(page, 'tap');
      for (const hash of ['#/', '#/review', '#/about', '#/settings', `#/drill/${id}`, `#/final/${id}`]) {
        await page.goto(`./${hash}`);
        await audit(page, hash);
      }
    });
  }

  test('skip link, landmarks and focus after navigation', async ({ page }) => {
    await openApp(page, '#/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('the braid has a text alternative', async ({ page }) => {
    const id = await addSample(page, 'hope');
    await page.goto(`./#/practice/${id}/0?level=jata&mode=watch`);
    await expect(page.getByRole('img', { name: /braid/ })).toBeVisible();
  });
});
