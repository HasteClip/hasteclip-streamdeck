"""Draw the plugin's images: the keys, the dials' icons and the actions'
icons in Stream Deck's list, from the Phosphor icons HasteClip itself uses,
and the plugin's and its category's icons from HasteClip's logo.

    python scripts/make-images.py <phosphor fill folder> <HasteClip's crates/app/assets>

<phosphor fill folder> is `assets/fill` of the @phosphor-icons/core npm
package (MIT). Needs Pillow for the PNGs. Writes into
com.hasteclip.streamdeck.sdPlugin/imgs.

The keys are SVG, kept to what Stream Deck draws (paths and rectangles, no
masks or filters). The colours are HasteClip's dark look: green while
something's on, red while recording or muted, purple while live, the icon
faint while the key can't do anything (HasteClip isn't running, say).
"""

import re
import sys
from pathlib import Path

from PIL import Image

PLUGIN = Path(__file__).resolve().parent.parent / "com.hasteclip.streamdeck.sdPlugin" / "imgs"

BG = "#17181B"
FG = "#ECECEE"
FAINT = "#4B4D55"
GREEN, GREEN_BG = "#3DD68C", "#1F4234"
RED, RED_BG = "#FF5050", "#4A2427"
PURPLE, PURPLE_BG = "#A970FF", "#372B4D"

# Each action's pictures: (file, Phosphor icon, colour, background, with a title).
# A key with a title has its icon higher and smaller, clear of the words.
KEYS = {
    "save-clip": [("key", "film-slate", FG, BG, False), ("dim", "film-slate", FAINT, BG, False)],
    "clipping": [("off", "timer", FG, BG, False), ("on", "timer", GREEN, GREEN_BG, False), ("dim", "timer", FAINT, BG, False)],
    "recording": [("off", "record", FG, BG, True), ("on", "record", RED, RED_BG, True), ("dim", "record", FAINT, BG, True)],
    "stream": [("off", "broadcast", FG, BG, True), ("on", "broadcast", PURPLE, PURPLE_BG, True), ("dim", "broadcast", FAINT, BG, True)],
    "screenshot": [("key", "camera", FG, BG, False), ("dim", "camera", FAINT, BG, False)],
    "mark": [("key", "bookmark-simple", FG, BG, False), ("dim", "bookmark-simple", FAINT, BG, False)],
    "scene": [("off", "monitor-play", FG, BG, True), ("on", "monitor-play", GREEN, GREEN_BG, True), ("dim", "monitor-play", FAINT, BG, True)],
    "scenes": [("key", "monitor-play", FG, BG, True)],
    "preset": [("off", "stack", FG, BG, True), ("on", "stack", GREEN, GREEN_BG, True), ("dim", "stack", FAINT, BG, True)],
    "source": [("off", "eye-slash", FG, BG, True), ("on", "eye", GREEN, GREEN_BG, True), ("dim", "eye-slash", FAINT, BG, True)],
    "sound": [
        ("live", "microphone", FG, BG, True),
        ("muted", "microphone-slash", RED, RED_BG, True),
        ("mic-dim", "microphone", FAINT, BG, True),
        ("speaker", "speaker-high", FG, BG, True),
        ("speaker-muted", "speaker-x", RED, RED_BG, True),
        ("speaker-dim", "speaker-high", FAINT, BG, True),
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


def key(phosphor: Path, name: str, colour: str, background: str, titled: bool) -> str:
    # 144 x 144 (a key at 2x). Titled: a 60 px icon high up, else 72 px in the middle.
    x, y, size = (42, 22, 60) if titled else (36, 36, 72)
    body = icon(phosphor, name, colour, x, y, size)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="{background}"/>{body}</svg>'


def dial(phosphor: Path, name: str, colour: str) -> str:
    # The layouts' icon place is 48 x 48; drawn at 2x, a little in from its edges.
    body = icon(phosphor, name, colour, 8, 8, 80)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">{body}</svg>'


def listed(phosphor: Path, name: str) -> str:
    body = icon(phosphor, name, "#FFFFFF", 0, 0, 40)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">{body}</svg>'


def fitted(image: Image.Image, size: int, margin: float) -> Image.Image:
    """`image`'s drawn part, as big as fits in a `size` square with `margin` (a fraction) round it."""
    image = image.convert("RGBA")
    box = image.getbbox()
    part = image.crop(box)
    room = round(size * (1 - 2 * margin))
    scale = room / max(part.width, part.height)
    part = part.resize((max(1, round(part.width * scale)), max(1, round(part.height * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(part, ((size - part.width) // 2, (size - part.height) // 2), part)
    return out


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    phosphor, assets = Path(sys.argv[1]), Path(sys.argv[2])
    for action, looks in KEYS.items():
        for file, name, colour, background, titled in looks:
            write(PLUGIN / "actions" / action / f"{file}.svg", key(phosphor, name, colour, background, titled))
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
        fitted(app, size, 0.04).save(PLUGIN / "plugin" / f"marketplace{suffix}.png")
    for size, suffix in ((28, ""), (56, "@2x")):
        fitted(glyph, size, 0.04).save(PLUGIN / "plugin" / f"category-icon{suffix}.png")
    open_dir = PLUGIN / "actions" / "open"
    open_dir.mkdir(parents=True, exist_ok=True)
    for size, suffix in ((20, ""), (40, "@2x")):
        fitted(glyph, size, 0.02).save(open_dir / f"icon{suffix}.png")
    for size, suffix in ((72, ""), (144, "@2x")):
        plate = Image.new("RGBA", (size, size), BG)
        mark = fitted(glyph, size, 0.22)
        plate.paste(mark, (0, 0), mark)
        plate.save(open_dir / f"key{suffix}.png")


if __name__ == "__main__":
    main()
