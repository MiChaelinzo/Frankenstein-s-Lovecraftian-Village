# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Web: cinematic capture mode (`B`, the Cinematic button or `?cinematic=1`). Hides the page chrome, shows a large caption and runs a scripted camera pan and zoom through the current night's story beats on the fixed story beat timings, then returns to the normal page. The timeline is a pure function (`web/src/cinematic.js`, `cinematicFrame`) with node tests; under reduced motion the camera stays still and only the beats advance. `B` or `Esc` leaves early.
- Web: gamepad and touch controls through a pure, tested mapping (`web/src/input.js`). The Gamepad API is polled in `requestAnimationFrame` only after a pad connects (stick or d-pad pick a landmark, A listen, B door, X whisper, Y candle, Start story, Select cinematic). Touch: swipe sideways to pick a landmark, up for a candle, down for a whisper. Not tried on a physical gamepad or touch device here.
- Web accessibility: skip link to the village view, labelled journal sidebar, live caption region in cinematic mode, gamepad and touch help in the keys list (en and fr).
- Core `Investigator` (`Investigator.cs`): a seeded investigator walks a lantern route (nearest-neighbour tour of up to 10 village pieces, one cell per tick) and loses 3 to 7 sanity the first time it passes within 2 cells of an altar, well, church or dead tree. JS port in `web/src/core.js`, xunit property tests, golden `investigators` parity and a self-test group. Web: off by default (default demo output unchanged), toggled with `I`, the Investigator button or `?investigator=1`; draws a lantern figure and trail, a minimap marker and journal entries on sanity hits; the screen reader description now lists what stands in the village and where the investigator is (en and fr). Spec task 48.
- Ritual stage resolution: `RitualChain.ScheduledStageForNight` and `RitualChain.Progress` (JS `ritualProgress`) combine the night schedule, the dread-reached stage and an effective stage (the night sets a floor; dread can run ahead) with a behind/on/ahead pace. The web HUD, journal and case file show "Night schedule: stage X of N, dread reached: stage Y" (en and fr); nothing was removed. New Core `RitualSaveState` (round trip and clamp), session carries the stage, golden `progress` parity, new xunit and node property tests including a ritual/story/campaign consistency invariant.
- Unity: `RitualDirector` (UnityEvent `OnStageAdvanced`), `RitualStateAsset` and `RitualSaveBridge` (spec task 47). Code-complete but unverified in Unity: the scripts were not compiled here, only the Core logic is tested.
- Core: `RitualChain` (`RitualChain.cs`) builds a seeded cult ritual across campaign nights: ritual name, one stage per night (ordered stage names, sigil, rising dread threshold never above the night's target, omen id `tier.index`, link to the night's omen story beat) plus `StageForDread`. JS port `generateRitual` in `web/src/core.js`, C# property tests (determinism, monotonic stages, bounds, beat links), golden `rituals` parity. Web: the night panel shows the current ritual stage, the journal logs stage advances as omens, and the case file gains a `## Ritual` section. Unity-side ritual scripts are planned only (tasks 46 and 47), not built.
- Web: story mode panel (Previous, Next, Play/Pause, Exit, `S` key, `#story=1&night=N&beat=N` and `?story=1&autoplay=1` deep links), skippable intro dialog (`web/src/intro.js`, `?intro=0`, auto-skip on deep links, static under reduced motion), and an original procedural WebAudio soundtrack (`web/src/music.js`, opt-in, volume, mute `U`, reduced-motion aware) replacing the old drone. No audio files. Node tests `music.test.js`, `intro.test.js`, extended smoke test. The audio itself was not heard in this environment (headless), only its pure helpers are tested.
- Core: `StorySequencer` (`StoryBeats.cs`) builds an ordered list of story beats per campaign night (title, rumor, lore, omen chosen by dread tier with `SeededRandom`, sky and weather note) plus navigation and reading-time helpers. JS port in `web/src/story.js` with deep link parsing (`#story=N&beat=N`). C# property tests, golden parity (`stories`), `web/test/story.test.js` and a self-test group. The story mode UI is not part of this commit.
- Web: session save/load/auto-resume (`web/src/session.js`, localStorage guarded, relative share link), village minimap and legend (`G`, `?map=1`), case file export in Markdown and HTML (`web/src/casefile.js`, deterministic), `?lang=fr` string table with English fallback (`web/src/i18n.js`, partial UI routing), optional performance readout (`X`, `?perf=1`), and an offline service worker plus web manifest (`web/sw.js`, https/localhost only, never caches local-pack or `?pack=1`). CSP gains `worker-src 'self'; manifest-src 'self'` in all three header files. Node tests for every new module and the precache list. Offline behaviour was not exercised on a real host.

