import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {localSource,mediaManifest} from './local-archive.js';
const dataDir=path.resolve(import.meta.dirname,'../data');
const stop=new Set('apa apakah yang dan di ke dari daripada pada semasa tahun untuk dengan ialah adalah itu ini saya mahu nak ingin tentang dalam telah oleh atau berlaku the what when in of a an and was during to is'.split(' '));
export function terms(text){return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>t.length>1&&!stop.has(t));}
let cache={mtime:0,documents:[],chunks:[],df:new Map(),avg:1};
function queryable(doc){
 if(doc.type==='web'&&/[?&]view=category|\/component\/osmap\//i.test(doc.url))return false;
 if(doc.type==='web'&&/FaLang translation system by Faboba/i.test(doc.text)&&doc.text.replace(/FaLang translation system by Faboba/ig,'').trim().length<120)return false;
 return true;
}
export async function corpus(){
 const file=path.join(dataDir,'corpus.json');const info=await stat(file).catch(()=>null);if(!info)return cache;
 if(info.mtimeMs===cache.mtime)return cache;
 const documents=JSON.parse(await readFile(file,'utf8')).filter(queryable),chunks=[],df=new Map();
 for(const doc of documents){
  const paragraphs=doc.text.split(/\n+/).map(x=>x.trim()).filter(Boolean);let text='';let index=0;
  const push=()=>{if(text.length<60)return;const tokens=terms(doc.title+' '+text),freq=new Map();for(const t of tokens)freq.set(t,(freq.get(t)||0)+1);chunks.push({id:doc.id+':'+index++,doc,text,tokens,freq});for(const t of freq.keys())df.set(t,(df.get(t)||0)+1);text='';};
  for(const p of paragraphs){
   if(text.length+p.length>1500)push();
   if(p.length>2200){for(let pos=0;pos<p.length;pos+=1400){text=p.slice(pos,pos+1600);push();}}else text+=(text?'\n':'')+p;
  }push();
 }
 cache={mtime:info.mtimeMs,documents,chunks,df,avg:chunks.reduce((a,c)=>a+c.tokens.length,0)/Math.max(chunks.length,1)};return cache;
}
export async function search(query,limit=8){
 const index=await corpus(),tokens=[...new Set(terms(query))];if(!tokens.length)return [];
 const results=[];
 for(const chunk of index.chunks){let score=0,matched=0;for(const token of tokens){const f=chunk.freq.get(token)||0;if(!f)continue;matched++;
  const idf=Math.log(1+(index.chunks.length-(index.df.get(token)||0)+.5)/((index.df.get(token)||0)+.5));
  score+=idf*f*2.2/(f+1.2*(.25+.75*chunk.tokens.length/index.avg));
 }
 if(matched>=Math.min(2,tokens.length)&&score>1)results.push({...chunk,score});
 }
 return Promise.all(results.sort((a,b)=>b.score-a.score).slice(0,limit).map(async c=>({id:c.id,title:c.doc.title,url:await localSource(c.doc),page:c.doc.page,type:c.doc.type,text:c.text,score:c.score,publisher:c.doc.publisher})));
}
export function validateEvidence(proposed,sources,question=''){
 if(!Array.isArray(proposed))return [];
 const normal=text=>text.replace(/\s+/g,' ').trim();
 return proposed.slice(0,5).flatMap(item=>{
  const source=sources.find(s=>s.id===item.sourceId);
  if(!source||typeof item.quote!=='string')return [];
  const quote=normal(item.quote);
  const questionTerms=new Set(terms(question));
  const quoteTerms=new Set(terms(quote));
  const extra=new Set([...quoteTerms].filter(t=>!questionTerms.has(t)));
  const overlap=[...questionTerms].filter(t=>quoteTerms.has(t)).length;
  if(quote.length<45||quote.length>1200||quoteTerms.size<9||extra.size<4||overlap<Math.min(2,questionTerms.size)||/FaLang translation system|Subcategories Koleksi Poster Maya/i.test(quote)||!normal(source.text).includes(quote))return [];
  return [{...source,quote}];
 });
}
export function extractEvidence(sources,question){
 const query=[...new Set(terms(question))];if(!query.length)return [];
 const selected=[];
 for(const source of sources){
  const text=source.text.replace(/\s+/g,' ').trim();
  const sentences=text.split(/(?<=[.!?;])\s+/u);
  const candidates=sentences.flatMap((sentence,index)=>{
   const quote=sentence.length>=75?sentence:sentence+' '+(sentences[index+1]||'');
   const present=new Set(terms(quote));const overlap=query.filter(t=>present.has(t)).length;
   const novel=[...present].filter(t=>!query.includes(t));
   return quote.length>=75&&quote.length<=1000&&!/FaLang translation system|Subcategories Koleksi Poster Maya/i.test(quote)&&overlap>=Math.min(3,Math.ceil(query.length*.5))&&novel.length>=5?[{quote,overlap}]:[];
  }).sort((a,b)=>b.overlap-a.overlap);
  if(candidates.length){selected.push({...source,quote:candidates[0].quote});if(selected.length===3)break;}
 }
 return selected;
}
export async function archiveStatus(){
 const index=await corpus();const status=JSON.parse(await readFile(path.join(dataDir,'import-status.json'),'utf8').catch(()=>'{}'));
 const mirror=JSON.parse(await readFile(path.join(dataDir,'media-state.json'),'utf8').catch(()=>'{}'));
 const media=await mediaManifest();
 return {...status,crawledDocuments:status.documents,documents:index.documents.length,chunks:index.chunks.length,source:'Arkib Negara Malaysia',mediaSaved:Object.keys(media.files).length,mediaPending:mirror.pending?.length||0,mediaPages:mirror.pageIndex||0,mediaPhase:mirror.phase||'belum bermula'};
}
export function navigationIntent(text){
 if(/(?:buka|pergi|buat|membuat|isi|mengisi|hantar|kemuka|kemukakan).{0,30}aduan/i.test(text))return {page:'aduan',text:'Saya buka halaman e-Aduan. Ceritakan apa yang berlaku, bila dan di mana. Anda boleh semak serta ubah draf sebelum menyimpannya.'};
 if(/(?:buka|pergi|analisis|baca|transkripsi).{0,30}(?:jawi|tulisan tangan|manuskrip)/i.test(text))return {page:'jawi',text:'Saya buka ruang Jawi dan tulisan tangan. Muat naik imej dokumen untuk melihat transkripsi dan terjemahan secara bersebelahan.'};
 if(/(?:buka|pergi|kembali).{0,30}(?:arkib|carian|koleksi)/i.test(text))return {page:'arkib',text:'Saya buka carian arkib. Setiap jawapan penyelidikan perlu disokong petikan daripada sumber yang diindeks.'};
 return null;
}
export function validateHandwriting(value){
 if(!value||!Array.isArray(value.words)||!value.words.length||value.words.length>1500)throw new Error('Model tidak menghasilkan perkataan dan lokasi yang sah.');
 const ids=new Set();
 const words=value.words.map((word,index)=>{
  if(typeof word.text!=='string'||!word.text.trim()||word.text.length>100||word.text.trim().split(/\s+/u).length>1||!Array.isArray(word.box)||word.box.length!==4||word.box.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1000)||word.box[2]<=word.box[0]||word.box[3]<=word.box[1])throw new Error('Koordinat atau penjajaran perkataan tidak sah. Cuba imej yang lebih jelas.');
  const id='w'+index;ids.add(id);return {id,originalId:word.id,line:Number.isInteger(word.line)&&word.line>=0&&word.line<1500?word.line:0,text:word.text,box:word.box,confidence:typeof word.confidence==='number'?Math.max(0,Math.min(1,word.confidence)):0};
 });
 const mapping=new Map(words.map(w=>[w.originalId,w.id]));
 const wordLines=new Map(words.map(w=>[w.id,w.line]));
 const segments=(Array.isArray(value.segments)?value.segments:[]).slice(0,500).map(s=>{const wordIds=(s.wordIds||[]).map(id=>mapping.get(id)).filter(Boolean);return {wordIds,line:wordLines.get(wordIds[0])??0,rumi:String(s.rumi||'').slice(0,1500),bm:String(s.bm||'').slice(0,1500),en:String(s.en||'').slice(0,1500)};}).filter(s=>s.wordIds.length&&![s.rumi,s.bm,s.en].some(text=>/^(?:Rumi setia|BM moden|English)$/i.test(text)));
 if(!segments.length)throw new Error('Transkripsi tidak mempunyai penjajaran sumber. Hasil tidak dipaparkan sebagai terjemahan sah.');
 const lineTranslations=(Array.isArray(value.lineTranslations)?value.lineTranslations:[]).slice(0,100).map(item=>{const wordIds=(item.wordIds||[]).map(id=>mapping.get(id)).filter(Boolean);const line=wordLines.get(wordIds[0])??0;return {line,wordIds,en:String(item.en||'').slice(0,500)};}).filter(item=>item.wordIds.length&&item.en&&item.wordIds.every(id=>wordLines.get(id)===item.line));
 const entities=(Array.isArray(value.entities)?value.entities:[]).slice(0,100).map(e=>({type:String(e.type||'').slice(0,80),text:String(e.text||'').slice(0,300),wordIds:(e.wordIds||[]).map(id=>mapping.get(id)).filter(Boolean)})).filter(e=>e.wordIds.length);
 return {words:words.map(({originalId,...word})=>word),segments,lineTranslations,entities,metadata:{language:String(value.metadata?.language||'Tidak dikenal pasti').slice(0,200),script:String(value.metadata?.script||'Tidak dikenal pasti').slice(0,200),notes:String(value.metadata?.notes||'').slice(0,1500)},reviewRequired:true};
}

export function extractSupportedFields(transcript,result){
 const fields={},values=result?.fields||result||{};
 const normalize=value=>value.toLocaleLowerCase('ms').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const source=normalize(transcript);
 for(const key of ['tajuk','apa','bila','dimana','bagaimana','kenapa','siapa']){
  const value=values[key];
  if(typeof value!=='string'||!value.trim()||!source.includes(normalize(value)))continue;
  // Exact text alone does not establish that a phrase answers a specific field.
  if(key==='siapa'&&!/\b(saya|kami|pengadu|penduduk|orang|pegawai|kontraktor|syarikat|pemilik|jiran|pemandu|pekerja|encik|puan|cik|tuan)\b/i.test(value))continue;
  if(key==='kenapa'&&!/\b(kerana|sebab|punca|disebabkan|akibat|berikutan)\b/i.test(transcript))continue;
  if(key==='bagaimana'&&!/\b(bagaimana|cara|ketika|semasa|apabila|melalui|dengan)\b/i.test(transcript))continue;
  fields[key]=value.slice(0,key==='tajuk'?200:6000);
 }
 return fields;
}
