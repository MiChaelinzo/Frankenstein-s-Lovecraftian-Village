# Architecture and parity audit (round 13)

Goal: find gameplay rules that exist only in JavaScript, or Runtime/Editor code that reimplements Core, and decide for each whether it belongs in `Packages/com.michaelinzo.frankenstein-village/Core`. Rules follow `.kiro/steering/project.md` (Core is the source of truth, Web mirrors, tests validate) and `.kiro/steering/agent.md`.

## Method

1. Read every module in `web/src` (38 files including generated `golden-data.js`) and its test in `web/test`.
2. Read every script in `Packages/com.michaelinzo.frankenstein-village/Runtime` and `Packages/com.michaelinzo.frankenstein-village/Editor` for logic that duplicates or bypasses Core.
3. Classify each rule: **Core** (a rule that changes what the player experiences or what a seed produces), **already Core** (mirror with golden parity), **UI-only** (input mapping, persistence validation, DOM glue) or **pure presentation** (drawing, text, timing of effects).
4. Move real rules into Core with xunit property tests, extend the golden emitter (`GoldenParity.cs`), and make the JS module a mirror verified in `web/test/parity.test.js`.
5. Grep for swallowed errors (`catch`), unused exports, duplicated helpers.

## Verification labels

- **Verified**: executed by an automated test or command in this sandbox (evidence given).
- **Partially Verified**: checked by inspection or by a stub-based compile only.
- **Unverified**: not executed. Nothing that needs the Unity editor can be Verified here.

## Module decisions (web/src)

| Module | Rules found | Decision | Reasoning |
|---|---|---|---|
| `core.js` | Mirror of all Core types | already Core | Golden parity for layouts, narration, dread, events, reports, campaigns, stories, rituals, investigator, matcher, building policy. Now also sanity costs and drain rate. |
| `golden-data.js` | Generated golden for the self test | generated | Produced by `tools/embed_golden.mjs`; never edited by hand. |
| `codex.js` | Creature permutation per seed, entry ids, unlock by stage/tier | **Moved to Core** (`CodexModel.cs`) | Seed-driven content selection; the same ritual must reveal the same creatures on every client. |
| `achievements.js` | Ten unlock predicates, journal completion | **Moved to Core** (`AchievementRules.cs`) | Persistent progress rules; thresholds (3 listens, 3 doors, Abyss tier) are named constants in Core. |
| `daily.js` | UTC date key and FNV seed | **Moved to Core** (`DailySeed.cs`) | Seed derivation decides the village; opt-in query parsing stays UI-only. |
| `building.js` | `floorCountFor` | **Moved to Core** (`DreadBuildingPolicy.FloorCountFor`) | Decides how many floors a building has. Door outcomes, detail, camera, floor peel were already Core. Theme list, door text, shake offsets, ring colours stay presentation. |
| `session.js` | Save schema clamps (sanity 0..100, night 0..8, stage -1..8) | UI-only | Validation of untrusted browser save data and share links. The ranges are bounds of the web UI controls, not rules that change a seed's output. Core has its own `RitualSaveState` clamp. |
| `progress-gate.js` | Arming rule: no award before the first player action | UI-only | A UX rule about previews versus saves (deep links must not overwrite progress). Awards themselves use Core rules. |
| `investigator-state.js` | Pause while hidden or during a take, restore after a take | UI-only | Depends on tab visibility and cinematic mode, which have no Core equivalent. The route itself is Core (`Investigator`). |
| `cinematic.js` | Timeline of beats and camera waypoints | pure presentation | Capture aid; durations come from Core `StoryBeats`. No gameplay effect. |
| `story.js` | Beat sequencing, durations, omens | already Core | Mirror of `StoryBeats.cs`, golden-checked. |
| `casefile.js` | Markdown/HTML export | pure presentation | Formats Core data (campaign, ritual, story). No rules of its own. |
| `dlnk-layout.js` | Layout validation, object `kind` styling and fit | UI-only | Works on the local pack layout (never committed). Kind classification itself happens in `tools/dlnk_scene.py` and the C# `PrefabNameMatcher` handles prefab matching. The style table is drawing data. |
| `scene.js` | Walker count per tier, window lighting, pathing, view fit | pure presentation | Seeded ambient visuals with no C# twin. They do not affect sanity, dread or any Core output. See open risks. |
| `draw.js` | Canvas drawing | pure presentation | No rules. |
| `textures.js`, `pack.js`, `glb.js`, `meshes-page.js` | Texture patterns, pack manifest checks, GLB reader | pure presentation | Asset handling only. |
| `app.js` | Sanity costs and drain rate (were literals) | **Moved to Core** (`SanityModel` constants) | Now `SanityModel.FOCUS_COST` etc. The rest is DOM glue. |
| `input.js` | Gamepad and swipe mapping | UI-only | Device input. |
| `view3d-math.js`, `view3d.js` | Opt-in first-person WebGL view, fly-through (`flythroughCamera` in `cinematic.js`), fog layers, coast, omens via shared `omenTargets` | pure math tested; GL shell Partially Verified (`tools/browser_check.mjs`) | Reuses core.js layout, campaign, dread and `InteractionRules`; glb.js feeds meshes. No parallel loader or rules. |
| `music.js` | Drone frequencies, gain curve | pure presentation | Original Web Audio synthesis. Unity has its own audio path (`DreadCurve.AmbienceVolume` is the Unity volume rule). |
| `i18n.js`, `i18n-text.js` | Strings and localized helpers | pure presentation | Text only. |
| `journal.js` | Journal list model and tabs | UI-only | Display model. |
| `intro.js`, `intro-ui.js` | Intro slides from the campaign | pure presentation | Built from Core campaign. |
| `story-ui.js`, `progress-ui.js`, `tour-ui.js` | DOM glue | pure presentation | No rules. |
| `tour.js` | Tour steps and timings | pure presentation | Judge tour. |
| `minimap.js` | Cell colours and legend | pure presentation | Draws Core layout pieces. |
| `perf.js`, `access.js` | Frame statistics, contrast preference | UI-only | Browser features only. |
| `selftest.js`, `selftest-page.js` | Runs JS Core against golden | test support | Parity check at runtime. |
| `stitch.js` | Stitch panel model | pure presentation | Reads generated `stitch.json`. |
| `util.js` | `lerp`, `mix`, `esc`, now `clamp`, `queryParam` | helper | Shared helpers; replaces copies in `session.js`, `music.js`, `casefile.js`, `access.js`, `daily.js`, `perf.js`, `tour.js`. |

