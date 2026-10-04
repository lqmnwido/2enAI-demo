import {Suspense,useEffect,useRef} from 'react';
import {Canvas,useFrame} from '@react-three/fiber';
import {useGLTF} from '@react-three/drei';
import {ArrowRight} from 'lucide-react';
import Robot from './Robot';

function Emblem(){
 const {scene}=useGLTF('/branding/2en-apps-3d.glb');
 const ref=useRef();
 useFrame(({clock})=>{if(ref.current)ref.current.position.y=Math.sin(clock.elapsedTime*1.15)*.035;});
 return <group ref={ref}><primitive object={scene}/></group>;
}

export default function BrandIntro({phase,onStart,onAssembled,onFinish,onPhaseChange,onReplayGreeting,greetingPlayed,ai}){
 useEffect(()=>{
  const timing={shrinking:1250,turning:1120,walking:3600,turningBack:1120};
  if(!(phase in timing))return;
  const id=setTimeout(()=>phase==='shrinking'?onPhaseChange('turning'):phase==='turning'?onPhaseChange('walking'):phase==='walking'?onPhaseChange('turningBack'):onFinish(),timing[phase]);
  return()=>clearTimeout(id);
 },[phase,onFinish,onPhaseChange]);
 return <div className={'brand-intro phase-'+phase} aria-label="Pembukaan 2enAI">
  <div className="intro-backdrop"/><div className="intro-ambient intro-ambient-a"/><div className="intro-ambient intro-ambient-b"/>
  {phase==='logo'?<div className="intro-logo-view"><button type="button" className="intro-logo-canvas" aria-label="Klik logo 2enAI untuk memasang AIMAN" onClick={onStart}><Canvas camera={{position:[0,0,4.6],fov:33}} dpr={[1,1.8]} gl={{alpha:true,antialias:true}}><ambientLight intensity={1.35}/><directionalLight position={[-3,-3,5]} intensity={3}/><directionalLight position={[3,2,-2]} intensity={1.8} color="#5abaff"/><Suspense fallback={null}><Emblem/></Suspense></Canvas></button><div className="intro-logo-content"><p className="intro-kicker">2EN APPS</p><h1>2enAI<span>Enterprise AI Solutions</span></h1><p className="intro-copy">AI Assistant. Smart Automation. Predictive Insights. Secure Integration.</p><button className="intro-enter" onClick={onStart}>Temui AIMAN <ArrowRight size={18}/></button></div></div>:
   <><div className="intro-robot-stage"><Robot gesture={phase==='greeting'?{name:'Wave',id:1}:null} player={ai.player} speaking={phase==='greeting'} onLoaded={()=>{}} resetKey={0} interactive={false} sequence={phase==='assembling'?'assemble':phase==='greeting'?'happy':phase==='turning'?'turnRight':phase==='walking'?'walk':phase==='turningBack'?'turnFront':null} onSequenceComplete={onAssembled}/></div><div className="intro-status" aria-live="polite">{phase==='assembling'?<><span>MEMASANG AIMAN</span><strong>Setiap bahagian disatukan.</strong></>:phase==='greeting'?<><span>AIMAN SEDIA</span><strong>Hai, saya Aiman. AI Assistant anda!</strong>{greetingPlayed===false&&<div className="intro-replay"><button onClick={onReplayGreeting}>Dengar salam AIMAN</button><button onClick={onFinish}>Teruskan</button></div>}</>:<><span>SILA TERUSKAN</span><strong>AIMAN kini di ruang sembang.</strong></>}</div></>}
 </div>;
}
