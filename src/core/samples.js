// Sample texts: short, neutral, public-domain works in several scripts.
// Deliberately not sacred texts.

/**
 * @typedef {Object} Sample
 * @property {string} id
 * @property {string} title
 * @property {string} source  attribution shown with the text
 * @property {string} lang
 * @property {'word'|'char'|'phrase'} unitMode
 * @property {'sentence'|'line'|'fixed'} chunkMode
 * @property {string} text
 */

/** @type {Sample[]} */
export const SAMPLES = [
  {
    id: 'gettysburg',
    title: 'The Gettysburg Address',
    source: 'Abraham Lincoln, 1863 (Bliss copy). Public domain.',
    lang: 'en',
    unitMode: 'word',
    chunkMode: 'sentence',
    text: `Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.

Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battle-field of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this.

But, in a larger sense, we can not dedicate—we can not consecrate—we can not hallow—this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract. The world will little note, nor long remember what we say here, but it can never forget what they did here. It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced. It is rather for us to be here dedicated to the great task remaining before us—that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion—that we here highly resolve that these dead shall not have died in vain—that this nation, under God, shall have a new birth of freedom—and that government of the people, by the people, for the people, shall not perish from the earth.`,
  },
  {
    id: 'hope',
    title: '“Hope” is the thing with feathers',
    source: 'Emily Dickinson, Poems, Second Series (1891). Public domain.',
    lang: 'en',
    unitMode: 'word',
    chunkMode: 'line',
    text: `Hope is the thing with feathers
That perches in the soul,
And sings the tune without the words,
And never stops at all,

And sweetest in the gale is heard;
And sore must be the storm
That could abash the little bird
That kept so many warm.

I've heard it in the chillest land,
And on the strangest sea;
Yet, never, in extremity,
It asked a crumb of me.`,
  },
  {
    id: 'nij-bhasha',
    title: 'निज भाषा · Nij Bhasha',
    source: 'Bharatendu Harishchandra (1850–1885), Hindi. Public domain.',
    lang: 'hi',
    unitMode: 'word',
    chunkMode: 'line',
    text: `निज भाषा उन्नति अहै, सब उन्नति को मूल।
बिन निज भाषा-ज्ञान के, मिटत न हिय को सूल॥`,
  },
  {
    id: 'bharati-tamil',
    title: 'தமிழ் · Tamil',
    source: 'Subramania Bharati (1882–1921), Tamil. Public domain.',
    lang: 'ta',
    unitMode: 'word',
    chunkMode: 'line',
    text: `யாமறிந்த மொழிகளிலே தமிழ்மொழி போல்
இனிதாவது எங்கும் காணோம்,
பாமரராய் விலங்குகளாய், உலகனைத்தும்
இகழ்ச்சிசொலப் பான்மை கெட்டு,
நாமமது தமிழரெனக் கொண்டு இங்கு
வாழ்ந்திடுதல் நன்றோ? சொல்லீர்!
தேமதுரத் தமிழோசை உலகமெலாம்
பரவும்வகை செய்தல் வேண்டும்.`,
  },
  {
    id: 'basho',
    title: '古池や · The old pond',
    source: 'Matsuo Bashō, 1686, Japanese. Public domain. Written here with spaces between its three phrases.',
    lang: 'ja',
    unitMode: 'phrase',
    chunkMode: 'fixed',
    text: '古池や　蛙飛び込む　水の音',
  },
  {
    id: 'mutanabbi',
    title: 'الخيل والليل · The horses and the night',
    source: 'al-Mutanabbi (915–965), Arabic. Public domain.',
    lang: 'ar',
    unitMode: 'word',
    chunkMode: 'line',
    text: `الخيل والليل والبيداء تعرفني
والسيف والرمح والقرطاس والقلم`,
  },
];

/** @param {string} id */
export function sampleById(id) {
  return SAMPLES.find((s) => s.id === id) ?? null;
}
