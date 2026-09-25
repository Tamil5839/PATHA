import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openApp, addSample, firstLetters, typeLetters, flush } from './helpers.js';

test.describe('texts and storage', () => {
  test('adds a pasted text and previews its passages', async ({ page }) => {
    await openApp(page, '#/add');
    await page.getByLabel('Title').fill('Daffodils');
    await page.getByLabel('Text', { exact: true }).fill(
      'I wandered lonely as a cloud\nThat floats on high o\'er vales and hills,\nWhen all at once I saw a crowd,\nA host, of golden daffodils;',
    );
    // Lines of 6, 8, 8 and 5 words: no two neighbours fit in 12, so 4 passages.
    await expect(page.locator('.preview-summary')).toContainText('27 words in 4 passages');
    await expect(page.getByLabel('Lines')).toBeChecked(); // verse detected
    await page.getByRole('button', { name: 'Save text' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Daffodils');
    await expect(page.locator('.passage-card')).toHaveCount(4);
  });

  test('detects the language and direction of what you paste', async ({ page }) => {
    await openApp(page, '#/add');
    await page.getByLabel('Text', { exact: true }).fill('الخيل والليل والبيداء تعرفني');
    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('ar');
    await expect(page.getByLabel('Text', { exact: true })).toHaveAttribute('dir', 'rtl');
    await page.getByLabel('Text', { exact: true }).fill('古池や　蛙飛び込む　水の音');
    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('ja');
    await expect(page.getByLabel('Phrases')).toBeChecked();
    await expect(page.locator('.preview-summary')).toContainText('3 phrases');
  });

  test('refuses to save an empty text', async ({ page }) => {
    await openApp(page, '#/add');
    await page.getByRole('button', { name: 'Save text' }).click();
    await expect(page.getByRole('alert')).toContainText('no words');
  });

  test('texts and progress survive a reload', async ({ page }) => {
    const id = await addSample(page, 'nij-bhasha');
    await page.goto(`./#/practice/${id}/0?level=samhita&mode=recall`);
    await typeLetters(page, firstLetters('nij-bhasha', 'samhita', 0));
    await expect(page.locator('.outcome')).toContainText('Every word in place');
    await flush(page);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await page.goto(`./#/text/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('निज भाषा · Nij Bhasha');
    await expect(page.locator('.passage-card').first().locator('.ladder')).toHaveAttribute('aria-label', 'Cleared up to Saṃhitā');
    await expect(page.locator('#status-banner')).toBeHidden();
  });

  test('works, without saving, when storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      // Simulate a browser that blocks IndexedDB (e.g. strict privacy mode).
      Object.defineProperty(window, 'indexedDB', {
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
    const id = await addSample(page, 'mutanabbi');
    await expect(page.locator('#status-banner')).toContainText('Not saving');
    await page.goto(`./#/practice/${id}/0?level=krama&mode=recall`);
    await typeLetters(page, firstLetters('mutanabbi', 'krama', 0));
    await expect(page.locator('.outcome')).toBeVisible();
    await expect(page.locator('.braid .thread.is-strong').first()).toBeVisible();
  });

  test('export then import restores everything exactly', async ({ page }) => {
    const id = await addSample(page, 'hope');
    await page.goto(`./#/practice/${id}/0?level=krama&mode=recall`);
    const letters = firstLetters('hope', 'krama', 0);
    letters.splice(2, 0, 'z'); // one slip
    await typeLetters(page, letters);
    await expect(page.locator('.outcome')).toBeVisible();

    await page.goto('./#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export all data' }).click()]);
    const file = await download.path();
    const exported = JSON.parse(await readFile(file, 'utf8'));
    expect(exported.format).toBe('patha-backup');
    expect(exported.texts).toHaveLength(1);

    // Delete everything, then import the backup.
    await page.getByRole('button', { name: 'Delete all data' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByText('Try a sample')).toBeVisible();
    await page.goto('./#/settings');
    await page.locator('#import-file').setInputFiles(file);
    await page.getByRole('dialog').getByRole('button', { name: 'Replace everything' }).click();
    await expect(page.locator('.form-message')).toContainText('Imported 1 text');

    // A second export is identical apart from its timestamp.
    const [again] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export all data' }).click()]);
    const reexported = JSON.parse(await readFile(await again.path(), 'utf8'));
    delete exported.exportedAt;
    delete reexported.exportedAt;
    expect(reexported).toEqual(exported);

    await page.goto(`./#/text/${id}`);
    await expect(page.locator('.passage-card').first().locator('.ladder')).toHaveAttribute('aria-label', 'Cleared up to Krama');
  });

  test('rejects a file that is not a backup', async ({ page }) => {
    await openApp(page, '#/settings');
    await page.locator('#import-file').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') });
    await expect(page.locator('.form-message')).toContainText('not a Patha backup');
  });

  test('deletes a text after confirmation', async ({ page }) => {
    await addSample(page, 'basho');
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Try a sample')).toBeVisible();
    await expect(page.locator('.leaf-card')).toHaveCount(0);
  });

  test('makes no requests to other sites', async ({ page }) => {
    const foreign = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol !== 'data:' && url.protocol !== 'blob:') foreign.push(req.url());
    });
    const id = await addSample(page, 'bharati-tamil');
    for (const hash of [`#/text/${id}`, `#/practice/${id}/0?mode=watch`, '#/review', '#/about', '#/settings']) {
      await page.goto(`./${hash}`);
      await page.waitForLoadState('networkidle');
    }
    expect(foreign).toEqual([]);
  });
});
