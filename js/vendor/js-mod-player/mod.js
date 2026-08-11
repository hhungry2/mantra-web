// Vendored from atornblad/js-mod-player. See README.md in this folder for the
// upstream revision and the list of local changes.
//
// LOCAL CHANGE: the upstream parser assumes four channels everywhere - 16 bytes
// per row, 1024 bytes per pattern, and sample data starting right after them.
// Two of the Mantra modules are 6CHN, so the row stride, pattern stride and
// sample offset are all derived from the format tag instead.

// Channel count from the four-byte tag at offset 1080. Untagged files are the
// original 15-instrument MODs, which nothing here uses, but four is the right
// guess for them too.
function channelsFromTag(tag) {
    if (/^(M\.K\.|M!K!|FLT4|4CHN)$/.test(tag)) return 4;
    if (/^[1-9]CHN$/.test(tag)) return parseInt(tag[0], 10);
    if (/^[1-9][0-9]CH$/.test(tag)) return parseInt(tag.slice(0, 2), 10);
    if (tag === 'FLT8' || tag === 'CD81' || tag === 'OKTA') return 8;
    return 4;
}

class Instrument {
    constructor(modfile, index, sampleStart) {
        const data = new Uint8Array(modfile, 20 + index * 30, 30);
        const nameBytes = data.slice(0, 21).filter(a => !!a);
        this.index = index;
        this.name = String.fromCodePoint(...nameBytes).trim();
        this.length = 2 * (data[22] * 256 + data[23]);
        this.finetune = data[24];
        if (this.finetune > 7) this.finetune -= 16;
        this.volume = data[25];
        this.repeatOffset = 2 * (data[26] * 256 + data[27]);
        this.repeatLength = 2 * (data[28] * 256 + data[29]);
        this.bytes = new Int8Array(modfile, sampleStart, this.length);
        this.isLooped = this.repeatOffset != 0 || this.repeatLength > 2;
    }
}

class Note {
    constructor (noteData) {
        // The data for each note is bit-packed like this:
        //  Byte 0   Byte 1   Byte 2   Byte 3
        // 76543210 76543210 76543210 76543210
        // iiiipppp pppppppp iiiieeee eeeeeeee
        // i = instrument index
        // p = period
        // e = effect
        this.instrument = (noteData[0] & 0xf0) | (noteData[2] >> 4);
        this.period = (noteData[0] & 0x0f) * 256 + noteData[1];
        let effectId = noteData[2] & 0x0f;
        let effectData = noteData[3];
        if (effectId === 0x0e) {
            effectId = 0xe0 | (effectData >> 4);
            effectData &= 0x0f;
        }
        this.rawEffect = ((noteData[2] & 0x0f) << 8) | noteData[3];
        this.effectId = effectId;
        this.effectData = effectData;
        this.effectHigh = effectData >> 4;
        this.effectLow = effectData & 0x0f;
        this.hasEffect = effectId || effectData;
    }
}

class Row {
    constructor(rowData, channels) {
        this.notes = [];

        // Each note is 4 bytes, one per channel
        for (let i = 0; i < channels * 4; i += 4) {
            const noteData = rowData.slice(i, i + 4);
            this.notes.push(new Note(noteData));
        }
    }
}

class Pattern {
    constructor(modfile, index, channels) {
        const rowBytes = channels * 4;
        const patternBytes = rowBytes * 64;
        const data = new Uint8Array(modfile, 1084 + index * patternBytes, patternBytes);
        this.rows = [];

        // Each pattern is made up of 64 rows
        for (let i = 0; i < 64; ++i) {
            const rowData = data.slice(i * rowBytes, i * rowBytes + rowBytes);
            this.rows.push(new Row(rowData, channels));
        }
    }
}

export class Mod {
    constructor(modfile) {
        const nameArray = new Uint8Array(modfile, 0, 20);
        const nameBytes = nameArray.filter(a => !!a);
        this.name = String.fromCodePoint(...nameBytes).trim();

        // Store the song length
        this.length = new Uint8Array(modfile, 950, 1)[0];

        // Store the pattern table
        this.patternTable = new Uint8Array(modfile, 952, this.length);

        // LOCAL CHANGE: format tag drives every stride below.
        const tagBytes = new Uint8Array(modfile, 1080, 4);
        this.tag = String.fromCodePoint(...tagBytes);
        this.channels = channelsFromTag(this.tag);

        // Find the highest pattern number
        const maxPatternIndex = Math.max(...this.patternTable);

        // Extract all instruments
        this.instruments = [null];
        let sampleStart = 1084 + (maxPatternIndex + 1) * this.channels * 4 * 64;
        for (let i = 0; i < 31; ++i) {
            const instr = new Instrument(modfile, i, sampleStart);
            this.instruments.push(instr);
            sampleStart += instr.length;
        }

        // Extract the pattern data
        this.patterns = [];
        for (let i = 0; i <= maxPatternIndex; ++i) {
            const pattern = new Pattern(modfile, i, this.channels);
            this.patterns.push(pattern);
        }
    }
}
