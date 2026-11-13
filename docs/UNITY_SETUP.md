# Unity setup: play the village in Unity 6

Status: the package scripts are **compile checked** against original stubs (`dotnet build tests/UnityCompileCheck`, Partially Verified: syntax and types only). Nothing here has been run in the Unity editor, so everything that needs Unity is **Unverified**. The Core rules the scripts call are Verified by `dotnet test tests/Frankenstein.Core.Tests`.

The package is `com.michaelinzo.frankenstein-village` (folder `Packages/com.michaelinzo.frankenstein-village`). It contains logic, glue and an editor scene builder. It contains **no third-party pack assets**. Without the DLNK pack you get a walkable village of plain blocks; with the pack imported the builder uses the pack prefabs where names match.


> **Why nothing here ran in Unity.** Unity cannot be installed or run in the Kiro Web sandbox: Unity Personal licence activation is tied to the author's Unity account, and no one else's credentials are requested or used. So all Unity code is **Partially Verified** (compile checked against original stubs in `tests/UnityCompileCheck`) and **Unverified** at runtime. For the video, see [DEMO_SCRIPT.md](DEMO_SCRIPT.md), [RECORDING.md](RECORDING.md) and [PACK_EXPLORATION.md](PACK_EXPLORATION.md).

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

**What the downloaded editions actually contain** (checked by listing the packages with `tools/inspect_unitypackage.py`): materials, scenes, terrain layers and 14 prefabs (13 lamps and candle holders plus `GameSetup Basic`; see [PACK_EXPLORATION.md](PACK_EXPLORATION.md)). The house, church and prop meshes are **not** in the HDRP and URP editions. For real houses you need the base pack that includes the meshes. With only the editions, the auto-binder can bind the lamps and most catalog ids stay on the block fallback.

## 3. Build the playable scene

1. Menu **Tools > Frankenstein > Create Playable Village Scene**.
2. It creates `Assets/Frankenstein/` (catalog asset, volume profiles, `PlayableVillage.unity`), binds pack prefabs if `Assets/Lovecraftian Village` exists, and builds the village with seed 1818 and 80 pieces like the web demo.
3. Press Play.

Controls: **WASD** walk, **mouse** look, **E** use what is under the crosshair (reach 3 m, 0.75 s cooldown, both from Core `InteractionRules`), **V** cycle first person, third person, top down. At Abyss dread the top-down view is taken away (Core `DreadBuildingPolicy.AllowedCamera`). **Esc** frees the cursor, click recaptures it.

