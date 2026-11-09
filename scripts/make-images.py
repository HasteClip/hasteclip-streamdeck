"""Draw the plugin's images: the keys, the dials' icons and the actions'
icons in Stream Deck's list, from the Phosphor icons HasteClip itself uses,
and the plugin's and its category's icons from HasteClip's logo.

    python scripts/make-images.py <phosphor fill folder> <HasteClip's crates/app/assets>

<phosphor fill folder> is `assets/fill` of the @phosphor-icons/core npm
package (MIT). Needs Pillow for the PNGs. Writes into
com.hasteclip.streamdeck.sdPlugin/imgs.

The keys are SVG, kept to what Stream Deck draws (paths and rectangles, no
masks or filters), on black: the deck's own, so a key's picture has no edge
of its own. What a key's doing is in its icon's colour, HasteClip's: green
while something's on, red while recording or muted, purple while live,
faint while the key can't do anything (HasteClip isn't running, say).

The logo's glyph comes from glyph.png: white, its edges only see-through,
never darkened. (Not tray/ or glyph-icon/: those have a dark keyline or a
shadow on purpose, for light taskbars and backgrounds, which shows as a
dark ring round the glyph on a key.) It's laid on with alpha_composite:
Pillow's paste(image, where, image) blends the see-through itself too, and
left the edges half see-through and dark, a dark ring round the glyph.
"""

import re
import sys
from pathlib import Path

from PIL import Image

PLUGIN = Path(__file__).resolve().parent.parent / "com.hasteclip.streamdeck.sdPlugin" / "imgs"

BLACK = "#000000"
FG = "#ECECEE"
FAINT = "#4B4D55"
GREEN = "#3DD68C"
RED = "#FF5050"
PURPLE = "#A970FF"

# Each action's pictures: (file, Phosphor icon, colour, with a title). A key
# with a title has its icon higher and smaller, clear of the words.
KEYS = {
    "save-clip": [("key", "film-slate", FG, False), ("dim", "film-slate", FAINT, False)],
    "clipping": [("off", "timer", FG, False), ("on", "timer", GREEN, False), ("dim", "timer", FAINT, False)],
    "recording": [("off", "record", FG, True), ("on", "record", RED, True), ("dim", "record", FAINT, True)],
    "stream": [("off", "broadcast", FG, True), ("on", "broadcast", PURPLE, True), ("dim", "broadcast", FAINT, True)],
    "screenshot": [("key", "camera", FG, False), ("dim", "camera", FAINT, False)],
    "mark": [("key", "bookmark-simple", FG, False), ("dim", "bookmark-simple", FAINT, False)],
    "scene": [("off", "monitor-play", FG, True), ("on", "monitor-play", GREEN, True), ("dim", "monitor-play", FAINT, True)],
    "scenes": [("key", "monitor-play", FG, True)],
    "preset": [("off", "stack", FG, True), ("on", "stack", GREEN, True), ("dim", "stack", FAINT, True)],
    "source": [("off", "eye-slash", FG, True), ("on", "eye", GREEN, True), ("dim", "eye-slash", FAINT, True)],
    "sound": [
        ("live", "microphone", FG, True),
        ("muted", "microphone-slash", RED, True),
        ("mic-dim", "microphone", FAINT, True),
        ("speaker", "speaker-high", FG, True),
        ("speaker-muted", "speaker-x", RED, True),
        ("speaker-dim", "speaker-high", FAINT, True),
    ],
}

# Icons for a dial's part of the touch strip (on its own background).
DIALS = {
    "scenes": [("dial", "monitor-play", FG)],
    "sound": [
        ("dial-mic", "microphone", FG),
        ("dial-mic-muted", "microphone-slash", RED),
        ("dial-speaker", "speaker-high", FG),
        ("dial-speaker-muted", "speaker-x", RED),
    ],
}

# The icon each action has in Stream Deck's list of actions (white, 20 px).
LIST = {
    "save-clip": "film-slate",
    "clipping": "timer",
    "recording": "record",
    "stream": "broadcast",
    "screenshot": "camera",
    "mark": "bookmark-simple",
    "scene": "monitor-play",
    "scenes": "monitor-play",
    "preset": "stack",
    "source": "eye",
    "sound": "microphone",
}


