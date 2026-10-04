import {extractSupportedFields} from './archive.js';

const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const reportVoice=value=>clean(value).replace(/\bSaya\b/g,'Pengadu').replace(/\bsaya\b/g,'pengadu').replace(/\bKami\b/g,'Para pengadu').replace(/\bkami\b/g,'para pengadu').replace(/[.!;\s]+$/,'');
const shorten=(value,max)=>clean(value).length<=max?clean(value):clean(value).slice(0,max).replace(/\s+\S*$/,'')+'…';
const normalize=value=>clean(value).toLocaleLowerCase('ms').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const inSource=(source,quote)=>!!quote&&normalize(source).includes(normalize(quote));
const numbers=value=>clean(value).match(/(?:RM\s*)?\d[\d,.]*/gi)||[];
const units=['kosong','satu','dua','tiga','empat','lima','enam','tujuh','lapan','sembilan','sepuluh','sebelas','dua belas','tiga belas','empat belas','lima belas','enam belas','tujuh belas','lapan belas','sembilan belas'];
function numberWords(n){
 if(n<20)return units[n];
 if(n<100)return `${units[Math.floor(n/10)]} puluh${n%10?' '+units[n%10]:''}`;
 if(n<1000)return `${units[Math.floor(n/100)]} ratus${n%100?' '+numberWords(n%100):''}`;
 if(n<100000)return `${units[Math.floor(n/1000)]} ribu${n%1000?' '+numberWords(n%1000):''}`;
 return '';
}
function spokenNumber(value){
 const words=normalize(value).split(' '),unit=Object.fromEntries(units.slice(0,12).map((word,index)=>[word,index]));
 let total=0,current=0;
 for(const word of words){
  if(word in unit)current+=unit[word];
  else if(word==='belas')current+=10;
  else if(word==='puluh')current*=10;
  else if(word==='ratus')current*=100;
  else if(word==='ribu'){total+=(current||1)*1000;current=0;}
  else return null;
 }
 return total+current;
}
const noNewNumbers=(value,evidence)=>numbers(value).every(token=>{
 const match=normalize(evidence),direct=normalize(token);
 if(match.includes(direct))return true;
 const raw=token.replace(/RM\s*/i,'').replace(/,$/,'');
 const numeric=/^\d{1,2}\.00$/.test(raw)?Number(raw.split('.')[0]):Number(raw.replace(/,/g,''));
 return Number.isInteger(numeric)&&match.includes(numberWords(numeric));
});
const fieldKeys=['apa','siapa','bila','dimana','kenapa','bagaimana','jumlah'];

function categoryFor(text){
 if(/(?:rasuah|suapan|tanpa resit|tanpa risit)/i.test(text)||/(?:bayaran tambahan|wang tunai|meminta\s+RM|(?:meminta|membayar).{0,50}ringgit)/i.test(text)&&/(?:mempercepatkan|kelulusan|keutamaan)/i.test(text))return 'Rasuah / Permintaan Suapan';
 if(/(?:salah guna kuasa|penyalahgunaan kuasa)/i.test(text))return 'Salah guna kuasa';
 if(/(?:tuntutan palsu|resit palsu|dokumen palsu)/i.test(text))return 'Tuntutan palsu';
 if(/(?:lambat|lewat|tertangguh|kelewatan)/i.test(text))return 'Kelewatan perkhidmatan';
 if(/(?:rosak|lampu jalan|kemudahan|tandas)/i.test(text))return 'Kemudahan awam';
 return 'Perkhidmatan awam lain';
}

