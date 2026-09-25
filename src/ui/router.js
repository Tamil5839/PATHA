// Hash routing: #/name/part/part?key=value

/**
 * @typedef {{ name: string, parts: string[], params: Record<string, string> }} Route
 */

/**
 * @param {string} hash
 * @returns {Route}
 */
export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  const path = q === -1 ? raw : raw.slice(0, q);
  const query = q === -1 ? '' : raw.slice(q + 1);
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  return { name: segments[0] || 'home', parts: segments.slice(1), params: Object.fromEntries(new URLSearchParams(query)) };
}

/**
 * Build a hash link.
 * @param {(string|number)[]} parts
 * @param {Record<string, string|number|undefined|null>} [params]
 */
export function link(parts, params) {
  const path = `#/${parts.map((p) => encodeURIComponent(String(p))).join('/')}`;
  const entries = Object.entries(params ?? {}).filter(([, v]) => v != null && v !== '');
  return entries.length ? `${path}?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : path;
}

/**
 * Navigate.
 * @param {(string|number)[]} parts
 * @param {Record<string, string|number|undefined|null>} [params]
 * @param {{ replace?: boolean }} [options]
 */
export function go(parts, params, { replace = false } = {}) {
  const target = link(parts, params);
  if (replace) {
    history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target.slice(1);
  }
}
