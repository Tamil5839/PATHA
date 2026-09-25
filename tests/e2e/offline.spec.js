import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('opens and works offline after the first visit', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'service worker offline emulation is verified in Chromium');
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  // Let the worker take control, then go offline.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('3,000-year-old');
  await page.goto('./#/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where these patterns come from');
  await context.setOffline(false);
});
