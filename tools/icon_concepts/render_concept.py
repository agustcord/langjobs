#!/usr/bin/env python3
"""Render LangJobs icon concept to 16/32/48/128 px with Inkscape (2x) + LANCZOS downscale."""
import os
from PIL import Image
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
INK = r"C:\Program Files\Inkscape\bin\inkscape.exe"
SIZES = {16: 32, 32: 64, 48: 96, 128: 256}

def render(src_svg, out_prefix):
    with tempfile.TemporaryDirectory() as tmp:
        hi = {}
        for s, hi_s in SIZES.items():
            p = os.path.join(tmp, f"h{s}.png")
            subprocess.run([INK, src_svg, "-w", str(hi_s), "-h", str(hi_s), "-o", p],
                           check=True, capture_output=True)
            hi[s] = p
        for s, hp in hi.items():
            im = Image.open(hp).convert("RGBA").resize((s, s), Image.LANCZOS)
            dst = os.path.join(HERE, f"{out_prefix}{s}.png")
            im.save(dst)
            print(f"  {dst}  {s}x{s}  {os.path.getsize(dst)}B")

if __name__ == "__main__":
    print("white tile:")
    render(os.path.join(HERE, "langjobs-icon.svg"), "conceptC_white_")
    print("blue tile:")
    render(os.path.join(HERE, "langjobs-icon-blue.svg"), "conceptC_blue_")
