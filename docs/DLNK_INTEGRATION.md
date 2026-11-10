# DLNK Myst Village integration

This project can drive the scripts of the [DLNK Myst Village](https://www.dlnkworks.com/asset-store/environments/myst-village/) environment pack by [DLNK Works](https://www.dlnkworks.com/). All credit for the pack and its scripts belongs to DLNK. Nothing from the pack is included in this repository.

## Unverified in Unity

The adapter MonoBehaviours under `Assets/Scripts/Runtime` were **never compiled or run in Unity**. The decisions they forward come from `DreadBuildingPolicy` in Core, which is covered by C# property tests, JS tests and C#-to-JS golden parity. The real class names and public methods of the DLNK scripts are **unknown** to this project: the downloaded URP and HDRP editions contain no scripts and no meshes, so there was nothing to read. That is why the adapters use UnityEvents and an interface, with no compile-time dependency on any DLNK type and no reflection.

## Confirmed vs guessed

| Item | Status | Source |
| --- | --- | --- |
| The pack ships a Scene Control script (player, hotkeys, UI, cameras) | Confirmed | Product page |
| Town Manager manages all buildings and sets detail levels locally or globally | Confirmed | Product page |
| Building Control handles the floor divisions of a building, used with a top-down camera to show the active floor | Confirmed | Product page |
| Building Trigger handles floor to floor triggers | Confirmed | Product page |
| Push Trigger moves or rotates an object from a trigger plus hotkey, used for doors | Confirmed | Product page |
| Class names, namespaces, method names and field names of those scripts | Guessed (unknown) | Not in the URP/HDRP downloads |
| That detail levels are integers 0 to 3 | Guessed | Our own convention; map it in the inspector |
| That each script exposes a public method callable from a UnityEvent | Guessed | Typical for Unity, unchecked |
| That the Unity 6 HDRP 1.3 edition has the same scripts as the product page describes | Guessed | The page text was used, the package has no scripts |

The older Shader Forge and Standard Assets era mentioned in some pack materials is not relevant to the Unity 6 HDRP 1.3 edition used here.

## The adapters

| Component | Decides | Inspector hooks |
| --- | --- | --- |
| `DlnkTownManagerBridge` | Per-building detail level 0 to 3 from dread, building id and seed | `onGlobalDetailChanged(int)`, `onBuildingDetailChanged(string, int)`, per-entry `onDetailChanged(int)` |
| `DlnkBuildingFloorBridge` | Which floors show; top-down peel shows floors up to the active one | `onActiveFloorChanged(int)`, `onFloorVisibility(int, bool)`; call `SetActiveFloor(int)` and `SetTopDown(bool)` |
| `DlnkDoorOmenBridge` | Normal, Creak, Slam or Refuse per attempt, deterministic by seed | `onAllowOpen`, `onCreak`, `onSlam`, `onRefuse`; call `TryOpen(float dread)` |
| `DlnkCameraModeBridge` | Suggested and allowed camera mode (top-down is removed at Abyss) | `onModeChanged(int)` (0 first person, 1 third person, 2 top-down), `onTopDownChanged(bool)` |

`IBuildingDetailTarget` is an optional interface: if you write a tiny component that calls the pack's own methods, assign it to a bridge instead of using UnityEvents.

## Wiring it

1. Add `DlnkTownManagerBridge` to an empty object. Drive `Apply(float)` with `SanityModel.Dread` (for example from a script that already holds the `HorrorAmbienceDirector`).
2. In `onGlobalDetailChanged`, add the Town Manager object and pick its detail level setter, if one with an int parameter exists. For per-building control, use `onBuildingDetailChanged` or per-entry events with the building's own component.
3. On each building add `DlnkBuildingFloorBridge`. Set `floorCount`. Point `onFloorVisibility` at the method Building Control uses to show or hide a floor (it needs an int and a bool; if the pack's method differs, write a small `IBuildingDetailTarget`). Call `SetActiveFloor` from the Building Trigger event.
4. On each door add `DlnkDoorOmenBridge`. Replace the direct hotkey to the Push Trigger with a call to `TryOpen(dread)`, and wire `onAllowOpen` to the Push Trigger. Wire `onRefuse` and `onSlam` to sounds.
5. Add `DlnkCameraModeBridge`. Wire `onTopDownChanged` to `DlnkBuildingFloorBridge.SetTopDown` and `onModeChanged` to the Scene Control camera switch. Call `OnDread` as dread changes.

If a pack method signature does not match a UnityEvent (for example it takes no argument or a float), use a one line wrapper component. Report any mismatch you find so this table can move rows from guessed to confirmed.

## Web demo

The web demo uses the same decisions through `web/src/core.js` (`detailLevel`, `floorVisible`, `doorOmen`, `suggestedCamera`, `allowedCamera`), verified against the C# output.
