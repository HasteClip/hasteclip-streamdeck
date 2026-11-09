# Elgato Marketplace listing

What goes into Maker Console for the plugin, following Elgato's
[product guidelines](https://docs.elgato.com/guidelines/products) and
[plugin guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins).

## Before submitting

- [ ] HasteClip with Stream Deck support is released (HasteClip/hasteclip#54
      merged and in a release). Put its version in the description's last
      line. Reviewers try the plugin, and against an older HasteClip its keys
      stay faint.
- [ ] The plugin's next version is released (`npm version minor`, then
      `git push --follow-tags`). The run of the release workflow keeps the
      Marketplace build as **marketplace**: upload that file. Don't upload
      the one on the GitHub release, which updates itself from GitHub.
- [ ] Decide the product name. It **can't be changed** once submitted.
      Neither can the plugin's id, `com.hasteclip.streamdeck`, once it's
      published.

## Product name

**HasteClip Plugin** (16 characters). Plugin names have to say what they
are, as in Elgato's "Photoshop Plugin". "HasteClip for Stream Deck" would
also fit in 30 characters.

## Description

The first 250 characters count most and should be plain text:

> Control HasteClip, the free clip recorder, from your Stream Deck. Save a
> clip the moment something happens, start and stop clipping, recording and
> streaming, switch scenes and presets, show or hide your webcam, and mute
> your mic or hold a key to talk.
>
> The keys light up with what HasteClip is doing: green while clipping, red
> while recording, purple while live, with how long it's been going. Scene,
> preset, source and sound keys take their names from HasteClip and follow
> it when you rename things. On Stream Deck +, turn a dial to pick a scene
> and push it to show it, or turn a sound up and down.
>
> Requires HasteClip 0.8 or later, running on the same computer. HasteClip
> is free for Windows and macOS at hasteclip.com.

(About 830 characters; the limit is 1,500.)

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
- Thumbnail: `thumbnail.png` (1920 × 960)
- Gallery: `gallery-1-capture.png`, `gallery-2-scenes.png`,
  `gallery-3-sound.png` (1920 × 960)

They're mock-ups made from the plugin's own key pictures. Photos or
screenshots of a real deck running it would show it better (the guidelines
ask that devices are shown accurately), up to 10 gallery items, or a video
(1920 × 1080 MP4, under 250 MB).

## Release notes (first version)

> HasteClip on your Stream Deck: save clips, clipping, recording and
> streaming keys that show what HasteClip is doing, scenes and presets,
> showing and hiding sources, and sounds (mute, push to talk, and volume on
> a Stream Deck + dial).
