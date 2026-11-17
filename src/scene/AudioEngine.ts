import { ExploreZone } from './presets';

/**
 * Procedural Web Audio synthesizer for adaptive gothic ambience,
 * room-aware nocturnal wind, 3D spatialized sound emitters (hearth fire,
 * fountain, chandelier hum), and interactive gameplay SFX.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private hearthGain: GainNode | null = null;
  private hearthPanner: PannerNode | null = null;
  private fountainPanner: PannerNode | null = null;
  private chandelierGain: GainNode | null = null;
  private chandelierPanner: PannerNode | null = null;

  private muted = false;
  private started = false;
  private musicTimer = 0;
  private stepCount = 0;
  private currentZone: ExploreZone = 'Extérieur';
  private completionRatio = 0;

  public unlockAndStart(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.65;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.masterGain);

    this.setupAmbientDrone();
    this.setupSpatialEmitters();

    this.started = true;
    this.musicTimer = window.setInterval(() => this.playAdaptiveNote(), 2800);
  }

  private setupAmbientDrone(): void {
    if (!this.ctx || !this.musicGain) return;
    const freqs = [55, 82.41, 110];
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.musicGain) return;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freq;

      filter.type = 'lowpass';
      filter.frequency.value = 260;

      gain.gain.value = idx === 0 ? 0.18 : 0.08;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start();
    });
  }

  private createNoiseBuffer(seconds = 2.5): AudioBuffer | null {
    if (!this.ctx) return null;
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private setupSpatialEmitters(): void {
    if (!this.ctx || !this.masterGain) return;
    const noiseBuffer = this.createNoiseBuffer(3.0);
    if (!noiseBuffer) return;

    // 0. Nocturnal Wind & Drizzle Bed (adapts dynamically between exterior & rooms)
    const wSrc = this.ctx.createBufferSource();
    wSrc.buffer = noiseBuffer;
    wSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 340;
    this.windFilter.Q.value = 0.7;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.075;
    wSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    wSrc.start();

    // 1. Courtyard Fountain water trickle [0, 0.8, 18]
    const fSrc = this.ctx.createBufferSource();
    fSrc.buffer = noiseBuffer;
    fSrc.loop = true;
    const fFilter = this.ctx.createBiquadFilter();
    fFilter.type = 'bandpass';
    fFilter.frequency.value = 950;
    fFilter.Q.value = 1.6;
    const fGain = this.ctx.createGain();
    fGain.gain.value = 0.07;
    this.fountainPanner = this.ctx.createPanner();
    this.fountainPanner.panningModel = 'HRTF';
    this.fountainPanner.distanceModel = 'inverse';
    this.fountainPanner.refDistance = 2.5;
    this.fountainPanner.maxDistance = 22;
    this.fountainPanner.positionX.value = 0;
    this.fountainPanner.positionY.value = 0.8;
    this.fountainPanner.positionZ.value = 18;
    fSrc.connect(fFilter);
    fFilter.connect(fGain);
    fGain.connect(this.fountainPanner);
    this.fountainPanner.connect(this.masterGain);
    fSrc.start();

    // 2. Monumental Hearth fire crackle [-7.7, 1.7, -5.3]
    const hSrc = this.ctx.createBufferSource();
    hSrc.buffer = noiseBuffer;
    hSrc.loop = true;
    const hFilter = this.ctx.createBiquadFilter();
    hFilter.type = 'bandpass';
    hFilter.frequency.value = 520;
    hFilter.Q.value = 0.9;
    this.hearthGain = this.ctx.createGain();
    this.hearthGain.gain.value = 0;
    this.hearthPanner = this.ctx.createPanner();
    this.hearthPanner.panningModel = 'HRTF';
    this.hearthPanner.distanceModel = 'inverse';
    this.hearthPanner.refDistance = 2.2;
    this.hearthPanner.maxDistance = 18;
    this.hearthPanner.positionX.value = -7.7;
    this.hearthPanner.positionY.value = 1.7;
    this.hearthPanner.positionZ.value = -5.3;
    hSrc.connect(hFilter);
    hFilter.connect(this.hearthGain);
    this.hearthGain.connect(this.hearthPanner);
    this.hearthPanner.connect(this.masterGain);
    hSrc.start();

    // 3. Grand Chandelier crystalline hum [0, 7.8, 0]
    const cOsc = this.ctx.createOscillator();
    cOsc.type = 'sine';
    cOsc.frequency.value = 220;
    this.chandelierGain = this.ctx.createGain();
    this.chandelierGain.gain.value = 0;
    this.chandelierPanner = this.ctx.createPanner();
    this.chandelierPanner.panningModel = 'HRTF';
    this.chandelierPanner.distanceModel = 'inverse';
    this.chandelierPanner.refDistance = 4;
    this.chandelierPanner.maxDistance = 24;
    this.chandelierPanner.positionX.value = 0;
    this.chandelierPanner.positionY.value = 7.8;
    this.chandelierPanner.positionZ.value = 0;
    cOsc.connect(this.chandelierGain);
    this.chandelierGain.connect(this.chandelierPanner);
    this.chandelierPanner.connect(this.masterGain);
    cOsc.start();
  }

  private playAdaptiveNote(): void {
    if (!this.ctx || !this.musicGain || this.muted || this.ctx.state !== 'running') {
      return;
    }

    const darkScale = [220, 261.63, 293.66, 329.63, 392.0, 440];
    const galleryScale = [329.63, 392.0, 440, 523.25, 587.33];
    const warmScale = [220, 277.18, 329.63, 440, 493.88, 554.37];

    const scale =
      this.completionRatio >= 0.6
        ? warmScale
        : this.currentZone === 'Étage'
          ? galleryScale
          : darkScale;

    this.stepCount++;
    if (this.currentZone === 'Extérieur' && this.stepCount % 2 === 1) {
      return;
    }

    const note = scale[Math.floor(Math.random() * scale.length)];
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = this.currentZone === 'Étage' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(note, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 2.45);
  }

  public updateListener(
    posX: number,
    posY: number,
    posZ: number,
    fwdX: number,
    fwdY: number,
    fwdZ: number,
  ): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = posX;
      listener.positionY.value = posY;
      listener.positionZ.value = posZ;
      listener.forwardX.value = fwdX;
      listener.forwardY.value = fwdY;
      listener.forwardZ.value = fwdZ;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    }
  }

  public setWorldState(
    zone: ExploreZone,
    hearthLit: boolean,
    chandelierLit: boolean,
    completionRatio: number,
  ): void {
    this.currentZone = zone;
    this.completionRatio = completionRatio;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.windGain && this.windFilter) {
      const targetWind =
        zone === 'Extérieur' ? 0.085 : zone === 'Étage' ? 0.038 : 0.02;
      const targetFreq =
        zone === 'Extérieur' ? 420 : zone === 'Étage' ? 260 : 180;
      this.windGain.gain.setTargetAtTime(targetWind, now, 0.45);
      this.windFilter.frequency.setTargetAtTime(targetFreq, now, 0.45);
    }

    if (this.hearthGain) {
      this.hearthGain.gain.setTargetAtTime(hearthLit ? 0.16 : 0, now, 0.3);
    }
    if (this.chandelierGain) {
      this.chandelierGain.gain.setTargetAtTime(chandelierLit ? 0.035 : 0, now, 0.3);
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.65,
        this.ctx.currentTime,
        0.08,
      );
    }
  }

  public playFootstep(indoor: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') {
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(indoor ? 138 : 90, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playPickup(): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') {
      return;
    }
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.001, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.11, now + i * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.38);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.4);
    });
  }

  public playDoorCreak(locked = false): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') {
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = locked ? 'square' : 'sawtooth';
    if (locked) {
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.setValueAtTime(85, now + 0.06);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.18);
    } else {
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.linearRampToValueAtTime(245, now + 0.25);
      osc.frequency.linearRampToValueAtTime(155, now + 0.6);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.065, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.68);
    }
  }

  public playSwitchOrIgnite(): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') {
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.14);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public dispose(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = 0;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
