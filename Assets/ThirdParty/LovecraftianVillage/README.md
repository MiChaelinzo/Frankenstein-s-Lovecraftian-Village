# Lovecraftian Village 1.3 HDRP / URP (not included)

This folder is a placeholder. The third-party **Lovecraftian Village 1.3** pack (DLNK Artworks) is NOT part of this repository and must never be committed. It exists in two Unity 6 editions: HDRP and URP.

To use it locally:

1. Get the edition that matches your render pipeline: the download links in the root [README](../../../README.md), or your licensed copy in the Unity Asset Store ("My Assets").
2. Import it. From the Asset Store: `Window > Package Manager > My Assets`, then `Download` and `Import`. From a file: `Assets > Import Package > Custom Package...` with `Lovecraftian1.3 HDRP(Unity6).unitypackage` or `Lovecraftian1.3 URP(Unity6).unitypackage`.
3. Use the HDRP edition in an HDRP project (the scaffold default) and the URP edition in a URP project. Do not mix them.
4. The packages import into `Assets/_DLNK/` (also `Assets/Lovecraftian Village*` for older copies). Both locations are gitignored.
5. Each entry in `Assets/Data/village_catalog.json` has a `prefabHint` (a prefab name only). The auto-binder prefers the hint, then falls back to name scoring. Hints: `house_a` BigHouse00, `house_b` CoastalHouse00, `dead_tree` _Sp_TrunkDead00, and the stand-ins `church` Pinnacle00c, `well` WoodBucket00, `altar` PillarStone00a (the pack has no church, well or altar prefab; replace these with your own choice).

Note: the URP and HDRP packages contain no meshes and only 14 lamp and candle prefabs. The building prefabs their scenes reference come from the base pack, so the hints resolve only if that base pack is also imported. The binder is unverified in Unity.

Local tooling output also lives here and is ignored: `downloads/` and `pack_inventory_urp.json` / `pack_inventory_hdrp.json` (see `tools/fetch_pack.py` and `tools/inspect_unitypackage.py`). `web/local-pack/` is the separate ignored output of `tools/build_local_pack.py`.

Anything in this directory except this README is ignored by git.
