class PCMCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.ratio = sampleRate / 16000; this.weight = 0; this.sum = 0;
    this.batch = new Int16Array(1600); this.index = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const value of channel) {
      let remaining = 1;
      while (remaining > 1e-9) {
        const amount = Math.min(remaining, this.ratio - this.weight);
        this.sum += value * amount; this.weight += amount; remaining -= amount;
        if (this.weight >= this.ratio - 1e-9) {
          const sample = Math.max(-1, Math.min(1, this.sum / this.ratio));
          this.batch[this.index++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
          this.sum = 0; this.weight = 0;
          if (this.index === this.batch.length) {
            this.port.postMessage(this.batch.buffer, [this.batch.buffer]);
            this.batch = new Int16Array(1600); this.index = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMCapture);
