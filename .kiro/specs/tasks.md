# Tasks

- [x] 1. Unity 6 HDRP skeleton (manifest, ProjectVersion, asmdefs) (R5)
- [x] 2. Core: SeededRandom, PrefabCatalog (R2)
- [x] 3. Core: VillageLayoutGenerator (R1)
- [x] 4. Core: SanityModel (R3)
- [x] 5. Core: narration interface, static and safe providers (R4)
- [x] 6. Property-based tests for 2 to 5
- [x] 7. Runtime glue: VillageCatalogAsset, VillageBuilder, HorrorAmbienceDirector
- [x] 8. Gitignore paid packs, keep .kiro tracked, validate_repo.py (R5)
- [x] 9. Kiro hooks and steering
- [x] 10. README, KIRO_USAGE, DEMO_SCRIPT, DEVPOST_SUBMISSION
- [ ] 11. In Unity: import owned pack, bind prefabs in a VillageCatalogAsset, build the demo scene (packages now downloaded and inspected locally; they hold no meshes, building prefabs come from the base pack)
- [x] 12. HDRP volumes (fog, vignette, color) blended by dread (Core `DreadCurve` is Verified; `DreadVolumeBlender` is Unverified in Unity until the author authors the two Volumes)
- [x] 13. Optional: AI narration provider via HTTP behind INarrationProvider (`HttpNarrationProvider` is Unverified in Unity)
- [ ] 14. Record demo video and publish
- [x] 15. Browser demo under `web/`: dependency-free JS port of Core, procedural canvas village, sanity-driven dread, seed sharing via URL hash
- [x] 16. Golden parity: C# test emits `web/test/golden.json`, `node --test` proves the JS port matches C# exactly
- [x] 17. GitHub Pages workflow `.github/workflows/pages.yml` (author must enable Pages: Settings > Pages > Source: GitHub Actions)
- [x] 18. Core: dread threshold events with hysteresis (R8)
- [x] 19. Core: village report in Markdown and JSON (R9)
- [x] 20. Core: prefab name matcher with property tests (R10)
- [x] 21. Golden parity extended and JS port updated for 18 to 20
- [x] 22. Editor `CatalogAutoBinder` and director omen event (Unverified in Unity)
- [x] 23. Web demo polish: omen toasts, Whispers journal, report download, keyboard, reduced motion, responsive layout (R11)
- [x] 24. `tools/screenshot.sh` and screenshots in `docs/media`
- [x] 25. CI workflow, CONTRIBUTING, CHANGELOG, em dash check in the validator
- [ ] 26. In Unity: run the auto-binder against the imported pack and fix any mismatched names (catalog `prefabHint` now preselects names; church, well and altar are stand-ins)
- [ ] 27. In Unity: set `VillageBuilder.pieceCount` to 80 if you want the same village as the web demo
- [ ] 28. Enable GitHub Pages (Settings > Pages > Source: GitHub Actions) and confirm CI runs on GitHub
- [x] 29. Core: seeded `CampaignGenerator` (village name, per-night title, rising dread target, sky, weather, rumor, lore) with JS port, golden parity and tests
- [x] 30. Web: campaign panel and night selector, dusk/night/witching tint, rain and fog, postcard PNG export
- [x] 31. Web: in-browser parity self-test (`web/selftest.html`) with embedded golden vectors and a drift test
- [x] 32. Runtime `WalkthroughController` for stepping campaign nights (Unverified in Unity) and `docs/BUILD_LOG.md`
- [x] 33. `tools/fetch_pack.py`: reproducible download of the URP and HDRP packages into the ignored downloads folder
- [x] 34. Inspector scene scan: referenced prefab GUIDs and names, folder entries, no-mesh summary
- [x] 35. Matcher fix (single-letter tokens) and catalog `prefabHint` with `PrefabNameMatcher.Resolve`, JS and Python ports, golden parity
- [x] 36. `tools/build_local_pack.py` and web `?pack=1` local pack mode (all output git-ignored)

Open author-only items: 11 (needs Unity and the owned pack), 14 (record and publish the video), 26, 27 and 28.

