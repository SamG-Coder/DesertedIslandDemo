"""Create an editable Blender asset review and render, leaving source models intact."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender/beach-expansion.blend'))
kit=['Foundation','Square tower','Round tower','Pillar','Cone roof','Dome','Stairs','Ramp','Corner wall','Window wall','Bridge','Battlement','Buttress','Balcony','Curved wall','Gatehouse','Fortress keep']
shells=['Scallop shell','Clam shell','Spiral shell','Conch shell','Olive seaweed','Amber seaweed']
shovel=['Concave steel blade','Ash shaft','Steel socket','D grip frame','Wooden cross grip']
bucket=['Hollow tapered enamel pail','Steel bail','Ash bail grip']
for obj in list(bpy.context.scene.objects):obj.hide_render=True;obj.hide_set(True)
def show(name,position,scale=1):
    obj=bpy.data.objects[name];obj.hide_render=False;obj.hide_set(False)
    obj.location+=Vector(position);obj.scale*=scale
    return obj
for i,name in enumerate(kit):show(name,((i%6)*1.5-3.8,(i//6)*1.8,0))
for i,name in enumerate(shells):show(name,(-2.9+i*1.1,-1.65,0),2)
for name in shovel:show(name,(-4.9,-1.3,0))
for name in bucket:show(name,(-3.8,-1.4,0),2)
for name in ['palm-bark','palm-coconut','palm-rachis','palm-leaf','palm-leaf-light','palm-dry-leaf']:show(name,(-6,4,0),.65)
bpy.ops.mesh.primitive_plane_add(size=200)
ground=bpy.context.object;ground.name='Review backdrop';ground.location.z=-.02
material=bpy.data.materials.new('Warm studio backdrop');material.diffuse_color=(.38,.43,.46,1);ground.data.materials.append(material)
bpy.ops.object.light_add(type='AREA',location=(-5,-6,12));light=bpy.context.object;light.data.energy=2600;light.data.size=6
light.rotation_euler=(Vector((0,1,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(10,-15,14));camera=bpy.context.object
camera.rotation_euler=(Vector((-1.2,1.5,1.7))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=15.7
scene=bpy.context.scene;scene.camera=camera
scene.world=bpy.data.worlds.new('Studio daylight');scene.world.color=(.35,.35,.35)
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/beach-expansion-review.blend'))
scene.render.filepath=str(ROOT/'artifacts/blender-beach-expansion.png')
bpy.ops.render.render(write_still=True)
