#!/usr/bin/env python3
"""Gera os ícones da PWA 'Gestão de Refrescos' — garrafa branca sobre gradiente laranja."""
from PIL import Image, ImageDraw

OUT = "/home/z/my-project/public/"
S = 1024  # tamanho de desenho

# Gradiente vertical laranja: topo claro -> fundo escuro
TOP = (253, 146, 60)     # laranja claro
BOT = (194, 65, 12)      # laranja escuro


def gradient(size):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        r = int(TOP[0] + (BOT[0] - TOP[0]) * t)
        g = int(TOP[1] + (BOT[1] - TOP[1]) * t)
        b = int(TOP[2] + (BOT[2] - TOP[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b))
    return img


def draw_bottle(img, scale=1.0):
    """Desenha garrafa branca com tampa verde e bolhas (base 1024)."""
    cx = S / 2
    cy = S / 2
    green = (34, 158, 74)
    white = (255, 255, 255)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    bubbles = [
        (0.74, 0.22, 46), (0.82, 0.33, 26), (0.67, 0.37, 18),
        (0.22, 0.28, 20), (0.28, 0.40, 12),
    ]
    for bx, by, br in bubbles:
        x, y = S * bx, S * by
        od.ellipse([x - br, y - br, x + br, y + br], fill=(255, 255, 255, 140))
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))

    d = ImageDraw.Draw(img)
    W = S * scale
    cxc = S / 2 + (S - W) / 2 * 0
    cxc = S / 2
    cyc = S / 2

    def rr(box, rad, fill):
        d.rounded_rectangle(box, radius=rad, fill=fill)

    cap_w = 150 * scale
    cap_h = 70 * scale
    neck_w = 120 * scale
    neck_h = 110 * scale
    body_w = 420 * scale
    body_h = 520 * scale
    body_r = 90 * scale

    top = cyc - (cap_h + neck_h + body_h) / 2

    rr([cxc - cap_w / 2, top, cxc + cap_w / 2, top + cap_h], 18 * scale, green)
    neck_top = top + cap_h - 8 * scale
    rr([cxc - neck_w / 2, neck_top, cxc + neck_w / 2, neck_top + neck_h], 26 * scale, white)
    body_top = neck_top + neck_h - 6 * scale
    rr([cxc - body_w / 2, body_top, cxc + body_w / 2, body_top + body_h], body_r, white)

    label_h = 92 * scale
    ly = body_top + body_h * 0.38
    d.rounded_rectangle(
        [cxc - body_w / 2 + 50 * scale, ly, cxc + body_w / 2 - 50 * scale, ly + label_h],
        radius=46 * scale,
        fill=(234, 88, 12),
    )
    d.rounded_rectangle(
        [cxc - body_w / 2 + 110 * scale, ly + 34 * scale, cxc + 20 * scale, ly + 58 * scale],
        radius=12 * scale,
        fill=(255, 255, 255),
    )


def rounded_mask(img, radius):
    mask = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, img.size[0], img.size[1]], radius=radius, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


base = gradient(S)
draw_bottle(base, scale=1.0)
rounded = rounded_mask(base, 190)
rounded.resize((512, 512), Image.LANCZOS).save(OUT + "icon-512.png")
rounded.resize((192, 192), Image.LANCZOS).save(OUT + "icon-192.png")

maskable = gradient(S)
draw_bottle(maskable, scale=0.72)
maskable.resize((512, 512), Image.LANCZOS).convert("RGB").save(OUT + "icon-maskable-512.png")

apple = gradient(S)
draw_bottle(apple, scale=0.80)
apple.resize((180, 180), Image.LANCZOS).convert("RGB").save(OUT + "apple-touch-icon.png")

print("Ícones gerados em", OUT)
