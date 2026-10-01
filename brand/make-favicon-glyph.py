"""
A simplified house for the sizes where the full mark cannot survive.

At 16px the logo's fridge, TV and washing machine are a smear. Favicons are
the one place a brand is routinely simplified, so this keeps only what is
recognisable at a glance — the house outline with its chimney, in the logo's
blue, and the four-pane window in its orange — drawn at 8x and reduced, so the
lines land anti-aliased rather than stair-stepped.
"""
import sys
from PIL import Image, ImageDraw

def glyph(size, plate=True):
    k = 8; N = size * k
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if plate:
        d.rounded_rectangle([0, 0, N - 1, N - 1], radius=int(N * 0.2), fill=(255, 255, 255, 255))
    BLUE, ORANGE = (28, 96, 137, 255), (224, 133, 59, 255)
    w = max(int(N * 0.095), k)                 # stroke: ~1.5px at 16, ~3px at 32
    m = N * 0.14                               # margin inside the plate
    L, R, T, B = m, N - m, N * 0.12, N - m * 0.95
    eave = T + (R - L) * 0.42
    peak = ((L + R) / 2, T)
    # walls and roof as one closed outline
    d.line([(L + (R - L) * 0.12, B), (L + (R - L) * 0.12, eave)], fill=BLUE, width=w)
    d.line([(R - (R - L) * 0.12, B), (R - (R - L) * 0.12, eave)], fill=BLUE, width=w)
    d.line([(L + (R - L) * 0.06, B), (R - (R - L) * 0.06, B)], fill=BLUE, width=w)
    d.line([(L, eave + w * 0.2), peak, (R, eave + w * 0.2)], fill=BLUE, width=w, joint='curve')
    # chimney on the right slope
    cx = L + (R - L) * 0.72
    d.line([(cx, T + (R - L) * 0.30), (cx, T + (R - L) * 0.08), (cx + (R - L) * 0.12, T + (R - L) * 0.08),
            (cx + (R - L) * 0.12, T + (R - L) * 0.40)], fill=BLUE, width=w)
    # the orange window, four panes
    ws = (R - L) * 0.30; wx = (L + R) / 2 - ws / 2; wy = eave + (B - eave) * 0.18
    g = max(int(ws * 0.12), k // 2)
    half = (ws - g) / 2
    for i in range(2):
        for j in range(2):
            x0 = wx + i * (half + g); y0 = wy + j * (half + g)
            d.rectangle([x0, y0, x0 + half, y0 + half], fill=ORANGE)
    return im.resize((size, size), Image.LANCZOS)

if __name__ == '__main__':
    out = sys.argv[1]
    for s in (16, 32):
        glyph(s).save(f'{out}/glyph-{s}.png')
    glyph(256).save(f'{out}/glyph-256.png')
    print('glyphs drawn')
