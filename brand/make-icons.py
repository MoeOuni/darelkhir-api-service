"""Every icon the app and the dashboard need, from the extracted house mark."""
import sys
from PIL import Image, ImageDraw, ImageFilter

BRAND, APP, DASH = sys.argv[1], sys.argv[2], sys.argv[3]
mark = Image.open(f'{BRAND}/mark.png').convert('RGBA')
full = Image.open(f'{BRAND}/logo-full.png').convert('RGBA')
WHITE = (255, 255, 255, 255)

def scaled(img, box_w, box_h):
    """Fit inside the box, Lanczos, with a touch of sharpening once enlarged —
    the mark comes from a 1376px JPEG, so anything past 1x is interpolation."""
    k = min(box_w / img.width, box_h / img.height)
    out = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    if k > 1.05:
        out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    return out

def centred(size, img, frac, bg=(0, 0, 0, 0), radius=0):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if bg[3]:
        plate = Image.new('RGBA', (size, size), bg)
        if radius:
            m = Image.new('L', (size, size), 0)
            ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
            plate.putalpha(m)
        canvas.alpha_composite(plate)
    s = scaled(img, size * frac, size * frac)
    canvas.alpha_composite(s, ((size - s.width) // 2, (size - s.height) // 2))
    return canvas

# ── phone app ───────────────────────────────────────────────────────────
# iOS / legacy launcher: may not be transparent, so the mark sits on white,
# the ground the logo was drawn on.
centred(1024, mark, 0.72, WHITE).convert('RGB').save(f'{APP}/icon.png')

# Adaptive icon. Launchers mask the 108dp canvas to whatever shape they like
# and only promise the central 66dp circle, so the mark is kept inside it:
# ~500px wide on 1024 keeps even the roof's corners clear of a round mask.
centred(1024, mark, 0.49).save(f'{APP}/android-icon-foreground.png')
Image.new('RGB', (1024, 1024), (255, 255, 255)).save(f'{APP}/android-icon-background.png')

# Themed icons (Android 13+) tint this one colour to the wallpaper. The mark is
# line art, which is exactly what reads well as a single-colour silhouette.
mono = centred(1024, mark, 0.49)
r, g, b, a = mono.split()
Image.merge('RGBA', (Image.new('L', mono.size, 0),) * 3 + (a,)).save(f'{APP}/android-icon-monochrome.png')

centred(48, mark, 0.92).save(f'{APP}/favicon.png')

# Splash: the whole logo, words included, padded square as the original was.
centred(640, full, 0.94).save(f'{APP}/logo.png')

# ── dashboard ───────────────────────────────────────────────────────────
# Tabs can be dark; thin blue strokes on transparent vanish there at 16px, so
# the small favicons carry their own white plate.
f16 = centred(16, mark, 0.94, WHITE, radius=3)
f32 = centred(32, mark, 0.88, WHITE, radius=6)
f48 = centred(48, mark, 0.88, WHITE, radius=9)
f16.save(f'{DASH}/favicon/favicon-16x16.png')
f32.save(f'{DASH}/favicon/favicon-32x32.png')
f48.save(f'{DASH}/favicon/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)],
         append_images=[f16, f32])
centred(180, mark, 0.76, WHITE).convert('RGB').save(f'{DASH}/favicon/apple-touch-icon.png')
centred(192, mark, 0.76, WHITE).save(f'{DASH}/favicon/android-chrome-192x192.png')
centred(512, mark, 0.76, WHITE).save(f'{DASH}/favicon/android-chrome-512x512.png')
centred(640, full, 0.94).save(f'{DASH}/logo.png')
print('icons written')
