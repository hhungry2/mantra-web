# old

The from-scratch ProTracker replay engine that used to drive everything here,
kept after the switch to `js/vendor/js-mod-player`.

- `music-mod-player.js` — the engine as `music/index.html` ran it inline,
  including the per-channel analyser taps behind the meters. Still loaded: the
  archive page's ENGINE switch plays through it, so the two replays can be
  compared on the same bar of the same song.
- `mod.js` — the same engine as the game imported it, without the meter taps.
  Loaded by nothing; the game plays through the vendored player.

Both handle 4/6/8-channel modules and mix in stereo through Web Audio graph
nodes, one `AudioBufferSourceNode` per note, scheduled from a `setInterval`
lookahead loop. The replacement mixes sample by sample inside an
`AudioWorklet` instead, which is audible: nearest-neighbour sample lookup and a
`tanh` soft clip against the browser's own resampling and a limiter.