## Runtime and Editor findings

| Script | Finding | Action |
|---|---|---|
| `DlnkTownManagerBridge` | Counted levels, mean and best itself | Uses `DreadBuildingPolicy.Summarize` (property tested). |
| `DlnkCameraModeBridge` | Clamped the int mode with `Mathf.Clamp` | Uses `DreadBuildingPolicy.CameraFromInt`. |
| `RitualDirector`, `VillageCoreInspectorWindow` | `Mathf.RoundToInt(dread * 100)` rounds halves to even; Core and web round halves up | **Bug.** Both use `DreadThresholds.Percent` now. `VillageReport` uses the same function (golden unchanged). |
| `HorrorAmbienceDirector` | Magic numbers `0.2f + 0.8f * dread`; drain default 0.5 per second while the web demo drained 1.0 per second | `DreadCurve.AmbienceVolume` and `SanityModel.DrainPerSecond` (1.0, the value players of the web demo see). **Behavior change for Unity's default drain**, documented here; existing scenes with a serialized value keep it. |
| `HttpNarrationProvider` | Empty `catch` | Logs `Debug.LogWarning` with URL and reason. |
| `VillageFlythroughCamera`, `WebDemoUrlMenu`, `DlnkPackExplorerWindow`, `DlnkShowcaseSceneHelper` | Thin wrappers. The fly-through maths moved to Core `FlythroughPath` (mirror of `cinematic.js`, golden parity), links come from Core `WebShareLink`, grouping from `PrefabNameMatcher`. | Only unit conversion (radians to Unity heading) and Editor GUI remain outside Core. Partially Verified (compile checked), Unverified in Unity. |
| Other Runtime scripts | Thin glue (`VillageBuilder`, `WalkthroughController`, `DlnkDoorOmenBridge`, `DlnkBuildingFloorBridge`, `RitualSave*`, `DreadVolumeBlender`) | No change needed. |

## Removed or fixed

