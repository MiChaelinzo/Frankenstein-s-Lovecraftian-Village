# Frankenstein's Lovecraftian Village

[![CI](https://github.com/MiChaelinzo/Frankenstein-s-Lovecraftian-Village/actions/workflows/ci.yml/badge.svg)](https://github.com/MiChaelinzo/Frankenstein-s-Lovecraftian-Village/actions/workflows/ci.yml)

![The village at full sanity](docs/media/calm.png)

**[Play in your browser](https://michaelinzo.github.io/Frankenstein-s-Lovecraftian-Village/)** (no Unity, no download). The link is live once the author enables GitHub Pages with Source: GitHub Actions; until then run it locally (see below).

| Dread | Abyss |
|-------|-------|
| ![Rising dread](docs/media/dread.png) | ![The abyss](docs/media/abyss.png) |


A Unity 6 cosmic-horror village environment, built for **Kiroween 2026** in the **Frankenstein** category (#KiroweenHackathon26).

> What happens when cosmic horror, AI development tools, procedural design, and modular game assets are stitched together like Frankenstein's monster?

This project combines Unity 6, AI-assisted development workflows, and a modular Lovecraftian environment to create a dark fantasy village inspired by cosmic horror and environmental storytelling.

## Play it in your browser (no Unity, no download)
A judge-friendly web demo lives in [`web/`](web). It uses the same Core logic as the Unity project, ported to dependency-free JavaScript and verified against C# output, and draws a procedural isometric village with only canvas shapes (no paid assets).

- Live: https://michaelinzo.github.io/Frankenstein-s-Lovecraftian-Village/ (deployed by [`pages.yml`](.github/workflows/pages.yml) once GitHub Pages is set to the "GitHub Actions" source)
- Change the **seed** for a new village, drag **sanity** down to watch the vignette close in, the fog thicken, the moon redden and the narrator turn on you. Click buildings for whispers. Toggle the drone for sound.
- Share a state with the URL hash, for example `#seed=1818&sanity=35`.
- Optional AI narration: add `?narrator=https://your-endpoint` (POST `{location, dread}`, reply `{text}`); any failure falls back to offline text.

What the demo does:
- **Omen events**: crossing Uneasy, Dire and Abyss thresholds (with hysteresis) raises a toast; tentacles appear at Dire and Abyss and a sky eye opens at Abyss.
- **Campaign mode**: a seeded five-night story arc (village name, night titles, rumors, lore, rising dread targets). Pick a night to set its starting sanity, sky tint (dusk, night, witching hour) and weather (clear, rain, fog). `#night=N` in the URL shares a night. `P` saves a postcard PNG with village name, seed and night. Rain and fog are static under reduced motion.

![Campaign night 5](docs/media/campaign-night5.png)
- **Whispers journal**: every whisper is kept, so you can reread what the narrator said.
- **Village report**: download a Markdown or JSON report of the current seed, sanity and layout.
- **Accessibility**: full keyboard control, reduced motion (`prefers-reduced-motion` or `?reduced=1`), responsive layout.

| Key | Action |
|-----|--------|
| `W` | whisper |
| `C` | enter the church |
| `L` | light a candle |
| `N` | new village |
| `[` `]` | sanity -5 / +5 |
| `D` | let the dark creep in |
| `M` | drone on/off |
| `?` | show or hide the list |
| Left / Right / Enter | with the canvas focused: pick a landmark and listen |

Run locally (ES modules need HTTP, not `file://`):
```bash
python3 -m http.server -d web 8000   # then open http://localhost:8000
```

### Verified vs unverified
| Part | Status |
|------|--------|
| Core (`Assets/Scripts/Core`): layout, catalog, sanity, dread curve, dread events, village report, prefab name matcher | Verified: property tests under `dotnet test` |
| JS port in `web/src/core.js` | Verified: golden parity with C# output, `node --test` |
| Web demo visuals | Checked with headless Chromium screenshots (`docs/media`); not tested across browsers |
| Repo guardrails (`tools/validate_repo.py`) and CI (`ci.yml`) | Verified locally; CI has not yet been observed running on GitHub |
| Unity Runtime scripts (`VillageBuilder`, `HorrorAmbienceDirector`, `DreadVolumeBlender`, `HttpNarrationProvider`) | **Unverified**: never run in the Unity editor |
| Unity Editor script `CatalogAutoBinder` (`Tools > Frankenstein > Auto-bind Catalog Prefabs`) | **Unverified**: never compiled or run in the Unity editor |

The web demo places 80 pieces. The Unity `VillageBuilder` default `pieceCount` is 40, so set it to 80 to get the same village for the same seed.

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
| Sanity-driven Horror Director | Turns sanity into dread, audio and HDRP volume blends (`DreadVolumeBlender`) |
| Browser demo (`web/`) | JS port of Core plus canvas village, verified against C# |
| Pluggable AI narration (`INarrationProvider`) | Optional AI text with safe offline fallback |
| Kiro | Specs, steering, hooks and agents that built and guard the project |

## Repository layout
See [.kiro/steering/structure.md](.kiro/steering/structure.md). Pure logic is in `Assets/Scripts/Core` (no Unity dependency), Unity glue in `Assets/Scripts/Runtime`.

## Setup
1. Install **Unity 6** (6000.0.x). Use the HDRP template modules for the HDRP package, or URP for the URP package.
2. Clone this repo and open it as a Unity project.
3. Download the package that matches your render pipeline from the Downloads section above (the OneDrive links are the only supported source; the packages are imported locally and never committed).
4. Import it: `Assets > Import Package > Custom Package...`, pick the `.unitypackage`, and import everything. Keep the default `Assets/Lovecraftian Village*` location; those folders are gitignored.
5. Create a `Frankenstein > Village Catalog` asset, then either run the auto-binder (`CatalogAutoBinder` in `Assets/Scripts/Editor`, matches catalog ids to imported prefab names; unverified in Unity) or add bindings by hand (ids from `Assets/Data/village_catalog.json`) and assign the imported prefabs.
6. Add a `VillageBuilder` and a `HorrorAmbienceDirector` to a scene.
7. Optional: create two global Volumes (calm and dread, same overrides) and assign them to a `DreadVolumeBlender`, then reference it from the director. Set `narrationEndpoint` on the director for HTTP AI narration.

The Unity-side pieces (catalog binding, scene, `DreadVolumeBlender`, `HttpNarrationProvider`) have not been run in the Unity editor yet; the Core logic they wrap is tested.

### Which package do I import?
| Your project | Package | Notes |
|--------------|---------|-------|
| HDRP (this repo's default) | `Lovecraftian1.3 HDRP(Unity6).unitypackage` | `Packages/manifest.json` references `com.unity.render-pipelines.high-definition`, so it works as is. |
| URP | `Lovecraftian1.3 URP(Unity6).unitypackage` | The scaffold manifest targets HDRP. Swap `com.unity.render-pipelines.high-definition` for `com.unity.render-pipelines.universal` in `Packages/manifest.json` (or create a URP project and copy `Assets/Scripts`, `Assets/Data`), then import the URP package. |

Do not import the HDRP package into a URP project or the reverse: materials and shaders will render pink. The scripts in `Assets/Scripts` do not depend on a render pipeline.

### Legal and asset-handling note
The Lovecraftian Village pack is third-party content by DLNK Artworks. It is **not** committed to this repository: `.unitypackage` files and the imported pack folders are gitignored, and `tools/validate_repo.py` fails if pack files are added. Respect the pack's license and obtain it only from the OneDrive links in the Downloads section and import it locally. Git LFS is not used and is not needed. The repo's own code and docs are Apache-2.0.

## Run the tests (no Unity needed)
```bash
dotnet test tests/Frankenstein.Core.Tests
node --test "web/test/*.test.js"      # JS port, including parity with C# output (Node 20+)
python3 tools/validate_repo.py
```
After intentionally changing Core behavior, regenerate the parity contract with `UPDATE_GOLDEN=1 dotnet test tests/Frankenstein.Core.Tests` and update `web/src/core.js` to match.
The tests are property-based: each property runs 300 seeded random cases and reports the failing seed. If your home directory is read-only, run with `HOME=/tmp/home`.

Contributor guide: [CONTRIBUTING.md](CONTRIBUTING.md). History: [CHANGELOG.md](CHANGELOG.md). Screenshots are produced with `tools/screenshot.sh`.

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
