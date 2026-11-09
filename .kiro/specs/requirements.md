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
