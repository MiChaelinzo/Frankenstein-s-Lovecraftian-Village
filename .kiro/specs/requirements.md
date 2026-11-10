# Requirements: Stitched Village Slice

## Introduction
A Unity 6 HDRP village that is assembled procedurally from a catalog of modular pieces, reacts to player sanity, and can narrate via a pluggable provider.

## Requirements

### R1 Village stitching
**User story:** As a level designer, I want a village generated from a catalog by id, so that I can swap art without touching code.
1. WHEN a seed, grid size, piece count and catalog are given THEN the generator SHALL return the same layout every time for the same inputs.
2. The generator SHALL keep every piece inside the grid.
3. The generator SHALL NOT place overlapping pieces.
4. The generator SHALL only use ids that exist in the catalog.
5. IF the catalog is empty or sizes are not positive THEN the generator SHALL return an empty layout.

### R2 Catalog validity
1. The catalog SHALL ignore entries with empty ids, duplicate ids, or non-positive weight or footprint.
2. Weighted picking SHALL return an entry for every roll in [0, total weight).

### R3 Sanity and dread
1. Sanity SHALL stay within 0 to 100 for any sequence of changes, including NaN.
2. Dread SHALL never increase when sanity increases.

### R4 Narration
1. Narration SHALL be provided through `INarrationProvider`.
2. IF the AI provider throws or returns blank text THEN the system SHALL fall back to offline text.

### R5 Legal and repo hygiene
1. The paid Lovecraftian Village pack SHALL NOT be committed.
2. `.kiro/` SHALL be committed and not gitignored.
3. The repo SHALL include an open source license (Apache-2.0).

### R6 Dread blending
1. The system SHALL map dread to a blend weight in [0,1] that never decreases as dread increases.
2. Non-finite dread SHALL be treated as no dread.

### R7 Judge-runnable web demo
1. The repo SHALL include a browser demo that runs without Unity or paid assets.
2. The demo's layouts, RNG output, narration and dread SHALL equal the C# Core output for the checked-in golden seeds.
3. The demo SHALL let a user share a seed and sanity level through the URL.

### R8 Dread events
1. WHEN dread rises past the Uneasy, Dire or Abyss threshold THEN the system SHALL emit exactly one rising event for that threshold.
2. A rising event SHALL NOT repeat until dread has fallen below the threshold minus the hysteresis margin.
3. Non-finite dread SHALL be treated as no dread.

### R9 Village report
1. The system SHALL produce a report of seed, sanity, dread and layout as Markdown and as JSON.
2. The same inputs SHALL produce the same report.
3. Non-finite dread SHALL be stored as a string ("NaN", "Infinity") so the JSON stays valid.

### R10 Prefab auto-binding
1. The matcher SHALL map a catalog id to the best-named prefab, or to none when nothing matches.
2. The matcher SHALL be case-insensitive and deterministic.
3. The Unity editor binder SHALL only use the matcher and SHALL NOT copy pack files into the repo.

### R11 Accessibility
1. The web demo SHALL be fully operable from the keyboard.
2. WHEN reduced motion is requested (`prefers-reduced-motion` or `?reduced=1`) THEN the demo SHALL avoid flicker and sway.
3. The layout SHALL remain usable on narrow screens.
