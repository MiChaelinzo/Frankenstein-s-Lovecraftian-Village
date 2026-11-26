import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SETTINGS_KEY, DEFAULT_SETTINGS, sanitizeSettings, loadSettings, saveSettings, updateSettings, resolveSettings } from '../src/access.js';
import { STRINGS } from '../src/i18n.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const memory = (seed = {}) => { const m = new Map(Object.entries(seed)); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('settings: defaults, and unknown or damaged values fall back per field', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings({ intensity: 'dread', motion: 'off', quality: 'ultra', lang: 'de', contrast: 'yes' }), { ...DEFAULT_SETTINGS, intensity: 'dread' });
  assert.deepEqual(loadSettings(memory({ [SETTINGS_KEY]: '{not json' })), DEFAULT_SETTINGS);
});

test('settings: all five persist together in one key and round trip', () => {
  const s = memory();
  const all = { intensity: 'gentle', motion: 'on', quality: 'low', lang: 'fr', contrast: true };
  assert.equal(saveSettings(s, all), true);
  assert.deepEqual([...s.m.keys()], [SETTINGS_KEY]);
  assert.deepEqual(loadSettings(s), all);
  assert.deepEqual(updateSettings(s, { quality: 'high' }), { ...all, quality: 'high' });
  assert.deepEqual(loadSettings(s), { ...all, quality: 'high' });
  assert.equal(saveSettings(null, all), false);
  assert.equal(saveSettings({ setItem() { throw new Error('full'); } }, all), false);
});

test('settings: the older separate keys migrate once and preserve choices without the old keys', () => {
  const s = memory({ 'flv.intensity.v1': 'dread', 'flv.contrast.v1': '1', 'flv-quality': 'medium' });
  const migrated = { ...DEFAULT_SETTINGS, intensity: 'dread', contrast: true, quality: 'medium' };
  assert.deepEqual(loadSettings(s), migrated);
  assert.deepEqual(JSON.parse(s.getItem(SETTINGS_KEY)), migrated, 'the first legacy read creates the unified record');
  for (const key of ['flv.intensity.v1', 'flv.contrast.v1', 'flv-quality']) s.m.delete(key);
  assert.deepEqual(loadSettings(s), migrated, 'the unified record survives after legacy keys are removed');
  assert.deepEqual([...s.m.keys()], [SETTINGS_KEY]);
});

test('settings: invalid legacy choices become defaults in the migrated record', () => {
  const s = memory({ 'flv.intensity.v1': 'panic', 'flv.contrast.v1': 'yes', 'flv-quality': 'ultra' });
  assert.deepEqual(loadSettings(s), DEFAULT_SETTINGS);
  assert.deepEqual(JSON.parse(s.getItem(SETTINGS_KEY)), DEFAULT_SETTINGS);
});

test('settings apply: URL beats stored beats default for every setting, reduced motion follows the OS, the store or the URL', () => {
  const stored = { intensity: 'gentle', motion: 'auto', quality: 'low', lang: 'fr', contrast: true };
  const r = resolveSettings('', '', stored, false);
  assert.deepEqual([r.intensity, r.quality, r.lang, r.contrast, r.reduced], ['gentle', 'low', 'fr', true, false]);
  const o = resolveSettings('?lang=en&quality=high&contrast=0', '#intensity=dread', stored, false);
  assert.deepEqual([o.intensity, o.quality, o.lang, o.contrast], ['dread', 'high', 'en', false]);
  assert.equal(resolveSettings('?lang=xx&quality=zz', '', stored, false).lang, 'fr');
  assert.equal(resolveSettings('', '', stored, true).reduced, true);
  assert.equal(resolveSettings('', '', { ...stored, motion: 'on' }, false).reduced, true);
  assert.equal(resolveSettings('?reduced=1', '', stored, false).reduced, true);
  assert.equal(resolveSettings('?capture=1', '', stored, false).reduced, true);
  assert.equal(resolveSettings('?reduced=0', '', stored, true).reduced, true, 'the OS preference is never overridden away');
  assert.deepEqual(resolveSettings('', '', null, false), { ...DEFAULT_SETTINGS, reduced: false });
});

test('settings panel: one section in the Help dialog explains each setting, app.js saves through the one store', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8'), app = readFileSync(join(root, 'src', 'app.js'), 'utf8'), title = readFileSync(join(root, 'src', 'title-ui.js'), 'utf8');
  for (const id of ['settingsLang', 'settingsIntensity', 'settingsMotion', 'qualitySelect', 'settingsContrast']) assert.match(html, new RegExp(`id="${id}"`), id);
  for (const k of ['settings.title', 'settings.lang', 'settings.intensity', 'settings.lang.note', 'settings.intensity.note', 'settings.motion', 'settings.motion.auto', 'settings.motion.on', 'settings.motion.note', 'settings.quality.note', 'settings.contrast', 'settings.contrast.note', 'settings.where']) {
    assert.ok(STRINGS.en[k] && STRINGS.fr[k] && STRINGS.en[k] !== STRINGS.fr[k], k);
  }
  assert.match(app, /updateSettings\(storage/); assert.match(app, /resolveSettings\(/);
  assert.ok(!/storage\.setItem\(QUALITY_KEY/.test(app), 'quality no longer has its own key');
  assert.match(title, /saveLang/);
});
