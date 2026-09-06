"""Run: D:\\Blender\\blender.exe --background --python scripts/refine-coastal-assets.py

Keeps an editable source .blend and exports only the three game rock meshes.
The authored silhouettes, object transforms and material identities are preserved.
"""
import bpy
import json
import sys
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets' / 'blender' / 'coastal-rock-source.blend'
OUTPUT = ROOT / 'assets' / 'models' / 'coastal-rock-set.glb'
SOURCE.parent.mkdir(parents=True, exist_ok=True)
if SOURCE.exists():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUTPUT))
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))

report = []
rocks = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for i, rock in enumerate(rocks):
    bpy.context.view_layer.objects.active = rock
    original = len(rock.data.polygons)
    # Split the existing faces without shrinking the characteristic slab/wedge.
    subdiv = rock.modifiers.new('Surface tessellation', 'SUBSURF')
    subdiv.subdivision_type = 'SIMPLE'
    subdiv.levels = 2 if original < 500 else 1
    bpy.ops.object.modifier_apply(modifier=subdiv.name)
    grain = bpy.data.textures.new(f'Coastal erosion {i}', type='CLOUDS')
    grain.noise_scale = 0.23
    grain.noise_depth = 2
    erosion = rock.modifiers.new('Shallow weathered relief', 'DISPLACE')
    erosion.texture = grain
    erosion.texture_coords = 'LOCAL'
    erosion.strength = 0.055
    erosion.mid_level = 0.5
    bpy.ops.object.modifier_apply(modifier=erosion.name)
    for face in rock.data.polygons:
        face.use_smooth = True
    # Retain major fracture planes; soften the tessellation within them.
    rock.data.set_sharp_from_angle(angle=0.65)
    rock.data.calc_loop_triangles()
    report.append({'name': rock.name, 'sourceFaces': original,
                   'triangles': len(rock.data.loop_triangles)})

bpy.ops.object.select_all(action='DESELECT')
for rock in rocks:
    rock.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format='GLB',
    use_selection=True, export_extras=True, export_yup=True)
# Also save the finished asset for further manual sculpting in Blender.
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE.with_name('coastal-rock-refined.blend')))
print('COASTAL_ASSET_REPORT ' + json.dumps(report))

if '--render-preview' in sys.argv:
    # A neutral geometry contact sheet; runtime still uses the game's PBR maps.
    material = bpy.data.materials.new('Neutral coastal stone review')
    material.diffuse_color = (0.22, 0.25, 0.27, 1)
    material.use_nodes = True
    material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = material.diffuse_color
    material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = 0.82
    for i, rock in enumerate(rocks):
        corners = [rock.matrix_world @ Vector(corner) for corner in rock.bound_box]
        center = sum(corners, Vector()) / 8
        rock.location += Vector(((i - 1) * 3.8 - center.x, -center.y, -min(v.z for v in corners)))
        rock.data.materials.clear()
        rock.data.materials.append(material)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.08))
    floor = bpy.data.materials.new('Warm review ground')
    floor.diffuse_color = (0.48, 0.42, 0.32, 1)
    floor.use_nodes = True
    floor.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = floor.diffuse_color
    bpy.context.object.data.materials.append(floor)
    bpy.ops.object.light_add(type='AREA', location=(-3, -4, 10))
    light = bpy.context.object
    light.data.energy = 1800
    light.data.shape = 'DISK'
    light.data.size = 6
    light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(7, -14, 10))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, 0.7)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 14
    scene = bpy.context.scene
    scene.camera = camera
    scene.world = bpy.data.worlds.new('Review daylight')
    scene.world.color = (0.25, 0.25, 0.25)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    preview = ROOT / 'artifacts' / 'coastal-rock-review.png'
    preview.parent.mkdir(exist_ok=True)
    scene.render.filepath = str(preview)
    bpy.ops.render.render(write_still=True)
