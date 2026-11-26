// Round 37 (spec 179): JS port of Core/ContentLibrary.cs. Golden key "content". Pure, no DOM, no saved state.
// The data files web/data/content/*.json are byte copies of Packages/.../Data/content/*.json (tools/validate_repo.py and a test check it).
// References to real theory, statement and omen ids are checked by tools/content_schemas.py; this loader checks the shape the game relies on and throws naming the file, the item and the field.
export const CONTENT_LANGUAGES = ['en', 'fr'];
export const MIN_NIGHT = 1, MAX_NIGHT = 99;

const root = (input, key) => {
  if (input === null || input === undefined || (typeof input === 'string' && !input.trim())) return [];
  const doc = typeof input === 'string' ? JSON.parse(input) : input, file = `${key}.json`;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error(`${file}: root is not an object`);
  if (doc.version !== 1) throw new Error(`${file}: field 'version': must be 1`);
  if (!Array.isArray(doc[key])) throw new Error(`${file}: field '${key}': must be a list`);
  for (const o of doc[key]) if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${file}: ${key} holds a non-object`);
  return doc[key];
};
const idOf = (o, key, seen, kind) => {
  if (typeof o.id !== 'string' || !o.id) throw new Error(`${key}.json: a ${kind} lacks an id`);
  if (seen.has(o.id)) throw new Error(`${key}.json: ${kind} '${o.id}': field 'id': duplicate id`);
  seen.add(o.id);
  return o.id;
};
const list = (o, field, prefix) => { if (!Array.isArray(o[field]) || o[field].length === 0) throw new Error(`${prefix}: field '${field}': must be a non empty list`); return o[field]; };
const strings = (o, field, prefix) => list(o, field, prefix).map((s) => { if (typeof s !== 'string' || !s) throw new Error(`${prefix}: field '${field}': holds a non-string`); return s; });
/** owner is the message prefix up to the field name without its closing quote, as in Core. */
const text = (d, owner) => {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`${owner}': must be an object with en and fr`);
  const t = {};
  for (const lang of CONTENT_LANGUAGES) {
    if (typeof d[lang] !== 'string' || !d[lang].trim()) throw new Error(`${owner}.${lang}': missing or empty`);
    t[lang] = d[lang];
  }
  return t;
};

/** Parses the three files (text or objects; null or '' means the file is absent). Returns { quests, rumors, events }. Throws an Error naming the file, the item and the field. */
export function parseContentLibrary(questsInput, rumorsInput, eventsInput) {
  let seen = new Set();
  const quests = root(questsInput, 'quests').map((o) => {
    const id = idOf(o, 'quests', seen, 'quest'), p = `quests.json: quest '${id}'`, theory = strings(o, 'theory', p), evidence = strings(o, 'evidence', p), conclusions = {};
    for (const c of list(o, 'conclusions', p)) {
      if (!c || typeof c.theory !== 'string' || !theory.includes(c.theory)) throw new Error(`${p}: field 'conclusions.theory': must be one of this quest's theory ids`);
      conclusions[c.theory] = text(c, `${p}: field 'conclusions`);
    }
    return { id, theory, evidence, conclusions };
  });
  seen = new Set();
  const rumors = root(rumorsInput, 'rumors').map((o) => {
    const id = idOf(o, 'rumors', seen, 'rumor'), p = `rumors.json: rumor '${id}'`;
    if (typeof o.truth !== 'boolean') throw new Error(`${p}: field 'truth': must be true or false`);
    return { id, truth: o.truth, mutations: list(o, 'mutations', p).map((m) => text(m, `${p}: field 'mutations`)) };
  });
  seen = new Set();
  const events = root(eventsInput, 'events').map((o) => {
    const id = idOf(o, 'events', seen, 'event'), p = `events.json: event '${id}'`;
    if (!Number.isInteger(o.night) || o.night < MIN_NIGHT || o.night > MAX_NIGHT) throw new Error(`${p}: field 'night': must be an integer ${MIN_NIGHT}..${MAX_NIGHT}`);
    if (typeof o.condition !== 'string' || !o.condition) throw new Error(`${p}: field 'condition': missing`);
    const effects = {};
    for (const [k, v] of Object.entries(o.effects || {})) { if (!Number.isInteger(v)) throw new Error(`${p}: field 'effects.${k}': must be an integer`); effects[k] = v; }
    return { id, night: o.night, condition: o.condition, text: text(o.text, `${p}: field 'text`), effects };
  });
  return { quests, rumors, events };
}

/** The authored events told on night when newOmen (the omen id new that night, or '') is its omen, in file order. A client shows them only when the player has learned of that omen. */
export const contentEventsFor = (lib, night, newOmen) => (!lib || !newOmen ? [] : lib.events.filter((e) => e.night === night && e.condition === newOmen));

/** One line per item, as Core ContentLibraryTests.Signature builds it, for the golden parity test. */
export function contentSignature(lib) {
  return [
    ...lib.quests.map((q) => `quest|${q.id}|${q.theory.join(',')}|${q.evidence.join(',')}|${Object.entries(q.conclusions).map(([k, v]) => `${k}=${v.en}/${v.fr}`).join('~')}`),
    ...lib.rumors.map((r) => `rumor|${r.id}|${r.truth ? 'True' : 'False'}|${r.mutations.map((m) => `${m.en}/${m.fr}`).join('~')}`),
    ...lib.events.map((e) => `event|${e.id}|${e.night}|${e.condition}|${e.text.en}/${e.text.fr}|${Object.entries(e.effects).map(([k, v]) => `${k}=${v}`).join(',')}`),
  ];
}
