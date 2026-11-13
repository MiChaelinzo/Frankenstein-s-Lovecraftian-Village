
## DLNK scene mode, Blender pipeline, compile check
`tools/dlnk_scene.py` parses PrefabInstance modifications, maps guids to names and classifies kinds; `build_local_pack.py` writes `scene_layout.json` and material properties (git-ignored). `web/src/dlnk-layout.js` validates, fits by percentile bounds and picks a scene. `tools/blender/gen_meshes.py` runs in Blender 4.2 LTS (git-ignored `pack-scratch/blender`) and writes GLB to `web/assets/meshes/`; `web/src/glb.js` parses and projects in software (no WebGL). `tests/UnityCompileCheck` compiles Runtime and Editor scripts against original stubs.
# Design

## Architecture
Two assemblies. `Frankenstein.Core` has no engine references and holds all rules. `Frankenstein.Runtime` holds thin Unity glue.

## Components
- `SeededRandom`: xorshift32, identical results in Unity and .NET.
- `PrefabCatalog` / `CatalogEntry`: validated lookup by id, weighted pick; optional `prefabHint` (a prefab name only).
- `VillageLayoutGenerator`: grid occupancy stitching, deterministic.
- `SanityModel`: clamped sanity, `DreadFor(sanity)` linear and monotonic.
- `INarrationProvider`, `StaticNarrationProvider`, `SafeNarrationProvider`: pluggable narration with fallback.
- `VillageCatalogAsset` (ScriptableObject): binds catalog ids to prefabs from the owned pack.
- `VillageBuilder`, `HorrorAmbienceDirector` (MonoBehaviours): apply Core results.
- `HttpNarrationProvider`: optional AI narration, non-blocking, always wrapped by `SafeNarrationProvider`.
- `DreadVolumeBlender`: moves the weights of a calm and a dread post-processing Volume using `DreadCurve.Weight`.

- `DreadEventTracker` (`DreadEvents.cs`): turns dread into one-shot threshold events (Uneasy 0.34, Dire 0.67, Abyss 0.9) with a 0.05 hysteresis margin.
- `VillageReport`: Markdown and JSON report of a seed, sanity and layout.
- `PrefabNameMatcher`: pure name matching used by the editor auto-binder; `Resolve(id, hint, candidates)` prefers the hint.
- `CatalogAutoBinder` (`Packages/com.michaelinzo.frankenstein-village/Editor`, `Frankenstein.Editor` asmdef): editor-only menu that binds catalog ids to pack prefabs. Unverified in Unity.

## Web demo (`web/`)
`web/src/core.js` is a dependency-free JS port of Core (same xorshift32 integer math, same placement order). `web/src/app.js` renders an isometric procedural village on a canvas and maps dread to vignette, fog, flicker, moon and optional WebAudio drone. State is shareable through the URL hash (`#seed=1818&sanity=70`). `GoldenParity` in the xunit project emits `web/test/golden.json`; `node --test` asserts the JS output equals it, so the two implementations cannot drift silently.

## Correctness properties (tested)
| Req | Property |
|-----|----------|
| R1.1 | same inputs give equal layouts |
| R1.2-1.4 | in bounds, no overlap, ids in catalog |
| R1.5 | degenerate inputs give empty |
| R2 | invalid entries dropped, pick never null |
| R3 | sanity in [0,100], dread monotonic, NaN safe |
| R4.2 | safe provider never throws or blank |
| R6 | dread curve weight stays in [0,1] and is monotonic |
| R8 | a rising event never repeats without a falling event; tier is consistent; NaN and infinities are safe |
| R9 | report is deterministic and its JSON is valid, including non-finite dread |
| R10 | matcher is case-insensitive, deterministic, and returns none when nothing matches |
| R11 | verified by manual and screenshot checks only (no automated property) |
| R7 | JS port equals C# for RNG, layouts, narration, dread, events and reports (golden file) |

