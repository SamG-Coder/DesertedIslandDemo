"""Author the beach RPG expansion in Blender. No runtime procedural substitutes.
Run: D:\\Blender\\blender.exe --background --python scripts/build-beach-expansion.py
"""
import bpy, bmesh, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/models'
EDIT = ROOT / 'assets/blender'
ART = ROOT / 'artifacts'
EDIT.mkdir(exist_ok=True); ART.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(8317)

def mat(name, color, rough=.8, metal=0, identity=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    m.diffuse_color = (*color, 1)
    if identity: m['studioMaterialId'] = identity
    return m

sand = mat('Packed dune sand', (.64,.46,.25))
steel = mat('Brushed stainless steel', (.36,.41,.44), .32, .85)
wood = mat('Oiled ash wood', (.43,.25,.10), .62)
pailmat = mat('Sea blue enamel', (.025,.23,.29), .27, .15)
cream = mat('Shell ivory', (.83,.69,.49), .42)
pink = mat('Scallop rose', (.66,.32,.23), .5)
green = mat('Olive kelp', (.10,.18,.035), .5)
brown = mat('Amber wrack', (.22,.105,.026), .58)

def mesh(name, vertices, faces, material, uv=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces); data.update()
    bm = bmesh.new(); bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(data); bm.free()
    obj = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(obj)
    data.materials.append(material)
    layer = data.uv_layers.new(name='UVMap')
    for loop in data.loops:
        v = data.vertices[loop.vertex_index].co
        layer.data[loop.index].uv = uv[loop.vertex_index] if uv else (v.x, v.z)
    return obj

def bevel(obj, width=.008):
    bpy.context.view_layer.objects.active = obj
    m = obj.modifiers.new('Soft edges', 'BEVEL'); m.width=width; m.segments=2
    bpy.ops.object.modifier_apply(modifier=m.name)
    return obj

def cube(name, xyz, dims, material=sand):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz); obj=bpy.context.object
    obj.name=name; obj.dimensions=dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj

def cylinder(name, xyz, radius, depth, material, radius2=None, vertices=20):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
        radius2=radius if radius2 is None else radius2, depth=depth, location=xyz)
    obj=bpy.context.object; obj.name=name; obj.data.materials.append(material)
    for p in obj.data.polygons: p.use_smooth=True
    return obj

def tube(name, points, radius, material, sides=8):
    verts=[]; faces=[]
    for i,p in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize(); side=tangent.cross(Vector((0,1,0))).normalized()
        if side.length < .1: side=Vector((1,0,0))
        up=tangent.cross(side).normalized()
        for j in range(sides):
            angle=j*math.tau/sides
            verts.append(Vector(p)+radius*(math.cos(angle)*side+math.sin(angle)*up))
        if i:
            for j in range(sides): faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))])
    obj=mesh(name,verts,faces,material)
    for p in obj.data.polygons:p.use_smooth=True
    return obj

def join(objects,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join(); obj=bpy.context.object; obj.name=name; obj.data.name=name
    return obj

def export(objects,filename):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename),export_format='GLB',use_selection=True,export_extras=True)

def hide(objects):
    for o in objects:o.hide_render=True; o.hide_set(True)

# A concave steel shovel with a rolled lip, wooden shaft, socket and D handle.
verts=[]; faces=[]
for row in range(9):
    t=row/8; half=.115*(.7+.3*math.sin(t*math.pi/2))
    for col in range(9):
        u=col/4-1
        verts.append((half*u, .025*u*u+.018*math.sin(t*math.pi), .02+t*.29+.026*u*u*(1-t)))
        if row and col:
            k=row*9+col;faces.append((k-10,k-9,k,k-1))
