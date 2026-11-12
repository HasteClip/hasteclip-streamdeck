"""Draw the Marketplace listing's pictures into marketplace/: the app icon
(288 x 288), the thumbnail and three gallery pictures (1920 x 960 PNG, as
Elgato's product guidelines ask).

    python scripts/make-listing.py <chrome.exe> <HasteClip's crates/app/assets> <devices folder>

<devices folder> holds Elgato's own pictures of the hardware, from its
official "Stream Deck Templates" Figma file, each device exported as SVG
with its layers' names as ids: "Stream Deck MK.2.svg", "Stream Deck
Mini.svg" and "Stream Deck +.svg". They're Elgato's, so they're not in this
repository. The Marketplace asks for its hardware to be shown with them.

Each key shows what it shows on the deck: the plugin's own key pictures
(imgs/), put into the key's "Content" layer, under Elgato's bevel and
reflections, with the title Stream Deck draws. The Stream Deck +'s touch
strip shows the dials' layouts as the plugin fills them. Two things in the
exports are changed so Chrome draws them as Figma does: the bevel's
background blur (an HTML element in the SVG, which would blur the whole
key) is left out, and the reflections' shapes are made solid. They were 1%
opaque, which made their inner glints cover the whole key; they're blended
with "screen", where black changes nothing.

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


def device(path: Path, keys: list[tuple[str, str]], width: int, strip: list[dict] | None = None) -> str:
    """Elgato's device, `width` px wide, its keys showing `keys` (picture,
    title) in order, and its touch strip (Stream Deck +) showing `strip`."""
    root = ET.parse(path).getroot()
    parents = {child: parent for parent in root.iter() for child in parent}
    for el in list(root.iter(NS + "foreignObject")):
        parents[el].remove(el)
    for g in root.iter(NS + "g"):
        if "mix-blend-mode:screen" in (g.get("style") or ""):
            for shape in g.iter():
                if shape.get("fill-opacity") == "0.01":
                    shape.set("fill-opacity", "1")
    # The MK.2's middle key has a ridge: in Elgato's photos a faint, clear
    # oval you read the title through. Chrome draws the template's as a grey
    # disc: faint, as on the deck.
    for g in root.iter(NS + "g"):
        if g.get("id") == "Ridge":
            g.set("opacity", "0.3")
    # Each filter's area, wider: Chrome cuts a filter's steps off at its
    # area, and the reflections' inner glints (a shape grown, then moved)
    # were cut into wide bands down the keys' sides.
    for f in root.iter(NS + "filter"):
        if f.get("filterUnits") == "userSpaceOnUse":
            for k, d in (("x", -48), ("y", -48), ("width", 96), ("height", 96)):
                f.set(k, f"{float(f.get(k)) + d:g}")
    contents = sorted((g for g in root.iter(NS + "g") if number(g)), key=number)
    if len(keys) != len(contents):
        sys.exit(f"{path.name} has {len(contents)} keys, not {len(keys)}")
    for content, (picture, title) in zip(contents, keys):
        shape = content.find(NS + "rect")
        x, y = re.search(r"translate\(([\d.]+) ([\d.]+)\)", shape.get("transform")).groups()
        size = shape.get("width")
        content.remove(shape)
        nested = ET.SubElement(content, NS + "svg", {"x": x, "y": y, "width": size, "height": size, "viewBox": "0 0 144 144"})
        nested.extend(key_picture(picture, title))
    if strip:
        touch_strip(root, strip)
    vw, vh = (float(v) for v in root.get("viewBox").split()[2:])
    root.set("width", str(width))
    root.set("height", str(round(width * vh / vw)))
    return ET.tostring(root, encoding="unicode")


def touch_strip(root: ET.Element, panels: list[dict]) -> None:
    """The Stream Deck +'s touch strip: 800 x 100 pixels across its glass,
    a 200 x 100 layout over each dial ($A1 or $B1, as the plugin uses)."""
    glass = next(el for el in root.iter(NS + "image") if el.get("width") == "896")
    gx, gy, gw, gh = (float(glass.get(k)) for k in ("x", "y", "width", "height"))
    scale = (gw - 32) / 800
    left, top = gx + 16, gy + (gh - 100 * scale) / 2
    group = ET.Element(NS + "g")
    for i, panel in enumerate(panels):
        g = ET.SubElement(group, NS + "g", {"transform": f"translate({left + i * 200 * scale:g} {top:g}) scale({scale:g})"})
        title = ET.SubElement(g, NS + "text", {"x": "16", "y": "28", "font-family": "Arial, Helvetica, sans-serif", "font-size": "15", "font-weight": "700", "fill": "#fff"})
        title.text = panel["title"]
        icon = ET.SubElement(g, NS + "svg", {"x": "16", "y": "40", "width": "48", "height": "48", "viewBox": "0 0 96 96"})
        icon.extend(ET.fromstring((IMGS / panel["icon"]).read_text(encoding="utf-8")))
        value = ET.SubElement(g, NS + "text", {"x": "184", "y": "63", "text-anchor": "end", "font-family": "Arial, Helvetica, sans-serif", "font-size": "17", "fill": panel.get("colour", "#fff")})
        value.text = panel["value"]
        if "bar" in panel:
            ET.SubElement(g, NS + "rect", {"x": "76", "y": "74", "width": "108", "height": "12", "rx": "2", "fill": "#2b2c30"})
            ET.SubElement(g, NS + "rect", {"x": "76", "y": "74", "width": f"{108 * panel['bar']:g}", "height": "12", "rx": "2", "fill": panel.get("bar_colour", "#3DD68C")})
    parent = next(p for p in root.iter() if glass in list(p))
    parent.insert(list(parent).index(glass) + 1, group)


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
svg {{ display: block; filter: drop-shadow(0 40px 60px rgba(0,0,0,.45)); }}
</style></head><body>{body}</body></html>"""