## Testing strategy
Property-based: many seeded random cases per property, failing seed reported. Core files are compiled into an xunit project so no Unity editor is required.

## DLNK adapter layer

`DreadBuildingPolicy` (Core) holds per-building detail level, floor peel, door omens and camera policy, all driven by `DreadThresholds.TierFor` and `SeededRandom` seeded from a stable FNV-1a hash of the building id. The Runtime `Dlnk*Bridge` components only forward these results through UnityEvents, so no DLNK type is referenced. The JS port in `web/src/core.js` is checked by the `buildings` golden section.

## Story sequencer
`StorySequencer.Build(Campaign)` (Core, engine-free) walks the campaign nights and emits five `StoryBeat`s each. The omen line is picked with `SeededRandom(seed ^ 0x1badf00d)` from the tier of the night's integer dread percent (thresholds 34, 67, 90 mirror `DreadThresholds`). `web/src/story.js` mirrors it and adds `parseStoryParam` for `#story=N&beat=N` deep links. Parity is enforced through the `stories` section of `web/test/golden.json`.

## Story UI, intro and soundtrack
`web/src/app.js` drives story mode from `story.js` beats (sanity ramps toward `100 - dreadPercent`, autoplay uses `durationMs`). `web/src/intro.js` holds pure intro helpers and the auto-skip rule for deep links. `web/src/music.js` has deterministic pure helpers (root from seed, drone, pulse schedule, gain clamp) and a thin WebAudio controller that is created only after the user ticks Music.

## Ritual stage: night schedule versus dread
The ritual stage used to follow current dread only, so night 4 at sanity 80 (20% dread) showed "stage 1 of 5" even though the campaign was on its fourth night. Both behaviors are kept and combined in `RitualChain.Progress` (JS `ritualProgress`):
- **Scheduled stage**: `ScheduledStageForNight`, night N maps to stage N (clamped to the chain).
- **Dread-reached stage**: the existing `StageForDread`, highest stage whose threshold the current dread has reached.
- **Effective stage**: the larger of the two, so the night sets a floor and dread can still run ahead of it. A pace flag says `behind`, `on` or `ahead` (dread reached versus schedule).