### Fixed
- Web: cinematic takes are isolated. The investigator pauses while a take runs, gamepad and swipe actions are gated by a tested `gateAction` (only the exit action passes), story autoplay resumes after a take that started with it playing, `touchcancel` resets the swipe, and the canvas uses `touch-action: none` so vertical swipes (candle, whisper) can fire (page scroll over the canvas is disabled).
- Unity: `RitualDirector.Refresh` now calls `Save()` when the stage advances, so the saved ritual state is written. Still uncompiled and unverified in Unity.
- Web: `applyI18n()` ran twice at start-up; it now runs once.
- Web: the service worker's offline `index.html` fallback now applies only to navigation requests (`mode === 'navigate'` or `Accept: text/html`). A failed script, stylesheet or JSON request uses its own cached copy or fails normally instead of receiving HTML. Tested via `isNavigation` in `web/test/pwa.test.js`; still not exercised on a real host.
- Web: the top hint is hidden while an omen banner shows, so they no longer overlap. A visible notice appears when `night=N` exceeds the campaign length and is clamped (`nightClampNotice`, tested).
- `DlnkCameraModeBridge.ApplySuggested` no longer overwrites the player's `Requested` mode (new `Suggested` field). `DlnkTownManagerBridge` adds `onAggregateChanged(mean, counts)`, `MeanLevel` and `LevelCounts`. Both Unity scripts are uncompiled.
- Tools: `fetch_pack.py` checks pinned SHA-256 values from the README (or `--expect`) and exits non-zero on mismatch; new `tools/test_fetch_pack.py` and `tools/test_headers.py` (header parity across netlify.toml, vercel.json, web/_headers).

### Changed
- Runtime: `VillageBuilder.pieceCount` default raised from 40 to 80 to match the web demo. Existing Unity scenes that rely on the default will generate a larger village; set it back to 40 to keep the old layout.
- Web: changing the seed now re-applies the selected night's sanity so the night panel and scene agree.
- Runtime: `WalkthroughController.CurrentNight` returns null before `Start` instead of throwing. The controller and `RebindSelected` are still not compiled in CI.
- Runtime: `DlnkCameraModeBridge` stores the requested mode separately (restored when dread falls below Abyss) and defers `RequestInt` until a dread value is known. Still never compiled in Unity.

