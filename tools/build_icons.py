#!/usr/bin/env python3
"""Build LangJobs extension icons reproducibly from the vector source.

Pipeline:
  1. Inkscape renders the SVG at 2x (supersampling) to a temp dir.
  2. Pillow downscales each 2x render to the final size with LANCZOS,
     which removes the aliasing/jaggies you'd get from a 1x Inkscape render.

Outputs (extension/icons/):
  icon16.png, icon32.png, icon48.png, icon128.png

Dependencies: inkscape (CLI on PATH) and Pillow (`pip install pillow`).
Usage: python3 tools/build_icons.py
"""
import os
import subprocess
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "icon_source.svg")
OUT = os.path.join(HERE, "..", "extension", "icons")

# final size -> 2x supersample size sent to Inkscape
SIZES = {16: 32, 32: 64, 48: 96, 128: 256}


def find_inkscape():
    """Locate the Inkscape CLI on common Windows paths, then fall back to PATH."""
    candidates = [
        r"C:\Program Files\Inkscape\bin\inkscape.exe",
        r"C:\Program Files\Inkscape\bin\inkscape",
        "inkscape",
    ]
    for c in candidates:
        try:
            subprocess.run([c, "--version"], capture_output=True, check=True,
                           timeout=20)
            return c
        except Exception:
            continue
    raise SystemExit("Inkscape not found. Install it or put it on PATH.")


def main():
    if not os.path.exists(SRC):
        raise SystemExit(f"Missing source SVG: {SRC}")
    os.makedirs(OUT, exist_ok=True)
    ink = find_inkscape()

    with tempfile.TemporaryDirectory() as tmp:
        hi = {}
        for size, hi_size in SIZES.items():
            p = os.path.join(tmp, f"h{size}.png")
            subprocess.run(
                [ink, SRC, "-w", str(hi_size), "-h", str(hi_size), "-o", p],
                check=True, capture_output=True,
            )
            hi[size] = p

        for size, hi_path in hi.items():
            im = Image.open(hi_path).convert("RGBA")
            im = im.resize((size, size), Image.LANCZOS)
            dst = os.path.join(OUT, f"icon{size}.png")
            im.save(dst)
            print(f"wrote {dst}  ({size}x{size}, {os.path.getsize(dst)} bytes)")


if __name__ == "__main__":
    main()
