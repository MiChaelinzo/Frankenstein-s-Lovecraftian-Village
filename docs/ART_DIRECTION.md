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

**Round 23 silhouettes (all tiers, meshes; Partially Verified in SwiftShader stills):** houses and cottages stand on stone ground floors with a wider timber upper floor (jetty), dormers on `house_b`, `cottage_tall` and `inn`, a pair of taller chimneys on `house_b`, and roof rises from 1.9 to 3.4 m. Lantern halos grow on Medium (x1.25) and High (x1.5) and gain a warm core. The frame triangle budget (60% of 60,000 at seed 1818) caps how much detail fits.

**Round 23 depth pass (Medium and High, Partially Verified in SwiftShader stills):** lower walls gather moss and grime, cobble seams grow moss and stay damp-dark, window glass is warmer, and distant fog leans blue-violet with a warm band at the horizon. Low keeps the flat look. Stills: `docs/media/r23-*.png`.

## Corruption, districts and landmarks (round 23, original assets)
**Tentacle trees and saplings** are black, drooping trunks with long writhing tendrils that sway like foliage. **Fungi** (tall, cluster, shelf) are pale caps that glow faintly at night. **Organic spires** (horn, ribbed) are bone white rising to dark tips. They are our own meshes from primitives, mood only, no pack data. They appear at Core ruled sites (cliffs, marsh, churchyard edges, the grove) and grow with dread and night (level 0 to 6, scale 0.55 up to 1). Rule: nothing moves toward the player and nothing appears in view; the village changes while you are elsewhere. Stills: `docs/media/round23-grove-growth-{low,mid,high}.png`.

**Districts** give each quarter its own yard dressing and density: Harbour (nets, crates, bollards), Old Town (dense, tight yards), Chapel Hill (graves and stones), Market (stalls, carts), Fishers' Row (nets and boats on the coast band). The HUD chip and minimap tint name them.

**Landmarks** each hold one idea: the Lighthouse Cliffs (wind and distance), the Wreck of the Marguerite (a ship that went nowhere), the Abbey Ruins (arches with no roof), the Cemetery on the church rise (view of the whole village), the Black Marsh (still pools, spires), the Cursed Grove (the first place corruption grows). Lit paths with a lamp every 14 m connect them so the dark is never total on the way. Stills: `docs/media/round23-landmark-*.jpg`.

**Local pack area:** under `?pack=1` on the author's machine only, the Alien Terrain models replace the corruption look-alikes (fitted to the same footprint). The public site keeps the originals.


## Round 24: kit houses and the villager decision

- Houses: `house_a`, `house_b` and `cottage_tall` are assembled from the CC0 Quaternius Medieval Village MegaKit (see `THIRD_PARTY_ASSETS.md`), stone ground floor, jettied plaster upper floor, terracotta roof, same footprint and door as the Blender originals. The triangle budget (60k per frame) decides how much of the kit can be real geometry: about 400 to 660 triangles per house.
- Villager: the walk stays the CPU leg swing (`poseWalker`). Skeletal skinning in the WebGL1 renderer (bone matrices as uniforms, skin weights in the vertex format, a second shader path) was judged not worth it for a 1.7 m figure seen from 5 to 30 m, and no clearly CC0 rigged villager was evaluated. Revisit if a CC0 rigged model with under 600 triangles and under 24 bones is verified.

## Round 24: the living village
- Villagers: the Old Town square was empty at night because every villager stood at their own door. Core `PresenceAt` now sends them to the market, inn and chapel, a lamplighter patrols, and doors fade them in and out. Stills: `docs/media/round24-villagers-dusk.jpg` (the square at dusk, a figure far down the lane; at 1.7 m it is small by design), `round24-hero.jpg` (README hero).
- Walking: trunks are round obstacles (tree 0.35 m, tentacle tree 0.7 m) so the explorer slides around them; the old box was the canopy footprint. Still `round24-tree-walk-around.jpg`, taken after the fix beside the tree at 37.97, 60.00 (seed 1818); there is no before still, the browser check `COLLISION_ONLY` is the evidence. Partially Verified.
- Names and narrative: house, well and landmark names are seeded (en and fr) and shown in door prompts; the chronicle adds families, journals, missing persons, rumors and legends. The tone stays implication over explanation: owners and missing persons are never explained.
- Lighthouse beam, moon, stars and water haze: night only on Medium and High, a static glow on Low. Stills `round24-lighthouse-beam.png`, `round24-sea-*.png`.
- Assets: CC0 Quaternius kit houses (three) lazy loaded over original Blender houses. Rigged villagers from the kit or from itch.io tag pages were not evaluated this round (Unverified); the walking figure is still the original mesh with a CPU leg swing.
- Status: SwiftShader stills only (Partially Verified); real GPU Unverified.
