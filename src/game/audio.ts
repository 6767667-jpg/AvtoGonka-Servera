/* WebAudio: процедурный звук — мотор, блипы, удары, нитро. Без внешних файлов. */

export class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private engOsc1: OscillatorNode | null = null;
  private engOsc2: OscillatorNode | null = null;
  private engGain: GainNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  muted = false;

  /** Создать контекст (только по пользовательскому жесту). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);

      // белый шум (1 сек)
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // цепочка мотора: 2 осциллятора -> lowpass -> gain
      this.engOsc1 = this.ctx.createOscillator();
      this.engOsc1.type = "sawtooth";
      this.engOsc2 = this.ctx.createOscillator();
      this.engOsc2.type = "square";
      this.engFilter = this.ctx.createBiquadFilter();
      this.engFilter.type = "lowpass";
      this.engFilter.frequency.value = 320;
      this.engFilter.Q.value = 2.2;
      this.engGain = this.ctx.createGain();
      this.engGain.gain.value = 0;
      this.engOsc1.connect(this.engFilter);
      this.engOsc2.connect(this.engFilter);
      this.engFilter.connect(this.engGain);
      this.engGain.connect(this.master);
      this.engOsc1.start();
      this.engOsc2.start();

      // ветер/дождь — фильтрованный шум
      const windSrc = this.ctx.createBufferSource();
      windSrc.buffer = this.noiseBuf;
      windSrc.loop = true;
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = "bandpass";
      windFilter.frequency.value = 900;
      windFilter.Q.value = 0.4;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      windSrc.start();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  /** Гул мотора: speed01 0..1, nitro — форсаж. */
  engine(speed01: number, nitro: boolean) {
    if (!this.ctx || !this.engOsc1 || !this.engOsc2 || !this.engGain || !this.engFilter) return;
    const t = this.ctx.currentTime;
    const f = 42 + speed01 * 118 + (nitro ? 34 : 0);
    this.engOsc1.frequency.setTargetAtTime(f, t, 0.06);
    this.engOsc2.frequency.setTargetAtTime(f * 0.5 + 3, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(280 + speed01 * 900 + (nitro ? 700 : 0), t, 0.08);
    this.engGain.gain.setTargetAtTime(0.05 + speed01 * 0.1 + (nitro ? 0.05 : 0), t, 0.08);
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(0.012 + speed01 * 0.05 + (nitro ? 0.03 : 0), t, 0.15);
    }
  }

  engineStop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engGain?.gain.setTargetAtTime(0, t, 0.12);
    this.windGain?.gain.setTargetAtTime(0, t, 0.2);
  }

  private osc(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay = 0
  ) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, delay = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  nearMiss(combo: number) {
    this.osc("square", 620 + combo * 70, 980 + combo * 90, 0.11, 0.16);
  }

  pickup() {
    this.osc("triangle", 520, 780, 0.1, 0.22);
    this.osc("triangle", 780, 1180, 0.14, 0.2, 0.08);
  }

  nitro() {
    this.noise(0.7, 0.22, 1600, 0.6);
    this.osc("sawtooth", 160, 520, 0.5, 0.1);
  }

  crash(hard = false) {
    this.noise(0.35, 0.5, 300, 0.5);
    this.noise(0.16, 0.4, 2400, 0.7);
    this.osc("sine", hard ? 90 : 130, 34, 0.4, 0.5);
    if (hard) this.noise(0.8, 0.4, 180, 0.4, 0.05);
  }

  scrape() {
    this.noise(0.09, 0.14, 3200, 2);
  }

  rankUp() {
    this.osc("square", 440, 440, 0.09, 0.16);
    this.osc("square", 587, 587, 0.09, 0.16, 0.09);
    this.osc("square", 880, 880, 0.16, 0.18, 0.18);
  }

  ui() {
    this.osc("square", 340, 520, 0.07, 0.12);
  }

  gameOver() {
    this.osc("sawtooth", 220, 60, 1.1, 0.22);
    this.noise(1.2, 0.3, 240, 0.4);
  }
}
