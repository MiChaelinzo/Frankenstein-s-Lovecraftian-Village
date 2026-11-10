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
- `CatalogAutoBinder` (`Assets/Scripts/Editor`, `Frankenstein.Editor` asmdef): editor-only menu that binds catalog ids to pack prefabs. Unverified in Unity.

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
