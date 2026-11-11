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
  c.arm(); c.update();
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

test('preview (not armed) awards nothing, logs nothing, announces nothing', () => {
  const { c, state, logs } = make();
  state.ritualStage = 3;
  const said = []; 
  c.update(); c.update();
  assert.deepEqual(c.snapshot(), { codex: [], ach: [] });
  assert.ok(!logs.some(([k]) => k === 'codex' || k === 'achievement'));
  assert.equal(c.isArmed(), false);
});

test('first player action arms; awards happen once and are announced once per batch', () => {
  const said = [], logs = [];
  const campaign = generateCampaign(13), state = { seed: 13, campaign, ritual: generateRitual(campaign), ritualStage: 3 };
  const el = () => ({ hidden: true, innerHTML: '', textContent: '', setAttribute() {} }), els = {};
  const c = createProgressController({ $: (id) => (els[id] ||= el()), tr: (k) => k, state, log: (k, t) => logs.push(k), announce: (t) => said.push(t), fetchJson: async () => null });
  c.update();
  assert.equal(said.length, 0);
  c.note.whisper(); c.update();
  const snap = c.snapshot();
  assert.ok(snap.ach.includes('whisper'));
  assert.ok(snap.codex.length >= 4);
  assert.equal(said.length, 1);
  c.update();
  assert.equal(said.length, 1);
  assert.deepEqual(c.snapshot(), snap);
});

test('restore keeps saved ids without logging or announcing, and disarm returns to preview', () => {
  const { c, logs } = make();
  c.update();
  c.restore({ codex: ['s0'], ach: ['whisper', 'doors'] });
  c.update();
  assert.deepEqual(c.snapshot(), { codex: ['s0'], ach: ['whisper', 'doors'] });
  assert.equal(logs.length, 0);
  c.arm(); c.disarm();
  assert.equal(c.isArmed(), false);
});
