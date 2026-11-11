# Blender pipeline

Round 12 adds a headless Blender pipeline that builds **original** low-poly meshes for the catalog kinds, exports them as GLB, and a dependency-free web viewer for them.

## What exists

- `tools/blender/gen_meshes.py` builds house_a, house_b, church, well, altar, dead_tree and a lamp prop from Python geometry in `tools/blender/mesh_defs.py` and exports flat shaded GLBs. The result is committed in `web/assets/meshes/` (each file about 5 to 9 KB).
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
