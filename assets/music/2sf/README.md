# Bundled 2SF tracks

Files dropped in this folder are served to [`music/2sf.html`](../../../music/2sf.html).

A `.mini2sf` contains only the sequence data; the sample and driver data live in a
shared `.2sflib`. Keep both **in this folder** — the emulator asks for the library
by the name stored in the song's `_lib` tag and fetches it from the song's own
directory.

To make tracks show up in the page's track list, add `index.json` here:

```json
{
  "tracks": [
    { "file": "ntr-abcd-jpn-0000.mini2sf", "title": "Title Screen" },
    { "file": "ntr-abcd-jpn-0001.mini2sf", "title": "Overworld" }
  ]
}
```

A bare string works too, in which case the filename is used as the title:

```json
{ "tracks": ["ntr-abcd-jpn-0000.mini2sf"] }
```

Without `index.json` the page still works — the track list stays empty and files
can be dragged in from the local disk instead.
