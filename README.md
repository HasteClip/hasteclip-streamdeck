# HasteClip for Stream Deck

Control [HasteClip](https://hasteclip.com) from an Elgato Stream Deck. Save
clips, start and stop clipping, recording and streaming, switch scenes and
presets, show and hide sources, and mute your sounds or turn them up and down.
The keys light up with what HasteClip is doing, so the deck also tells you
whether you're clipping, recording or live.

## Actions

| Action | On a key | Lit when |
|---|---|---|
| **Save clip** | Saves what HasteClip kept while clipping. While recording, it also marks the moment, as the shortcut does. Shows a tick once saved. | Faint while there's nothing to save |
| **Clipping** | Starts or stops clipping. | Green while clipping |
| **Recording** | Starts or stops recording, and shows how long it's been going. | Red while recording |
| **Stream** | Goes live (HasteClip asks first, in its window, as it always does) or ends the stream. Shows how long you've been live. | Purple while live |
| **Screenshot** | Takes a screenshot. | |
| **Mark moment** | Marks the moment in the recording, to find it again later. | Faint while not recording |
| **Scene** | Shows a scene, live while capturing. It can also be set to the next scene or the previous one. | Green while it's the scene shown |
| **Preset** | Uses a preset. While you're only clipping, HasteClip asks first, because clipping starts again. | Green while it's in use |
| **Show or hide source** | Shows or hides a source (webcam, display, image…) in the scene shown. | Green while it's shown |
| **Sound** | Mutes or unmutes a sound (your mic, the computer's sound, an app's). It can be set to unmute only while held (push to talk) or to mute only while held. | Red while muted |
| **Open HasteClip** | Brings HasteClip's window to the front, or starts HasteClip. | |

On a Stream Deck + or another deck with dials:

| Action | On a dial |
|---|---|
| **Scenes** | Turn it to pick a scene, then push it (or tap the screen) to show it. Turning alone doesn't switch scenes, so the ones you pass aren't flashed on stream. |
| **Sound** | Turn it to change the volume (1 dB a step), and push it or tap the screen to mute. The screen shows the volume, as HasteClip's mixer does. |

Scene, preset, source and sound keys show the name from HasteClip and keep up
when you rename things there. To put your own words on a key, type them in
its Title. Clear the Title to get the name back.

In a multi-action, keys with two states (Clipping, Recording, Stream, Source,
Sound) do whatever state you pick for them there. For example, "Clipping on"
starts clipping and does nothing if it's already on.

## What it needs

- HasteClip running on the same computer, in a version with Stream Deck
  support. Older versions don't answer the plugin, and its keys stay faint.
- Stream Deck 6.6 or later, on Windows 10 or later, or macOS 13 or later.

## Installing from source

```sh
npm install
npm run pack
```

Then open `dist/com.hasteclip.streamdeck.streamDeckPlugin` and Stream Deck
installs it.

For working on it, link the folder into Stream Deck instead and rebuild as
you go:

```sh
npm install
npm run build
npx streamdeck link com.hasteclip.streamdeck.sdPlugin
npm run watch
```

## How it talks to HasteClip

The plugin connects to HasteClip's local port (`127.0.0.1:52131`), which
only accepts connections from the same computer. Each side writes one JSON
object per line. HasteClip tells the plugin what it's doing and answers its
requests. HasteClip's
[docs/control.md](https://github.com/hasteclip/hasteclip/blob/main/docs/control.md)
describes the protocol. Anything else can use it the same way.

When HasteClip isn't running, the plugin tries again every few seconds, so
the keys come back to life as soon as HasteClip starts.

## Developing

- `src/hasteclip.ts`: the connection to HasteClip. `npm test` runs its tests
  against a stand-in HasteClip (needs Node.js 24; the plugin itself runs on
  Stream Deck's Node.js 20).
- `src/action.ts`: what every action shares. Each key is drawn again
  whenever HasteClip's state changes, and only changes are sent to Stream
  Deck.
- `src/actions/`: the actions.
- `com.hasteclip.streamdeck.sdPlugin/`: the plugin as Stream Deck loads it,
  with its manifest, images and settings pages (`ui/`, built with
  [sdpi-components](https://sdpi-components.dev)).
- `scripts/make-images.py`: draws the images from the
  [Phosphor](https://phosphoricons.com) icons HasteClip uses and from
  HasteClip's logo.
- `npm run validate` checks the plugin the way Elgato's Marketplace does.

## License

GPL-3.0-or-later, as HasteClip. It includes sdpi-components (MIT, Corsair
Memory Inc.) and Phosphor icons (MIT).
