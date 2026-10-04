// Fill a documented gap in the public Arkib mirror with its official exhibition PDF.
import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

const url='https://www.arkib.gov.my/images/pameran-maya/darurat-tanah-melayu.pdf';
const root=path.resolve(import.meta.dirname,'..');
const dataDir=path.join(root,'data');
const mediaDir=path.join(dataDir,'media');
const manifestFile=path.join(dataDir,'media-manifest.json');
const corpusFile=path.join(dataDir,'corpus.json');
const readJSON=async file=>JSON.parse(await readFile(file,'utf8'));
const saveJSON=async(file,value)=>{const temp=file+'.tmp';await writeFile(temp,JSON.stringify(value));await rename(temp,file);};

await mkdir(mediaDir,{recursive:true});
const manifest=await readJSON(manifestFile);
const id=createHash('sha256').update(url).digest('hex').slice(0,24);
const filename=id+'.pdf';
let bytes;
if(manifest.files[url]?.status==='saved')bytes=await readFile(path.join(mediaDir,manifest.files[url].filename));
else{
  const response=await fetch(url,{headers:{'User-Agent':'AIMAN-ArchiveResearch/1.0 (public local mirror)'},signal:AbortSignal.timeout(60000)});
  if(!response.ok||new URL(response.url).origin!=='https://www.arkib.gov.my')throw new Error('Official source unavailable: HTTP '+response.status);
  bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>25_000_000||bytes.toString('ascii',0,4)!=='%PDF')throw new Error('Source is not a PDF under 25 MB.');
  await writeFile(path.join(mediaDir,filename+'.tmp'),bytes);
  await rename(path.join(mediaDir,filename+'.tmp'),path.join(mediaDir,filename));
  manifest.files[url]={id,url,filename,mime:'application/pdf',category:'ebook / dokumen',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),from:'Arkib Negara Malaysia — Pameran Maya',status:'saved',savedAt:new Date().toISOString()};
  manifest.updatedAt=new Date().toISOString();
  await saveJSON(manifestFile,manifest);
}

const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}).promise;
const corpus=await readJSON(corpusFile);
let indexed=0;
for(let page=1;page<=pdf.numPages;page++){
  const content=await(await pdf.getPage(page)).getTextContent();
  const text=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  if(text.length<120)continue;
  const doc={id:createHash('sha256').update(url+page).digest('hex').slice(0,16),url,title:`Darurat Tanah Melayu 1948 · halaman ${page}`,text,fetchedAt:new Date().toISOString(),publisher:'Arkib Negara Malaysia',type:'pdf',page};
  const existing=corpus.findIndex(item=>item.id===doc.id);
  if(existing<0)corpus.push(doc);else corpus[existing]=doc;
  indexed++;
}
await pdf.cleanup();
if(!indexed){
  // This exhibition is image-only. The page-2 excerpt was transcribed from
  // the rendered official PDF and checked against the visible page.
  const text=(await readFile(path.join(dataDir,'transcriptions','darurat-tanah-melayu-1948-page-2.txt'),'utf8')).trim();
  if(text.length<120)throw new Error('Verified page-2 transcription is missing.');
  const page=2;
  const doc={id:createHash('sha256').update(url+page).digest('hex').slice(0,16),url,title:'Darurat Tanah Melayu 1948 · halaman 2',text,fetchedAt:new Date().toISOString(),publisher:'Arkib Negara Malaysia',type:'pdf',page,transcription:'Disemak secara manual daripada halaman imbasan'};
  const existing=corpus.findIndex(item=>item.id===doc.id);
  if(existing<0)corpus.push(doc);else corpus[existing]=doc;
  indexed=1;
}
await saveJSON(corpusFile,corpus);
const statusFile=path.join(dataDir,'import-status.json');
const status=await readJSON(statusFile);
status.documents=corpus.length;status.updatedAt=new Date().toISOString();
await saveJSON(statusFile,status);
console.log(JSON.stringify({url,pages:pdf.numPages,indexed,documents:corpus.length,localFile:path.join(mediaDir,filename)}));
