import {Suspense, useEffect, useMemo, useRef, Component} from 'react';
import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {ContactShadows, Environment, Lightformer, OrbitControls, useGLTF} from '@react-three/drei';
import {AnimationMixer, LoopOnce, MathUtils, Vector3} from 'three';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';

const smooth=u=>{const x=MathUtils.clamp(u,0,1);return x*x*x*(x*(x*6-15)+10);};
const assemblySlots={
  Torso:[0,.9,[0,-.65,0]],
  '2EN APPS badge on chest':[1.02,.82,[0,0,1.45]],
  LegL:[1.94,.72,[-.7,-1.15,0]],
  LegR:[2.76,.72,[.7,-1.15,0]],
  ArmL:[3.58,.72,[-1.45,.16,0]],
  ArmR:[4.4,.72,[1.45,.16,0]],
  'Scarf collar':[5.22,.47,[0,.68,0]],
  'Scarf upper fold':[5.78,.47,[0,.75,0]],
  'Scarf tail':[6.34,.62,[.55,.2,.65]],
  HeadPivot:[7.07,1.02,[0,1.5,0]],
};
const WALK_SECONDS=3.6;
const TURN_SECONDS=1.08;

function Model({gesture, player, speaking=false, onLoaded, sequence, onSequenceComplete}) {
  const gltf = useGLTF('/models/aiman.glb');
  const scene = useMemo(() => clone(gltf.scene), [gltf.scene]);
  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);
  const active = useRef(null);
  const world = useRef(null);
  const blink = useRef({next: 2.5, start: -10});
  const face = useMemo(() => {
    const meshes = []; scene.traverse(o => { if (o.morphTargetDictionary) meshes.push(o); }); return meshes;
  }, [scene]);
  const assembly = useMemo(() => {
    const body=scene.getObjectByName('BodyPivot');
    return (body?.children||[]).map(part=>{
      const [delay,duration,spread]=assemblySlots[part.name]||[0,.9,[0,-.65,0]];
      const isBadge=part.name==='2EN APPS badge on chest';
      if(isBadge){part.material=part.material.clone();part.material.transparent=true;}
      return {part,position:part.position.clone(),scale:part.scale.clone(),rotation:part.rotation.clone(),delay,duration,offset:new Vector3(...spread),isBadge};
    });
  },[scene]);
  const sequenceStart=useRef(null),complete=useRef(false),yawFrom=useRef(0),lastSequence=useRef(sequence);
  useEffect(() => {
    scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    onLoaded(gltf.animations.map(a => a.name));
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(scene); };
  }, [scene, mixer, gltf.animations, onLoaded]);
  useEffect(() => {
    if (!gesture) return;
    if (gesture.name === 'Blink') { blink.current.start = -1; return; }
    const clip = gltf.animations.find(a => a.name === gesture.name);
    if (!clip) return;
    if (active.current) active.current.stop();
    const action = mixer.clipAction(clip); active.current = action;
    action.reset().setLoop(LoopOnce, 1); action.clampWhenFinished = false; action.play();
  }, [gesture, gltf.animations, mixer]);
  useFrame(({clock}, dt) => {
    const t = clock.elapsedTime;
    // Capture the previous rendered orientation in the same frame as the phase
    // change. A passive effect can run after a frame and snap the turn to its end.
    if(lastSequence.current!==sequence){
      yawFrom.current=world.current?.rotation.y??0;
      sequenceStart.current=t;
      complete.current=false;
      lastSequence.current=sequence;
    }
    if(sequenceStart.current===null)sequenceStart.current=t;
    const motionTime=t-sequenceStart.current;
    const turning=sequence==='turnRight'||sequence==='turnFront';
    const targetYaw=sequence==='turnRight'||sequence==='walk'?Math.PI/2:0;
    const bodyTurn=turning?smooth(motionTime/TURN_SECONDS):0;
    const headTurn=turning?smooth(motionTime/.76):0;
    const bodyYaw=turning?MathUtils.lerp(yawFrom.current,targetYaw,bodyTurn):targetYaw;
    const turnArc=turning?Math.sin(Math.PI*bodyTurn):0;
    const turnDirection=Math.sign(targetYaw-yawFrom.current);
    if(world.current){
      world.current.rotation.y=bodyYaw;
      world.current.rotation.x=0;world.current.rotation.z=0;
      world.current.position.set(0,0,0);
    }
    if(sequence==='assemble'){
      const elapsed=t-sequenceStart.current;
      for(const {part,position,scale,rotation,delay,duration,offset,isBadge} of assembly){
        const eased=smooth((elapsed-delay)/duration);
        part.visible=elapsed>=delay;
        part.position.copy(position).addScaledVector(offset,1-eased);
        part.scale.copy(scale).multiplyScalar(isBadge ? .55+.45*eased : .001+.999*eased);
        part.rotation.copy(rotation);
        if(isBadge)part.material.opacity=smooth((elapsed-delay)/.22);
      }
      if(elapsed>8.13&&!complete.current){complete.current=true;onSequenceComplete?.();}
    }else if(sequence==='walk'){
      const phase=motionTime*Math.PI*2*1.45;
      const strength=smooth(motionTime/.38)*smooth((WALK_SECONDS-motionTime)/.52);
      for(const {part,position,scale,rotation,isBadge} of assembly){
        part.visible=true;part.position.copy(position);part.scale.copy(scale);part.rotation.copy(rotation);
        if(isBadge)part.material.opacity=1;
        if(part.name==='LegL'||part.name==='LegR'){
          const step=phase+(part.name==='LegR'?Math.PI:0);
          part.rotation.x+=Math.sin(step)*.31*strength;
          part.position.y+=Math.max(0,Math.cos(step))*.085*strength;
        }
        if(part.name==='ArmL')part.rotation.x-=Math.sin(phase)*.22*strength;
        if(part.name==='ArmR')part.rotation.x+=Math.sin(phase)*.22*strength;
        if(part.name==='HeadPivot')part.rotation.x-=.018*strength;
      }
      if(world.current){
        world.current.position.y=(1-Math.cos(2*phase))*.013*strength;
        world.current.position.z=Math.sin(phase)*.015*strength;
        world.current.rotation.x=.028*strength;
        world.current.rotation.z=Math.sin(phase)*.012*strength;
      }
    }else if(assembly.length){
      for(const {part,position,scale,rotation,isBadge} of assembly){
        part.visible=true;part.position.copy(position);part.scale.copy(scale);part.rotation.copy(rotation);if(isBadge)part.material.opacity=1;
        if(part.name==='HeadPivot'){
          if(turning){
            const headYaw=MathUtils.lerp(yawFrom.current,targetYaw,headTurn);
            part.rotation.y+=MathUtils.clamp(headYaw-bodyYaw,-.34,.34);
            part.rotation.z-=turnDirection*turnArc*.025;
          }else if(sequence==='happy'||speaking){
            part.rotation.z+=Math.sin(t*1.8)*.028;
            part.rotation.x+=Math.sin(t*2.5)*.012;
          }
        }
        if(turning&&(part.name==='ArmL'||part.name==='ArmR'))part.rotation.x+=turnArc*(part.name==='ArmL'?-.055:.055);
        if(speaking&&!turning&&(part.name==='ArmL'||part.name==='ArmR'))part.rotation.x+=Math.sin(t*3.2+(part.name==='ArmL'?0:Math.PI))*.045;
      }
      if(turning&&world.current){
        world.current.position.y=-turnArc*.018;
        world.current.rotation.z=-turnDirection*turnArc*.022;
      }
      if((sequence==='happy'||speaking)&&world.current&&!turning){
        world.current.position.y=Math.sin(t*2.1)*.016;
        world.current.rotation.z=Math.sin(t*1.6)*.012;
      }
    }
    // Apply named Blender gestures after restoring the neutral part poses.
    mixer.update(Math.min(dt, .05));
    if (t > blink.current.next || blink.current.start === -1) {
      blink.current.start = t; blink.current.next = t + (speaking?2:3) + Math.random() * (speaking?1.5:3);
    }
    const elapsed = t - blink.current.start;
    const amount = elapsed < .22 ? 1 - .94 * Math.sin(Math.PI * elapsed / .22) : 1;
    const level = player.current?.level() || 0;
    face.forEach(mesh => {
      const blinkIndex = mesh.morphTargetDictionary.Blink;
      const talkIndex = mesh.morphTargetDictionary.Talk;
      if (blinkIndex !== undefined) mesh.morphTargetInfluences[blinkIndex] = 1 - amount;
      if (talkIndex !== undefined) {
        const smile=speaking ? .26 : .42;
        mesh.morphTargetInfluences[talkIndex] = MathUtils.damp(mesh.morphTargetInfluences[talkIndex], smile - Math.min(smile-.03, level*.65), 22, dt);
      }
    });
  });
  return <group ref={world}><primitive object={scene}/></group>;
}

