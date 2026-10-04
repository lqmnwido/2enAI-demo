# 2enAI Enterprise AI Solutions · AIMAN

Portal Bahasa Melayu bermula dengan logo 3D, pemasangan robot AIMAN dan halaman Enterprise AI Solutions. Navigasi memaparkan e-Aduan serta Jawi/tulisan tangan; penyelidikan Arkib Negara disediakan melalui AIMAN dengan sumber setempat. Antara muka mengikut warna serta susun atur [e-aduan-fe](https://github.com/lqmnwido/e-aduan-fe). Ruang Jawi menerima PNG, JPG, WebP dan PDF berbilang muka surat; teks, transliterasi dan terjemahan ditunjukkan bersebelahan dengan imej dan kotak perkataan. ASR dan chat menggunakan Qwen melalui vLLM; suara Bahasa Melayu menggunakan Chatterbox Multilingual dan Jawi bercetak sejarah menggunakan Kraken OCR setempat.

## Buka projek

Pada EndeavourOS dengan NVIDIA RTX 5070 Laptop 8 GB, pasang pemacu NVIDIA melalui sistem anda dan pastikan `nvidia-smi` berfungsi. Selepas itu, pemasangan dan pelancaran masing-masing memerlukan satu skrip:

```bash
git clone https://github.com/lqmnwido/2enAI-demo.git
cd 2enAI-demo
./install.sh
./serve.sh
```

`install.sh` memasang Node, Python 3.11, FFmpeg, OCR, Chatterbox dan berat model. Ia menggunakan vLLM sedia ada jika ada pada `PATH`; jika tiada, ia memasang vLLM dalam `.venv-vllm`. Jika persekitaran vLLM anda tidak pada `PATH`, tetapkan `VLLM_BIN` kepada laluannya sebelum memasang. Skrip juga memuat turun sampel suara dialog yang dibenarkan pengguna daripada laman asal dan menjadikannya prompt suara setempat; tetapkan `AIMAN_VOICE_FILE` jika anda ingin menggunakan salinan sendiri. Pemasangan memerlukan Internet, ruang cakera untuk beberapa model dan kata laluan `sudo` untuk pakej sistem. Ia tidak memasang pemacu NVIDIA.

Untuk RTX 5070, pemasang menguji CUDA pada vLLM dan Chatterbox, memasang PyTorch CUDA 12.8 untuk Chatterbox serta menetapkan perkongsian VRAM ASR 0.38 dan chat 0.34 jika `.env` masih menggunakan nilai asal 6 GB. Chatterbox kekal pada CPU ketika menunggu dan dipindahkan ke GPU untuk suara. Nilai ini ialah titik mula untuk 8 GB, bukan jaminan prestasi: ujian hujung ke hujung masih perlu dibuat pada komputer EndeavourOS sebenar. [vLLM menyatakan Blackwell memerlukan CUDA 12.8 atau lebih baharu](https://docs.vllm.ai/en/stable/getting_started/installation/gpu/); [Chatterbox 0.1.7 memin PyTorch 2.6](https://github.com/resemble-ai/chatterbox/blob/master/pyproject.toml), yang diganti dalam persekitaran TTS sahaja.

`serve.sh` menghidupkan ASR dahulu, kemudian chat vLLM, TTS, OCR, backend Express dan frontend Vite. Buka **http://127.0.0.1:5173**; Vite memproksi API dan kedua-dua WebSocket ke backend pada port 3001. `Ctrl+C` menghentikan proses yang dimulakan oleh skrip ini. Fail `.env` menyimpan laluan persekitaran. Jalankan `bash scripts/check-local.sh` jika servis gagal hidup. Klip salam dan pengesahan aduan dijana di latar belakang pada permulaan pertama. Semua pelayan inferens terikat pada `127.0.0.1`.

`npm run local:install` dan `npm run local:dev` kekal tersedia jika Node, Python, FFmpeg, sampel suara dan vLLM telah disediakan sendiri. Kedua-dua skrip akar projek di atas ialah laluan pemasangan penuh untuk EndeavourOS.

Untuk Windows/WSL atau apabila anda mahu mengurus inferens secara berasingan:

```powershell
npm install
npm run build
npm start
```

Buka `http://127.0.0.1:3001`. Untuk pembangunan, gunakan `npm run dev`. Fail `.env.example` menerangkan URL perkhidmatan tempatan. Teks carian, borang dan model 3D boleh digunakan sebelum semua perkhidmatan inferens dihidupkan; butang yang memerlukan model akan menunjukkan keadaan sambungan.

### Pemasangan manual pada Linux lain

Untuk Linux selain EndeavourOS/Arch, sediakan Node.js 20+, Python 3.11 atau 3.12, FFmpeg, CUDA/NVIDIA dan vLLM sendiri. Kemudian jalankan `bash scripts/setup-linux.sh` serta `bash scripts/dev-local.sh`. Skrip penyediaan manual menggunakan vLLM sedia ada pada `PATH` atau `VLLM_BIN` dalam `.env`, tanpa menggantikannya. Persekitaran OCR/TTS dijana sebagai `.venv-ocr` dan `.venv-tts`. Periksa fail penting dengan `bash scripts/check-local.sh`.

Repositori menyertakan kod, korpus teks kecil, model GLB, sumber Blender dan render. Berat model, muat turun media Arkib, cache, sampel suara pelakon serta klip suara terjana **tidak diterbitkan**. Pemasang memuat turun berat OCR Apache-2.0 daripada [model Jawi Kraken](https://huggingface.co/culturalheritagenus/Jawi-OCR-Kraken-v1/tree/main) ke `inference/models/`; tetapkan `SKIP_MODEL_DOWNLOAD=1` jika anda sudah menyalinnya secara manual. Salin sampel suara yang dibenarkan ke `inference/voice/aiman-voice-prompt.wav`. Muat turun model Qwen/Chatterbox pada penggunaan pertama; selepas itu cache Hugging Face setempat boleh digunakan dengan `HF_HUB_OFFLINE=1`. Untuk menyalin semula media Arkib pada peranti baharu, jalankan skrip import/cermin di bawah sekali semasa dalam talian. Sehingga salinan itu lengkap, petikan teks daripada `data/corpus.json` masih boleh dicari tetapi fail media setempat mungkin tiada.

`npm run local:dev` mengurus turutan servis itu secara automatik. Jika menjalankannya secara manual, dalam empat terminal jalankan `bash inference/start-asr.sh`, tunggu `/health` pada port 8001 sedia, kemudian `bash inference/start-chat.sh`, `bash inference/start-tts.sh` dan `bash inference/start-vision.sh`. Dalam terminal kelima, jalankan `npm start`; buka `http://127.0.0.1:3001`. Port inferens terikat pada `127.0.0.1`; tetapan GPU dalam `.env` bermula dengan profil 6 GB dan mungkin perlu dilaras mengikut kad anda. Jalankan `npm test`, `npm run build`, dan ujian OCR imej sebenar sebelum digunakan untuk data penting.

`local:dev` menghasilkan dua klip tetap pada peranti itu di latar belakang jika belum ada. Untuk penjanaan manual selepas Chatterbox dan gateway sedia, jalankan `node scripts/generate-greeting.mjs` dan `node scripts/generate-analysis-cue.mjs`. Skrip ini menggunakan suara rujukan setempat; fail suara tersebut sengaja tidak disertakan dalam repositori awam.

## Perkhidmatan inferens tempatan

Gunakan Linux/WSL dengan NVIDIA CUDA. Kekalkan persekitaran Python berasingan bagi vLLM/ASR, OCR dan Chatterbox. OCR menggunakan model Jawi Kraken 16 MB dalam `inference/models/`; Chatterbox 0.1.7 dipasang dalam `.venv-tts`. Pada mesin WSL asal dengan RAM 16 GB, had WSL 11 GB RAM dan 4 GB swap membantu mengelakkan kehabisan memori. ASR mesti sedia sepenuhnya sebelum chat dimulakan, kerana profil cache audio ASR boleh gagal jika chat telah menempah VRAM. OCR dan Chatterbox boleh dimulakan selepas itu.

```bash
bash inference/start-asr.sh     # Qwen3ASRModel.LLM streaming, :8001
bash inference/start-chat.sh    # Qwen3, vLLM, :8000
bash inference/start-tts.sh     # Chatterbox Multilingual, Bahasa Melayu, :8091
bash inference/start-vision.sh  # Kraken Jawi OCR pada CPU, :8002
```

ASR menggunakan bahasa Melayu secara lalai dan menerima PCM16 mono 16 kHz dalam bingkai tepat 100 ms (3,200 bait) melalui WebSocket `/stream`. `Qwen3ASRModel.LLM` mula memproses selepas 600 ms audio terkumpul dan seterusnya menerima blok 500 ms; 400 ms senyap menamatkan ujaran. Chat menggunakan `/v1/chat/completions`. Chatterbox menjana audio PCM melalui `/speech` dengan `language_id="ms"` dan rujukan suara dalam `inference/voice/aiman-voice-prompt.wav`. Kraken menerima imej melalui `/analyze`, mengembalikan perkataan bersama kotak lokasi dan skor keyakinan, serta membiarkan transliterasi yang tidak dapat disahkan kosong. Penyemak `/api/health` hanya menunjukkan servis yang berjaya memuatkan model. Inferens tidak menggunakan suara pelayar atau perkhidmatan awan.

Pada GTX 1660 Ti 6 GB, ASR dan chat vLLM menetap pada GPU dengan had 0.35 dan 0.32. Chatterbox kekal pada CPU semasa menunggu. Selepas jawapan teks dihasilkan, gateway meletakkan kedua-dua enjin vLLM dalam mod tidur, memindahkan Chatterbox ke GPU untuk penjanaan suara, kemudian mengembalikannya ke CPU dan membangunkan vLLM. Giliran ini disirikan untuk seorang pengguna; permintaan suara baharu mungkin perlu menunggu giliran sebelumnya. `/api/health` menyemak keempat-empat servis. vLLM chat mengaktifkan laluan tidur pembangunan tetapi terikat pada `127.0.0.1`; jangan dedahkan port inferens terus ke rangkaian luar.

Ujian mesin ini: `npm test` (21/21), `npm run build`, `python scripts/test-jawi-smoke.py`, `node scripts/check-asr-stream.mjs`, `node scripts/test-voice-roundtrip.mjs` lulus. ASR yang dipanaskan semasa mula mengeluarkan transkripsi separa pertama dalam kira-kira 1.5 saat pada ujian pertama pada sampel suara; teks ASR tetap draf semakan kerana sampel itu tidak ditranskrip dengan tepat. Suara baharu pendek mengambil sekitar 9.6 saat pada ujian selepas berat Chatterbox disimpan dalam FP16 semasa menunggu; petikan lebih panjang mengambil lebih lama. Jawapan teks Darurat 1948 dengan petikan setempat mengambil 0.41 saat. Frasa pembuka arkib yang dipraproses mula dimainkan dalam 0.43 saat; petikan dinamik yang belum dicache masih memerlukan penjanaan suara (27 saat untuk keseluruhan ujian dua segmen). Selepas jawapan demo yang sama dicache, teks dan kedua-dua segmen audio diterima dalam kira-kira 0.4 saat. Jalankan `node scripts/prewarm-voice.mjs` sekali untuk menjana audio bagi frasa navigasi tetap serta jawapan bersumber untuk soalan demo Darurat 1948; selepas pelayan Node dimulakan semula, frasa itu dimainkan daripada cache setempat hampir serta-merta. Audio jawapan dinamik masih dijana oleh Chatterbox dan boleh mengambil lebih lama.

Model Kraken ini dilatih untuk Jawi **bercetak**, bukan tulisan tangan lama. Pengesan baris mempunyai laluan khas untuk dakwat hitam/merah pada imej berilustrasi; imej contoh papan kayu kini dibaca sebagai tiga baris dengan enam perkataan dan kotak perkataan terjajar. Ujian sintetik masih tidak membaca angka 1948 dengan boleh dipercayai, jadi angka yang hilang atau berkeyakinan rendah mesti disemak pada imej asal. Rumi/BM/English menggunakan kamus serta beberapa frasa setempat yang kecil, bukan terjemahan umum. Ini belum layak dilabel sebagai pengecaman tulisan tangan atau terjemahan Jawi penuh yang sedia produksi.

Imbasan sejarah kabur 292×506 piksel dalam `tests/fixtures/jawi-archive-blurry.png` kini dipisahkan kepada 18 baris dan 134 kotak perkataan; ujian `JAWI_TEST_MODE=historical python scripts/test-jawi-illustrated.py tests/fixtures/jawi-archive-blurry.png` memeriksa liputan itu. Namun, tiada satu pun perkataan pada contoh ini dapat ditransliterasi dengan keyakinan yang mencukupi. UI memaparkan sumber Jawi untuk semakan dan satu amaran bagi panel Rumi/BM/English tanpa mengisi terjemahan rekaan. Imej resolusi lebih tinggi atau transkripsi manusia masih diperlukan untuk bacaan tepat sepenuhnya.

## Indeks arkib

Pengimportan yang boleh disambung semula:

```powershell
node --use-system-ca scripts/import-arkib.mjs
node --use-system-ca scripts/mirror-arkib.mjs
```

`--use-system-ca` diperlukan pada mesin Windows ini untuk mempercayai sijil laman Arkib. Pengimport mengikut pautan halaman Bahasa Melayu dan PDF awam pada `www.arkib.gov.my`, menghormati `robots.txt` jika disediakan, dan melambatkan setiap permintaan. `data/import-status.json` merekod bilangan halaman diperiksa, dokumen, URL belum diproses serta kegagalan. Jalankan semula arahan untuk meneruskan giliran yang disimpan. Import semasa selesai dengan 5,837 rekod teks mentah; 3,867 daripadanya layak dicari selepas menolak peta laman, halaman kategori dan halaman kosong yang hanya memaparkan unsur templat. Skrip cermin media menyimpan PDF, ebook, imej, audio, video dan fail awam yang ditemui pada halaman yang diindeks ke `data/media/`; manifest dan kemajuan disimpan supaya muat turun boleh diteruskan. Ia berhenti apabila ruang bebas jatuh di bawah 5 GB. Dokumen dan petikan pada halaman membuka salinan setempat sahaja. Bahan pada portal lain, bahan terlindung dan PDF imbasan tanpa teks masih tidak termasuk dalam carian teks.

AIMAN memadankan soalan dengan petikan indeks. Model Qwen memilih petikan; pelayan menerima hanya petikan yang sama tepat dengan dokumen dan mengandungi maklumat lebih daripada tajuk atau perkataan soalan. Jika model tidak dapat memilih petikan sah, pelayan mengekstrak ayat relevan terus daripada sumber dan melabelkannya sebagai petikan. Jika bukti tidak mencukupi, jawapan ditolak. Jika model chat tidak hidup, petikan carian dilabel untuk semakan dan tidak dianggap sebagai jawapan AI.

## Analisis e-Aduan

Selepas `Susun dengan AIMAN`, Qwen melalui vLLM mengekstrak fakta daripada keseluruhan keterangan secara berperingkat, kemudian menjana tajuk pendek dan ringkasan daripada fakta yang mempunyai petikan asal. Analisis membezakan 5W1H, jumlah, pihak terlibat, bukti sokongan dan kronologi. Tema dipilih daripada kategori tetap; medan yang tiada memunculkan soalan susulan. Nilai dan tarikh dalam rumusan diperiksa terhadap petikan, termasuk nombor Melayu yang disebut dengan perkataan. Setiap hasil ialah draf dakwaan pengadu untuk semakan, disimpan pada pelayar dan dieksport ke PDF setempat. Tiada penghantaran aduan rasmi disambungkan.

## Blender

Sumber boleh dibina semula dengan Blender 5.2:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python blender/build_robot.py
```

Skrip menyimpan `blender/aiman.blend`, `public/models/aiman.glb`, serta render front, side, back dan hero. Enam animasi GLB: `Wave`, `Jump`, `Nod`, `HeadShake`, `Blink` dan `Talk`. Muka serta logo dibentuk mengikut permukaan kepala/badan, dan animasi mata/mulut menggunakan morph target agar tidak terpisah semasa bergerak. Rujukan visual: `C:/Users/Wido/Downloads/Cute Robot Orthographic Turntable.png`; logo 2EN APPS asal: `C:/Users/Wido/Pictures/photo_2022-05-27_09-42-15.jpg`.

`scripts/vectorize-logo.py` menjejak bentuk logo 2EN APPS ke kontur vektor. `blender/build_logo.py` menghasilkan logo 3D tersendiri dalam `public/branding/2en-apps-3d.glb` dan render berlatar lutsinar `public/branding/2en-apps-3d.png` yang digunakan pada pengepala halaman.



## Portal dan suara AIMAN

Portal bermula dengan lambang 3D, pemasangan bahagian model dan peralihan AIMAN ke ruang sembang. Navigasi utama menunjukkan e-Aduan dan Jawi; carian Arkib masih tersedia melalui AIMAN dan laluan `#arkib`, tetapi tabnya tersembunyi. Pembukaan dimainkan semula selepas setiap muat semula halaman.

Sampel dialog pelakon suara yang dibenarkan pengguna disimpan dalam `inference/voice/`; `aiman-voice-prompt.wav` ialah potongan 8 saat untuk rujukan timbre Chatterbox. Pembukaan menggunakan `public/audio/aiman-greeting.wav` yang dijana dengan Chatterbox. Jawapan baharu menggunakan WebSocket `/assistant-stream`: teks dan sumber sah dihantar dahulu, disusuli audio PCM bersegmen mengikut teks yang sama; gerak mulut menerima aras audio sebenar. Jika servis suara belum sedia, jawapan kekal berbentuk teks. Penjanaan menggunakan kod bahasa `ms`; sebutan dan keserupaan suara perlu dinilai dengan mendengar output sebenar.

PDF e-Aduan mengadaptasi reka bentuk laporan [sufree11/e-Aduan](https://github.com/sufree11/e-Aduan): kepala biru tua, aksen emas, kotak metadata, medan bernombor, ruang pengesahan dan nombor halaman. Laporan AIMAN menambah analisis 5W1H, bukti, kronologi, rumusan serta transkrip asal sebagai lampiran. PDF kekal draf untuk semakan pengadu. Naratif laporan menggunakan kata ganti orang ketiga (`pengadu`); petikan `Asal` mengekalkan kata-kata sebenar. Selepas PDF siap, AIMAN menyebut hanya "Analisis aduan siap." melalui klip Chatterbox setempat `public/audio/aiman-analysis-ready.wav`, tanpa menambah mesej panjang ke ruang sembang.

Status ASR `busy` bermaksud vLLM sedang tidur sementara GPU menjana suara, bukan servis gagal. Butang mikrofon memanggil `/api/asr/ready` untuk menunggu giliran suara dan membangunkan semula ASR jika perlu. Petikan yang dicadangkan model mesti bertindih dengan istilah soalan dalam teks sumber sebenar; petikan umum yang tidak berkaitan ditolak. Suara untuk jawapan arkib tetap boleh lambat jika teks baharu belum ada dalam cache tempatan, terutama pada GPU 6 GB.
