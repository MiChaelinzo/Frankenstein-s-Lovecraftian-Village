"""Render small transparent isometric PNG sprites of the original meshes (Cycles on CPU, headless).

Run: blender -b --python tools/blender/render_sprites.py -- --out <dir> [--kinds a,b] [--size 192]
Reads geometry from mesh_defs.py, so the sprites are original. Output is not committed by default.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import mesh_defs
import gen_meshes


def parse_size(argv, default=192):
    argv = list(argv)
    if "--size" in argv:
        n = int(argv[argv.index("--size") + 1])
        return max(32, min(512, n))
    return default


def render(kind, out_dir, size):
    gen_meshes.clear_scene()
    obj = gen_meshes.build_object(kind, mesh_defs.build(kind))
    scene = bpy.context.scene
    # Workbench and Eevee need a GL context, which headless servers often lack; Cycles on CPU always works.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.use_denoise = False
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.35, 0.4, 0.45, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    scene.collection.objects.link(sun)
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    corners = [obj.matrix_world @ __import__("mathutils").Vector(c) for c in obj.bound_box]
    extent = max(max(c[i] for c in corners) - min(c[i] for c in corners) for i in range(3))
    cam_data.ortho_scale = extent * 1.5
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    mid_z = (max(c[2] for c in corners) + min(c[2] for c in corners)) / 2
    cam.location = (extent * 2.0, -extent * 2.0, mid_z + extent * 1.6)
    cam.rotation_euler = (math.radians(60), 0, math.radians(45))
    scene.camera = cam
    path = os.path.join(out_dir, kind + ".png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    args = mesh_defs.parse_args(_strip_size(sys.argv))
    size = parse_size(sys.argv)
    os.makedirs(args["out"], exist_ok=True)
    for kind in args["kinds"]:
        path = render(kind, args["out"], size)
        print("OK %s %s %d bytes" % (kind, path, os.path.getsize(path)))


def _strip_size(argv):
    out, skip = [], False
    for a in argv:
        if skip:
            skip = False
        elif a == "--size":
            skip = True
        else:
            out.append(a)
    return out


if __name__ == "__main__":
    main()
