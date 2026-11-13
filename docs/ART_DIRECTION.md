# Art direction: the harbour quarter

The user asked for inspiration from the optional URP/HDRP village assets and for a more beautiful world. Those assets stay opt-in, local and git-ignored (`?pack=1`, Unity Auto-bind). Nothing from them is committed.

## What was taken from them (qualitative only)

Only general composition ideas, no numbers, textures, materials, coordinates or transforms:

- A coastal village reads best as buildings strung along one road beside the water, not scattered.
- Working props gather where work happens: crates and barrels at the quay and at the inn door.
- A lighthouse belongs at the end of the shore, away from the quay, with a small chapel near it.
- Street lamps at an even, steady spacing pull the eye along the road.
- Warm lit windows and lamps against a cool, desaturated dusk sky give the mood.

## What was hand authored

Every number is our own choice, in `Core/VillageDressing.cs` (mirrored in `web/src/dressing.js`, golden key `dressing`):

- Cottages (thatch and tall) on the inland side of the coast road, one inn about eleven metres from the dock on a seeded side, a lighthouse and chapel at the far end, crates and barrels around the dock root.
- Lamps along the road: `lamp`, `lamp_tall`, `lamp_double` in turn.
- A market stall in the square (first free spot near the grid centre), gravestones and an iron fence on the church rise, and a small churchyard south of a layout church when there is room.
- The 12 village meshes are all used. Scale never exceeds 1 (the inn and chapel are shrunk to fit the shore strip).
- Palette: the existing dusk and night palette, chosen by eye. Villagers stay at person height (1.7 m).

## Status

- Core rule, JS mirror and golden parity: Verified (dotnet test and node test).
- Render in the default 3D view: Partially Verified (headless screenshots and the browser check; no GPU review).
- Unity placement of the same dressing: Unverified (not implemented in this round, tracked in `.kiro/specs/tasks.md`).
- `?pack=1` with the new props: see docs/BUILD_LOG.md for the browser check result.
