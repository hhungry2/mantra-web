// Tick/row/effect logic ported unchanged from old/music-mod-player.js's
// ModPlayer (the AudioBufferSourceNode-per-note engine this project ran
// until now) into an AudioWorklet.
//
// The ONLY thing that changed from that version is how a note becomes sound:
// nearest-neighbour sample lookup and a per-sample tanh soft clip, done here
// instead of delegating to AudioBufferSourceNode.playbackRate (which the
// browser resamples with its own interpolation) plus a DynamicsCompressor.
// Everything about which note plays when, and at what pitch and volume, is
// untouched - including its quirks. Notably, processTick()'s cases 1/2/3/5
// read `period`, a local captured before that tick's slide/portamento update
// to chObj.period, so those effects land one tick later than the value just
// computed. That was already true of the AudioBufferSourceNode version; it
// is reproduced here rather than fixed, so any audible difference against
// that version is the mixing method and nothing else.

const AMIGA_CLOCK = 7093789.2;

// Standard ProTracker period table (finetune 0), 3 octaves.
const PERIOD_TABLE = [
  856,808,762,720,678,640,604,570,538,508,480,453,
  428,404,381,360,339,320,302,285,269,254,240,226,
  214,202,190,180,170,160,151,143,135,127,120,113,
];

function nearestTableIndex(period){
  let best = 0, bestDiff = Infinity;
  for(let i=0;i<PERIOD_TABLE.length;i++){
    const d = Math.abs(PERIOD_TABLE[i]-period);
    if(d < bestDiff){ bestDiff = d; best = i; }
  }
  return best;
}

// How often the meter levels go out, in output samples.
const LEVEL_INTERVAL = 1024;

class Channel {
  constructor(index){
    this.index = index;
    this.period = 428; this.targetPeriod = 428;
    this.volume = 0;
    this.portaSpeed = 0; this.volSlide = 0;
    this.vibPos = 0; this.vibSpeed = 0; this.vibDepth = 0;
    this.effect = 0; this.param = 0;
    this.sampleIdx = -1;
    this.sample = null;
    this.playing = false;
    this.sampleIndex = 0;
    this.sampleSpeed = 0;
    // Amiga hardware alternates LRRL across the channels; anything past the
    // first four repeats the pattern. Same panning the StereoPannerNode
    // version used.
    const pan = (index % 4 === 0 || index % 4 === 3) ? -0.6 : 0.6;
    this.gainLeft = Math.cos((pan + 1) * Math.PI / 4);
    this.gainRight = Math.sin((pan + 1) * Math.PI / 4);
  }
}

class LegacyModWorklet extends AudioWorkletProcessor {
  constructor(){
    super();
    this.port.onmessage = this.onmessage.bind(this);
    this.mod = null;
    this.channels = [];
    this.mixScale = 1;
    this.playing = false;
    this.patternBreak = null;
    this.posJump = null;
    this.publishRow = false;
    this.publishLevels = false;
    this.levelPeaks = [];
    this.levelCountdown = LEVEL_INTERVAL;
  }

  onmessage(e){
    const { data } = e;
    switch(data.type){
      case 'play': this.onLoad(data.mod, data.sampleRate); this.playing = true; break;
      case 'stop': this.playing = false; break;
      case 'resume': this.playing = true; break;
      case 'setRow': this.setRow(data.position, data.row); break;
      case 'enableRowSubscription': this.publishRow = true; break;
      case 'enableLevelSubscription': this.publishLevels = true; break;
    }
  }

  onLoad(mod, sampleRate){
    this.mod = mod;
    this.sampleRate = sampleRate;
    // Sign-extend and precompute the loop test once, in place of the old
    // per-sample (byte<<24>>24)/128 done at AudioBuffer-fill time; the
    // worklet reads bytes straight out of these views instead.
    for(const s of mod.samples){
      s.i8 = s.length >= 2 ? new Int8Array(s.data.buffer, s.data.byteOffset, s.length) : null;
      // Same condition the AudioBufferSourceNode version used to decide
      // src.loop - repeatOffset isn't checked, just repeatLength.
      s.isLooped = s.repeatLength > 2;
    }
    const count = mod.channels || 4;
    this.channels = [];
    for(let i=0;i<count;i++) this.channels.push(new Channel(i));
    this.levelPeaks = new Array(count).fill(0);
    // The peak sum is the same whatever the channel count, so a 6CHN module
    // doesn't ride hotter than a 4-channel one - same rule as before, just
    // rebalanced for this file's own /128 sample normalisation (this makes
    // the pre-tanh peak per channel identical to js-mod-player's 4/channels
    // with its /256 normalisation).
    this.mixScale = 2 / count;

    this.orderPos = 0; this.row = 0; this.tick = 0;
    this.speed = 6;
    this.setBpm(125);
    this.patternBreak = null; this.posJump = null;
    this.outputsUntilNextTick = 0;
  }

