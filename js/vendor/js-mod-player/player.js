// Vendored from atornblad/js-mod-player. See README.md in this folder for the
// upstream revision and the list of local changes.
//
// LOCAL CHANGES in this file:
//  - the worklet module URL resolves against this file, not the document
//  - loadBuffer() takes module bytes directly, for tracks that are already in
//    memory rather than sitting at a URL
//  - an optional output node, so the host keeps its own master/limiter chain,
//    and unload() only closes an AudioContext this player created
//  - loading a second module reuses the existing worklet node
//  - row callbacks receive the pattern/speed/bpm the worklet now reports, and
//    watchLevels() exposes per-channel meter levels

import { loadMod } from './loader.js';
import { Mod } from './mod.js';

const AUDIO = Symbol('audio');
const GAIN = Symbol('gain');
const WORKLET = Symbol('worklet');
const OWNS_AUDIO = Symbol('ownsAudio');
const DESTINATION = Symbol('destination');
const ROW_CALLBACKS = Symbol('rowCallbacks');
const SINGLE_CALLBACKS = Symbol('singleCallbacks');
const STOP_CALLBACKS = Symbol('stopCallbacks');
const ALL_NOTES_CALLBACKS = Symbol('allNotesCallbacks');
const LEVEL_CALLBACKS = Symbol('levelCallbacks');

const range = function* (min, max) {
    for (let i = min; i <= max; ++i) {
        yield i;
    }
};

const map = function* (iterator, func) {
    for (let i of iterator) {
        yield func(i);
    }
}

const notePerPeriod = [...map(range(0, 65535), p =>
    p < 124 ? null :
    24 + Math.round(12 * Math.log2(428 / p))
)];

export class ModPlayer {
    constructor(audioContext, destination) {
        this.mod = null;
        this.playing = false;
        this[AUDIO] = audioContext || null;
        this[OWNS_AUDIO] = !audioContext;
        this[DESTINATION] = destination || null;
        this[GAIN] = null;
        this[WORKLET] = null;
        this[ROW_CALLBACKS] = [];
        this[SINGLE_CALLBACKS] = { };
        this[STOP_CALLBACKS] = [];
        this[ALL_NOTES_CALLBACKS] = [];
        this[LEVEL_CALLBACKS] = [];
    }

    /// Loads an Amiga ProTracker MOD file from a given url
    async load(url) {
        await this.#use(await loadMod(url));
    }

    /// Loads an Amiga ProTracker MOD file already held in memory
    async loadBuffer(arrayBuffer) {
        await this.#use(new Mod(arrayBuffer));
    }

