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

## What is and is not verified
- Verified by running them: the C# Core property tests (`dotnet test`), the JS tests (`node --test`), the golden parity between the two, the repo validator, and the self-test page in headless Chromium (`docs/media/selftest.png`).
- Never compiled or run in the Unity editor: everything under `Assets/Scripts/Runtime` and `Assets/Scripts/Editor`, including `WalkthroughController.cs`.
- Real packages: downloaded, inspected and used for the local `?pack=1` mode here; pack content is never committed. Still not opened in Unity.
