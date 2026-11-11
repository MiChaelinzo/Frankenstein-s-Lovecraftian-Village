// Mirror of Assets/Scripts/Core/CodexModel.cs (golden-checked in web/test/parity.test.js). Necronomicon codex and bestiary. Entries are seeded from the ritual chain and the dread omens, so each village
// reveals its own order of creatures. Pure: no DOM. Texts live in i18n (codex.creature.N, codex.omen.N, codex.sigil.X).
import { SeededRandom } from './core.js';

export const CREATURE_COUNT = 9;
export const OMEN_TIERS = 3;

/** Seeded permutation of creature indices, so a ritual stage always shows the same creature for a seed. */
export function creatureOrder(seed) {
  const rng = new SeededRandom((seed | 0) ^ 0x3c0de5);
  const order = Array.from({ length: CREATURE_COUNT }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = rng.next(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

/** All entries for a ritual: one per stage (creature + sigil) and one per omen tier. Ids are stable: s0.., o1... */
export function codexEntries(ritual) {
  if (!ritual || !Array.isArray(ritual.stages)) return [];
  const order = creatureOrder(ritual.seed);
  const out = ritual.stages.map((st, i) => ({ id: `s${i}`, kind: 'stage', index: i, creature: order[i % CREATURE_COUNT], sigil: st.sigil, stageName: st.name, night: st.nightNumber }));
  for (let t = 1; t <= OMEN_TIERS; t++) out.push({ id: `o${t}`, kind: 'omen', tier: t });
  return out;
}

/** Ids unlocked by reaching ritual stage `stage` (-1 for none) and omen tier `tier` (0 for none). */
export function unlockedIds(ritual, stage, tier) {
  const ids = [];
  if (!ritual || !Array.isArray(ritual.stages)) return ids;
  for (let i = 0; i < ritual.stages.length && i <= stage; i++) ids.push(`s${i}`);
  for (let t = 1; t <= OMEN_TIERS && t <= tier; t++) ids.push(`o${t}`);
  return ids;
}

/** Adds ids to a Set; returns the ids that were new, in order. Ignores ids that are not entries of this ritual. */
export function unlockInto(set, ritual, ids) {
  const valid = new Set(codexEntries(ritual).map((e) => e.id));
  const fresh = [];
  for (const id of ids) if (valid.has(id) && !set.has(id)) { set.add(id); fresh.push(id); }
  return fresh;
}