    async #use(mod) {
        if (this.playing) this.stop();
        this.mod = mod;
        await this.#ensureGraph();
    }

    async #ensureGraph() {
        if (this[WORKLET]) return;

        if (!this[AUDIO]) this[AUDIO] = new AudioContext();
        this[GAIN] = this[AUDIO].createGain();
        this[GAIN].gain.value = 0.3;
        await this[AUDIO].audioWorklet.addModule(new URL('./mod-player-worklet.js', import.meta.url));
        this[WORKLET] = new AudioWorkletNode(this[AUDIO], 'mod-player-worklet', {
            outputChannelCount: [2]
        });
        this[WORKLET].connect(this[GAIN]).connect(this[DESTINATION] || this[AUDIO].destination);

        this[WORKLET].port.onmessage = this.onmessage.bind(this);
        // A throw inside process() retires the processor for good and the
        // music just stops; without this it stops silently.
        this[WORKLET].onprocessorerror = (e) => {
            this.playing = false;
            console.error('mod-player-worklet stopped', e);
        };

        // Subscriptions asked for before the graph existed still apply.
        if (this[ROW_CALLBACKS].length || Object.keys(this[SINGLE_CALLBACKS]).length) {
            this[WORKLET].port.postMessage({ type: 'enableRowSubscription' });
        }
        if (this[STOP_CALLBACKS].length) {
            this[WORKLET].port.postMessage({ type: 'enableStopSubscription' });
        }
        if (this[ALL_NOTES_CALLBACKS].length) {
            this[WORKLET].port.postMessage({ type: 'enableNoteSubscription' });
        }
        if (this[LEVEL_CALLBACKS].length) {
            this[WORKLET].port.postMessage({ type: 'enableLevelSubscription' });
        }
    }

    #subscribe(list, callback, message) {
        list.push(callback);
        if (this[WORKLET]) this[WORKLET].port.postMessage({ type: message });
    }

    /// Number of channels in the loaded module
    get channelCount() {
        return this.mod ? this.mod.channels : 0;
    }

    /// Number of 64-row positions in the loaded module
    get positionCount() {
        return this.mod ? this.mod.length : 0;
    }

    onmessage(event) {
        const { data } = event;
        switch (data.type) {
            case 'row':
                // Call all the general row callbacks
                for (let callback of this[ROW_CALLBACKS]) {
                    callback(data.position, data.rowIndex, {
                        pattern: data.pattern, speed: data.speed, bpm: data.bpm
                    });
                }

                // Call all the single row callbacks
                const key = data.position + ':' + data.rowIndex;
                if (key in this[SINGLE_CALLBACKS]) {
                    for (let callback of this[SINGLE_CALLBACKS][key]) {
                        callback(data.position, data.rowIndex);
                    }
                }
                break;
            case 'stop':
                for (let callback of this[STOP_CALLBACKS]) {
                    callback();
                }
                break;
            case 'note':
                for (let callback of this[ALL_NOTES_CALLBACKS]) {
                    callback({
                        channel: data.channel,
                        sample: data.sample,
                        volume: data.volume,
                        note: notePerPeriod[data.period]
                    });
                }
                break;
            case 'levels':
                for (let callback of this[LEVEL_CALLBACKS]) {
                    callback(data.levels);
                }
                break;
        }
    }

    /// Subscribes to all rows
    /// The position is the index of the 64-row block of music data
    /// The row is the row index within that block
    /// The callback for watchRows must have the following signature:
    /// callbackFunc(position, row, { pattern, speed, bpm })
    watchRows(callback) {
        this.#subscribe(this[ROW_CALLBACKS], callback, 'enableRowSubscription');
    }

    /// Subscribes to a single row
    /// The callback for watch must have the following signature:
    /// callbackFunc()
    watch(position, row, callback) {
        // Store the callback in a dictionary
        const key = position + ':' + row;

        // There can be multiple callbacks for the same position and row
        // so we store them in an array
        if (!(key in this[SINGLE_CALLBACKS])) {
            this[SINGLE_CALLBACKS][key] = [];
        }

        this.#subscribe(this[SINGLE_CALLBACKS][key], callback, 'enableRowSubscription');
    }

    /// Subscribes to when music stops playing
    /// The callback for watch must have the following signature:
    /// callbackFunc()
    watchStop(callback) {
        this.#subscribe(this[STOP_CALLBACKS], callback, 'enableStopSubscription');
    }

    /// Subscribes to all individual notes starting
    /// The callback for watchNotes must have the following signature:
    /// callbackFunc( { channel: 1..n, sample: 1..32, volume: 1..64, note: -63..45 } )
    watchNotes(callback) {
        this.#subscribe(this[ALL_NOTES_CALLBACKS], callback, 'enableNoteSubscription');
    }

    /// Subscribes to per-channel output levels, 0..1, one entry per channel
    /// The callback for watchLevels must have the following signature:
    /// callbackFunc(levels)
    watchLevels(callback) {
        this.#subscribe(this[LEVEL_CALLBACKS], callback, 'enableLevelSubscription');
    }

    /// Unloads a MOD file and removes all subscriptions
    unload() {
        if (this.playing) this.stop();
        if (!this[WORKLET]) return;

        this[WORKLET].disconnect();
        if (this[OWNS_AUDIO]) {
            this[AUDIO].close();
            this[AUDIO] = null;
        }

        this.mod = null;
        this[WORKLET] = null;
        this[ROW_CALLBACKS] = [];
        this[SINGLE_CALLBACKS] = { };
        this[ALL_NOTES_CALLBACKS] = [ ];
        this[LEVEL_CALLBACKS] = [ ];
    }

    /// Starts the playback of a MOD file from position 0, row 0
    play() {
        if (this.playing) return;
        if (!this[WORKLET]) return;

        this[AUDIO].resume();
        this[WORKLET].port.postMessage({
            type: 'play',
            mod: this.mod,
            sampleRate: this[AUDIO].sampleRate
        });

        this.playing = true;
    }

    /// Stops the playback
    stop() {
        if (!this.playing) return;

        this[WORKLET].port.postMessage({
            type: 'stop'
        });

        this.playing = false;
    }

    /// Resumes the playback of a MOD file from the last stop() position
    resume() {
        if (this.playing) return;
        if (!this[WORKLET]) return;

        this[AUDIO].resume();
        this[WORKLET].port.postMessage({
            type: 'resume'
        });

        this.playing = true;
    }

    /// Immediately jumps to a specific position and row
    setRow(position, row) {
        this[WORKLET].port.postMessage({
            type: 'setRow',
            position: position,
            row: row
        });
    }

    /// Sets the playback volume
    setVolume(volume) {
        this[GAIN].gain.value = volume;
    }
}
