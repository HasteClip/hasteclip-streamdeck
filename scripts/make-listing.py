"""Draw the Marketplace listing's pictures into marketplace/: the app icon
(288 x 288), the thumbnail and three gallery pictures (1920 x 960 PNG, as
Elgato's product guidelines ask).

    python scripts/make-listing.py <chrome.exe> <HasteClip's crates/app/assets> <devices folder>

<devices folder> holds Elgato's own pictures of the hardware, from its
official "Stream Deck Templates" Figma file, for the Stream Deck MK.2, Mini
and +, each twice:

- Figma's render of it, exported as PNG (4x is best; .png or .webp), as the
  device: its glass, its ridge and its knobs exactly as Figma draws them,
  which Figma's SVG export can't carry (browsers draw its effects
  differently).
- The same frame exported as SVG with its layers' names as ids, only for
  where its keys and its touch strip are.

They're Elgato's, so they're not in this repository. The Marketplace asks
for its hardware to be shown with them.

Each key shows what it shows on the deck: the plugin's own key pictures
(imgs/) and the title Stream Deck draws, blended onto Figma's black keys
with "screen": the picture's black changes nothing (the keys' bevel and
reflections stay as Figma drew them), and its icon and title show through,
under the glass's glints. The Stream Deck +'s touch strip shows the dials'
layouts as the plugin fills them, the same way.

The pictures are pages drawn by Chrome, headless (with a profile of its own,
so it never touches yours), in HasteClip's font, Hanken Grotesk.
"""

import base64
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMGS = ROOT / "com.hasteclip.streamdeck.sdPlugin" / "imgs" / "actions"
OUT = ROOT / "marketplace"

SVG = "http://www.w3.org/2000/svg"
NS = "{" + SVG + "}"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")

# How Stream Deck draws a key's title: white, bold, outlined in black, at
# the bottom. (In the key pictures' own 144 x 144.)
TITLE = 'font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="18" fill="#fff" stroke="#000" stroke-width="3" stroke-linejoin="round" paint-order="stroke" text-anchor="middle"'


def key_picture(name: str, title: str = "") -> list[ET.Element]:
    """A key's picture (`<action>/<file>` in imgs/) and its title, in 144 x 144."""
    path = IMGS / name
    if path.suffix == ".svg":
        out = list(ET.fromstring(path.read_text(encoding="utf-8")))
    else:
        data = base64.b64encode(path.read_bytes()).decode()
        out = [ET.Element(NS + "image", {"width": "144", "height": "144", "href": f"data:image/png;base64,{data}"})]
    lines = title.split("\n") if title else []
    for i, words in enumerate(lines):
        y = 134 - 19 * (len(lines) - 1 - i)
        text = ET.fromstring(f'<text xmlns="{SVG}" x="72" y="{y}" {TITLE}></text>')
        text.text = words
        out.append(text)
    return out


def number(content: ET.Element) -> int:
    """A Content layer's key: "Content" is key 1, "Content_2" key 2."""
    m = re.fullmatch(r"Content(?:_(\d+))?", content.get("id") or "")
    return int(m.group(1) or 1) if m else 0


def render_of(devices: Path, name: str) -> Path:
    """Figma's render of device `name`."""
    for suffix in (".png", ".webp"):
        path = devices / f"{name}{suffix}"
        if path.exists():
            return path
    sys.exit(f"no {name}.png (Figma's render of it) in {devices}")


def device(devices: Path, name: str, keys: list[tuple[str, str]], width: int, strip: list[dict] | None = None) -> str:
    """Elgato's device `name`, `width` px wide, its keys showing `keys`
    (picture, title) in order, and its touch strip (Stream Deck +) `strip`."""
    root = ET.parse(devices / f"{name}.svg").getroot()
    vw, vh = (float(v) for v in root.get("viewBox").split()[2:])
    contents = sorted((g for g in root.iter(NS + "g") if number(g)), key=number)
    if len(keys) != len(contents):
        sys.exit(f"{name} has {len(contents)} keys, not {len(keys)}")
    overlay = ET.Element(NS + "svg", {"viewBox": f"0 0 {vw:g} {vh:g}", "class": "keys"})
    for content, (picture, title) in zip(contents, keys):
        shape = content.find(NS + "rect")
        x, y = re.search(r"translate\(([\d.]+) ([\d.]+)\)", shape.get("transform")).groups()
        size = shape.get("width")
        nested = ET.SubElement(overlay, NS + "svg", {"x": x, "y": y, "width": size, "height": size, "viewBox": "0 0 144 144"})
        nested.extend(key_picture(picture, title))
    if strip:
        glass = next(el for el in root.iter(NS + "image") if el.get("width") == "896")
        touch_strip(overlay, [float(glass.get(k)) for k in ("x", "y", "width", "height")], strip)
    render = render_of(devices, name)
    height = round(width * vh / vw)
    return f'<div class="device" style="width:{width}px;height:{height}px"><img src="{render.as_uri()}">{ET.tostring(overlay, encoding="unicode")}</div>'


