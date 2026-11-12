// Offline cache for the static demo. Network first, cache fallback. Precaches only the explicit list below.
// It never touches local-pack (licensed art stays out of caches) and never serves or stores anything for ?pack=1.
const CACHE = 'flv-shell-v13';
const PRECACHE = [
  './', 'index.html', 'selftest.html', 'meshes.html', 'style.css', 'manifest.webmanifest', 'icon.svg',
  'data/village_catalog.json', 'data/stitch.json',
  'src/access.js', 'src/achievements.js', 'src/app.js', 'src/building.js', 'src/casefile.js', 'src/cinematic.js', 'src/codex.js', 'src/core.js', 'src/daily.js', 'src/draw.js', 'src/golden-data.js', 'src/input.js', 'src/journal.js', 'src/investigator-state.js', 'src/i18n-text.js', 'src/i18n.js', 'src/title-ui.js', 'src/title.js',
  'src/minimap.js', 'src/music.js', 'src/dlnk-layout.js', 'src/glb.js', 'src/meshes-page.js', 'src/pack.js', 'src/perf.js', 'src/progress-gate.js', 'src/progress-ui.js', 'src/scene.js', 'src/selftest-page.js', 'src/selftest.js',
  'src/session.js', 'src/story-ui.js', 'src/stitch.js', 'src/story.js', 'src/textures.js', 'src/tour-ui.js', 'src/tour.js', 'src/touch-ui.js', 'src/util.js', 'src/view3d-math.js', 'src/view3d.js', 'src/vigil-ui.js', 'src/vigil-view.js',
  'assets/meshes/house_a.glb', 'assets/meshes/house_b.glb', 'assets/meshes/church.glb', 'assets/meshes/well.glb', 'assets/meshes/altar.glb', 'assets/meshes/dead_tree.glb', 'assets/meshes/lamp.glb', 'assets/meshes/boat.glb', 'assets/meshes/dock.glb', 'assets/meshes/fence.glb', 'assets/meshes/cliff_rock.glb', 'assets/meshes/lamp_tall.glb', 'assets/meshes/lamp_double.glb',
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
