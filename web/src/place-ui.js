// Round 31 (spec 164): the walkable places of the wider world (the Abandoned Manor). No DOM of its own: it turns the Core ruled placements (places.js) into the props, procedural
// geometry and interaction points the 3D view draws, and applies what the explorer does there (step in, leave, find a discovery, open the hidden tunnel).
// deps: { state (seed), gridW, gridD, tr, lang(), night?() (1 based), board (noteClue, knowledge, places), notify(text), moveTo(x, z), arm?() }
import { parsePlaceLibrary, findPlace, placePlace, placeDressing, trailDressing, lanternPoints, revealedAt, placeParts, discoveryPoint, enterPlace, leavePlace, EXIT_DOOR, EXIT_TUNNEL, tunnelOpen, MANOR } from './places.js';
import { parseKnowledgeLibrary, benefitsAt } from './knowledge.js';

const EYE = 1.1; // metres: the prompt spheres sit a little below eye height so they are picked from the door

export function createPlacesController(deps) {
  const { state, gridW, gridD } = deps;
  let sceneKey = '', sceneItems = [], lib = null, knowledge = null, siteSeed = null, sites = [];

  /** Loads data/places.json and data/knowledge.json (objects). Without them no place is drawn or can be entered. */
  function setData(placesJson, knowledgeJson) {
    lib = placesJson ? parsePlaceLibrary(placesJson) : null;
    knowledge = knowledgeJson ? parseKnowledgeLibrary(knowledgeJson) : null;
    siteSeed = null; sceneKey = ''; deps.board.setPlaces(lib);
  }
  const lang = () => (typeof deps.lang === 'function' ? deps.lang() : deps.lang);
  const say = (t) => (t[lang()] || t.en);

  /** The placements of this village, in data order, placed so none overlaps an earlier one. Cached by seed. */
  function placed() {
    if (!lib) return [];
    if (siteSeed !== state.seed) {
      siteSeed = state.seed; sites = [];
      const standing = [];
      for (const data of lib.places) { const p = placePlace(data, state.seed, gridW, gridD, standing); standing.push(p); sites.push({ data, p }); }
    }
    return sites;
  }

  /** All props of all places as dressing items (collision and meshes come from the existing kinds). */
  const dressing = () => placed().flatMap(({ data, p }) => [...placeDressing(data, p), ...trailDressing(data, p, state.seed, gridW, gridD)]);
  /** Procedural boxes of all places for a graphics tier (0 low, 1 medium, 2 high). */
  const parts = (tier) => placed().flatMap(({ data, p }) => placeParts(data, p, tier));
  const key = () => `${state.seed}|${lib ? lib.places.length : 0}`;
  /** Whether a discovery can be found now: its clue, knowledge tier and tonight's reality distortions (a dimensional tear needs eldritch science and a night that warps that way). */
  const findable = (d, found) => revealedAt(d, found, knowledge, state.seed, deps.night ? deps.night() : 1, deps.board.knowledge().tier);
  const tunnelIsOpen = (data) => !!knowledge && tunnelOpen(data, benefitsAt(knowledge, deps.board.knowledge().tier));

  /** Interaction points for the view: the way in, the way back, each discovery and the hatch. Each is { key, pos: [x, y, z], label }. */
  function points() {
    const out = [];
    for (const { data, p } of placed()) {
      const at = (pt) => [pt[0], EYE, pt[1]];
      out.push({ key: `${data.id}:enter`, pos: at(p.entrance), label: say(data.prompts.enter) });
      out.push({ key: `${data.id}:leave`, pos: at(p.door), label: say(data.prompts.leave) });
      const lanterns = lanternPoints(data, p);
      if (lanterns.length) out.push({ key: `${data.id}:follow`, pos: at(lanterns[0]), label: say(data.prompts.leave) }); // the way back: follow the lanterns out
      const found = deps.board.evidence().clueIds;
      for (const d of data.discoveries) if (findable(d, found)) out.push({ key: `${data.id}:find:${d.id}`, pos: ((w) => [w[0], 0.9, w[1]])(discoveryPoint(p, d)), label: say(d.title) });
      out.push({ key: `${data.id}:hatch`, pos: at(p.hatch), label: say(tunnelIsOpen(data) ? data.prompts.hatch : data.prompts.sealed) });
    }
    return out;
  }

  /** What the 3D view needs, or null while there is no data: a key that changes with the village, the props, the interaction points and the boxes for a graphics tier. */
  function scene() {
    if (!lib) return null;
    placed();
    if (sceneKey !== key()) { sceneKey = key(); sceneItems = dressing(); }
    return { key: sceneKey, items: sceneItems, points: points(), partsFor: parts };
  }

  /** Applies an interaction by key. Returns true when it was one of ours. */
  function interact(k) {
    if (typeof k !== 'string') return false;
    const [id, what, sub] = k.split(':'), data = lib ? findPlace(lib, id) : null, site = data ? placed().find((s) => s.data === data) : null;
    if (!site) return false;
    const p = site.p;
    if (what === 'enter') { const to = enterPlace(p); deps.moveTo(to[0], to[1]); return true; }
    if (what === 'leave' || what === 'follow') { const to = leavePlace(p, EXIT_DOOR); deps.moveTo(to[0], to[1]); return true; }
    if (what === 'find') {
      const d = data.discoveries.find((x) => x.id === sub);
      if (!d || !findable(d, deps.board.evidence().clueIds)) return false;
      deps.board.noteClue(d.clue);
      deps.notify(`${say(d.title)}: ${say(d.text)}`);
      return true;
    }
    if (what === 'hatch') {
      if (!tunnelIsOpen(data)) { deps.notify(say(data.prompts.sealed)); return true; }
      const to = leavePlace(p, EXIT_TUNNEL); deps.moveTo(to[0], to[1]); deps.notify(say(data.tunnelFound));
      return true;
    }
    return false;
  }

  return { setData, placed, dressing, parts, points, scene, interact, key, isReady: () => !!lib, manorId: MANOR };
}
