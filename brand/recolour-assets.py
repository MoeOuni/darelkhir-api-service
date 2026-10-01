"""
Recolours the invoice's decorative assets from Rabie's teal to Dar El Khir's blue.

A displacement field in RGB: each anchor colour is sent to its target exactly,
and every in-between shade — the anti-aliased edges, the translucent overlay
blending into the band — moves by an inverse-distance-weighted share of the
anchors' moves. So white stays white, the charcoal band stays charcoal (as in
the Omri fork), and only what was teal turns blue, edges included.
"""
import sys
import numpy as np
from PIL import Image

def hexrgb(h): return np.array([int(h[i:i+2], 16) for i in (1, 3, 5)], float)

def recolour(path_in, path_out, anchors):
    im = Image.open(path_in).convert('RGBA')
    a = np.asarray(im).astype(float)
    rgb, alpha = a[..., :3], a[..., 3:]
    flat = rgb.reshape(-1, 3)
    uniq, inv = np.unique(flat.round().astype(int), axis=0, return_inverse=True)
    src = np.array([hexrgb(s) for s, _ in anchors])
    dst = np.array([hexrgb(t) for _, t in anchors])
    d = np.linalg.norm(uniq[:, None, :] - src[None, :, :], axis=2)   # (U, A)
    w = 1.0 / np.maximum(d, 1e-6) ** 2.5
    exact = d < 1e-6
    w = np.where(exact.any(1, keepdims=True), exact.astype(float), w)
    move = (w[..., None] * (dst - src)[None]).sum(1) / w.sum(1, keepdims=True)
    out = np.clip(uniq + move, 0, 255)[inv.ravel()].reshape(rgb.shape)
    Image.fromarray(np.dstack([out, alpha]).astype(np.uint8), 'RGBA').save(path_out, optimize=True)

BLUE, INK = '#2F7DB3', '#0A3F64'
D, OUT = sys.argv[1], sys.argv[2]

# Wings: the teal triangle and its darker shading become the palette blue; the
# teal-tinted grey of the overlay becomes the same grey tinted blue instead.
wing = [('#fcfcfc', '#fcfcfc'), ('#303030', '#303030'),
        ('#0c786c', BLUE), ('#0c6c6c', '#2A71A2'),
        ('#849c9c', '#8496A6'), ('#849c90', '#84949F'), ('#849090', '#848E99')]
for n in ['footer-left', 'footer-right']:
    recolour(f'{D}/{n}.png', f'{OUT}/{n}.png', wing)

# Contact icons: one ink, so one move.
for n in ['icon-phone', 'icon-mail', 'icon-location']:
    recolour(f'{D}/{n}.png', f'{OUT}/{n}.png', [('#003030', INK), ('#ffffff', '#ffffff')])
print('recoloured')
