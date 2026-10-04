"""Blender 5.2: reproducible AIMAN mesh, named animation clips, GLB and studio renders.
Run: blender --background --python blender/build_robot.py
Coordinate convention: Z up, front = negative Y. Units = metres.
"""
import bpy, math, os, json
from mathutils import Vector
from math import sin, cos, pi

BASE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(BASE,'public','models'),exist_ok=True)
os.makedirs(os.path.join(BASE,'renders'),exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.actions): bpy.data.actions.remove(d)

def mat(name,color,metal=0,rough=.3,emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    p.inputs['Coat Weight'].default_value=.15
    if emission: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    return m
white=mat('Pearl ceramic',(.88,.87,.91),.04,.34)
blue=mat('Cobalt blue',(.008,.085,.52),.12,.3)
navy=mat('Midnight joints',(.015,.036,.11),.35,.27)
glass=mat('Obsidian face display',(.003,.007,.028),.12,.24)
cyan=mat('Cyan light',(.005,.60,1),.05,.32,1.6)
brand=mat('2EN APPS navy enamel',(.004,.025,.07),.08,.42)
cheek=mat('Blue cheek light',(.01,.23,.9),.1,.28,.9)
pink=mat('Coral tongue',(1,.09,.2),0,.5,0)
mouthmat=mat('Mouth interior',(.075,.003,.009),0,.5)
silver=mat('Panel silver',(.51,.54,.62),.35,.4)

def parent(o,p): o.parent=p; return o
def empty(name,loc,p=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.location=loc
    if p: parent(o,p)
    return o
root=empty('RobotRoot',(0,0,0))
body=empty('BodyPivot',(0,0,.88),root)
head=empty('HeadPivot',(0,0,1.34),body)

def finish(o,name,m,p=None):
    o.name=name; o.data.materials.append(m)
    if p: parent(o,p)
    for f in o.data.polygons: f.use_smooth=True
    return o
def sphere(name,loc,scale,m,p=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=32,location=(0,0,0))
    o=bpy.context.object; o.location=loc; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,m,p)
def mesh(name,verts,faces,m,p):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);return finish(o,name,m,p)
def power(a,e): return math.copysign(abs(a)**e,a)
def superellipsoid(name,loc,scale,e1,e2,m,p):
    vs=[];fs=[];n=96;k=48
    for j in range(k+1):
        v=-pi/2+pi*j/k
        for i in range(n):
            u=2*pi*i/n
            vs.append((scale[0]*power(cos(v),e1)*power(cos(u),e2),scale[1]*power(cos(v),e1)*power(sin(u),e2),scale[2]*power(sin(v),e1)))
    for j in range(k):
        for i in range(n):
            a=j*n+i;b=j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
    o=mesh(name,vs,fs,m,p);o.location=loc;return o
def tube(name,pts,r,m,p,cyclic=False):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=16;c.bevel_depth=r;c.bevel_resolution=5
    s=c.splines.new('POLY');s.points.add(len(pts)-1)
    for v,co in zip(s.points,pts):v.co=(*co,1)
    s.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(m);parent(o,p)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
    return o
def torus(name,loc,major,minor,m,p,rotation=(0,0,0),scale=(1,1,1)):
    bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=16,major_radius=major,minor_radius=minor)
    o=bpy.context.object;o.location=loc;o.rotation_euler=rotation;o.scale=scale;return finish(o,name,m,p)
def cylinder(name,loc,r,depth,m,p,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=r,depth=depth)
    o=bpy.context.object;o.location=loc;o.rotation_euler=rot
    bevel=o.modifiers.new('Soft machined edge','BEVEL');bevel.width=.035;bevel.segments=4
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name)
    return finish(o,name,m,p)

superellipsoid('Torso',(0,0,0),(.64,.43,.67),.78,.85,white,body)
superellipsoid('Head shell',(0,0,.22),(1.04,.68,.93),.74,.8,white,head)

