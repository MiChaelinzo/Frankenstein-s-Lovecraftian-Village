
## Round 12 DLNK scene, Blender, Unity compile check
- `31c9139` Stub-based Unity compile check with CI and validator wiring (0 errors, one CS0649 warning, one missing `FileUtil` stub added).
- `2c81654` MCP preparation prompts and steering note (MCP not run, no `mcp.json`).
- `e13ea24` DLNK scene layout parser and material properties in the local pack builder.
- `3eb6a3c` DLNK scene mode (`?pack=1&scene=`) with validated layout and material-driven tint.
- `e508f0c` Scenes fitted by percentile bounds, softer dread tint.
- `abe8b32` Headless Blender scripts for original catalog meshes, sprites and local texturing.
- `7a1e4e7` Original GLB meshes with a dependency-free web viewer and Blender docs.
- Unverified: no Unity run, no MCP use, no live URL or deploy, EXR lightmaps not decoded, only headless Chrome used.
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

## Verification status (Verified, Partially Verified, Unverified)
- Verified by running them: the C# Core property tests (`dotnet test`), the JS tests (`node --test`), the golden parity between the two, the repo validator, and the self-test page in headless Chromium (`docs/media/selftest.png`).
- Unverified (never compiled or run in the Unity editor; compile against stubs is Partially Verified): everything under `Assets/Scripts/Runtime` and `Assets/Scripts/Editor`, including `WalkthroughController.cs`.
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
- `f1236a7` Web wiring (toggle, canvas, minimap, journal, screen reader text) and docs. Screenshot `docs/media/investigator.png` shows the web demo only.

## Round 9 cinematic, input and accessibility
- `252b411` Web cinematic capture mode (`web/src/cinematic.js`, pure timeline, still camera under reduced motion), gamepad and touch mapping (`web/src/input.js`), skip link and caption live region, duplicate `applyI18n()` call removed. Test counts after: node 131, dotnet 58. Headless screenshot `docs/media/cinematic.png` checked (web demo only). Gamepad and touch not tried on real hardware.
- `ac165d9` Docs: README, CHANGELOG, DEMO_SCRIPT clean take steps, Devpost checklist, tasks 49 to 52, steering. Offscreen terrain cache skipped (task 52): ground and sea redraw from dread, the easing camera squash and pack patterns each frame.

## Round 10 pack screenshot hang
- Root cause: headless virtual-time artifact, not an app bug (live CDP session: 118 rAF frames in 3 s with pack vs 181 without, screenshot in 194 ms; `?pack=1&reduced=1` works under virtual time, animated pack run exits 124 even with a 300 ms budget). Fix: `?capture=1` (static frame) added by `tools/screenshot.sh` for pack queries, plus a hard `timeout`. Commit hash recorded in the git log (`fix: pack screenshot hang`).

## Round 10 minor review notes
- `7acbb4f` Input-aware cinematic exit hint, touch Exit button, `web/src/investigator-state.js` with tests, translated page title and meta description, precache reachability test. Node tests 138, selftest 270 of 270 passing headless. Terrain cache (task 52) revisited and rejected: not pixel-identical possible.

## Round 10 judge-facing features
- `f16567b` Stitch panel from `tools/gen_stitch.py` repo data (validator checks freshness), seeded codex and achievements saved in the session (backward compatible), high-contrast theme, opt-in daily village with injectable clock. Node tests 159, selftest 273 of 273 headless, tools tests and dotnet 58 pass. Headless screenshots occasionally exit 124 under virtual time on the unchanged base too; retrying succeeds.
- `c702b0a` Docs and web-demo screenshots `docs/media/stitch.png`, `codex.png`, `contrast.png` (each under 700 KB).

## Round 10 editor window and invariants
- `02a7309` Added `VillageCoreInspectorWindow` (Unity Editor, uncompiled, unverified in Unity) and six dotnet plus six node invariant tests. dotnet 64 passing. No Core change, golden untouched.
- `692a59e` Review fixes: nights achievement hook wired, restore before first autosave, controller test, CONTRIBUTING notes on stitch regen and `capture=1`. Journal flooding left as is: at most 1-2 lines per action, deep links collapse to one summary line.