def paths(phosphor: Path, name: str) -> list[str]:
    """The path data of a Phosphor icon (drawn in 256 x 256)."""
    svg = (phosphor / f"{name}-fill.svg").read_text(encoding="utf-8")
    found = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    if not found:
        sys.exit(f"no path in {name}")
    return found


def icon(phosphor: Path, name: str, colour: str, x: float, y: float, size: float) -> str:
    scale = size / 256
    return "".join(f'<path transform="translate({x:g} {y:g}) scale({scale:g})" fill="{colour}" d="{d}"/>' for d in paths(phosphor, name))


def write(path: Path, svg: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg + "\n", encoding="utf-8", newline="\n")


def key(phosphor: Path, name: str, colour: str, titled: bool) -> str:
    # 144 x 144 (a key at 2x). Titled: a 60 px icon high up, else 72 px in the middle.
    x, y, size = (42, 22, 60) if titled else (36, 36, 72)
    body = icon(phosphor, name, colour, x, y, size)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="{BLACK}"/>{body}</svg>'


def dial(phosphor: Path, name: str, colour: str) -> str:
    # The layouts' icon place is 48 x 48; drawn at 2x, a little in from its edges.
    body = icon(phosphor, name, colour, 8, 8, 80)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">{body}</svg>'


def listed(phosphor: Path, name: str) -> str:
    body = icon(phosphor, name, "#FFFFFF", 0, 0, 40)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">{body}</svg>'


def fitted(image: Image.Image, size: int, margin: float) -> Image.Image:
    """`image`'s drawn part, as big as fits in a `size` square with `margin`
    (a fraction) round it, on transparent."""
    image = image.convert("RGBA")
    part = image.crop(image.getbbox())
    room = round(size * (1 - 2 * margin))
    scale = room / max(part.width, part.height)
    # Pillow scales an RGBA picture with its colours weighted by how solid
    # they are, so the see-through edges stay the glyph's white.
    part = part.resize((max(1, round(part.width * scale)), max(1, round(part.height * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(part, ((size - part.width) // 2, (size - part.height) // 2))
    return out


def square_icon(app: Image.Image, size: int) -> Image.Image:
    """HasteClip's app icon as a full square: its black plate to the edges
    (824 px, 100 in, in icon-1024.png), the glyph where the icon has it. No
    rounding or shadow: Stream Deck and the Marketplace round the corners
    themselves (the Marketplace by a quarter), as Elgato's template expects."""
    square = Image.new("RGBA", (824, 824), (0, 0, 0, 255))
    square.alpha_composite(app.convert("RGBA").crop((100, 100, 924, 924)))
    return square.resize((size, size), Image.LANCZOS)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    phosphor, assets = Path(sys.argv[1]), Path(sys.argv[2])
    for action, looks in KEYS.items():
        for file, name, colour, titled in looks:
            write(PLUGIN / "actions" / action / f"{file}.svg", key(phosphor, name, colour, titled))
    for action, looks in DIALS.items():
        for file, name, colour in looks:
            write(PLUGIN / "actions" / action / f"{file}.svg", dial(phosphor, name, colour))
    for action, name in LIST.items():
        write(PLUGIN / "actions" / action / "icon.svg", listed(phosphor, name))

    # HasteClip's own: the app icon for the plugin, its glyph (white) for
    # the category, the Open key and its icon in the list.
    app = Image.open(assets / "icon-1024.png")
    glyph = Image.open(assets / "glyph.png")
    (PLUGIN / "plugin").mkdir(parents=True, exist_ok=True)
    for size, suffix in ((256, ""), (512, "@2x")):
        square_icon(app, size).save(PLUGIN / "plugin" / f"marketplace{suffix}.png")
    for size, suffix in ((28, ""), (56, "@2x")):
        fitted(glyph, size, 0.04).save(PLUGIN / "plugin" / f"category-icon{suffix}.png")
    open_dir = PLUGIN / "actions" / "open"
    open_dir.mkdir(parents=True, exist_ok=True)
    for size, suffix in ((20, ""), (40, "@2x")):
        fitted(glyph, size, 0.02).save(open_dir / f"icon{suffix}.png")
    for size, suffix in ((72, ""), (144, "@2x")):
        plate = Image.new("RGBA", (size, size), (0, 0, 0, 255))
        plate.alpha_composite(fitted(glyph, size, 0.22))
        plate.convert("RGB").save(open_dir / f"key{suffix}.png")


if __name__ == "__main__":
    main()
