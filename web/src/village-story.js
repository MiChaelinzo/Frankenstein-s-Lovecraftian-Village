// Mirror of Core/VillageStory.cs (golden-checked, key "story"): families and surnames, house ownership, missing persons, gossip, rumors, histories and legends. Pure, no DOM.
// The data file web/data/story.json is a byte copy of Packages/.../Data/story.json (tools/validate_repo.py and a test check it).
import { SeededRandom } from './core.js';
import { ROLE_IDS } from './villagers.js';

export const STORY_LANGUAGES = ['en', 'fr'];
export const STAGES = 3, TIERS = 4, MISSING_COUNT = 3;
export const OWNER_STREAM = 0x4f574e, HOME_STREAM = 0x484f4d, MISSING_STREAM = 0x4d4953, NEIGHBOUR_STREAM = 0x4e4549, GOSSIP_STREAM = 0x474f53, RUMOR_STREAM = 0x52554d, INDEX_STEP = 40503;
export const GOSSIP_NEIGHBOUR = 0, GOSSIP_FAMILY = 1, GOSSIP_MISSING = 2, GOSSIP_RUMOR = 3;

function text(o, owner) {
  if (!o || typeof o !== 'object') throw new Error(`story: ${owner} is not an object`);
  const t = {};
  for (const lang of STORY_LANGUAGES) {
    if (typeof o[lang] !== 'string' || !o[lang].trim()) throw new Error(`story: ${owner} lacks ${lang} text`);
    t[lang] = o[lang];
  }
  return t;
}
const list = (root, key) => { if (!Array.isArray(root[key])) throw new Error(`story: missing ${key} array`); return root[key]; };
const str = (o, key, owner) => { if (!o || typeof o[key] !== 'string' || !o[key]) throw new Error(`story: ${owner} lacks ${key}`); return o[key]; };

/** Parses the data file (object or text). Throws an Error naming the offending entry when it is malformed. */
export function parseStoryLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object') throw new Error('story: root is not an object');
  const families = list(root, 'families').map((o) => { const surname = str(o, 'surname', 'family'); return { surname, history: text(o, `family ${surname}`) }; });
  if (!root.districts || typeof root.districts !== 'object') throw new Error('story: missing districts object');
  const districts = {};
  for (const [id, o] of Object.entries(root.districts)) districts[id] = text(o, `district ${id}`);
  const legends = list(root, 'legends').map((o) => { const id = str(o, 'id', 'legend'); return { id, title: text(o.title, `legend ${id} title`), text: text(o.text, `legend ${id} text`) }; });
  const missing = list(root, 'missing').map((o) => {
    const id = str(o, 'id', 'missing');
    if (!Array.isArray(o.chat) || o.chat.length !== STAGES) throw new Error(`story: missing ${id} needs ${STAGES} chat lines`);
    return { id, given: text(o.given, `missing ${id} given`), chat: o.chat.map((c) => text(c, `missing ${id} chat`)), witness: text(o.witness, `missing ${id} witness`), kin: text(o.kin, `missing ${id} kin`) };
  });
  if (!root.gossip || typeof root.gossip !== 'object') throw new Error('story: missing gossip object');
  const neighbour = list(root.gossip, 'neighbour').map((o) => text(o, 'gossip neighbour')), family = list(root.gossip, 'family').map((o) => text(o, 'gossip family'));
  if (!neighbour.length || !family.length) throw new Error('story: gossip needs neighbour and family lines');
  const rumors = list(root, 'rumors').map((o) => {
    if (!Number.isInteger(o.band) || o.band < 0 || o.band >= STAGES || !Number.isInteger(o.tier) || o.tier < 0 || o.tier >= TIERS) throw new Error('story: rumor has band or tier out of range');
    return { band: o.band, tier: o.tier, text: text(o, 'rumor') };
  });
  if (!families.length) throw new Error('story: no families');
  return { families, districts, legends, missing, gossip: { neighbour, family }, rumors, familyIndex: (surname) => families.findIndex((f) => f.surname === surname) };
}

const get = (t, lang) => t[lang] || t.en;
export const surnameOf = (fullName) => { const k = fullName.lastIndexOf(' '); return k < 0 ? fullName : fullName.slice(k + 1); };

/** Stage of the campaign arc for a night: 0 early, 1 middle, 2 late (the same split as generateCampaign). */
export function stageOfNight(night, nights) {
  const n = Math.max(1, Math.min(9, nights)), i = Math.max(0, Math.min(n - 1, night - 1));
  return n === 1 ? 1 : Math.floor((i * 3) / n);
}