# The lens and graphics share the head's actual surface, including their morphs.
import sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from face_surface import build_face
face_morphs=build_face(head,glass,navy,cyan,cheek,mouthmat,pink)
for side in [-1,1]:
    x=side*1.015
    cylinder('Ear mount', (x,0,.17),.37,.14,navy,head,(0,pi/2,0))
    cylinder('Ear cobalt casing',(x+side*.075,0,.17),.326,.14,blue,head,(0,pi/2,0))
    torus('Ear light ring',(x+side*.155,0,.17),.259,.025,cyan,head,(0,pi/2,0))
    cylinder('Ear inset',(x+side*.15,0,.17),.23,.035,navy,head,(0,pi/2,0))

# Twisted leaf crest with an inset luminous vein.
def leaf(name,m,p,inset=False):
    vs=[];fs=[];rows=32;cols=16
    for j in range(rows+1):
        t=j/rows
        width=.29*sin(pi*t)**.85*(.7+.3*t)
        for i in range(cols+1):
            u=-1+2*i/cols
            x=-.19+.55*t-.075*sin(pi*t)+width*u
            y=.025+.05*t+.15*(1-u*u)*sin(pi*t)
            z=1.03+.55*t+.09*(1-u*u)*sin(pi*t)
            vs.append((x,y,z))
    for j in range(rows):
        for i in range(cols):a=j*(cols+1)+i;fs.append((a,a+1,a+cols+2,a+cols+1))
    o=mesh(name,vs,fs,m,p);s=o.modifiers.new('Leaf shell','SOLIDIFY');s.thickness=.045
    su=o.modifiers.new('Polished leaf','SUBSURF');su.levels=2
    return o
leaf('Leaf crest',white,head)
tube('Crest blue inlay',[(-.12+.47*t+.075*sin(2*pi*(t-.2)),-.003,1.06+.48*t) for t in [i/48 for i in range(49)]],.026,blue,head)
tube('Crest cyan vein',[(-.12+.47*t+.075*sin(2*pi*(t-.2)),-.025,1.06+.48*t) for t in [i/48 for i in range(49)]],.012,cyan,head)

torus('Scarf collar',(0,0,.66),.405,.105,blue,body,scale=(1.22,1,.75))
torus('Scarf upper fold',(0,0,.725),.407,.055,blue,body,scale=(1.23,1,.7))
# Broad fabric tail swept around the back, not a cylindrical cord.
vs=[];fs=[]
for j in range(33):
    t=j/32;x=.13+.67*t;y=.4+.20*sin(pi*t);z=.68-.42*t
    w=.16*sin(pi*(.16+.84*t))+.025
    for i in range(9):
        u=-1+2*i/8;vs.append((x,y+.06*(1-u*u),z+u*w))
for j in range(32):
    for i in range(8):a=j*9+i;fs.append((a,a+1,a+10,a+9))
scarf=mesh('Scarf tail',vs,fs,blue,body);scarf.modifiers.new('Fabric thickness','SOLIDIFY').thickness=.055
scarf.modifiers.new('Soft fabric','SUBSURF').levels=2

arms=[]
for side in [-1,1]:
    arm=empty('ArmL' if side<0 else 'ArmR',(side*.61,0,.38),body);arms.append(arm)
    arm.rotation_euler[1]=side*-.35
    sphere('Shoulder socket',(0,0,0),(.215,.235,.22),navy,arm)
    torus('Shoulder rim',(0,0,-.045),.19,.033,white,arm)
    superellipsoid('Arm ceramic',(0,0,-.26),(.19,.205,.32),.8,1,white,arm)
    cylinder('Wrist band',(0,0,-.49),.165,.08,navy,arm)
    sphere('Blue mitten',(0,-.015,-.555),(.177,.205,.19),blue,arm)
    leg=empty('LegL' if side<0 else 'LegR',(side*.345,0,-.50),body)
    sphere('Hip joint',(0,0,.02),(.24,.27,.20),navy,leg)
    superellipsoid('Leg shell',(0,0,-.13),(.224,.25,.27),.72,.8,white,leg)
    superellipsoid('Blue boot',(0,-.085,-.29),(.233,.32,.145),.65,.72,blue,leg)
    superellipsoid('Boot sole',(0,-.065,-.375),(.218,.30,.043),.65,.72,navy,leg)

