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
   `Create a VillageCatalogAsset from Assets/Data/village_catalog.json if none exists, select it, then run the menu item Tools > Frankenstein > Auto-bind Catalog Prefabs and read the console. List which catalog ids were bound and which were not.`
3. Build the demo scene:
   `Create a new scene, add an empty GameObject with VillageBuilder and HorrorAmbienceDirector, assign the catalog asset, and click Build Village from the component context menu.`
4. Match the web demo:
   `Set VillageBuilder pieceCount to 80 (the default is 40) and keep the seed at 1818, then rebuild.`
5. Compile check inside Unity:
   `Trigger a script compile, wait for it to finish, and report every compiler error and warning from the console for Assets/Scripts.` Fix real errors in the scripts, not in `tests/UnityCompileCheck/Stubs`.
6. Read the console:
   `Read the Unity console and summarize errors, warnings, and the Auto-bind log lines that start with [Frankenstein].`

## Blender prompts

The headless Blender pipeline is planned under `tools/blender/` (round 12, FEAT-003). It produces original meshes only. Until it lands, only the generic prompts apply.

1. `Open a new scene in Blender, delete the default cube, and build a simple low-poly gabled house from primitives (original geometry, no imported pack assets).`
2. `Export the selection as FBX with Y up and apply transforms, to a folder outside Assets/ThirdParty.`
3. `Run the script tools/blender/<script>.py in background mode and report its stdout.` (use the real script name once FEAT-003 is merged)

Never feed pack meshes or textures into Blender sessions that produce files you intend to commit.

## Honest limits

- Nothing on this page has been executed against a live Unity or Blender MCP server.
- `tests/UnityCompileCheck` is a stub-based syntax and type check, not a Unity build.
