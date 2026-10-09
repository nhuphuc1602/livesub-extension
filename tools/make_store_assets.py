"""Store assets that use no third-party footage: a drawn sunset scene (store/demo/scene.png and, with ffmpeg, a
30 s store/demo/demo.mp4 for the screenshot page) and the 440x280 promo tile (store/promo-440x280.png).

    pip install pillow
    python tools/make_store_assets.py
"""
import math
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "store" / "demo"


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def sky(w, h):
    stops = [(0.0, (20, 30, 70)), (0.35, (110, 50, 140)), (0.62, (240, 120, 60)), (0.78, (255, 200, 90)),
             (1.0, (255, 225, 140))]
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                d.line([(0, y), (w, y)], fill=lerp(c0, c1, (t - t0) / (t1 - t0)))
                break
    return img


def scene(w=1280, h=720):
    img = sky(w, h)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    cx, cy, r = int(w * 0.62), int(h * 0.70), int(h * 0.11)
    for k in range(18, 0, -1):                        # halo
        a = int(10 + 6 * (18 - k))
        g.ellipse([cx - r - 8 * k, cy - r - 8 * k, cx + r + 8 * k, cy + r + 8 * k], fill=(255, 210, 120, min(a, 60)))
    g.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 236, 170, 255))
    img = Image.alpha_composite(img.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(6)))
    d = ImageDraw.Draw(img)
    for layer, (base, amp, col) in enumerate(((0.80, 0.05, (60, 30, 70)), (0.86, 0.04, (35, 20, 45)),
                                               (0.92, 0.03, (18, 12, 28)))):
        pts = [(0, h)]
        for x in range(0, w + 8, 8):
            y = h * base - amp * h * (math.sin(x / (90 + 40 * layer)) + 0.6 * math.sin(x / (37 + 11 * layer) + layer))
            pts.append((x, y))
        pts.append((w, h))
        d.polygon(pts, fill=col)
    return img.convert("RGB")


def promo():
    w, h = 440, 280
    img = scene(w, h)
    shade = Image.new("RGBA", (w, h), (8, 8, 14, 110))
    img = Image.alpha_composite(img.convert("RGBA"), shade)
    icon = Image.open(ROOT / "icons" / "128.png").convert("RGBA").resize((88, 88), Image.LANCZOS)
    img.alpha_composite(icon, (28, 40))
    d = ImageDraw.Draw(img)
    font_dir = Path("C:/Windows/Fonts")
    bold = ImageFont.truetype(str(font_dir / "segoeuib.ttf"), 34) if (font_dir / "segoeuib.ttf").exists() else ImageFont.load_default()
    reg = ImageFont.truetype(str(font_dir / "segoeui.ttf"), 19) if (font_dir / "segoeui.ttf").exists() else ImageFont.load_default()
    d.text((132, 46), "livesub", font=bold, fill=(255, 255, 255))
    d.text((132, 92), "Phụ đề tiếng Việt cho YouTube", font=reg, fill=(255, 228, 92))
    box = (28, 170, w - 28, 240)
    d.rounded_rectangle(box, radius=10, fill=(8, 8, 12, 190))
    d.text((44, 180), "Chào các bạn, hôm nay mình sẽ giải thích", font=reg, fill=(255, 255, 255))
    d.text((44, 206), "vì sao bầu trời có màu cam khi hoàng hôn.", font=reg, fill=(255, 255, 255))
    out = ROOT / "store" / "promo-440x280.png"
    img.convert("RGB").save(out, optimize=True)
    return out


if __name__ == "__main__":
    DEMO.mkdir(parents=True, exist_ok=True)
    scene().save(DEMO / "scene.png", optimize=True)
    print("wrote", DEMO / "scene.png", promo())
    if shutil.which("ffmpeg"):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", str(DEMO / "scene.png"), "-t", "30", "-r", "24",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-tune", "stillimage", str(DEMO / "demo.mp4")], check=True)
        print("wrote", DEMO / "demo.mp4")
