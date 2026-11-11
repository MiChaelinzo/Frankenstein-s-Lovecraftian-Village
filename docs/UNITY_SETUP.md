# Unity setup: play the village in Unity 6

Status: the package scripts are **compile checked** against original stubs (`dotnet build tests/UnityCompileCheck`, Partially Verified: syntax and types only). Nothing here has been run in the Unity editor, so everything that needs Unity is **Unverified**. The Core rules the scripts call are Verified by `dotnet test tests/Frankenstein.Core.Tests`.

The package is `com.michaelinzo.frankenstein-village` (folder `Packages/com.michaelinzo.frankenstein-village`). It contains logic, glue and an editor scene builder. It contains **no third-party pack assets**. Without the DLNK pack you get a walkable village of plain blocks; with the pack imported the builder uses the pack prefabs where names match.

## 1. Install the package

Unity 6 (6000.0 or newer), HDRP or URP project.

**Package Manager, git URL** (Window > Package Manager > + > Add package from git URL):

```
https://github.com/MiChaelinzo/Frankenstein-s-Lovecraftian-Village.git?path=/Packages/com.michaelinzo.frankenstein-village
```

**Or copy the folder**: copy `Packages/com.michaelinzo.frankenstein-village` into your project's `Packages/` folder (an embedded package), or clone this repo and open it as the Unity project.

Dependencies are resolved by Unity from `package.json`: `com.unity.render-pipelines.core`, `com.unity.inputsystem` and `com.unity.ugui`. The package depends on the pipeline-neutral core package on purpose, so it installs in both HDRP and URP projects. The repo's own `Packages/manifest.json` targets HDRP.

Input System: Unity asks to enable the new Input System backend after install. Accept (editor restart) or set Project Settings > Player > Active Input Handling to "Input System Package (New)" or "Both".

The package ships `.meta` files (`tools/gen_package_meta.py`, GUIDs derived from paths) because Unity ignores files without a `.meta` in read-only packages. Unity never generated them here, so that is Unverified too.

## 2. Optional: import the DLNK pack you own

The pack is by DLNK Artworks and is not in this repo. Get it from the links in the README and import it locally.

| Your pipeline | Import | Notes |
|---------------|--------|-------|
| HDRP | `Lovecraftian1.3 HDRP(Unity6).unitypackage` | Assets > Import Package > Custom Package. |
| URP | `Lovecraftian1.3 URP(Unity6).unitypackage` | Use a URP project, or replace the HDRP package in your manifest with `com.unity.render-pipelines.universal`. |

Do not mix pipelines: wrong-pipeline materials render pink. Keep the default `Assets/Lovecraftian Village*` location (git-ignored here).

**What the downloaded editions actually contain** (checked by listing the packages with `tools/inspect_unitypackage.py`): materials, scenes, terrain layers and 14 lamp prefabs. The house, church and prop meshes are **not** in the HDRP and URP editions. For real houses you need the base pack that includes the meshes. With only the editions, the auto-binder can bind the lamps and most catalog ids stay on the block fallback.

## 3. Build the playable scene

1. Menu **Tools > Frankenstein > Create Playable Village Scene**.
2. It creates `Assets/Frankenstein/` (catalog asset, volume profiles, `PlayableVillage.unity`), binds pack prefabs if `Assets/Lovecraftian Village` exists, and builds the village with seed 1818 and 80 pieces like the web demo.
3. Press Play.

Controls: **WASD** walk, **mouse** look, **E** use what is under the crosshair (reach 3 m, 0.75 s cooldown, both from Core `InteractionRules`), **V** cycle first person, third person, top down. At Abyss dread the top-down view is taken away (Core `DreadBuildingPolicy.AllowedCamera`). **Esc** frees the cursor, click recaptures it.

What happens on use: houses try their door through `DlnkDoorOmenBridge` (Core `DoorOmen`: creak, slam, refuse as dread rises), props whisper and landmarks are studied through `HorrorAmbienceDirector.Describe` and cost sanity (`SanityModel` costs), the candle at the start restores sanity. A quiet corner readout shows sanity and dread tier; there are no flashes or jump scares.

The scene contains: `VillageBuilder`, `HorrorAmbienceDirector`, `DreadVolumeBlender` with calm and dread global Volumes, `WalkthroughController`, `RitualDirector`, the player (`FirstPersonExplorer`, `InteractionRaycaster`, `DlnkCameraModeBridge`) and `DreadHud`.

### Fog and look

The builder adds HDRP Fog and Vignette overrides to the two Volume profiles by reflection (so URP projects still compile). If an override or field is missing in your HDRP version it logs a warning and leaves the profile for you to edit. Directional light intensity is set to 2 (HDRP uses lux): raise it, add a sky and tune the Fog to taste. Getting close to the foggy dusk of the DLNK trailer is manual work in the Volume profiles and with the pack's own scenes; this repo does not reproduce that footage or those assets.

## 4. Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `Input System` errors or no movement | Active Input Handling still "Input Manager (Old)". |
| Everything is blocks | Pack not imported at `Assets/Lovecraftian Village`, or only the HDRP/URP edition (no house meshes). Run Tools > Frankenstein > Auto-bind Catalog Prefabs on `Assets/Frankenstein/VillageCatalog.asset` after importing. |
| Pink materials | Pack edition does not match the render pipeline. |
| Scene too dark | Raise the Dusk Light intensity or the HDRP exposure. |
| Pack prefabs cannot be used (no collider) | The builder adds `MeshCollider`s to prefab meshes; large meshes may need convex off, which is the default. |

Unity MCP prompts for each step are in [MCP.md](MCP.md). Report anything that fails in Unity as an issue: it is the first real run of this code.
