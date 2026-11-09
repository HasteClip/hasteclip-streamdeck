"""Draw the Marketplace listing's pictures into marketplace/: the app icon
(288 x 288), the thumbnail and three gallery pictures (1920 x 960 PNG, as
Elgato's product guidelines ask). They're mock-ups made from the plugin's
own key pictures; photos of a real deck would be better.

    python scripts/make-listing.py <chrome.exe> <HasteClip's crates/app/assets>

The pictures are pages drawn by Chrome, headless (with a profile of its own,
so it never touches yours), in HasteClip's font, Hanken Grotesk.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMGS = ROOT / "com.hasteclip.streamdeck.sdPlugin" / "imgs" / "actions"
OUT = ROOT / "marketplace"


def key(image: str, title: str = "", size: int = 168) -> str:
    """A key: its picture, and its title at the bottom as Stream Deck draws it."""
    src = (IMGS / image).as_uri()
    words = title.replace("\n", "<br>")
    return (
        f'<div class="key" style="width:{size}px;height:{size}px">'
        f'<img src="{src}"><div class="title">{words}</div></div>'
    )


def deck(keys: list[str], columns: int = 5) -> str:
    """A deck with these keys, in rows of `columns`."""
    return f'<div class="deck" style="grid-template-columns:repeat({columns},auto)">{"".join(keys)}</div>'


def page(body: str, assets: Path) -> str:
    font = (assets / "fonts" / "HankenGrotesk.ttf").as_uri()
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: Hanken; src: url("{font}"); }}
html, body {{ margin: 0; width: 1920px; height: 960px; overflow: hidden; }}
body {{ background: radial-gradient(circle at 28% 30%, #23252b 0, #141518 55%, #0e0f11 100%); color: #ECECEE;
  font-family: Hanken, sans-serif; display: flex; align-items: center; justify-content: center; gap: 110px; }}
h1 {{ font-size: 92px; font-weight: 700; margin: 0; letter-spacing: -1.5px; line-height: 1.02; }}
h2 {{ font-size: 64px; font-weight: 700; margin: 0 0 18px; letter-spacing: -1px; line-height: 1.05; }}
p {{ font-size: 34px; color: #A2A4AB; margin: 0; line-height: 1.3; max-width: 560px; }}
.brand {{ display: flex; flex-direction: column; gap: 26px; }}
.brand img {{ width: 190px; height: 190px; }}
.words {{ display: flex; flex-direction: column; width: 680px; }}
.deck {{ display: grid; gap: 22px; padding: 38px; background: #050506; border-radius: 46px;
  box-shadow: 0 30px 80px rgba(0,0,0,.55), inset 0 0 0 2px #1f2024; }}
.key {{ position: relative; border-radius: 24px; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255,255,255,.04); }}
.key img {{ width: 100%; height: 100%; display: block; }}
.key .title {{ position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; font-weight: 600;
  font-size: 22px; line-height: 1.1; color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000; }}
.strip {{ display: flex; gap: 0; background: #050506; border-radius: 30px; padding: 26px; box-shadow: 0 30px 80px rgba(0,0,0,.55), inset 0 0 0 2px #1f2024; }}
.panel {{ width: 300px; height: 150px; position: relative; border-right: 2px solid #1b1c20; }}
.panel:last-child {{ border-right: 0; }}
.panel .t {{ position: absolute; left: 24px; top: 14px; font-size: 22px; font-weight: 600; }}
.panel img {{ position: absolute; left: 24px; top: 58px; width: 72px; height: 72px; }}
.panel .v {{ position: absolute; left: 114px; top: 66px; font-size: 22px; }}
.panel .bar {{ position: absolute; left: 114px; top: 106px; width: 160px; height: 16px; background: #2a2b30; border-radius: 8px; overflow: hidden; }}
.panel .bar i {{ display: block; height: 100%; background: #3DD68C; }}
.column {{ display: flex; flex-direction: column; gap: 44px; align-items: center; }}
</style></head><body>{body}</body></html>"""


