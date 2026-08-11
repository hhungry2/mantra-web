// The from-scratch ProTracker replay engine music/index.html used to run
// inline, before its tick/row/effect logic was ported into an AudioWorklet -
// see js/mod/worklet.js. Still loaded: the archive page's ENGINE switch plays
// through it as the "Node" option, alongside that port and js/vendor/js-mod-
// player, so the three can be compared on the same bar of the same song. See
// old/mod.js for the game-side copy (the game plays through js/mod/ only).

  const AMIGA_CLOCK = 7093789.2;

  // Standard ProTracker period table (finetune 0), 3 octaves.
  const PERIOD_TABLE = [
    856,808,762,720,678,640,604,570,538,508,480,453,
    428,404,381,360,339,320,302,285,269,254,240,226,
    214,202,190,180,170,160,151,143,135,127,120,113
  ];

  function b64ToBytes(b64){
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  export function parseMod(bytes){
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const title = latin1(bytes, 0, 20);
    const samples = [];
    let off = 20;
    for(let i=0;i<31;i++){
      const name = latin1(bytes, off, 22);
      const lenWords = dv.getUint16(off+22);
      let finetune = bytes[off+24] & 0x0F;
      if(finetune > 7) finetune -= 16;
      const volume = bytes[off+25];
      const repeatOffsetWords = dv.getUint16(off+26);
      const repeatLenWords = dv.getUint16(off+28);
      samples.push({
        name, length: lenWords*2, finetune, volume,
        repeatOffset: repeatOffsetWords*2, repeatLength: repeatLenWords*2
      });
      off += 30;
    }
    const songLength = bytes[off]; off += 1;
    off += 1; // restart byte, unused
    const order = Array.from(bytes.slice(off, off+128)); off += 128;
    const tag = latin1(bytes, off, 4); off += 4;
    let channels = 4;
    if(/^\dCHN$/.test(tag)) channels = parseInt(tag[0],10);
    else if(/^\d\dCH$/.test(tag)) channels = parseInt(tag.slice(0,2),10);
    else if(tag === 'M.K.' || tag === 'M!K!' || tag === 'FLT4' || tag === '2CHN') channels = tag === '2CHN' ? 2 : 4;
    else if(tag === 'FLT8' || tag === 'CD81' || tag === 'OKTA') channels = 8;

    const numPatterns = Math.max(...order.slice(0, songLength), 0) + 1;
    const patterns = [];
    for(let p=0; p<numPatterns; p++){
      const rows = [];
      for(let r=0; r<64; r++){
        const row = [];
        for(let c=0; c<channels; c++){
          const b0=bytes[off], b1=bytes[off+1], b2=bytes[off+2], b3=bytes[off+3];
          off += 4;
          const period = ((b0 & 0x0F) << 8) | b1;
          const sampleNum = (b0 & 0xF0) | (b2 >> 4);
          const effect = b2 & 0x0F;
          const param = b3;
          row.push({period, sampleNum, effect, param});
        }
        rows.push(row);
      }
      patterns.push(rows);
    }

    for(const s of samples){
      s.data = bytes.slice(off, off + s.length);
      off += s.length;
    }

    return {title, channels, samples, songLength, order, patterns};
  }

  function latin1(bytes, start, len){
    let s = '';
    for(let i=start;i<start+len;i++){
      const c = bytes[i];
      if(c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }

  function periodToFreq(period){
    return AMIGA_CLOCK / (period * 2);
  }

  function nearestTableIndex(period){
    let best = 0, bestDiff = Infinity;
    for(let i=0;i<PERIOD_TABLE.length;i++){
      const d = Math.abs(PERIOD_TABLE[i]-period);
      if(d < bestDiff){ bestDiff = d; best = i; }
    }
    return best;
  }

  // ---- Playback engine ----
  export class ModPlayer{
    constructor(){
      this.ctx = null;
      this.master = null;
      this.mixBus = null;
      this.limiter = null;
      this.playing = false;
      this.mod = null;
      this.buffers = [];
      this.chan = [];
      this.timer = null;
      this.onTick = null;
    }

    ensureCtx(){
      if(!this.ctx){
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        // Channels sum to well over full scale on their own, so a limiter
        // guards the output against the peaks the mix bus doesn't catch.
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -1.5;
        this.limiter.knee.value = 0;
        this.limiter.ratio.value = 20;
        this.limiter.attack.value = 0.002;
        this.limiter.release.value = 0.12;
        this.master.connect(this.limiter);
        this.limiter.connect(this.ctx.destination);
      }
    }

    load(mod){
      this.stop();
      this.mod = mod;
      this.ensureCtx();
      const sr = this.ctx.sampleRate;
      this.buffers = mod.samples.map(s => {
        if(s.length < 2) return null;
        const buf = this.ctx.createBuffer(1, s.length, sr);
        const ch = buf.getChannelData(0);
        for(let i=0;i<s.length;i++) ch[i] = (s.data[i] << 24 >> 24) / 128;
        return buf;
      });
      this.chan = [];
      // Each channel runs at up to full scale, so summing them raw clips hard.
      // Scale the bus by the channel count to leave the mix headroom: the peak
      // sum is then the same whatever the count, so a 6CHN module doesn't ride
      // ~2dB hotter (and lean on the limiter harder) than the 4-channel ones.
      if(this.mixBus) this.mixBus.disconnect();
      this.mixBus = this.ctx.createGain();
      this.mixBus.gain.value = 2 / mod.channels;
      this.mixBus.connect(this.master);
      for(let c=0;c<mod.channels;c++){
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        if(pan){
          pan.pan.value = (c % 4 === 0 || c % 4 === 3) ? -0.6 : 0.6;
          gain.connect(pan); pan.connect(this.mixBus);
        } else {
          gain.connect(this.mixBus);
        }
        // Tap the channel so the meters can show real output, not just the
        // commanded volume (which many modules never vary).
        const meter = this.ctx.createAnalyser();
        meter.fftSize = 256;
        meter.smoothingTimeConstant = 0;
        gain.connect(meter);
        this.chan.push({
          gain, pan, meter, meterBuf: new Float32Array(meter.fftSize),
          source: null, sampleIdx: -1,
          period: 428, targetPeriod: 428, volume: 0,
          portaSpeed: 0, volSlide: 0, vibPos: 0, vibSpeed: 0, vibDepth: 0,
          fineOnce: 0
        });
      }
      this.orderPos = 0; this.row = 0; this.tick = 0;
      this.speed = 6; this.bpm = 125;
      this.patternBreak = null; this.posJump = null;
    }

    freqOf(period){ return periodToFreq(Math.max(period, 40)); }

    // Per-channel output level, 0..1. These samples run hot - measured RMS
    // sits around 0.3 and tops out near 0.6 - so normalise against that range
    // rather than full scale, or every bar reads as full the whole time.
    levels(){
      return this.chan.map(c => {
        if(!c.meter) return 0;
        c.meter.getFloatTimeDomainData(c.meterBuf);
        let sum = 0;
        for(let i=0;i<c.meterBuf.length;i++) sum += c.meterBuf[i]*c.meterBuf[i];
        const rms = Math.sqrt(sum/c.meterBuf.length);
        if(rms <= 0.0005) return 0;
        // Gamma lifts the quiet end so soft channels stay readable.
        return Math.pow(Math.min(1, rms/0.75), 0.7);
      });
    }

    triggerNote(ci, sampleNum, period, param, effect){
      const mod = this.mod, chObj = this.chan[ci];
      let s = null, sIdx = -1;
      if(sampleNum > 0 && sampleNum <= 31){
        sIdx = sampleNum - 1;
        s = mod.samples[sIdx];
        chObj.volume = s.volume;
      }
      if(period > 0){
        chObj.period = period;
        chObj.targetPeriod = period;
        if(sIdx < 0) sIdx = chObj.sampleIdx;
        const buf = this.buffers[sIdx];
        if(buf){
          if(chObj.source){ try{ chObj.source.stop(); }catch(e){} }
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          const s2 = mod.samples[sIdx];
          if(s2.repeatLength > 2){
            src.loop = true;
            src.loopStart = chObj_loopStart(this.ctx, s2);
            src.loopEnd = chObj_loopEnd(this.ctx, s2);
          }
          src.playbackRate.setValueAtTime(this.freqOf(period)/this.ctx.sampleRate, this.ctx.currentTime);
          let offsetSec = 0;
          if(effect === 9){
            offsetSec = (param * 256) / this.ctx.sampleRate;
          }
          src.connect(chObj.gain);
          try{ src.start(this.nextTickTime, Math.min(offsetSec, (s2.length-1)/this.ctx.sampleRate)); }catch(e){}
          chObj.source = src;
        }
        chObj.sampleIdx = sIdx;
      } else if(sIdx >= 0){
        chObj.sampleIdx = sIdx;
      }
      chObj.gain.gain.setValueAtTime(chObj.volume/64, this.nextTickTime);
    }

    processRow(){
      const mod = this.mod;
      const patIdx = mod.order[this.orderPos];
      const pattern = mod.patterns[patIdx];
      if(!pattern) { this.advanceOrder(); return; }
      const row = pattern[this.row];
      this._curPattern = patIdx;
      for(let c=0;c<mod.channels;c++){
        const note = row[c];
        const chObj = this.chan[c];
        chObj.effect = note.effect; chObj.param = note.param;
        if(note.effect === 3 || note.effect === 5){
          if(note.period > 0) chObj.targetPeriod = note.period;
          if(note.param > 0 && note.effect === 3) chObj.portaSpeed = note.param;
          if(note.sampleNum > 0){ chObj.volume = mod.samples[note.sampleNum-1].volume; chObj.sampleIdx = note.sampleNum-1; }
        } else {
          this.triggerNote(c, note.sampleNum, note.period, note.param, note.effect);
        }
        switch(note.effect){
          case 1: if(note.param>0) chObj.portaSpeed = note.param; break;
          case 2: if(note.param>0) chObj.portaSpeed = note.param; break;
          case 4: if(note.param>0){ if(note.param>>4) chObj.vibSpeed=note.param>>4; if(note.param&0xF) chObj.vibDepth=note.param&0xF; } break;
          case 0xA: if(note.param>0) chObj.volSlide = note.param; break;
          case 0xC: chObj.volume = Math.min(64, note.param); chObj.gain.gain.setValueAtTime(chObj.volume/64, this.nextTickTime); break;
          case 0xB: this.posJump = note.param; break;
          case 0xD: this.patternBreak = (note.param>>4)*10 + (note.param&0xF); break;
          case 0xE:
            const sub = note.param>>4, subp = note.param&0xF;
            if(sub===1) chObj.period = Math.max(113, chObj.period - subp);
            if(sub===2) chObj.period = Math.min(856, chObj.period + subp);
            if(sub===0xA) chObj.volume = Math.min(64, chObj.volume+subp);
            if(sub===0xB) chObj.volume = Math.max(0, chObj.volume-subp);
            if(sub===0xC) chObj.gain.gain.setValueAtTime(0, this.nextTickTime + 0.001);
            chObj.gain.gain.setValueAtTime(chObj.volume/64, this.nextTickTime);
            if(chObj.source) chObj.source.playbackRate.setValueAtTime(this.freqOf(chObj.period)/this.ctx.sampleRate, this.nextTickTime);
            break;
          case 0xF: if(note.param>0){ if(note.param<=0x1F) this.speed=note.param; else this.bpm=note.param; } break;
        }
      }
    }

    processTick(){
      const mod = this.mod;
      for(let c=0;c<mod.channels;c++){
        const chObj = this.chan[c];
        if(!chObj.source) continue;
        let period = chObj.period;
        switch(chObj.effect){
          case 0:
            if(chObj.param>0){
              const idx = nearestTableIndex(chObj.period);
              const step = this.tick % 3;
              const semis = step===1 ? (chObj.param>>4) : step===2 ? (chObj.param&0xF) : 0;
              period = PERIOD_TABLE[Math.min(PERIOD_TABLE.length-1, idx+semis)];
              chObj.source.playbackRate.setValueAtTime(this.freqOf(period)/this.ctx.sampleRate, this.nextTickTime);
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
            chObj.source.playbackRate.setValueAtTime(this.freqOf(period)/this.ctx.sampleRate, this.nextTickTime);
            if(chObj.effect===6) this.applyVolSlide(chObj);
            continue;
          case 0xA:
            this.applyVolSlide(chObj);
            continue;
          default:
            continue;
        }
        chObj.source.playbackRate.setValueAtTime(this.freqOf(period)/this.ctx.sampleRate, this.nextTickTime);
      }
    }

    applyVolSlide(chObj){
      const up = chObj.volSlide>>4, down = chObj.volSlide&0xF;
      if(up) chObj.volume = Math.min(64, chObj.volume+up);
      else if(down) chObj.volume = Math.max(0, chObj.volume-down);
      chObj.gain.gain.setValueAtTime(chObj.volume/64, this.nextTickTime);
    }

    advanceOrder(){
      this.orderPos = (this.orderPos + 1) % this.mod.songLength;
      this.row = 0;
    }

    // Position is counted in rows through the order list: 64 per entry. A
    // module has no fixed running time - speed and BPM change as it plays,
    // and it loops forever - so rows are the only honest ruler for a scrubber.
    totalRows(){ return this.mod ? this.mod.songLength * 64 : 0; }
    positionRows(){ return this.mod ? this.orderPos * 64 + this.row : 0; }

    seekRows(target){
      if(!this.mod) return;
      const clamped = Math.max(0, Math.min(this.totalRows() - 1, Math.floor(target)));
      this.orderPos = Math.floor(clamped / 64);
      this.row = clamped % 64;
      this.tick = 0;
      this.patternBreak = null;
      this.posJump = null;
      this.silence();
      if(this.playing) this.nextTickTime = this.ctx.currentTime + 0.05;
    }

    // Cut every voice dead, including notes the scheduler already queued up
    // inside the lookahead window, so a jump doesn't drag the old bar along.
    silence(){
      const now = this.ctx ? this.ctx.currentTime : 0;
      for(const c of (this.chan || [])){
        if(c.source){ try{ c.source.stop(); }catch(e){} c.source = null; }
        c.gain.gain.cancelScheduledValues(now);
        c.gain.gain.setValueAtTime(0, now);
      }
    }

    schedulerStep(){
      if(!this.playing) return;
      const lookahead = 0.12;
      while(this.nextTickTime < this.ctx.currentTime + lookahead){
        if(this.tick === 0) this.processRow();
        else this.processTick();

        if(this.onTick) this.onTick({
          pattern: this._curPattern, row: this.row, speed: this.speed, bpm: this.bpm,
          orderPos: this.orderPos, rows: this.positionRows(),
          channels: this.chan.map(c => c.volume/64 * (c.source?1:0))
        });

        this.nextTickTime += 2.5/this.bpm;
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
    }

    play(mod){
      this.load(mod);
      this.resume();
    }

    // Pick up wherever the position left off, so pause and seek both resume
    // in place instead of dropping back to the top of the song.
    resume(){
      if(this.playing || !this.mod) return;
      this.ctx.resume();
      this.nextTickTime = this.ctx.currentTime + 0.05;
      this.tick = 0;
      this.playing = true;
      this.schedulerStep();
      this.timer = setInterval(() => this.schedulerStep(), 25);
    }

    stop(){
      this.playing = false;
      if(this.timer) clearInterval(this.timer);
      this.timer = null;
      if(this.chan) this.silence();
    }
  }

  function chObj_loopStart(ctx, s){ return s.repeatOffset / ctx.sampleRate; }
  function chObj_loopEnd(ctx, s){ return (s.repeatOffset + s.repeatLength) / ctx.sampleRate; }
