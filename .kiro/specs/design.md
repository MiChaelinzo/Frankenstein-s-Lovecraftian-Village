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

## Correctness properties (tested)
| Req | Property |
|-----|----------|
| R1.1 | same inputs give equal layouts |
| R1.2-1.4 | in bounds, no overlap, ids in catalog |
| R1.5 | degenerate inputs give empty |
| R2 | invalid entries dropped, pick never null |
| R3 | sanity in [0,100], dread monotonic, NaN safe |
| R4.2 | safe provider never throws or blank |

## Testing strategy
Property-based: many seeded random cases per property, failing seed reported. Core files are compiled into an xunit project so no Unity editor is required.
