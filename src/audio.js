export class Sound {
  constructor() { this.ctx = null; }

  start() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    this.noise = buf;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.room = ctx.createBiquadFilter(); this.room.type = 'lowpass'; this.room.frequency.value = 160;
    this.roomGain = ctx.createGain(); this.roomGain.gain.value = 0.05;
    src.connect(this.room).connect(this.roomGain).connect(ctx.destination); src.start();
  }

  burst(ms, filterType, freq, q, gain) {
    if (!this.ctx) return;
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    src.connect(f).connect(g).connect(ctx.destination); src.start(); src.stop(ctx.currentTime + ms / 1000);
  }

  setRoom(size01) { if (this.room) this.room.frequency.value = 120 + 140 * size01; }
  step(inWater) { inWater ? this.burst(140, 'lowpass', 320, 1.5, 0.25) : this.burst(60, 'bandpass', 800, 1, 0.18); }
  wings() { for (let i = 0; i < 6; i++) setTimeout(() => this.burst(40, 'bandpass', 1400, 2, 0.08), i * 70); }

  drip() {
    if (!this.ctx) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(1200, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.25);
    g.gain.setValueAtTime(0.08, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.3);
  }
}
