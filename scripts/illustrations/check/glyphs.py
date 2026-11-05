"""Each mark's glyph as path data, from the font Chromium drew it in, placed
where Chromium placed it: absolute M, L, C and Z in the mark's box, 100 units
to the em, quadratics raised to cubics exactly.

    python -I glyphs.py <marks.json> <glyphs.json>
"""
import json
import sys

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONTS = {
    # The system font is variable: the weight Chromium asked for, and the
    # optical size of the found list's mark (16.7px clamps to the axis' 17).
    # These glyphs are the same at every optical size; checked below.
    ".SFNS-Regular": ("/System/Library/Fonts/SFNS.ttf", {"wght": 400, "opsz": 17, "wdth": 100, "GRAD": 400}),
    "ZapfDingbatsITC": ("/System/Library/Fonts/ZapfDingbats.ttf", None),
}


def num(v):
    s = f"{round(v, 3):.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


class AbsPen(BasePen):
    def __init__(self, glyphset, tx):
        super().__init__(glyphset)
        self.tx = tx
        self.out = []

    def p(self, pt):
        x, y = self.tx(pt)
        return f"{num(x)} {num(y)}"

    def _moveTo(self, pt):
        self.out.append(f"M{self.p(pt)}")

    def _lineTo(self, pt):
        self.out.append(f"L{self.p(pt)}")

    def _curveToOne(self, p1, p2, p3):
        self.out.append(f"C{self.p(p1)} {self.p(p2)} {self.p(p3)}")

    def _qCurveToOne(self, p1, p2):
        p0 = self._getCurrentPoint()
        c1 = (p0[0] + 2 / 3 * (p1[0] - p0[0]), p0[1] + 2 / 3 * (p1[1] - p0[1]))
        c2 = (p2[0] + 2 / 3 * (p1[0] - p2[0]), p2[1] + 2 / 3 * (p1[1] - p2[1]))
        self._curveToOne(c1, c2, p2)

    def _closePath(self):
        self.out.append("Z")


def outline(font, cp, tx):
    gs = font.getGlyphSet()
    name = font.getBestCmap()[cp]
    pen = AbsPen(gs, tx)
    gs[name].draw(pen)
    return " ".join(pen.out), gs[name].width


def main(src, dst):
    marks = json.load(open(src))
    cache = {}
    out = []
    for m in marks:
        ps = m["used"][0]["postScriptName"]
        path, loc = FONTS[ps]
        if ps not in cache:
            f = TTFont(path)
            cache[ps] = instantiateVariableFont(f, loc) if loc else f
            if loc:
                # The optical size changes none of these glyphs.
                for other in (28, 96):
                    g = instantiateVariableFont(TTFont(path), {**loc, "opsz": other})
                    for c in (0x2665, 0x2605):
                        a = outline(cache[ps], c, lambda p: p)
                        b = outline(g, c, lambda p: p)
                        assert a == b, f"{hex(c)} differs at opsz {other}"
        font = cache[ps]
        upm = font["head"].unitsPerEm
        k = m["em"] / upm
        ox, base = m["origin"], m["baseline"]
        d, adv = outline(font, ord(m["glyph"]), lambda p: (ox + p[0] * k, base - p[1] * k))
        r, g, b = [int(v) for v in m["color"][4:-1].split(",")]
        out.append({
            "name": m["name"], "glyph": m["glyph"], "codepoint": f"U+{ord(m['glyph']):04X}",
            "font": m["used"][0]["familyName"], "postScriptName": ps, "fontFile": path,
            "d": d, "fill": f"#{r:02X}{g:02X}{b:02X}", "advance": round(adv * k, 3),
            "origin": ox, "baseline": base,
        })
        print(m["name"], m["glyph"], ps, f"#{r:02X}{g:02X}{b:02X}", len(d), "chars")
    json.dump(out, open(dst, "w"), indent=1)


main(*sys.argv[1:3])