blade=mesh('Concave steel blade',verts,faces,steel)
bpy.context.view_layer.objects.active=blade
solid=blade.modifiers.new('Steel thickness','SOLIDIFY');solid.thickness=.0025
bpy.ops.object.modifier_apply(modifier=solid.name);bevel(blade,.002)
for p in blade.data.polygons:p.use_smooth=True
shaft=cylinder('Ash shaft',(0,.018,.73),.019,.94,wood,vertices=16)
socket=cylinder('Steel socket',(0,.018,.325),.025,.15,steel,radius2=.021,vertices=16)
handle=tube('D grip frame',[(0,.018,1.18),(-.075,.018,1.28),(-.09,.018,1.4),(-.065,.018,1.44),(.065,.018,1.44),(.09,.018,1.4),(.075,.018,1.28),(0,.018,1.18)],.012,steel)
grip=tube('Wooden cross grip',[(-.068,.018,1.425),(.068,.018,1.425)],.019,wood,12)
shovel=[blade,shaft,socket,handle,grip]
export(shovel,'blender-builder-shovel.glb'); hide(shovel)

# A genuinely hollow, tapered enamel bucket, including the inside and rim.
verts=[];faces=[];rings=[(.105,0),(.155,.265),(.149,.265),(.101,.012)]
for radius,z in rings:
    for j in range(40):
        a=j*math.tau/40;verts.append((radius*math.cos(a),radius*math.sin(a),z))
for r in range(3):
    for j in range(40):faces.append((r*40+j,r*40+(j+1)%40,(r+1)*40+(j+1)%40,(r+1)*40+j))
faces += [tuple(reversed(range(40))),tuple(120+j for j in range(40))]
pail=bevel(mesh('Hollow tapered enamel pail',verts,faces,pailmat),.002)
for p in pail.data.polygons:p.use_smooth=abs(p.normal.z)<.8
handle=tube('Steel bail',[(.157*math.cos(a),0,.24+.19*math.sin(a)) for a in [j*math.pi/24 for j in range(25)]],.0045,steel)
grip=tube('Ash bail grip',[(-.04,0,.431),(.04,0,.431)],.012,wood)
bucket=[pail,handle,grip];export(bucket,'blender-builders-bucket.glb');hide(bucket)

# Seventeen additional pieces; the existing turret, wall and gate bring the kit to 20.
kit=[]
def piece(name,parts):
    for p in parts: bevel(p,.008)
    obj=join(parts,name);kit.append(obj);return obj
piece('Foundation',[cube('base',(0,0,.09),(1,1,.18))])
piece('Square tower',[cube('tower',(0,0,.45),(.55,.55,.9))]+[cube('crown',(x,y,.95),(.18,.18,.12)) for x in [-.19,.19] for y in [-.19,.19]])
piece('Round tower',[cylinder('tower',(0,0,.55),.34,1.1,sand,radius2=.28,vertices=24)]+[cube('merlon',(.28*math.cos(i*math.tau/8),.28*math.sin(i*math.tau/8),1.13),(.11,.11,.12)) for i in range(8)])
piece('Pillar',[cylinder('pillar',(0,0,.4),.12,.8,sand,vertices=16),cylinder('foot',(0,0,.04),.19,.08,sand),cylinder('cap',(0,0,.79),.19,.08,sand)])
piece('Cone roof',[cylinder('roof',(0,0,.3),.43,.6,sand,radius2=.02,vertices=24)])
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.4,location=(0,0,0))
dome=bpy.context.object;dome.data.materials.append(sand)
for v in dome.data.vertices:v.co.z=max(0,v.co.z)
piece('Dome',[dome])
piece('Stairs',[cube('step',(0,-.42+i*.14,(i+1)*.06),(.65,.14,(i+1)*.12)) for i in range(7)])
wedge=mesh('ramp',[(-.4,-.5,0),(.4,-.5,0),(.4,.5,0),(-.4,.5,0),(-.4,.5,.6),(.4,.5,.6)],[(0,3,2,1),(0,1,5,4),(1,2,5),(3,4,5,2),(0,4,3)],sand)
piece('Ramp',[wedge])
piece('Corner wall',[cube('a',(0,0,.25),(.8,.2,.5)),cube('b',(-.3,.3,.25),(.2,.6,.5))])
piece('Window wall',[cube('left',(-.3,0,.32),(.2,.2,.64)),cube('right',(.3,0,.32),(.2,.2,.64)),cube('lintel',(0,0,.58),(.4,.2,.12)),cube('sill',(0,0,.1),(.4,.2,.2))])
piece('Bridge',[cube('deck',(0,0,.12),(1.3,.65,.24)),cube('rail',(0,-.29,.29),(1.3,.09,.18)),cube('rail',(0,.29,.29),(1.3,.09,.18))])
piece('Battlement',[cube('base',(0,0,.08),(1,.2,.16))]+[cube('tooth',(-.4+i*.2,0,.22),(.12,.2,.12)) for i in range(5)])
piece('Buttress',[cube('foot',(0,0,.08),(.32,.65,.16)),cube('buttress',(0,.15,.35),(.25,.25,.7))])
piece('Balcony',[cube('deck',(0,0,.08),(.85,.6,.16)),cube('front',(0,-.25,.23),(.85,.1,.3)),cube('left',(-.375,0,.23),(.1,.5,.3)),cube('right',(.375,0,.23),(.1,.5,.3))])
curved=[]
for i in range(12):
    a=(i+.5)*math.pi/24
    o=cube('curved segment',(.65*math.cos(a),.65*math.sin(a),.25),(.10,.20,.5));o.rotation_euler.z=a+math.pi/2;curved.append(o)
