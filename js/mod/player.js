// Main-thread wrapper for worklet.js: a ProTracker MOD replay that mixes
// sample-by-sample inside an AudioWorklet (nearest-neighbour lookup, tanh
// soft clip). This is the tick/row/effect engine this project has carried
// since the start - see old/README.md for how it got here and what it
// replaced.

import { parseMod } from './parser.js';

export class ModPlayer {
  constructor(audioContext, destination){
    this.mod = null;
    this.playing = false;
    this.ctx = audioContext || null;
    this.ownsAudio = !audioContext;
    this.destination = destination || null;
    this.gain = null;
    this.worklet = null;
    this.rowCallbacks = [];
    this.levelCallbacks = [];
  }

  async loadBuffer(arrayBuffer){
    if(this.playing) this.stop();
    this.mod = parseMod(new Uint8Array(arrayBuffer));
    await this.ensureGraph();
  }

  async ensureGraph(){
    if(this.worklet) return;
    if(!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.3;
    await this.ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
    this.worklet = new AudioWorkletNode(this.ctx, 'mod-worklet', { outputChannelCount: [2] });
    this.worklet.connect(this.gain).connect(this.destination || this.ctx.destination);
    this.worklet.port.onmessage = this.onmessage.bind(this);
    // A throw inside process() retires the processor for good and the music
    // just stops; without this it stops silently.
    this.worklet.onprocessorerror = (e) => {
      this.playing = false;
      console.error('mod-worklet stopped', e);
    };
    if(this.rowCallbacks.length) this.worklet.port.postMessage({ type: 'enableRowSubscription' });
    if(this.levelCallbacks.length) this.worklet.port.postMessage({ type: 'enableLevelSubscription' });
  }

  onmessage(event){
    const { data } = event;
    if(data.type === 'row'){
      for(const cb of this.rowCallbacks){
        cb(data.position, data.rowIndex, { pattern: data.pattern, speed: data.speed, bpm: data.bpm });
      }
    } else if(data.type === 'levels'){
      for(const cb of this.levelCallbacks) cb(data.levels);
    }
  }

  get channelCount(){ return this.mod ? this.mod.channels : 0; }
  get positionCount(){ return this.mod ? this.mod.songLength : 0; }

  watchRows(cb){
    this.rowCallbacks.push(cb);
    if(this.worklet) this.worklet.port.postMessage({ type: 'enableRowSubscription' });
  }

  watchLevels(cb){
    this.levelCallbacks.push(cb);
    if(this.worklet) this.worklet.port.postMessage({ type: 'enableLevelSubscription' });
  }

  play(){
    if(this.playing || !this.worklet) return;
    this.ctx.resume();
    this.worklet.port.postMessage({ type: 'play', mod: this.mod, sampleRate: this.ctx.sampleRate });
    this.playing = true;
  }

  stop(){
    if(!this.playing) return;
    this.worklet.port.postMessage({ type: 'stop' });
    this.playing = false;
  }

  resume(){
    if(this.playing || !this.worklet) return;
    this.ctx.resume();
    this.worklet.port.postMessage({ type: 'resume' });
    this.playing = true;
  }

  setRow(position, row){
    this.worklet.port.postMessage({ type: 'setRow', position, row });
  }

  setVolume(v){
    this.gain.gain.value = v;
  }

  unload(){
    if(this.playing) this.stop();
    if(!this.worklet) return;
    this.worklet.disconnect();
    if(this.ownsAudio){ this.ctx.close(); this.ctx = null; }
    this.mod = null;
    this.worklet = null;
    this.rowCallbacks = [];
    this.levelCallbacks = [];
  }
}