  setBpm(bpm){
    this.bpm = bpm;
    this.outputsPerTick = this.sampleRate * 2.5 / bpm;
  }

  freqOf(period){ return AMIGA_CLOCK / (Math.max(period, 40) * 2); }

  setPitch(chObj, period){
    chObj.sampleSpeed = this.freqOf(period) / this.sampleRate;
  }

  setRow(position, row){
    this.orderPos = position;
    this.row = row;
    this.tick = 0;
    this.patternBreak = null;
    this.posJump = null;
    this.silence();
  }

  // Cut every voice, so a jump doesn't drag the old bar's notes across it.
  silence(){
    for(const c of this.channels){ c.playing = false; c.sampleIndex = 0; }
  }

  triggerNote(ci, sampleNum, period, param, effect){
    const chObj = this.channels[ci];
    let sIdx = -1;
    if(sampleNum > 0 && sampleNum <= 31){
      sIdx = sampleNum - 1;
      const s = this.mod.samples[sIdx];
      if(s) chObj.volume = s.volume;
    }
    if(period > 0){
      chObj.period = period;
      chObj.targetPeriod = period;
      if(sIdx < 0) sIdx = chObj.sampleIdx;
      const sample = sIdx >= 0 ? this.mod.samples[sIdx] : null;
      if(sample && sample.i8){
        chObj.sampleIdx = sIdx;
        chObj.sample = sample;
        chObj.sampleIndex = effect === 9 ? Math.min(param * 256, sample.length - 1) : 0;
        chObj.playing = true;
        this.setPitch(chObj, period);
      }
    } else if(sIdx >= 0){
      chObj.sampleIdx = sIdx;
    }
  }

  processRow(){
    const mod = this.mod;
    const patIdx = mod.order[this.orderPos];
    const pattern = mod.patterns[patIdx];
    if(!pattern){ this.advanceOrder(); return; }
    const row = pattern[this.row];
    for(let c=0;c<mod.channels;c++){
      const note = row[c];
      const chObj = this.channels[c];
      chObj.effect = note.effect; chObj.param = note.param;
      if(note.effect === 3 || note.effect === 5){
        if(note.period > 0) chObj.targetPeriod = note.period;
        if(note.param > 0 && note.effect === 3) chObj.portaSpeed = note.param;
        if(note.sampleNum > 0){
          const s = mod.samples[note.sampleNum-1];
          if(s) chObj.volume = s.volume;
          chObj.sampleIdx = note.sampleNum-1;
        }
      } else {
        this.triggerNote(c, note.sampleNum, note.period, note.param, note.effect);
      }
      switch(note.effect){
        case 1: if(note.param>0) chObj.portaSpeed = note.param; break;
        case 2: if(note.param>0) chObj.portaSpeed = note.param; break;
        case 4:
          if(note.param>0){
            if(note.param>>4) chObj.vibSpeed=note.param>>4;
            if(note.param&0xF) chObj.vibDepth=note.param&0xF;
          }
          break;
        case 0xA: if(note.param>0) chObj.volSlide = note.param; break;
        case 0xC: chObj.volume = Math.min(64, note.param); break;
        case 0xB: this.posJump = note.param; break;
        case 0xD: this.patternBreak = (note.param>>4)*10 + (note.param&0xF); break;
        case 0xE: {
          const sub = note.param>>4, subp = note.param&0xF;
          if(sub===1) chObj.period = Math.max(113, chObj.period - subp);
          if(sub===2) chObj.period = Math.min(856, chObj.period + subp);
          if(sub===0xA) chObj.volume = Math.min(64, chObj.volume+subp);
          if(sub===0xB) chObj.volume = Math.max(0, chObj.volume-subp);
          // The AudioBufferSourceNode version scheduled a cut 1ms after this
          // tick; at audio rates that is indistinguishable from cutting here.
          if(sub===0xC) chObj.volume = 0;
          if(chObj.playing) this.setPitch(chObj, chObj.period);
          break;
        }
        case 0xF:
          if(note.param>0){
            if(note.param<=0x1F) this.speed=note.param; else this.setBpm(note.param);
          }
          break;
      }
    }

    if(this.publishRow){
      this.port.postMessage({
        type: 'row', position: this.orderPos, rowIndex: this.row,
        pattern: patIdx, speed: this.speed, bpm: this.bpm,
      });
    }
  }

