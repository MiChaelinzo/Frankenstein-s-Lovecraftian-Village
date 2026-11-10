# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Runtime: `VillageBuilder.pieceCount` default raised from 40 to 80 to match the web demo. Existing Unity scenes that rely on the default will generate a larger village; set it back to 40 to keep the old layout.
- Web: changing the seed now re-applies the selected night's sanity so the night panel and scene agree.
- Runtime: `WalkthroughController.CurrentNight` returns null before `Start` instead of throwing. The controller and `RebindSelected` are still not compiled in CI.

### Added
- Tools: `tools/inspect_unitypackage.py` inventories a local `.unitypackage` (extension counts, prefab GUIDs and pathnames) and suggests catalog id to prefab matches with `PrefabNameMatcher` scoring; output is gitignored and payloads are never extracted. Unit tested on a synthetic package only, not on the real pack.
- Web: `web/selftest.html` runs the JS Core against the embedded C# golden vectors in the browser (126 checks, shown pass/fail); `tools/embed_golden.mjs` regenerates `web/src/golden-data.js` and a node test fails if it drifts. Screenshot: `docs/media/selftest.png`.
- Runtime: `WalkthroughController` steps the director through a seeded campaign (never compiled in Unity).
- Docs: `docs/BUILD_LOG.md`, a history tied to real commits.
- Core: `CampaignGenerator` (seeded multi-night arc with village name, titles, strictly rising dread targets, sky, weather, rumors and lore), with C# property tests, golden parity and a JS port in `web/src/core.js`.
- Web demo: campaign panel with night selector (`,` `.`), `#night=N` share links, dusk/night/witching tint, rain and fog weather (static under reduced motion), and postcard PNG export (`P`). Screenshot: `docs/media/campaign-night5.png`.
- Core: `DreadEvents` (Uneasy, Dire and Abyss thresholds with hysteresis), `VillageReport` (Markdown and JSON), `PrefabNameMatcher`, each with property tests.
- Golden parity extended to cover dread events and reports; the JS port in `web/src/core.js` matches C# exactly.
- Editor: `CatalogAutoBinder` binds catalog ids to imported pack prefabs by name (unverified in the Unity editor).
- `HorrorAmbienceDirector` raises an omen event when a dread threshold is crossed (unverified in the Unity editor).
- Web demo: canvas-fitted board with 80 pieces, gable houses, sea and marsh, lantern cultists, sky eye at Abyss, tentacles at Dire and Abyss, omen toasts, Whispers journal, Markdown and JSON report download, keyboard shortcuts, reduced motion support (`prefers-reduced-motion` or `?reduced=1`) and a responsive layout.
- `tools/screenshot.sh` and screenshots in `docs/media/`.
- CI workflow (`ci.yml`), `CONTRIBUTING.md`, this changelog.
- Validator checks for the new files and for em dashes in tracked text files.

### Notes
- The web demo uses 80 pieces on a 24x24 grid and `VillageBuilder` now defaults to `pieceCount` 80 on 24x24. Match the seed too for the same village (unverified in Unity).
- `HorrorAmbienceDirector` reuses an event buffer (new `DreadEventTracker.Update(dread, buffer)` overload); `CatalogAutoBinder` gains a rebind-all menu item and ordinal tie-breaking for duplicate prefab names (unverified in Unity).

## [0.1.0]

### Added
- Unity 6 HDRP project skeleton, pure C# Core (`SeededRandom`, `PrefabCatalog`, `VillageLayoutGenerator`, `SanityModel`, narration providers, `DreadCurve`), Unity Runtime glue and property-based tests.
- Kiro specs, steering and hooks; `tools/validate_repo.py` guardrails.
- Browser demo in `web/` with golden parity tests against C# and a GitHub Pages workflow.
- Docs: Kiro usage, demo script, Devpost draft, blog draft.
