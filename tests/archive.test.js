import test from 'node:test';
import assert from 'node:assert/strict';
import {search,validateEvidence,extractEvidence,navigationIntent,validateHandwriting,extractSupportedFields} from '../server/archive.js';
import {createComplaintAnalysis} from '../server/complaint-analysis.js';

test('archive answer refuses a related title that does not answer the question',()=>{
 const source={id:'1',text:'Senarai Pameran\nDarurat Tanah Melayu 1948\nSejarah Malaysia',title:'Senarai'};
 assert.deepEqual(validateEvidence([{sourceId:'1',quote:'Darurat Tanah Melayu 1948'}],[source],'Apa yang berlaku semasa Darurat Tanah Melayu pada tahun 1948?'),[]);
});
test('archive answer accepts only a substantive exact source quote',()=>{
 const quote='Pada tahun 1948 pentadbiran British telah mengisytiharkan darurat selepas beberapa siri keganasan dan ancaman terhadap keselamatan di Tanah Melayu.';
 const source={id:'1',text:'Pendahuluan\n'+quote+'\nPenutup'};
 assert.equal(validateEvidence([{sourceId:'1',quote}],[source],'Apa yang berlaku pada tahun 1948?').length,1);
 assert.deepEqual(validateEvidence([{sourceId:'1',quote:quote.replace('British','Belanda')}],[source],'Apa yang berlaku pada tahun 1948?'),[]);
});
test('archive answer rejects exact but unrelated records-management prose',()=>{
 const quote='They do not specify particular processes, as it is recognised that the techniques and strategies to achieve the outcomes will depend on the organisation and electronic records management system being used.';
 assert.deepEqual(validateEvidence([{sourceId:'manual',quote}],[{id:'manual',text:quote,title:'Arkib Negara'}],'Apa yang berlaku semasa Darurat Tanah Melayu pada tahun 1948?'),[]);
});
test('extractive fallback uses relevant source text, never a related title alone',()=>{
 const question='Apakah peranan Arkib Negara dalam penyelidikan sejarah?';
 const sources=[{id:'a',title:'Peranan Arkib Negara',text:'Senarai kandungan sejarah yang diterbitkan pada tahun semasa.'},{id:'b',title:'Dasar Arkib',text:'Arkib Negara melaksanakan peranan dan tanggungjawabnya sebagai pusat arkib dan penyelidikan negara dengan mengamalkan konsep Total Archives. Arkib Negara menerima dan memperoleh rekod dalam pelbagai bentuk dan media.'}];
 const result=extractEvidence(sources,question);
 assert.equal(result.length,1);assert.equal(result[0].id,'b');assert.ok(sources[1].text.includes(result[0].quote));
});
test('site navigation cannot become evidence for a historical question',()=>{
 const quote='Pameran Maya ASEAN Satu Wawasan, Satu Identiti, Satu Komuniti Watikah Permasyuran Kemerdekaan Tokoh Ilmuwan Islam Darurat Tanah Melayu 1948 P.Ramlee Dimana Kan Ku Cari Ganti MTCP Pameran Watikah Kemerdekaan KL Dulu dan Kini Melaka Dulu-Dulu Subcategories Koleksi Poster Maya FaLang translation system by Faboba';
 const source={id:'nav',title:'Polisi Privasi',text:quote,url:'https://www.arkib.gov.my/ms/pusat-media/pameran-maya?view=category'};
 assert.deepEqual(validateEvidence([{sourceId:'nav',quote}],[source],'Apa yang berlaku semasa Darurat Tanah Melayu pada tahun 1948?'),[]);
 assert.deepEqual(extractEvidence([source],'Apa yang berlaku semasa Darurat Tanah Melayu pada tahun 1948?'),[]);
});
test('Darurat 1948 question retrieves a substantive locally saved Arkib page',async()=>{
 const question='Apa yang berlaku semasa Darurat Tanah Melayu pada tahun 1948?';
 const sources=await search(question);
 assert.match(sources[0].title,/Darurat Tanah Melayu 1948/);
 assert.match(sources[0].url,/^\/api\/archive\/media\/[a-f0-9]{24}#page=2$/);
 assert.match(extractEvidence(sources,question)[0].quote,/Darurat.*1948.*Tanah Melayu/);
});
test('navigation help stays separate from archival answers',()=>{
 assert.equal(navigationIntent('Saya nak buat aduan').page,'aduan');
 assert.equal(navigationIntent('Apa yang berlaku pada tahun 1948?'),null);
});
test('handwriting alignment rejects output without source word boxes',()=>{
 assert.throws(()=>validateHandwriting({words:[{id:'w0',text:'سلام',box:[0,0,100,100]}],segments:[]}),/penjajaran/);
});

test('handwriting keeps source line order through word and segment validation',()=>{
 const result=validateHandwriting({words:[{id:'l0w0',line:0,text:'مانيس',box:[10,10,100,50]},{id:'l1w1',line:1,text:'هياسن',box:[10,60,100,100]}],segments:[{wordIds:['l0w0'],rumi:'manis',bm:'manis',en:'sweet'},{wordIds:['l1w1'],rumi:'hiasan',bm:'hiasan',en:'decoration'}],lineTranslations:[{line:0,wordIds:['l0w0'],en:'sweet maiden'},{line:1,wordIds:['l0w0','l1w1'],en:'invalid cross-line translation'}]});
 assert.deepEqual(result.words.map(word=>word.line),[0,1]);
 assert.deepEqual(result.segments.map(segment=>segment.line),[0,1]);
 assert.deepEqual(result.lineTranslations.map(item=>item.en),['sweet maiden']);
});
test('handwriting rejects a whole line passed off as one word or copied schema labels',()=>{
 assert.throws(()=>validateHandwriting({words:[{id:'w0',text:'Arkib Negara',box:[0,0,300,100]}],segments:[{wordIds:['w0'],rumi:'Arkib Negara',bm:'Arkib Negara',en:'National Archives'}]}),/perkataan/);
 assert.throws(()=>validateHandwriting({words:[{id:'w0',text:'Arkib',box:[0,0,200,100]}],segments:[{wordIds:['w0'],rumi:'Rumi setia',bm:'BM moden',en:'English'}]}),/penjajaran/);
});
test('complaint extraction discards invented facts and officer remarks',()=>{
 const source='Pada 18 September 2025, tandas perpustakaan di Kuala Lumpur rosak.';
 const fields=extractSupportedFields(source,{tajuk:'tandas perpustakaan di Kuala Lumpur rosak',bila:'18 September 2025',kenapa:'kerana tiada peruntukan',ulasan:'Pegawai sudah lulus'});
 assert.deepEqual(fields,{tajuk:'tandas perpustakaan di Kuala Lumpur rosak',bila:'18 September 2025'});
});
test('complaint extraction leaves unsupported semantic fields blank',()=>{
 const source='Pada 18 September 2025, lampu jalan rosak di Jalan Merdeka. Kawasan ini gelap pada waktu malam.';
 const fields=extractSupportedFields(source,{fields:{tajuk:'Lampu jalan rosak',bila:'18 September 2025',dimana:'Jalan Merdeka',siapa:'Kawasan ini gelap',kenapa:'Kawasan ini gelap',bagaimana:'Lampu jalan rosak'}});
 assert.deepEqual(fields,{tajuk:'Lampu jalan rosak',bila:'18 September 2025',dimana:'Jalan Merdeka'});
});
test('complaint analysis keeps 5W1H and themes tied to the statement',()=>{
 const transcript='Pada 18 September 2025, lampu jalan rosak di Jalan Merdeka. Penduduk tidak dapat melihat jalan pada waktu malam.';
 const result=createComplaintAnalysis(transcript,{fields:{tajuk:'lampu jalan rosak',apa:'lampu jalan rosak',bila:'18 September 2025',dimana:'Jalan Merdeka',siapa:'Pegawai Ali'},themes:[{label:'Keselamatan jalan',quote:'Penduduk tidak dapat melihat jalan'},{label:'Rasuah',quote:'pegawai meminta wang'}]});
 assert.equal(result.topic,'lampu jalan rosak');
 assert.deepEqual(result.themes,[{label:'Kemudahan awam',quote:'Penduduk tidak dapat melihat jalan'}]);
 assert.equal(result.wh.find(item=>item.question==='Siapa').known,false);
 assert.match(result.conclusion,/draf/i);
});
test('complaint analysis corrects swapped date and place returned by Qwen',()=>{
 const transcript='Pada 18 September 2025, lampu jalan rosak di Jalan Merdeka. Penduduk tidak dapat melihat jalan pada waktu malam.';
 const result=createComplaintAnalysis(transcript,{fields:{tajuk:'lampu jalan',apa:'tidak dapat melihat jalan',bila:'di Jalan Merdeka',dimana:'pada 18 September 2025'},themes:[{label:'tema ringkas',quote:'lampu jalan rosak di Jalan Merdeka'}]});
 assert.equal(result.fields.bila,'18 September 2025');
 assert.equal(result.fields.dimana,'Jalan Merdeka');
 assert.equal(result.fields.apa,'tidak dapat melihat jalan');
 assert.equal(result.themes[0].label,'Kemudahan awam');
});
test('e-Aduan combines supported details across sentences without copying the first sentence',()=>{
 const transcript='Saya ingin membuat aduan berkenaan seorang pegawai Bahagian Pelesenan. Pada 25 September 2026 kira-kira jam 3.00 petang, saya berurusan di kaunter Bahagian Pelesenan dengan Encik Ahmad. Beliau menyebut bayaran tambahan untuk memberi keutamaan dan mempercepatkan kelulusan permit syarikat. Kemudian beliau meminta saya berjumpa di sebuah kedai makan berhampiran pejabat dan meminta RM3,000 secara tunai tanpa resit. Saya mempunyai mesej WhatsApp dan rakaman perbualan.';
 const result=createComplaintAnalysis(transcript,{fields:{
  apa:{value:'Permintaan RM3,000 untuk mempercepatkan kelulusan permit syarikat',evidence:['meminta RM3,000 secara tunai tanpa resit','mempercepatkan kelulusan permit syarikat'],confidence:.97},
  siapa:{value:'Encik Ahmad, pegawai Bahagian Pelesenan',evidence:['pegawai Bahagian Pelesenan','Encik Ahmad'],confidence:.96},
  bila:{value:'25 September 2026, kira-kira jam 3.00 petang',evidence:['25 September 2026 kira-kira jam 3.00 petang'],confidence:.98},
  dimana:{value:'Kaunter Bahagian Pelesenan dan kedai makan berhampiran pejabat',evidence:['kaunter Bahagian Pelesenan','kedai makan berhampiran pejabat'],confidence:.95},
  kenapa:{value:'Untuk memberi keutamaan dan mempercepatkan kelulusan permit',evidence:['untuk memberi keutamaan dan mempercepatkan kelulusan permit syarikat'],confidence:.94},
  bagaimana:{value:'Bayaran tambahan disebut, kemudian RM3,000 diminta secara tunai tanpa resit',evidence:['menyebut bayaran tambahan','meminta RM3,000 secara tunai tanpa resit'],confidence:.94}
 },themes:[{quote:'meminta RM3,000 secara tunai tanpa resit'}],presentation:{title:'Dakwaan Permintaan RM3,000 Untuk Mempercepat Kelulusan Permit',summary:'Menurut pengadu, Encik Ahmad didakwa meminta RM3,000 untuk mempercepat kelulusan permit.'},evidenceItems:[{description:'Mesej WhatsApp',quote:'mesej WhatsApp'},{description:'Rakaman perbualan',quote:'rakaman perbualan'}],chronology:[{event:'Berurusan di kaunter',quote:'berurusan di kaunter Bahagian Pelesenan'}]});
 assert.equal(result.fields.apa,'Permintaan RM3,000 untuk mempercepatkan kelulusan permit syarikat');
 assert.match(result.fields.kenapa,/mempercepatkan/);
 assert.match(result.fields.bagaimana,/tunai tanpa resit/);
 assert.match(result.fields.dimana,/kedai makan/);
 assert.equal(result.category,'Rasuah / Permintaan Suapan');
 assert.equal(result.evidenceItems.length,2);
 assert.equal(result.chronology.length,1);
 assert.deepEqual(result.missing,[]);
 assert.ok(result.topic.length<transcript.split('.')[0].length+10);
});
test('report narrative uses pengadu while exact source quotes retain saya',()=>{
 const transcript='Encik Ahmad meminta saya membayar RM3,000 supaya permit syarikat saya diluluskan. Saya bertemu beliau di kaunter pejabat.';
 const analysis=createComplaintAnalysis(transcript,{fields:{apa:'meminta saya membayar RM3,000 supaya permit syarikat saya diluluskan',siapa:'Encik Ahmad',dimana:'kaunter pejabat'},presentation:{title:'Dakwaan permintaan saya membayar RM3,000'}});
 assert.doesNotMatch(analysis.topic,/\bsaya\b/i);
 assert.doesNotMatch(analysis.summary,/\bsaya\b/i);
 assert.doesNotMatch(analysis.wh.find(item=>item.question==='Apa').evidence,/\bsaya\b/i);
 assert.match(analysis.wh.find(item=>item.question==='Apa').sourceQuotes[0],/\bsaya\b/i);
 assert.ok(analysis.chronology.every(item=>!/\bsaya\b/i.test(item.event)));
});
test('e-Aduan does not use the request to make a complaint as the incident',()=>{
 const transcript='Saya ingin membuat aduan berkenaan seorang pegawai kerajaan. Encik Ahmad meminta saya membayar RM3,000 supaya permit syarikat saya diluluskan dengan lebih cepat.';
 const analysis=createComplaintAnalysis(transcript,{fields:{apa:'Saya ingin membuat aduan berkenaan seorang pegawai kerajaan.',siapa:'Encik Ahmad'},presentation:{title:'Dakwaan permintaan saya membayar RM3,000'}});
 assert.match(analysis.fields.apa,/meminta bayaran RM3,000/i);
 assert.doesNotMatch(analysis.topic,/ingin membuat aduan/i);
 assert.doesNotMatch(analysis.summary,/ingin membuat aduan/i);
});
test('e-Aduan repairs weak Qwen spans using only text present in the complaint',()=>{
 const transcript='Pada 25 September 2026 kira-kira jam 3 petang, saya berurusan dengan Encik Ahmad di kaunter Bahagian Pelesenan. Beliau menyebut bayaran tambahan untuk memberi keutamaan dan mempercepatkan kelulusan permit syarikat. Kemudian beliau meminta saya berjumpa di kedai makan berhampiran pejabat dan meminta RM3,000 secara tunai tanpa resit. Saya mempunyai mesej WhatsApp dan rakaman perbualan.';
 const result=createComplaintAnalysis(transcript,{fields:{apa:'saya berurusan dengan',siapa:'Encik Ahmad',dimana:'di kaunter Bahagian Pelesenan',kenapa:'membuat bayaran tambahan untuk memberi keutamaan dan mempercepatkan kelulusan permit syarikat',bagaimana:'meminta RM3,000 secara tunai tanpa resit',jumlah:'RM3,000'},presentation:{title:'Aduan Pendek',summary:'Saya mempunyai mesej WhatsApp dan rakaman perbualan.'}});
 assert.match(result.fields.apa,/meminta RM3,000/);
 assert.match(result.fields.kenapa,/mempercepatkan kelulusan/);
 assert.match(result.fields.dimana,/kedai makan/);
 assert.match(result.fields.bila,/3 petang/);
 assert.equal(result.amount,'RM3,000');
 assert.equal(result.evidenceItems.length,2);
 assert.ok(result.chronology.length>=2);
 assert.notEqual(result.topic,'Aduan Pendek');
 assert.match(result.summary,/RM3,000/);
});
test('e-Aduan normalizes spoken Malay dates and amounts while retaining the ASR source words',()=>{
 const transcript='Individu tersebut ialah En C Ahmad. Perkara berlaku pada dua puluh lima setember dua ribu dua puluh enam lebih kurang jam tiga petang di counter bahagian perlesehan. Selepas itu beliau meminta saya berjumpa dengannya di sebuah kedai makan bahampiran pejabat. Beliau meminta saya membayar tiga ribu ringgit untuk mempercepatkan kelulusan permit.';
 const result=createComplaintAnalysis(transcript,{fields:{apa:'meminta saya membayar tiga ribu ringgit'}});
 assert.equal(result.parties,'Encik Ahmad');
 assert.match(result.wh.find(item=>item.question==='Bila').evidence,/25 September 2026.*3 petang/);
 assert.match(result.wh.find(item=>item.question==='Di mana').evidence,/counter.*kedai makan/);
 assert.equal(result.amount,'RM3,000');
 assert.equal(result.fields.apa,'meminta bayaran RM3,000');
 assert.match(result.wh.find(item=>item.question==='Mengapa').evidence,/mempercepatkan kelulusan/);
 assert.match(result.wh.find(item=>item.question==='Bila').sourceQuotes[0],/dua puluh lima setember/);
 assert.equal(createComplaintAnalysis(transcript,{fields:{}}).fields.apa,'meminta bayaran RM3,000');
});
test('a stated additional fee alone is not classified as a bribe',()=>{
 const result=createComplaintAnalysis('Saya dikenakan bayaran tambahan RM10 untuk cetakan dokumen di kaunter.',{fields:{apa:'bayaran tambahan RM10'}});
 assert.equal(result.category,'Perkhidmatan awam lain');
});
