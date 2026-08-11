# old

The AudioBufferSourceNode-per-note ProTracker replay engine that drove
everything here until its tick/row/effect logic was ported into an
AudioWorklet at `js/mod/` (see that folder's `worklet.js` for what changed and
what didn't). Kept for reference; loaded by nothing.

- `music-mod-player.js` — the engine as `music/index.html` ran it inline,
  including the per-channel analyser taps behind the meters.
- `mod.js` — the same engine as the game imported it, without the meter taps.

Both handle 4/6/8-channel modules and mix in stereo through Web Audio graph
nodes - one `AudioBufferSourceNode` per note, scheduled from a `setInterval`
lookahead loop, pitch and volume changes applied as `AudioParam` automation.
`js/mod/worklet.js` mixes sample-by-sample inside an `AudioWorklet` instead:
nearest-neighbour sample lookup and a `tanh` soft clip, in place of the
browser's own resampling and a `DynamicsCompressor`. Measured across all nine
tracks, that runs ~1.85dB hotter at the same nominal volume; both the game and
the archive page trim it back to land within 0.1-0.3dB of what these files
produce.

An earlier version briefly vendored github.com/deskjet/chiptune2.js, then
github.com/atornblad/js-mod-player, before this file's own logic was ported to
the AudioWorklet method instead and both were dropped - js-mod-player's own
4-channel assumption broke on this archive's two 6CHN tracks, and neither
avoided the CC BY-NC / GPLv2 license mismatch with the rest of this project.
