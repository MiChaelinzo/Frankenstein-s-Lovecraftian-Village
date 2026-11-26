// Round 37 (FEAT-003 item 1): the one terminology table. Each concept has one English and one French term. terminology.test.js
// checks the UI strings, the data files and the English docs against it, so a synonym creeping in fails the build.
// The French UI strings are ASCII only (no accents), as in i18n.js; the data files keep their accents.
export const CONCEPTS = [
  { id: 'trust', en: 'trust', fr: 'confiance', exact: { 'society.bar.trust': ['Trust', 'Confiance'] },
    forbidden: { en: ['mistrust', 'confidence in you'], fr: ['crédulité', 'credulite'] } },
  { id: 'suspicion', en: 'suspicion', fr: 'mefiance', contains: { 'society.trust.1': ['suspicion', 'mefiance'] },
    forbidden: { en: ['wariness', 'suspicion level'], fr: ['soupcon', 'suspicion'] } },
  { id: 'fear', en: 'fear', fr: 'peur', exact: { 'society.axis.fear': ['Fear', 'Peur'], 'society.bar.fear': ['Fear', 'Peur'] },
    forbidden: { en: ['fright', 'terror', 'terrified of you'], fr: ['crainte', 'terreur', 'frayeur'] } },
  { id: 'faith', en: 'faith', fr: 'foi', exact: { 'society.axis.faith': ['Faith', 'Foi'], 'society.bar.faith': ['Faith', 'Foi'] },
    forbidden: { en: ['devotion', 'piety'], fr: ['piete', 'devotion'] } },
  { id: 'loyalty', en: 'loyalty', fr: 'loyaute', exact: { 'society.axis.loyalty': ['Loyalty', 'Loyaute'], 'society.bar.loyalty': ['Loyalty', 'Loyaute'] },
    forbidden: { en: ['allegiance', 'fealty'], fr: ['fidelite', 'allegeance'] } },
  { id: 'obsession', en: 'obsession', fr: 'obsession', exact: { 'society.axis.obsession': ['Obsession', 'Obsession'], 'society.bar.obsession': ['Obsession', 'Obsession'] },
    forbidden: { en: ['fixation', 'monomania'], fr: ['fixation', 'hantise', 'monomanie'] } },
  { id: 'corruption', en: 'corruption', fr: 'corruption', exact: { 'society.bar.corruption': ['Corruption', 'Corruption'] },
    forbidden: { en: ['tainted', 'taint', 'defilement'], fr: ['souille', 'souillure', 'contamination'] } },
  // knowledge tiers: the word for the step is "tier" in English and "niveau" in French; the tier names come from Data/knowledge.json only
  { id: 'knowledge-tier', en: 'knowledge tier', fr: 'niveau',
    contains: { 'board.knowledge': ['Knowledge tier', 'niveau'], 'chronicle.knowledge': ['Knowledge tier', 'niveau'], 'board.knowledge.gain': ['tier', 'niveau'] },
    forbidden: { en: ['knowledge level', 'knowledge rank', 'knowledge stage', 'forbidden text\\b', 'cult secret\\b', 'village lore', 'outer truths', 'eldritch sciences'], fr: ['palier de savoir', 'rang de savoir'] } },
  // outcomes of the missing: the word is "outcome" in English; the four ids are fixed in Data/outcomes.json
  { id: 'outcome', en: 'outcome', fr: 'issue', forbidden: { en: ['missing fate', 'missing person.s fate'], fr: [] } },
  // creature tiers: the manifestation tier is a number 1 to 4 in Data/creatures.json, called "tier" in the docs
  { id: 'creature-tier', en: 'tier', fr: 'niveau', forbidden: { en: ['creature rank', 'creature level', 'creature class'], fr: ['rang de creature'] } },
];
