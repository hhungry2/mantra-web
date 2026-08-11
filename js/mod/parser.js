// Parser lifted unchanged from music-mod-player.js's parseMod. Split out on
// its own so both the main thread and the worklet's loader can use it without
// dragging in the AudioBufferSourceNode-based ModPlayer this replaces.

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
