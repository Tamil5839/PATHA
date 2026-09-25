// Tiny DOM helpers. All user text is inserted as text nodes, never as HTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @typedef {Record<string, any>} Props
 * @typedef {Node|string|number|null|undefined|false|Child[]} Child
 */

/**
 * @param {Element} el
 * @param {Props|null|undefined} props
 */
function applyProps(el, props) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false || key === 'value') continue;
    if (key === 'class') el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
    else if (key === 'style' && typeof value === 'object') {
      const style = /** @type {HTMLElement} */ (el).style;
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith('--')) style.setProperty(k, String(v));
        else /** @type {any} */ (style)[k] = v;
      }
    }
    else if (key === 'dataset') Object.assign(/** @type {HTMLElement} */ (el).dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'ref' && typeof value === 'function') value(el);
    else if (key in el && !(el instanceof SVGElement) && typeof value !== 'string') /** @type {any} */ (el)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
}

/**
 * @param {Element} el
 * @param {Child[]} children
 */
function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Create an HTML element.
 * @param {string} tag
 * @param {Props|null} [props]
 * @param {...Child} children
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  // Set value last, so a <select> already has its options.
  if (props && props.value != null && 'value' in el) /** @type {any} */ (el).value = props.value;
  return el;
}

/**
 * Create an SVG element.
 * @param {string} tag
 * @param {Props|null} [props]
 * @param {...Child} children
 * @returns {SVGElement}
 */
export function s(tag, props, ...children) {
  const el = /** @type {SVGElement} */ (document.createElementNS(SVG_NS, tag));
  applyProps(el, props);
  append(el, children);
  return el;
}

/**
 * Append children, skipping null, undefined and false (unlike Element.append,
 * which would insert the text "null").
 * @param {Element} el
 * @param {...Child} children
 */
export function add(el, ...children) {
  append(el, children);
  return el;
}

/**
 * Replace an element's children.
 * @param {Element} el
 * @param {...Child} children
 */
export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** @param {string} selector @param {ParentNode} [root] */
export const $ = (selector, root = document) => /** @type {HTMLElement|null} */ (root.querySelector(selector));

/**
 * Announce a message to screen readers through the shared live region.
 * @param {string} message
 * @param {'polite'|'assertive'} [politeness]
 */
export function announce(message, politeness = 'polite') {
  const region = document.getElementById(politeness === 'assertive' ? 'live-assertive' : 'live-polite');
  if (!region) return;
  region.textContent = '';
  // A tick later, so repeated identical messages are still announced.
  setTimeout(() => {
    region.textContent = message;
  }, 30);
}

/** Whether the user prefers reduced motion (system setting or app setting). */
export function reducedMotion() {
  if (document.documentElement.dataset.motion === 'reduce') return true;
  if (document.documentElement.dataset.motion === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Small inline icons (decorative; always paired with visible or aria text).
 * @param {'play'|'pause'|'prev'|'next'|'restart'|'gear'|'check'|'x'|'plus'|'mic'|'speaker'|'download'|'upload'|'trash'|'edit'|'arrow'} name
 */
export function icon(name) {
  const paths = {
    play: 'M8 5.5v13l11-6.5z',
    pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
    prev: 'M6 5h2v14H6zM20 5.5v13L9 12z',
    next: 'M16 5h2v14h-2zM4 5.5v13L15 12z',
    restart: 'M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v3L7.5 6 12 2z',
    gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.6 5-1.8-.3a7 7 0 0 1-.7 1.7l1.1 1.5-1.8 1.8-1.5-1.1a7 7 0 0 1-1.7.7l-.3 1.8h-2.6l-.3-1.8a7 7 0 0 1-1.7-.7l-1.5 1.1-1.8-1.8 1.1-1.5a7 7 0 0 1-.7-1.7l-1.8-.3v-2.6l1.8-.3a7 7 0 0 1 .7-1.7L5.6 7l1.8-1.8 1.5 1.1a7 7 0 0 1 1.7-.7l.3-1.8h2.6l.3 1.8a7 7 0 0 1 1.7.7l1.5-1.1L18.4 7l-1.1 1.5a7 7 0 0 1 .7 1.7l1.8.3z',
    check: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z',
    x: 'M6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z',
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-6 9h2a4 4 0 0 0 8 0h2a6 6 0 0 1-5 5.9V21h-2v-3.1A6 6 0 0 1 6 12z',
    speaker: 'M4 9v6h4l5 4V5L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z',
    download: 'M11 4h2v8.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3zM5 18h14v2H5z',
    upload: 'M11 20h2v-8.2l3.3 3.3 1.4-1.4L12 8l-5.7 5.7 1.4 1.4 3.3-3.3zM5 4h14v2H5z',
    trash: 'M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z',
    edit: 'M4 17.3V20h2.7l8-8-2.7-2.7zm14.7-7.4a1 1 0 0 0 0-1.4l-1.2-1.2a1 1 0 0 0-1.4 0l-1.3 1.3 2.7 2.7z',
    arrow: 'M5 11h10.2l-4.6-4.6L12 5l7 7-7 7-1.4-1.4 4.6-4.6H5z',
  };
  return s('svg', { class: 'icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, s('path', { d: paths[name] }));
}

/**
 * Human "in N days" / "N days ago" for day numbers.
 * @param {number} day
 * @param {number} today
 */
export function relativeDay(day, today) {
  const d = day - today;
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

/**
 * @param {number} n
 * @param {string} one
 * @param {string} [many]
 */
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Trigger a file download of text content.
 * @param {string} filename
 * @param {string} content
 * @param {string} [type]
 */
export function downloadText(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
