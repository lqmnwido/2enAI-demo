"""Face graphics are thin conformal meshes; morphs stay on the head surface."""
import math
import bpy

def surface_y(x, z):
    # Analytic front surface of the exact superellipsoid used for Head shell.
    latitude = max(0.0, 1.0 - abs((z - .22) / .93) ** (2 / .74))
    return -.68 * max(0.0, latitude ** (.74 / .8) - abs(x / 1.04) ** (2 / .8)) ** (.8 / 2)

def build_face(head, glass, navy, cyan, cheek, mouthmat, pink):
    def make(name, points, faces, material, depth=.007):
        data = bpy.data.meshes.new(name)
        data.from_pydata([(x, surface_y(x,z)-depth, z) for x,z in points], [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(obj)
        obj.parent = head; data.materials.append(material)
        for face in data.polygons: face.use_smooth = True
        return obj
    def ellipse(name, a, b, cx, cz, material, depth, exponent=1):
        # Concentric rings keep even small graphics curved with the glass.
        points=[(cx,cz)];faces=[];n=96;rings=14
        power=lambda x,e: math.copysign(abs(x)**e,x)
        for j in range(1,rings+1):
            r=j/rings
            for i in range(n):
                t=2*math.pi*i/n
                points.append((cx+a*r*power(math.cos(t),exponent),cz+b*r*power(math.sin(t),exponent)))
        for i in range(n):faces.append((0,1+i,1+(i+1)%n))
        for j in range(rings-1):
            for i in range(n):
                a0=1+j*n+i;b0=1+j*n+(i+1)%n;faces.append((a0,a0+n,b0+n,b0))
        return make(name,points,faces,material,depth)
    ellipse('Visor gasket',.91,.67,0,.19,navy,.003,.62)
    ellipse('Face glass',.88,.635,0,.19,glass,.006,.62)
    morphs=[]
    def morph(obj, name, anchor, compression, depth):
        obj.shape_key_add(name='Basis')
        key=obj.shape_key_add(name=name)
        for v in key.data:
            v.co.z=anchor+(v.co.z-anchor)*compression
            v.co.y=surface_y(v.co.x,v.co.z)-depth
        morphs.append((obj,name))
    for side in [-1,1]:
        points=[];faces=[];cx=side*.43;cz=.19;n=64
        for i in range(n+1):
            t=math.pi*i/n
            for radius in [-.034,.034]:
                points.append((cx+(.175+radius)*math.cos(t),cz+(.16+radius)*math.sin(t)))
        for i in range(n):a=2*i;faces.append((a,a+1,a+3,a+2))
        eye=make('EyeL' if side<0 else 'EyeR',points,faces,cyan,.009)
        morph(eye,'Blink',cz,.04,.009)
        # Rounded ends have their own conforming morph targets.
        for end in [-1,1]:
            cap=ellipse('Eye cap',.034,.034,cx+end*.175,cz,cyan,.009)
            morph(cap,'Blink',cz,.04,.009)
        ellipse('Cheek',.085,.038,side*.56,-.035,cheek,.009)
    # All vertices of both open and closed mouths touch the same lens surface.
    outline=[(-.165+.33*i/24,-.12-.018+.018*math.cos(2*math.pi*i/24)) for i in range(25)]
    outline += [(.165*math.cos(math.pi*i/40),-.12-.17*math.sin(math.pi*i/40)) for i in range(41)]
    points=[(0,-.19)]+outline;faces=[(0,1+i,1+(i+1)%len(outline)) for i in range(len(outline))]
    mouth=make('Smile opening',points,faces,mouthmat,.009)
    morph(mouth,'Talk',-.12,.12,.009)
    tongue=ellipse('Tongue',.12,.052,0,-.238,pink,.0105)
    morph(tongue,'Talk',-.12,.12,.0105)
    return morphs
