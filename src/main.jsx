import React,{useEffect,useState,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {FilePenLine,Languages,ArrowRight} from 'lucide-react';
import ArchivePage from './ArchivePage';
import JawiPage from './JawiPage';
import ComplaintPage from './ComplaintPage';
import Assistant from './Assistant';
import BrandIntro from './BrandIntro';
import PortalHome from './PortalHome';
import {useAiman} from './useAiman';
import './tokens.css';
import './style.css';

const pages={home:{label:'2enAI',title:'Enterprise AI Solutions',subtitle:'AI Assistant. Smart Automation. Predictive Insights. Secure Integration.',crumb:'Penyelesaian AI'},arkib:{label:'Carian Arkib',title:'Penyelidikan arkib,\ndengan bukti yang boleh disemak.',subtitle:'Tanya AIMAN dan semak sumber Arkib Negara Malaysia yang tersimpan setempat.',crumb:'Penyelidikan arkib'},jawi:{label:'Jawi & Tulisan Tangan',icon:Languages,title:'Tulisan lama,\nmakna baharu.',subtitle:'Semak bacaan Jawi bercetak pada imej asal. Padanan Rumi, Bahasa Melayu dan English dipaparkan apabila disahkan.',crumb:'Jawi & tulisan tangan'},aduan:{label:'e-Aduan',icon:FilePenLine,title:'Bantuan menyediakan\ndraf aduan.',subtitle:'Ceritakan masalah anda dalam Bahasa Melayu. AIMAN membantu menyusun analisis aduan yang boleh anda semak dan eksport.',crumb:'e-Aduan'}};
function App(){
 const fromHash=()=>pages[location.hash.slice(1)]?location.hash.slice(1):'home';
 const [page,setPage]=useState(fromHash),[open,setOpen]=useState(false),[intro,setIntro]=useState('logo'),[greetingPlayed,setGreetingPlayed]=useState(null);
 const navigate=next=>{if(!pages[next])return;const change=()=>{setPage(next);location.hash=next;window.scrollTo({top:0,behavior:'smooth'});};if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.startViewTransition(change);else change();};
 const ai=useAiman(navigate);
 const finishIntro=useCallback(()=>setIntro('done'),[]);
 const playGreeting=useCallback(async()=>{const played=await ai.greet();setGreetingPlayed(played);if(played)setTimeout(()=>setIntro(v=>v==='greeting'?'shrinking':v),500);},[ai.greet]);
 const assembled=useCallback(()=>{setIntro('greeting');playGreeting();},[playGreeting]);
 useEffect(()=>{const onHash=()=>setPage(fromHash());window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash);},[]);
 const ask=q=>{setOpen(true);ai.send(q);};
 const meta=pages[page];
 return <div className="portal-shell"><a href="#main-content" className="skip-link">Langkau ke kandungan</a><div className="gov-strip"><div className="content-container"><span>2ENAI · ENTERPRISE AI SOLUTIONS</span><span>Qwen tempatan · Sumber arkib setempat</span></div></div>
  <header className="portal-header"><div className="content-container header-inner"><a className="portal-brand" href="#home" onClick={e=>{e.preventDefault();navigate('home');}}><img src="/branding/2en-apps-3d.png" alt=""/><span><strong>2enAI</strong><small>Enterprise AI Solutions</small></span></a><nav aria-label="Navigasi utama">{Object.entries(pages).filter(([key])=>key==='jawi'||key==='aduan').map(([key,item])=>{const Icon=item.icon;return <button key={key} onClick={()=>navigate(key)} className={page===key?'active':''} aria-current={page===key?'page':undefined}><Icon size={16}/>{item.label}</button>;})}</nav></div></header>
  <div className={'portal-hero '+(page==='home'?'home-hero':'')}><div className="content-container"><div className="breadcrumb">2ENAI <ArrowRight size={12}/> {meta.crumb.toUpperCase()}</div><div className="hero-content"><div><div className="hero-eyebrow">AI ASSISTANT · SMART AUTOMATION · PREDICTIVE INSIGHTS · SECURE INTEGRATION</div><h1>{meta.title}</h1><p>{meta.subtitle}</p></div><div className="hero-mark"><img src="/branding/2en-apps-3d.png" alt=""/><span>2EN APPS</span></div></div></div></div>
  <main id="main-content" key={page} className="portal-main">{page==='home'?<PortalHome navigate={navigate} openAssistant={()=>setOpen(true)}/>:page==='arkib'?<ArchivePage ask={ask} navigate={navigate}/>:page==='jawi'?<JawiPage/>:<ComplaintPage ai={ai} onResult={()=>ai.presentComplaint()}/>}</main>
  <footer className="portal-footer"><div className="content-container"><div><strong>2enAI · Enterprise AI Solutions</strong><p>Perkhidmatan AI tempatan oleh 2EN APPS. Sumber awam Arkib Negara Malaysia disimpan setempat untuk semakan.</p></div><div><span>PERKHIDMATAN</span><span>e-Aduan</span><span>Jawi & tulisan tangan</span></div><small>© 2026 2EN APPS · Prototaip tempatan</small></div></footer>
  {intro==='done'&&<Assistant ai={ai} open={open} setOpen={setOpen}/>}
  {intro!=='done'&&<BrandIntro phase={intro} onStart={()=>setIntro('assembling')} onAssembled={assembled} onFinish={finishIntro} onPhaseChange={setIntro} onReplayGreeting={playGreeting} greetingPlayed={greetingPlayed} ai={ai}/>}
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
