import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCampaign, generateRitual } from '../src/core.js';
import { createProgressController } from '../src/progress-ui.js';

function make(seed = 1818) {
  const campaign = generateCampaign(seed);
  const state = { seed, campaign, ritual: generateRitual(campaign), ritualStage: 0 };
  const logs = [];
  const el = () => ({ hidden: true, innerHTML: '', textContent: '', setAttribute() {} });
  const els = {};
  const c = createProgressController({ $: (id) => (els[id] ||= el()), tr: (k) => k, state, log: (kind, t) => logs.push([kind, t]), announce() {}, fetchJson: async () => null });
  return { c, state, logs };
}

test('visiting every night earns the nights achievement', () => {
  const { c, state, logs } = make();
  c.update();
  state.campaign.nights.forEach((_, i) => { c.note.night(i); c.update(); });
  assert.ok(c.snapshot().ach.includes('nights'));
  assert.ok(logs.some(([k]) => k === 'achievement'));
});

test('restore keeps saved achievements and codex', () => {
  const { c } = make();
  c.update();
  c.restore({ codex: [], ach: ['whisper'] });
  assert.ok(c.snapshot().ach.includes('whisper'));
});
