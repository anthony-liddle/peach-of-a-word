"""A contact sheet of every illustration file, drawn by Inkscape with the guides
hidden and the reference layers shown, so a costume sits on its peach.

    python -I contact.py <files dir> <manifest.json> <work dir> <out.png>
"""
import json
import os
import re
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

TILE = 300
PAD = 18
LABEL = 44
COLS = 6
ORDER = ["Peach And Stages", "Costumes", "Alternates", "Marks And Details", "Icon"]
FONT = "/System/Library/Fonts/SFNS.ttf"


def main(files_dir, manifest_path, work, out):
    os.makedirs(work, exist_ok=True)
    files = json.load(open(manifest_path))["files"]
    files.sort(key=lambda f: (ORDER.index(f["folder"]), f["path"]))
    title = ImageFont.truetype(FONT, 30)
    head = ImageFont.truetype(FONT, 24)
    small = ImageFont.truetype(FONT, 17)
    sections = [(folder, [f for f in files if f["folder"] == folder]) for folder in ORDER]
    rows = sum(-(-len(fs) // COLS) for _, fs in sections)
    width = COLS * TILE + (COLS + 1) * PAD
    height = 90 + len(sections) * 56 + rows * (TILE + LABEL + PAD) + PAD
    sheet = Image.new("RGB", (width, height), "#FFF4EE")
    draw = ImageDraw.Draw(sheet)
    draw.text((PAD, 24), "Peach of a Word: every illustration, as Inkscape draws the files", fill="#6B4636", font=title)
    y = 90
    for folder, fs in sections:
        draw.text((PAD, y + 12), f"{folder}  ({len(fs)})", fill="#6B4636", font=head)
        y += 56
        for i, f in enumerate(fs):
            col, row = i % COLS, i // COLS
            x0 = PAD + col * (TILE + PAD)
            y0 = y + row * (TILE + LABEL + PAD)
            svg = open(os.path.join(files_dir, f["path"])).read()
            # Guides hidden, and the crown in front of a costume too, so each
            # costume shows whole; the crown's own file shows it on the peach.
            svg = re.sub(r'(<g\s[^>]*?id="(?:guides|reference-crown)")', r'\1\n     style="display:none"', svg)
            tmp = os.path.join(work, f["name"] + ".sheet.svg")
            open(tmp, "w").write(svg)
            png = os.path.join(work, f["name"] + ".sheet.png")
            x0a, y0a, x1a, y1a = f.get("sheetArea", [0, 0, f["width"], f["height"]])
            k = (TILE - 20) / max(x1a - x0a, y1a - y0a)
            r = subprocess.run(["inkscape", tmp, "--export-type=png", f"--export-filename={png}",
                                f"--export-width={round((x1a - x0a) * k)}", f"--export-height={round((y1a - y0a) * k)}",
                                f"--export-area={x0a}:{y0a}:{x1a}:{y1a}", "--export-background=#FFFFFF",
                                "--export-background-opacity=1"], capture_output=True, text=True)
            if r.returncode or r.stderr.strip():
                raise SystemExit(f"{f['path']}: {r.stderr}")
            draw.rounded_rectangle([x0, y0, x0 + TILE, y0 + TILE], radius=14, fill="#FFFFFF", outline="#FFD9C8", width=2)
            im = Image.open(png).convert("RGB")
            sheet.paste(im, (x0 + (TILE - im.width) // 2, y0 + (TILE - im.height) // 2))
            draw.text((x0 + 4, y0 + TILE + 8), f["name"] + ".svg", fill="#6B4636", font=small)
        y += -(-len(fs) // COLS) * (TILE + LABEL + PAD)
    sheet.save(out, optimize=True)
    print(out, sheet.size)


main(*sys.argv[1:5])
