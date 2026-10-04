import {useEffect,useRef,useState} from 'react';
import {Mic,MicOff,FileDown,FileText,AlertCircle,RotateCcw,CheckCircle2} from 'lucide-react';

const key='aiman:eaduan:draft-v2';
const read=()=>{try{return JSON.parse(localStorage.getItem(key))||{transcript:JSON.parse(localStorage.getItem('aiman:eaduan:draft-v1')||'{}').transcript||''};}catch{return {};}};

export default function ComplaintPage({ai,onResult}){
 const [draft,setDraft]=useState(read),[loading,setLoading]=useState(false),[error,setError]=useState(''),[pdfUrl,setPdfUrl]=useState('');
 const lastUrl=useRef('');
 const transcript=draft.transcript||'',analysis=draft.analysis,asrReady=!!ai.health.services.asr;
 useEffect(()=>{localStorage.setItem(key,JSON.stringify(draft));},[draft]);
 useEffect(()=>()=>{if(lastUrl.current)URL.revokeObjectURL(lastUrl.current);},[]);
 const setTranscript=value=>{setError('');setDraft(d=>({...d,analysis:null,transcript:typeof value==='function'?value(d.transcript||''):value}));if(lastUrl.current)URL.revokeObjectURL(lastUrl.current);lastUrl.current='';setPdfUrl('');};
 const generatePdf=async result=>{
  const response=await fetch('/api/complaints/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({analysis:result,transcript})});
  if(!response.ok)throw new Error('PDF belum dapat dijana. Cuba semula.');
  const url=URL.createObjectURL(await response.blob());if(lastUrl.current)URL.revokeObjectURL(lastUrl.current);lastUrl.current=url;setPdfUrl(url);
 };
 const analyze=async()=>{
  if(!transcript.trim()||loading)return;setLoading(true);setError('');
  try{
   await ai.prepareAudio().catch(()=>{});
   const response=await fetch('/api/complaints/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Analisis gagal.');
   setDraft(d=>({...d,analysis:result}));
   await generatePdf(result);
   onResult?.(result);
  }catch(e){setError(e.message);}finally{setLoading(false);}
 };
 const download=async()=>{try{if(!pdfUrl)await generatePdf(analysis);const url=lastUrl.current;if(!url)return;const a=document.createElement('a');a.href=url;a.download='draf-analisis-e-aduan.pdf';document.body.append(a);a.click();a.remove();}catch(e){setError(e.message);}};
 return <div className="complaint-page content-container"><div className="intro-grid"><div><span className="section-kicker">PERKHIDMATAN AWAM</span><h2>e-Aduan dengan bantuan AIMAN</h2><p>Rakam atau tulis keterangan sekali. AIMAN menyusun analisis untuk semakan anda, kemudian menyediakan laporan PDF. Aduan tidak dihantar secara rasmi.</p></div><div className="complaint-info"><FileText size={20}/><strong>Draf setempat</strong><small>Maklumat disimpan pada pelayar ini. Semak fakta dan bukti sebelum menggunakannya.</small></div></div>
  {error&&<div className="notice error" role="alert"><AlertCircle size={17}/>{error}</div>}
  <div className="complaint-layout"><section className="complaint-main-card"><span className="section-kicker">KETERANGAN ADUAN</span><h3>Ceritakan apa yang berlaku</h3><p>Nyatakan perkara, masa, tempat dan pihak terlibat jika diketahui.</p>
   <div className={'complaint-voice '+(ai.mic?'active':'')}><button className="complaint-mic" type="button" aria-label={ai.mic?'Hentikan rakaman suara':ai.micPending?'Batal menunggu ASR':'Mulakan rakaman suara'} onClick={()=>ai.toggleMic(text=>setTranscript(t=>(t?t+' ':'')+text))}>{ai.mic||ai.micPending?<MicOff size={25}/>:<Mic size={25}/>}</button><div className="complaint-voice-body"><strong>{ai.mic?'Sedang mendengar suara anda':ai.micPending?'Menunggu ASR sedia':'Rakam aduan dengan suara'}</strong><span>{ai.mic?(ai.partial||'Bercakap dalam Bahasa Melayu; transkrip akan muncul di bawah.'):ai.micPending?'Mikrofon akan dibuka selepas penjanaan suara selesai.':asrReady?'Tekan mikrofon untuk mula. Suara diproses oleh Qwen ASR tempatan.':'Tekan mikrofon untuk menyemak sambungan ASR tempatan.'}</span><div className="complaint-wave" role="img" aria-label={ai.mic?'Gelombang suara langsung':'Gelombang suara menunggu rakaman'}>{ai.micLevels.map((level,i)=><i key={i} style={{height:`${Math.round(5+level*37)}px`}}/>)}</div></div><span className={'voice-indicator '+(ai.mic?'live':'')}>{ai.mic?'MERAKAM':ai.micPending?'MENUNGGU':ai.health.states?.asr==='busy'?'SIBUK':asrReady?'SEDIA':'SEMAK ASR'}</span></div>
   <label htmlFor="complaint-story">Keterangan aduan</label><textarea id="complaint-story" rows="9" maxLength="12000" value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder="Contoh: Pada 18 September di Dewan Serbaguna, kemudahan yang dijanjikan masih belum boleh digunakan…"/>
   <div className="form-actions"><button className="btn primary" onClick={analyze} disabled={!transcript.trim()||loading}>{loading?'AIMAN sedang menganalisis…':'Susun dengan AIMAN'} <RotateCcw size={15} className={loading?'spin':''}/></button>{analysis&&<button className="btn secondary" onClick={download}><FileDown size={16}/> Muat turun PDF</button>}</div><small className="help-text">Audio dihantar setiap 100 ms; Qwen bermula selepas 600 ms dan ujaran tamat selepas 400 ms senyap.</small>
   {analysis&&<div className="complaint-report" aria-live="polite"><div className="report-heading"><span className="section-kicker">HASIL AIMAN · UNTUK SEMAKAN</span><h3>{analysis.topic}</h3><p><CheckCircle2 size={16}/> PDF disediakan secara setempat. Semak semua kandungan sebelum menggunakannya.</p></div><div className="report-section"><h4>Tema</h4><p>{analysis.category||'Belum dikenal pasti'}</p>{analysis.themes?.length>0&&<div className="theme-list">{analysis.themes.map((theme,i)=><div key={i}><small>Petikan: “{theme.quote}”</small></div>)}</div>}</div><div className="report-section"><h4>5W1H</h4><dl className="wh-grid">{analysis.wh.map(item=><div key={item.question}><dt>{item.question}</dt><dd>{item.evidence||'Tidak dinyatakan'}</dd>{item.sourceQuotes?.length>0&&<small className="wh-source">Asal: “{item.sourceQuotes.join('” · “')}”</small>}</div>)}</dl></div>{(analysis.amount||analysis.parties)&&<div className="report-section"><h4>Butiran penting</h4><dl className="wh-grid">{analysis.amount&&<div><dt>Jumlah / Nilai</dt><dd>{analysis.amount}</dd></div>}{analysis.parties&&<div><dt>Pihak terlibat</dt><dd>{analysis.parties}</dd></div>}</dl></div>}{analysis.evidenceItems?.length>0&&<div className="report-section"><h4>Bukti sokongan yang disebut</h4><ul className="report-list">{analysis.evidenceItems.map((item,i)=><li key={i}>{item.description}</li>)}</ul></div>}{analysis.chronology?.length>0&&<div className="report-section"><h4>Kronologi</h4><ol className="report-list">{analysis.chronology.map((item,i)=><li key={i}>{item.event}</li>)}</ol></div>}<div className="report-section"><h4>Ringkasan</h4><p>{analysis.summary}</p></div>{analysis.missing?.length>0&&<div className="report-section"><h4>Maklumat untuk disemak</h4><p>{analysis.missing.join(', ')}</p>{analysis.followupQuestions?.length>0&&<ul className="report-list">{analysis.followupQuestions.map((question,i)=><li key={i}>{question}</li>)}</ul>}</div>}<div className="report-section"><h4>Kesimpulan</h4><p>{analysis.conclusion}</p></div><button className="btn primary" onClick={download}><FileDown size={16}/> Muat turun laporan PDF</button></div>}
  </section><aside className="complaint-side"><h3>Transkrip / cerita asal</h3><blockquote>{transcript||'Keterangan yang anda taip atau rakam akan dipaparkan di sini.'}</blockquote><div className="advice"><strong>Semakan pengadu</strong><ul><li>Pastikan masa, lokasi dan nama tepat.</li><li>Tambah bukti sokongan yang anda miliki.</li><li>Hantar aduan hanya melalui saluran rasmi selepas disemak.</li></ul></div>{ai.mic&&<div className="notice listening"><span className="status-dot online"/> Sedang mendengar… {ai.partial}</div>}</aside></div>
 </div>;
}
