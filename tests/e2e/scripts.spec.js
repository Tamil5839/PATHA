import { test, expect } from '@playwright/test';
import { addSample, firstLetters, typeLetters } from './helpers.js';

test.describe('scripts and directions', () => {
  test('Arabic beads run right to left', async ({ page }) => {
    const id = await addSample(page, 'mutanabbi');
    await page.goto(`./#/practice/${id}/0?level=krama&mode=watch`);
    const first = await page.locator('.braid .bead').first().boundingBox();
    const second = await page.locator('.braid .bead').nth(1).boundingBox();
    expect(first && second && first.x > second.x).toBe(true);
    await expect(page.locator('.recitation')).toHaveAttribute('dir', 'rtl');
  });

  test('Arabic recall with an Arabic keyboard', async ({ page }) => {
    const id = await addSample(page, 'mutanabbi');
    await page.goto(`./#/practice/${id}/0?level=krama&mode=recall`);
    await typeLetters(page, firstLetters('mutanabbi', 'krama', 0));
    await expect(page.locator('.outcome')).toContainText('Every word in place');
  });

  test('Tamil and Hindi recall by first letter', async ({ page }) => {
    const ta = await addSample(page, 'bharati-tamil');
    await page.goto(`./#/practice/${ta}/0?level=pada&mode=recall`);
    await typeLetters(page, firstLetters('bharati-tamil', 'pada', 0));
    await expect(page.locator('.outcome')).toContainText('Every word in place');
    const hi = await addSample(page, 'nij-bhasha');
    await page.goto(`./#/practice/${hi}/1?level=krama&mode=recall`);
    await typeLetters(page, firstLetters('nij-bhasha', 'krama', 1));
    await expect(page.locator('.outcome')).toContainText('Every word in place');
  });

  test('Japanese phrases through an input method commit', async ({ page }) => {
    const id = await addSample(page, 'basho');
    await page.goto(`./#/practice/${id}/0?level=krama&mode=recall`);
    await expect(page.locator('.letter-input')).toBeFocused();
    // An IME commits whole phrases: "古池や" then "蛙飛び込む", etc.
    for (const phrase of ['古池や', '蛙飛び込む', '蛙飛び込む', '水の音']) await page.keyboard.insertText(phrase);
    await expect(page.locator('.outcome')).toContainText('Every word in place');
  });
});
