"""Blender asset authoring: bevelled packed-sand turret, wall and arched gate.
Run with D:\\Blender\\blender.exe --background --python scripts/build-sandcastle-kit.py
"""
import bpy
import bmesh
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'assets' / 'blender'
DIRECTORY.mkdir(exist_ok=True)
SOURCE = DIRECTORY / 'sandcastle-source.blend'
if SOURCE.exists():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'assets/models/stackable-sand-castle.glb'))
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))

turret = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for obj in turret:
    bpy.context.view_layer.objects.active = obj
    bevel = obj.modifiers.new('Soft mould edges', 'BEVEL')
    bevel.width = 0.0016
    bevel.segments = 2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.set_sharp_from_angle(angle=0.7)

def export(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'assets/models' / name),
        export_format='GLB', use_selection=True, export_extras=True)

export(turret, 'stackable-sand-castle.glb')

sand = bpy.data.materials.new('Damp sculpted sand')
sand.use_nodes = True
nodes = sand.node_tree.nodes
links = sand.node_tree.links
bsdf = nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = (0.58, 0.39, 0.19, 1)
bsdf.inputs['Roughness'].default_value = 0.87
noise = nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 170
noise.inputs['Detail'].default_value = 2
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = 0.2
bump.inputs['Distance'].default_value = 0.001
links.new(noise.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

def block(name, center, dimensions):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(sand)
    return obj

def soften(objects):
    for obj in objects:
        bpy.context.view_layer.objects.active = obj
        bevel = obj.modifiers.new('Hand packed edges', 'BEVEL')
        bevel.width = 0.009
        bevel.segments = 2
        bpy.ops.object.modifier_apply(modifier=bevel.name)

wall = [block('Curtain wall', (0, 0, 0.15), (0.72, 0.18, 0.3))]
for x in [-0.27, -0.09, 0.09, 0.27]:
    wall.append(block('Wall crenellation', (x, 0, 0.345), (0.11, 0.18, 0.09)))
soften(wall)
export(wall, 'sandcastle-wall.glb')

# An actual open arch, constructed from voussoirs; no opaque doorway decal.
gate = []
for x in [-0.215, 0.215]:
    gate.append(block('Gate pier', (x, 0, 0.13), (0.13, 0.2, 0.26)))
for i in range(12):
    a = i * math.pi / 12
    b = (i + 1) * math.pi / 12
    vertices = []
    for y in [-0.1, 0.1]:
        for radius, angle in [(0.15, a), (0.28, a), (0.28, b), (0.15, b)]:
            vertices.append((radius * math.cos(angle), y, 0.26 + radius * math.sin(angle)))
    mesh = bpy.data.meshes.new('Arch wedge')
    mesh.from_pydata(vertices, [], [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('Packed arch', mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(sand)
    gate.append(obj)
soften(gate)
export(gate, 'sandcastle-gate.glb')

# Lay out the editable kit for review, without changing the exported transforms.
for obj in turret:
    obj.data.materials.clear()
    obj.data.materials.append(sand)
    obj.scale *= 2.6
    obj.location *= 2.6
    obj.location.x -= 1.25
for obj in gate: obj.location.x += 1.25
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.015))
bpy.context.object.name = 'Review sand surface'
bpy.context.object.data.materials.append(sand)
bpy.ops.object.light_add(type='AREA', location=(-2, -3, 4))
light = bpy.context.object
light.data.energy = 450
light.data.size = 3
light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(2.4, -5.5, 2.8))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 0.22)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 4.4
scene = bpy.context.scene
scene.camera = camera
scene.world = bpy.data.worlds.new('Coastal daylight')
scene.world.color = (0.25, 0.3, 0.38)
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1400
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.filepath = str(ROOT / 'artifacts/sandcastle-kit.png')
(ROOT / 'artifacts').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(DIRECTORY / 'sandcastle-kit.blend'))
bpy.ops.render.render(write_still=True)
print('SANDCASTLE_KIT_COMPLETE')