def pictures(assets: Path) -> dict[str, str]:
    logo = (assets / "icon-1024.png").as_uri()
    next_scene = "Next\nscene"
    thumbnail = f"""
<div class="brand"><img src="{logo}"><h1>HasteClip<br>for Stream Deck</h1>
<p>Save clips, switch scenes and mute your mic without leaving the game.</p></div>
{deck([
    key("save-clip/key.svg"), key("clipping/on.svg"), key("recording/off.svg"), key("stream/off.svg"), key("screenshot/key.svg"),
    key("scene/on.svg", "Gameplay"), key("scene/off.svg", "Just chatting"), key("source/on.svg", "Webcam"), key("mark/key.svg"), key("preset/on.svg", "Clipping"),
    key("sound/live.svg", "Microphone"), key("sound/speaker-muted.svg", "Desktop"), key("sound/speaker.svg", "Game"), key("scene/off.svg", next_scene), key("open/key@2x.png"),
])}"""
    capture = f"""
<div class="words"><h2>Clip, record and go live</h2>
<p>Save a clip the moment it happens. The keys light up while HasteClip clips, records or streams, with the time it's been going.</p></div>
{deck([
    key("save-clip/key.svg", "", 200), key("clipping/on.svg", "", 200), key("recording/on.svg", "12:03", 200),
    key("stream/on.svg", "1:02:03", 200), key("screenshot/key.svg", "", 200), key("mark/key.svg", "", 200),
], 3)}"""
    scenes = f"""
<div class="words"><h2>Scenes, presets and sources</h2>
<p>Switch scenes live, change presets, and show or hide your webcam and other sources. Names follow HasteClip.</p></div>
{deck([
    key("scene/on.svg", "Gameplay", 200), key("scene/off.svg", "Just chatting", 200), key("scene/off.svg", next_scene, 200),
    key("preset/on.svg", "Clipping", 200), key("source/on.svg", "Webcam", 200), key("source/off.svg", "Chat", 200),
], 3)}"""
    mic = (IMGS / "sound" / "dial-mic.svg").as_uri()
    monitor = (IMGS / "scenes" / "dial.svg").as_uri()
    sound = f"""
<div class="words"><h2>Mute, talk, turn it up</h2>
<p>Mute or unmute any sound, hold a key to talk, and on Stream Deck + turn a dial for its volume.</p></div>
<div class="column">
{deck([key("sound/live.svg", "Microphone", 190), key("sound/muted.svg", "Microphone", 190), key("sound/speaker.svg", "Desktop", 190), key("sound/speaker-muted.svg", "Music", 190)], 4)}
<div class="strip">
<div class="panel"><div class="t">Microphone</div><img src="{mic}"><div class="v">−3.0 dB</div><div class="bar"><i style="width:79%"></i></div></div>
<div class="panel"><div class="t">Push to show</div><img src="{monitor}"><div class="v" style="color:#F2B544">Just chatting</div></div>
</div></div>"""
    return {"thumbnail": thumbnail, "gallery-1-capture": capture, "gallery-2-scenes": scenes, "gallery-3-sound": sound}


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    chrome, assets = sys.argv[1], Path(sys.argv[2])
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        for name, body in pictures(assets).items():
            html = Path(work) / f"{name}.html"
            html.write_text(page(body, assets), encoding="utf-8")
            out = OUT / f"{name}.png"
            subprocess.run([
                chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
                f"--user-data-dir={Path(work) / 'profile'}", "--force-device-scale-factor=1", "--window-size=1920,960",
                "--allow-file-access-from-files", "--virtual-time-budget=3000", f"--screenshot={out}", html.as_uri(),
            ], check=True, capture_output=True, timeout=120)
            print(out.name, Image.open(out).size)
    # The app icon: HasteClip's, as its product's picture.
    icon = Image.open(assets / "icon-1024.png").convert("RGBA")
    box = icon.getbbox()
    part = icon.crop(box)
    side = max(part.width, part.height)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(part, ((side - part.width) // 2, (side - part.height) // 2))
    square.resize((288, 288), Image.LANCZOS).save(OUT / "icon.png")
    print("icon.png", Image.open(OUT / "icon.png").size)


if __name__ == "__main__":
    main()