function Controls({resetKey}) {
  const camera = useThree(state => state.camera);
  const ref = useRef();
  useEffect(() => {
    camera.position.set(0, 1.85, 7.5);
    if (ref.current) { ref.current.target.set(0, 1.85, 0); ref.current.update(); }
  }, [camera, resetKey]);
  return <OrbitControls ref={ref} makeDefault target={[0, 1.85, 0]} minDistance={6.5} maxDistance={10} minPolarAngle={.3} maxPolarAngle={Math.PI / 2} enablePan={false}/>;
}

function FixedCamera(){
  const camera=useThree(state=>state.camera);
  useEffect(()=>{camera.lookAt(0,1.85,0);camera.updateProjectionMatrix();},[camera]);
  return null;
}

class ModelBoundary extends Component {
  state = {error: false};
  static getDerivedStateFromError() { return {error: true}; }
  render() { return this.state.error ? <div className="model-error">The 3D model could not load. Refresh to try again.</div> : this.props.children; }
}
export default function Robot({gesture, player, speaking=false, onLoaded, resetKey, sequence, onSequenceComplete, interactive=true}) {
  return <ModelBoundary><Canvas shadows dpr={[1, 1.75]} camera={{position: [0, 1.85, 7.5], fov: 34}} gl={{antialias: true, alpha: true}}>
    <ambientLight intensity={.6}/>
    <directionalLight position={[-3, 5, 5]} intensity={2.5} castShadow shadow-mapSize={[2048, 2048]}/>
    <directionalLight position={[4, 3, -3]} intensity={2} color="#c6e5ff"/>
    <Suspense fallback={null}>
      <Model gesture={gesture} player={player} speaking={speaking} onLoaded={onLoaded} sequence={sequence} onSequenceComplete={onSequenceComplete}/>
      <Environment resolution={128}>
        <Lightformer position={[-4, 4, 3]} scale={[4, 6, 1]} intensity={2}/>
        <Lightformer position={[4, 3, 2]} scale={[3, 5, 1]} intensity={1.5}/>
        <Lightformer position={[0, 5, -4]} scale={5} intensity={2}/>
      </Environment>
      <ContactShadows position={[0, -.055, 0]} opacity={.35} scale={9} blur={2.5} far={5} resolution={512}/>
    </Suspense>
    {interactive?<Controls resetKey={resetKey}/>:<FixedCamera/>}
  </Canvas></ModelBoundary>;
}
