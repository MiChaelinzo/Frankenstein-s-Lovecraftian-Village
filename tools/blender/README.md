# tools/blender

Headless Blender scripts that build ORIGINAL low-poly meshes for the catalog kinds (house_a, house_b, church, well, altar, dead_tree) plus a lamp prop. Geometry is plain Python in `mesh_defs.py`; no pack asset is read.

| Script | Purpose |
| --- | --- |
| `mesh_defs.py` | Pure Python geometry, validation and argument parsing (tested without Blender by `tools/test_blender_defs.py`). |
| `gen_meshes.py` | bmesh build and flat shaded GLB export, one file per kind. |
| `render_sprites.py` | Small transparent isometric PNG sprites (Cycles on CPU, because headless servers often lack a GL context for Workbench or Eevee). |
| `texture_with_pack.py` | Optional, local only: tint the meshes with a texture from your own pack. Refuses any output outside `pack-scratch/` or `web/local-pack/`. |

```
blender -b --python tools/blender/gen_meshes.py -- --out web/assets/meshes
blender -b --python tools/blender/render_sprites.py -- --out pack-scratch/sprites --size 192
blender -b --python tools/blender/texture_with_pack.py -- --texture <image> --out pack-scratch/textured
```

Use `--kinds well,lamp` to limit the set. Blender is GPL and is not vendored; download the official Linux portable build from [download.blender.org](https://download.blender.org/release/) into the git-ignored `pack-scratch/blender/`. Round 12 used Blender 4.2.23 LTS (sha256 `bea0eb3146be13eae6225409a117b215184f41b7f79e799f97cb3abb8f6dc404`, fetched from an official mirror).

The seven committed GLBs in `web/assets/meshes/` are each under 200 KB (the validator enforces this and that `.glb` files live only there). Never commit pack-derived output.
