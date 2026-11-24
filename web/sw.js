// Offline cache for the static demo. Network first, cache fallback. Precaches only the explicit list below.
// It never touches local-pack (licensed art stays out of caches) and never serves or stores anything for ?pack=1.
const CACHE = 'flv-shell-v81';
const PRECACHE = [
  './', 'index.html', 'selftest.html', 'meshes.html', 'style.css', 'manifest.webmanifest', 'icon.svg',
  'data/village_catalog.json', 'data/stitch.json', 'data/village_shapes.json', 'data/lore_books.json', 'data/items.json', 'data/creatures.json', 'data/homestead.json', 'data/names.json', 'data/mythos.json', 'data/memory.json', 'data/chronicle.json', 'data/seedshare.json', 'data/reality.json', 'data/knowledge.json', 'data/story.json', 'data/statements.json', 'data/outcomes.json', 'data/places.json', 'data/theories.json',
  'src/access.js', 'src/mythos.js', 'src/outcomes.js', 'src/memory.js', 'src/chronicle-prose.js', 'src/export-text.js', 'src/reality.js', 'src/places.js', 'src/place-ui.js', 'src/theory.js', 'src/theory-ui.js', 'src/knowledge.js', 'src/board-ui.js', 'src/corruption-tell.js', 'src/society-ui.js', 'src/birds.js', 'src/achievements.js', 'src/app.js', 'src/building.js', 'src/casefile.js', 'src/cinematic.js', 'src/codex.js', 'src/core.js', 'src/daily.js', 'src/draw.js', 'src/golden-data.js', 'src/input.js', 'src/journal.js', 'src/investigator-state.js', 'src/i18n-text.js', 'src/i18n.js', 'src/title-ui.js', 'src/title.js',
  'src/minimap.js', 'src/music.js', 'src/dlnk-layout.js', 'src/glb.js', 'src/meshes-page.js', 'src/pack.js', 'src/perf.js', 'src/quality.js', 'src/progress-gate.js', 'src/progress-ui.js', 'src/scene.js', 'src/selftest-page.js', 'src/selftest.js',
  'src/creatures.js', 'src/creature-ui.js', 'src/landmarks.js', 'src/lighthouse.js', 'src/proc-textures.js', 'src/session.js', 'src/shapes.js', 'src/story-ui.js', 'src/stitch.js', 'src/story.js', 'src/textures.js', 'src/tour-ui.js', 'src/tour.js', 'src/touch-ui.js', 'src/util.js', 'src/villager-narrator.js', 'src/villager-ui.js', 'src/villager-view.js', 'src/view3d-math.js', 'src/view3d.js', 'src/vigil-ui.js', 'src/vigil-view.js', 'src/clock.js', 'src/daylight.js', 'src/dressing.js', 'src/districts.js', 'src/villagers.js', 'src/lore.js', 'src/names.js', 'src/village-story.js', 'src/society.js', 'src/director.js', 'src/investigation.js', 'src/chronicle-ui.js', 'src/lore-ui.js', 'src/inventory.js', 'src/inventory-ui.js', 'src/homestead.js', 'src/homestead-ui.js', 'src/world-scale.js', 'src/streets.js',
  'assets/meshes/house_a.glb', 'assets/meshes/house_b.glb', 'assets/meshes/church.glb', 'assets/meshes/well.glb', 'assets/meshes/altar.glb', 'assets/meshes/dead_tree.glb', 'assets/meshes/lamp.glb', 'assets/meshes/boat.glb', 'assets/meshes/dock.glb', 'assets/meshes/fence.glb', 'assets/meshes/cliff_rock.glb', 'assets/meshes/lamp_tall.glb', 'assets/meshes/lamp_double.glb',
  'assets/meshes/cottage_thatch.glb', 'assets/meshes/cottage_tall.glb', 'assets/meshes/inn.glb', 'assets/meshes/chapel.glb', 'assets/meshes/lighthouse.glb', 'assets/meshes/market_stall.glb', 'assets/meshes/crate_stack.glb', 'assets/meshes/barrel.glb', 'assets/meshes/gravestone.glb', 'assets/meshes/gravestone_cross.glb', 'assets/meshes/fence_iron.glb', 'assets/meshes/villager.glb',
  'assets/meshes/cart.glb', 'assets/meshes/sack.glb', 'assets/meshes/wall_low.glb', 'assets/meshes/net.glb', 'assets/meshes/bench.glb', 'assets/meshes/sign.glb', 'assets/meshes/wall_lantern.glb', 'assets/meshes/tree.glb', 'assets/meshes/bush.glb', 'assets/meshes/reeds.glb', 'assets/meshes/rock.glb', 'assets/meshes/laundry_line.glb',
  'assets/meshes/grass_tuft.glb', 'assets/meshes/stump.glb', 'assets/meshes/log.glb', 'assets/meshes/woodpile.glb', 'assets/meshes/hedge.glb', 'assets/meshes/picket_fence.glb', 'assets/meshes/bollard.glb', 'assets/meshes/rope_coil.glb', 'assets/meshes/crop_row.glb', 'assets/meshes/wheel_ruts.glb', 'assets/meshes/tentacle_tree.glb', 'assets/meshes/tentacle_sapling.glb', 'assets/meshes/fungus_tall.glb', 'assets/meshes/fungus_cluster.glb', 'assets/meshes/fungus_shelf.glb', 'assets/meshes/spire_horn.glb', 'assets/meshes/spire_ribbed.glb', 'assets/meshes/shipwreck.glb', 'assets/meshes/abbey_arch.glb', 'assets/meshes/abbey_wall.glb', 'assets/meshes/abbey_pillar.glb', 'assets/meshes/marsh_pool.glb', 'assets/meshes/path_stone.glb', 'assets/meshes/hs_mound.glb', 'assets/meshes/hs_sprout.glb', 'assets/meshes/hs_turnip.glb', 'assets/meshes/hs_cabbage.glb', 'assets/meshes/hs_glowcap.glb', 'assets/meshes/hs_kelp.glb', 'assets/meshes/hs_eyeroot.glb', 'assets/meshes/hs_fence.glb', 'assets/meshes/hs_trough.glb', 'assets/meshes/hs_scarecrow.glb', 'assets/meshes/hs_coop.glb', 'assets/meshes/hs_chicken.glb', 'assets/meshes/hs_goat.glb', 'assets/meshes/hs_cat.glb', 'assets/meshes/hs_lantern_moth.glb', 'assets/meshes/hs_tide_hound.glb', 'assets/meshes/hs_jar_tentacle.glb',
];
// Only page navigations may fall back to index.html offline; scripts, styles and JSON must never receive HTML.
const isNavigation = (req) => req.mode === 'navigate' || (req.headers && req.headers.get('accept') || '').includes('text/html');
const skip = (url) => url.pathname.includes('/local-pack/') || url.searchParams.get('pack') === '1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((p) => new URL(p, self.registration.scope).href))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || skip(url)) return;
  const listed = PRECACHE.some((p) => new URL(p, self.registration.scope).pathname === url.pathname);
  if (!listed) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.origin + url.pathname, copy)); }
    return res;
  }).catch(() => caches.match(url.origin + url.pathname).then((hit) => hit || (isNavigation(req) ? caches.match(new URL('index.html', self.registration.scope).href) : Response.error()))));
});
