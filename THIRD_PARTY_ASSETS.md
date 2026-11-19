# Third party assets

Every file under `web/assets/third_party/` is listed here. `python3 tools/validate_repo.py` fails if a file there has no row in the table, if a row's licence is not `CC0 1.0`, if a listed file is missing, if a file is over 5 MB or if the folder is over 40 MB in total.

Only CC0 sources are accepted: Poly Haven, ambientCG, Kenney and Quaternius. Assets with unclear, non-commercial, no-redistribution or share-alike terms are never added. The DLNK Artworks pack is never committed (see README).

The textures and the barrel and bench come from [Poly Haven](https://polyhaven.com). Their [licence page](https://polyhaven.com/license) states that every asset (HDRIs, textures and 3D models) is CC0, which allows redistribution, including in this open source repository and on the public demo site. Attribution is not required; it is given here anyway. Fetched on 2026-11 via `api.polyhaven.com` by `tools/fetch_third_party.py`, which reproduces the files (needs network and Pillow).

Changes from the originals: textures are the 1K diffuse JPEG resized to 512 px and scaled to a mean brightness of 0.6 (the 3D shader's convention). Models are repacked from the 1K glTF into one GLB with positions, normals, uv and the base colour texture at 512 px; normal and ARM (occlusion, roughness, metal) maps are dropped.

| Name | Source | Author | Licence | Files | Used for |
|---|---|---|---|---|---|
| Old Stone Wall | [polyhaven.com/a/old_stone_wall](https://polyhaven.com/a/old_stone_wall) | Charlotte Baglioni | CC0 1.0 | `web/assets/third_party/textures/stone.jpg` | 3D view: grey masonry (church, well, walls) instead of the procedural stone |
| Roof Slates 02 | [polyhaven.com/a/roof_slates_02](https://polyhaven.com/a/roof_slates_02) | Rob Tuytel | CC0 1.0 | `web/assets/third_party/textures/roof.jpg` | 3D view: roof slopes instead of the procedural slate |
| Cobblestone Floor 04 | [polyhaven.com/a/cobblestone_floor_04](https://polyhaven.com/a/cobblestone_floor_04) | Rob Tuytel | CC0 1.0 | `web/assets/third_party/textures/cobble.jpg` | 3D view: lanes, square and coast road instead of the procedural cobbles |
| Brown Mud Leaves 01 | [polyhaven.com/a/brown_mud_leaves_01](https://polyhaven.com/a/brown_mud_leaves_01) | Rob Tuytel | CC0 1.0 | `web/assets/third_party/textures/ground.jpg` | 3D view: open ground instead of the procedural mud (a ?pack=1 ground texture still wins) |
| Barrel 03 | [polyhaven.com/a/barrel_03](https://polyhaven.com/a/barrel_03) | Serhii Khromov | CC0 1.0 | `web/assets/third_party/models/barrel.glb` | 3D view: the `barrel` dressing prop, fitted into the original mesh's box |
| Painted Wooden Bench | [polyhaven.com/a/painted_wooden_bench](https://polyhaven.com/a/painted_wooden_bench) | Kirill Sannikov | CC0 1.0 | `web/assets/third_party/models/bench.glb` | 3D view: the `bench` dressing prop on the square, fitted into the original mesh's box |
| Medieval Village MegaKit (Standard) | [quaternius.itch.io/medieval-village-megakit](https://quaternius.itch.io/medieval-village-megakit) | Quaternius | CC0 1.0 | `web/assets/third_party/models/house_a.glb` | 3D view: the `house_a` jettied timber house over a stone ground floor (door panel, stoop stairs, trim textures from the kit) |
| Medieval Village MegaKit (Standard) | [quaternius.itch.io/medieval-village-megakit](https://quaternius.itch.io/medieval-village-megakit) | Quaternius | CC0 1.0 | `web/assets/third_party/models/house_b.glb` | 3D view: the long `house_b` with the kit's round window wall panel, door panel, stoop stairs, dormers and two chimneys |
| Medieval Village MegaKit (Standard) | [quaternius.itch.io/medieval-village-megakit](https://quaternius.itch.io/medieval-village-megakit) | Quaternius | CC0 1.0 | `web/assets/third_party/models/cottage_tall.glb` | 3D view: the `cottage_tall` stone cottage with a jettied upper floor and the kit's door panel |

Quaternius pieces: the Standard (free) download of the pack contains `License_Standard.txt`, which reads "License: CC0 1.0 Universal (CC0 1.0) Public Domain Dedication", and the itch.io page says CC0 as well. Fetched 2026-11-19. Changes: `tools/build_quaternius_models.py` (needs the zip, Pillow) assembles each house from the kit's own meshes (`Wall_UnevenBrick_Door_Round` and `Stairs_Exterior_Platform`, plus `Wall_Plaster_Window_Wide_Round` in `house_b`) and from flat quads, boxes and gabled roof tiles textured with the kit's trim textures (plaster, wood trim, round tiles, uneven brick, rock trim and brick, packed into one 510 px JPEG mosaic, each scaled to a mean brightness of 0.55). Normal, roughness and ORM maps are dropped. Window glass becomes a flat emissive quad so the village's night windows still glow. Each house is stretched to the exact bounding box of the original Blender house, so footprint, door position, collision and floor heights do not change. The kit's own roofs (3800 triangles each) are not used: they would break the 3D triangle budget.

## How they load

- Only the first person 3D view (`?view=3d`) uses them, lazily, after the original Blender meshes have loaded. `#thirdparty=0` (or `?thirdparty=0`) turns them off.
- Same origin only, so the Content-Security-Policy stays `'self'`. Images are decoded with `createImageBitmap` from bytes, without object URLs.
- `web/sw.js` never precaches them (checked by the validator and `web/test/third-party.test.js`); they are fetched from the network like any other uncached file.
- If a file fails to load or decode, the console shows a `[third-party]` warning and the original procedural texture or Blender mesh stays. The originals under `web/assets/meshes/` and `web/src/proc-textures.js` are never removed.
- Timber framed walls stay procedural: the photo plasters have no oak frame. A wooden crate (Poly Haven wooden_crate_02, 5176 triangles) was tried and left out because two of them broke the 3D triangle budget.
