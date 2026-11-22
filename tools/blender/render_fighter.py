#!/usr/bin/env python3
"""Render an original low-poly fighter to a Phaser roll spritesheet.

The default mesh is built in this script from primitives (no imported file).
It is a generic X-layout fighter: compact boat hull, bubble canopy, four
radial pylons with turbine pods, and two forward guns. Neutral grey, no
markings. It is not a model of any franchise ship.

Run from the repo root:

  blender -b -P tools/blender/render_fighter.py -- --output public/ships

Optional external mesh (your own file; nose along +X, dorsal +Z, longitudinal
axis on world X through the origin). Objects are appended, not linked:

  blender -b -P tools/blender/render_fighter.py -- \\
    --model path/to/fighter.blend \\
    --collection Fighter \\
    --anchors gun:muzzle_l,gun:muzzle_r,nozzle:port,nozzle:starboard \\
    --output public/ships --size 256 --frames 16

Without --collection every object in the file is appended. Cameras and lights
in that file are ignored. Without --anchors the script looks for objects whose
names start with "gun" or "nozzle" (empties or mesh origins).
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import struct
import sys
import tempfile
import zlib
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

# Nose +X, dorsal +Z, port +Y. Lengths are Blender units.
# A long-enough boat hull that the square frame is nearly filled by both
# the nose-tail axis and the widest roll of the engine pods.
HULL_STATIONS = (
    # x, radius, z_scale (flattens the cross-section; 1 = round)
    (-0.82, 0.055, 0.78),
    (-0.62, 0.18, 0.62),
    (-0.28, 0.30, 0.50),
    (0.12, 0.33, 0.48),
    (0.46, 0.27, 0.58),
    (0.78, 0.15, 0.76),
    (1.02, 0.045, 0.95),
)
HULL_SIDES = 12
POD_X = -0.06
POD_RADIAL = 0.90
POD_RADIUS = 0.15
POD_LENGTH = 0.56
POD_SIDES = 20
PYLON_ROOT = 0.40
# angle in the YZ plane, degrees: 0 = port (+Y), 90 = dorsal (+Z)
PODS = (
    ("port_dorsal", 45.0),
    ("starboard_dorsal", 135.0),
    ("starboard_ventral", 225.0),
    ("port_ventral", 315.0),
)
GUN_Y = 0.13
GUN_Z = -0.035
GUN_REAR = 0.78
GUN_FRONT = 1.30
GUN_RADIUS = 0.042


def srgb_to_linear(rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    def channel(u: float) -> float:
        if u <= 0.04045:
            return u / 12.92
        return ((u + 0.055) / 1.055) ** 2.4

    return (channel(rgb[0]), channel(rgb[1]), channel(rgb[2]))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv
        argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser(description="Render a top-down fighter roll sheet.")
    parser.add_argument("--model", default=None, help="Optional .blend to append instead of the procedural fighter.")
    parser.add_argument("--collection", default=None, help="Collection to append from --model. Default: every object.")
    parser.add_argument(
        "--anchors",
        default=None,
        help="Comma-separated object names. Prefix gun: or nozzle: to classify; "
        "otherwise names must start with gun or nozzle.",
    )
    parser.add_argument("--output", default="public/ships", help="Directory for the png and json files.")
    parser.add_argument("--name", default="fighter", help="Basename: <name>-roll.png, <name>-roll.json, <name>-anchors.json.")
    parser.add_argument("--size", type=int, default=256, help="Square frame size in pixels.")
    parser.add_argument("--frames", type=int, default=16, help="Roll frames over a full 360 degrees.")
    parser.add_argument("--margin", type=float, default=0.08, help="Extra frame padding as a fraction of the max extent.")
    parser.add_argument("--samples", type=int, default=128, help="Cycles samples per frame.")
    parser.add_argument("--save-blend", default=None, help="Optional path to write the posed .blend (debug).")
    args = parser.parse_args(argv)
    if args.size < 8:
        parser.error("--size must be at least 8")
    if args.frames < 1:
        parser.error("--frames must be at least 1")
    if args.margin < 0:
        parser.error("--margin must be >= 0")
    if args.samples < 1:
        parser.error("--samples must be at least 1")
    if args.collection and not args.model:
        parser.error("--collection requires --model")
    return args


def clear_scene() -> None:
    scene = bpy.context.scene
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    scene.world = None


def fighter_collection() -> bpy.types.Collection:
    existing = bpy.data.collections.get("Fighter")
    if existing:
        return existing
    col = bpy.data.collections.new("Fighter")
    bpy.context.scene.collection.children.link(col)
    return col


def link_ship(obj: bpy.types.Object) -> bpy.types.Object:
    fighter_collection().objects.link(obj)
    return obj


def make_material(name: str, srgb: tuple[float, float, float], metallic: float, roughness: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    color = srgb_to_linear(srgb)
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def mesh_from_bmesh(name: str, bm, material: bpy.types.Material, smooth: bool, split_angle: float | None):
    import bmesh

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if smooth and split_angle is not None:
        bm.edges.ensure_lookup_table()
        sharp = []
        for edge in bm.edges:
            if len(edge.link_faces) != 2 or edge.calc_face_angle(0.0) > split_angle:
                sharp.append(edge)
        if sharp:
            bmesh.ops.split_edges(bm, edges=sharp)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for poly in me.polygons:
            poly.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    link_ship(obj)
    if material is not None:
        me.materials.append(material)
    return obj


def add_cylinder(name, radius, depth, location, material, sides, smooth=True):
    import bmesh

    bm = bmesh.new()
    rot = Matrix.Rotation(math.pi / 2.0, 4, "Y")
    loc = Matrix.Translation(location)
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=sides,
        radius1=radius,
        radius2=radius,
        depth=depth,
        matrix=loc @ rot,
    )
    return mesh_from_bmesh(name, bm, material, smooth, math.radians(40) if smooth else None)


def add_sphere(name, radii, location, material, u=16, v=12):
    import bmesh

    bm = bmesh.new()
    scale = Matrix.Diagonal((radii[0], radii[1], radii[2], 1.0))
    loc = Matrix.Translation(location)
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0, matrix=loc @ scale)
    return mesh_from_bmesh(name, bm, material, True, math.radians(70))


def add_box(name, location, dimensions, material):
    import bmesh

    bm = bmesh.new()
    hx, hy, hz = (d * 0.5 for d in dimensions)
    coords = [
        (-hx, -hy, -hz),
        (hx, -hy, -hz),
        (hx, hy, -hz),
        (-hx, hy, -hz),
        (-hx, -hy, hz),
        (hx, -hy, hz),
        (hx, hy, hz),
        (-hx, hy, hz),
    ]
    verts = [bm.verts.new(Vector(location) + Vector(c)) for c in coords]
    for face in (
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ):
        bm.faces.new([verts[i] for i in face])
    return mesh_from_bmesh(name, bm, material, False, None)


def add_beam(name, start, end, half_w, half_h, material):
    import bmesh

    start = Vector(start)
    end = Vector(end)
    axis = end - start
    if axis.length < 1e-6:
        raise RuntimeError(f"beam {name} has zero length")
    direction = axis.normalized()
    reference = Vector((1.0, 0.0, 0.0)) if abs(direction.x) < 0.85 else Vector((0.0, 0.0, 1.0))
    side = direction.cross(reference).normalized()
    up = side.cross(direction).normalized()
    offsets = []
    for s in (-1.0, 1.0):
        for h in (-1.0, 1.0):
            offsets.append(side * (half_w * s) + up * (half_h * h))
    bm = bmesh.new()
    start_vs = [bm.verts.new(start + off) for off in offsets]
    end_vs = [bm.verts.new(end + off) for off in offsets]
    bm.faces.new(start_vs)
    bm.faces.new(list(reversed(end_vs)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((start_vs[i], end_vs[i], end_vs[j], start_vs[j]))
    return mesh_from_bmesh(name, bm, material, False, None)


def add_empty(name: str, location) -> bpy.types.Object:
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.04
    empty.location = Vector(location)
    link_ship(empty)
    return empty


def radial(angle_deg: float, radius: float, x: float) -> Vector:
    ang = math.radians(angle_deg)
    return Vector((x, math.cos(ang) * radius, math.sin(ang) * radius))


def build_hull(material):
    import bmesh

    bm = bmesh.new()
    rings = []
    for x, radius, z_scale in HULL_STATIONS:
        ring = []
        for i in range(HULL_SIDES):
            ang = (i + 0.5) * math.tau / HULL_SIDES
            ring.append(bm.verts.new((x, math.cos(ang) * radius, math.sin(ang) * radius * z_scale)))
        rings.append(ring)
    for ring_a, ring_b in zip(rings, rings[1:]):
        for i in range(HULL_SIDES):
            j = (i + 1) % HULL_SIDES
            bm.faces.new((ring_a[i], ring_a[j], ring_b[j], ring_b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    return mesh_from_bmesh("hull", bm, material, True, math.radians(48))


def build_procedural() -> list[bpy.types.Object]:
    """Original X-layout fighter. Geometry lives only in this function."""
    # Painted grey, not polished metal: even tone and less sparkle at low sample counts.
    hull_mat = make_material("HullGrey", (0.52, 0.53, 0.55), metallic=0.06, roughness=0.62)
    glass_mat = make_material("Canopy", (0.06, 0.07, 0.08), metallic=0.02, roughness=0.18)
    nozzle_mat = make_material("Nozzle", (0.015, 0.015, 0.016), metallic=0.04, roughness=0.78)

    made: list[bpy.types.Object] = []
    made.append(build_hull(hull_mat))
    made.append(add_sphere("canopy", (0.30, 0.115, 0.095), (0.40, 0.0, 0.24), glass_mat))
    # Structural band where the pylons meet the hull, same grey, not a marking.
    made.append(add_cylinder("collar", 0.40, 0.11, (POD_X, 0.0, 0.0), hull_mat, 24))
    made.append(add_box("mast", (-0.08, 0.0, 0.46), (0.16, 0.06, 0.22), hull_mat))
    made.append(add_box("keel", (-0.10, 0.0, -0.36), (0.40, 0.055, 0.10), hull_mat))

    for suffix, angle in PODS:
        center = radial(angle, POD_RADIAL, POD_X)
        root = radial(angle, PYLON_ROOT, POD_X)
        tip = radial(angle, POD_RADIAL - POD_RADIUS * 0.55, POD_X)
        made.append(add_beam(f"pylon_{suffix}", root, tip, 0.045, 0.035, hull_mat))
        made.append(add_cylinder(f"pod_{suffix}", POD_RADIUS, POD_LENGTH, center, hull_mat, POD_SIDES))
        intake = Vector((center.x + POD_LENGTH * 0.5 - 0.02, center.y, center.z))
        bell = Vector((center.x - POD_LENGTH * 0.5 + 0.015, center.y, center.z))
        made.append(add_cylinder(f"intake_{suffix}", POD_RADIUS * 1.18, 0.06, intake, hull_mat, POD_SIDES))
        made.append(add_cylinder(f"bell_{suffix}", POD_RADIUS * 1.38, 0.08, bell, hull_mat, POD_SIDES))
        core = Vector((center.x - POD_LENGTH * 0.5 - 0.035, center.y, center.z))
        made.append(add_cylinder(f"core_{suffix}", POD_RADIUS * 0.55, 0.07, core, nozzle_mat, POD_SIDES))
        nozzle_point = Vector((center.x - POD_LENGTH * 0.5 - 0.07, center.y, center.z))
        made.append(add_empty(f"nozzle_{suffix}", nozzle_point))

    for side, y in (("port", GUN_Y), ("starboard", -GUN_Y)):
        center = ((GUN_REAR + GUN_FRONT) * 0.5, y, GUN_Z)
        made.append(add_cylinder(f"barrel_{side}", GUN_RADIUS, GUN_FRONT - GUN_REAR, center, hull_mat, 10))
        muzzle = add_cylinder(
            f"muzzle_lip_{side}",
            GUN_RADIUS * 1.35,
            0.035,
            (GUN_FRONT - 0.02, y, GUN_Z),
            hull_mat,
            10,
        )
        made.append(muzzle)
        made.append(add_empty(f"gun_muzzle_{side}", (GUN_FRONT, y, GUN_Z)))
    return made


def import_model(path: str, collection_name: str | None) -> list[bpy.types.Object]:
    blend = Path(path).expanduser().resolve()
    if not blend.is_file():
        raise SystemExit(f"Model file not found: {blend}")
    with bpy.data.libraries.load(str(blend), link=False) as (data_from, data_to):
        if collection_name:
            if collection_name not in data_from.collections:
                found = ", ".join(data_from.collections) or "(none)"
                raise SystemExit(f"Collection {collection_name!r} not in {blend}. Found: {found}")
            data_to.collections = [collection_name]
        else:
            data_to.objects = list(data_from.objects)

    scene = bpy.context.scene
    imported: list[bpy.types.Object] = []
    if collection_name:
        col = data_to.collections[0]
        scene.collection.children.link(col)

        def walk(col_):
            for obj in col_.objects:
                imported.append(obj)
            for child in col_.children:
                walk(child)

        walk(col)
    else:
        for obj in data_to.objects:
            if obj is None:
                continue
            scene.collection.objects.link(obj)
            imported.append(obj)

    kept: list[bpy.types.Object] = []
    for obj in imported:
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        kept.append(obj)
    if not any(obj.type == "MESH" for obj in kept):
        raise SystemExit(f"No mesh objects appended from {blend}")
    return kept


def make_spin_root(objects: list[bpy.types.Object]) -> bpy.types.Object:
    root = bpy.data.objects.new("spin_root", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.2
    bpy.context.scene.collection.objects.link(root)
    # matrix_world is stale until the depsgraph runs; reading it early
    # collapses newly created empties to the origin.
    bpy.context.view_layer.update()
    present = set(objects)
    tops = [obj for obj in objects if obj.parent is None or obj.parent not in present]
    worlds = {obj: obj.matrix_world.copy() for obj in tops}
    for obj in tops:
        obj.parent = root
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_world = worlds[obj]
    bpy.context.view_layer.update()
    for obj, world in worlds.items():
        error = (obj.matrix_world.translation - world.translation).length
        if error > 1e-4:
            raise SystemExit(f"Parenting moved {obj.name} by {error:.4f}")
    return root


def iter_meshes(root: bpy.types.Object):
    stack = list(root.children)
    while stack:
        obj = stack.pop()
        stack.extend(obj.children)
        if obj.type == "MESH" and not obj.hide_render:
            yield obj


def mesh_points(root: bpy.types.Object) -> list[Vector]:
    points: list[Vector] = []
    for obj in iter_meshes(root):
        matrix = obj.matrix_world
        for vert in obj.data.vertices:
            points.append(matrix @ vert.co)
    if not points:
        raise SystemExit("The fighter has no mesh vertices to frame.")
    return points


def frame_camera(cam_obj: bpy.types.Object, points: list[Vector], margin: float) -> tuple[float, float]:
    xs = [p.x for p in points]
    cx = 0.5 * (max(xs) + min(xs))
    half_x = 0.5 * (max(xs) - min(xs))
    # Worst-case |Y| of a vertex spun around X. Exact, not just the rendered steps.
    half_y = max(math.hypot(p.y, p.z) for p in points)
    ortho = 2.0 * max(half_x, half_y) * (1.0 + margin)
    cam_obj.location = (cx, 0.0, 12.0)
    cam_obj.rotation_euler = (0.0, 0.0, 0.0)
    cam_obj.data.ortho_scale = ortho
    bpy.context.view_layer.update()
    return cx, ortho


def setup_camera_and_lights(size: int) -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0

    cam_data = bpy.data.cameras.new("TopCam")
    cam_data.type = "ORTHO"
    cam_data.sensor_fit = "AUTO"
    cam_data.clip_start = 0.01
    cam_data.clip_end = 200.0
    cam = bpy.data.objects.new("TopCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    world = bpy.data.worlds.new("FighterWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    # Modest grey fill so the flanks of a roll stay readable. No ground plane,
    # so nothing receives a shadow except the ship itself.
    fill = srgb_to_linear((0.62, 0.64, 0.66))
    bg.inputs["Color"].default_value = (fill[0], fill[1], fill[2], 1.0)
    bg.inputs["Strength"].default_value = 0.16

    def add_area(name, location, energy, size_, aim):
        light = bpy.data.lights.new(name, "AREA")
        light.energy = energy
        light.size = size_
        light.shape = "SQUARE"
        obj = bpy.data.objects.new(name, light)
        scene.collection.objects.link(obj)
        obj.location = Vector(location)
        direction = Vector(aim) - obj.location
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        return obj

    # Key sits near the camera so every roll is lit from the viewer's "above",
    # offset slightly toward -Y so cylinders pick up a soft gradient.
    add_area("Key", (0.15, -1.6, 7.0), 700.0, 8.0, (0.0, 0.0, 0.0))
    add_area("Fill", (0.4, 2.2, 5.0), 140.0, 7.0, (0.0, 0.0, 0.0))
    return cam


def setup_render(samples: int) -> None:
    import addon_utils

    addon_utils.enable("cycles", default_set=False, persistent=False)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.view_layers[0].cycles.use_denoising = False
    scene.cycles.seed = 1
    scene.cycles.use_animated_seed = False
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.use_light_tree = False
    scene.render.film_transparent = True
    scene.render.use_persistent_data = True
    scene.render.use_compositing = False
    scene.render.use_sequencer = False
    scene.render.filter_size = 1.5
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = "sRGB"


def assert_projection(scene, cam, cx: float, ortho: float) -> None:
    """world_to_camera_view origin is bottom-left; pixels below are top-left."""
    center = world_to_camera_view(scene, cam, Vector((cx, 0.0, 0.0)))
    right = world_to_camera_view(scene, cam, Vector((cx + ortho * 0.5, 0.0, 0.0)))
    up = world_to_camera_view(scene, cam, Vector((cx, ortho * 0.5, 0.0)))
    ok = (
        abs(center.x - 0.5) < 1e-3
        and abs(center.y - 0.5) < 1e-3
        and abs(right.x - 1.0) < 1e-3
        and abs(up.y - 1.0) < 1e-3
    )
    if not ok:
        raise SystemExit(
            "Camera projection self-check failed: "
            f"center={tuple(center)} right={tuple(right)} up={tuple(up)}"
        )


def classify_anchors(spec: str | None) -> tuple[list[bpy.types.Object], list[bpy.types.Object]]:
    by_name = {obj.name: obj for obj in bpy.data.objects if obj.type not in {"CAMERA", "LIGHT"}}

    def lookup(name: str) -> bpy.types.Object:
        obj = by_name.get(name)
        if obj is None:
            known = ", ".join(sorted(by_name))
            raise SystemExit(f"Anchor object {name!r} not found. Objects: {known}")
        return obj

    guns: list[bpy.types.Object] = []
    nozzles: list[bpy.types.Object] = []
    if spec:
        for token in spec.split(","):
            token = token.strip()
            if not token:
                continue
            if token.startswith("gun:"):
                guns.append(lookup(token[4:]))
            elif token.startswith("nozzle:"):
                nozzles.append(lookup(token[7:]))
            else:
                obj = lookup(token)
                lowered = token.lower()
                if lowered.startswith("gun"):
                    guns.append(obj)
                elif lowered.startswith("nozzle"):
                    nozzles.append(obj)
                else:
                    raise SystemExit(
                        f"Cannot classify anchor {token!r}. Use a gun: or nozzle: prefix, "
                        "or a name starting with gun or nozzle."
                    )
    else:
        for name in sorted(by_name):
            obj = by_name[name]
            lowered = name.lower()
            if lowered.startswith("gun"):
                guns.append(obj)
            elif lowered.startswith("nozzle"):
                nozzles.append(obj)
    if len(guns) < 1 or len(nozzles) < 1:
        raise SystemExit(
            "Need at least one gun anchor and one nozzle anchor. "
            "Name empties gun_* and nozzle_*, or pass --anchors gun:Name,nozzle:Name."
        )
    return guns, nozzles


def project_anchors(scene, cam, guns, nozzles, size: int) -> dict:
    def point(obj: bpy.types.Object) -> dict:
        co = world_to_camera_view(scene, cam, obj.matrix_world.translation)
        return {
            "name": obj.name,
            "x": round(co.x * size, 2),
            "y": round((1.0 - co.y) * size, 2),
            "viewZ": round(co.z, 4),
        }

    return {
        "guns": [point(obj) for obj in guns],
        "nozzles": [point(obj) for obj in nozzles],
    }


def set_roll(root: bpy.types.Object, degrees: float) -> None:
    root.rotation_mode = "XYZ"
    root.rotation_euler = (math.radians(degrees), 0.0, 0.0)
    bpy.context.view_layer.update()


def render_frames(root: bpy.types.Object, directory: Path, frames: int) -> list[Path]:
    scene = bpy.context.scene
    paths: list[Path] = []
    for index in range(frames):
        degrees = index * 360.0 / frames
        set_roll(root, degrees)
        path = directory / f"frame_{index:02d}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)
        print(f"rendered frame {index} roll {degrees:.2f} deg -> {path.name}")
    return paths


def _paeth(left: int, up: int, up_left: int) -> int:
    estimate = left + up - up_left
    da = abs(estimate - left)
    db = abs(estimate - up)
    dc = abs(estimate - up_left)
    if da <= db and da <= dc:
        return left
    if db <= dc:
        return up
    return up_left


def read_png_rgba(path: Path) -> tuple[int, int, list[bytearray]]:
    """8-bit RGBA PNG, non-interlaced. Rows are top to bottom."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path} is not a PNG")
    pos = 8
    width = height = None
    idat = bytearray()
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        tag = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if tag == b"IHDR":
            width, height, bit, color, _comp, _filt, inter = struct.unpack(">IIBBBBB", chunk)
            if bit != 8 or color != 6 or inter != 0:
                raise SystemExit(f"Unsupported PNG {path}: bit={bit} color={color} interlace={inter}")
        elif tag == b"IDAT":
            idat.extend(chunk)
        elif tag == b"IEND":
            break
    if width is None:
        raise SystemExit(f"{path} is missing IHDR")
    raw = zlib.decompress(bytes(idat))
    stride = width * 4
    rows: list[bytearray] = []
    index = 0
    prev = bytearray(stride)
    for _y in range(height):
        filt = raw[index]
        index += 1
        row = bytearray(raw[index : index + stride])
        index += stride
        if filt == 1:
            for x in range(stride):
                left = row[x - 4] if x >= 4 else 0
                row[x] = (row[x] + left) & 255
        elif filt == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif filt == 3:
            for x in range(stride):
                left = row[x - 4] if x >= 4 else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
        elif filt == 4:
            for x in range(stride):
                left = row[x - 4] if x >= 4 else 0
                up_left = prev[x - 4] if x >= 4 else 0
                row[x] = (row[x] + _paeth(left, prev[x], up_left)) & 255
        elif filt != 0:
            raise SystemExit(f"Unsupported PNG filter {filt} in {path}")
        rows.append(row)
        prev = row
    return width, height, rows


