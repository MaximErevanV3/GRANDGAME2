// ============================================================
//  AudioFX — процедурный звук на WebAudio: двигатель, занос,
//  выстрелы, удары, взрывы, сирена, дождь, UI-блипы.
//  Ноль аудиофайлов — всё синтезируется.
// ============================================================

import { settings } from '../config/settings.js';
import { clamp } from '../core/math.js';

export class AudioFX {
  constructor() {
    this.ctx = null;
    this.sirenOn = false;
    this._sirenPhase = 0;
    this._engineOn = false;
    this._paused = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch (e) { return; }

    const ctx = this.ctx;

    // мастер
    this.master = ctx.createGain();
    this.master.gain.value = settings.volume;
    this.master.connect(ctx.destination);

    // общий буфер шума (1 сек)
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // --- двигатель ---
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 500;
    this.engOsc1 = ctx.createOscillator(); this.engOsc1.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square';
    this.engOsc1.frequency.value = 50;
    this.engOsc2.frequency.value = 27;
    this.engOsc1.connect(this.engFilter);
    this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);
    this.engOsc1.start();
    this.engOsc2.start();

    // --- занос ---
    this.skidGain = ctx.createGain(); this.skidGain.gain.value = 0;
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = this.noiseBuf; skidSrc.loop = true;
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 950;
    this.skidFilter.Q.value = 2.5;
    skidSrc.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.master);
    skidSrc.start();

    // --- сирена ---
    this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();

    // --- дождь ---
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = this.noiseBuf; rainSrc.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'highpass'; rf.frequency.value = 3500;
    rainSrc.connect(rf); rf.connect(this.rainGain);
    this.rainGain.connect(this.master);
    rainSrc.start();
  }

  setVolume(v) { if (this.master) this.master.gain.value = this._paused ? v * 0.15 : v; }

  pause(on) {
    this._paused = on;
    if (this.master) this.master.gain.value = on ? settings.volume * 0.15 : settings.volume;
  }

  rain(on) {
    if (!this.rainGain) return;
    this.rainGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.4);
  }

  startEngine() { this._engineOn = true; }
  stopEngine() {
    this._engineOn = false;
    if (this.engGain) this.engGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    if (this.skidGain) this.skidGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  siren(on, dist = 100) {
    if (!this.ctx) return;
    this.sirenOn = on;
    if (!on) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    else {
      const v = clamp(0.13 * (1 - clamp(dist / 120, 0, 1)), 0.02, 0.13);
      this.sirenGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
    }
  }

  _burst(dur, freq, vol, type = 'noise', filterType = 'lowpass', filterFreq = 800) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(this.master);

    let src;
    if (type === 'noise') {
      src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.playbackRate.value = 1 + Math.random() * 0.3;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = filterFreq;
      src.connect(f); f.connect(g);
    } else {
      src = ctx.createOscillator();
      src.type = type;
      src.frequency.setValueAtTime(freq, t);
      src.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.3), t + dur);
      src.connect(g);
    }
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  shot(vol = 1) {
    this._burst(0.16, 900, 0.35 * vol, 'noise', 'highpass', 600);
    this._burst(0.09, 160, 0.22 * vol, 'square');
  }

  impact(v) {
    const k = clamp(v / 14, 0.15, 1);
    this._burst(0.18, 90, 0.5 * k, 'sine');
    this._burst(0.1, 300, 0.2 * k, 'noise');
  }

  explosion() {
    this._burst(0.9, 60, 0.9, 'sine');
    this._burst(0.8, 200, 0.7, 'noise', 'lowpass', 400);
    this._burst(0.5, 1200, 0.25, 'noise', 'highpass', 900);
  }

  pickup() { this._burst(0.12, 880, 0.2, 'sine'); this._burst(0.16, 1320, 0.15, 'sine'); }
  reload() { this._burst(0.05, 500, 0.15, 'square'); }
  ui() { this._burst(0.06, 640, 0.12, 'sine'); }

  update(dt, game) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const p = game.player;

    // двигатель
    if (this._engineOn && p.mode === 'car' && p.car && game.state === 'playing') {
      const car = p.car;
      const speed = Math.abs(car.vLong);
      const throttle = Math.abs(car.controls.throttle);
      this.engOsc1.frequency.setTargetAtTime(42 + speed * 6.5 + throttle * 22, t, 0.06);
      this.engOsc2.frequency.setTargetAtTime(21 + speed * 3.4, t, 0.06);
      this.engFilter.frequency.setTargetAtTime(300 + speed * 34, t, 0.08);
      this.engGain.gain.setTargetAtTime(0.045 + throttle * 0.05, t, 0.08);

      // занос
      const slip = Math.abs(car.vLat);
      const level = clamp((slip - 3.5) / 8, 0, 1) * clamp(speed / 6, 0, 1);
      this.skidGain.gain.setTargetAtTime(level * 0.16, t, 0.05);
    } else if (this.engGain) {
      this.engGain.gain.setTargetAtTime(0, t, 0.15);
      this.skidGain.gain.setTargetAtTime(0, t, 0.1);
    }

    // сирена — двухтоновая
    if (this.sirenOn) {
      this._sirenPhase += dt;
      const hi = (this._sirenPhase % 0.9) < 0.45;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 935 : 660, t, 0.03);
    }
  }
}
