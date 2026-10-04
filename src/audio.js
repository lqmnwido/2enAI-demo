// PCM is kept binary end-to-end. No browser speech recognition or synthesis.
export class PCMPlayer {
  constructor(context) {
    this.context = context;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(context.destination);
    this.samples = new Float32Array(256);
    this.nodes = new Set();
    this.generation = 0;
  }
  level() {
    this.analyser.getFloatTimeDomainData(this.samples);
    return Math.min(1, Math.sqrt(this.samples.reduce((a, x) => a + x * x, 0) / this.samples.length) * 8);
  }
  stop() {
    this.generation++;
    for (const node of this.nodes) { try { node.stop(); } catch { /* already ended */ } node.disconnect(); }
    this.nodes.clear();
  }
  async play(response, signal, onStart) {
    const generation = this.generation;
    const rate = Number(response.headers.get('X-Audio-Sample-Rate') || 24000);
    const reader = response.body.getReader();
    let pending = new Uint8Array(0), next = this.context.currentTime + .08, started = false;
    const ended = [];
    try {
      while (true) {
        const {value, done} = await reader.read();
        if (signal?.aborted || generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
        if (done) break;
        const bytes = new Uint8Array(pending.length + value.length);
        bytes.set(pending); bytes.set(value, pending.length);
        const count = Math.floor(bytes.length / 2);
        pending = bytes.slice(count * 2);
        if (!count) continue;
        const view = new DataView(bytes.buffer);
        const buffer = this.context.createBuffer(1, count, rate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < count; i++) data[i] = view.getInt16(i * 2, true) / 32768;
        const node = this.context.createBufferSource();
        node.buffer = buffer; node.connect(this.analyser); this.nodes.add(node);
        ended.push(new Promise(resolve => { node.onended = () => { this.nodes.delete(node); node.disconnect(); resolve(); }; }));
        next = Math.max(next, this.context.currentTime + .025);
        node.start(next); next += buffer.duration;
        if (!started) { started = true; onStart(); }
        // Bound scheduled audio so cancellation and memory use stay predictable.
        while (next - this.context.currentTime > 3 && !signal?.aborted && generation === this.generation)
          await new Promise(resolve => setTimeout(resolve, 40));
      }
      if (pending.length) throw new Error('The speech stream ended with an incomplete PCM sample.');
      if (!started) throw new Error('The speech model returned no audio.');
      await Promise.all(ended);
    } catch (error) { this.stop(); await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
  }
}

export async function openMicrophone(context, onPCM) {
  const stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
  try {
    await context.audioWorklet.addModule('/audio/capture-worklet.js');
    const source = context.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(context, 'pcm-capture');
    const mute = context.createGain(); mute.gain.value = 0;
    capture.port.onmessage = event => onPCM(event.data);
    source.connect(capture); capture.connect(mute); mute.connect(context.destination);
    return () => { stream.getTracks().forEach(track => track.stop()); source.disconnect(); capture.disconnect(); mute.disconnect(); capture.port.close(); };
  } catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
}