def write_png_rgba(path: Path, width: int, height: int, rows: list[bytearray]) -> None:
    def chunk(tag: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes(row) for row in rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def stitch_strip(frame_paths: list[Path], out_path: Path, size: int) -> None:
    decoded = []
    for path in frame_paths:
        width, height, rows = read_png_rgba(path)
        if (width, height) != (size, size):
            raise SystemExit(f"{path} is {width}x{height}, expected {size}x{size}")
        decoded.append(rows)
    strip_rows = []
    for y in range(size):
        row = bytearray()
        for rows in decoded:
            row.extend(rows[y])
        strip_rows.append(row)
    write_png_rgba(out_path, size * len(frame_paths), size, strip_rows)
    _w, _h, check = read_png_rgba(out_path)
    if check[0][: size * 4] != decoded[0][0] or check[size // 2][: size * 4] != decoded[0][size // 2]:
        raise SystemExit("Stitched strip does not match frame 0.")
    print(f"strip ok {out_path} ({size * len(frame_paths)}x{size})")


def frames_differ(a: Path, b: Path) -> float:
    _, _, rows_a = read_png_rgba(a)
    _, _, rows_b = read_png_rgba(b)
    total = 0
    count = 0
    for ra, rb in zip(rows_a, rows_b):
        for ua, ub in zip(ra, rb):
            total += abs(ua - ub)
            count += 1
    return total / count / 255.0


def anchor_alpha(frame_path: Path, size: int, x: float, y: float, radius: int = 2) -> float:
    _w, height, rows = read_png_rgba(frame_path)
    cx = int(math.floor(x))
    cy = int(math.floor(y))
    best = 0
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            ix = cx + dx
            iy = cy + dy
            if ix < 0 or iy < 0 or ix >= size or iy >= height:
                continue
            best = max(best, rows[iy][ix * 4 + 3])
    return best / 255.0


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    clear_scene()
    model_label = "procedural"
    if args.model:
        objects = import_model(args.model, args.collection)
        model_label = str(Path(args.model).expanduser().resolve())
        if args.collection:
            model_label += f"#{args.collection}"
    else:
        objects = build_procedural()

    root = make_spin_root(objects)
    set_roll(root, 0.0)
    setup_render(args.samples)
    cam = setup_camera_and_lights(args.size)
    points = mesh_points(root)
    cx, ortho = frame_camera(cam, points, args.margin)
    assert_projection(bpy.context.scene, cam, cx, ortho)
    print(f"camera x={cx:.4f} ortho_scale={ortho:.4f} verts={len(points)}")

    guns, nozzles = classify_anchors(args.anchors)
    set_roll(root, 0.0)
    anchors = project_anchors(bpy.context.scene, cam, guns, nozzles, args.size)

    out_dir = Path(args.output).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = args.name
    png_path = out_dir / f"{stem}-roll.png"
    sheet_path = out_dir / f"{stem}-roll.json"
    anchor_path = out_dir / f"{stem}-anchors.json"

    tmp = Path(tempfile.mkdtemp(prefix="fighter-render-"))
    try:
        frame_paths = render_frames(root, tmp, args.frames)
        if args.frames > 1:
            other = args.frames // 4 if args.frames >= 4 else 1
            delta = frames_differ(frame_paths[0], frame_paths[other])
            print(f"frame 0 vs {other} mean abs delta {delta:.5f}")
            if delta < 1e-4:
                raise SystemExit("Roll frames are identical; the spin root did not affect the mesh.")
        stitch_strip(frame_paths, png_path, args.size)
        for group in ("guns", "nozzles"):
            for entry in anchors[group]:
                alpha = anchor_alpha(frame_paths[0], args.size, entry["x"], entry["y"])
                entry_note = f"nearby alpha {alpha:.2f}"
                print(f"anchor {entry['name']} px=({entry['x']}, {entry['y']}) viewZ={entry['viewZ']} {entry_note}")
                if alpha < 0.15:
                    print(f"WARNING: {entry['name']} does not land on the ship silhouette")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    step = 360.0 / args.frames
    write_json(
        sheet_path,
        {
            "key": f"{stem}-roll",
            "image": png_path.name,
            "frameWidth": args.size,
            "frameHeight": args.size,
            "frameCount": args.frames,
            "margin": 0,
            "spacing": 0,
            "rollAxis": "+X",
            "stepDeg": step,
            "frames": [{"index": i, "rollDeg": round(i * step, 4)} for i in range(args.frames)],
        },
    )
    # Drop the sampling note from the on-disk anchors; coordinates only.
    write_json(
        anchor_path,
        {
            "generator": "tools/blender/render_fighter.py",
            "model": model_label,
            "image": png_path.name,
            "frame": 0,
            "frameWidth": args.size,
            "frameHeight": args.size,
            "origin": "top-left",
            "rollDeg": 0,
            "projection": "bpy_extras.object_utils.world_to_camera_view",
            "viewZNote": "viewZ is the third component of world_to_camera_view; smaller is closer to the camera",
            "guns": anchors["guns"],
            "nozzles": anchors["nozzles"],
        },
    )
    if args.save_blend:
        set_roll(root, 0.0)
        blend_path = str(Path(args.save_blend).expanduser().resolve())
        bpy.ops.wm.save_as_mainfile(filepath=blend_path)
        print(f"saved {blend_path}")
    print(f"wrote {png_path}")
    print(f"wrote {sheet_path}")
    print(f"wrote {anchor_path}")


if __name__ == "__main__":
    main()
