// Runs the JS Core against golden vectors emitted by the C# test suite. Pure functions, usable
// from the browser (selftest.html) and from node:test.
import {
  SeededRandom, PrefabCatalog, generateLayout, SanityModel, StaticNarrationProvider,
  DreadEventTracker, eventToString, buildVillageReport, reportToMarkdown, reportToJson, generateCampaign,
} from './core.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function runSelfTest(golden, catalogEntries) {
  const catalog = new PrefabCatalog(catalogEntries);
  const results = [];
  const check = (group, label, fn) => {
    let pass = false, detail = '';
    try { pass = fn() === true; } catch (e) { detail = String(e && e.message || e); }
    results.push({ group, label, pass, detail: pass ? '' : (detail || 'mismatch') });
  };

  for (const g of golden.rng) check('Random', `seed ${g.seed}`, () => {
    const r = new SeededRandom(g.seed), r2 = new SeededRandom(g.seed);
    return same(g.uints.map(() => r.nextUInt()), g.uints) && same(g.next10.map(() => r2.next(10)), g.next10);
  });
  for (const g of golden.layouts) check('Layout', `seed ${g.seed} ${g.width}x${g.depth}x${g.count}`, () =>
    same(generateLayout(catalog, g.width, g.depth, g.count, g.seed).map((p) => [p.id, p.x, p.z, p.sizeX, p.sizeZ]), g.pieces));
  const narrator = new StaticNarrationProvider();
  golden.narration.forEach((n, i) => check('Narration', `line ${i + 1} at ${n.location}`, () => narrator.narrate(n.location, n.dread) === n.text));
  golden.dread.forEach(([s, d]) => check('Dread', `sanity ${s}`, () => SanityModel.dreadFor(s) === d));
  golden.events.forEach((g, i) => check('Events', `sequence ${i + 1}`, () => {
    const t = new DreadEventTracker();
    return same(g.dreads.map((d) => t.update(typeof d === 'string' ? Number(d) : d).map(eventToString)), g.events);
  }));
  for (const g of golden.reports) check('Report', `seed ${g.seed} dread ${g.dread}`, () => {
    const r = buildVillageReport(catalog, generateLayout(catalog, 24, 24, 40, g.seed), 24, 24, g.seed, g.dread);
    return reportToMarkdown(r) === g.markdown && reportToJson(r) === g.json;
  });
  for (const g of golden.campaigns) check('Campaign', `seed ${g.seed} nights ${g.requested}`, () => {
    const c = generateCampaign(g.seed, g.requested);
    return c.villageName === g.villageName &&
      same(c.nights.map((n) => [n.number, n.title, n.dreadTargetPercent, n.sanityStart, n.sky, n.weather, n.rumor, n.lore]), g.nights);
  });
  return results;
}
