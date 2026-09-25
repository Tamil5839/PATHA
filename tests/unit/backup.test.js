import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStorage } from '../../src/storage/db.js';
import { makeBackup, backupJson, parseBackup, combine, backupFileName, BackupError, BACKUP_FORMAT } from '../../src/core/backup.js';
import { createText } from '../../src/core/textModel.js';
import { emptyProgress, recordRound } from '../../src/core/progress.js';
import { buildPattern, tokenize, range } from '../../src/core/patterns.js';

const NOW = 1_758_800_000_000;

function sampleData() {
  const hope = createText({ id: 't_hope', title: 'Hope', raw: 'HOPE is the thing with feathers\nThat perches in the soul,', chunk: { mode: 'line', maxWords: 6 }, now: NOW });
  const doha = createText({ id: 't_doha', title: 'दोहा', raw: 'निज भाषा उन्नति अहै, सब उन्नति को मूल।', lang: 'hi', now: NOW });
  const haiku = createText({ id: 't_haiku', title: '古池', raw: '古池や　蛙飛び込む　水の音', lang: 'ja', unitMode: 'phrase', now: NOW });
  const p = emptyProgress('t_hope');
  const span = hope.passages[0];
  const tokens = tokenize(buildPattern('ghana', range(span.start, span.end)));
  recordRound(p, { kind: 'passage', span, level: 'ghana', tokens, scores: tokens.map((t) => (t.k % 7 ? 1 : 0.5)), now: NOW, today: 20355 });
  const finalTokens = tokenize(buildPattern('samhita', range(0, hope.units.length)));
  recordRound(p, { kind: 'final', tokens: finalTokens, scores: finalTokens.map((t) => (t.k === 3 ? 0 : 1)), now: NOW, today: 20355 });
  return {
    texts: [hope, doha, haiku],
    progress: [p, emptyProgress('t_doha')],
    settings: [
      { key: 'tempo', value: 72 },
      { key: 'speechInput', value: false },
    ],
  };
}

const byKey = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]));
async function readAll(storage) {
  return {
    texts: (await storage.getAll('texts')).sort(byKey('id')),
    progress: (await storage.getAll('progress')).sort(byKey('textId')),
    settings: (await storage.getAll('settings')).sort(byKey('key')),
  };
}

describe('export then import', () => {
  test('restores everything exactly', async () => {
    const data = sampleData();
    const source = await openStorage({ indexedDB: new IDBFactory() });
    for (const t of data.texts) await source.put('texts', t);
    for (const p of data.progress) await source.put('progress', p);
    for (const s of data.settings) await source.put('settings', s);

    const exported = backupJson(await readAll(source), NOW);
    const target = await openStorage({ indexedDB: new IDBFactory() });
    await target.put('texts', createText({ id: 't_old', raw: 'to be replaced' }));
    await target.replaceAll(parseBackup(exported));

    const restored = await readAll(target);
    assert.deepEqual(restored, await readAll(source));
    assert.deepEqual(restored.texts.map((t) => t.id), ['t_doha', 't_haiku', 't_hope']);
    // a second export is identical to the first
    assert.equal(backupJson(restored, NOW), exported);
    source.close();
    target.close();
  });

  test('backup document shape and file name', () => {
    const doc = makeBackup({ texts: [], progress: [], settings: [] }, NOW);
    assert.equal(doc.format, BACKUP_FORMAT);
    assert.equal(doc.version, 1);
    assert.equal(doc.exportedAt, new Date(NOW).toISOString());
    assert.match(backupFileName(NOW), /^patha-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe('import validation', () => {
  const doc = (over = {}) => JSON.stringify({ format: BACKUP_FORMAT, version: 1, texts: [], progress: [], settings: [], ...over });

  test('rejects files that are not Patha backups', () => {
    assert.throws(() => parseBackup('not json'), BackupError);
    assert.throws(() => parseBackup('{"hello":1}'), /not a Patha backup/);
    assert.throws(() => parseBackup(doc({ version: 99 })), /newer version/);
    assert.throws(() => parseBackup(doc({ texts: 'x' })), /no texts/);
    assert.throws(() => parseBackup(doc({ texts: [{ title: 'x' }] })), /no id/);
    assert.throws(() => parseBackup(doc({ texts: [{ id: 'a', raw: '' }] })), /empty/);
    const t = createText({ id: 'dup', raw: 'a b c' });
    assert.throws(() => parseBackup(doc({ texts: [t, t] })), /share the id/);
    assert.throws(() => parseBackup(doc({ texts: [t], progress: [{ textId: 'dup' }] })), /malformed/);
  });

  test('rebuilds texts whose units or passages are missing or inconsistent', () => {
    const parsed = parseBackup(doc({ texts: [{ id: 'hand', title: 'By hand', raw: 'One two three. Four five six.' }] }));
    assert.equal(parsed.texts[0].units.length, 6);
    assert.equal(parsed.texts[0].passages.length, 2);
    const t = createText({ id: 'bad', raw: 'a b c d' });
    const broken = { ...t, passages: [{ start: 0, end: 9 }] };
    assert.deepEqual(parseBackup(doc({ texts: [broken] })).texts[0].passages, [{ start: 0, end: 4 }]);
  });

  test('drops progress for texts that are not in the backup', () => {
    const t = createText({ id: 'keep', raw: 'a b c' });
    const parsed = parseBackup(doc({ texts: [t], progress: [emptyProgress('keep'), emptyProgress('gone')] }));
    assert.deepEqual(parsed.progress.map((p) => p.textId), ['keep']);
  });
});

describe('merging an import into existing data', () => {
  const t = (id, updatedAt) => ({ ...createText({ id, raw: `text ${id}` }), updatedAt });
  const prog = (textId, updatedAt) => ({ ...emptyProgress(textId), updatedAt });

  test('replace takes the backup as is', () => {
    const incoming = { texts: [t('b', 1)], progress: [], settings: [] };
    assert.equal(combine({ texts: [t('a', 1)], progress: [], settings: [] }, incoming, 'replace'), incoming);
  });

  test('merge keeps both sides, preferring the newer copy of a text', () => {
    const current = {
      texts: [t('a', 10), t('shared', 50)],
      progress: [prog('shared', 60)],
      settings: [{ key: 'tempo', value: 60 }],
    };
    const incoming = {
      texts: [t('b', 5), t('shared', 40)],
      progress: [prog('shared', 70), prog('b', 5)],
      settings: [{ key: 'tempo', value: 90 }, { key: 'theme', value: 'dark' }],
    };
    const merged = combine(current, incoming, 'merge');
    assert.deepEqual(merged.texts.map((x) => x.id).sort(), ['a', 'b', 'shared']);
    // incoming "shared" has newer progress (70 > 60), so its copy wins
    assert.equal(merged.progress.find((p) => p.textId === 'shared').updatedAt, 70);
    assert.deepEqual(merged.settings, [{ key: 'tempo', value: 60 }, { key: 'theme', value: 'dark' }]);
  });
});
