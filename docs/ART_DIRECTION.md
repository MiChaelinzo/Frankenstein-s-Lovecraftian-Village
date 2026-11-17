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

## Round 20: scale, streets, materials, weather
- Houses are two storeys (storey 3 m, ridge 6 to 10 m, at least 2 by 2 cells) so a 1.7 m person reads small beside them. Streets (4 m lanes every 6 cells, a cobbled square) give the eye a path; houses face the nearest lane.
- Materials: procedural timber, slate and mud, plus a few CC0 photo textures (stone, roof, cobble, ground) and two CC0 props (barrel, bench), all lazy loaded and credited in `THIRD_PARTY_ASSETS.md`. No normal maps yet.
- Weather per day (clear, overcast, drizzle, rain, storm, fog, mist) changes fog, sky, particles, wind and window glow; birds (gulls, crows, huge silhouettes at high dread) make the sky feel watched. Lightning goes only through the capped flash gate.
- Honest bar: a flat shaded WebGL1 look, not AAA. Status: Partially Verified (SwiftShader stills), real GPU Unverified.

## Round 21: scale perception audit
Does the citizen still read as a giant? **No, not in the stills we can render** (`docs/media/r21-before-street.png`, `r21-after-street.png`, SwiftShader, Partially Verified: the author has not confirmed on a real GPU). The eye height was already 1.6 m and the villagers 1.7 m before this round, so the numbers were never the cause. The feeling came from perception cues, fixed here:

| Cue | Before | After |
| --- | --- | --- |
| Title and cinematic fly-through height | 4.8 to 7.6 m, above the eaves, so the first view of the village was from a rooftop | 1.6 to 2.2 m (`FlythroughPath.BaseHeight` 1.9, sway 0.3), pushed out of walls by the 3D view |
| Cobble repeat | 2 m tile, about 0.29 m stones | `TILE_M.cobble` 1.4 m, about 0.2 m stones |
| Stone block repeat | 2.9 m tile, 1.2 m blocks | `TILE_M.stone` 1.2 m, about 0.5 m blocks |
| Slate repeat | 2.4 m tile, 0.6 m rows | `TILE_M.roof` 1.2 m, 0.3 m rows |
| Timber frame | beams 0.42 m thick on a 3 m tile | beams 0.23 m (texture drawn thinner, tile still one storey) |
| Field of view and eye | fixed 64.2 degrees, 1.6 m | default 64 degrees, 1.6 m, user range 55 to 75 degrees and 1.5 to 1.8 m (Help dialog, saved in `localStorage`, clamped on every read) |

Prop heights: `propHeights` in `village_shapes.json` gives a believable range for every mesh; C# (`WorldScaleTests`) and JS (`world-scale.test.js`) check all 37. Third party barrel and bench are fitted into the original mesh box, so they keep the original real size. Lanes stay 4 m wide against 6 to 10 m houses (3 to 5 m target, upper floors overhang).

Not done, on purpose: a first-person body or hands (no original mesh exists yet, and a placeholder would add noise), and terrain following (the walkable ground is flat; the church hill lies outside the walkable bounds, so the offset would always be 0). Photo texture tile sizes are estimates, so the CC0 stone, slate and cobble photos may show slightly different feature sizes than the procedural ones.

## Round 21: tiers and the night grade
- Tone: the post pass applies an ACES fit curve in linear light, so blacks sink and lantern cores roll off into amber instead of clipping. Exposure drops by up to 12% with dread, so a bad night is a darker night. The split tone stays: cold teal shadows, warm highlights.
- Wet nights: rain and storm darken stone and cobbles by up to 30% and add moon and lantern streaks on them (`WETNESS` in `view3d-math.js`). Fog and mist leave a faint film.
- The sea meets the land with a broken, slowly pulsing foam band; clouds near the moon get a silver edge; the haze brightens toward the moon.
- Contact: people get soft blob shadows; the 2D map gets cast shadows away from the moon and window light on the street.
- Low tier keeps the round 20 look without the post pass, which is the honest fallback for a weak laptop. Stills: `docs/media/r21-high-rain-night.png`, `r21-low-rain-night.png`, `r21-before-rain-night.png`, `r21-high-square-wells.png`, `r21-2d-before.png`, `r21-2d-after.png`.

## Dredge and Silent Hill mood (round 22)
Qualitative only. Nothing is copied from either game: no assets, no names, no layouts. The goal is a village that feels like a damp fishing town with something wrong in the air.

**Palette.** Ground is mossy and wet (dark green brown, hand placed bare earth and straw patches), stone is cold blue grey, wood is brown, and the only saturated colour is lamplight (amber, 255,190,110) and, at high dread, a dull red. Sky: cold violet zenith, a bruised band, a low warm horizon haze. Sea is near black with a faint moon streak. Walls keep a contact shadow at their base; foliage is exempt and gets a small lift so grass reads as grass, not black spikes.

**Fog rules.** Fog is close and grey green, denser on higher tiers (`closeFog` in `view3d-math.js`), with colour taken from the sky, never pure grey. Fully fogged pixels return early. Far ground is fog by design (distance LOD). Fog rises with dread; at low dread it hides the edge of the world, at high dread it pools on the lanes. In 2D the same idea is a fog pool on the board plus a cold top and warm low grade (`dredgeMood`).

**Rules for new content.** Lit windows are a minority at night (window mood: 20 to 50 percent unlit, some guttering); lamps and held lanterns always stay lit; light is warm and local; no jump scares; one unexplained detail per street.

**Known gaps (Partially Verified, SwiftShader only):** windows read as flat brown shutters (no glass or interior), the held lantern glass is dull and low on screen, grass tufts are thin cones, wet sheen is faint. See round 23 tasks in `.kiro/specs/tasks.md`.

**Round 23 depth pass (Medium and High, Partially Verified in SwiftShader stills):** lower walls gather moss and grime, cobble seams grow moss and stay damp-dark, window glass is warmer, and distant fog leans blue-violet with a warm band at the horizon. Low keeps the flat look. Stills: `docs/media/r23-*.png`.
