#!/usr/bin/env python3
"""Downscale 2x renders of the LangJobs icon to final sizes with LANCZOS.

Run AFTER tools/build_icons.sh has produced the hi-res PNGs in a temp dir.
This script reads hi-res PNGs and writes the final 16/32/48/128 px icons.
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "extension", "icons")
TMP = os.path.join(HERE, "..", "build_icons_tmp")

SIZES = {16: "h16.png", 32: "h32.png", 48: "h48.png", 128: "h128.png"}

for s, fname in SIZES.items():
    src = os.path.join(TMP, fname)
    im = Image.open(src).convert("RGBA")
    im = im.resize((s, s), Image.LANCZOS)
    dst = os.path.join(OUT, f"icon{s}.png")
    im.save(dst)
    print(f"icon{s}.png -> {s}x{s}, {os.path.getsize(dst)} bytes")