- Silent failures: `SafeNarrationProvider` (C# and JS) now keeps `LastError` and the JS one warns; `music.js` start failure, `progress-ui.js` stitch load, `app.js` share copy now log with context; the validator no longer skips non UTF-8 tracked files silently. Remaining `catch` blocks that return `null` or `false` (`session.js` storage, `access.js` storage, `daily.js` clock) signal failure through the return value, which callers and tests check.
- Dead code: `parseIntroParam` (intro.js), `DOOR_BEHAVIORS` and `CAMERA_MODES` (core.js), `prettyId` (util.js), `clearSession` (session.js). Each had no importer in `web/src`, `web/test` or `index.html`.
- Duplicated helpers: three copies of `clamp`, a second HTML escaper in `casefile.js`, and five copies of the query/hash flag parser now live in `util.js`.
- Magic numbers: sanity costs, drain rate, achievement targets, ambience volume floor, creature count and omen tiers are named constants in Core.

Not merged: `access.js`, `perf.js`, `minimap.js`, `investigator-state.js`, `progress-gate.js`. Each is small but has its own test and a single reason to change; merging would move imports, precache entries and tests without reducing coupling.

## Evidence

| Claim | Label | Evidence |
|---|---|---|
| Moved rules behave identically in C# and JS | **Verified** | `GoldenParity` emits `codex`, `achievements`, `daily`, `sanityRules`, `buildings.floorCounts`; `web/test/parity.test.js` checks each. Existing golden entries are unchanged (diff only adds). |
| Core rules hold their invariants | **Verified** | `ProgressionProperties.cs` (permutations, monotonic unlocks, sticky awards, bounded ranges, clamps, ambience, percent). |
| Runtime and Editor scripts still compile against the stubs | **Partially Verified** | `dotnet build tests/UnityCompileCheck`: 0 errors, 1 warning. Stubs prove syntax and types only. |
| Runtime changes work in Unity | **Unverified** | Unity was never run. |
| `Debug.LogWarning` path in `HttpNarrationProvider` | **Unverified** | No network or Unity run; the stub only proves it compiles. |
| Unity default drain now equals the web rate | **Partially Verified** | Constant checked by golden; the Inspector value on existing scene objects is not inspected. |

## Open risks

- `scene.js` (walker count per tier, window lighting, notice pacing) is a seeded rule with no C# twin. If Unity needs matching crowds, move it to Core first.
- `session.js` bounds duplicate `CampaignGenerator` limits (night 8) as literals; a future change to the night range needs both updated.
- The Unity drain default changed from 0.5 to 1.0 per second for new components. Serialized scene values are not touched.
- Core files `CodexModel`, `AchievementRules`, `DailySeed` have no Runtime consumer yet. They exist so Unity and Web share one definition; wiring them is future work and is not claimed here.

## Round 13 decisions: pack tooling

- Spec task 65 (stdlib EXR lightmap decoder) is skipped. Nothing in the web demo consumes lightmaps, so it would be infrastructure for a hypothetical need.
- Spec task 66: the URP package contains 230 materials but no material textures (its images are lightmaps and reflection probes), so URP roles are material-only. Texturing in `?pack=1` still needs the HDRP package.
- Spec task 68: classification lives only in Python (`tools/dlnk_scene.py`); the JS side validates kinds against `LAYOUT_KINDS`, and `tools/test_dlnk_scene.py` checks both lists match. Unmatched names stay `generic` and are shown, not hidden.

## Horror design review (round 13)

Scope: omen banner, door banner, full-screen flashes, screen shake, ambient lightning, achievement and codex notices, tour, cinematic caption, investigator hits, whisper selection. Goal from the steering: subtle dread, no jump scares as a primary mechanic, no excessive UI intrusion, no randomness without narrative purpose.

| Finding | Change | Why |
|---|---|---|
| Ambient lightning and dread shake used `Math.random` in `draw.js`, so the same seed and dread looked different on every run | `ambientFlash` and `dreadJitter` in `scene.js` hash seed, time slot and dread (`unitHash`); `draw.js` has no `Math.random` left (test) | Deterministic horror: the village's weather is a function of the seed. The remaining `Math.random` is the explicit Reroll button, a player action |
| Flashes came from five call sites with levels up to 0.6 and could repeat back to back | One `requestFlash` gate: level capped at `FLASH_MAX` 0.3, nothing inside `FLASH_MIN_GAP_MS` 4000, none under reduced motion. Omen flash is now 0.15 to 0.30 by tier, drain 0.15, church 0.3 | Avoids strobing and shock flashes; escalation stays readable as dread rather than as a startle |
| Banner stayed 6 s, opaque black box, and any door try replaced it at once | `TOAST_MS` 4500, lighter background and 0.85 alpha; `toastMayReplace` keeps a banner for `TOAST_MIN_HOLD_MS` 1500 unless the new one is rising | Quieter, and rapid door tries coalesce instead of flickering. The aria-live announcement still fires for every notice |
| Achievement and codex notices | No change needed: they were already a journal line plus one live-region announcement, batched when several unlock, with no popup | Checked in `progress-ui.js` |
| Omen text versus dread tier | No change: rising text is keyed by the Core event name (the tier), falling text prints the tier label | Checked in `omenTextL`; no contradiction found |
| Tour, cinematic caption, investigator, whisper selection | No change: tour is opt-in and manual under reduced motion, cinematic is a pure timeline, investigator route and whisper choice are seeded | Checked by reading; their existing node tests cover determinism |

Verification: `web/test/notice-policy.test.js` (determinism, caps, rate limit, coalescing, no `Math.random` in `draw.js`) is **Verified**. How the quieter banner and flashes feel is **Partially Verified** (inspection and headless reasoning only; no screenshot judges motion and nobody has played it in a real browser). The policy lives in the web layer only because it is presentation timing, not a gameplay rule; if Unity needs the same pacing, move it to Core first.

## Round 14: Unity package and playable layer

- Layout: scripts and catalog moved into one UPM package, no copies left. The catalog is shared with `web/data` by the existing byte-identity check.
- New rules went to Core first: `InteractionRules` (reach, cooldown, sanity per kind, category mapping, door text, camera cycle) with property tests. They are **not** mirrored in `web/src` yet because only Unity uses them; if the 3D web demo gets first-person interaction, mirror them with golden entries then (no speculative port now).
- Runtime additions stay thin: they measure distance and time, read input, and forward to Core (`DoorOmen`, `AllowedCamera`, `SanityModel`). `VillageBuilder` block heights and `PlayableVillageSceneBuilder` fog values are presentation constants, not gameplay rules.
- Reflection is used in the scene builder to add HDRP overrides so the Editor assembly has no render-pipeline reference. Cost: a renamed HDRP field degrades to a warning. Status: Unverified.
- Status: compile check Partially Verified (stubs), Unity runtime Unverified, `InteractionRules` Verified.

## Round 15: Unity depth (task 71)

- `CodexModel`, `AchievementRules` and `DailySeed` now have a Runtime consumer: `ProgressionTracker` (thin) over new Core `ProgressionSession` (counts, highest tier and stage, codex and achievement unlocks, id persistence text). Core tests: 94 dotnet tests Verified. The MonoBehaviour is compile checked only; Unity behavior Unverified.
- Prompts: Core `PromptStrings` replaces the raw kind text. Single source of truth is `web/src/i18n.js` wording; a C# test parses that file and fails when en or fr differ. No JS change, so no golden entry. Adding a language needs the row in both places.
- GLB fallback via glTFast: decided against (see `docs/UNITY_SETUP.md`); untestable here, no vendored package, no speculative code.

## Round 13 review follow-up

- Flash gate: a flash stronger than the one that opened the 4 s gap now passes (`applyFlash`, `web/test/notice-policy.test.js`). Status: Verified by node tests; the `app.js` wrapper is one line over the tested function.
- Parity wording: `DreadCurve.AmbienceVolume` and `DreadThresholds.Percent` have Core property tests only. No golden entry or JS mirror, because `music.js` is independent presentation. Status: Verified (C# tests).
- `CodexModel`, `AchievementRules`, `DailySeed` stay in Core: their JS mirrors are golden-checked against them, so they are the source of truth, but Runtime consumer added in round 15 (`ProgressionTracker`).
- Unity drain default 0.5 to 1.0: no serialized `sanityDrainPerSecond` found in the repo by grep; Unity itself was not opened. Status: Unverified in Unity.
- Classifier keywords such as "tea", "web", "log": not spot-checked against real pack names, because packs are gitignored and absent here. Status: Unverified; the unclassified percentage in the scene label is the runtime check.
