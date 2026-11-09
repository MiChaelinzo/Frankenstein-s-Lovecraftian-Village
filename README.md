# Frankenstein's Lovecraftian Village

> What happens when cosmic horror, AI development tools, procedural design, and modular game assets are stitched together like Frankenstein's monster?

A Unity 6 HDRP cosmic-horror village environment, built for the **Kiroween hackathon** in the **Frankenstein** category (#KiroweenHackathon26).

## The Frankenstein pitch
Unlike parts, one creature:

| Part | Role |
|------|------|
| Lovecraftian Village 1.3 HDRP (commercial, owned, not included) | Modular art kit |
| Procedural stitcher (`VillageLayoutGenerator`) | Assembles pieces by id from a catalog |
| Sanity-driven Horror Director | Turns sanity into dread, audio and (planned) HDRP volume blends |
| Pluggable AI narration (`INarrationProvider`) | Optional AI text with safe offline fallback |
| Kiro | Specs, steering, hooks and agents that built and guard the project |

## Repository layout
See [.kiro/steering/structure.md](.kiro/steering/structure.md). Pure logic is in `Assets/Scripts/Core` (no Unity dependency), Unity glue in `Assets/Scripts/Runtime`.

## Setup
1. Install **Unity 6** (6000.0.x) with the HDRP template modules.
2. Clone this repo and open it as a Unity project.
3. Import your own copy of **Lovecraftian Village 1.3 HDRP**: `Window > Package Manager > My Assets`, download and import. See [Assets/ThirdParty/LovecraftianVillage/README.md](Assets/ThirdParty/LovecraftianVillage/README.md).
4. Create a `Frankenstein > Village Catalog` asset, add bindings (ids from `Assets/Data/village_catalog.json`) and assign your prefabs.
5. Add a `VillageBuilder` and a `HorrorAmbienceDirector` to a scene.

### Legal note
The Lovecraftian Village pack is a commercial product. It is **not** distributed here and is gitignored. You need your own license. The repo's code and docs are Apache-2.0.

## Run the tests (no Unity needed)
```bash
dotnet test tests/Frankenstein.Core.Tests
python3 tools/validate_repo.py
```
The tests are property-based: each property runs 300 seeded random cases and reports the failing seed. If your home directory is read-only, run with `HOME=/tmp/home`.

## Built with Kiro
Specs, hooks and steering are in [`.kiro/`](.kiro). Details in [docs/KIRO_USAGE.md](docs/KIRO_USAGE.md). Demo script: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md). Submission draft: [docs/DEVPOST_SUBMISSION.md](docs/DEVPOST_SUBMISSION.md).

## License
Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE).
