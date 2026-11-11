# Build log

A short history of how this project was built, taken from `git log` on the `feat/innovations-round3` branch. Every hash below exists in this repository. Specs referenced live in `.kiro/specs/` (`requirements.md`, `design.md`, `tasks.md`). Run `git log --oneline` to check any line.

## Scaffold (2026-11-09)
- `018953b` Unity 6 HDRP skeleton, Kiro specs, hooks, steering and docs.
- `f1333a9` JS port of Core with C# golden parity tests (tasks 15 and 16 in `tasks.md`).
- `f91da70` First canvas web demo with sanity-driven dread, narration and URL seed sharing.
- `feb1c90` GitHub Pages workflow and repo validation (task 17).
- `fba7e81` `DreadCurve`, `HttpNarrationProvider`, `DreadVolumeBlender` (tasks 12 and 13, unverified in the Unity editor).

## Depth (2026-11-10)
- `dfab0e7` Core dread events, village report, prefab name matcher (tasks 18 to 20).
- `5b3cea7` Web port of events and reports with golden parity (task 21).
- `b191a32` Editor `CatalogAutoBinder` and omen event on the director (task 22, unverified in Unity).
- `2f5544e` Web demo polish: omens, journal, report download, keyboard, reduced motion (task 23).
- `49ca91f`, `a721c68` Screenshot helper and screenshots (task 24).
- `9c36a2d` CI workflow, contributing guide, changelog (task 25).
- `453bbd7` Unity follow-ups for the event buffer, rebind and `pieceCount` default.

## Innovations round 3
- `85053d1` Seeded `CampaignGenerator` in Core with JS port and golden parity (task 29).
- `2a80782` Web campaign panel, sky tint, rain, fog and postcard export (task 30).
- The commit that adds this file also adds the in-browser parity self-test (`web/selftest.html`) and `WalkthroughController.cs` (task 31 and 32).

## Real pack round (branch feat/pack-demo-round4)
- `5db49bf` Ignore `Assets/_DLNK` and `web/local-pack`, validator probes.
- `a9d7251` `tools/fetch_pack.py`: reproducible anonymous download of both packages.
- `804aa64` Inspector scans scenes for prefab references, reports folders and no meshes.
- `8af25c4` Matcher ignores single-letter tokens; catalog `prefabHint` and `Resolve`.
- `8e12695` Matcher and hints ported to JS and the inspector, golden parity extended.
- `9324320` Auto-binder prefers `prefabHint` (unverified in Unity).
- `63f14df` `tools/build_local_pack.py` builds the ignored `web/local-pack/`.
- `4d835c9` `?pack=1` pack mode in the web demo.
- Finding: both packages are render-pipeline editions with no meshes; church, well and altar hints are stand-ins.

## DLNK integration round (branch feat/dlnk-integration-round6)
- `86de580` Core `DreadBuildingPolicy` with JS port and golden parity.
- `f2f4c27` Runtime DLNK bridges and `docs/DLNK_INTEGRATION.md` (unverified in Unity).
- `221290e` Web demo: texture themes, floor peel, camera modes, door omens, omen detail, accessibility and idle redraw skip; `web/src/building.js` with node tests. Pack-mode screenshots were kept only in the git-ignored `web/local-pack/screenshots/`.
- `54a978b` Docs: DEMO_SCRIPT rewrite, README, CHANGELOG, BUILD_LOG and .kiro updates for the web building features.
- Review fixes: camera bridge keeps the requested mode apart from the allowed one and no longer evaluates against a default dread; global detail semantics documented. Bridges remain untested and uncompiled. Canvas drawing (floor peel, door rings, procedural patterns) was only checked manually in headless Chromium, not by automated tests.

## Hosting round (branch feat/hosting-and-story-round7)
- `0641715` Hosting configs: `netlify.toml`, `vercel.json`, `web/_headers`.
- `f7ebb5b` `tools/stage_web.py` with test, validator checks for the hosting files.
- `c4221c0` `web/test/paths.test.js` (root and sub-path mounts on a local server) and `pages.yml` uploads staged `dist`.
- `394dc94` `docs/HOSTING.md`, honest README and Devpost checklist, CHANGELOG and .kiro updates.
- Finding: none of the hosts were contacted; no live URL is confirmed and GitHub Actions is blocked by a billing lock.

## Story mode UI round (branch feat/hosting-and-story-round7)
- `d02428b` `web/src/music.js` and `web/src/intro.js` pure helpers with node tests.
- `bef0d79` Story mode panel, intro dialog, opt-in procedural soundtrack with volume and mute, smoke test coverage. Headless screenshots of the intro and a night 3 story beat were checked; audio output was not listened to.

## What is and is not verified
- Verified by running them: the C# Core property tests (`dotnet test`), the JS tests (`node --test`), the golden parity between the two, the repo validator, and the self-test page in headless Chromium (`docs/media/selftest.png`).
- Never compiled or run in the Unity editor: everything under `Assets/Scripts/Runtime` and `Assets/Scripts/Editor`, including `WalkthroughController.cs`.
- Real packages: downloaded, inspected and used for the local `?pack=1` mode here; pack content is never committed. Still not opened in Unity.

## Story sequencer
- `83bbd83` Core `StorySequencer` (`StoryBeats.cs`), JS port `web/src/story.js`, property tests, golden `stories` parity, `web/test/story.test.js`. Test counts after: node 65, dotnet 46. Story UI not yet built.

## Round 8 web features
- `5f58929` Session, minimap, case file, i18n stub, perf HUD, PWA offline shell, header and stage tests. Headless screenshot (non-pack, `?map=1&perf=1&lang=fr`) checked. Service worker not tested in a real browser or on a host.

## Ritual chain
- `cd24f48` Core `RitualChain.cs`, JS port `generateRitual`, C# property tests, golden `rituals` parity.
- `94a4a56` Web: ritual stage in the night panel and journal, `ritualHudText`, case file `## Ritual` section, node tests. Not seen in a screenshot (the screenshot helper output was unreadable in this session).

## Round 8 fixes
- `f6ac618` Service worker offline fallback to index.html now only for navigation requests; `isNavigation` tested in pwa.test.js.

## Round 9 ritual stage resolution
- `a9d4138` Core `ScheduledStageForNight`, `Progress`, `RitualSaveState`, JS port, golden `progress` parity, xunit and node tests.
- `cbaa3b6` Web: HUD, journal, case file and session show night schedule, dread-reached and effective stage (en and fr).
- `6bf7297` Unity `RitualDirector`, `RitualStateAsset`, `RitualSaveBridge`. Not compiled: Unity is not installed here.

## Round 9 investigator
- `20d139d` Core `Investigator.cs`, JS port, property tests, golden `investigators` parity, self-test group.
- Web wiring (toggle, canvas, minimap, journal, screen reader text) and docs: see the next commit. Screenshot `docs/media/investigator.png` shows the web demo only.
