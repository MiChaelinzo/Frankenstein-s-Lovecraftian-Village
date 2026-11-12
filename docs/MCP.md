# MCP preparation (Unity and Blender)

**Status: not run.** The Unity MCP and Blender MCP servers were not available in the sandbox where this repo was built. No MCP tool was used for any file in this repo, and nothing here was exercised through MCP. This page only prepares prompts you can paste into a Kiro session that has those servers connected on your own machine. Treat every result as unverified until you confirm it in the Unity editor or Blender.

Server names and tool names differ between MCP implementations. Use whichever Unity MCP and Blender MCP servers you installed, and let the agent list its tools first.

## Config format

Kiro reads MCP servers from `.kiro/settings/mcp.json` (workspace) or `~/.kiro/settings/mcp.json` (user), per the [Kiro MCP configuration docs](https://kiro.dev/docs/mcp/configuration/). Shape (placeholders only, no secrets; replace the commands with the ones from your chosen server's README):

```json
{
  "mcpServers": {
    "unity": {
      "command": "<command from your Unity MCP server README>",
      "args": ["<args>"],
      "disabled": false
    },
    "blender": {
      "command": "<command from your Blender MCP server README>",
      "args": ["<args>"],
      "disabled": false
    }
  }
}
```

This repo deliberately does not ship a live `mcp.json`, so nothing tries to launch a placeholder command. Create it locally.

## Unity prompts

Prerequisite: open the project in Unity 6 and import the pack you own. The local copies live under `Assets/ThirdParty/LovecraftianVillage/downloads/` (git-ignored). Never commit pack files.

1. Import the pack:
   `Import every .unitypackage in Assets/ThirdParty/LovecraftianVillage/downloads/ (HDRP package for HDRP, URP package for URP) with Assets > Import Package. Report the console output afterwards.`
2. Auto-bind the catalog:
   `Create a VillageCatalogAsset from Packages/com.michaelinzo.frankenstein-village/Data/village_catalog.json if none exists, select it, then run the menu item Tools > Frankenstein > Auto-bind Catalog Prefabs and read the console. List which catalog ids were bound and which were not.`
2b. Play a vigil (after step 3 below or with the generated scene):
   `Run Tools > Frankenstein > Create Playable Village Scene, enter Play mode, and report whether VigilDirector started a vigil (objective line under the sanity readout), then use the console to confirm no errors. Press E with nothing under the crosshair once the clue target is met and report the next night's objective line.`
3. Build the demo scene:
   `Create a new scene, add an empty GameObject with VillageBuilder and HorrorAmbienceDirector, assign the catalog asset, and click Build Village from the component context menu.`
4. Match the web demo:
   `Set VillageBuilder pieceCount to 80 (the default is 40) and keep the seed at 1818, then rebuild.`
5. Compile check inside Unity:
   `Trigger a script compile, wait for it to finish, and report every compiler error and warning from the console for Packages/com.michaelinzo.frankenstein-village.` Fix real errors in the scripts, not in `tests/UnityCompileCheck/Stubs`.
6. Install the package and build the playable scene (Unverified, never run):
   `Add the git package https://github.com/MiChaelinzo/Frankenstein-s-Lovecraftian-Village.git?path=/Packages/com.michaelinzo.frankenstein-village, wait for the compile, run Tools > Frankenstein > Create Playable Village Scene, enter Play mode for ten seconds, then report console errors and warnings and whether the player can walk and press E on a house.`
7. Read the console:
   `Read the Unity console and summarize errors, warnings, and the Auto-bind log lines that start with [Frankenstein].`
8. Showcase take (matches [DEMO_SCRIPT.md](DEMO_SCRIPT.md), Unverified, never run):
   `With the DLNK pack imported under Assets/_DLNK, run Tools > Frankenstein > Open DLNK Demo Scene And Add Showcase Camera, then report which scene opened and the console lines that start with [Frankenstein]. Disable every other Camera and AudioListener, set VillageFlythroughCamera seed to 1818, enter Play mode and report TotalSeconds.`
9. Matching web link:
   `Run Tools > Frankenstein > Copy Matching Web Demo URL and return the logged URL. It should start with https://frankensteinlovecraftianvillage.vercel.app/#seed=1818&sanity=100.`
10. Playable walk for the side-by-side:
   `Create a new scene, run Tools > Frankenstein > Create Playable Village Scene, set VillageBuilder pieceCount to 80 and seed 1818, press Play for ten seconds and report console errors and whether FirstPersonExplorer moves with WASD.`
11. Pack exploration (see [PACK_EXPLORATION.md](PACK_EXPLORATION.md)):
   `Open Tools > Frankenstein > DLNK Pack Explorer, rescan, and list the scenes found under Assets/_DLNK. Then open Coast Scene.unity, MystVillage.unity and Assets 1.0.unity in turn and report any pink materials (wrong render pipeline).`
12. Unity Recorder (optional, `com.unity.recorder` is not a repo dependency):
   `Install com.unity.recorder, add a Movie recorder on the Game View at 1920x1080, constant 30 fps, and record one full VillageFlythroughCamera take to Recordings/ outside Assets/ThirdParty.`

## Blender prompts

The headless Blender pipeline lives in `tools/blender/` (see [docs/BLENDER.md](BLENDER.md)). It produces original meshes only, and it was run with a plain headless Blender, not through MCP.

1. `Open a new scene in Blender, delete the default cube, and build a simple low-poly gabled house from primitives (original geometry, no imported pack assets).`
2. `Export the selection as FBX with Y up and apply transforms, to a folder outside Assets/ThirdParty.`
3. `Run tools/blender/gen_meshes.py in background mode with --out pack-scratch/blender-out and report its stdout.` Then, for sprites, `tools/blender/render_sprites.py`.

Never feed pack meshes or textures into Blender sessions that produce files you intend to commit.

## Honest limits

- Unity cannot be installed in the Kiro Web sandbox (Personal licence activation is tied to the author's Unity account), so prompts 6 to 12 are Unverified. Unity code is Partially Verified (compile checked against stubs) at best.

- Nothing on this page has been executed against a live Unity or Blender MCP server.
- `tests/UnityCompileCheck` is a stub-based syntax and type check, not a Unity build.