piece('Curved wall',curved)
piece('Gatehouse',[cube('tower',(-.45,0,.5),(.35,.5,1)),cube('tower',(.45,0,.5),(.35,.5,1)),cube('span',(0,0,.88),(.55,.5,.24))])
piece('Fortress keep',[cube('keep',(0,0,.55),(.95,.8,1.1))]+[cylinder('corner',(x,y,.6),.2,1.2,sand,vertices=16) for x in [-.45,.45] for y in [-.37,.37]])
export(kit,'castle-mould-library.glb');hide(kit)

# Six small collectible pieces with real ribbed shell surfaces and kelp ribbons.
collect=[]
for name,material,fan in [('Scallop shell',pink,True),('Clam shell',cream,False),('Spiral shell',cream,False),('Conch shell',pink,False)]:
    v=[];f=[]
    for r in range(13):
        t=r/12
        for j in range(33):
            a=(j/32*math.pi if fan else j/32*math.tau)
            if 'Spiral' in name or 'Conch' in name:
                a=j/32*math.tau*2.4;radius=.015+.06*j/32
                theta=t*math.tau
                if 'Conch' in name:
                    s=j/32
                    shell_radius=.06*math.sin(math.pi*s)**.7*(.7+.3*s)*(1+.07*math.cos(theta*9+s*18))
                    v.append((.23*(s-.5),shell_radius*math.cos(theta),shell_radius*math.sin(theta)+.055))
                else:
                    v.append(((radius+.016*math.cos(theta))*math.cos(a),(radius+.016*math.cos(theta))*math.sin(a),.018*math.sin(theta)+.012*j/32))
            else:
                radius=.105*t*(1+.045*math.cos(a*18))
                v.append((radius*math.cos(a),radius*math.sin(a)*(.8 if fan else .65),.038*(1-t*t)+.003*math.cos(a*18)*t))
            if r and j:
                k=r*33+j;f.append((k-34,k-33,k,k-1))
    o=mesh(name,v,f,material)
    for p in o.data.polygons:p.use_smooth=True
    collect.append(o)
for name,material in [('Olive seaweed',green),('Amber seaweed',brown)]:
    parts=[]
    for strand in range(6):
        v=[];f=[];angle=strand*2.4
        for i in range(13):
            t=i/12;width=.013*math.sin(math.pi*t)**.5+.002
            x=.2*t*math.cos(angle);y=.2*t*math.sin(angle)+.015*math.sin(t*13+strand)
            z=.014+.022*math.sin(t*8+strand)**2
            v.extend([(x-width*math.sin(angle),y+width*math.cos(angle),z),(x+width*math.sin(angle),y-width*math.cos(angle),z+.006*math.sin(i))])
            if i:f.append((2*i-2,2*i-1,2*i+1,2*i))
        parts.append(mesh('Kelp ribbon',v,f,material))
    collect.append(join(parts,name))
export(collect,'beach-collectibles.glb');hide(collect)

