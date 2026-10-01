import sys
from PIL import Image, ImageFilter
import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
im = Image.open(SRC).convert('RGB')
a = np.asarray(im).astype(np.float64)

# The logo, with a margin, and nothing of the palette swatches on the right.
X0, Y0, X1, Y1 = 403 - 14, 176 - 14, 972 + 14, 547 + 14
crop = a[Y0:Y1, X0:X1]

# Background estimated locally: the vignette drifts from white to pale blue,
# so a smooth background field is fitted from the non-ink pixels rather than
# assuming one colour for the whole crop.
mx, mn = crop.max(2), crop.min(2)
ink = ((mx - mn) > 22) | (mx < 225)
bg_img = Image.fromarray(np.where(ink[..., None], 0, crop).astype(np.uint8))
mask = Image.fromarray((~ink * 255).astype(np.uint8))
# normalised blur = average of nearby background pixels only
blur_c = np.asarray(bg_img.filter(ImageFilter.GaussianBlur(25))).astype(np.float64)
blur_m = np.asarray(mask.filter(ImageFilter.GaussianBlur(25))).astype(np.float64)[..., None] / 255
bg = np.clip(blur_c / np.maximum(blur_m, 1e-3), 0, 255)

# Colour-to-alpha against that background, in one direction only.
#
# The background is within a few levels of white, so the "brighter than the
# background" half of the usual algorithm divides by 255 - 252 = 3: a single
# level of JPEG grain became a third opaque, and the whole crop came out as
# speckle. Every stroke of this logo is darker than the paper it sits on, so
# darkness alone measures it.
C, B = crop, bg
dn = np.where(C < B, (B - C) / np.maximum(B, 1), 0)
a_raw = dn.max(2)

# Grain and the last of the vignette sit at a few percent. Under the knee is
# background; across it the alpha ramps so edges stay smooth, not stepped.
lo, hi = 0.06, 0.14
alpha = np.where(a_raw >= hi, a_raw, np.clip((a_raw - lo) / (hi - lo), 0, 1) * a_raw)
alpha = np.clip(alpha, 0, 1)

safe = np.maximum(alpha, 1e-6)[..., None]
rgb = np.clip(B + (C - B) / safe, 0, 255)
rgb = np.where(alpha[..., None] > 0, rgb, 0)

# Solid ink stays solid. Colour-to-alpha leaves even the body of a stroke at
# ~87% (the blue is 31/247 of the way to black), which is invisible on paper
# and dim on anything dark. Past the knee the stroke is made fully opaque in
# its own colour; below it the ramp is untouched, so the edge stays soft.
s0, s1 = 0.45, 0.70
t = np.clip((a_raw - s0) / (s1 - s0), 0, 1)[..., None]
t = t * t * (3 - 2 * t)                      # smoothstep, no visible seam
rgb = rgb * (1 - t) + C * t
alpha = alpha * (1 - t[..., 0]) + 1.0 * t[..., 0]

rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
out = Image.fromarray(rgba, 'RGBA')

# Trim to what is actually drawn.
out = out.crop(out.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
out.save(f'{OUT}/logo-full.png')

# The house alone: everything above the empty band between mark and words.
house_bottom = 452 - Y0 + 3
house = Image.fromarray(rgba[:house_bottom], 'RGBA')
house = house.crop(house.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
house.save(f'{OUT}/mark.png')

# Words alone, for anywhere the mark is already shown beside them.
words = Image.fromarray(rgba[house_bottom:], 'RGBA')
words = words.crop(words.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
words.save(f'{OUT}/wordmark.png')

for n in ['logo-full', 'mark', 'wordmark']:
    print(n, Image.open(f'{OUT}/{n}.png').size)