export function createComplaintAnalysis(transcript,result={}){
 const raw=result.fields||{};
 const supported=extractSupportedFields(transcript,result);
 const fields={},fieldEvidence={},confidence={};
 for(const key of fieldKeys){
  const entry=raw[key];
  const value=clean(typeof entry==='object'?entry?.value:entry);
  const quotes=(Array.isArray(entry?.evidence)?entry.evidence:[entry?.quote]).map(clean).filter(quote=>quote.length>=5&&inSource(transcript,quote));
  if(value&&quotes.length&&noNewNumbers(value,quotes.join(' '))){
   fields[key]=value.slice(0,450);fieldEvidence[key]=quotes.slice(0,4);
   confidence[key]=Math.max(0,Math.min(1,Number(entry.confidence)||0));
  }else if(key==='jumlah'&&typeof entry==='string'&&inSource(transcript,entry)){
   fields[key]=clean(entry).slice(0,80);fieldEvidence[key]=[clean(entry)];
  }else if(supported[key]){
   const literal=clean(supported[key]);
   if(key==='apa'&&!/(?:meminta|bayaran|rasuah|suapan|rosak|gagal|lewat|lambat|tidak|hilang|aduan)/i.test(literal))continue;
   if(key==='bila'&&!/(?:\d{1,2}\s+(?:januari|februari|mac|april|mei|jun|julai|ogos|september|oktober|november|disember)|\d{1,2}[:.]\d{2}|pagi|petang|malam)/i.test(literal))continue;
   if(key==='dimana'&&!/(?:jalan|taman|kampung|pejabat|dewan|sekolah|hospital|kaunter|bandar|balai|kedai|perpustakaan|pusat)/i.test(literal))continue;
   fields[key]=literal.slice(0,450);fieldEvidence[key]=[literal];
  }
 }
 if(/^(?:saya|kami|pengadu)\s+(?:ingin|hendak|mahu|nak)\s+(?:membuat|mengemukakan)\s+aduan\b/i.test(fields.apa||'')){
  delete fields.apa;delete fieldEvidence.apa;delete confidence.apa;
 }
 const date=transcript.match(/\b\d{1,2}\s+(?:Januari|Februari|Mac|April|Mei|Jun|Julai|Ogos|September|Oktober|November|Disember)\s+(?:19|20)\d{2}\b/i)?.[0];
 if(date&&!fields.bila){fields.bila=date;fieldEvidence.bila=[date];}
 else if(date&&!normalize(fields.bila).includes(normalize(date))){fields.bila=date+', '+fields.bila;fieldEvidence.bila.unshift(date);}
 if(!date){
  const spoken=transcript.match(/\bpada\s+((?:\w+\s+){1,5})(setember|september|januari|februari|mac|april|mei|jun|julai|ogos|oktober|november|disember)\s+((?:\w+\s*){2,6})/i);
  if(spoken){
   const day=spokenNumber(spoken[1]),yearWords=spoken[3].split(/\b(?:lebih|kurang|jam|perbualan|berlaku)\b/i)[0].trim(),year=spokenNumber(yearWords);
   if(day>=1&&day<=31&&year>=1900&&year<=2100){fields.bila=`${day} ${spoken[2].toLowerCase()==='setember'?'September':spoken[2]} ${year}`;fieldEvidence.bila=[spoken[0].slice(0,spoken[0].length-spoken[3].length)+yearWords];}
  }
 }
 const time=transcript.match(/\b(?:kira-kira\s+)?jam\s+\d{1,2}(?:[.:]\d{2})?\s*(?:pagi|petang|malam)?\b/i)?.[0];
 if(time&&fields.bila&&!normalize(fields.bila).includes(normalize(time))){fields.bila+=', '+time;fieldEvidence.bila.push(time);}
 const spokenTime=!time&&transcript.match(/\b(?:lebih kurang|kira-kira)?\s*jam\s+(satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh|sebelas|dua belas)\s*(pagi|petang|malam)?\b/i);
 if(spokenTime&&fields.bila){fields.bila+=`, kira-kira jam ${spokenNumber(spokenTime[1])} ${spokenTime[2]||''}`.trimEnd();fieldEvidence.bila.push(spokenTime[0].trim());}
 const places=[...transcript.matchAll(/\b(?:di|berhampiran|dalam)\s+((?:Jalan|Taman|Kampung|Pejabat|Dewan|Sekolah|Hospital|Kaunter|Bandar|Balai|Kedai|Perpustakaan|Pusat)\s+[^,.!?]{2,100}?)(?=\s+dan\s+(?:meminta|menyebut|memberi|mengambil|membayar)|[,.!?]|$)/gi)].map(match=>match[1].trim());
 for(const place of places){
  if(!fields.dimana){fields.dimana=place;fieldEvidence.dimana=[place];}
  else if(!normalize(fields.dimana).includes(normalize(place))&&!normalize(place).includes(normalize(fields.dimana))){fields.dimana+='; '+place;fieldEvidence.dimana.push(place);}
 }
 const spokenPlaces=[...transcript.matchAll(/\b(?:di|berlaku di)\s+(?:sebuah\s+)?((?:counter|kaunter|kedai makan)\s+[^,.!?]{2,90}?)(?=\s+(?:selepas|kemudian|beliau|pada|semasa|dan\s+meminta)|[,.!?]|$)/gi)].map(match=>match[1].trim());
 for(const place of spokenPlaces)if(!normalize(fields.dimana).includes(normalize(place))){fields.dimana=fields.dimana?fields.dimana+'; '+place:place;(fieldEvidence.dimana||=[]).push(place);}
 if(fields.dimana){const locations=fields.dimana.split(';').map(clean).filter(Boolean);fields.dimana=locations.filter((place,index)=>!locations.some((other,otherIndex)=>index!==otherIndex&&normalize(other).length>normalize(place).length&&normalize(other).includes(normalize(place)))).join('; ');}
 if(!fields.siapa){
  const person=transcript.match(/\b(?:En\s*C|Encik|Puan|Tuan)\s+[A-Z][\p{L}]{2,}\b/iu)?.[0];
  if(person){fields.siapa=person.replace(/^En\s*C\b/i,'Encik');fieldEvidence.siapa=[person];}
 }
 if(!fields.jumlah){
  const numeric=transcript.match(/\bRM\s*\d[\d,.]*/i)?.[0];
  if(numeric){fields.jumlah=clean(numeric);fieldEvidence.jumlah=[numeric];}
 }
 if(!fields.jumlah){
  const money=transcript.match(/\b((?:satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh)(?:\s+(?:ratus|ribu|puluh|\w+)){0,3})\s+ringgit\b/i);
  const amount=money&&spokenNumber(money[1]);
  if(amount>0&&amount<100000){fields.jumlah=`RM${amount.toLocaleString('en-US')}`;fieldEvidence.jumlah=[money[0]];}
 }
 if(!fields.apa){
  const action=transcript.match(/\b(?:meminta|menuntut)\s+(?:saya\s+)?(?:membayar\s+)?(?:RM\s*[\d,.]+|(?:\w+\s+){0,3}ringgit)[^.!?]{0,100}/i)?.[0];
  if(action){fields.apa=clean(action).slice(0,180);fieldEvidence.apa=[action];}
 }
 if(fields.apa&&fields.jumlah&&/\bringgit\b/i.test(fields.apa)&&!/\bRM\s*\d/i.test(fields.apa))fields.apa=`meminta bayaran ${fields.jumlah}`;
 else if(fields.apa)fields.apa=fields.apa.replace(/^meminta\s+(?:saya|pengadu)\s+membayar\s+/i,'meminta bayaran ');
 if(!fields.kenapa){
  const purpose=transcript.match(/\b(?:untuk|supaya|bagi)\s+(?:memberi|mempercepatkan|memastikan|mendapat|meluluskan)[^.!?]{0,120}/i)?.[0];
  if(purpose){fields.kenapa=clean(purpose).slice(0,180);fieldEvidence.kenapa=[purpose];}
 }
 if(!fields.bagaimana){
  const method=transcript.match(/\b(?:meminta|mengarahkan)[^.!?]{0,120}\b(?:secara tunai|tanpa resit|melalui|bayaran tambahan)[^.!?]{0,80}/i)?.[0];
  if(method){fields.bagaimana=clean(method).slice(0,220);fieldEvidence.bagaimana=[method];}
 }
 const cash=transcript.match(/\b(?:meminta\s+)?bayaran\s+dibuat\s+secara\s+tunai\s+tanpa\s+(?:resit|risit)\b/i)?.[0];
 if(cash&&!normalize(fields.bagaimana).includes(normalize(cash))){fields.bagaimana=fields.bagaimana?fields.bagaimana+'; '+cash:cash;(fieldEvidence.bagaimana||=[]).push(cash);}
 for(const key of ['apa','kenapa','bagaimana'])if(fields[key])fields[key]=reportVoice(fields[key]);
 const themeEvidence=(Array.isArray(result.themes)?result.themes:[]).flatMap(item=>{const quote=clean(item?.quote);return quote.length>=8&&inSource(transcript,quote)?[{quote}]:[];}).slice(0,5);
 const category=categoryFor(transcript);
 const themes=themeEvidence.length?themeEvidence.map(item=>({label:category,quote:item.quote})):[];
 const wh=[['Apa','apa'],['Siapa','siapa'],['Bila','bila'],['Di mana','dimana'],['Mengapa','kenapa'],['Bagaimana','bagaimana']].map(([question,key])=>({question,evidence:fields[key]||'',known:!!fields[key],sourceQuotes:fieldEvidence[key]||[],confidence:confidence[key]??null}));
 const allEvidence=Object.values(fieldEvidence).flat().join(' ');
 const proposedTitle=clean(result.presentation?.title||result.topic||'');
 const legacyTitle=clean(supported.tajuk||'');
 const generatedTitle=fields.apa?(category==='Rasuah / Permintaan Suapan'?'Dakwaan permintaan '+fields.apa.replace(/^meminta\s+(?:pengadu\s+)?membayar\s+/i,'bayaran ').replace(/^meminta\s+/i,''):'Aduan '+fields.apa):'Aduan untuk semakan';
 const topic=proposedTitle.length>=15&&!/\b(?:saya|kami)\b/i.test(proposedTitle)&&!/^(?:aduan|ajuan|tajuk|laporan)(?:\s+(?:pendek|ringkas|baru))?$/i.test(proposedTitle)&&noNewNumbers(proposedTitle,allEvidence||transcript)&&(!fields.jumlah||normalize(proposedTitle).includes(normalize(fields.jumlah)))?proposedTitle.slice(0,130):legacyTitle&&legacyTitle.length<100?reportVoice(legacyTitle):generatedTitle.slice(0,130);
 const actor=fields.siapa?fields.siapa+' didakwa ':'';
 const first=fields.apa?`Menurut pengadu, ${actor}${fields.apa}${fields.kenapa&&!/\b(?:supaya|untuk|bagi)\b/i.test(fields.apa)&&!normalize(fields.apa).includes(normalize(fields.kenapa))?' '+fields.kenapa:''}.`:'';
 const timePlace=[fields.bila&&`pada ${reportVoice(fields.bila).replace(/^pada\s+/i,'')}`,fields.dimana&&`di ${reportVoice(fields.dimana).replace(/^di\s+/i,'').replace(/;\s*/g,' dan di ')}`].filter(Boolean).join(' ');
 const second=timePlace?`Kejadian dinyatakan berlaku ${timePlace}.`:'';
 const third=fields.bagaimana&&!normalize(fields.apa).includes(normalize(fields.bagaimana))?`Cara yang dinyatakan: ${fields.bagaimana}.`:'';
 const summary=[first,second,third].filter(Boolean).join(' ').slice(0,1200)||'Maklumat kejadian belum cukup untuk diringkaskan.';
 const evidenceItems=(Array.isArray(result.evidenceItems)?result.evidenceItems:[]).flatMap(item=>{const quote=clean(item?.quote);return quote.length>=5&&inSource(transcript,quote)?[{description:clean(item.description||quote).slice(0,200),quote}]:[];}).slice(0,10);
 for(const [pattern,description] of [[/\b(?:mesej|message)\s+WhatsApp\b/i,'Mesej WhatsApp'],[/\brakaman\s+perbualan\b/i,'Rakaman perbualan'],[/\brancaman\s+perbualan\b/i,'Perbualan disebut sebagai bukti (semak transkrip ASR)']]){
  const quote=transcript.match(pattern)?.[0];
  if(quote&&!evidenceItems.some(item=>normalize(item.quote).includes(normalize(quote))))evidenceItems.push({description,quote});
 }
 const chronology=(Array.isArray(result.chronology)?result.chronology:[]).flatMap(item=>{const quote=clean(item?.quote);return quote.length>=5&&inSource(transcript,quote)&&!/^saya ingin membuat aduan\b/i.test(quote)?[{event:reportVoice(item.event||quote).slice(0,240),quote}]:[];}).slice(0,10);
 if(!chronology.length)for(const sentence of transcript.split(/(?<=[.!?])\s+|\s+(?=Selepas itu|Kemudian|Pada mulanya|Semasa pertemuan)/i)){
  const quote=clean(sentence);
  if(chronology.length>=5)break;
  if(quote.length>=18&&/(?:pada\s+\d|berurusan|kaunter|counter|menyebut|berjumpa|meminta)/i.test(quote)&&!/^saya ingin membuat aduan\b/i.test(quote)&&!/(?:mempunyai|memiliki)\s+(?:mesej|message|rakaman)/i.test(quote))chronology.push({event:shorten(reportVoice(quote),220),quote});
 }
 const missing=wh.filter(item=>!item.known).map(item=>item.question);
 const questionFor={'Apa':'Apakah kejadian utama yang ingin diadukan?','Siapa':'Siapakah pihak yang terlibat?','Bila':'Bilakah kejadian berlaku?','Di mana':'Di manakah kejadian berlaku?','Mengapa':'Adakah tujuan atau sebab tindakan itu dinyatakan?','Bagaimana':'Bagaimanakah tindakan itu berlaku?'};
 const followupQuestions=missing.map(item=>questionFor[item]);
 const conclusion='Draf ini dijana daripada keterangan pengadu dan memerlukan pengesahan manusia sebelum digunakan sebagai aduan rasmi.';
 return {topic,category,themes,wh,amount:fields.jumlah||'',parties:fields.siapa||'',summary,conclusion,evidenceItems,chronology,missing,followupQuestions,fields,reviewRequired:true};
}
