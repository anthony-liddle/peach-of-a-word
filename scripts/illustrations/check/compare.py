"""Render each Inkscape file with Inkscape's command line, its reference and
guide layers hidden, and compare it with the apps' own renders.

    python -I compare.py <files dir> <manifest.json> <scale> <work dir> \
        --app web=<dir> --app ios=<dir> [--only name,name] [--json out.json]

Each app dir holds `<path>.png` per file, transparent where nothing is drawn,
and for a costume `<path>.base.png`, the peach it is drawn over. A costume's
Inkscape render (the costume alone) is laid over the app's own base, then
compared with the app's peach in the costume.

Two numbers per comparison, as channel values from 0 to 255 over white:
- `full`: the largest difference at the render's size;
- `unit`: the largest after averaging each scale-by-scale block, one pixel per
  unit of the box, which is where a part moved by a unit shows and renderers'
  edge smoothing mostly does not.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image

INKSCAPE = "inkscape"


def hide_layers(svg: str) -> str:
    """The same file with its reference and guide layers set to display:none."""
    def hide(m):
        g = m.group(0)
        if 'style="' in g:
            return g.replace('style="', 'style="display:none;', 1)
        return g.replace("<g", '<g\n     style="display:none"', 1)
    return re.sub(r'<g\s[^>]*?id="(?:reference(?:-[a-z]+)?|guides)"[^>]*>', hide, svg)


def inkscape_png(svg_path: str, png_path: str, width: int, height: int, area=None) -> str:
    """The file drawn at width by height px: its page, or `area` in its units."""
    where = (f"--export-area={area['x']}:{area['y']}:{area['x'] + area['width']}:{area['y'] + area['height']}"
             if area else "--export-area-page")
    r = subprocess.run(
        [INKSCAPE, svg_path, "--export-type=png", f"--export-filename={png_path}",
         f"--export-width={width}", f"--export-height={height}", where,
         "--export-background-opacity=0"],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"inkscape failed on {svg_path}: {r.stderr}")
    return (r.stdout + r.stderr).strip()


def load(path: str) -> np.ndarray:
    """RGBA as floats in 0..1, unpremultiplied."""
    return np.asarray(Image.open(path).convert("RGBA")).astype(np.float64) / 255


def over(top: np.ndarray, bottom: np.ndarray) -> np.ndarray:
    a = top[..., 3:4]
    b = bottom[..., 3:4]
    out_a = a + b * (1 - a)
    rgb = np.where(out_a > 0, (top[..., :3] * a + bottom[..., :3] * b * (1 - a)) / np.maximum(out_a, 1e-9), 0)
    return np.concatenate([rgb, out_a], axis=-1)


def on_white(img: np.ndarray) -> np.ndarray:
    a = img[..., 3:4]
    return img[..., :3] * a + (1 - a)


def align(img: np.ndarray, to: np.ndarray):
    """`img` moved so its ink's centre is `to`'s, by a fraction of a pixel if
    need be: bilinear, on premultiplied colour."""
    def centre(m):
        a = m[..., 3]
        ys, xs = np.nonzero(a > 0)
        wt = a[ys, xs]
        return (xs * wt).sum() / wt.sum(), (ys * wt).sum() / wt.sum()
    (ax, ay), (bx, by) = centre(img), centre(to)
    dx, dy = bx - ax, by - ay
    pm = np.concatenate([img[..., :3] * img[..., 3:4], img[..., 3:4]], axis=-1)
    h, w = img.shape[:2]
    ix, iy = int(np.floor(dx)), int(np.floor(dy))
    fx, fy = dx - ix, dy - iy

    def shifted(sx, sy):
        out = np.zeros_like(pm)
        src = pm[max(0, -sy):h - max(0, sy), max(0, -sx):w - max(0, sx)]
        out[max(0, sy):max(0, sy) + src.shape[0], max(0, sx):max(0, sx) + src.shape[1]] = src
        return out

    pm = ((1 - fx) * (1 - fy) * shifted(ix, iy) + fx * (1 - fy) * shifted(ix + 1, iy)
          + (1 - fx) * fy * shifted(ix, iy + 1) + fx * fy * shifted(ix + 1, iy + 1))
    a = pm[..., 3:4]
    rgb = np.where(a > 0, pm[..., :3] / np.maximum(a, 1e-9), 0)
    return np.concatenate([rgb, a], axis=-1), (dx, dy)


def diff(a: np.ndarray, b: np.ndarray, scale: int) -> dict:
    x = on_white(a) * 255
    y = on_white(b) * 255
    d = np.abs(x - y).max(axis=2)
    h, w = d.shape
    h, w = h - h % scale, w - w % scale
    x, y = x[:h, :w], y[:h, :w]
    bx = x.reshape(h // scale, scale, w // scale, scale, 3).mean(axis=(1, 3))
    by = y.reshape(h // scale, scale, w // scale, scale, 3).mean(axis=(1, 3))
    du = np.abs(bx - by).max(axis=2)
    return {"full": round(float(d.max()), 1), "unit": round(float(du.max()), 1),
            "over32": int((d > 32).sum())}


def main(argv):
    files_dir, manifest_path, scale, work = argv[:4]
    scale = int(scale)
    apps, only, json_out = {}, None, None
    rest = argv[4:]
    while rest:
        flag, val, *rest = rest
        if flag == "--app":
            k, v = val.split("=", 1)
            apps[k] = v
        elif flag == "--only":
            only = set(val.split(","))
        elif flag == "--json":
            json_out = val
    manifest = json.load(open(manifest_path))
    os.makedirs(work, exist_ok=True)
    results = []
    for f in manifest["files"]:
        if only and f["name"] not in only:
            continue
        src = os.path.join(files_dir, f["path"])
        hidden = os.path.join(work, f["name"] + ".hidden.svg")
        open(hidden, "w").write(hide_layers(open(src).read()))
        png = os.path.join(work, f["name"] + ".inkscape.png")
        k = f.get("renderScale", scale)
        block = f.get("block", k)
        if "compareArea" in f:
            size = f["compareSize"]
        else:
            size = [round(f["width"] * k), round(f["height"] * k)]
        noise = inkscape_png(hidden, png, size[0], size[1], f.get("compareArea"))
        ink = load(png)
        row = {"path": f["path"], "kind": f["kind"], "inkscape_stderr": noise}
        for app, d in apps.items():
            full = os.path.join(d, f["path"][:-4] + ".png")
            if not os.path.exists(full):
                continue
            target = load(full)
            base = os.path.join(d, f["path"][:-4] + ".base.png")
            mine = over(ink, load(base)) if os.path.exists(base) else ink
            # A render a little over the file's size, from a whole-pixel
            # clip, is cropped to it from the top left.
            if (target.shape[0] >= mine.shape[0] and target.shape[1] >= mine.shape[1]
                    and target.shape[0] - mine.shape[0] <= max(k, mine.shape[0] // 10)
                    and target.shape[1] - mine.shape[1] <= max(k, mine.shape[1] // 10)):
                target = target[:mine.shape[0], :mine.shape[1]]
            if mine.shape != target.shape:
                raise SystemExit(f"{f['path']}: {app} is {target.shape}, inkscape {mine.shape}")
            if f["kind"] == "glyph" and app == "ios":
                target, shift = align(target, mine)
                row[app] = diff(mine, target, block)
                row[app]["aligned_by"] = [round(v / k, 2) for v in shift]
            else:
                row[app] = diff(mine, target, block)
            if os.path.exists(base):
                row[app]["over"] = "app's own base"
        results.append(row)
        cells = "  ".join(f"{a}: full {row[a]['full']:5.1f} unit {row[a]['unit']:5.1f}"
                          for a in apps if a in row)
        print(f"{f['path']:<48} {cells}{'  STDERR ' + noise if noise else ''}")
    if json_out:
        json.dump(results, open(json_out, "w"), indent=1)


main(sys.argv[1:])
