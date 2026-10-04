// Render the fixed welcome sentence with the authorized local voice.
import {writeFile} from 'node:fs/promises';
import path from 'node:path';

// Malay phonetic spelling guides the two spoken letter names.
const phrase=process.argv[2]||'Hai! Saya Aiman! Ae Ai Assistant anda!';
const response=await fetch('http://127.0.0.1:3001/api/speech',{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:phrase})
});
if(!response.ok)throw new Error(`Local Chatterbox failed: ${response.status} ${await response.text()}`);
const pcm=Buffer.from(await response.arrayBuffer());
const rate=Number(response.headers.get('x-audio-sample-rate'));
if(rate!==24000||pcm.length<1000||pcm.length%2)throw new Error('Invalid local PCM speech output');
const wav=Buffer.alloc(44+pcm.length);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
const output=path.resolve(import.meta.dirname,process.argv[3]||'../public/audio/aiman-greeting.wav');
await writeFile(output,wav);
console.log(`Saved ${output} (${(pcm.length/rate/2).toFixed(2)} s)`);
