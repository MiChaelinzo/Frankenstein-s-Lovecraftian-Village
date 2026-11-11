import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newJournal, addJournalEntry, selectJournalTab, tabForKey, STORY_MAX, PROGRESS_MAX } from '../src/journal.js';
import { settleProgress } from '../src/progress-gate.js';
import { STRINGS } from '../src/i18n.js';
import { generateCampaign, generateRitual } from '../src/core.js';
import { unlockedIds } from '../src/codex.js';
import { newStats } from '../src/achievements.js';

test('narration and omens survive 25 progress entries', () => {
  let j = newJournal();
  j = addJournalEntry(j, { kind: 'narration', text: 'The well hums.', sanity: 70 });
  j = addJournalEntry(j, { kind: 'omen', text: 'The sky bruises.', sanity: 60 });
  for (let i = 0; i < 25; i++) j = addJournalEntry(j, { kind: i % 2 ? 'codex' : 'achievement', text: `p${i}`, sanity: 50 });
  assert.deepEqual(j.story.map((e) => e.kind), ['omen', 'narration']);
  assert.equal(j.progress.length, PROGRESS_MAX);
  assert.equal(j.progress[0].text, 'p24');
});

test('story list is capped and newest first; duplicates are dropped', () => {
  let j = newJournal();
  for (let i = 0; i < 30; i++) j = addJournalEntry(j, { kind: 'narration', text: `n${i}`, sanity: 1 });
  assert.equal(j.story.length, STORY_MAX);
  assert.equal(addJournalEntry(j, { kind: 'narration', text: 'n29', sanity: 1 }).story, j.story);
});

test('unseen badge counts progress entries until the Progress tab opens', () => {
  let j = newJournal();
  j = addJournalEntry(j, { kind: 'codex', text: 'a', sanity: 1 });
  j = addJournalEntry(j, { kind: 'achievement', text: 'b', sanity: 1 });
  assert.equal(j.unseen, 2);
  j = selectJournalTab(j, 'progress');
  assert.equal(j.unseen, 0);
  j = addJournalEntry(j, { kind: 'codex', text: 'c', sanity: 1 });
  assert.equal(j.unseen, 0);
  assert.equal(selectJournalTab(j, 'nope'), j);
});

test('tab keys wrap and support Home/End', () => {
  assert.equal(tabForKey('story', 'ArrowRight'), 'progress');
  assert.equal(tabForKey('progress', 'ArrowRight'), 'story');
  assert.equal(tabForKey('story', 'ArrowLeft'), 'progress');
  assert.equal(tabForKey('progress', 'Home'), 'story');
  assert.equal(tabForKey('story', 'End'), 'progress');
  assert.equal(tabForKey('story', 'a'), null);
});

test('settleProgress: preview changes nothing, armed awards once', () => {
  const campaign = generateCampaign(13), ritual = generateRitual(campaign);
  const unlockable = unlockedIds(ritual, 3, 0), stats = newStats();
  stats.whispers = 1; stats.codexTotal = ritual.stages.length + 3;
  const codex = new Set(), earned = new Set();
  assert.deepEqual(settleProgress({ armed: false, codex, earned, ritual, unlockable, stats }), { fresh: [], won: [] });
  assert.equal(codex.size + earned.size, 0);
  const a = settleProgress({ armed: true, codex, earned, ritual, unlockable, stats });
  assert.equal(a.fresh.length, 4); assert.ok(a.won.includes('whisper'));
  const b = settleProgress({ armed: true, codex, earned, ritual, unlockable, stats });
  assert.deepEqual(b, { fresh: [], won: [] });
});

test('fr has the journal tab keys and the markup wires them', () => {
  for (const k of ['tab.story', 'tab.progress', 'journal.badge', 'empty.progresslog']) { assert.ok(STRINGS.en[k], k); assert.ok(STRINGS.fr[k], k); }
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['tab-story', 'tab-progress', 'pane-story', 'pane-progress', 'progressLog', 'progressBadge']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('role="tablist"') && html.includes('role="tabpanel"'));
});
