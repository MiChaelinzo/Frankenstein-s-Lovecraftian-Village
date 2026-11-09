# Design

## Architecture
Two assemblies. `Frankenstein.Core` has no engine references and holds all rules. `Frankenstein.Runtime` holds thin Unity glue.

## Components
- `SeededRandom`: xorshift32, identical results in Unity and .NET.
- `PrefabCatalog` / `CatalogEntry`: validated lookup by id, weighted pick.
- `VillageLayoutGenerator`: grid occupancy stitching, deterministic.
- `SanityModel`: clamped sanity, `DreadFor(sanity)` linear and monotonic.
- `INarrationProvider`, `StaticNarrationProvider`, `SafeNarrationProvider`: pluggable narration with fallback.
- `VillageCatalogAsset` (ScriptableObject): binds catalog ids to prefabs from the owned pack.
- `VillageBuilder`, `HorrorAmbienceDirector` (MonoBehaviours): apply Core results.
- `HttpNarrationProvider`: optional AI narration, non-blocking, always wrapped by `SafeNarrationProvider`.
- `DreadVolumeBlender`: moves the weights of a calm and a dread post-processing Volume using `DreadCurve.Weight`.

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
| R7 | JS port equals C# for RNG, layouts, narration and dread (golden file) |

## Testing strategy
Property-based: many seeded random cases per property, failing seed reported. Core files are compiled into an xunit project so no Unity editor is required.