# Curved coconut palm. Each material group is merged before export.
profiles=[('palm-bark',(.30,.20,.11)),('palm-coconut',(.22,.13,.05)),('palm-rachis',(.25,.32,.08)),('palm-leaf',(.07,.23,.08)),('palm-leaf-light',(.16,.34,.10)),('palm-dry-leaf',(.38,.25,.09))]
materials={key:mat(key,color,.83,identity='material/'+key) for key,color in profiles}
groups={key:[] for key,_ in profiles}
def center(t):return Vector((1.1*t*t,.18*math.sin(t*2.6),7.6*t))
v=[];f=[];uv=[]
for r in range(49):
    t=r/48;radius=(.24-.12*t)*(1+.025*math.sin(r*2.7))
    for j in range(17):
        a=j/16*math.tau;v.append(center(t)+Vector((radius*math.cos(a),radius*math.sin(a),0)));uv.append((j/16,t*6))
        if r and j:
            k=r*17+j;f.append((k-18,k-17,k,k-1))
trunk=mesh('Curved ringed trunk',v,f,materials['palm-bark'],uv)
for p in trunk.data.polygons:p.use_smooth=True
groups['palm-bark'].append(trunk)
crown=center(1)
for frond in range(16):
    angle=frond*2.39996;length=2.5+random.random()*.9;dry=frond>=14
    lift=.65 if not dry else -.15
    direction=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-direction.y,direction.x,0))
    def spine(t):return crown+direction*(t*length)+Vector((0,0,lift*math.sin(t*math.pi)-1.35*t*t))
    groups['palm-rachis'].append(tube('Frond spine',[spine(j/16) for j in range(17)],.012,materials['palm-rachis'],5))
    for leaf in range(1,23):
        t=leaf/24;leaflength=.60*math.sin(math.pi*t)**.65+.05
        for sign in [-1,1]:
            root=spine(t);tip=root+side*(sign*leaflength)+direction*.21+Vector((0,0,-.19))
            vv=[];ff=[];uu=[]
            for k in range(4):
                s=k/3;p=root.lerp(tip,s)+Vector((0,0,.055*math.sin(s*math.pi)))
                width=.035*math.sin(s*math.pi)+.001
                vv.extend([p-direction*width,p+direction*width]);uu.extend([(s,0),(s,1)])
                if k:ff.append((k*2-2,k*2-1,k*2+1,k*2))
            key='palm-dry-leaf' if dry else ('palm-leaf-light' if (frond+leaf)%4==0 else 'palm-leaf')
            groups[key].append(mesh('Tapered leaflet',vv,ff,materials[key],uu))
for i in range(6):
    a=i*2.4;bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.14,location=crown+Vector((.22*math.cos(a),.22*math.sin(a),-.2-i*.025)))
    o=bpy.context.object;o.scale.z=1.25;o.data.materials.append(materials['palm-coconut']);groups['palm-coconut'].append(o)
palm=[join(parts,key) for key,parts in groups.items()]
export(palm,'blender-coconut-palm.glb')
bpy.ops.wm.save_as_mainfile(filepath=str(EDIT/'beach-expansion.blend'))
# Render a daylight palm study; the editable file includes hidden tools and kit.
bpy.ops.mesh.primitive_plane_add(size=100);ground=bpy.context.object;ground.data.materials.append(sand)
bpy.ops.object.light_add(type='AREA',location=(-4,-5,12));light=bpy.context.object;light.data.energy=2200;light.data.size=6
light.rotation_euler=(Vector((0,0,4))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(11,-17,10));camera=bpy.context.object
camera.rotation_euler=(Vector((.5,0,4))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=11
scene=bpy.context.scene;scene.camera=camera;scene.world=bpy.data.worlds.new('Daylight');scene.world.color=(.3,.35,.4)
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.filepath=str(ART/'blender-palm-study.png');bpy.ops.render.render(write_still=True)
report={}
for label,objects in [('palm',palm),('shovel',shovel),('bucket',bucket),('moulds',kit),('collectibles',collect)]:
    count=0
    for o in objects:o.data.calc_loop_triangles();count+=len(o.data.loop_triangles)
    report[label]={'meshes':len(objects),'triangles':count}
print('BEACH_EXPANSION '+json.dumps(report))