def pictures(assets: Path, devices: Path) -> dict[str, str]:
    logo = (assets / "icon-1024.png").as_uri()
    mk2, mini, plus = devices / "Stream Deck MK.2.svg", devices / "Stream Deck Mini.svg", devices / "Stream Deck +.svg"
    thumbnail = f"""
<div class="brand"><img src="{logo}"><h1>HasteClip<br>for Stream Deck</h1>
<p>Save clips, switch scenes and mute your mic without leaving the game.</p></div>
{device(mk2, [
    ("save-clip/key.svg", ""), ("clipping/on.svg", ""), ("recording/off.svg", ""), ("stream/off.svg", ""), ("screenshot/key.svg", ""),
    # The middle key has the MK.2's ridge: one without a title.
    ("scene/on.svg", "Gameplay"), ("scene/off.svg", "Chatting"), ("mark/key.svg", ""), ("source/on.svg", "Webcam"), ("preset/on.svg", "Clipping"),
    ("sound/live.svg", "Mic"), ("sound/speaker-muted.svg", "Desktop"), ("sound/speaker.svg", "Game"), ("scene/off.svg", "Next\nscene"), ("open/key@2x.png", ""),
], 980)}"""
    capture = f"""
<div class="words"><h2>Clip, record and go live</h2>
<p>The keys light up while HasteClip clips, records or streams, with how long it's been going.</p></div>
{device(mini, [
    ("save-clip/key.svg", ""), ("clipping/on.svg", ""), ("recording/on.svg", "12:03"),
    ("stream/on.svg", "1:02:03"), ("screenshot/key.svg", ""), ("mark/key.svg", ""),
], 860)}"""
    scenes = f"""
<div class="words"><h2>Scenes, presets and sources</h2>
<p>Switch scenes live, change presets, and show or hide your webcam. Names follow HasteClip.</p></div>
{device(mini, [
    ("scene/on.svg", "Gameplay"), ("scene/off.svg", "Chatting"), ("scene/off.svg", "Next\nscene"),
    ("preset/on.svg", "Clipping"), ("source/on.svg", "Webcam"), ("source/off.svg", "Chat"),
], 860)}"""
    sound = f"""
<div class="words"><h2>Mute, talk, turn it up</h2>
<p>Mute any sound or hold a key to talk. On Stream Deck +, turn a dial for its volume or to pick a scene.</p></div>
{device(plus, [
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
