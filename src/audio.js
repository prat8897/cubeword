// Fully synthesised sound: no audio files, so the site stays a handful of static assets.

const PENTA = [0, 2, 4, 7, 9];
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ambientOn = false;
    this.ambient = null;
    this.unlocked = false;
  }

  ensure() {
    if (!this.unlocked) return false;
    if (!this.enabled && !this.ambientOn) return false;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(c.destination);
      // cheap shimmer reverb: feedback delay through a lowpass
      this.send = c.createGain();
      this.send.gain.value = 0.35;
      const d1 = c.createDelay(); d1.delayTime.value = 0.19;
      const d2 = c.createDelay(); d2.delayTime.value = 0.29;
      const fb = c.createGain(); fb.gain.value = 0.38;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      this.send.connect(d1); this.send.connect(d2);
      d1.connect(lp); d2.connect(lp);
      lp.connect(fb); fb.connect(d1); fb.connect(d2);
      lp.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  _voice(freq, t0, dur, { type = 'sine', gain = 0.12, attack = 0.005, partials = null, send = 0.4 } = {}) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const sends = c.createGain();
    sends.gain.value = send;
    g.connect(this.master);
    g.connect(sends);
    sends.connect(this.send);
    const list = partials || [[1, 1]];
    for (const [mul, amp] of list) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const og = c.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  }

  key(i = 0) {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const note = 60 + PENTA[i % 5] + 12 * ((i / 5) | 0 % 2);
    this._voice(midi(note), t, 0.22, { type: 'triangle', gain: 0.09, partials: [[1, 1], [2, 0.25]], send: 0.25 });
  }
  erase() {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    this._voice(midi(52), t, 0.12, { type: 'triangle', gain: 0.06, send: 0.1 });
  }
  select() {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    this._voice(midi(76), t, 0.08, { type: 'sine', gain: 0.035, send: 0.1 });
  }
  wordDone() {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const bell = [[1, 1], [2.76, 0.4], [5.4, 0.15]];
    this._voice(midi(79), t, 0.9, { gain: 0.1, partials: bell, send: 0.6 });
    this._voice(midi(84), t + 0.11, 1.1, { gain: 0.09, partials: bell, send: 0.6 });
  }
  wrong() {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    this._voice(midi(45), t, 0.35, { type: 'sine', gain: 0.12, send: 0.1 });
    this._voice(midi(46), t, 0.35, { type: 'sine', gain: 0.08, send: 0.1 });
  }
  checkOk() {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    this._voice(midi(81), t, 0.5, { gain: 0.07, partials: [[1, 1], [2.76, 0.3]], send: 0.5 });
  }
  reveal() {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this._voice(midi(67 + PENTA[i + 1]), t + i * 0.07, 0.5, { gain: 0.05, partials: [[1, 1], [2, 0.3]] });
  }
  whoosh() {
    if (!this.enabled || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.7);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.55);
    f.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  win() {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const bell = [[1, 1], [2.76, 0.35], [5.4, 0.12]];
    const seq = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    seq.forEach((s, i) => this._voice(midi(60 + s), t + i * 0.09, 1.6, { gain: 0.09, partials: bell, send: 0.7 }));
    [0, 4, 7, 12].forEach((s) => this._voice(midi(72 + s), t + seq.length * 0.09 + 0.05, 2.8, { gain: 0.07, partials: bell, send: 0.8 }));
  }

  setAmbient(on) {
    this.ambientOn = on;
    if (on) {
      if (!this.ensure()) return;
      if (this.ambient) return;
      const c = this.ctx;
      const out = c.createGain();
      out.gain.value = 0.0001;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.7;
      lp.connect(out); out.connect(this.master); out.connect(this.send);
      const oscs = [];
      [[110, 0], [164.81, 5], [220, -4], [277.18, 3], [329.63, -6]].forEach(([f, det], i) => {
        const o = c.createOscillator();
        o.type = i % 2 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        const g = c.createGain();
        g.gain.value = 0.22 / (1 + i * 0.5);
        o.connect(g); g.connect(lp);
        o.start();
        oscs.push(o);
      });
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.07;
      const lg = c.createGain();
      lg.gain.value = 260;
      lfo.connect(lg); lg.connect(lp.frequency);
      lfo.start();
      out.gain.exponentialRampToValueAtTime(0.1, c.currentTime + 3);
      this.ambient = { out, oscs, lfo };
    } else if (this.ambient && this.ctx) {
      const { out, oscs, lfo } = this.ambient;
      const t = this.ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      oscs.forEach((o) => o.stop(t + 1.3));
      lfo.stop(t + 1.3);
      this.ambient = null;
    }
  }
}
