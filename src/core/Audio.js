// Placeholder sound design: everything is synthesised with WebAudio, no files needed.
// Swap `play(name)` cases for real samples later.

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.nextNote = 0;
    this.step = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.22;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  tone(freq, dur, { type = 'sine', vol = 0.25, attack = 0.005, slideTo = null, delay = 0, bus = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.2, freq = 1200, slideTo = null, q = 1.2, delay = 0, type = 'bandpass' } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  arp(notes, gap, opts) {
    notes.forEach((n, i) => this.tone(n, opts.dur ?? 0.18, { ...opts, delay: (opts.delay || 0) + i * gap }));
  }

  play(name, arg = 0) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'click': this.tone(880, 0.06, { type: 'square', vol: 0.05 }); break;
      case 'hover': this.tone(1320, 0.03, { type: 'sine', vol: 0.03 }); break;
      case 'nope': this.tone(150, 0.14, { type: 'square', vol: 0.06, slideTo: 110 }); break;
      case 'throw':
        this.noise(0.28, { vol: 0.22, freq: 700, slideTo: 2600, q: 2 });
        this.tone(520, 0.1, { type: 'triangle', vol: 0.1, slideTo: 780 });
        break;
      case 'land': this.tone(200, 0.12, { type: 'sine', vol: 0.25, slideTo: 90 }); this.noise(0.06, { vol: 0.08, freq: 400 }); break;
      case 'slide': this.noise(0.12, { vol: 0.05, freq: 300, slideTo: 900, q: 0.8 }); break;
      case 'deliver': this.arp([1046, 1568], 0.07, { type: 'triangle', vol: 0.16, dur: 0.16 }); break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noise(0.06, { vol: 0.16, freq: 500, delay: i * 0.16, type: 'lowpass' });
        break;
      case 'happy': this.arp([523, 659, 784, 1046], 0.07, { type: 'triangle', vol: 0.14, dur: 0.2 }); break;
      case 'angry':
        this.tone(220, 0.4, { type: 'sawtooth', vol: 0.08, slideTo: 110 });
        this.tone(233, 0.4, { type: 'sawtooth', vol: 0.06, slideTo: 104 });
        break;
      case 'waste': this.tone(392, 0.18, { type: 'square', vol: 0.05, slideTo: 180 }); this.noise(0.2, { vol: 0.08, freq: 300 }); break;
      case 'combo': {
        const base = 523 * Math.pow(2, Math.min(arg, 12) / 12);
        this.arp([base, base * 1.5], 0.06, { type: 'triangle', vol: 0.12, dur: 0.14 });
        break;
      }
      case 'bell':
        this.tone(1318, 0.7, { type: 'sine', vol: 0.1 });
        this.tone(1976, 0.5, { type: 'sine', vol: 0.04, delay: 0.01 });
        break;
      case 'levelup': this.arp([523, 659, 784, 1046, 1318], 0.08, { type: 'triangle', vol: 0.15, dur: 0.25 }); break;
      case 'gameover': this.arp([523, 466, 392, 349, 262], 0.22, { type: 'triangle', vol: 0.15, dur: 0.4 }); break;
      case 'start': this.arp([392, 523, 659, 784], 0.09, { type: 'triangle', vol: 0.14, dur: 0.22 }); break;
      default: break;
    }
  }

  // Gentle generative pentatonic "guzheng" loop.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    const beat = 0.36;
    this.musicTimer = setInterval(() => {
      while (this.nextNote < this.ctx.currentTime + 0.4) {
        const t = this.nextNote - this.ctx.currentTime;
        const s = this.step++;
        if (s % 8 === 0) this.tone(110 * Math.pow(2, PENTA[(s / 8) % 3 | 0] / 12), 2.4, { type: 'sine', vol: 0.18, delay: t, attack: 0.05, bus: this.musicBus });
        if (Math.random() < 0.62) {
          const deg = PENTA[Math.floor(Math.random() * 5)] + 12 * Math.floor(Math.random() * 2);
          const f = 392 * Math.pow(2, deg / 12);
          this.tone(f, 0.9, { type: 'triangle', vol: 0.12, delay: t, attack: 0.003, bus: this.musicBus });
          this.tone(f * 2.01, 0.3, { type: 'sine', vol: 0.03, delay: t, attack: 0.003, bus: this.musicBus });
        }
        this.nextNote += beat * (Math.random() < 0.2 ? 0.5 : 1);
      }
    }, 120);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