def touch_strip(overlay: ET.Element, glass: list[float], panels: list[dict]) -> None:
    """The Stream Deck +'s touch strip: 800 x 100 pixels across its glass,
    a 200 x 100 layout over each dial ($A1 or $B1, as the plugin uses)."""
    gx, gy, gw, gh = glass
    scale = (gw - 32) / 800
    left, top = gx + 16, gy + (gh - 100 * scale) / 2
    for i, panel in enumerate(panels):
        g = ET.SubElement(overlay, NS + "g", {"transform": f"translate({left + i * 200 * scale:g} {top:g}) scale({scale:g})"})
        title = ET.SubElement(g, NS + "text", {"x": "16", "y": "28", "font-family": "Arial, Helvetica, sans-serif", "font-size": "15", "font-weight": "700", "fill": "#fff"})
        title.text = panel["title"]
        icon = ET.SubElement(g, NS + "svg", {"x": "16", "y": "40", "width": "48", "height": "48", "viewBox": "0 0 96 96"})
        icon.extend(ET.fromstring((IMGS / panel["icon"]).read_text(encoding="utf-8")))
        value = ET.SubElement(g, NS + "text", {"x": "184", "y": "63", "text-anchor": "end", "font-family": "Arial, Helvetica, sans-serif", "font-size": "17", "fill": panel.get("colour", "#fff")})
        value.text = panel["value"]
        if "bar" in panel:
            ET.SubElement(g, NS + "rect", {"x": "76", "y": "74", "width": "108", "height": "12", "rx": "2", "fill": "#2b2c30"})
            ET.SubElement(g, NS + "rect", {"x": "76", "y": "74", "width": f"{108 * panel['bar']:g}", "height": "12", "rx": "2", "fill": panel.get("bar_colour", "#3DD68C")})