def emblem(p,y,z,size,back=False):
    with open(os.path.join(BASE,'blender','2en_apps_contours.json'),encoding='utf8') as source:
        artwork=json.load(source)
    curve=bpy.data.curves.new('2EN APPS badge contours','CURVE')
    curve.dimensions='2D';curve.fill_mode='BOTH';curve.resolution_u=1
    curve.extrude=.009;curve.bevel_depth=.002;curve.bevel_resolution=3
    for contour in artwork['contours']:
        pts=contour['points'];s=curve.splines.new('POLY');s.points.add(len(pts)-1)
        for v,(px,py) in zip(s.points,pts):
            v.co=((px/artwork['width']-.5)*size,(.5-py/artwork['height'])*size,0,1)
        s.use_cyclic_u=True
    o=bpy.data.objects.new('2EN APPS badge on '+('head' if back else 'chest'),curve)
    bpy.context.collection.objects.link(o);o.location=(0,y,z)
    # Rear view reverses X but keeps the artwork upright on the head shell.
    o.rotation_euler=(pi/2,0,pi if back else 0)
    o.data.materials.append(brand);parent(o,p)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
    bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    # Conform both badge faces to the shell, sinking the base into the ceramic.
    import bmesh
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=4,use_grid_fill=True)
    bm.to_mesh(o.data);bm.free()
    bpy.context.view_layer.update();transform=o.matrix_basis.copy()
    side=1 if back else -1
    a,b,c,e1,e2,center=(1.04,.68,.93,.74,.8,.22) if back else (.64,.43,.67,.78,.85,0)
    for vert in o.data.vertices:
        co=transform@vert.co
        latitude=max(0,1-abs((co.z-center)/c)**(2/e1))
        surface=side*b*max(0,latitude**(e1/e2)-abs(co.x/a)**(2/e2))**(e2/2)
        depth=.007+side*(co.y-y)
        co.y=surface+side*depth;vert.co=co
    o.location=(0,0,0);o.rotation_euler=(0,0,0)
emblem(body,-.445,.17,.62)
emblem(head,.686,.24,.82,True)
superellipsoid('Back service panel',(0,.428,-.28),(.16,.018,.095),.45,.45,silver,body)
for dz in [-.025,.025]:tube('Panel vent',[(-.12,.451,-.28+dz),(.12,.451,-.28+dz)],.009,white,body)
superellipsoid('Bottom access hatch',(0,0,-.655),(.17,.25,.025),.5,.5,silver,body)

# Named NLA clips on rigid-part pivots; each exports as a single glTF animation.
rest={o.name:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in bpy.data.objects}
def reset_pose():
    for name,(loc,rot,scale) in rest.items():
        o=bpy.data.objects[name];o.location=loc;o.rotation_euler=rot;o.scale=scale
    bpy.context.view_layer.update()
def clip(o,name,path,keys):
    o.animation_data_create();o.animation_data.action=None
    for f,v in keys:
        setattr(o,path,v);o.keyframe_insert(data_path=path,frame=f)
    action=o.animation_data.action;action.name=name+'_'+o.name
    track=o.animation_data.nla_tracks.new();track.name=name
    strip=track.strips.new(name,1,action);strip.name=name
    o.animation_data.action=None;track.mute=True
    reset_pose()

