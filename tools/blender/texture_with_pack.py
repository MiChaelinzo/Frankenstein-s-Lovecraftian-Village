"""OPTIONAL and local only: tint the original meshes with a texture from your own extracted pack.

Run: blender -b --python tools/blender/texture_with_pack.py -- --texture <image> --out pack-scratch/textured [--kinds a,b]
The texture belongs to the commercial pack, so the result must never be committed. The script refuses any
output directory other than git-ignored pack-scratch/ or web/local-pack/.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import mesh_defs
import gen_meshes

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def split_args(argv):
    argv = list(argv)
    tail = argv[argv.index("--") + 1:] if "--" in argv else []
    texture, rest, i = None, [], 0
    while i < len(tail):
        if tail[i] == "--texture" and i + 1 < len(tail):
            texture = tail[i + 1]; i += 2
        else:
            rest.append(tail[i]); i += 1
    return texture, ["--"] + rest


def apply_texture(obj, image):
    for slot in obj.material_slots:
        nt = slot.material.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        bsdf = nt.nodes["Principled BSDF"]
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.inputs["Factor"].default_value = 0.6
        mix.inputs["A"].default_value = bsdf.inputs["Base Color"].default_value
        nt.links.new(tex.outputs["Color"], mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])


def main():
    texture, rest = split_args(sys.argv)
    args = mesh_defs.parse_args(rest)
    if not texture or not os.path.isfile(texture):
        raise SystemExit("--texture <existing image> is required")
    if not mesh_defs.pack_out_allowed(args["out"], ROOT):
        raise SystemExit("refusing output outside pack-scratch/ or web/local-pack/: %s" % args["out"])
    os.makedirs(args["out"], exist_ok=True)
    for kind in args["kinds"]:
        gen_meshes.clear_scene()
        obj = gen_meshes.build_object(kind, mesh_defs.build(kind))
        apply_texture(obj, bpy.data.images.load(texture))
        print("OK %s" % gen_meshes.export(kind, args["out"]))


if __name__ == "__main__":
    main()
