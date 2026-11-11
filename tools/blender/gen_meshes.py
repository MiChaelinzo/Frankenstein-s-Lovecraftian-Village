"""Build the original low-poly meshes and export one flat shaded GLB per catalog kind.

Run: blender -b --python tools/blender/gen_meshes.py -- --out <dir> [--kinds house_a,well]
Geometry comes from mesh_defs.py (pure Python). No pack assets are read.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import bmesh
import mesh_defs


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgba):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = 0.9
    if name.startswith("mat_glow") or name.startswith("mat_rune"):
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = 1.5
    return m


def build_object(kind, parts):
    bm = bmesh.new()
    mats, slot = [], {}
    for name, verts, faces, rgba in parts:
        key = tuple(rgba)
        if key not in slot:
            slot[key] = len(mats)
            mats.append(material("mat_%s" % _label(rgba), rgba))
        bverts = [bm.verts.new(v) for v in verts]
        for f in faces:
            face = bm.faces.new([bverts[i] for i in f])
            face.material_index = slot[key]
            face.smooth = False
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(kind)
    bm.to_mesh(mesh)
    bm.free()
    for m in mats:
        mesh.materials.append(m)
    obj = bpy.data.objects.new(kind, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _label(rgba):
    for k, v in mesh_defs.PALETTE.items():
        if tuple(v) == tuple(rgba):
            return k
    return "custom"


def export(kind, out_dir):
    path = os.path.join(out_dir, kind + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, use_selection=False)
    return path


def main():
    args = mesh_defs.parse_args(sys.argv)
    os.makedirs(args["out"], exist_ok=True)
    for kind in args["kinds"]:
        clear_scene()
        parts = mesh_defs.build(kind)
        errs = mesh_defs.validate(parts)
        if errs:
            raise SystemExit("%s invalid: %s" % (kind, "; ".join(errs)))
        build_object(kind, parts)
        path = export(kind, args["out"])
        print("OK %s %s %d bytes %s" % (kind, path, os.path.getsize(path), mesh_defs.stats(parts)))


if __name__ == "__main__":
    main()
