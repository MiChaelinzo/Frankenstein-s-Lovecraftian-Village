# Lovecraftian Village 1.3 HDRP / URP (not included)

This folder is a placeholder. The third-party **Lovecraftian Village 1.3** pack (DLNK Artworks) is NOT part of this repository and must never be committed. It exists in two Unity 6 editions: HDRP and URP.

To use it locally:

1. Get the edition that matches your render pipeline: the download links in the root [README](../../../README.md), or your licensed copy in the Unity Asset Store ("My Assets").
2. Import it. From the Asset Store: `Window > Package Manager > My Assets`, then `Download` and `Import`. From a file: `Assets > Import Package > Custom Package...` with `Lovecraftian1.3 HDRP(Unity6).unitypackage` or `Lovecraftian1.3 URP(Unity6).unitypackage`.
3. Use the HDRP edition in an HDRP project (the scaffold default) and the URP edition in a URP project. Do not mix them.
4. Import to the default location (`Assets/Lovecraftian Village*`). Those folders are gitignored.
5. Open `Assets/Data/village_catalog.json` and map each catalog id to the prefab name you own.

Anything in this directory except this README is ignored by git.
