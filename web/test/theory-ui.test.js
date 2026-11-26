import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compactLog } from '../src/theory-ui.js';
import { barRows, BAR_KEYS } from '../src/society-ui.js';
import { replayTheories, choice, CHOICE_THEORY, CHOICE_OPTION, CHOICE_EVIDENCE, CHOICE_CONCLUDE, parseTheoryLibrary, theoryInstances } from '../src/theory.js';

test('barRows lists trust, the four axes and the corruption stage on one 0..1000 scale', () => {
  const rows = barRows(640, { fear: 100, faith: 200, loyalty: 300, obsession: 400 }, 3);
  assert.deepEqual(rows.map((r) => r.key), BAR_KEYS);
  assert.deepEqual(rows.map((r) => r.value), [640, 100, 200, 300, 400, 750]);
  assert.equal(barRows(NaN, { fear: 0, faith: 0, loyalty: 0, obsession: 0 }, 0), null);
  assert.equal(barRows(500, null, 0), null);
});

test('compactLog rebuilds exactly the same theory state as the long log', () => {
  const lib = parseTheoryLibrary(readFileSync(new URL('../data/theories.json', import.meta.url), 'utf8'));
  const instances = [{ kind: 0, subject: 0, truth: 0 }, { kind: 1, subject: 0, truth: 1 }];
  const beliefs = new Map([[0, 80], [1, 40], [2, 60]]);
  const long = [choice(CHOICE_THEORY, 1), choice(CHOICE_OPTION, 2), choice(CHOICE_EVIDENCE, 0), choice(CHOICE_EVIDENCE, 0), choice(CHOICE_EVIDENCE, 1), choice(CHOICE_CONCLUDE, 0), choice(CHOICE_THEORY, 0), choice(CHOICE_OPTION, 1), choice(CHOICE_EVIDENCE, 2)];
  const a = replayTheories(lib, instances, beliefs, long), b = replayTheories(lib, instances, beliefs, compactLog(a));
  assert.deepEqual(b.list, a.list);
  assert.equal(b.current, a.current); assert.equal(b.currentOption, a.currentOption); assert.deepEqual(b.currentEvidence, a.currentEvidence);
  assert.equal(b.rejected, 0);
});

test('the theory builder is keyboard reachable and wired in the board, the ending and the save (round 30)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="boardTheoryBody"/); assert.match(html, /id="boardBars"/); assert.match(html, /id="endingTheory"/);
  assert.match(app, /theory\.snapshot\(\)/); assert.match(app, /theory\.restore\(v\)/); assert.match(app, /restoreSessionControllers\(saved\)/); assert.match(app, /epilogue: \(id\) => \(theory \? theory\.epilogue\(id\)/);
  assert.match(app, /trustLost: \(\) => \(theory \? theory\.trustLost\(\)/); assert.match(app, /knowledgeBonus: \(\) => \(theory \? theory\.knowledgeBonus\(\)/);
});
