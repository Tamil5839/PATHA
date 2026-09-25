// Export and import of all data as one JSON file.

import { createText } from './textModel.js';

export const BACKUP_FORMAT = 'patha-backup';
export const BACKUP_VERSION = 1;

/**
 * @typedef {Object} AppData
 * @property {import('./textModel.js').Text[]} texts
 * @property {import('./progress.js').Progress[]} progress
 * @property {{ key: string, value: unknown }[]} settings
 */

/**
 * @param {AppData} data
 * @param {number} [now]
 */
export function makeBackup(data, now = Date.now()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: 'Patha',
    exportedAt: new Date(now).toISOString(),
    texts: data.texts,
    progress: data.progress,
    settings: data.settings,
  };
}

/**
 * @param {AppData} data
 * @param {number} [now]
 */
export function backupJson(data, now) {
  return JSON.stringify(makeBackup(data, now), null, 1);
}

/** File name for an export, e.g. patha-backup-2026-09-25.json */
export function backupFileName(now = Date.now()) {
  const d = new Date(now);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `patha-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

export class BackupError extends Error {}

/** @param {unknown} v */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @param {unknown} v */
const isInt = (v) => Number.isInteger(v) && /** @type {number} */ (v) >= 0;

/**
 * Parse and validate a backup file. Texts without stored units (e.g. written
 * by hand) are rebuilt from their raw text. Anything malformed is rejected
 * with a readable message rather than half-imported.
 * @param {string} json
 * @returns {AppData}
 */
export function parseBackup(json) {
  let doc;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new BackupError('This file is not valid JSON.');
  }
  if (!isObject(doc) || doc.format !== BACKUP_FORMAT) {
    throw new BackupError('This file is not a Patha backup.');
  }
  if (!isInt(doc.version) || doc.version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of Patha.');
  }
  const texts = Array.isArray(doc.texts) ? doc.texts : null;
  const progress = Array.isArray(doc.progress) ? doc.progress : [];
  const settings = Array.isArray(doc.settings) ? doc.settings : [];
  if (!texts) throw new BackupError('The backup has no texts list.');

  const seen = new Set();
  const outTexts = texts.map((t, i) => {
    const text = validateText(t, i);
    if (seen.has(text.id)) throw new BackupError(`Two texts share the id ${text.id}.`);
    seen.add(text.id);
    return text;
  });
  const outProgress = progress.map((p, i) => {
    if (!isObject(p) || typeof p.textId !== 'string') throw new BackupError(`Progress entry ${i + 1} is malformed.`);
    if (!isObject(p.links) || !isObject(p.words) || !isObject(p.passages)) {
      throw new BackupError(`Progress entry ${i + 1} is malformed.`);
    }
    return {
      ...p,
      bridges: isObject(p.bridges) ? p.bridges : {},
      finals: Array.isArray(p.finals) ? p.finals : [],
      updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : 0,
    };
  });
  const outSettings = settings.filter((s) => isObject(s) && typeof s.key === 'string');
  return { texts: outTexts, progress: outProgress.filter((p) => seen.has(p.textId)), settings: outSettings };
}

/**
 * @param {any} t
 * @param {number} i
 * @returns {import('./textModel.js').Text}
 */
function validateText(t, i) {
  const where = `Text ${i + 1}`;
  if (!isObject(t) || typeof t.id !== 'string' || !t.id) throw new BackupError(`${where} has no id.`);
  if (typeof t.raw !== 'string') throw new BackupError(`${where} has no text.`);
  const hasUnits =
    Array.isArray(t.units) && t.units.every((u) => isObject(u) && typeof u.core === 'string' && typeof u.pre === 'string' && typeof u.post === 'string');
  const hasPassages =
    hasUnits &&
    Array.isArray(t.passages) &&
    t.passages.length > 0 &&
    t.passages.every(
      (/** @type {any} */ s, /** @type {number} */ k, /** @type {any[]} */ all) =>
        isObject(s) && isInt(s.start) && isInt(s.end) && s.end > s.start && s.end <= t.units.length && (k === 0 ? s.start === 0 : s.start === all[k - 1].end),
    ) &&
    t.passages[t.passages.length - 1].end === t.units.length;
  if (hasUnits && hasPassages) {
    return { ...t, title: typeof t.title === 'string' ? t.title : 'Untitled' };
  }
  if (hasUnits && t.units.length === 0) throw new BackupError(`${where} is empty.`);
  // Rebuild derived fields from the raw text.
  const rebuilt = createText({
    id: t.id,
    title: t.title,
    source: t.source,
    raw: t.raw,
    lang: t.lang,
    unitMode: t.unitMode,
    chunk: t.chunk,
    now: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
  });
  if (rebuilt.units.length === 0) throw new BackupError(`${where} is empty.`);
  return rebuilt;
}

/**
 * Combine imported data with current data.
 *  - replace: the backup replaces everything
 *  - merge: texts from both are kept; when both have the same text, the
 *    more recently updated copy (and its progress) wins
 * @param {AppData} current
 * @param {AppData} incoming
 * @param {'replace'|'merge'} mode
 * @returns {AppData}
 */
export function combine(current, incoming, mode) {
  if (mode === 'replace') return incoming;
  const texts = new Map(current.texts.map((t) => [t.id, t]));
  const progress = new Map(current.progress.map((p) => [p.textId, p]));
  for (const t of incoming.texts) {
    const mine = texts.get(t.id);
    const theirsProgress = incoming.progress.find((p) => p.textId === t.id);
    const mineProgress = progress.get(t.id);
    const theirsNewer =
      !mine ||
      Math.max(t.updatedAt || 0, theirsProgress?.updatedAt || 0) > Math.max(mine.updatedAt || 0, mineProgress?.updatedAt || 0);
    if (theirsNewer) {
      texts.set(t.id, t);
      if (theirsProgress) progress.set(t.id, theirsProgress);
      else progress.delete(t.id);
    }
  }
  const settings = new Map(current.settings.map((s) => [s.key, s]));
  for (const s of incoming.settings) if (!settings.has(s.key)) settings.set(s.key, s);
  return { texts: [...texts.values()], progress: [...progress.values()], settings: [...settings.values()] };
}
