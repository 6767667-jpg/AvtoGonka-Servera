/* Процедурный звук шутера: выстрелы, попадания, шаги, закупка. Без ассетов. */

export class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private noise(dur: number, vol: number, filterFreq: number, type: BiquadFilterType = "lowpass", when = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", slideTo?: number, when = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** выстрел игрока */
  shot(kind: "pistol" | "rifle") {
    if (kind === "rifle") {
      this.noise(0.13, 0.85, 1500);
      this.noise(0.3, 0.5, 420);
      this.tone(130, 0.16, 0.7, "triangle", 40);
      this.noise(0.05, 0.5, 5200, "highpass");
    } else {
      this.noise(0.09, 0.6, 1900);
      this.tone(180, 0.1, 0.45, "triangle", 60);
      this.noise(0.04, 0.35, 5600, "highpass");
    }
  }

  /** выстрел бота (дальний) */
  distantShot(dist: number) {
    const v = Math.max(0.06, 0.5 - dist * 0.012);
    this.noise(0.14, v, 620);
    this.tone(110, 0.12, v * 0.5, "triangle", 45);
  }

  dry() {
    this.tone(1900, 0.03, 0.2, "square");
    this.noise(0.03, 0.15, 4000, "highpass");
  }

  reload(stage: number) {
    if (stage === 0) {
      this.noise(0.06, 0.3, 2400, "bandpass");
      this.tone(700, 0.05, 0.18, "square", 500);
    } else if (stage === 1) {
      this.noise(0.05, 0.25, 1800, "bandpass", 0);
      this.tone(500, 0.06, 0.15, "square", 380);
    } else {
      this.noise(0.07, 0.35, 2800, "bandpass");
      this.tone(900, 0.07, 0.22, "square", 620);
    }
  }

  switchWeapon() {
    this.noise(0.06, 0.22, 2000, "bandpass");
    this.tone(600, 0.06, 0.14, "square", 420);
  }

  hit(head: boolean) {
    if (head) {
      this.tone(2300, 0.05, 0.4, "square");
      this.tone(2900, 0.07, 0.35, "square", 2400, 0.045);
    } else {
      this.tone(1750, 0.05, 0.35, "square", 1500);
    }
  }

  kill() {
    this.tone(1200, 0.06, 0.3, "square", 900);
    this.tone(500, 0.14, 0.4, "triangle", 220, 0.05);
  }

  hurt() {
    this.tone(140, 0.18, 0.5, "sawtooth", 70);
    this.noise(0.12, 0.25, 700);
  }

  foot(alt: boolean) {
    this.noise(0.05, 0.07, alt ? 480 : 420);
  }

  buy() {
    this.tone(880, 0.07, 0.25, "sine");
    this.tone(1320, 0.1, 0.25, "sine", undefined, 0.07);
  }

  deny() {
    this.tone(220, 0.14, 0.3, "sawtooth", 160);
  }

  beep(final = false) {
    this.tone(final ? 1180 : 880, final ? 0.34 : 0.1, 0.3, "sine");
  }

  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 0.3, "triangle", undefined, i * 0.11));
  }

  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.26, 0.3, "triangle", undefined, i * 0.13));
  }

  click() {
    this.tone(1400, 0.035, 0.16, "square", 1000);
  }
}
