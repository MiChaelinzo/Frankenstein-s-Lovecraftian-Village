// Mirror of Core/VillageNames.cs (golden-checked, key "names"): building kind + district + seed -> a name no other building of the village has.
// The data file web/data/names.json is a byte copy of Packages/.../Data/names.json (tools/validate_repo.py and a test check it).
import { SeededRandom } from './core.js';
import { districtAt, DISTRICT_IDS } from './districts.js';
import { LANDMARK_IDS } from './landmarks.js';

export const NAME_LANGUAGES = ['en', 'fr'];
export const NAME_STREAM = 0x4e414d, LANDMARK_STREAM = 0x4c4d4b, INDEX_STEP = 40503, CURATED_PERCENT = 40;
const PREFIX_MARKER = '{p}';

function names(value, owner) {
  if (!Array.isArray(value)) throw new Error(`names: ${owner} is not an array`);
  return value.map((o) => {
    if (!o || typeof o !== 'object') throw new Error(`names: ${owner} holds a non-object`);
    const text = {};
    for (const lang of NAME_LANGUAGES) {
      if (typeof o[lang] !== 'string' || !o[lang].trim()) throw new Error(`names: ${owner} lacks ${lang} text`);
      text[lang] = o[lang];
    }
    return text;
  });
}

/** Parses the data file (object or text). Throws an Error naming the offending kind or landmark when it is malformed. */
export function parseNameLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root.kinds !== 'object' || !root.kinds) throw new Error('names: missing kinds object');
  if (typeof root.landmarks !== 'object' || !root.landmarks) throw new Error('names: missing landmarks object');
  const kinds = {}, landmarks = {};
  for (const [id, o] of Object.entries(root.kinds)) {
    if (!o || typeof o !== 'object') throw new Error(`names: kind ${id} is not an object`);
    if (!o.districts || typeof o.districts !== 'object') throw new Error(`names: kind ${id} lacks districts`);
    const districts = {};
    for (const [d, list] of Object.entries(o.districts)) districts[d] = names(list, `kind ${id} district ${d}`);
    const kind = { districts, any: names(o.any, `kind ${id} any`), prefixes: names(o.prefixes, `kind ${id} prefixes`), forms: names(o.forms, `kind ${id} forms`) };
    if (!kind.prefixes.length || !kind.forms.length) throw new Error(`names: kind ${id} needs prefixes and forms`);
    for (const f of kind.forms) for (const lang of NAME_LANGUAGES) if (!f[lang].includes(PREFIX_MARKER)) throw new Error(`names: kind ${id} form lacks {p} in ${lang}`);
    kinds[id] = kind;
  }
  for (const [id, list] of Object.entries(root.landmarks)) {
    const l = names(list, `landmark ${id}`);
    if (!l.length) throw new Error(`names: landmark ${id} has no names`);
    landmarks[id] = l;
  }
  return { kinds, landmarks };
}

function candidate(kind, curated, fromCurated, index) {
  if (fromCurated) return curated[index];
  const prefix = kind.prefixes[Math.floor(index / kind.forms.length)], form = kind.forms[index % kind.forms.length], text = {};
  for (const lang of NAME_LANGUAGES) text[lang] = form[lang].replace(PREFIX_MARKER, prefix[lang]);
  return text;
}

/**
 * One name { en, fr } per layout piece, in layout order (null for a kind with no words). Unique by English text; when every candidate of a kind
 * is taken the pick gets " 2", " 3" and so on. The choice never depends on the language.
 */
export function assignNames(lib, seed, gridW, gridD, layout) {
  const used = new Set(), result = [];
  layout.forEach((piece, i) => {
    const kind = lib.kinds[piece.id];
    if (!kind) { result.push(null); return; }
    const districtId = DISTRICT_IDS[districtAt(seed, gridW, gridD, piece.x, piece.z)];
    const curated = [...(kind.districts[districtId] || []), ...kind.any];
    const composed = kind.prefixes.length * kind.forms.length;
    const rng = new SeededRandom(seed ^ NAME_STREAM ^ (i * INDEX_STEP));
    const curatedFirst = curated.length > 0 && rng.next(100) < CURATED_PERCENT;
    const start = rng.next(1000000);
    const firstSize = curatedFirst ? curated.length : composed, secondSize = curatedFirst ? composed : curated.length;
    let pick = null, first = null;
    for (let k = 0; k < firstSize + secondSize && !pick; k++) {
      const inFirst = k < firstSize, size = inFirst ? firstSize : secondSize;
      const cand = candidate(kind, curated, inFirst ? curatedFirst : !curatedFirst, (start + k) % size);
      if (!first) first = cand;
      if (!used.has(cand.en)) { used.add(cand.en); pick = cand; }
    }
    for (let n = 2; !pick; n++) {
      const numbered = {};
      for (const lang of NAME_LANGUAGES) numbered[lang] = `${first[lang]} ${n}`;
      if (!used.has(numbered.en)) { used.add(numbered.en); pick = numbered; }
    }
    result.push({ en: pick.en, fr: pick.fr });
  });
  return result;
}

/** The seeded name { en, fr } of one landmark of the wider world, or null for an unknown id. */
export function landmarkTitle(lib, seed, id) {
  const slot = LANDMARK_IDS.indexOf(id), list = lib.landmarks[id];
  if (slot < 0 || !list) return null;
  const pick = list[new SeededRandom(seed ^ LANDMARK_STREAM ^ (slot * INDEX_STEP)).next(list.length)];
  return { en: pick.en, fr: pick.fr };
}

/** The name text in a language; falls back to English for an unknown language. */
export const nameText = (name, lang) => (name ? name[lang] || name.en : '');

/** The name of a layout piece in a language (names are attached to pieces as piece.names by app.js), or '' when the piece has none. */
export const placeName = (piece, lang) => nameText(piece && piece.names, lang);
