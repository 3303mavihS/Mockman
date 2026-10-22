// Browser audio capture for MockMan.
// getUserMedia -> AudioWorklet (chunks posted to main thread) -> on stop:
// downsample to 16kHz mono -> PCM16 WAV blob, exactly what the server-side
// Apple Speech transcriber binary expects.

const WORKLET_SRC = `
class PCMCollector extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length) {
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('pcm-collector', PCMCollector);
`;

export class WavRecorder {
  constructor() {
    this.recording = false;
    this._chunks = [];
    this._context = null;
    this._stream = null;
    this._node = null;
  }

  async start() {
    if (this.recording) return;
    this._chunks = [];
    this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._context = new AudioContext();
    const url = URL.createObjectURL(
      new Blob([WORKLET_SRC], { type: "application/javascript" })
    );
    await this._context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const source = this._context.createMediaStreamSource(this._stream);
    this._node = new AudioWorkletNode(this._context, "pcm-collector");
    this._node.port.onmessage = (e) => this._chunks.push(e.data);
    source.connect(this._node);
    this._node.connect(this._context.destination);
    this.recording = true;
  }

  // Returns a WAV Blob, or null if too short (< 0.3s of audio).
  stop() {
    if (!this.recording) return null;
    this.recording = false;
    const chunks = this._chunks;
    const rate = this._context ? this._context.sampleRate : 48000;
    this._cleanup();
    const samples = downsampleTo16k(chunks, rate);
    if (samples.length < 16000 * 0.3) return null;
    return encodeWavPCM16(samples, 16000);
  }

  _cleanup() {
    if (this._node) this._node.disconnect();
    if (this._context) this._context.close();
    if (this._stream) this._stream.getTracks().forEach((t) => t.stop());
    this._node = this._context = this._stream = null;
  }
}

export function downsampleTo16k(chunks, srcRate) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  if (srcRate === 16000) return merged;
  const ratio = srcRate / 16000;
  const out = new Float32Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i++) {
    out[i] = merged[Math.floor(i * ratio)];
  }
  return out;
}

export function encodeWavPCM16(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// Play an interviewer audio file; resolves when playback finishes.
export function playAudio(url) {
  return new Promise((resolve) => {
    const el = new Audio(url);
    el.onended = resolve;
    el.onerror = resolve;
    el.play().catch(resolve);
  });
}