## Round 11 journal, tour and polish
- `c47a25d` Progress previews on deep links and restore until the first player action (`web/src/progress-gate.js`, tests). Codex and achievements are only awarded after a player action.
- `0c43015` Story and Progress journal tabs with an unseen badge (`web/src/journal.js`, tests).
- `bc2e65b` Opt-in judge tour, About dialog, static and perf budget tests, judge quick start in the README, `--blood` colour change, service worker cache `flv-shell-v4`.
- `c9fa15c` Tour card placement fix: pure `tourCardPlacement`, max height with scroll, higher z-index, re-placed on resize. The clipping seen in a 1280x720 headless screenshot is mostly a capture artifact (about 50 px missing at that size; 1280x770 and 390x800 show the full card), so this is a guard, not a proven user bug. Node tests 208 passing at that point.
- Unverified: no real browser session, no live URL, no Unity, GitHub Actions blocked by an account billing lock.
- `eb8d406` Docs: round 11 changelog, build log, specs, steering, demo script and Devpost checklist.
- `d8e833c` Review fixes: progress armed on keyboard paths, tour Escape stops propagation, pointerleave only restarts the timer, auto-advance paused while About is open. Node tests 210.
- `5ceb841` Docs: changelog for the round 11 review fixes.
- `45a1dce` Tour remembers a key or hover stop across About resume and pointerleave; fake-DOM tests of `createTourController` cover Escape propagation and pause/resume. Node tests 212, dotnet 64. Still no real browser session. Arming remains per call site (non-blocking, left as is).

## Round 13 architecture audit
- `9112c8f` Moved codex, achievement, daily seed, sanity cost, floor count, detail summary, ambience volume and dread percent rules into Core with property tests, golden entries and JS mirror tests. dotnet 80 passing, node 235. Fixed a half-rounding mismatch between Runtime (`Mathf.RoundToInt`) and Core/web.
- `c706b1f` Logged swallowed errors, removed dead exports and duplicated helpers. UnityCompileCheck stub gained `UnityWebRequest.error`.
- Unverified: Unity was never run; Runtime edits are compile checked against stubs only.
- Horror design review (this commit, hash in `git log`): seeded lightning and shake, capped flash gate, coalesced shorter banners, `web/test/notice-policy.test.js`. Feel is Partially Verified; no real browser session.

## Round 14 Unity package
- `d5376b9` Moved Core, Runtime, Editor and the catalog into `Packages/com.michaelinzo.frankenstein-village`; fixed test csproj, tools, hooks, docs path references. Tests unchanged (dotnet 80, node 248).
- `3ba196a` Core `InteractionRules` and property tests (dotnet 87 after follow-up tests).
- `20b6a51` Playable layer (`FirstPersonExplorer`, `InteractionRaycaster`, `DreadHud`, `PlayableVillageSceneBuilder`), package `.meta` generator, validator checks. UnityCompileCheck 0 errors.
- `f4667e1` `docs/UNITY_SETUP.md`, MCP prompt, README Play in Unity.
- Unverified: Unity was not installed or run; nothing here ran in the editor.

## Round 14
- `c083174` JS `InteractionRules` mirrored in `core.js` with golden parity section `interaction`.
- `56cc0c7` Opt-in WebGL first-person view (`view3d-math.js`, `view3d.js`, `glb.js` buffers, input mappings, 20 node tests). Headless Chromium rendered it with SwiftShader (`docs/media/view3d-village.png`, `view3d-dread.png`). Interactive controls (pointer lock, touch, gamepad) were not exercised in a browser.
- Live deployment at https://frankensteinlovecraftianvillage.vercel.app/. `python3 tools/check_live.py` passed 10/10 (HTTP 200 and content types, CSP, HSTS, 404 for the local pack). Unverified: real-browser behavior on the host, Unity.