  processTick(){
    const mod = this.mod;
    for(let c=0;c<mod.channels;c++){
      const chObj = this.channels[c];
      if(!chObj.playing) continue;
      let period = chObj.period;
      switch(chObj.effect){
        case 0:
          if(chObj.param>0){
            const idx = nearestTableIndex(chObj.period);
            const step = this.tick % 3;
            const semis = step===1 ? (chObj.param>>4) : step===2 ? (chObj.param&0xF) : 0;
            period = PERIOD_TABLE[Math.min(PERIOD_TABLE.length-1, idx+semis)];
            this.setPitch(chObj, period);
          }
          continue;
        case 1:
          chObj.period = Math.max(113, chObj.period - chObj.portaSpeed);
          break;
        case 2:
          chObj.period = Math.min(856, chObj.period + chObj.portaSpeed);
          break;
        case 3: case 5:
          if(chObj.targetPeriod > chObj.period) chObj.period = Math.min(chObj.targetPeriod, chObj.period + chObj.portaSpeed);
          else if(chObj.targetPeriod < chObj.period) chObj.period = Math.max(chObj.targetPeriod, chObj.period - chObj.portaSpeed);
          if(chObj.effect===5) this.applyVolSlide(chObj);
          break;
        case 4: case 6:
          chObj.vibPos = (chObj.vibPos + chObj.vibSpeed) % 64;
          period = chObj.period + Math.round(Math.sin(chObj.vibPos/64*2*Math.PI) * chObj.vibDepth * 2);
          this.setPitch(chObj, period);
          if(chObj.effect===6) this.applyVolSlide(chObj);
          continue;
        case 0xA:
          this.applyVolSlide(chObj);
          continue;
        default:
          continue;
      }
      this.setPitch(chObj, period);
    }
  }

  applyVolSlide(chObj){
    const up = chObj.volSlide>>4, down = chObj.volSlide&0xF;
    if(up) chObj.volume = Math.min(64, chObj.volume+up);
    else if(down) chObj.volume = Math.max(0, chObj.volume-down);
  }

  advanceOrder(){
    this.orderPos = (this.orderPos + 1) % this.mod.songLength;
    this.row = 0;
  }

  nextOutput(out){
    out[0] = 0; out[1] = 0;
    if(!this.mod || !this.playing) return;

    if(this.outputsUntilNextTick <= 0){
      if(this.tick === 0) this.processRow(); else this.processTick();
      this.outputsUntilNextTick += this.outputsPerTick;
      this.tick++;
      if(this.tick >= this.speed){
        this.tick = 0;
        if(this.patternBreak !== null){
          this.row = this.patternBreak; this.patternBreak = null;
          this.orderPos = (this.orderPos + 1) % this.mod.songLength;
        } else if(this.posJump !== null){
          this.orderPos = this.posJump % this.mod.songLength; this.row = 0; this.posJump = null;
        } else {
          this.row++;
          if(this.row >= 64) this.advanceOrder();
        }
      }
    }
    this.outputsUntilNextTick--;

    let left = 0, right = 0;
    for(const chObj of this.channels){
      let value = 0;
      if(chObj.playing && chObj.sample){
        const sample = chObj.sample;
        const raw = sample.i8[chObj.sampleIndex | 0];
        chObj.sampleIndex += chObj.sampleSpeed;
        let overflowed = false;
        if(sample.isLooped){
          if(chObj.sampleIndex >= sample.repeatOffset + sample.repeatLength){
            chObj.sampleIndex = sample.repeatOffset;
          }
        } else if(chObj.sampleIndex >= sample.length){
          overflowed = true;
        }
        if(!overflowed) value = (raw / 128) * (chObj.volume / 64);
      }
      left += value * chObj.gainLeft;
      right += value * chObj.gainRight;
      if(this.publishLevels){
        const level = value < 0 ? -value : value;
        if(level > this.levelPeaks[chObj.index]) this.levelPeaks[chObj.index] = level;
      }
    }
    out[0] = Math.tanh(left * this.mixScale);
    out[1] = Math.tanh(right * this.mixScale);
  }

  process(inputs, outputs){
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || output[0];
    const frame = this.frame || (this.frame = new Float32Array(2));

    for(let i=0;i<left.length;i++){
      this.nextOutput(frame);
      left[i] = frame[0];
      right[i] = frame[1];
    }

    if(this.publishLevels){
      this.levelCountdown -= left.length;
      if(this.levelCountdown <= 0){
        this.levelCountdown = LEVEL_INTERVAL;
        this.port.postMessage({ type: 'levels', levels: this.levelPeaks.slice() });
        this.levelPeaks.fill(0);
      }
    }

    return true;
  }
}

registerProcessor('mod-worklet', LegacyModWorklet);
