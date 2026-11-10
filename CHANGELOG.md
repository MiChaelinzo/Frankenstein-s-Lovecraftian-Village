# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
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
