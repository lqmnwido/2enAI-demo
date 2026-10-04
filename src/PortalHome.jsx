import {ArrowUpRight,Bot,FilePenLine,Languages,ShieldCheck,SearchCheck} from 'lucide-react';

export default function PortalHome({navigate,openAssistant}){
 return <div className="enterprise-home content-container">
  <div className="enterprise-heading"><div><span className="section-kicker">2ENAI · ENTERPRISE AI SOLUTIONS</span><h2>AI yang membantu kerja sebenar.</h2><p>Pilih perkhidmatan di bawah atau bercakap dengan AIMAN. Penyelidikan arkib menggunakan sumber yang telah disimpan setempat dan setiap jawapan memerlukan bukti.</p></div><button className="enterprise-talk" onClick={openAssistant}><Bot size={18}/> Tanya AIMAN <ArrowUpRight size={15}/></button></div>
  <div className="solution-grid"><button onClick={()=>navigate('aduan')}><span className="solution-icon"><FilePenLine size={25}/></span><small>01 / PERKHIDMATAN</small><strong>e-Aduan</strong><p>Ceritakan aduan melalui suara atau teks. AIMAN menyusun topik, tema, 5W1H, rumusan dan laporan PDF untuk semakan anda.</p><span className="solution-link">Buka e-Aduan <ArrowUpRight size={15}/></span></button><button onClick={()=>navigate('jawi')}><span className="solution-icon"><Languages size={25}/></span><small>02 / DOKUMEN</small><strong>Jawi & tulisan tangan</strong><p>Jejaki bacaan Jawi bercetak pada dokumen asal; semak padanan Rumi, BM dan English yang dapat disahkan.</p><span className="solution-link">Buka ruang dokumen <ArrowUpRight size={15}/></span></button></div>
  <div className="enterprise-principles"><span><SearchCheck size={17}/> Jawapan arkib bersumber</span><span><ShieldCheck size={17}/> Pemprosesan Qwen setempat</span><span><Bot size={17}/> AIMAN sentiasa di sisi</span></div>
 </div>;
}