- Docs for the demo video: timed `docs/DEMO_SCRIPT.md`, `docs/KIRO_PITCH.md` (spoken script and Devpost write-up). Documentation only; nothing was recorded or run in Unity.

## Round 15 commits
- `a86d2d6` 3D fly-through, layered fog, coast, church hill, omens, pack textures, frame budget.
- `1221474` Real-browser check tool, `setPointerCapture` guard, verification labels.
- `3ee8f90` Codex, achievements and daily seed wired into Unity Runtime, localized prompts. dotnet 94, node 285. Unity Unverified.
- Docs commit for this round: hash in `git log`. Freshness checked: `gen_stitch.py`, `gen_package_meta.py` (0 files to write), golden, sw.js precache and CSP via tests. All `tools/test_*.py` exit 0 on the final run.

## Round 15 real-browser verification
- Added `tools/browser_check.mjs` (run: `python3 -m http.server 8123 -d web`, then `node tools/browser_check.mjs`; Chromium headless shell with SwiftShader flags, real time, no virtual-time budget). `frameStats` has a node test (`web/test/browser-check.test.js`); node tests 285.
- Final run 23 of 23 passed: sanity 100 to 82 and a whisper after `[ [ w`; G, K, X open panels; journal tab click and ArrowLeft; door button 3 to 4 journal entries; O runs clean; story S, `.` (beat 1 to 2 of 5), Escape; `?tour=1` Enter twice (stop 2 to 4 of 12), Left (3), Escape closes; `?view=3d` WebGL canvas 950 px wide; W and A each changed the screenshot hash; click acquired pointer lock, first Escape released it, second exited to 2D; with `requestPointerLock` removed drag-look changed the frame, click-pick and single Escape worked; `?view=3d&cinematic=1` frames changed over 2.5 s with the first story caption; 0 uncaught errors.
- Real bug found by an earlier run of the same driver: `canvas.setPointerCapture` threw `InvalidStateError` in `onPointerDown`. Fixed with a guard in `web/src/view3d.js`; the rerun was clean.
- Frame time (real time, rAF timestamps over a 6 s walk, 259 frames): mean 23.2 ms (about 43 fps), median 16.7, p95 33.5, max 100 on ANGLE SwiftShader software GL. Indicative of CPU rendering only, not GPUs.
- Not exercised: clicking a specific door in 3D (E was run with no door in reach), touch, gamepad, other browsers, the live Vercel host in a real browser (`python3 tools/check_live.py` passed 10/10 at HTTP level), Unity. The live host does not yet include round 15.

### Round 15 review follow-up

- `flyStop` seed hash now uses `Math.imul(seed | 0, 2654435761) >>> 0`, so large seeds no longer lose low bits (matches an integer-wrapping port).
- Known gap (not fixed): Unity interaction prompts pass `Focus.locationId` to `PromptStrings.Prompt`, so names are raw ids while the web shows `locName`. Localized place names in Core would need a name table mirrored from `i18n-text.js` plus a drift test; deferred. Unverified in Unity.
- Daily seed ordering: not changed. `ProgressionTracker.Awake` sets `walkthrough.seed`, and `WalkthroughController` generates in `Start`; Unity runs every `Awake` before any `Start`, so the order holds. Unverified in Unity.
- `tools/browser_check.mjs` is a manual, environment-specific tool (Chromium path default and `--no-sandbox`), not part of the pre-merge suite or CI.