- [x] 37. Core `DreadBuildingPolicy` (detail level, floor peel, door omens, camera policy) with property tests, JS port and golden parity
- [x] 38. Runtime DLNK bridges (UnityEvents, unverified in Unity) and `docs/DLNK_INTEGRATION.md`
- [x] 39. Web demo: texture themes mapped to DLNK groups (procedural and pack), top-down floor peel, camera modes limited by `allowedCamera`, door omens, omen-driven detail, accessibility and idle redraw skip (`web/src/building.js`, node tests)
- [x] 40. Rewrite `docs/DEMO_SCRIPT.md` (own footage only, no third-party promo trailer)
- [x] 41. Hosting configs (`netlify.toml`, `vercel.json`, `web/_headers`), `tools/stage_web.py` with test, `web/test/paths.test.js`, `docs/HOSTING.md`, `pages.yml` uploads staged `dist` (untested on real hosts)
- [x] 42. Author connects a host per `docs/HOSTING.md` and pastes the verified URL into README and Devpost
- [x] 43. Core `StorySequencer` (beats per night, omen by dread tier, navigation, reading time) with property tests, JS port `web/src/story.js`, golden parity and self-test
- [x] 44. Web story mode UI, skippable intro, opt-in procedural WebAudio soundtrack (`music.js`, `intro.js`, node tests); audio Partially Verified (logic node-tested, never heard)
- [x] 45. Web session save/load, minimap and legend, case file export, i18n stub, perf HUD, offline PWA shell with CSP update (node and Python tests; offline untested on a real host)
- [x] 46. Core `RitualChain` (seeded ritual stages across nights, omen and story beat links) with property tests, JS port `generateRitual`, golden parity; web night panel, journal and case file show it
- [x] 47. Core logic Verified, scripts Unverified in Unity: `RitualDirector` MonoBehaviour driving `RitualChain.Progress` (night schedule floor plus dread-reached stage) from the dread and night events, plus `RitualStateAsset` ScriptableObject mirror and `RitualSaveBridge` over the Core `RitualSaveState`
- [x] 48. Core `Investigator` (seeded walk along a lantern route between village pieces, one cell per tick, sanity hit the first time it passes an omen site) with property tests, JS port, golden `investigators` parity and self-test group; web toggle (`I`, `?investigator=1`), canvas figure and trail, minimap marker, journal entries, screen reader village description (en and fr)
- [x] 49. Web cinematic capture mode (`B`, `?cinematic=1`): pure deterministic timeline `cinematicFrame` in `web/src/cinematic.js` with node tests, reduced motion keeps the camera still
- [x] 50. Web gamepad and touch controls through the pure mapping in `web/src/input.js` (tested); Gamepad API polled in rAF only while a pad is connected; not tried on real hardware
- [x] 51. Web accessibility pass: skip link, labelled sidebar, cinematic caption live region, gamepad and touch help (en and fr)
- [ ] 52. Offscreen canvas cache for static terrain: skipped, ground and sea depend on dread, the easing camera squash and pack patterns every frame, so a cache would not give identical visuals without a wider refactor. Round 10 revisited it: the sea waves and reeds are animated by time, and the ground colour is a continuous function of dread, so a dread-bucketed cache cannot be pixel-identical and an exact-key cache would miss on every easing frame. Decision: not implemented
- [x] 53. Web Stitch panel from `tools/gen_stitch.py` repo data (validator checks freshness), seeded Necronomicon codex and achievements saved in the session with backward-compatible parsing, high-contrast theme, opt-in daily village seed with an injectable clock (node and Python tests)
- [x] 54. Unverified in Unity (not compiled): `VillageCoreInspectorWindow` Editor window previewing Core village report and campaign; six new dotnet property tests and six node invariant tests
- [x] 55. Web progress arming gate (`progress-gate.js`): codex and achievements only award after a player action, deep links and restored sessions only preview, saved progress restored until the first action
- [x] 56. Journal Story and Progress tabs with unseen badge (`journal.js`, en and fr, node tests)
- [x] 57. Opt-in judge tour `?tour=1` (`tour.js`, `tour-ui.js`), About dialog, static and perf budget tests, README judge quick start
- [x] 58. Tour card placement helper `tourCardPlacement` with node test (card inside viewport, scroll on overflow, flips to the top when covering its target)
- [ ] 59. Author: record tour and About screenshots or footage for the demo video (headless 1280x720 captures clip the bottom, shoot at 1280x770 or in a real browser)
- [ ] 60. Real-browser check of the tour (keyboard, screen reader, a short laptop viewport); only headless Chrome was used
- [x] 62. Round 12: stub-based Unity compile check (`tests/UnityCompileCheck`, CI job), MCP prep docs (no MCP run)
- [x] 63. Round 12: DLNK scene layout parser, material properties, `?pack=1&scene=` mode with node tests (local pack only)
- [x] 64. Round 12: headless Blender 4.2 LTS original GLB meshes, `meshes.html` viewer, link from About with en and fr parity
- [x] 65. Decision: skipped. An EXR decoder is speculative infrastructure (nothing in the web demo consumes lightmaps); recorded in `docs/ARCHITECTURE_AUDIT.md`
- [x] 66. Package-flavor aware roles in `tools/build_local_pack.py` (`ROLES_HDRP`, `ROLES_URP`). Listing the URP package showed it ships materials but no material textures (only lightmaps and probes), so URP roles are material-only (`materialOnlyRoles` in the manifest: tint, smoothness, metallic, slots). Synthetic-data tests Verified; the URP look in Unity is Unverified
- [x] 67. GLB mesh mode (`?meshes=1`, opt-in): committed original Blender meshes drawn through the village iso projector, procedural fallback with console.warn. Node tests Verified; the look is Partially Verified (one headless screenshot, `docs/media/meshes-village.png`)
- [x] 68. Data-driven scene classification (named keyword lists in `tools/dlnk_scene.py`, new `prop` and `effect` kinds); unclassified `generic` objects drawn as hollow rings and counted in the HUD line. Python and JS kind lists checked equal by a test. Coast scene generic share 817 to 74 of 2628 (Partially Verified: one headless screenshot)
- [ ] 69. Run the compile check against a real Unity install and the MCP workflow (author only)
- [ ] 61. Author: connect a host and paste the verified URL (same as 42), record the video, publish the social post and blog (same as 14, 26, 27, 28)
- [x] 70. Round 13: architecture and parity audit (`docs/ARCHITECTURE_AUDIT.md`); codex, achievements, daily seed, sanity costs, floor counts moved to Core with golden parity; silent catches and dead code removed
- [x] 71. Wire `CodexModel`, `AchievementRules` and `DailySeed` into Unity Runtime: Core `ProgressionSession` (tested, Verified) and thin `ProgressionTracker` (compile checked; Unity Unverified); localized prompts via Core `PromptStrings` with i18n.js drift test
- [x] 72. Round 13: horror design review. Seeded ambient lightning and shake (no `Math.random` in the render path), one capped and rate-limited flash gate, shorter and coalesced banners (`scene.js`, `web/test/notice-policy.test.js`); visual feel Partially Verified
- [x] 74. Round 14: UPM package `com.michaelinzo.frankenstein-village` (scripts and catalog moved, paths and validator updated, `.meta` generator), Core `InteractionRules` with property tests, playable layer and scene builder (compile checked only; Unity Unverified), `docs/UNITY_SETUP.md`
- [ ] 75. Author: install the package in Unity 6, run Tools > Frankenstein > Create Playable Village Scene, report what breaks (first real run)
- [ ] 73. Real-browser check of the quieter banner and flash pacing (author only)
- [x] 76. Round 14: opt-in first-person WebGL view (`?view=3d`): `view3d-math.js`, `view3d.js`, `glb.js` GL feed, JS `InteractionRules` with golden parity. Headless SwiftShader render inspected; pointer lock, touch, gamepad and real GPU not exercised
- [ ] 77. Author: try `?view=3d` in a real browser (mouse look, touch, gamepad) and report feel and frame rate
- [x] 78. Round 16: Core `FlythroughPath`, `WebShareLink`, place names with golden parity; Unity `VillageFlythroughCamera`, `WebDemoUrlMenu`, `DlnkPackExplorerWindow` (compile checked only, Unity Unverified); omen framing and 6 more Blender props on the web side
- [x] 79. Round 16 docs: side-by-side `docs/DEMO_SCRIPT.md`, `docs/RECORDING.md`, `docs/PACK_EXPLORATION.md`, MCP prompts 8 to 12. Unity cannot be installed in the sandbox (licence tied to the author's account)
- [ ] 80. Author: record the side-by-side video with own footage (no DLNK trailer, no copyrighted music), run the Unity steps for the first time and report what breaks
- [x] 81. Round 17: Vigil in Core with JS mirror and golden parity, title screen, help dialog, loading veil, share metadata, 3D lantern pools, post pass, sea, fog sheets, fireflies, procedural footsteps and cues
- [x] 82. Round 17 polish: `?caption=0` and `?grain=0` stills, pale moon disc and hue preserving highlight shoulder, retaken share image and README screenshots, README starts with hero, Play now, pitch and How to play
- [x] 83a. Round 18: Unity `VigilDirector` and HUD (compile checked, 0 warnings), vigil sandbox lock in Core with JS mirror and golden parity, localized `VigilStrings`, web touch controls, honest 2D lanterns, seeded epilogue link, accessibility browser checks; dotnet 127, node 356, browser check 73 of 73
- [ ] 83. Author: try the 3D view on a real GPU, listen to the audio and test on a real phone

- [ ] Round 19 follow-up: place the same `VillageDressing` items in the Unity scene builder (compile-check only), and open the walkable bounds so players can walk the coast road (today the strip is only seen from the grid edge).
- [x] 84. Round 19: original shape source (`village_shapes.json`, Core `ShapeLibrary`, Unity asset generator), procedural textures, seeded villagers and talk (optional display-only `?narrator=`), GameClock with the vigil kept at dusk and night, day and night look, harbour quarter (`VillageDressing`), scale standard (`WorldScale`, person 1.7 m, eye 1.6 m, door 2.0 m); dotnet 159, node 408, browser check 93 of 93, UnityCompileCheck 0 errors and 0 warnings
- [x] 85. Round 19 leftover: walkable coast road (open the collision bounds past the grid edge, with tests)
- [x] 86. Round 19 leftover: place `VillageDressing` items in the Unity scene builder: done in round 20 as `VillageDressingPlacer` (compile checked, 0 errors 0 warnings; Unity runtime Unverified, piece facing not applied in Unity)
- [ ] 87. Round 19 leftover: optional AI villager line in Unity, extending `HttpNarrationProvider` with the deterministic Core line as fallback (display only)
- [ ] 88. Author: confirm the "too big character" was the first-person explorer next to small doors plus the 1.85 m villager (now 1.7 m), and whether "Nivalis nights" meant something else
- [x] 89. Round 19 polish idea: give the church rise a slope or texture (it reads as a flat dark mound from the village side)
- [ ] 90. Take a first-person screenshot beside a 2.0 m door as scale evidence for task 88 (Partially Verified until the author confirms)

## Round 20: world foundation
- [x] 91. Two-storey multi-cell houses, `WorldScale` storey and ridge constants (Verified by dotnet and node tests; look Partially Verified: `docs/media/before-scale.png`, `after-scale.png`; the person no longer reads as a giant: house ridge 9.0 to 9.7 m against a 1.7 m person)
- [x] 92. Street network in Core with JS mirror, frontage and facing, walkable coast road (spec task 85), church rise heightmap (task 89) (Verified by tests; look Partially Verified)
- [x] 93. Per-day weather in Core and JS (golden), 3D weather looks, wind, storm lightning through the flash gate, seeded boid birds (Verified by tests; look Partially Verified in SwiftShader; audio and real GPU Unverified)
- [x] 94. CC0 Poly Haven textures and props, `THIRD_PARTY_ASSETS.md`, validator budget checks (Verified by validator and tests; look Partially Verified)
- [x] 95. Unity `VillageDressingPlacer` and thin scene builder hook (compile checked only; Unity runtime Unverified)
- [x] 96. Browser check extended for density, weather and birds: 99 of 99 (SwiftShader, indicative)
- [ ] 97. Author: view `?view=3d` on a real GPU (frame time, weather, birds, materials) and in a real browser
- [ ] 98. Author: run Tools > Frankenstein > Create Playable Village Scene in Unity 6 and report dressing placement, street slabs and yaw
- [ ] 99. Author: confirm the person no longer reads as a giant (task 88) and shoot a first-person shot beside a door (task 90)

### Remaining leftovers from round 20
- Cottages, inn and chapel on the coast are still small (single-storey scale).
- Window lighting has no per-floor on/off states, only per-storey flicker.
- No normal maps (would need tangents); photo materials are diffuse only.
- No GPU timing, only SwiftShader indications (triangles about 23k to 26k of the 60k budget, 12 draw calls ceiling).
- Real browser checks (author only); Unity ignores the layout `Facing` and `WeatherForDay`; builder cell 6 m versus Core dressing 4 m.

## Round 21: scale, performance and polish
- [x] 100. Street-level fly-through, real-size texture repeats, prop height ranges, eye height and FOV settings (Verified by tests; look Partially Verified)
- [x] 101. Chunked frustum and fog culling of the building buffer, held lantern, JS ms in the perf HUD; measured triangles 25,823 to 18,376, SwiftShader frame time unchanged (Verified counts; GPU payoff Unverified)
- [x] 102. Graphics quality tiers Auto, Low, Medium, High with storage, `?quality=`, Auto hints, tier-bounded dynamic resolution and HUD readout (Verified by node tests and the quality browser run)
- [x] 103. Filmic tone map, FXAA, bump, wet sheen, blob shadows, shore foam, moonlit fog and clouds, gated by tier (Verified: shaders compile on every tier in SwiftShader; look Partially Verified)
- [x] 104. 2D dusk band, ridge, clouds, cast shadows and window spill, off on Low (Verified by a stub test; look Partially Verified)
- [ ] 105. Author: try each tier on your laptop with `?perf=1`, report the frame time and whether Auto picked the right tier
- [ ] 106. Bigger coast cottages, inn and chapel (still single-storey scale)
- [ ] 107. Per-floor window on and off states with light spill in 3D
- [ ] 108. Walker and explorer collision with props near wells (dressing boxes exist; the well rim needs a tighter box and a test)
- [ ] 109. Real normal maps for the CC0 photo materials (needs tangents in the GLB path)
- [ ] 110. Wet sheen reads faintly in stills; tune on a real GPU before making it stronger
- [ ] 112. Daytime fog (`tick=700`) barely changes the frame (mean 2 levels, contrast 1 to 2); make day fog read more clearly
- [x] 113. Recompressed `docs/media/r21-held-lantern.png` (242 KB)
- [ ] 111. Headless `--screenshot` drops the held lantern when the Low tier downsizes the canvas (live frames are fine); find why the capture path differs

## Round 22: foreground, Dredge and Silent Hill mood, 2D parity
- [x] 114. Foreground fill in Core with JS parity and golden data (yard props, lane weeds, ruts, lamp posts, gardens, harbour edge), bigger coast buildings, Unity placer static batching (Verified by dotnet 178 and node 489; Unity compile checked only)
- [x] 115. Dredge and Silent Hill look in 3D (close fog by tier, curve grade, moon shafts, window mood, rim light, ground palette, layered sky), life layer, performance pass (Partially Verified: SwiftShader stills; per tier Low 219 ms, Medium 264 ms, High 303 ms at fixed scale, real GPU Unverified)
- [x] 116. 2D map mood parity (`dredgeMood`, quay, pier lantern, yard tufts, fog pool, grade) and docs, gallery, recompressed `r21-held-lantern.png` (task 113 done)
- [x] 117. Regressions fixed: window mood switched off held, villager and coast lanterns; foliage near black from the new base shadow
- [ ] 118. Author: look at the round 22 build on a real GPU and report frame time per tier

## Round 23: world depth (new asks, inventory first)
Triage of look bugs seen in round 22 stills (none are regressions unless noted):
- [ ] 119. Held lantern: glass dull and cut off at the bottom edge. Raise the offset, light the glass properly (setting glow to 1.0 darkened it in SwiftShader, find why), add a screenshot check. Not a regression
- [ ] 120. Walking collision: `BODY_RADIUS` 0.35 m lets the camera sit almost in a wall face and house meshes overhang their footprint; raise the radius and add overhang clearance, with tests. Dressing benches at doors sit against walls: add wall clearance in Core (C# test, golden, JS). Not a regression
- [ ] 121. Windows read as flat brown shutters: real glass, interior glow, curtains, per floor on and off (supersedes 107). Not a regression
- [ ] 122. Grass tufts and reeds are thin cones with no ground contact: wider crossed blades, a dark contact blot, colour from the ground palette. Tufts were a round 22 regression (fixed for black, shape remains)
- [ ] 123. Bigger city: more districts, more streets and more buildings per seed (larger grid with chunking, Core rules first, perf budget check)
- [ ] 124. `C` key chat with citizens: talk to the nearest villager to get clues about what to do next (Core line selection first, deterministic fallback, optional AI later in round 26)
- [ ] 125. Lore books and lorecrafts: findable books with short texts about life in the village (seeded, in Core, journal entries, codex)
- [ ] 126. Huge world: regions beyond the village so an hour of play still has places to see (builds on round 28 regions; start with a bigger walkable area and landmarks)
- [ ] 127. Inventory and items (previously Round 22 roadmap): find, store, use; sleep and food sanity recovery

## Roadmap
- Round 22: foreground fill, Dredge and Silent Hill mood, 2D parity (done, see above).
- Round 23: inventory and items (finding and storing, sleep and food sanity recovery) plus the look bug fixes, bigger city, `C` key citizen chat, lore books and a larger world (tasks 119 to 127).
- Round 24: economy, shops, buy/sell, the horror restaurant.
- Round 25: monsters on the ground and in the sky, sanity exposure over time.
- Round 26: relationships, AI chat for villagers and talking objects (wells, stones, houses) via a same-origin Vercel serverless function whose LLM key the author sets as a Vercel env var, never committed, with deterministic fallback.
- Round 27: lore, stories and adventures.
- Round 28: procedural regions beyond the village.
- Round 29: Unity parity, performance and polish.
