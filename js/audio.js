// Sound effects and background music.

import { parseMod, ModPlayer } from './mod.js';

const SFX_FILES = {
  sword: 'assets/sfx/sfx_128.wav',
  hit: 'assets/sfx/sfx_129.wav',
  kill: 'assets/sfx/sfx_130.wav',
  item: 'assets/sfx/sfx_131.wav',
  door: 'assets/sfx/sfx_133.wav',
  hurt: 'assets/sfx/sfx_133.wav',
  die: 'assets/sfx/sfx_134.wav',
  magic: 'assets/sfx/sfx_137.wav',
  fanfare: 'assets/sfx/sfx_138.wav',
};

const MUSIC_FILES = [
  'assets/music/track_128.mod', 'assets/music/track_129.mod',
  'assets/music/track_130.mod', 'assets/music/track_131.mod',
  'assets/music/track_132.mod', 'assets/music/track_133.mod',
  'assets/music/track_134.mod', 'assets/music/track_135.mod',
  'assets/music/track_136.mod',
];

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.buffers = new Map();
    this.player = null;
    this.currentTrack = -1;
  }

  start() {
    if (this.ctx) return this.ctx.resume();
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    this.master.connect(limiter);
    limiter.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);

    this.player = new ModPlayer(this.ctx, this.musicBus);
    return this.loadEffects();
  }

  async loadEffects() {
    await Promise.all(Object.entries(SFX_FILES).map(async ([name, url]) => {
      const res = await fetch(url);
      if (!res.ok) return;
      const bytes = await res.arrayBuffer();
      this.buffers.set(name, await this.ctx.decodeAudioData(bytes));
    }));
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.sfxBus);
    src.start();
  }

  async playMusic(index) {
    if (!this.ctx || index === this.currentTrack) return;
    const res = await fetch(MUSIC_FILES[index]);
    if (!res.ok) return;
    const bytes = new Uint8Array(await res.arrayBuffer());
    this.currentTrack = index;
    this.mod = parseMod(bytes);
    if (this.enabled) this.player.play(this.mod);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.player?.stop();
    else if (this.mod) this.player.play(this.mod);
    return this.enabled;
  }
}