restarm=[a.rotation_euler.copy() for a in arms]
clip(arms[0],'Wave','rotation_euler',[(1,(0,.35,0)),(12,(0,2.5,0)),(22,(.2,2.2,0)),(32,(-.2,2.6,0)),(42,(.2,2.2,0)),(52,(-.2,2.6,0)),(65,(0,.35,0))])
clip(root,'Jump','location',[(1,(0,0,0)),(8,(0,0,-.08)),(17,(0,0,.55)),(23,(0,0,.62)),(33,(0,0,0)),(39,(0,0,-.05)),(47,(0,0,0))])
clip(head,'Nod','rotation_euler',[(1,(0,0,0)),(12,(.25,0,0)),(24,(-.10,0,0)),(36,(.25,0,0)),(48,(0,0,0))])
clip(head,'HeadShake','rotation_euler',[(1,(0,0,0)),(12,(0,0,.32)),(24,(0,0,-.32)),(36,(0,0,.32)),(48,(0,0,-.32)),(60,(0,0,0))])
for obj,kind in face_morphs:
    keys=obj.data.shape_keys;key=keys.key_blocks[kind]
    values=[(1,0),(4,1),(7,0)] if kind=='Blink' else [(1,.6),(5,0),(10,.8),(15,.1),(20,.6)]
    for frame,value in values:
        key.value=value;key.keyframe_insert(data_path='value',frame=frame)
    action=keys.animation_data.action;action.name=kind+'_'+obj.name
    track=keys.animation_data.nla_tracks.new();track.name=kind
    track.strips.new(kind,1,action)
    keys.animation_data.action=None;track.mute=True;key.value=0
arms[0].rotation_euler=restarm[0]
for o in bpy.data.objects:
    if o.animation_data:
        for tr in o.animation_data.nla_tracks:tr.mute=True

# Apply geometry modifiers before export; preserve pivot hierarchy.
for o in list(bpy.data.objects):
    if o.type=='MESH':
        bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=65
bpy.ops.object.select_all(action='DESELECT')
def descendants(o):
    o.select_set(True)
    for c in o.children:descendants(c)
descendants(root)
for obj,kind in face_morphs:
    for tr in obj.data.shape_keys.animation_data.nla_tracks:tr.mute=False
for o in bpy.data.objects:
    if o.animation_data:
        for tr in o.animation_data.nla_tracks:tr.mute=False
bpy.ops.export_scene.gltf(filepath=os.path.join(BASE,'public','models','aiman.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_force_sampling=True)
for o in bpy.data.objects:
    if o.animation_data:
        for tr in o.animation_data.nla_tracks:tr.mute=True
for obj,kind in face_morphs:
    for tr in obj.data.shape_keys.animation_data.nla_tracks:tr.mute=True
    obj.data.shape_keys.key_blocks[kind].value=0
scene.frame_set(1)
reset_pose()
root.location=(0,0,0);head.rotation_euler=(0,0,0);arms[0].rotation_euler=restarm[0]
for n in ['EyeL','EyeR']:bpy.data.objects[n].scale=(1,1,1)

floor=mat('Studio warm grey',(.67,.68,.73),0,.75)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));bpy.context.object.data.materials.append(floor)
def aim(o,pt):o.rotation_euler=(Vector(pt)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power_,size in [('Key',(-3,-4,6),750,4),('Fill',(4,-2,4),550,3),('Rim',(1,3,5),900,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power_;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,1.7))
bpy.ops.object.camera_add(location=(4,-7,3.4));cam=bpy.context.object;aim(cam,(0,0,1.8));cam.data.type='ORTHO';cam.data.ortho_scale=4.6;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.world.color=(.32,.32,.32);scene.view_settings.view_transform='AgX'
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BASE,'blender','aiman.blend'))
for view,loc in [('hero',(4,-7,3.4)),('front',(0,-8,1.8)),('back',(0,8,1.8)),('side',(8,0,1.8))]:
    cam.location=loc;aim(cam,(0,0,1.8));scene.render.filepath=os.path.join(BASE,'renders',view+'.png');bpy.ops.render.render(write_still=True)
print('AIMAN model and renders complete')
