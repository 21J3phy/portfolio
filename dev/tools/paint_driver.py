# paint.py — turn Rocketbox Male_Adult_20's textures into Nirav's: brown skin, black hair, clean shaven, a black Purdue
# hoodie, lighter baggy-wash jeans, white Sambas with a gum sole. Works in the textures' own layout (2048 px).
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S = 2048 / 760          # the layout was read off a 760 px preview
def box(a, x0, y0, x1, y1): return a[int(y0 * S):int(y1 * S), int(x0 * S):int(x1 * S)]
lum = lambda a: a[..., 0] * 0.3 + a[..., 1] * 0.5 + a[..., 2] * 0.2

# ---------------- body
b = np.asarray(Image.open('body_src.png').convert('RGB')).astype(np.float32); src = b.copy()
# hoodie: every panel of it, to black with its folds kept
for (x0, y0, x1, y1) in [(245, 0, 528, 710), (0, 335, 246, 548), (527, 335, 760, 548)]:
    r = box(b, x0, y0, x1, y1); o = box(src, x0, y0, x1, y1); L = lum(o); m = (L < 215) & (L > 3)   # (the shoes that share a corner of the sheet are painted afterwards, from the original)
    g = np.clip(30 + (L - 60) * 0.8, 10, 110)
    for c, k in enumerate((1.0, 1.0, 1.04)): r[..., c] = np.where(m, g * k, r[..., c])
# jeans: a lighter, washed blue
for (x0, y0, x1, y1) in [(0, 15, 245, 338), (540, 15, 760, 338)]:
    r = box(b, x0, y0, x1, y1); L = lum(r); m = L > 3
    for c, (k, add) in enumerate(((1.25, 18), (1.5, 30), (1.95, 46))): r[..., c] = np.where(m, np.clip(L * k + add, 0, 255), r[..., c])
# the sleeves come down to the wrists (this figure's were pushed up): the forearms become cloth, with a ribbed cuff
for (x0, x1) in [(0, 232), (528, 760)]:
    r = box(b, x0, 540, x1, 664); o = box(src, x0, 540, x1, 664); L = lum(o); m = (o[..., 0] > o[..., 2] + 18) & (L > 60)
    rows = np.arange(r.shape[0])[:, None] / r.shape[0]; cols = np.arange(r.shape[1])[None, :]
    g = np.clip(32 + (L - 170) * 0.12 + np.where(rows > 0.86, 7 + 5 * np.sin(cols * 0.9), 0), 8, 90)
    for c, k in enumerate((1.0, 1.0, 1.04)): r[..., c] = np.where(m, g * k, r[..., c])
# hands: skin
r = b[int(664 * S):, :]; m = (r[..., 0] > r[..., 2] + 22) & (lum(r) > 105) & (r[..., 0] > 140)
for c, k in enumerate((0.64, 0.56, 0.50)): r[..., c] = np.where(m, r[..., c] * k, r[..., c])
# shoes: white leather where it was black, a gum sole where it was grey
for (x0, x1) in [(150, 325), (435, 610)]:
    r = box(b, x0, 532, x1, 760); o = box(src, x0, 532, x1, 760); L = lum(o); sat = o.max(-1) - o.min(-1); shoe = (sat < 22) & (np.abs(o[..., 0] - o[..., 2]) < 7) & (L > 12)   # (neutral greys only: the hoodie's own shadows are faintly brown)
    upper = shoe & (L < 95) & (L > 3); sole = shoe & (L >= 95)
    for c, k in enumerate((1.0, 0.98, 0.94)): r[..., c] = np.where(upper, np.clip(236 - (60 - L) * 0.7, 150, 250) * k, r[..., c])
    for c, k in enumerate((176, 132, 84)): r[..., c] = np.where(sole, np.clip(k * (0.55 + L / 255 * 0.6), 0, 255), r[..., c])
