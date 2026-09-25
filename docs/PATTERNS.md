# Recitation patterns in Patha

This document records how Patha implements its five recitation levels, where
the definitions come from, and every place where Patha chooses one convention
among several or adapts the tradition for texts in any language.

Patha is a study aid for memorizing *any* text. It borrows the structure of
the recitation patterns (*pāṭha*) used in the Vedic oral tradition. It does
not teach Vedic chanting, which is learned from a teacher and includes
pitch accents (*svara*) and exact pronunciation that no app can teach.

## Notation

Words of a passage are written as letters: `a b c d e`.

* A **segment** is a group of words recited together without a pause
  (`ab`, `cba`).
* A **step** is a group of segments. Steps are separated by `|`, a longer
  pause.
* In letter notation, the words of a segment are written together, so the
  continuous samhita reading of five words is `abcde`.

## The five levels

| Level | Sanskrit | Pattern for `a b c d e` |
|---|---|---|
| 1. Saṃhitā (continuous) | संहिता | `abcde` |
| 2. Pada (word by word) | पद | `a \| b \| c \| d \| e` |
| 3. Krama (overlapping pairs) | क्रम | `ab \| bc \| cd \| de` |
| 4. Jaṭā (forward, backward, forward) | जटा | `ab ba ab \| bc cb bc \| cd dc cd \| de ed de` |
| 5. Ghana (the full weave) | घन | `ab ba abc cba abc \| bc cb bcd dcb bcd \| cd dc cde edc cde \| de ed de` |

As position numbers, these match the schemes given in traditional
descriptions: krama is 1-2, 2-3, 3-4 …; jaṭā is 1-2-2-1-1-2, 2-3-3-2-2-3 …;
ghana is 1-2-2-1-1-2-3-3-2-1-1-2-3, 2-3-3-2-2-3-4-4-3-2-2-3-4 ….

Saṃhitā, pada and krama are the *prakṛti* ("natural") recitations. Jaṭā and
ghana are two of the eight *vikṛti* ("modified") recitations. The eight are
jaṭā, mālā, śikhā, rekhā, dhvaja, daṇḍa, ratha and ghana, as listed in the
verse *jaṭā mālā śikhā rekhā dhvajo daṇḍo ratho ghanaḥ*. The treatise that
lists them is the *Vikṛtivallī* attributed to Vyāḍi. The vikṛtis build on
krama. They are later developments: the Prātiśākhya phonetic treatises
describe pada and krama but not jaṭā or ghana.

## Conventions Patha chose

### 1. How ghana ends: the final pair uses the jaṭā form

A ghana step needs three words (`ab ba abc cba abc`). The final pair of a
passage has no third word. Traditional descriptions of ghana-pāṭha state that
*for the last two words, ghana is the same as jaṭā*, so the final step is
`de ed de`. Patha implements exactly this.

### 2. The "iti" closing is omitted

In the tradition, the end of a unit (typically a half-verse, *ardharca*) is
marked by repeating the last word with the particle *iti* ("thus"), e.g.
`… | de | e iti e`. The same closing follows jaṭā and ghana. Compound words
are also split at this point. This marker belongs to Sanskrit recitation and
has no counterpart in other languages, so Patha omits it at every level.
Every pattern therefore ends with the last pair (krama, jaṭā, ghana), the
last word (pada) or the end of the passage (saṃhitā).

### 3. Pada means isolated words

The Vedic pada-pāṭha also undoes *sandhi*, the sound changes at word
boundaries. Most languages have no sandhi in writing, so in Patha pada means
each word recited on its own, with a pause.

### 4. Very short passages

* One word: every level is just that word (`a`).
* Two words: krama is `ab`, and both jaṭā and ghana are `ab ba ab`.
* Empty passage: an empty pattern.

### 5. Passage length

The tradition works in fixed units such as the half-verse. Patha splits long texts into passages of one sentence
by default, at most 12 words, adjustable from 3 to 30. Poems can be split by
lines instead. Sentences longer than the limit are split into balanced
pieces, preferring breaks at punctuation or line ends. Fragments shorter than
three words merge into a neighbour when they fit.

### 6. Bridges between passages

Patterns never cross a passage boundary. So the whole text stays connected,
Patha adds a **bridge** drill for each pair of neighbouring passages. The
bridge covers the last two words of one passage and the first two of the
next, and uses the same five patterns. For example, a bridge over `…d e | f g…`
practises `d e f g`.

## How recall is scored against the patterns

* The unit of memory is the **link** between adjacent words. Link *i* joins
  word *i* to word *i + 1* of the whole text.
* A word recited right after its neighbour **in the same segment** exercises
  that link. Moving right exercises the forward direction, moving left the
  backward direction. A pause (between segments or steps) exercises no link.
  In pada, every word stands alone, so pada trains each word in its position
  and trains no links.
* Forward and backward directions are tracked separately. In jaṭā each link
  is recited forward twice and backward once per step.

Scoring details are in `src/core/memory.js` and the scheduler in
`src/core/scheduler.js`.

## Sources

* UNESCO, *Tradition of Vedic chanting* (India). Proclaimed a Masterpiece of
  the Oral and Intangible Heritage of Humanity in 2003. Inscribed on the
  Representative List of the Intangible Cultural Heritage of Humanity in
  2008. https://ich.unesco.org/en/RL/tradition-of-vedic-chanting-00062
* Sangeet Natak Akademi (Ministry of Culture, Government of India),
  *Tradition of Vedic chanting*. https://indiaich-sna.in/tradition-of-vedic-chanting
* J. F. (Frits) Staal, *Nambudiri Veda Recitation*. Disputationes
  Rheno-Trajectinae 5. 's-Gravenhage: Mouton, 1961.
* Wayne Howard, *Veda Recitation in Vārāṇasī*. Delhi: Motilal Banarsidass,
  1986.
* Frits Staal, *Rules Without Meaning: Ritual, Mantras and the Human
  Sciences*. New York: Peter Lang, 1989.
* *Vikṛtivallī*, attributed to Vyāḍi: the traditional treatise defining the
  eight vikṛti recitations.
* Traditional teaching materials on krama, jaṭā and ghana pāṭha. These
  include the Vedic Heritage Portal of the Indira Gandhi National Centre for
  the Arts (https://vedicheritage.gov.in) and published ghana-pāṭha
  editions. They describe the numeric schemes above, the jaṭā form of the
  final pair in ghana, and the *iti* closing.
