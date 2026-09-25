// About: the tradition (accurately and respectfully, with sources), how the
// patterns work, how Patha adapts them, and privacy.

import { h } from '../dom.js';
import { LEVELS, buildPattern, tokenize, range } from '../../core/patterns.js';
import { createBraid, drawTransition } from '../braid.js';

/** @param {HTMLElement} root */
export function renderAbout(root) {
  const demos = h('div', { class: 'demo-grid' });

  root.append(
    h(
      'header',
      { class: 'page-head' },
      h('p', { class: 'eyebrow' }, 'About'),
      h('h1', null, 'Where these patterns come from'),
      h(
        'p',
        { class: 'lede' },
        'Patha (पाठ, “recitation”) is a free study aid for learning any text by heart. It borrows the structure of the recitation patterns of the Vedic oral tradition, with gratitude to the people who have kept that tradition alive.',
      ),
    ),

    section(
      'tradition',
      'A living oral tradition',
      h('p', null, 'The Vedas are among the oldest texts of India, composed in Vedic Sanskrit. For around three thousand years they have been passed down orally, from teacher to student, with remarkable accuracy. To keep every word and accent intact, students learn each text in several forms of recitation, called ', term('pāṭha'), '.'),
      h('p', null, 'Three forms are called ', term('prakṛti'), ', “natural” recitations: ', term('saṃhitā'), ', the continuous text; ', term('pada'), ', word by word; and ', term('krama'), ', in overlapping pairs. Pada and krama are described in the ancient phonetic treatises known as ', term('Prātiśākhya'), '.'),
      h('p', null, 'Building on krama, later teachers developed eight ', term('vikṛti'), ', “modified” recitations: jaṭā, mālā, śikhā, rekhā, dhvaja, daṇḍa, ratha and ghana. They are listed in the treatise ', term('Vikṛtivallī'), ', attributed to Vyāḍi. In jaṭā and ghana every word is recited forwards and backwards with its neighbours, so a slip anywhere breaks the pattern and stands out at once. Ghana is considered the most demanding, and a reciter who has mastered it is honoured as a ', term('ghanapāṭhī'), '.'),
      h('p', null, 'In 2003 UNESCO proclaimed the Tradition of Vedic Chanting a Masterpiece of the Oral and Intangible Heritage of Humanity. In 2008 it was inscribed on the Representative List of the Intangible Cultural Heritage of Humanity. It is still taught today, in traditional schools and families, over many years of study with a teacher.'),
    ),

    section(
      'not',
      'What Patha is not',
      h('p', null, 'Patha does not teach Vedic chanting and is no substitute for traditional training. Vedic recitation also involves precise pitch accents (', term('svara'), '), pronunciation (', term('śikṣā'), ') and a teacher’s guidance, none of which an app can give. Patha only adapts the word patterns for ordinary texts. Its sample texts are secular, public-domain pieces.'),
    ),

    section(
      'patterns',
      'How the patterns work',
      h('p', null, 'Write the words of a passage as a b c d e. Each level recites them in a different order:'),
      h(
        'table',
        { class: 'pattern-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Level'), h('th', { scope: 'col' }, 'Recited as'), h('th', { scope: 'col' }, 'What it trains'))),
        h(
          'tbody',
          null,
          h('tr', null, h('th', { scope: 'row' }, 'Saṃhitā ', deva('संहिता')), h('td', null, h('code', null, 'a b c d e')), h('td', null, 'The passage as a whole')),
          h('tr', null, h('th', { scope: 'row' }, 'Pada ', deva('पद')), h('td', null, h('code', null, 'a | b | c | d | e')), h('td', null, 'Each word, and its place')),
          h('tr', null, h('th', { scope: 'row' }, 'Krama ', deva('क्रम')), h('td', null, h('code', null, 'ab | bc | cd | de')), h('td', null, 'Each word joined to the next')),
          h('tr', null, h('th', { scope: 'row' }, 'Jaṭā ', deva('जटा')), h('td', null, h('code', null, 'ab ba ab | bc cb bc | cd dc cd | de ed de')), h('td', null, 'Each join, forwards and backwards')),
          h(
            'tr',
            null,
            h('th', { scope: 'row' }, 'Ghana ', deva('घन')),
            h('td', null, h('code', null, 'ab ba abc cba abc | bc cb bcd dcb bcd | cd dc cde edc cde | de ed de')),
            h('td', null, 'Every word locked to its neighbours from several directions'),
          ),
        ),
      ),
      h('p', null, 'Drawn as beads and threads, forward joins arc above the words and backward joins below. Where the recitation turns around, the thread loops around the bead, and the pattern weaves a braid:'),
      demos,
    ),

    section(
      'adapting',
      'How Patha adapts them',
      h(
        'ul',
        { class: 'prose-list' },
        h('li', null, h('strong', null, 'Isolated words. '), 'The Vedic pada recitation also undoes ', term('sandhi'), ', the sound changes between words. Most languages have none to undo, so in Patha pada simply means each word on its own.'),
        h('li', null, h('strong', null, 'Endings. '), 'Ghana needs three words, and the last pair of a passage has only two. Following traditional descriptions, which say that for the last two words ghana is the same as jaṭā, Patha recites the final pair as ', h('code', null, 'de ed de'), '. In the tradition, a unit also closes by repeating its last word with the Sanskrit particle ', term('iti'), ' (“thus”). That marker has no counterpart in other languages, so Patha leaves it out. Other schools and texts may close their units differently.'),
        h('li', null, h('strong', null, 'Passages and bridges. '), 'The tradition works in fixed units such as the half-verse. Patha splits a text into passages of one sentence, or lines of verse, of at most 12 words (you can change this). A short bridge drill joins the end of each passage to the start of the next, so the whole text holds together.'),
        h('li', null, h('strong', null, 'Links, not just words. '), 'Patha tracks every join between neighbouring words, forwards and backwards separately, and each word’s place. The Check view colours each join: gold when strong, amber when shaky, red when weak. Weak-link drills build small jaṭā and ghana patterns around exactly those joins.'),
        h('li', null, h('strong', null, 'Spacing. '), 'Each passage is scheduled with SM-2, a well-known spaced-repetition algorithm published by Piotr Woźniak in 1990: intervals of 1 day, then 6, then growing with how easily you recalled it, and back to 1 day after a lapse. Practising early never pushes a review further out.'),
        h('li', null, h('strong', null, 'Woven. '), 'A passage counts as woven when you recite its ghana pattern without a single error on two different days.'),
        h('li', null, h('strong', null, 'Recall. '), 'Typing the first letter of each word is quick, and it keeps you retrieving each word from memory rather than recognising it. You can instead reveal each step and grade yourself honestly, or recite aloud where your browser supports speech recognition.'),
      ),
      h('p', { class: 'note' }, 'These patterns are a powerful way to practise, but no method can promise perfect memory. What helps most is steady, regular practice.'),
    ),

    section(
      'privacy',
      'Privacy',
      h(
        'ul',
        { class: 'prose-list' },
        h('li', null, 'No accounts, no analytics, no advertising, no tracking.'),
        h('li', null, 'Your texts and progress are stored only in this browser (IndexedDB). Export a backup file from Settings to keep them or move them to another device.'),
        h('li', null, 'Patha makes no network requests to anyone else. Its fonts are bundled with the app. A content security policy blocks connections to other sites.'),
        h('li', null, 'Two optional features use your browser’s built-in speech services. Voices may be online services of your browser’s maker. Speech input, which is off unless you turn it on, sends audio to the browser maker in some browsers, including Chrome.'),
      ),
    ),

    section(
      'sources',
      'Sources and further reading',
      h(
        'ul',
        { class: 'sources' },
        src('UNESCO, “Tradition of Vedic chanting”, Representative List of the Intangible Cultural Heritage of Humanity (inscribed 2008; proclaimed a Masterpiece in 2003).', 'https://ich.unesco.org/en/RL/tradition-of-vedic-chanting-00062'),
        src('Sangeet Natak Akademi, Ministry of Culture, Government of India, “Tradition of Vedic chanting”.', 'https://indiaich-sna.in/tradition-of-vedic-chanting'),
        src('Indira Gandhi National Centre for the Arts, Vedic Heritage Portal.', 'https://vedicheritage.gov.in/'),
        src('J. F. Staal, Nambudiri Veda Recitation. The Hague: Mouton, 1961.'),
        src('Wayne Howard, Veda Recitation in Vārāṇasī. Delhi: Motilal Banarsidass, 1986.'),
        src('Frits Staal, Rules Without Meaning: Ritual, Mantras and the Human Sciences. New York: Peter Lang, 1989.'),
        src('P. A. Woźniak, description of the SM-2 algorithm, from “Optimization of Learning” (1990).', 'https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method'),
      ),
      h('p', { class: 'muted' }, 'The pattern definitions and the conventions Patha chose are documented in detail in docs/PATTERNS.md in the source code.'),
    ),

    section(
      'credits',
      'Credits',
      h('p', null, 'Type set in the Noto family of fonts (SIL Open Font License), which covers Devanagari, Tamil, Kannada, Arabic and many other scripts. Sample texts: Abraham Lincoln, Emily Dickinson, Bharatendu Harishchandra, Subramania Bharati, Matsuo Bashō and al-Mutanabbi, all in the public domain.'),
    ),
  );

  // Live braid illustrations for five words.
  const letters = ['a', 'b', 'c', 'd', 'e'].map((core) => ({ pre: '', core, post: '', sp: true, line: 0, para: 0, sent: 0, brk: 0 }));
  /** @type {{ destroy: () => void }[]} */
  const braids = [];
  for (const id of /** @type {const} */ (['krama', 'jata', 'ghana'])) {
    const level = LEVELS.find((l) => l.id === id);
    const fig = h('figure', { class: 'demo' });
    demos.append(fig);
    const host = h('div', { class: 'braid-host braid-demo' });
    fig.append(host, h('figcaption', null, `${level?.name} · ${level?.deva}`));
    const braid = createBraid(host, { units: letters, items: range(0, 5), dir: 'ltr', lang: 'en', density: id, label: `${level?.name} of five words drawn as a braid` });
    const tokens = tokenize(buildPattern(id, range(0, 5)));
    for (let k = 1; k < tokens.length; k++) drawTransition(braid, tokens, k, 0);
    braid.settle();
    braids.push(braid);
  }
  return () => braids.forEach((b) => b.destroy());
}

/**
 * @param {string} id
 * @param {string} title
 * @param {...any} children
 */
function section(id, title, ...children) {
  return h('section', { class: 'prose', 'aria-labelledby': `about-${id}` }, h('h2', { id: `about-${id}` }, title), ...children);
}

/** @param {string} word */
function term(word) {
  return h('i', { lang: 'sa-Latn' }, word);
}

/** @param {string} word */
function deva(word) {
  return h('span', { class: 'deva', lang: 'sa' }, word);
}

/**
 * @param {string} label
 * @param {string} [href]
 */
function src(label, href) {
  return h('li', null, label, href ? [' ', h('a', { href, rel: 'noreferrer noopener', target: '_blank' }, href.replace(/^https?:\/\//, '').replace(/\/$/, ''))] : '');
}