What happens on use: houses try their door through `DlnkDoorOmenBridge` (Core `DoorOmen`: creak, slam, refuse as dread rises), props whisper and landmarks are studied through `HorrorAmbienceDirector.Describe` and cost sanity (`SanityModel` costs), the candle at the start restores sanity. The candle is deliberately repeatable (limited only by the interaction cooldown), matching the 2D web view; prompts come from Core `PromptStrings` (English and French, wording identical to the `view3d.prompt.*` keys in `web/src/i18n.js`, drift fails a C# test); set `language` on `InteractionRaycaster` to `fr` to switch. A quiet corner readout shows sanity and dread tier; there are no flashes or jump scares.

### The vigil in Unity (compile checked, runtime Unverified)

The generated scene also contains `VigilDirector`. With `startOnPlay` on (default) it starts Core's vigil as soon as the village ritual is ready, applies the Core night creep (`VigilRules.NightCreep`), and shows an objective line under the sanity readout (night, clues, lanterns lit, the masked name, from `VigilStrings.Objective`). Only whisper and landmark targets count as clues (`VigilRules.CountsAsClue`); doors do not, candles light lanterns (three per night, `VigilRules.LampsPerNight`; the sanity gain is the usual `InteractionRules` candle restore). **Endure the night** is offered only when Core says the clue target is met (`VigilState.CanEndureNight`): press **E** with nothing under the crosshair, or click the quiet button at the bottom (the scene builder adds an EventSystem with the Input System UI module if none exists). A finished vigil shows a small ending panel (title, epitaph, the masked name, score and rank, statistics, result code) and raises `VigilDirector.Finished`. Wording is Core `VigilStrings` (English and French, identical to the `vigil.*` keys of `web/src/i18n.js`; drift fails a C# test); set `language` on `VigilDirector` to `fr`. Toggle: untick `startOnPlay` for free exploration with no vigil.

While the vigil is locked (Core `VigilState.IsLocked`: `VigilDirector` calls `Begin` when it starts the vigil, since Unity has no sandbox to tweak first; a candle restores sanity only when `VigilState.CanLightLantern` allows it, through `InteractionRaycaster.SanityGate`; a new ritual seed drops the vigil and the director starts a new one) the sandbox is locked: `WalkthroughController.NextNight` and `PreviousNight` (the `.` and `,` keys) are refused with the localized reason, following Core `VigilRules.AllowsSandboxAction`. Unity has no other sanity, seed or village cheats; the drain rate field is an inspector setting, not a play control. Free exploration (no vigil) is unchanged.

The scene also has a `DayNightDirector` (on the Dread Director) that owns the village clock: one real second is one village minute, starting at Core `GameClock.SessionStartTick` (dusk). It lerps the sun light colour, intensity and elevation, `RenderSettings` ambient and fog between a night look and an overcast day look by Core `GameClock.DaylightPercent` (HDRP ignores `RenderSettings` fog; keep the Volume fog, or untick `driveFog`). With `VigilDirector.clock` set, the vigil keeps watch at dusk and night: **E** by day waits for dusk, **E** during the watch runs the clock to dawn, and dawn judges the night (Core `VigilRules`, `ProgressionSession.ResolveVigilDawn`); without a clock Endure ends the night at once as before. The scene builder also spawns the seven villagers of the Core roster under `Villagers`: each is the original generated `villager` mesh (1.7 m, `WorldScale.PersonHeight`, unscaled; a capsule of the same height if the mesh was not generated) with a capsule collider, a carried point light switched by `VillagerRules.CarriesLitLantern`, and a `VillagerAgent` that walks to the Core stand point for the hour and dread and hides when Core says the villager is gone. Look at a villager and press **E** to talk (Core `VillagerRules.Talk`; the clue goes to the vigil, the sanity change to the director, the line from `VillagerStrings`). All of this is compile checked only: Unverified in Unity.

The scene contains: `VillageBuilder`, `HorrorAmbienceDirector`, `DreadVolumeBlender` with calm and dread global Volumes, `WalkthroughController`, `RitualDirector`, `ProgressionTracker` (codex, achievements, opt-in `useDailySeed`; unlocked ids kept in PlayerPrefs, event `Unlocked`), the player (`FirstPersonExplorer`, `InteractionRaycaster`, `DlnkCameraModeBridge`) and `DreadHud` (with the objective line, Endure button and ending panel), plus `VigilDirector`.

### Fog and look

The builder adds HDRP Fog and Vignette overrides to the two Volume profiles by reflection (so URP projects still compile). If an override or field is missing in your HDRP version it logs a warning and leaves the profile for you to edit. Directional light intensity is set to 2 (HDRP uses lux): raise it, add a sky and tune the Fog to taste. Getting close to the foggy dusk of the DLNK trailer is manual work in the Volume profiles and with the pack's own scenes; this repo does not reproduce that footage or those assets.

### Original meshes, no pack and no glTFast (compile checked, runtime Unverified)
`Tools > Frankenstein > Generate Original Village Assets` (also run by Create Playable Village Scene) writes meshes, materials and one prefab per village shape into `Assets/FrankensteinVillage/Generated` in your project, never into the package. The geometry comes from `Data/village_shapes.json`, the same file read by `tools/blender/mesh_defs.py` and `web/src/shapes.js`, through the engine-free Core class `ShapeLibrary`. The scene builder binds these prefabs only to catalog entries that no pack prefab covers, so a pack you own always wins. Materials use the active pipeline's lit shader (HDRP Lit or URP Lit, then Standard); glow and rune slots are emissive.

Decision: glTFast is not used. It would add a package dependency and a loader that cannot run in the sandbox, while one shape file plus a small Core builder gives the same look in Blender, the web demo and Unity with no new dependency. A golden check (`golden.json` key `shapes`) compares the C# and JS builders per mesh. Status: shape math Verified (dotnet and node); Unity asset creation Unverified (never run in Unity, compile check only).

## 3b. Showcase tools (record Unity next to the web demo)

Status for all four tools: **Partially Verified** (compile checked against stubs) and **Unverified at runtime** (never run in Unity). The path and link maths they call are **Verified** in Core (`FlythroughPath`, `WebShareLink`, `PrefabNameMatcher`; golden parity with `web/src/cinematic.js` and `web/src/session.js`). The scripts hold no path, link or matching logic of their own.

**Showcase camera (`VillageFlythroughCamera`)**
1. Add a GameObject with a Camera, then add the `VillageFlythroughCamera` component (or use the helper below).
2. Either assign `villageBuilder` (seed, grid size and cell size are read from it) or set `seed`, `gridWidth`, `gridDepth` and `cellSize` by hand. The defaults match the web demo (seed 1818, 24x24, `cellSize` = Core `FlythroughPath.DefaultCell` 4). `VillageBuilder.cellSize` defaults to 6 and wins when a builder is assigned; camera height (4.6 m) and look-at height (1.6 m) do not scale with it, so set the builder to 4 as well for the same shot as the web. Unverified in Unity.
3. Edit `beatDurationsMs` (milliseconds, same meaning as the web story beats). Core adds a 2 second tail. The default is five 6000 ms beats; the web uses `beatDurationMs(text length)` per beat, so copy those values for matching pacing.

**Web-only exception: omen framing.** At Dire and Abyss the web fly-through blends toward `omenFraming` so the sea tentacles and the eye are in frame. This is web presentation over the unchanged Core path (`FlythroughPath`). Unity renders no tentacles or eye, so the Unity camera never frames omens and has nothing to frame. Do not port it to Core unless Unity gains those visuals.
4. Press Play. Elapsed time advances by `Time.deltaTime` only, so for a repeatable take open Window > General > Recorder, choose a fixed frame rate (for example 30) and record. Tick `reducedMotion` for one still viewpoint, `loop` to repeat.

**Copy Matching Web Demo URL**
1. Open your scene (with a `VillageBuilder` or a `VillageFlythroughCamera`).
2. Menu **Tools > Frankenstein > Copy Matching Web Demo URL**.
3. Paste. The link carries the scene seed, sanity 100, `view=3d`, and `cinematic=1` when a showcase camera exists. Open it next to Unity for the side-by-side take. It never carries `?pack`.

**DLNK Pack Explorer**
1. Import the pack you own so prefabs sit under `Assets/_DLNK` (git-ignored).
2. Menu **Tools > Frankenstein > DLNK Pack Explorer**, press **Rescan**.
3. Prefabs are grouped House, Landmark, Prop or Other by the catalog id their name best matches (`PrefabNameMatcher`). Type in **Search** to filter. **Ping** selects the prefab in the Project window. **Place** instantiates it at the Scene view pivot (undoable) and frames it.

**Open DLNK Demo Scene And Add Showcase Camera**
1. Import the pack under `Assets/_DLNK`.
2. Menu **Tools > Frankenstein > Open DLNK Demo Scene And Add Showcase Camera**. It asks to save the current scene, opens the first scene under `Assets/_DLNK` whose name contains "demo" (otherwise the first by path), and adds a `Frankenstein Showcase Camera`.
3. Disable the scene's other cameras and AudioListeners, adjust the camera fields, press Play.

## 4. Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `Input System` errors or no movement | Active Input Handling still "Input Manager (Old)". |
| Everything is blocks | Pack not imported at `Assets/Lovecraftian Village`, or only the HDRP/URP edition (no house meshes). Run Tools > Frankenstein > Auto-bind Catalog Prefabs on `Assets/Frankenstein/VillageCatalog.asset` after importing. |
| Pink materials | Pack edition does not match the render pipeline. |
| Scene too dark | Raise the Dusk Light intensity or the HDRP exposure. |
| Pack prefabs cannot be used (no collider) | The builder adds `MeshCollider`s to prefab meshes; large meshes may need convex off, which is the default. |

Unity MCP prompts for each step are in [MCP.md](MCP.md). Report anything that fails in Unity as an issue: it is the first real run of this code.
