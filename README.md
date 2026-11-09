# Frankenstein's Lovecraftian Village

A Unity 6 cosmic-horror village environment, built for **Kiroween 2026** in the **Frankenstein** category (#KiroweenHackathon26).

> What happens when cosmic horror, AI development tools, procedural design, and modular game assets are stitched together like Frankenstein's monster?

This project combines Unity 6, AI-assisted development workflows, and a modular Lovecraftian environment to create a dark fantasy village inspired by cosmic horror and environmental storytelling.

## Downloads

The original environment packages are hosted on OneDrive due to GitHub file size limitations.

### Unity 6 HDRP Package

Download:
https://onedrive.live.com/?id=%2Fpersonal%2F8d24f63b531c559f%2FDocuments%2F%5FWork%2FAssetStore%2FUnityPipeline%2F%5B21%5DLovecraftianVillage%2FLovecraftian1%2E3%20HDRP%28Unity6%29%2Eunitypackage&listurl=%2Fpersonal%2F8d24f63b531c559f%2FDocuments&e=k27oru&migratedtospo=true

### Unity 6 URP Package

Download:
https://onedrive.live.com/?id=%2Fpersonal%2F8d24f63b531c559f%2FDocuments%2F%5FWork%2FAssetStore%2FUnityPipeline%2F%5B21%5DLovecraftianVillage%2FLovecraftian1%2E3%20URP%28Unity6%29%2Eunitypackage&listurl=%2Fpersonal%2F8d24f63b531c559f%2FDocuments&e=OdQZDB&migratedtospo=true

Both packages are the same Lovecraftian Village 1.3 environment built for Unity 6, one per render pipeline. The packages are the work of DLNK Artworks (see Credits) and are linked from OneDrive, not stored in this repository. Do not commit them.

## Features

- Unity 6 compatible
- HDRP and URP support
- Lovecraftian horror atmosphere
- Modular village building system
- Fantasy and horror environment design
- First-person, third-person, and top-down compatibility
- AI-assisted development workflow
- Built for Kiroween 2026 Frankenstein challenge

## The Frankenstein pitch
Unlike parts, one creature:

| Part | Role |
|------|------|
| Lovecraftian Village 1.3 (HDRP or URP, third-party, not committed here) | Modular art kit |
| Procedural stitcher (`VillageLayoutGenerator`) | Assembles pieces by id from a catalog |
| Sanity-driven Horror Director | Turns sanity into dread, audio and (planned) volume blends |
| Pluggable AI narration (`INarrationProvider`) | Optional AI text with safe offline fallback |
| Kiro | Specs, steering, hooks and agents that built and guard the project |

## Repository layout
See [.kiro/steering/structure.md](.kiro/steering/structure.md). Pure logic is in `Assets/Scripts/Core` (no Unity dependency), Unity glue in `Assets/Scripts/Runtime`.

## Setup
1. Install **Unity 6** (6000.0.x). Use the HDRP template modules for the HDRP package, or URP for the URP package.
2. Clone this repo and open it as a Unity project.
3. Download the package that matches your render pipeline from the Downloads section above (or import your own licensed copy from the Asset Store via `Window > Package Manager > My Assets`).
4. Import it: `Assets > Import Package > Custom Package...`, pick the `.unitypackage`, and import everything. Keep the default `Assets/Lovecraftian Village*` location; those folders are gitignored.
5. Create a `Frankenstein > Village Catalog` asset, add bindings (ids from `Assets/Data/village_catalog.json`) and assign the imported prefabs.
6. Add a `VillageBuilder` and a `HorrorAmbienceDirector` to a scene.

### Which package do I import?
| Your project | Package | Notes |
|--------------|---------|-------|
| HDRP (this repo's default) | `Lovecraftian1.3 HDRP(Unity6).unitypackage` | `Packages/manifest.json` references `com.unity.render-pipelines.high-definition`, so it works as is. |
| URP | `Lovecraftian1.3 URP(Unity6).unitypackage` | The scaffold manifest targets HDRP. Swap `com.unity.render-pipelines.high-definition` for `com.unity.render-pipelines.universal` in `Packages/manifest.json` (or create a URP project and copy `Assets/Scripts`, `Assets/Data`), then import the URP package. |

Do not import the HDRP package into a URP project or the reverse: materials and shaders will render pink. The scripts in `Assets/Scripts` do not depend on a render pipeline.

### Legal and asset-handling note
The Lovecraftian Village pack is third-party content by DLNK Artworks. It is **not** committed to this repository: `.unitypackage` files and the imported pack folders are gitignored, and `tools/validate_repo.py` fails if pack files are added. Respect the pack's license and obtain it from the Downloads links or the Asset Store as applicable. The repo's own code and docs are Apache-2.0.

## Run the tests (no Unity needed)
```bash
dotnet test tests/Frankenstein.Core.Tests
python3 tools/validate_repo.py
```
The tests are property-based: each property runs 300 seeded random cases and reports the failing seed. If your home directory is read-only, run with `HOME=/tmp/home`.

## Built with Kiro
Specs, hooks and steering are in [`.kiro/`](.kiro). Details in [docs/KIRO_USAGE.md](docs/KIRO_USAGE.md). Demo script: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md). Submission draft: [docs/DEVPOST_SUBMISSION.md](docs/DEVPOST_SUBMISSION.md). Blog draft: [docs/BLOG_POST.md](docs/BLOG_POST.md).

## License
Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Challenge Theme

**Frankenstein**

Stitch together a chimera of technologies into one project.

This submission combines:

- Unity 6
- Kiro AI-assisted development
- Lovecraftian horror themes
- Modular environment art
- Procedural design concepts
- Narrative worldbuilding

## Credits

Environment assets courtesy of DLNK Artworks' Lovecraftian Village environment pack.

Created by Michael G. Inso for Kiroween 2026.
