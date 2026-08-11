// Wraps music-mod-player.js's ModPlayer (one AudioBufferSourceNode per note)
// with the same surface js/mod/player.js and js/vendor/js-mod-player/player.js
// expose - loadBuffer/play/stop/resume/setRow/setVolume/watchRows/
// watchLevels/channelCount/positionCount - so music/index.html's ENGINE
// switch can drive all three the same way. This file only adapts the shape;
// see music-mod-player.js itself for what actually plays the notes.
//
// The one thing that doesn't translate cleanly is levels(): the other two
// engines push peaks from the audio thread via postMessage, so watchLevels()
// registers a callback. This engine's levels() pulls synchronously from
// AnalyserNode taps on the main thread, and already returns gamma-corrected
// 0..1 values (see its own comment) rather than raw peaks - so the adapter's
// watchLevels callback is driven by a rAF loop here instead of a real push,
// and levelsAreFinal marks that the caller should skip its own gamma step.

import { parseMod, ModPlayer } from './music-mod-player.js';

export class NodePlayer {
  constructor(){
    this.inner = new ModPlayer();
    this.mod = null;
    this.rowCallbacks = [];
    this.levelCallbacks = [];
    this.levelsAreFinal = true;
    this.inner.onTick = (info) => {
      for(const cb of this.rowCallbacks){
        cb(info.orderPos, info.row, { pattern: info.pattern, speed: info.speed, bpm: info.bpm });
      }
    };
    this.levelLoop = null;
  }

  async loadBuffer(arrayBuffer){
    this.mod = parseMod(new Uint8Array(arrayBuffer));
    this.inner.ensureCtx();
    this.inner.load(this.mod);
    this.startLevelLoop();
  }

  get channelCount(){ return this.mod ? this.mod.channels : 0; }
  get positionCount(){ return this.mod ? this.mod.songLength : 0; }
  get playing(){ return this.inner.playing; }

  watchRows(cb){ this.rowCallbacks.push(cb); }
  watchLevels(cb){ this.levelCallbacks.push(cb); }

  // The other two engines' levels arrive as postMessage events, independent
  // of any rAF loop. This engine's levels() is a pull, so something has to
  // poll it; once around the frame clock is plenty for a meter.
  startLevelLoop(){
    if(this.levelLoop) return;
    const step = () => {
      if(this.inner.playing){
        const lv = this.inner.levels();
        for(const cb of this.levelCallbacks) cb(lv);
      }
      this.levelLoop = requestAnimationFrame(step);
    };
    this.levelLoop = requestAnimationFrame(step);
  }

  play(){ this.inner.resume(); }
  stop(){ this.inner.stop(); }
  resume(){ this.inner.resume(); }
  setRow(position, row){ this.inner.seekRows(position * 64 + row); }
  setVolume(v){ this.inner.ensureCtx(); this.inner.master.gain.value = v; }
}
