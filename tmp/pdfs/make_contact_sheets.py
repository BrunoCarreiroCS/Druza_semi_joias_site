from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
rendered = ROOT / "tmp" / "pdfs" / "rendered"
pages = sorted(rendered.glob("page-*.png"), key=lambda p: int(p.stem.split("-")[-1]))
thumb_w = 240
gap = 18
label_h = 24
cols = 4
chunk = 16

for sheet_no, start in enumerate(range(0, len(pages), chunk), start=1):
    subset = pages[start:start + chunk]
    thumbs = []
    for p in subset:
        im = Image.open(p).convert("RGB")
        ratio = thumb_w / im.width
        th = int(im.height * ratio)
        thumbs.append((p, im.resize((thumb_w, th))))
    rows = (len(thumbs) + cols - 1) // cols
    cell_h = max(im.height for _, im in thumbs) + label_h
    sheet = Image.new("RGB", (cols * thumb_w + (cols + 1) * gap, rows * cell_h + (rows + 1) * gap), "#E9E4E5")
    draw = ImageDraw.Draw(sheet)
    for i, (p, im) in enumerate(thumbs):
        col = i % cols
        row = i // cols
        x = gap + col * (thumb_w + gap)
        y = gap + row * (cell_h + gap)
        sheet.paste(im, (x, y + label_h))
        draw.text((x, y + 3), f"Página {int(p.stem.split('-')[-1]):02d}", fill="#2B2B2D")
    sheet.save(rendered / f"contact-{sheet_no}.png", quality=92)
    print(rendered / f"contact-{sheet_no}.png")
