# Elgato Marketplace listing

What goes into Maker Console for the plugin, following Elgato's
[product guidelines](https://docs.elgato.com/guidelines/products) and
[plugin guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins).

## Resubmitting (after the first review)

The first submission (0.2.0) was turned down with three requests, and each is
answered here:

- [ ] **A fuller description:** what it does, how it works, and what's
      included. See [Description](#description).
- [ ] **Official pictures of the hardware:** the pictures now use Elgato's
      own devices from its "Stream Deck Templates" Figma file. See
      [Pictures](#pictures).
- [ ] **A short demo video, emailed to maker@elgato.com:** reply to their
      email with it. See [Demo video](#demo-video).

Then, in Maker Console, open Products, the plugin, then the Versions tab.
Pick the rejected version and upload the revised file: the Marketplace build
of 0.2.1 or later. It's the **marketplace** file on the release workflow's
run. Don't upload the file on the GitHub release, which updates itself from
GitHub. Update the description and the pictures, then submit.

## Product name

**HasteClip Plugin** (16 characters). Plugin names have to say what they
are, as in Elgato's "Photoshop Plugin". "HasteClip for Stream Deck" would
also fit in 30 characters. The name can't be changed once submitted, and
neither can the plugin's id, `com.hasteclip.streamdeck`, once it's published.

## Description

1,359 characters, of 1,500. The first 250 are plain text, saying what it is
and who it's for:

```
Control HasteClip, the free clip recorder, from your Stream Deck. HasteClip keeps the last minutes of your game ready to save, like a replay buffer. With this plugin you save a clip the moment something happens, switch scenes and mute your mic without leaving the game.

What's included:
- Save clip, Screenshot and Mark moment (marks a moment in a recording)
- Clipping, Recording and Stream: start and stop them
- Scene: show a scene, or the next or previous one, live while recording
- Preset: switch HasteClip's preset
- Show or hide source: your webcam, a display, an image or a web page
- Sound: mute your mic, your computer's sound or an app, or hold a key to talk
- Open HasteClip
- Stream Deck +: turn a dial to change a sound's volume, or to pick a scene

How it works: the plugin talks to HasteClip on the same computer, with no account and nothing sent over the internet. The keys show what HasteClip is doing: green while clipping, red while recording, purple while live, with how long it's been going. Scene, source and sound keys take their names from HasteClip.

Requirements: HasteClip 0.8 or later (free at hasteclip.com) on the same computer, Windows 10 or later or macOS 13 or later, and Stream Deck 6.9 or later.

Setup: start HasteClip, drag the HasteClip actions onto your keys, and pick a scene, source or sound in each key's settings.
```

## Pricing

Free.

## Tags

Stream Deck, Stream Deck +, Stream Deck XL, Stream Deck Mini, Stream Deck
Mobile; Windows, macOS; recording, clips, streaming, gaming.

## Additional links

- Website: https://hasteclip.com
- Source code: https://github.com/HasteClip/hasteclip-streamdeck
- Support: https://github.com/HasteClip/hasteclip-streamdeck/issues

No privacy policy is needed. The Marketplace build talks only to HasteClip
on the same computer and collects nothing.

## Pictures

In this folder, made by `scripts/make-listing.py`:

- App icon: `icon.png` (288 × 288)
- Thumbnail: `thumbnail.png` (1920 × 960), on a Stream Deck MK.2
- Gallery (1920 × 960):
  - `gallery-1-capture.png`, on a Stream Deck Mini
  - `gallery-2-scenes.png`, on a Stream Deck Mini
  - `gallery-3-sound.png`, on a Stream Deck +, with the dials' layouts on
    its touch strip

The hardware is Elgato's own, from its official
[Stream Deck Templates](https://www.figma.com/community/file/1315040482142393672/stream-deck-templates)
Figma file. Each device is exported from Figma twice, with its keys black as
in the template:

- As PNG (4x is best; save the file, since a pasted copy comes through at
  1x). This is the device in the pictures, exactly as Figma draws it. Figma's
  SVG export can't carry its glass, ridge and knobs: browsers draw those
  effects differently.
- As SVG with "Include id attribute", only for where its keys and its touch
  strip are.

They're kept outside this repository because they're Elgato's files. The
plugin's real key pictures and titles are blended onto Figma's black keys
with "screen", so Elgato's glass stays as Figma drew it. To draw the
pictures again:

```sh
python scripts/make-listing.py <chrome.exe> <HasteClip's crates/app/assets> <folder with the device PNGs and SVGs>
```

## Demo video

Their review page asks for one from plugins that need hardware or a paid
service, and the reviewer asked for one here too. Record it with HasteClip
itself, in one take of 1 to 3 minutes: its screen, with a webcam (or a phone)
on the deck. Show:

1. The HasteClip actions in Stream Deck's list.
2. Clipping on: the key turns green, and HasteClip shows it's clipping.
3. Save clip: a tick on the key, and the clip in Clips.
4. Recording on and off: the time on the key, then the saved recording.
5. Scene keys switching HasteClip's scene.
6. Show or hide source: the eye on the Sources page follows.
7. Mute and push to talk: the key turns red, and HasteClip's mixer shows it.
8. Quit HasteClip: the keys go faint. Start it again: they come back.
9. With a Stream Deck +: the volume dial and the scene dial.

Reply to their email with a link that plays in a browser, such as one from
HasteClip's own Share with a link, or an unlisted YouTube video. Include the
plugin's name, its id (`com.hasteclip.streamdeck`) and its version.

## Release notes

For the revision (0.2.1):

> The keys stay connected to HasteClip 0.8.0 on Windows (they went faint
> for a moment every 5 seconds). Keys are on black, and HasteClip's logo is
> drawn cleanly.

For the first version (0.2.0):

> HasteClip on your Stream Deck: save clips, clipping, recording and
> streaming keys that show what HasteClip is doing, scenes and presets,
> showing and hiding sources, and sounds (mute, push to talk, and volume on
> a Stream Deck + dial).