/** Substitutes {key} placeholders in one pass; an unknown key stays as written. */
export function render(template, vars) {
  let out = '', i = 0;
  while (i < template.length) {
    const c = template[i], close = c === '{' ? template.indexOf('}', i + 1) : -1;
    const key = close > 0 ? template.slice(i + 1, close) : null;
    if (key !== null && Object.prototype.hasOwnProperty.call(vars, key)) { out += vars[key]; i = close + 1; } else { out += c; i++; }
  }
  return out;
}

/**
 * Builds the story of one village from the roster ({index, name, role, homeIndex}), the layout pieces and the seeded names ([{en, fr}] per piece).
 * Returns { families: [{surnameIndex, surname, members, homePiece}], missing: [{dataIndex, id, familyIndex, kinIndex, witnessIndex}], owners, ...methods }.
 */
export function buildStory(lib, seed, layout, roster, names, villageName) {
  const n = layout ? layout.length : 0, famCount = lib.families.length, people = roster || [];
  const owners = new Array(n), claimed = new Array(n).fill(false), families = [], missing = [];
  for (let i = 0; i < n; i++) owners[i] = layout[i].id != null && layout[i].id.startsWith('house') ? new SeededRandom(seed ^ OWNER_STREAM ^ Math.imul(i, INDEX_STEP)).next(famCount) : -1;
  const familyFor = (s) => {
    let f = families.find((x) => x.surnameIndex === s);
    if (!f) { f = { surnameIndex: s, surname: lib.families[s].surname, members: [], homePiece: -1 }; families.push(f); }
    return f;
  };
  const assignHome = (fam, rng) => {
    const free = [];
    for (let i = 0; i < n; i++) if (owners[i] >= 0 && !claimed[i]) free.push(i);
    const roll = rng.next(Math.max(1, free.length));
    if (!free.length) return;
    fam.homePiece = free[roll]; claimed[fam.homePiece] = true; owners[fam.homePiece] = fam.surnameIndex;
  };
  for (const v of people) {
    const s = lib.familyIndex(surnameOf(v.name));
    if (s < 0) continue;
    const fam = familyFor(s);
    fam.members.push(v.index);
    if (v.homeIndex >= 0 && v.homeIndex < n && !claimed[v.homeIndex]) {
      claimed[v.homeIndex] = true; owners[v.homeIndex] = s;
      if (fam.homePiece < 0) fam.homePiece = v.homeIndex;
    }
  }
  const homeRng = new SeededRandom(seed ^ HOME_STREAM);
  for (const fam of families) if (fam.homePiece < 0) assignHome(fam, homeRng);

  const order = lib.missing.map((_, i) => i), rng = new SeededRandom(seed ^ MISSING_STREAM);
  for (let i = order.length - 1; i > 0; i--) { const j = rng.next(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  for (let k = 0; k < Math.min(MISSING_COUNT, order.length); k++) {
    const fam = familyFor(rng.next(famCount));
    if (fam.homePiece < 0) assignHome(fam, rng);
    const m = { dataIndex: order[k], id: lib.missing[order[k]].id, familyIndex: families.indexOf(fam), kinIndex: -1, witnessIndex: -1 };
    const kinRoll = rng.next(Math.max(1, fam.members.length));
    if (fam.members.length) m.kinIndex = fam.members[kinRoll];
    const others = people.filter((v) => !fam.members.includes(v.index)).map((v) => v.index);
    const witnessRoll = rng.next(Math.max(1, others.length));
    if (others.length) m.witnessIndex = others[witnessRoll];
    missing.push(m);
  }

  const story = { lib, seed, roster: people, names: names || [], villageName: villageName || '', families, missing, owners };
  const pieceName = (piece, lang, surname) => {
    const nm = piece >= 0 && piece < story.names.length ? story.names[piece] : null;
    if (nm) return get(nm, lang);
    return lang === 'fr' ? `la maison ${surname}` : `the ${surname} house`;
  };
  const neighbourOf = (index) => (people.length < 2 ? index : (index + 1 + new SeededRandom(seed ^ NEIGHBOUR_STREAM ^ Math.imul(index, INDEX_STEP)).next(people.length - 1)) % people.length);
  const villagerVars = (v, lang) => {
    const surname = surnameOf(v.name), nb = people[neighbourOf(v.index)];
    return { village: story.villageName, name: v.name, surname, home: pieceName(v.homeIndex, lang, surname), neighbour: nb.name, neighbourHome: pieceName(nb.homeIndex, lang, surnameOf(nb.name)) };
  };
  const missingVars = (m, lang) => {
    const fam = families[m.familyIndex], given = get(lib.missing[m.dataIndex].given, lang);
    return { village: story.villageName, given, surname: fam.surname, missing: `${given} ${fam.surname}`, home: pieceName(fam.homePiece, lang, fam.surname) };
  };
  const journalVillager = (book) => people.find((v) => ROLE_IDS[v.role] === book.role) || null;
  const bookVars = (book, lang) => {
    if (book.missing) { const m = missing.find((x) => x.id === book.missing); if (m) return missingVars(m, lang); }
    if (book.role) { const v = journalVillager(book); if (v) return villagerVars(v, lang); }
    return { village: story.villageName };
  };
  const pick = (t, lang) => t[lang] || t.en;

  return Object.assign(story, {
    hasMissing: (id) => missing.some((m) => m.id === id),
    ownerSurname: (piece) => (piece >= 0 && piece < owners.length && owners[piece] >= 0 ? lib.families[owners[piece]].surname : ''),
    pieceName, neighbourOf, villagerVars, missingVars,
    familyHomeName: (fam, lang) => pieceName(fam.homePiece, lang, fam.surname),
    journalOwner: (book) => { const v = book.role ? journalVillager(book) : null; return v ? v.index : -1; },
    bookTitle: (book, lang) => render(pick(book.titles, lang), bookVars(book, lang)),
    bookText(book, lang) {
      let out = render(pick(book.texts, lang), bookVars(book, lang));
      const v = book.role ? journalVillager(book) : null;
      if (v) {
        for (const m of missing) {
          const data = lib.missing[m.dataIndex], vars = { ...villagerVars(v, lang), ...missingVars(m, lang) };
          if (m.kinIndex === v.index) out += `\n\n${render(get(data.kin, lang), vars)}`;
          else if (m.witnessIndex === v.index) out += `\n\n${render(get(data.witness, lang), vars)}`;
        }
      }
      return out;
    },
    /** What villager v says about the village on a night (1-based) at a stage 0..2: { kind, subject, stage, variant }. */
    gossipFor(v, night, stage) {
      const rng = new SeededRandom(seed ^ GOSSIP_STREAM ^ Math.imul(v.index, 7919) ^ Math.imul(night, 31));
      const roll = rng.next(4), variant = rng.next(3);
      const involved = missing.findIndex((m) => m.kinIndex === v.index || m.witnessIndex === v.index);
      const g = { kind: GOSSIP_RUMOR, subject: -1, stage: Math.max(0, Math.min(STAGES - 1, stage)), variant };
      if (involved >= 0 && roll < 3) { g.kind = GOSSIP_MISSING; g.subject = involved; }
      else if (roll === 0) { g.kind = GOSSIP_NEIGHBOUR; g.subject = neighbourOf(v.index); }
      else if (roll === 1) g.kind = GOSSIP_FAMILY;
      else if (roll === 2 && missing.length) { g.kind = GOSSIP_MISSING; g.subject = variant % missing.length; }
      return g;
    },
    gossipText(g, v, night, dreadTier, lang) {
      const vars = villagerVars(v, lang);
      if (g.kind === GOSSIP_NEIGHBOUR) return render(get(lib.gossip.neighbour[g.variant % lib.gossip.neighbour.length], lang), vars);
      if (g.kind === GOSSIP_FAMILY) return render(get(lib.gossip.family[0], lang), vars);
      if (g.kind === GOSSIP_MISSING) {
        const m = missing[g.subject];
        return render(get(lib.missing[m.dataIndex].chat[g.stage], lang), { ...vars, ...missingVars(m, lang) });
      }
      return story.rumorText(night, g.stage, dreadTier, lang);
    },
    /** The rumor for a night: one of the data file's rumors of this stage and dread tier, chosen by seed and night. '' when the data has none. */
    rumorText(night, stage, dreadTier, lang) {
      const tier = Math.max(0, Math.min(TIERS - 1, dreadTier)), st = Math.max(0, Math.min(STAGES - 1, stage));
      const eligible = lib.rumors.filter((r) => r.band === st && r.tier === tier);
      if (!eligible.length) return '';
      const r = eligible[new SeededRandom(seed ^ RUMOR_STREAM ^ Math.imul(night, INDEX_STEP) ^ Math.imul(tier, 31)).next(eligible.length)];
      return render(get(r.text, lang), { village: story.villageName });
    },
  });
}

/** Display helpers for the Village chronicle panel. */
export const districtHistory = (lib, id, lang) => (lib.districts[id] ? get(lib.districts[id], lang) : '');
export const legendOf = (lib, id) => lib.legends.find((l) => l.id === id) || null;
export const familyHistory = (lib, surname, lang) => { const f = lib.families.find((x) => x.surname === surname); return f ? get(f.history, lang) : ''; };
