"""Build a bevelled 3D mesh from the user's 2EN APPS artwork contours."""
import bpy, json, math, os
from mathutils import Vector

BASE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(BASE,'blender','2en_apps_contours.json'),encoding='utf8') as source:
    artwork=json.load(source)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

ink=bpy.data.materials.new('2EN APPS navy enamel');ink.diffuse_color=(.025,.11,.25,1);ink.use_nodes=True
p=next(n for n in ink.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
p.inputs['Base Color'].default_value=(.025,.11,.25,1)
p.inputs['Metallic'].default_value=.15;p.inputs['Roughness'].default_value=.31
p.inputs['Coat Weight'].default_value=.26

# Keeping all loops on one filled curve preserves the letter counters and hexagon opening.
curve=bpy.data.curves.new('2EN APPS vector geometry','CURVE')
curve.dimensions='2D';curve.fill_mode='BOTH';curve.resolution_u=1
curve.extrude=.055;curve.bevel_depth=.009;curve.bevel_resolution=3
for contour in artwork['contours']:
    pts=contour['points']
    spline=curve.splines.new('POLY');spline.points.add(len(pts)-1)
    for vertex,(x,y) in zip(spline.points,pts):
        vertex.co=((x/artwork['width']-.5)*2,(.5-y/artwork['height'])*2,0,1)
    spline.use_cyclic_u=True
curve.materials.append(ink)
logo=bpy.data.objects.new('2EN APPS solid emblem',curve)
bpy.context.collection.objects.link(logo)
logo.rotation_euler=(math.pi/2,0,0)
bpy.ops.object.select_all(action='DESELECT');logo.select_set(True);bpy.context.view_layer.objects.active=logo
bpy.ops.export_scene.gltf(filepath=os.path.join(BASE,'public','branding','2en-apps-3d.glb'),export_format='GLB',use_selection=True,export_animations=False)

light=bpy.data.objects.new('Key',bpy.data.lights.new('Key','AREA'));bpy.context.collection.objects.link(light)
light.location=(-3,-4,5);light.data.energy=500;light.data.size=4
fill=bpy.data.objects.new('Fill',bpy.data.lights.new('Fill','AREA'));bpy.context.collection.objects.link(fill)
fill.location=(3,1,3);fill.data.energy=300;fill.data.size=3
cam=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera'));bpy.context.collection.objects.link(cam)
cam.location=(0,-5,0);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=2.65
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=48
scene.cycles.use_denoising=True;scene.render.film_transparent=True
scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.filepath=os.path.join(BASE,'public','branding','2en-apps-3d.png')
bpy.ops.render.render(write_still=True)
print('2EN APPS 3D logo exported')
