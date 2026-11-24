#!/usr/bin/env python
"""Regenerate the PWA icons from tools/logo-source.png (needs Pillow).
   py tools/gen-icons.py
Outputs: icons/icon-192.png, icons/icon-512.png        (rounded, transparent corners — purpose "any")
         icons/icon-maskable-512.png                    (opaque navy field, art in the 80% safe zone — purpose "maskable")
         icons/apple-touch-icon.png                     (180x180 opaque; iOS applies its own rounded mask)
"""
import os
from PIL import Image
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = Image.open(os.path.join(root, 'tools', 'logo-source.png')).convert('RGBA')
NAVY = (15, 35, 71, 255)   # sampled just inside the logo's edge
def resized(size): return src.resize((size, size), Image.LANCZOS)
def save(im, name): im.save(os.path.join(root, 'icons', name), optimize=True); print(name, im.size)
save(resized(192), 'icon-192.png'); save(resized(512), 'icon-512.png')
m = Image.new('RGBA', (512, 512), NAVY); art = resized(410); m.alpha_composite(art, ((512 - 410) // 2, (512 - 410) // 2)); save(m, 'icon-maskable-512.png')
a = Image.new('RGBA', (180, 180), NAVY); a.alpha_composite(resized(180)); save(a.convert('RGB'), 'apple-touch-icon.png')