def page(body: str, assets: Path) -> str:
    font = (assets / "fonts" / "HankenGrotesk.ttf").as_uri()
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: Hanken; src: url("{font}"); }}
html, body {{ margin: 0; width: 1920px; height: 960px; overflow: hidden; }}
body {{ background: radial-gradient(circle at 28% 30%, #23252b 0, #141518 55%, #0e0f11 100%); color: #ECECEE;
  font-family: Hanken, sans-serif; display: flex; align-items: center; justify-content: center; gap: 120px; }}
h1 {{ font-size: 92px; font-weight: 700; margin: 0; letter-spacing: -1.5px; line-height: 1.02; }}
h2 {{ font-size: 64px; font-weight: 700; margin: 0 0 18px; letter-spacing: -1px; line-height: 1.05; text-wrap: balance; }}
p {{ font-size: 34px; color: #A2A4AB; margin: 0; line-height: 1.3; max-width: 600px; text-wrap: pretty; }}
.brand {{ display: flex; flex-direction: column; gap: 26px; }}
.brand img {{ width: 190px; height: 190px; }}
.words {{ display: flex; flex-direction: column; width: 680px; }}
.device {{ position: relative; flex: none; filter: drop-shadow(0 40px 60px rgba(0,0,0,.45)); }}
.device > img {{ display: block; width: 100%; height: 100%; }}
.device > svg.keys {{ position: absolute; inset: 0; width: 100%; height: 100%; mix-blend-mode: screen; }}
</style></head><body>{body}</body></html>"""


def pictures(assets: Path, devices: Path) -> dict[str, str]:
    logo = (assets / "icon-1024.png").as_uri()
    thumbnail = f"""
<div class="brand"><img src="{logo}"><h1>HasteClip<br>for Stream Deck</h1>
<p>Save clips, switch scenes and mute your mic without leaving the game.</p></div>
{device(devices, "Stream Deck MK.2", [
    ("save-clip/key.svg", ""), ("clipping/on.svg", ""), ("recording/off.svg", ""), ("stream/off.svg", ""), ("screenshot/key.svg", ""),
    # The middle key has the MK.2's ridge: one without a title.
    ("scene/on.svg", "Gameplay"), ("scene/off.svg", "Chatting"), ("mark/key.svg", ""), ("source/on.svg", "Webcam"), ("preset/on.svg", "Clipping"),
    ("sound/live.svg", "Mic"), ("sound/speaker-muted.svg", "Desktop"), ("sound/speaker.svg", "Game"), ("scene/off.svg", "Next\nscene"), ("open/key@2x.png", ""),
], 980)}"""
    capture = f"""
<div class="words"><h2>Clip, record and go live</h2>
<p>The keys light up while HasteClip clips, records or streams, with how long it's been going.</p></div>
{device(devices, "Stream Deck Mini", [
    ("save-clip/key.svg", ""), ("clipping/on.svg", ""), ("recording/on.svg", "12:03"),
    ("stream/on.svg", "1:02:03"), ("screenshot/key.svg", ""), ("mark/key.svg", ""),
], 860)}"""
    scenes = f"""
<div class="words"><h2>Scenes, presets and sources</h2>
<p>Switch scenes live, change presets, and show or hide your webcam. Names follow HasteClip.</p></div>
{device(devices, "Stream Deck Mini", [
    ("scene/on.svg", "Gameplay"), ("scene/off.svg", "Chatting"), ("scene/off.svg", "Next\nscene"),
    ("preset/on.svg", "Clipping"), ("source/on.svg", "Webcam"), ("source/off.svg", "Chat"),
], 860)}"""
    sound = f"""
<div class="words"><h2>Mute, talk, turn it up</h2>
<p>Mute any sound or hold a key to talk. On Stream Deck +, turn a dial for its volume or to pick a scene.</p></div>
{device(devices, "Stream Deck +", [
    ("sound/live.svg", "Mic"), ("sound/speaker.svg", "Desktop"), ("sound/speaker.svg", "Game"), ("sound/speaker-muted.svg", "Music"),
    ("clipping/on.svg", ""), ("save-clip/key.svg", ""), ("recording/on.svg", "12:03"), ("scene/on.svg", "Gameplay"),
], 820, strip=[
    {"title": "Mic", "icon": "sound/dial-mic.svg", "value": "−3.0 dB", "bar": 0.79},
    {"title": "Desktop", "icon": "sound/dial-speaker.svg", "value": "0.0 dB", "bar": 0.83},
    {"title": "Music", "icon": "sound/dial-speaker-muted.svg", "value": "Muted", "colour": "#FF5050", "bar": 0.7, "bar_colour": "#6E7179"},
    {"title": "Push to show", "icon": "scenes/dial.svg", "value": "Chatting", "colour": "#F2B544"},
])}"""
    return {"thumbnail": thumbnail, "gallery-1-capture": capture, "gallery-2-scenes": scenes, "gallery-3-sound": sound}


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    chrome, assets, devices = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        for name, body in pictures(assets, devices).items():
            html = Path(work) / f"{name}.html"
            html.write_text(page(body, assets), encoding="utf-8")
            out = OUT / f"{name}.png"
            subprocess.run([
                chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
                f"--user-data-dir={Path(work) / 'profile'}", "--force-device-scale-factor=1", "--window-size=1920,960",
                "--allow-file-access-from-files", "--virtual-time-budget=5000", f"--screenshot={out}", html.as_uri(),
            ], check=True, capture_output=True, timeout=180)
            print(out.name, Image.open(out).size)
    # The app icon: HasteClip's black plate to the edges, the glyph where
    # HasteClip's own icon has it (824 px, 100 in, in icon-1024.png). The
    # Marketplace rounds its corners itself, by a quarter: an icon rounded
    # already, with a shadow, showed as a smaller tile inside its tile.
    square = Image.new("RGBA", (824, 824), (0, 0, 0, 255))
    square.alpha_composite(Image.open(assets / "icon-1024.png").convert("RGBA").crop((100, 100, 924, 924)))
    square.convert("RGB").resize((288, 288), Image.LANCZOS).save(OUT / "icon.png")
    print("icon.png", Image.open(OUT / "icon.png").size)


if __name__ == "__main__":
    main()