img = Image.fromarray(np.clip(b, 0, 255).astype(np.uint8))
# PURDUE across the chest, in old gold
d = ImageDraw.Draw(img)
font = None
for f in ['/System/Library/Fonts/Supplemental/Impact.ttf', '/System/Library/Fonts/Supplemental/Arial Black.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf']:
    try: font = ImageFont.truetype(f, int(41 * S)); break
    except Exception: pass
import sys
cx, cy = float(sys.argv[1]) if len(sys.argv) > 1 else 385, float(sys.argv[2]) if len(sys.argv) > 2 else 392
txt = Image.new('L', (int(190 * S), int(60 * S)), 0); td = ImageDraw.Draw(txt); w = td.textlength('PURDUE', font=font); td.text(((txt.width - w) / 2, 2 * S), 'PURDUE', fill=255, font=font)
if len(sys.argv) > 3 and sys.argv[3] == 'flip': txt = txt.transpose(Image.FLIP_LEFT_RIGHT)
gold = Image.new('RGB', txt.size, (206, 184, 136)); img.paste(gold, (int(cx * S - txt.width / 2), int(cy * S - txt.height / 2)), txt)
# the three stripes down each side of each shoe (the upper is laid out as an upside-down V: toe at the top, laces down
# the middle, a side panel running out and down either way), in the sheet's 1024 px terms
for mirror in (False, True):
    for side in (-1, 1):
        for k in range(3):
            x0, y0 = 305 + side * (21 + 5 * k), 927 + 17 * k; x1, y1 = x0 + side * 27, y0 + 15
            if mirror: x0, x1 = 1024 - x0, 1024 - x1
            d.line([(x0 * 2, y0 * 2), (x1 * 2, y1 * 2)], fill=(24, 24, 26), width=13)
img.resize((1024, 1024), Image.LANCZOS).save('body.png')

# ---------------- head
h = np.asarray(Image.open('head_src.png').convert('RGB')).astype(np.float32)
top = h[:int(560 * S)]; L = lum(top); skin = (top[..., 0] > top[..., 2] + 18) & (L > 92)
hair = (L <= 92) & (L > 3)
for c, k in enumerate((0.66, 0.57, 0.50)): top[..., c] = np.where(skin, top[..., c] * k, top[..., c])
g = np.clip(L * 0.42, 0, 60)
for c, k in enumerate((1.0, 0.95, 0.92)): top[..., c] = np.where(hair, g * k, top[..., c])
him = Image.fromarray(np.clip(h, 0, 255).astype(np.uint8))
# clean shaven: smooth the jaw, cheeks and upper lip, leaving the lips, nose and eyes alone
soft = him.filter(ImageFilter.GaussianBlur(9)); mask = Image.new('L', him.size, 0); md = ImageDraw.Draw(mask)
md.ellipse([int(268 * S), int(238 * S), int(500 * S), int(420 * S)], fill=255)
md.rectangle([int(345 * S), int(292 * S), int(425 * S), int(322 * S)], fill=0)       # lips
md.ellipse([int(352 * S), int(200 * S), int(418 * S), int(282 * S)], fill=0)         # nose
md.rectangle([int(300 * S), int(150 * S), int(470 * S), int(238 * S)], fill=0)       # eyes and brows
him.paste(soft, (0, 0), mask.filter(ImageFilter.GaussianBlur(14)))
# and the shadow of a beard under the chin goes
soft2 = him.filter(ImageFilter.GaussianBlur(34)); m2 = Image.new('L', him.size, 0); ImageDraw.Draw(m2).ellipse([int(318 * S), int(342 * S), int(452 * S), int(412 * S)], fill=255)
him.paste(soft2, (0, 0), m2.filter(ImageFilter.GaussianBlur(22)))
# brown eyes
a = np.asarray(him).astype(np.float32); yy, xx = np.mgrid[0:2048, 0:2048]; iris = ((xx - 200 * S) ** 2 + (yy - 712 * S) ** 2) < (13 * S) ** 2
for c, k in enumerate((0.42, 0.27, 0.16)): a[..., c] = np.where(iris, a[..., c] * k, a[..., c])
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS).save('head.png')
print('painted')
