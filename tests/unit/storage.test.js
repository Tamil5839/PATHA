import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStorage, memoryStorage } from '../../src/storage/db.js';

const text = { id: 't_1', title: 'Hope', raw: 'Hope is the thing', units: [], passages: [] };
const progress = { textId: 't_1', links: { 0: { f: { s: 1, n: 1, last: 5 } } }, words: {}, passages: {} };
const setting = { key: 'tempo', value: 60 };

describe('IndexedDB storage', () => {
  test('data survives a reload (closing and reopening the database)', async () => {
    const factory = new IDBFactory();
    const first = await openStorage({ indexedDB: factory });
    assert.equal(first.kind, 'indexeddb');
    assert.equal(first.persistent, true);
    await first.put('texts', text);
    await first.put('progress', progress);
    await first.put('settings', setting);
    first.close();

    const second = await openStorage({ indexedDB: factory });
    assert.deepEqual(await second.getAll('texts'), [text]);
    assert.deepEqual(await second.getAll('progress'), [progress]);
    assert.deepEqual(await second.getAll('settings'), [setting]);
    second.close();
  });

  test('put overwrites by key; delete removes', async () => {
    const s = await openStorage({ indexedDB: new IDBFactory() });
    await s.put('texts', text);
    await s.put('texts', { ...text, title: 'Renamed' });
    assert.deepEqual((await s.getAll('texts')).map((t) => t.title), ['Renamed']);
    await s.delete('texts', 't_1');
    assert.deepEqual(await s.getAll('texts'), []);
    s.close();
  });

  test('replaceAll swaps every store in one transaction', async () => {
    const s = await openStorage({ indexedDB: new IDBFactory() });
    await s.put('texts', text);
    await s.put('settings', setting);
    const other = { ...text, id: 't_2' };
    await s.replaceAll({ texts: [other], progress: [], settings: [] });
    assert.deepEqual(await s.getAll('texts'), [other]);
    assert.deepEqual(await s.getAll('settings'), []);
    s.close();
  });
});

describe('working without storage', () => {
  test('no IndexedDB at all: falls back to memory', async () => {
    const s = await openStorage({ indexedDB: null });
    assert.equal(s.kind, 'memory');
    assert.equal(s.persistent, false);
    assert.match(s.fallbackReason, /not available/);
    await s.put('texts', text);
    assert.deepEqual(await s.getAll('texts'), [text]);
  });

  test('open() throws (e.g. blocked by privacy settings): falls back', async () => {
    const throwing = /** @type {any} */ ({
      open() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    const s = await openStorage({ indexedDB: throwing });
    assert.equal(s.kind, 'memory');
    assert.match(s.fallbackReason, /insecure/);
  });

  test('open() reports an error: falls back', async () => {
    const failing = /** @type {any} */ ({
      open() {
        const req = /** @type {any} */ ({ error: new Error('QuotaExceededError') });
        setTimeout(() => req.onerror?.(), 0);
        return req;
      },
    });
    const s = await openStorage({ indexedDB: failing });
    assert.equal(s.kind, 'memory');
    assert.match(s.fallbackReason, /Quota/);
  });

  test('open() never answers: falls back after a timeout', async () => {
    const hanging = /** @type {any} */ ({ open: () => ({}) });
    const s = await openStorage({ indexedDB: hanging, timeoutMs: 20 });
    assert.equal(s.kind, 'memory');
    assert.match(s.fallbackReason, /did not respond/);
  });

  test('memory storage copies values in and out', async () => {
    const s = memoryStorage();
    const value = { ...text, units: [{ core: 'a' }] };
    await s.put('texts', value);
    value.units[0].core = 'changed';
    const [stored] = await s.getAll('texts');
    assert.equal(stored.units[0].core, 'a');
    stored.title = 'mutated';
    assert.equal((await s.getAll('texts'))[0].title, 'Hope');
    await s.replaceAll({ texts: [], progress: [progress], settings: [] });
    assert.deepEqual(await s.getAll('texts'), []);
    assert.deepEqual(await s.getAll('progress'), [progress]);
    await s.delete('progress', 't_1');
    assert.deepEqual(await s.getAll('progress'), []);
  });

  test('separate memory stores do not share data', async () => {
    const a = memoryStorage();
    const b = memoryStorage();
    await a.put('texts', text);
    assert.deepEqual(await b.getAll('texts'), []);
  });
});
