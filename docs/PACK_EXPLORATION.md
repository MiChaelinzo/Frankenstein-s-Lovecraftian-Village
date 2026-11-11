# Pack exploration script (Unity)

A short on-camera path through the DLNK Lovecraftian Village editions for the right side of the demo video. Status: scene names are **Partially Verified** (read from the git-ignored packages with a pathname listing; no derived data is committed). Everything that happens inside Unity is **Unverified**: Unity cannot be installed in the sandbox because Personal licence activation is tied to the author's Unity account.

## What the editions contain
Listing `Lovecraftian1.3_HDRP_Unity6.unitypackage` and `Lovecraftian1.3_URP_Unity6.unitypackage` (in `Assets/ThirdParty/LovecraftianVillage/downloads/`, git-ignored) shows materials, three scenes, terrain layers (12), lighting settings and 14 prefabs: 13 lamps and candle holders (`LampExterior00`, `LampExterior001`, `LampInterior00`, `LampLighthouse00`, `CandleHolder00` and variants) plus `GameSetup Basic`. Earlier docs call them "14 lamp prefabs"; by name it is 13 lamps and one setup prefab. No house, church or prop meshes, no scripts. **The base pack is needed for meshes.** Reproduce the listing with `python3 tools/inspect_unitypackage.py <package>` (prints suggestions, writes only where you point `--out`; keep the output out of git).

## Scenes found (identical names in both editions)
Under `Assets/_DLNK/Lovecraftian Village/Scenes/` after import:
| Scene | Path | Note |
|-------|------|------|
| Coast scene | `Coast Scene/Coast Scene.unity` | Opened by `Tools > Frankenstein > Open DLNK Demo Scene And Add Showcase Camera` (no name contains "demo", so the helper takes the first scene in ordinal order, which is this one) |
| Assets 1.0 | `Myst Village/Assets 1.0.unity` | Scene named "Assets 1.0" (contents not inspected) |
| Myst Village | `Myst Village/MystVillage.unity` | Ships a `_TerrainAutoUpgrade` folder of terrain layers |

`tools/dlnk_scene.py` parses the same scene files for the local-only web scene mode (`?pack=1&scene=coast-scene`); that stays on the author's machine.

## What to show (about 45 seconds of footage)
1. Project window: `Assets/_DLNK` imported. Open `Tools > Frankenstein > DLNK Pack Explorer` and let it rescan.
2. `Tools > Frankenstein > Open DLNK Demo Scene And Add Showcase Camera` opens Coast Scene and adds `Frankenstein Showcase Camera` with `VillageFlythroughCamera`. Disable other cameras and AudioListeners (the console line says so), press Play.
3. Open `Myst Village/MystVillage.unity` and `Assets 1.0.unity` by double click. The menu in step 2 always opens Coast Scene, so for these two add the camera by hand: create an empty GameObject with a Camera and the `VillageFlythroughCamera` component.
4. Select a lamp prefab, show its materials. Run `Tools > Frankenstein > Auto-bind Catalog Prefabs` and read the `[Frankenstein]` log: expect lamps to bind and the rest to stay on block fallbacks.
5. `Tools > Frankenstein > Copy Matching Web Demo URL`, paste into the browser next to it.

## HDRP vs URP
| | HDRP edition | URP edition |
|---|---|---|
| Package size | about 1.8 GB | about 100 MB |
| Material textures | included | not included (materials only, plus lightmaps and probes) |
| Look | expected: HDRP lighting and fog | expected: lighter, flatter without textures |
| Frankenstein package | works, depends on Core render pipeline package only | same, so URP projects can install it |

The size and texture-content rows were read from the package files; the "Look" row is an expectation, not an observation, and stays Unverified until you record it. Use the HDRP project for the main take and the URP project for the 2:26 A/B shot.

## Honest limits
- Scene names and lamp counts: from a pathname listing, not from opening Unity.
- Menus, scenes loading, camera path, recorder output: never run in Unity.
- Do not show pack content that your licence does not allow you to publish.