### Added
- Hosting: `netlify.toml`, `vercel.json` and `web/_headers` (publish `web`, no build, no rewrites, security headers), `tools/stage_web.py` (stages `web/` to git-ignored `dist/` without `local-pack`) with `tools/test_stage_web.py`, `web/test/paths.test.js` (relative paths, root and sub-path mounting), `docs/HOSTING.md`, validator checks, and `pages.yml` now uploads the staged `dist`. Untested against real hosts; no live URL is confirmed and GitHub Actions is blocked by a billing lock.
- Web demo, DLNK-style buildings (`web/src/building.js`, node tested): texture themes (Bricks, Plaster, Tiles, Wood, Rocks, Water) mapped to the DLNK groups Construction, Manmade and Nature in procedural and `?pack=1` modes with fallback, top-down floor peel/cutaway and camera selector restricted by `allowedCamera`, clickable doors driven by `doorOmen` with toast, shake and aria-live announcements, omen-driven detail via `detailLevel`, URL params `theme`, `cam`, `floor`, keys `T V F O`, focus styles, reduced motion, and an idle redraw skip (reduced motion redraws only on change; off-screen canvas pauses). Journal no longer has its own aria-live; a dedicated status region announces toasts.
- Docs: `docs/DEMO_SCRIPT.md` rewritten for the new outline, with a section on why third-party promo footage is not used.
- DLNK adapter layer: Core `DreadBuildingPolicy` (per-building detail level, top-down floor peel, omen driven door behavior, camera mode policy) with property tests, JS port and golden parity; Runtime `DlnkTownManagerBridge`, `DlnkBuildingFloorBridge`, `DlnkDoorOmenBridge`, `DlnkCameraModeBridge` and `IBuildingDetailTarget` (UnityEvents only, never compiled in Unity); `docs/DLNK_INTEGRATION.md` with confirmed vs guessed. Credit: DLNK Works.
- Real pack round: `tools/fetch_pack.py` (reproducible anonymous download), inspector scene scanning (`referencedPrefabs`, summary, no-mesh report), catalog `prefabHint` with `PrefabNameMatcher.Resolve` (church, well and altar are stand-ins), matcher fix so single-letter tokens no longer match, `tools/build_local_pack.py` and `?pack=1` local pack mode in the web demo. Run against the real URP and HDRP packages; nothing pack-derived is committed. `Assets/_DLNK/` and `web/local-pack/` are gitignored and checked by the validator. Binder changes unverified in Unity.
- Tools: `tools/inspect_unitypackage.py` inventories a local `.unitypackage` (extension counts, prefab GUIDs and pathnames) and suggests catalog id to prefab matches with `PrefabNameMatcher` scoring; output is gitignored and payloads are never extracted. Unit tested on a synthetic package and since run on the real packages.
- Web: `web/selftest.html` runs the JS Core against the embedded C# golden vectors in the browser (126 checks, shown pass/fail); `tools/embed_golden.mjs` regenerates `web/src/golden-data.js` and a node test fails if it drifts. Screenshot: `docs/media/selftest.png`.
- Runtime: `WalkthroughController` steps the director through a seeded campaign (never compiled in Unity).
- Docs: `docs/BUILD_LOG.md`, a history tied to real commits.
- Core: `CampaignGenerator` (seeded multi-night arc with village name, titles, strictly rising dread targets, sky, weather, rumors and lore), with C# property tests, golden parity and a JS port in `web/src/core.js`.
- Web demo: campaign panel with night selector (`,` `.`), `#night=N` share links, dusk/night/witching tint, rain and fog weather (static under reduced motion), and postcard PNG export (`P`). Screenshot: `docs/media/campaign-night5.png`.
- Core: `DreadEvents` (Uneasy, Dire and Abyss thresholds with hysteresis), `VillageReport` (Markdown and JSON), `PrefabNameMatcher`, each with property tests.
- Golden parity extended to cover dread events and reports; the JS port in `web/src/core.js` matches C# exactly.
- Editor: `CatalogAutoBinder` binds catalog ids to imported pack prefabs by name (unverified in the Unity editor).
- `HorrorAmbienceDirector` raises an omen event when a dread threshold is crossed (unverified in the Unity editor).
- Web demo: canvas-fitted board with 80 pieces, gable houses, sea and marsh, lantern cultists, sky eye at Abyss, tentacles at Dire and Abyss, omen toasts, Whispers journal, Markdown and JSON report download, keyboard shortcuts, reduced motion support (`prefers-reduced-motion` or `?reduced=1`) and a responsive layout.
- `tools/screenshot.sh` and screenshots in `docs/media/`.
- CI workflow (`ci.yml`), `CONTRIBUTING.md`, this changelog.
- Validator checks for the new files and for em dashes in tracked text files.

### Notes
- The web demo uses 80 pieces on a 24x24 grid and `VillageBuilder` now defaults to `pieceCount` 80 on 24x24. Match the seed too for the same village (unverified in Unity).
- `HorrorAmbienceDirector` reuses an event buffer (new `DreadEventTracker.Update(dread, buffer)` overload); `CatalogAutoBinder` gains a rebind-all menu item and ordinal tie-breaking for duplicate prefab names (unverified in Unity).

## [0.1.0]

### Added
- Unity 6 HDRP project skeleton, pure C# Core (`SeededRandom`, `PrefabCatalog`, `VillageLayoutGenerator`, `SanityModel`, narration providers, `DreadCurve`), Unity Runtime glue and property-based tests.
- Kiro specs, steering and hooks; `tools/validate_repo.py` guardrails.
- Browser demo in `web/` with golden parity tests against C# and a GitHub Pages workflow.
- Docs: Kiro usage, demo script, Devpost draft, blog draft.
