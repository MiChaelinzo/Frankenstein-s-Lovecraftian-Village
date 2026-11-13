# Blender pipeline

Round 12 adds a headless Blender pipeline that builds **original** low-poly meshes for the catalog kinds, exports them as GLB, and a dependency-free web viewer for them.

## What exists

- `Packages/com.michaelinzo.frankenstein-village/Data/village_shapes.json` is the single shape source: 25 meshes (the 7 catalog kinds, 6 coast props and 12 village pieces: cottage_thatch, cottage_tall, inn, chapel, lighthouse, market_stall, crate_stack, barrel, gravestone, gravestone_cross, fence_iron, villager with a lantern) described as primitives (box, wedge, cylinder, cone, hull) with position, size, optional shear and yaw, and a material slot name. No randomness. `web/data/village_shapes.json` is an identical copy (`validate_repo.py` and a node test enforce it); the Unity builder (round 19 FEAT-003) reads the same file.
- `tools/blender/mesh_defs.py` reads that file and builds the geometry; `tools/blender/gen_meshes.py` exports flat shaded GLBs into `web/assets/meshes/` (each file 5 to 15 KB). `web/src/shapes.js` is the pure JS reader of the same file; if a GLB fails to load, `loadMeshSet` builds the mesh from the shape data instead. `web/test/shapes.test.js` checks every GLB against the model built from the data (triangles, bounds, emissive).
- Original procedural textures (brick, plaster, roof, wood, stone, water, ground) come from `web/src/proc-textures.js` (seeded, tileable RGBA, no assets). They feed the 2D theme patterns and the default 3D wall and ground textures.
- `tools/blender/render_sprites.py` renders small transparent isometric PNG sprites with Cycles on CPU. Sprites are not committed.
- `tools/blender/texture_with_pack.py` optionally tints the meshes with a texture from your own pack. It only writes to git-ignored `pack-scratch/` or `web/local-pack/`.
- `web/meshes.html` loads the GLBs with `web/src/glb.js` (a small GLB parser plus software projector, no WebGL, no CDN, CSP stays `'self'`) and draws them on canvases. Open it from any static server: `python3 -m http.server -d web` then `/meshes.html`.

## Run it

Download the official Linux portable Blender into `pack-scratch/blender/` (git-ignored), then:

```
blender -b --python tools/blender/gen_meshes.py -- --out web/assets/meshes
```

On a minimal Linux image Blender may need X and GL client libraries (libXxf86vm, libXfixes, libXi, libxkbcommon, libGL, libEGL). Tests that need no Blender: `python3 tools/test_blender_defs.py` and `node --test web/test/glb.test.js`.

## Through Blender MCP (your machine)

If you have a Blender MCP server connected, paste the prompts in [docs/MCP.md](MCP.md), for example: run `tools/blender/gen_meshes.py` in background mode with `--out pack-scratch/blender-out` and report stdout. The committed meshes were produced by running Blender headless directly, not through MCP, and nothing here was verified through MCP.

## Rules

Meshes are original. Do not feed pack meshes or textures into anything you commit. The validator allows `.glb` only under `web/assets/meshes/` and under 200 KB.
