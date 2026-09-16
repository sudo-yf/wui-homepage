"""Generate the local bold webfont and YIFAN outlines from the licensed source."""
import json
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
font = instantiateVariableFont(TTFont(ROOT / "assets/fonts/playfair-display-variable.ttf"), {"wght": 700}, inplace=True)
font.save(ROOT / "assets/fonts/playfair-display-bold.ttf")


class OutlinePen(BasePen):
    def __init__(self, glyphs):
        super().__init__(glyphs)
        self.commands = []

    def emit(self, command, *points):
        self.commands.append(command)
        self.commands.extend(str(round(value, 3)) for point in points for value in point)

    def _moveTo(self, point):
        self.start = point
        self.emit("m", point)

    def _lineTo(self, point):
        self.emit("l", point)

    def _qCurveToOne(self, control, end):
        self.emit("q", end, control)

    def _curveToOne(self, first, second, end):
        self.emit("b", end, first, second)

    def _closePath(self):
        self.emit("l", self.start)


glyph_set = font.getGlyphSet()
cmap = font.getBestCmap()
glyphs = {}
for char in "YIFAN?":
    glyph = glyph_set[cmap[ord(char)]]
    pen = OutlinePen(glyph_set)
    glyph.draw(pen)
    glyphs[char] = {"ha": glyph.width, "o": " ".join(pen.commands)}

data = {
    "familyName": "Playfair Display Bold",
    "resolution": font["OS/2"].sCapHeight,
    "boundingBox": {"yMin": font["head"].yMin, "yMax": font["head"].yMax},
    "underlineThickness": font["post"].underlineThickness,
    "glyphs": glyphs,
}
(ROOT / "assets/fonts/playfair-display-bold.typeface.json").write_text(json.dumps(data, separators=(",", ":")))
