# js-mod-player (vendored, patched)

ProTracker MOD replay running in an `AudioWorklet`, by Anders Tornblad.

- Upstream: <https://github.com/atornblad/js-mod-player>
- Revision vendored: `9b1884666e43eac36e5759555d81edf48ada5fbf` (2026-01-30)
- License: Creative Commons Attribution-NonCommercial 4.0 International, see
  `LICENSE.md`

## License note

Mantra itself is GPLv2 (see the repository `LICENSE`). The NonCommercial clause
here is an additional restriction that GPLv2 does not permit, so this folder and
the rest of the tree are not redistributable as a single combined work. Keeping
the library in its own folder, unmodified in spirit and attributed, is the least
tangled arrangement; anyone planning to redistribute Mantra should either get
separate permission from the author or swap this out for a permissively licensed
replay (libopenmpt is the obvious candidate).

## Local changes

Upstream targets four-channel ProTracker modules and mixes them to mono. Two of
the nine Mantra tracks (`track_128`, `track_135`) are 6CHN, which upstream reads
as four channels and turns into noise, so the parser and mixer are channel-count
driven here. `loader.js` is unmodified.

### `mod.js`

- Channel count comes from the format tag at offset 1080. Row stride, pattern
  stride and the sample-data offset are all derived from it, instead of the
  hardcoded 16 / 1024 / `1084 + n * 1024`.

### `mod-player-worklet.js`

- Channels are built per module from `mod.channels`, not fixed at four in the
  constructor.
- Output is stereo, with Amiga LRRL panning, instead of mono.
- The channel sum is scaled by `4 / channels`, so a 6CHN module peaks at the
  same level as a 4-channel one rather than ~1.5x hotter.
- Instrument numbers are bounds-checked. `track_128` carries a stray 64 at
  pattern 1, row 0 — a MOD only holds 31 instruments, and ProTracker ignores
  anything past that. Upstream reads it straight out of the array and throws,
  which retires the `AudioWorkletProcessor` permanently: the music stopped
  ~14 seconds in and never came back. The missing-pattern path is guarded for
  the same reason.
- `setRow` silences the sounding channels, so a seek doesn't drag the previous
  note across the jump.
- The `row` message carries `pattern`, `speed` and `bpm`.
- New opt-in `levels` message reports per-channel peak level for VU meters.
- `if (!row) debugger;` in `nextRow` is a plain guard now.

### `player.js`

- The worklet URL resolves against `import.meta.url`, so the library works from
  a folder that isn't the document root.
- `loadBuffer(arrayBuffer)` loads a module that is already in memory, next to
  the existing `load(url)`.
- The constructor takes an optional destination node, letting the host keep its
  own master/limiter chain, and `unload()` only closes the `AudioContext` when
  the player created it.
- Loading a second module reuses the existing worklet node instead of tearing
  the graph down.
- Subscriptions registered before the graph exists are replayed once it does.
- `onprocessorerror` is wired to the console, so a worklet that dies says so
  instead of just going quiet.
- `watchLevels()`, `channelCount` and `positionCount` are new; `watchRows`
  callbacks get a third argument with `pattern`, `speed` and `bpm`.