The web HUD, journal and case file print both numbers ("Night schedule: stage 4 of 5, dread reached: stage 1 (behind)") next to the effective stage. `RitualSaveState` (Core, text form `ritual1;seed;night;stage`) round-trips and clamps; the session link/save also carries the effective `stage`. Property tests cover the max/floor rule, monotonicity in dread and night, and the invariant across ritual, story and campaign (stage omen id matches the night's omen beat, thresholds stay at or below the night target and rise).

Unity side (Unverified in Unity, not compiled here): `RitualDirector` listens to `HorrorAmbienceDirector.OmenCrossed` and `WalkthroughController.NightStarted`, raises `OnStageAdvanced(stage, name)`; `RitualStateAsset` is the ScriptableObject mirror; `RitualSaveBridge` stores the Core `RitualSaveState` text in PlayerPrefs.

## Tour, journal tabs and progress gate
`tour.js` is the pure step model (steps, next, previous, delays, key map, `tourCardPlacement`); `tour-ui.js` owns the DOM, highlights the target control, scrolls it into view and re-places the card on each step and on resize. `progress-gate.js` is a one-way switch: before the first player action, unlocks are shown as previews and nothing is saved over the stored progress. `journal.js` splits entries into Story and Progress for the two tabs.

## Round 18: lock, Unity vigil, touch
`VigilRules.AllowsSandboxAction` and `CountsAsClue` in `Core/VillageVigil.cs` decide the lock and clue kinds; `web/src/vigil-ui.js` renders the lock reason and `app.js` guards each sandbox control. `Core/VigilStrings.cs` mirrors the `vigil.*` web strings, guarded by a drift test. `Runtime/VigilDirector.cs` stays thin and `ProgressionTracker` forwards through `CountsAsClue`. `web/src/touch-ui.js` with pure helpers in `input.js` draws the touch dock. `EPILOGUE_LOOKS` and `epilogueHref` are a web-only presentation exception recorded in `.kiro/steering/tech.md`.

## Round 17: Vigil, title screen and post pass
`Core/VillageVigil.cs` (`VigilRules`, `VigilState`, `VigilOutcome`) owns every rule; `web/src/core.js` mirrors it and `vigil.test.js` checks the golden `vigil` section. `vigil-view.js` is pure view models (objective line, ending model, result text); `vigil-ui.js` owns the DOM. `title.js` decides whether the title shows, `title-ui.js` draws it. In 3D, lantern pools, cold fill light, the moon (a disc that replaces the sky behind it, never adds up to white), a hue preserving highlight shoulder on lit walls and one fullscreen post pass are web only presentation. Moon, lantern gain and bloom threshold are tuned so lit walls keep their colour and the moon stays pale.

## Round 19: GameClock, villagers and talk
**Goal.** A cozy day and night village whose residents keep a routine that dread slowly bends. Genre inspiration only: "Nivalis nights" was read as a cozy day/night sim with NPC schedules; nothing is copied from any such game, and the author may correct this reading.

**Inputs.** Seed, the village layout (`PlacedPiece` list from `VillageLayoutGenerator`, unchanged), a tick (one village minute, wraps per day), dread (float, sanitized like `DreadThresholds`), the campaign and night number for rumors.

**Outputs.** `GameClock`: phase (dawn 240, day 600, dusk 240, night 360 minutes; named constants), daylight percent, lanterns lit. `VillagerRules.GenerateRoster`: seven villagers (fisher, priest, innkeeper, lamplighter, lighthouse keeper, widow, child) with unique seeded names, a seeded disposition (kind, wary, haunted, closed), a home on a house piece and a workplace on a matching piece (church or altar, a second house, well, dead tree or altar), falling back to the home. `ScheduledPlace`, `BehaviorAt`, `LocationAt`, `CauseOf`, `Talk` (clue flag, sanity delta, line variant, campaign rumor). `VillagerStrings` gives en and fr wording (mirrors the `villager.*` entries of `web/src/i18n.js`).

**Behavior ladder (causes, not randomness).** Dread picks a severity: window at Uneasy (the village watches the lights), facing the sea at 0.5 (the tide calls), repeating a phrase at Dire (the name in the water), vanished at Abyss (taken by the deep). Haunted villagers react one level earlier. Daylight takes two levels off, so by day and at low dread everyone is normal. Abyss vanishes everyone at any hour.

**Talk.** `VigilRules.VillagerTalkCountsAsClue` (kind and haunted villagers, or any villager facing the sea or repeating themselves, but never a vanished one); sanity from `InteractionRules.TalkSanityDelta` (clue costs a landmark study, sea or phrase costs a whisper, vanished is free); rumor from `CampaignGenerator`. Existing `CountsAsClue` and the existing golden sections are unchanged.

**Constraints.** Core only, no UnityEngine, integer ticks, seed-only randomness. The talk result holds no display text, so AI or translated text can never change a clue or a sanity cost. JS mirror: `web/src/clock.js`, `web/src/villagers.js`, rules in `core.js`; parity via the `villagers` golden section and the Villagers self-test group.

**Failure conditions.** Empty layout gives piece index -1 and no crash. Unknown language falls back to English. A null campaign gives an empty rumor. NaN or infinite dread counts as 0. Negative ticks wrap.

**Test cases.** `VillagerProperties.cs` (same seed same roster, full-day schedule validity, monotonic behavior in dread, Abyss vanishes, day normal at low dread, talk deterministic and text independent, i18n drift) and `web/test/villagers.test.js` plus golden parity. Status: Verified by dotnet and node tests; Unity runtime Unverified (no Unity wiring yet).
