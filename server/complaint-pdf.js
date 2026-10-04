import PDFDocument from 'pdfkit';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const logo=path.join(root,'public/branding/2en-apps-3d.png');
const C={navy:'#1e3a8a',blue:'#2563eb',gold:'#facc15',ink:'#0f172a',muted:'#475569',line:'#cbd5e1',pale:'#f8fafc',red:'#991b1b'};
const LEFT=48,RIGHT=547,WIDTH=RIGHT-LEFT,BOTTOM=766;
const value=(v,max=6000)=>String(v??'').trim().slice(0,max)||'Tidak dinyatakan';

export function renderComplaintPdf(analysis,transcript=''){
 const pdf=new PDFDocument({size:'A4',margin:0,autoFirstPage:false,bufferPages:true,info:{Title:'Draf Analisis e-Aduan · 2enAI',Author:'2enAI / AIMAN',Subject:value(analysis.topic,130)}});
 let y=0,fieldNo=0;
 const header=(first=false)=>{
  pdf.image(logo,LEFT,35,{fit:[39,39]});
  pdf.font('Helvetica-Bold').fontSize(12).fillColor(C.navy).text('2enAI',96,42,{lineBreak:false});
  pdf.font('Helvetica').fontSize(8).fillColor(C.muted).text('ENTERPRISE AI SOLUTIONS  /  E-ADUAN',96,58,{lineBreak:false});
  pdf.rect(LEFT,82,WIDTH,2).fill(C.navy).rect(LEFT,86,WIDTH,1.5).fill(C.gold);
  y=first?103:103;
 };
 const next=(height=0)=>{if(y+height>BOTTOM){pdf.addPage();y=103;}};
 const write=(text,{x=LEFT,w=WIDTH,size=9.5,color=C.ink,bold=false,lineGap=3,indent=0}={})=>{
  const content=value(text),tx=x+indent,tw=w-indent;
  pdf.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor(color);
  const height=pdf.heightOfString(content,{width:tw,lineGap});
  next(Math.min(height,30)+4);
  pdf.text(content,tx,y,{width:tw,lineGap});y=pdf.y;
 };
 const bar=title=>{next(37);y+=12;pdf.roundedRect(LEFT,y,WIDTH,22,2).fill(C.navy);pdf.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text(title.toUpperCase(),LEFT+9,y+6,{width:WIDTH-18,lineBreak:false});y+=31;};
 const field=(label,text)=>{
  const content=value(text);
  next(48);fieldNo++;
  pdf.font('Helvetica-Bold').fontSize(8.5).fillColor(C.navy).text(`${fieldNo}.`,LEFT,y,{width:17,lineBreak:false});
  pdf.fillColor(C.ink).text(label.toUpperCase(),LEFT+17,y,{width:WIDTH-17,lineBreak:false});y+=16;
  const contentHeight=pdf.font('Helvetica').fontSize(9.5).heightOfString(content,{width:WIDTH-32,lineGap:3});
  if(contentHeight+14<=BOTTOM-y){
   const h=contentHeight+14;
   pdf.roundedRect(LEFT+17,y,WIDTH-17,h,3).lineWidth(.7).strokeColor(C.line).stroke();
   pdf.font('Helvetica').fontSize(9.5).fillColor(C.ink).text(content,LEFT+25,y+7,{width:WIDTH-33,lineGap:3});y+=h+10;
  }else{
   y+=2;write(content,{x:LEFT+25,w:WIDTH-33});y+=11;
  }
 };
 const list=(title,items,format)=>{
  if(!Array.isArray(items)||!items.length)return;
  bar(title);
  items.slice(0,10).forEach((item,i)=>{next(24);write(`${i+1}.  ${format(item)}`,{x:LEFT+8,w:WIDTH-16});y+=5;});
 };
 pdf.addPage();header(true);
 pdf.font('Helvetica-Bold').fontSize(16).fillColor(C.navy).text('DRAF ANALISIS ADUAN',LEFT,y,{width:WIDTH,align:'center'});y=pdf.y+3;
 pdf.font('Helvetica').fontSize(8.5).fillColor(C.muted).text('Disediakan oleh AIMAN untuk semakan pengadu',LEFT,y,{width:WIDTH,align:'center'});y=pdf.y+17;
 const meta=[['TARIKH',new Date().toLocaleDateString('ms-MY',{day:'2-digit',month:'long',year:'numeric'})],['STATUS','Draf untuk semakan'],['SUMBER',transcript?'Suara / teks pengadu':'Keterangan pengadu']];
 const cellW=WIDTH/3,metaH=38;
 pdf.roundedRect(LEFT,y,WIDTH,metaH,3).lineWidth(.7).strokeColor(C.line).stroke();
 meta.forEach(([label,item],i)=>{const x=LEFT+i*cellW;if(i)pdf.moveTo(x,y).lineTo(x,y+metaH).strokeColor(C.line).stroke();pdf.font('Helvetica').fontSize(6.7).fillColor(C.muted).text(label,x+8,y+7,{width:cellW-16,lineBreak:false});pdf.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text(item,x+8,y+19,{width:cellW-16,lineBreak:false});});
 y+=metaH+10;
 pdf.roundedRect(LEFT,y,WIDTH,24,2).fill('#fff7ed');
 pdf.font('Helvetica-Bold').fontSize(8).fillColor(C.red).text('UNTUK SEMAKAN PENGADU  ·  BELUM DIHANTAR SECARA RASMI',LEFT+9,y+7,{width:WIDTH-18,lineBreak:false});y+=29;
 bar('A  /  Maklumat aduan');field('Topik',analysis.topic);field('Tema',analysis.category);
 bar('B  /  Analisis 5W1H');
 for(const row of analysis.wh.slice(0,6))field(row.question||'Butiran',row.evidence);
 if(analysis.amount||analysis.parties){bar('C  /  Butiran penting');if(analysis.amount)field('Jumlah / nilai',analysis.amount);if(analysis.parties)field('Pihak terlibat',analysis.parties);}
 list('D  /  Bukti sokongan yang disebut',analysis.evidenceItems,item=>value(item?.description,300));
 list('E  /  Kronologi',analysis.chronology,item=>value(item?.event,350));
 bar('F  /  Rumusan dan kesimpulan');field('Ringkasan',analysis.summary);field('Kesimpulan',analysis.conclusion);
 if(analysis.missing?.length||analysis.followupQuestions?.length){bar('G  /  Semakan lanjut');if(analysis.missing?.length)field('Maklumat belum lengkap',analysis.missing.join(', '));if(analysis.followupQuestions?.length)field('Soalan susulan',analysis.followupQuestions.slice(0,6).map((q,i)=>`${i+1}. ${q}`).join('\n'));}
 next(85);y+=9;pdf.roundedRect(LEFT,y,WIDTH,64,3).lineWidth(.7).strokeColor(C.line).stroke();
 pdf.font('Helvetica-Bold').fontSize(8).fillColor(C.navy).text('PENGESAHAN PENGADU',LEFT+10,y+9,{lineBreak:false});
 for(let i=0;i<3;i++){const x=LEFT+11+i*(WIDTH-22)/3;pdf.moveTo(x,y+47).lineTo(x+(WIDTH-44)/3,y+47).lineWidth(.7).strokeColor(C.ink).stroke();pdf.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(['Tandatangan','Nama','Tarikh'][i],x,y+50,{lineBreak:false});}y+=78;
 if(String(transcript).trim()){
  pdf.addPage();y=103;bar('H  /  Transkrip atau keterangan asal');
  write(String(transcript).trim().slice(0,12000),{x:LEFT+10,w:WIDTH-20,size:9.3});
 }
 const pages=pdf.bufferedPageRange();
 for(let i=0;i<pages.count;i++){
  pdf.switchToPage(i);
  if(i>0)header();
  pdf.moveTo(LEFT,791).lineTo(RIGHT,791).lineWidth(.6).strokeColor(C.line).stroke();
  pdf.font('Helvetica').fontSize(7.5).fillColor(C.muted).text('2enAI  ·  Draf e-Aduan untuk semakan pengadu',LEFT,799,{width:WIDTH-125,lineBreak:false});
  pdf.text(`Halaman ${i+1} / ${pages.count}`,RIGHT-115,799,{width:115,align:'right',lineBreak:false});
 }
 return pdf;
}
