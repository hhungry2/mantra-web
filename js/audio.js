// Sound effects and background music.

import { ModPlayer } from './mod/player.js';

// Nothing in the data files records which effect is which sound, so these
// names are read off the call sites in the original C source:
//  128 sword swing (Input.c), 129 Saric hurt (EnemyCollision.c),
//  130 enemy hit (Input.c/EnemyCollision.c), 131 enemy death (Enemies.c),
//  133 item pickup (EnemyCollision.c), 137 money pickup (EnemyCollision.c),
//  134 key use (Saric.c), 138 victory fanfare (Utils.c).
const SFX_FILES = {
  sword: 'assets/sfx/sfx_128.wav',   // 0.11s
  hurt: 'assets/sfx/sfx_129.wav',    // 0.16s
  hit: 'assets/sfx/sfx_130.wav',     // 0.21s
  kill: 'assets/sfx/sfx_131.wav',    // 0.54s
  item: 'assets/sfx/sfx_133.wav',    // 0.12s
  money: 'assets/sfx/sfx_137.wav',   // 0.37s
  key: 'assets/sfx/sfx_134.wav',     // 0.86s (keySpecialItem)
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
    this.muted = false;
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
    this.musicBus.gain.value = 0.45;
    this.musicBus.connect(this.master);

    this.preloadSfx();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) {
      this.master.gain.value = this.enabled ? 0.7 : 0;
    }
    return this.enabled;
  }

  mute() {
    if (this.muted) return;
    this.muted = true;
    if (this.master) {
      this.savedGain = this.master.gain.value;
      this.master.gain.value = 0;
    }
  }

  unmute() {
    if (!this.muted) return;
    this.muted = false;
    if (this.master && this.enabled) {
      this.master.gain.value = this.savedGain !== undefined ? this.savedGain : 0.7;
    }
  }

  async preloadSfx() {
    for (const [name, path] of Object.entries(SFX_FILES)) {
      try {
        const res = await fetch(path);
        const buf = await res.arrayBuffer();
        const audioBuf = await this.ctx.decodeAudioData(buf);
        this.buffers.set(name, audioBuf);
      } catch (err) {
        console.warn(`Could not load SFX ${name}:`, err);
      }
    }
  }

  play(name) {
    if (!this.ctx || !this.enabled || this.muted) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this.sfxBus);
    source.start();
  }

  async playMusic(index) {
    if (index < 0 || index >= MUSIC_FILES.length) return;
    if (this.currentTrack === index) return;
    const reqId = ++this.musicRequest;
    this.loadingTrack = index;
    const path = MUSIC_FILES[index];

    try {
      const res = await fetch(path);
      const buf = await res.arrayBuffer();
      if (reqId !== this.musicRequest) return;

      if (!this.player) {
        this.player = new ModPlayer(this.ctx, this.musicBus);
      }
      await this.player.loadBuffer(buf);
      if (reqId !== this.musicRequest) return;
      this.currentTrack = index;
      // The worklet's per-sample tanh packs the mix ~1.85dB denser than the
      // AudioBufferSourceNode graph this used to run, measured across all
      // nine tracks; trim it back to the level the game had before.
      this.player.setVolume(0.82);
      if (this.enabled && !this.muted) this.player.play();
    } catch (err) {
      console.warn(`Could not load music track ${index}:`, err);
    }
  }
}
