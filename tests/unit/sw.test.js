import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

test('the service worker precaches every app file, and only existing files', async () => {
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);
  const needed = [
    ...(await walk(join(root, 'src'))).filter((f) => f.endsWith('.js')),
    join(root, 'styles/app.css'),
    join(root, 'fonts/fonts.css'),
    join(root, 'index.html'),
    join(root, 'manifest.webmanifest'),
    join(root, 'icon.svg'),
    join(root, 'icon-maskable.svg'),
  ].map((f) => relative(root, f).split('\\').join('/'));
  for (const file of needed) assert.ok(listed.includes(file), `sw.js should precache ${file}`);
  for (const file of listed) {
    if (file === './') continue;
    await assert.doesNotReject(readFile(join(root, file)), `sw.js lists missing file ${file}`);
  }
});

test('index.html only references local resources', async () => {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(!/^https?:/.test(ref) && !ref.startsWith('//'), `remote reference: ${ref}`);
  }
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'self'/);
});
