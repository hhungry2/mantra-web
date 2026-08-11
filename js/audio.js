// Sound effects and background music.

// Replay mixes sample-by-sample inside an AudioWorklet - see js/mod/. The
// AudioBufferSourceNode-per-note engine this used to carry is kept at
// old/mod.js.
import { ModPlayer } from './mod/player.js';

// Nothing in the data files records which effect is which sound, so these
// names are read off their lengths: the short ones are blows, the long ones
// are the death and the fanfare. Each of the eight is used once.
const SFX_FILES = {
  sword: 'assets/sfx/sfx_128.wav',   // 0.11s
  hurt: 'assets/sfx/sfx_133.wav',    // 0.12s
  hit: 'assets/sfx/sfx_129.wav',     // 0.16s
  kill: 'assets/sfx/sfx_130.wav',    // 0.21s
  door: 'assets/sfx/sfx_137.wav',    // 0.37s
  item: 'assets/sfx/sfx_131.wav',    // 0.54s
  die: 'assets/sfx/sfx_134.wav',     // 0.86s
  fanfare: 'assets/sfx/sfx_138.wav', // 0.85s
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
    this.loadingTrack = -1;
    this.musicRequest = 0;
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
    if (!this.ctx || index === this.currentTrack || index === this.loadingTrack) return;
    if (!Number.isInteger(index) || index < 0 || index >= MUSIC_FILES.length) return;

    this.loadingTrack = index;
    const request = ++this.musicRequest;
    try {
      const res = await fetch(MUSIC_FILES[index]);
      if (!res.ok || request !== this.musicRequest) return;
      const bytes = await res.arrayBuffer();
      if (request !== this.musicRequest) return;
      await this.player.loadBuffer(bytes);
      if (request !== this.musicRequest) return;
      this.currentTrack = index;
      // The worklet's per-sample tanh packs the mix ~1.85dB denser than the
      // AudioBufferSourceNode graph this used to run, measured across all
      // nine tracks; trim it back to the level the game had before.
      this.player.setVolume(0.82);
      if (this.enabled) this.player.play();
    } finally {
      if (this.loadingTrack === index) this.loadingTrack = -1;
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.player?.stop();
    else if (this.currentTrack >= 0) this.player.resume();
    return this.enabled;
  }
}