## Round 16 commits
- `3dceaae` Core `FlythroughPath`, `WebShareLink` and place names with golden parity (dotnet 101, was 94; node 289 at that point).
- `1c1e5cf` Unity showcase camera (`VillageFlythroughCamera`), `WebDemoUrlMenu`, DLNK pack tools over Core. Compile checked only.
- `a53f10d` 3D fly-through frames the eye and tentacles at Dire and Abyss.
- `797b408` Original boat, dock, fence, cliff rock and two lamp meshes (13 in total) wired into the 3D coast and the meshes page.
- `4a35b93` `tools/browser_check.mjs` extended to 30 checks, prop and omen framing tests. Local 30 of 30; live 28 of 30 (the host predates round 16).
- Docs commit for this round: hash in `git log`. Demo script (side by side), `docs/RECORDING.md`, `docs/PACK_EXPLORATION.md`, MCP prompts 8 to 12. Scene names (Coast Scene, Assets 1.0, MystVillage) and the 14 prefabs were read from the git-ignored HDRP and URP packages with a pathname listing; no derived data committed. Node tests 294.
- Unverified: Unity. It cannot be installed or run in the sandbox (Personal licence activation is tied to the author's Unity account), so Unity code is Partially Verified (compile check against stubs) and Unverified at runtime.

## Round 17 commits
From `git log` (oldest first, after the round 16 merge); the final polish commit is in `git log`.
- `2cd66f8` docs: vigil design
- `8b1c92b` feat: add vigil rules to Core
- `05783be` test: vigil property tests and golden
- `de44bf1` feat: forward vigil events in ProgressionTracker
- `1efdae1` feat: mirror vigil in web core
- `bc94391` feat: vigil objective HUD, lanterns, endings dialog and result card
- `e1730a0` test: browser check covers the vigil
- `051fd91` docs: vigil web wiring and changelog
- `3813eb4` feat: original 1200x630 open graph preview image
- `31f7441` feat: title screen with 3D and 2D entry, help overlay, loading veil and share metadata
- `67b33a6` test: browser check covers the title screen and help dialog
- `7462c98` feat: lantern pools, cold fill light, ambient occlusion rings and a brighter moonlit palette
- `8e3ce85` feat: post processing pass with bloom, vignette, grain and chromatic shift, with safe fallback
- `20d1fe7` test: tolerate float rounding at the postParams range edge
- `f6f926f` fix: postParams treats a non-finite dread as zero
- `b72d0dc` feat: moving sea reflections, drifting fog sheets, fireflies and embers
- `3fa0b47` feat: warm lantern pools stand out, lanterns stay warm until the vigil starts
- `360cd9a` feat: footsteps, layered waves, bells and whispers, lantern and ending cues, smoother walking
- `f0f4c47` test: browser check covers the post pass and its ?post=0 fallback
- `aa5f1a6` docs: round 17 screenshots of the 3D look

## Round 18 commits
From `git log main..HEAD` (oldest first); the docs commit for this round is in `git log`.
- `4b131b1` feat: vigil sandbox lock and clue classification rules in Core
- `e9048ec` feat: mirror vigil sandbox lock and clue rule in web core with parity
- `2778941` feat: lock the sandbox while a vigil is live, with reason, tests and docs
- `cdd700e` feat: add localized VigilStrings to Core with web i18n drift test
- `15c8db8` fix: give the narration response DTO a default so the compile check has 0 warnings
- `34ec2d8` feat: add vigil objective and ending body text to Core VigilStrings
- `2d65d6d` feat: wire the Vigil into Unity with VigilDirector, HUD objective, Endure and ending panel
- `d703ead` docs: document the Unity vigil, status rows and warning-free compile check
- `e2e5331` feat: add on-screen touch controls for the 3D view
- `4102b94` docs: document touch controls and add mobile screenshot
- `efebd35` feat: 2D vigil lanterns show only usable ones, with flickering flames
- `b993d65` fix: poll in browser_check door prompt and GLB checks so slow software GL no longer fails them
- `bc027a3` feat: epilogue shore link per ending with pure params table, plus a11y browser checks
- `b900608` docs: retake r18 gallery stills, clamp shore epilogue pitch, sw v14
- `cd2bcb7` docs: bring round 18 docs, specs and verification counts current
- `9da60c9` fix: one Core vigil lock (Begin, IsLocked) and lamp cap gate on candle sanity, mirrored in Unity and web
- `57410e7` fix: web vigil lock independent of canPlay, story and cinema refused while locked
- `6a53839` fix: touch stick and canvas gesture drive separate vectors summed per frame, sw v15

- Final counts at the end of round 18: dotnet 127, node 356, 10 `tools/test_*.py` files, `tools/validate_repo.py` OK, UnityCompileCheck 0 errors and 0 warnings, `tools/browser_check.mjs` 73 of 73 (local headless Chromium, SwiftShader).
- Unverified: the Unity runtime (compile checked only) and touch controls on real devices (DevTools touch emulation only).

## Round 19 clock integration commits (FEAT-006)
From `git log` (oldest first).
- `48f5764` feat: vigil keeps watch at dusk and night, dawn judges the night (Core rules, JS mirror, golden parity)
- `2ea2b7a` feat: clock drives 3D sky, sun, fog, lantern gain and ambient mix; vigil Endure runs to dawn; HUD clock chip and first-play hint (en/fr)
- `a29f722` test: daylight contrast threshold matches the overcast day palette
- `869accc` feat: Core VillagerRules.StandPoint and CoastSide (web standingPoint is the golden-checked mirror), ProgressionSession.ResolveVigilDawn
- `a86d999` fix: stand point facing never emits -0 so golden data round-trips through embed_golden
- `d50c06d` feat: Core GameClock.SessionStartTick (dusk) and VillagerRules.CarriesLitLantern with JS mirrors and golden parity
- `74cd88d` feat: Unity DayNightDirector and VillagerAgent over Core, vigil watch and dawn with the clock, scene builder spawns the roster at person height (compile checked)
- `a5dfec8` feat: by day the Endure control waits for dusk (Core VigilRules.WaitForDuskMinutes, web and Unity), en/fr strings, vigil clock UI tests
- `d6129c1` docs: vigil clock rule, day and night look, Unity clock and villagers, Nivalis nights as genre inspiration only
- `ab73549` test: browser checks for clock phases (sampled sky pixels), chip, hint and the vigil at night and by day; chip refreshes on clock skips
- Counts after these commits: dotnet 157, node 403, 10 `tools/test_*.py`, validator OK, UnityCompileCheck 0 errors and 0 warnings, `tools/browser_check.mjs` 93 of 93 (local headless SwiftShader). Unity runtime Unverified.

## Round 19 final validation (FEAT-007)
Full commit list from `git log --reverse ae4f588..HEAD` taken before this entry (later docs commits are not listed).
- `c6c8ca4` feat: shared village_shapes.json drives Blender meshes and a JS fallback, 12 new original meshes
- `10bd0e4` feat: original procedural textures, default 3D surfaces, DLNK only on opt-in paths, sw v16
- `5119565` feat: Core ShapeLibrary and Unity original mesh generator, no pack or glTFast needed
- `bcbcb97` feat: Core GameClock, seeded villagers, dread behavior and talk rules with en/fr lines and JS mirror
- `0e46e74` fix: one real-world scale standard (1.7 m person, 1.6 m eye, 2 m doors), meshes placed at scale 1, Core WorldScale, Unity player 1.7 m
- `5349124` feat: villagers on the web: 2D/3D figures, minimap, Who is where, accessible talk dialogue, display-only ?narrator voice, sw v18
- `ee36e6f` docs: villager talk, narrator endpoint example and determinism guarantee
- `48f5764` feat: vigil keeps watch at dusk and night, dawn judges the night (Core rules, JS mirror, golden parity)
- `2ea2b7a` feat: clock drives 3D sky, sun, fog, lantern gain and ambient mix; vigil Endure runs to dawn; HUD clock chip and first-play hint (en/fr)
- `a29f722` test: daylight contrast threshold matches the overcast day palette
- `869accc` feat: Core VillagerRules.StandPoint and CoastSide (web standingPoint is the golden-checked mirror), ProgressionSession.ResolveVigilDawn
- `a86d999` fix: stand point facing never emits -0 so golden data round-trips through embed_golden
- `d50c06d` feat: Core GameClock.SessionStartTick (dusk) and VillagerRules.CarriesLitLantern with JS mirrors and golden parity
- `74cd88d` feat: Unity DayNightDirector and VillagerAgent over Core, vigil watch and dawn with the clock, scene builder spawns the roster at person height (compile checked)
- `a5dfec8` feat: by day the Endure control waits for dusk (Core VigilRules.WaitForDuskMinutes, web and Unity), en/fr strings, vigil clock UI tests
- `d6129c1` docs: vigil clock rule, day and night look, Unity clock and villagers, Nivalis nights as genre inspiration only
- `ab73549` test: browser checks for clock phases (sampled sky pixels), chip, hint and the vigil at night and by day; chip refreshes on clock skips
- `e63c0c9` docs: build log for the round 19 clock integration commits
- `1e0fc55` feat: seeded harbour quarter dressing in Core with JS mirror and golden parity
- `1e7bc84` feat: render the village dressing in the 3D world with collisions, precache and cache v20
- `dc29515` docs: art direction note, changelog and Unity follow-up task
- `d0ebc9c` chore: refresh stitch.json after the dressing commits (counts)
- `de4e0e1` docs: round 19 screenshots (dawn, day with villagers, dusk, night, scale reference)
- `d743278` docs: README gallery and scale standard, changelog, contributing baseline
- `963a48d` docs: round 19 scale standard, Unity setup, MCP note, pitch, checklist, steering and spec tasks
- Counts: dotnet 159, node 408, 10 `tools/test_*.py` files, `tools/validate_repo.py` OK, UnityCompileCheck 0 errors and 0 warnings, `tools/browser_check.mjs` 93 of 93 (local headless SwiftShader, run in the foreground). `web/data/stitch.json` was stale after the dressing commits and was regenerated (the validator and `test_gen_stitch.py` caught it).
- Unverified: Unity runtime, real GPU look and frame times, audio by ear, real devices.

## Round 20 commits (world foundation, branch feat/round20)
- `29c4e52` docs: add before-scale screenshot
- `fe64145` feat: two-storey multi-cell houses with WorldScale storey and ridge constants
- `20b90c9` docs: add after-scale screenshot
- `3cc107b` feat: street network in Core (lanes, square, building frontage, walkable coast road) with dressing props and 12 new meshes
- `bcc9aa0` feat: streets in the 3D view, procedural timber, stone, slate, cobble and mud materials, street walkers, church rise heightmap
- `973b414` chore: refresh stitch data
- `5168b62` feat: deterministic per-day weather, storm lightning through the flash gate, wind-bent foliage, seeded boid birds, weather lighting
- `a2f9867` feat: CC0 Poly Haven textures and props under web/assets/third_party with manifest and validator budget checks
- `38991f8` feat: glb node transforms and embedded base colour textures, lazy CC0 materials and prop atlas in the 3D view
- `9fda6c7` docs: credit CC0 assets in README and About (en, fr), materials before and after stills
- `daa6354` feat: Unity VillageDressingPlacer places Core dressing and street slabs from the scene builder (compile checked only)
- `959780d` test: browser check covers density, weather and birds, and follows the two storey layout (99 of 99)
- Counts: dotnet 172, node 441, UnityCompileCheck 0 errors and 0 warnings, `tools/browser_check.mjs` 99 of 99 (SwiftShader, run in the foreground; the first run was 92 of 99, the failures were stale layout assumptions: the door and lantern probes used the old house cell, the sky probe stood against a wall, the mesh page expects 37 meshes, and day 1 weather of seed 1818 is fog or storm in captures).
- Unverified: Unity runtime, real GPU look and timings, audio by ear.

## Round 21 commits (scale, performance and polish, branch feat/round21)
- `fefde27` docs: add round 21 and shift roadmap by one round
- `111f33b` fix: street-level fly-through, real-size texture tiles, prop height ranges, eye and FOV settings
- `e2576b5` docs: round 21 scale audit, before and after stills, changelog
- `1c4cb08` test: browser check help group count and settle wait for touch rest frames
- `d8059f5` perf: chunked frustum and fog culling for the building buffer, held lantern, js cpu readout in perf HUD
- `728443c` test: browser check timing tolerates a missing perf HUD
- `17f89da` feat: graphics quality tiers (Auto, Low, Medium, High) with tier-bounded dynamic resolution and HUD readout
- `54964e2` feat: filmic tone map, FXAA, masonry and cobble bump, wet sheen, blob shadows, shore foam, moonlit fog and clouds, gated by quality tier
- `0e40de5` feat: 2D isometric dusk band, seeded ridge, moonlit clouds, cast shadows and window light spill, tier-gated
- `2e36c61` fix: Auto quality reads the GPU name from the 3D view's own context, browser check retries captures and measures fog by contrast
- Measured (SwiftShader, indicative only, 3 alternating runs per build): triangles 25,823 before culling, 18,376 after; warm walk mean about 107 to 112 ms in both builds, median 17 ms, p95 about 400 ms. Tiers: Low 94 ms, Medium 109 ms, High 110 ms mean (one run each; the governor drops every tier to scale 0.5 on software GL). The round 20 figure (97, 33, 267 ms) came from another session and is not comparable.
- Gotchas: a background `http.server` is only reachable from the same shell call in the agent sandbox, so start it and the browser check in one command; Chrome sometimes fails to start (`browser did not expose a page target`), rerun. `tools/screenshot.sh` drops the held lantern when the Low tier downsizes the canvas; a live CDP capture shows it, so it is a headless capture artifact.
- Browser check: 100 of 101 on the full run (the timing walk got 2 frames at load 8; `TIMING_ONLY=1` rerun passed with 44 frames). Earlier full runs stopped on `Not attached to an active page` captures; the same loop failed on the pre-change build d8059f5, so the script now retries the capture. A deferred Auto detection fixed slow first paints from a throwaway WebGL context.
- A first ACES pass applied the curve to display values and washed the image out (seen in the first still); the post pass now decodes to linear before the curve.

## Round 22 commits (foreground, Dredge and Silent Hill look, branch feat/round22)
- `3c81de0` feat: foreground fill in Core (yard props, lane weeds, ruts, lamp posts, gardens, harbour edge), bigger coast buildings, walkers swing round the well, shared batchProps
- `f9f79f2` feat: VillageDressingPlacer marks props static and merges them once with StaticBatchingUtility
- `5661c22` feat: Dredge and Silent Hill look (close fog by tier, curve grade, moon shafts, window mood, rim light, ground palette, sea depth, layered sky)
- `7ae6898` perf: early fog cutoff, per-tier bloom taps, light early-out, front-to-back draw order, fixscale probe and per-tier timing check
- `f4cf0a1` feat: life and motion layer (swaying props, moths, leaves, chimney smoke, shore surge), sw cache v27
- `5d41773` fix: window mood only on buildings (not held, villager or coast lanterns), lift foliage out of the wall base shadow
- `892ee98` feat: 2D view Dredge and Silent Hill mood on tiers with sky2d
- Triage of the four look bugs seen in first-person stills (a to d, below in `docs/ARCHITECTURE_AUDIT.md`). Per tier SwiftShader: Low 219 ms, Medium 264 ms, High 303 ms mean at fixed scale. Counts: node 489, dotnet 178, UnityCompileCheck 0/0.
- Gotchas: `pip install --user` fails here (read-only `/root/.local`), `pip install --target <dir> pillow` and `PYTHONPATH` works; the image viewer caches by path, so copy a changed still to a new file name before viewing it again.
- Browser check (full run, SwiftShader): 99 of 101. One failure was a stale expected mesh count (`37 of 37`, now 47 after the round 22 props), fixed in `tools/browser_check.mjs`. The other was the real-time frame timing check (`frames > 30` in a 6 s walk), which is bimodal on this host: the same build alternates between about 37 frames at 150 ms and 14 frames at 450 ms mean; I first suspected the 2D mood fills, but reverting only the 2D file did not give a stable result (A/B alternation reproduced both modes with identical code). Partially Verified; run `TIMING_ONLY=1` again on a quiet machine. Main `d72a4fa` measured 45 frames at 136 ms, `f4cf0a1` 38 frames at 144 ms, `3c81de0` 48 frames at 127 ms.
- Added after the docs commit: `26a67f4` fix: gentler foliage lift, sw cache v28.
