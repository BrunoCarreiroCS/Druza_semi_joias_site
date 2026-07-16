from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from master_guide_content import PAGES, SOURCES


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "druza-developer-master-guide.pdf"
AUDIT = json.loads((ROOT / "tmp" / "pdfs" / "audit-site.json").read_text(encoding="utf-8"))
W, H = A4

INK = HexColor("#2B2B2D")
TEXT = HexColor("#4C4849")
MUTED = HexColor("#6B6669")
WHITE = HexColor("#FFFFFF")
WARM = HexColor("#FDF8F8")
BLUSH = HexColor("#FBF0F1")
ROSE_INST = HexColor("#F4E3E5")
ROSE = HexColor("#C98B90")
ROSE_STRONG = HexColor("#B97981")
ROSE_DEEP = HexColor("#5C3A3F")
EMERALD = HexColor("#1C6B5B")
PARAIBA = HexColor("#5FB7A8")
SILVER = HexColor("#C5CAD0")
LINE = HexColor("#E9E4E5")
AMBER = HexColor("#B7791F")
RED = HexColor("#A53D4A")


def register_fonts() -> None:
    font_dir = ROOT / "tmp" / "pdfs"
    # TTFs oficiais do repositório Google Fonts. Os WOFF2 locais são ideais
    # para o navegador, mas a conversão para TTF perdeu o cmap no ReportLab.
    pdfmetrics.registerFont(TTFont("Jost", str(font_dir / "Jost-Official.ttf")))
    pdfmetrics.registerFont(TTFont("Jost-Medium", str(font_dir / "Jost-Official.ttf")))
    pdfmetrics.registerFont(TTFont("Cormorant", str(font_dir / "Cormorant-Official.ttf")))
    pdfmetrics.registerFont(TTFont("Cormorant-Semibold", str(font_dir / "Cormorant-Official.ttf")))
    pdfmetrics.registerFont(TTFont("Cormorant-Italic", str(font_dir / "Cormorant-Italic-Official.ttf")))


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    text = str(text).replace("\u2011", "-").replace("\u2013", "-").replace("\u2014", "-")
    lines: list[str] = []
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        words = paragraph.split()
        current = ""
        for word in words:
            candidate = word if not current else current + " " + word
            if pdfmetrics.stringWidth(candidate, font, size) <= width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def draw_lines(c: canvas.Canvas, text: str, x: float, y: float, width: float,
               font: str = "Jost", size: float = 9.3, leading: float = 13.3,
               color=TEXT, max_lines: int | None = None) -> float:
    c.setFillColor(color)
    c.setFont(font, size)
    lines = wrap(text, font, size, width)
    if max_lines is not None:
        lines = lines[:max_lines]
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def section_label(c: canvas.Canvas, text: str, x: float, y: float, color=ROSE_STRONG) -> None:
    c.setFillColor(color)
    c.setFont("Jost-Medium", 7.1)
    c.drawString(x, y, text.upper())


def title(c: canvas.Canvas, text: str, x: float, y: float, width: float,
          size: float = 30, color=INK) -> float:
    c.setFillColor(color)
    c.setFont("Cormorant-Semibold", size)
    lines = wrap(text, "Cormorant-Semibold", size, width)
    for line in lines[:3]:
        c.drawString(x, y, line)
        y -= size * 0.92
    return y


def page_header(c: canvas.Canvas, page_no: int, section: str) -> None:
    c.setFillColor(WARM)
    c.rect(0, H - 26, W, 26, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont("Jost-Medium", 6.8)
    c.drawString(38, H - 17, "DRUZA - DEVELOPER MASTER GUIDE")
    c.drawRightString(W - 38, H - 17, section.upper())
    c.setStrokeColor(LINE)
    c.line(38, 34, W - 38, 34)
    c.setFont("Jost", 7)
    c.setFillColor(MUTED)
    c.drawString(38, 20, "Uso interno - versão 1.0 - julho de 2026")
    c.drawRightString(W - 38, 20, f"{page_no:02d}")


def status_pill(c: canvas.Canvas, text: str, x: float, y: float, fill, width: float | None = None) -> float:
    pad = 7
    c.setFont("Jost-Medium", 6.6)
    tw = pdfmetrics.stringWidth(text.upper(), "Jost-Medium", 6.6)
    w = width or tw + pad * 2
    c.setFillColor(fill)
    c.roundRect(x, y - 8, w, 16, 8, fill=1, stroke=0)
    c.setFillColor(WHITE if fill in (ROSE_DEEP, EMERALD, RED) else INK)
    c.drawCentredString(x + w / 2, y - 2.2, text.upper())
    return x + w + 5


def draw_block(c: canvas.Canvas, x: float, y: float, w: float, heading: str,
               body: str | list[str], accent=ROSE, numbered: str | None = None) -> float:
    c.setStrokeColor(LINE)
    c.setFillColor(WHITE)
    c.roundRect(x, y - 120, w, 112, 8, fill=1, stroke=1)
    c.setFillColor(accent)
    c.rect(x, y - 120, 4, 112, fill=1, stroke=0)
    if numbered:
        c.setFillColor(accent)
        c.setFont("Cormorant-Semibold", 19)
        c.drawString(x + 14, y - 30, numbered)
        hx = x + 49
    else:
        hx = x + 15
    c.setFillColor(INK)
    c.setFont("Jost-Medium", 8.8)
    c.drawString(hx, y - 27, heading)
    yy = y - 46
    if isinstance(body, list):
        items = body[:9]
        compact = len(items) > 5
        entries = [wrap(item, "Jost", 7.8, w - 40)[:1 if compact else 2] for item in items]
        gap = 1.0 if compact else 2.5
        total_lines = max(1, sum(len(lines) for lines in entries))
        leading = min(10.5, (70 - gap * max(0, len(entries) - 1)) / total_lines)
        item_size = min(7.8, max(6.2, leading - 0.7))
        cursor = y - 40
        for lines in entries:
            c.setFillColor(accent)
            c.circle(x + 18, cursor + 2.4, 1.6, fill=1, stroke=0)
            c.setFillColor(TEXT)
            c.setFont("Jost", item_size)
            for line in lines:
                c.drawString(x + 26, cursor, line)
                cursor -= leading
            cursor -= gap
    else:
        draw_lines(c, body, x + 15, yy, w - 30, size=8, leading=11.4, max_lines=6)
    return y - 128


def draw_body_page(c: canvas.Canvas, p: dict, page_no: int) -> None:
    page_header(c, page_no, p.get("section", "Guia"))
    section_label(c, p.get("kicker", p.get("section", "")), 46, H - 62)
    yy = title(c, p["title"], 46, H - 91, W - 92, size=p.get("title_size", 30))
    if p.get("subtitle"):
        yy = draw_lines(c, p["subtitle"], 46, yy - 4, W - 92, size=9.2, leading=13.2, color=MUTED, max_lines=3)
    yy -= 14
    columns = p.get("columns", [])
    if len(columns) <= 2:
        col_w = (W - 104) / 2
        for idx, blocks in enumerate(columns):
            x = 46 + idx * (col_w + 12)
            cy = yy
            for b in blocks:
                if b.get("type") == "quote":
                    c.setFillColor(BLUSH)
                    c.roundRect(x, cy - 92, col_w, 84, 8, fill=1, stroke=0)
                    c.setFillColor(ROSE_DEEP)
                    c.setFont("Cormorant-Italic", 16)
                    qlines = wrap(b["text"], "Cormorant-Italic", 16, col_w - 28)
                    qy = cy - 33
                    for line in qlines[:4]:
                        c.drawString(x + 14, qy, line)
                        qy -= 17
                    cy -= 100
                elif b.get("type") == "metric":
                    c.setFillColor(p.get("accent", ROSE_DEEP))
                    c.roundRect(x, cy - 83, col_w, 75, 8, fill=1, stroke=0)
                    c.setFillColor(WHITE)
                    c.setFont("Cormorant-Semibold", 31)
                    c.drawString(x + 15, cy - 42, b["value"])
                    c.setFont("Jost", 7.8)
                    c.drawString(x + 15, cy - 61, b["label"])
                    cy -= 91
                else:
                    cy = draw_block(c, x, cy, col_w, b["heading"], b["body"], b.get("accent", p.get("accent", ROSE)))
    else:
        col_w = (W - 116) / 3
        for idx, blocks in enumerate(columns[:3]):
            x = 46 + idx * (col_w + 12)
            cy = yy
            for b in blocks:
                cy = draw_block(c, x, cy, col_w, b["heading"], b["body"], b.get("accent", ROSE))
    if p.get("decision"):
        c.setFillColor(ROSE_DEEP)
        c.roundRect(46, 51, W - 92, 44, 8, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Jost-Medium", 7)
        c.drawString(58, 78, "DECISÃO QUE ESTA PÁGINA ORIENTA")
        draw_lines(c, p["decision"], 58, 65, W - 116, size=7.7, leading=10, color=WHITE, max_lines=2)


def draw_cover(c: canvas.Canvas, p: dict) -> None:
    c.setFillColor(ROSE_DEEP)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(Color(1, 1, 1, alpha=0.045))
    for r, x, y in [(170, 485, 705), (100, 95, 160), (54, 460, 120)]:
        c.circle(x, y, r, fill=1, stroke=0)
    logo = ROOT / "img" / "druza logo.png"
    c.setFillColor(ROSE)
    c.roundRect(42, H - 179, 120, 86, 5, fill=1, stroke=0)
    c.drawImage(ImageReader(str(logo)), 46, H - 175, width=112, height=78, preserveAspectRatio=True, mask=None)
    section_label(c, "DRUZA SEMI JOIAS - DOCUMENTO INTERNO", 48, H - 218, ROSE_INST)
    y = title(c, "Developer", 48, H - 270, W - 96, 51, WHITE)
    c.setFillColor(ROSE_INST)
    c.setFont("Cormorant-Italic", 51)
    c.drawString(48, y - 5, "Master Guide")
    draw_lines(c, "Marca, produto, tecnologia e crescimento.", 49, y - 58, 410,
               size=11, leading=16, color=ROSE_INST)
    c.setStrokeColor(ROSE)
    c.setLineWidth(1.5)
    c.line(48, 208, 165, 208)
    c.setFillColor(WHITE)
    c.setFont("Jost-Medium", 8)
    c.drawString(48, 186, "VERSÃO 1.0")
    c.setFont("Jost", 8)
    c.drawString(48, 168, "Julho de 2026")
    c.drawString(48, 150, "Uso interno - dev principal, equipe e fornecedores")
    c.setFillColor(ROSE)
    c.circle(W - 94, 97, 45, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Cormorant-Semibold", 25)
    c.drawCentredString(W - 94, 88, "D")


def fit_image(path: Path, box_w: float, box_h: float) -> tuple[float, float]:
    with Image.open(path) as im:
        iw, ih = im.size
    scale = min(box_w / iw, box_h / ih)
    return iw * scale, ih * scale


def draw_screenshot_page(c: canvas.Canvas, p: dict, page_no: int) -> None:
    page_header(c, page_no, p["section"])
    section_label(c, p.get("kicker", "EVIDÊNCIA VISUAL"), 46, H - 61)
    y = title(c, p["title"], 46, H - 90, W - 92, 29)
    if p.get("subtitle"):
        y = draw_lines(c, p["subtitle"], 46, y - 4, W - 92, size=8.8, leading=12.5, color=MUTED, max_lines=2)
    img_path = ROOT / p["image"]
    box_x, box_y, box_w, box_h = 46, 300, 503, min(350, y - 320)
    c.setFillColor(WARM)
    c.roundRect(box_x, box_y, box_w, box_h, 8, fill=1, stroke=0)
    iw, ih = fit_image(img_path, box_w - 12, box_h - 12)
    c.drawImage(ImageReader(str(img_path)), box_x + (box_w - iw) / 2, box_y + (box_h - ih) / 2,
                width=iw, height=ih, preserveAspectRatio=True, mask="auto")
    findings = p.get("findings", [])
    col_w = (W - 104) / 2
    for idx, f in enumerate(findings[:4]):
        x = 46 + (idx % 2) * (col_w + 12)
        row = idx // 2
        fy = 273 - row * 91
        color = {"P1": RED, "P2": AMBER, "P3": ROSE_STRONG, "FORTE": EMERALD}.get(f["level"], ROSE)
        status_pill(c, f["level"], x, fy + 5, color, 34)
        c.setFillColor(INK)
        c.setFont("Jost-Medium", 8)
        c.drawString(x + 42, fy + 1, f["title"])
        draw_lines(c, f["text"], x, fy - 15, col_w, size=7.5, leading=10.5, color=TEXT, max_lines=4)


def draw_score_page(c: canvas.Canvas, p: dict, page_no: int) -> None:
    page_header(c, page_no, p["section"])
    section_label(c, p.get("kicker", "DIAGNÓSTICO"), 46, H - 61)
    title(c, p["title"], 46, H - 90, W - 92, 31)
    c.setFillColor(ROSE_DEEP)
    c.roundRect(46, 590, 176, 114, 10, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Cormorant-Semibold", 45)
    c.drawString(62, 642, p["score"])
    draw_lines(c, p["rating"], 63, 618, 143, font="Jost-Medium", size=7.2,
               leading=9.2, color=WHITE, max_lines=2)
    c.setFont("Jost", 6.7)
    c.drawString(63, 596, "Diagnóstico qualitativo")
    rows = p["rows"]
    x0, y0, rw = 248, 697, 301
    for idx, row in enumerate(rows):
        y = y0 - idx * 39
        c.setFillColor(INK)
        c.setFont("Jost-Medium", 8)
        c.drawString(x0, y, row[0])
        c.setFillColor(LINE)
        c.roundRect(x0, y - 17, rw - 48, 7, 3.5, fill=1, stroke=0)
        c.setFillColor(row[3])
        c.roundRect(x0, y - 17, (rw - 48) * row[1] / row[2], 7, 3.5, fill=1, stroke=0)
        c.setFillColor(MUTED)
        c.setFont("Jost", 7)
        c.drawRightString(x0 + rw, y - 17, f"{row[1]}/{row[2]}")
    chart_bottom = y0 - (len(rows) - 1) * 39 - 24
    first_row_y = min(545, chart_bottom - 18)
    second_row_y = first_row_y - 128
    for idx, block in enumerate(p["blocks"]):
        bw = (W - 104) / 2
        x = 46 + (idx % 2) * (bw + 12)
        by = first_row_y if idx < 2 else second_row_y
        draw_block(c, x, by, bw, block["heading"], block["body"], block.get("accent", ROSE))


def draw_flow_page(c: canvas.Canvas, p: dict, page_no: int) -> None:
    page_header(c, page_no, p["section"])
    section_label(c, p.get("kicker", "FLUXO"), 46, H - 61)
    y = title(c, p["title"], 46, H - 90, W - 92, 30)
    if p.get("subtitle"):
        draw_lines(c, p["subtitle"], 46, y - 5, W - 92, size=8.8, leading=12, color=MUTED, max_lines=2)
    steps = p["steps"]
    top = min(650, y - 37)
    usable = top - 170
    gap = usable / max(1, len(steps) - 1)
    center_x = 205
    for idx, s in enumerate(steps):
        sy = top - idx * gap
        c.setFillColor(s.get("color", WARM))
        c.setStrokeColor(s.get("stroke", LINE))
        c.roundRect(66, sy - 32, 278, 52, 8, fill=1, stroke=1)
        c.setFillColor(s.get("accent", ROSE))
        c.circle(86, sy - 6, 10, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Jost-Medium", 7)
        c.drawCentredString(86, sy - 8.5, str(idx + 1).zfill(2))
        c.setFillColor(INK)
        c.setFont("Jost-Medium", 8.3)
        c.drawString(105, sy + 2, s["title"])
        draw_lines(c, s["text"], 105, sy - 13, 222, size=7.2, leading=9.5, color=MUTED, max_lines=2)
        if idx < len(steps) - 1:
            c.setStrokeColor(ROSE)
            c.line(center_x, sy - 33, center_x, sy - gap + 21)
            c.line(center_x, sy - gap + 21, center_x - 4, sy - gap + 27)
            c.line(center_x, sy - gap + 21, center_x + 4, sy - gap + 27)
    note_x = 370
    ny = top
    for note in p.get("notes", []):
        ny = draw_block(c, note_x, ny, 179, note["heading"], note["body"], note.get("accent", EMERALD))


def draw_wireframe_page(c: canvas.Canvas, p: dict, page_no: int) -> None:
    page_header(c, page_no, p["section"])
    section_label(c, "WIREFRAME CONCEITUAL", 46, H - 61)
    y = title(c, p["title"], 46, H - 90, W - 92, 29)
    draw_lines(c, p["subtitle"], 46, y - 4, W - 92, size=8.7, leading=12, color=MUTED, max_lines=2)
    device = p.get("device", "desktop")
    if device == "mobile":
        fx, fy, fw, fh = 65, 185, 205, 460
    else:
        fx, fy, fw, fh = 46, 225, 330, 410
    c.setFillColor(INK)
    c.roundRect(fx, fy, fw, fh, 13, fill=1, stroke=0)
    pad = 7
    c.setFillColor(WHITE)
    c.roundRect(fx + pad, fy + pad, fw - 2 * pad, fh - 2 * pad, 8, fill=1, stroke=0)
    iy = fy + fh - 29
    c.setFillColor(ROSE_INST)
    c.rect(fx + pad, iy, fw - 2 * pad, 16, fill=1, stroke=0)
    c.setFillColor(ROSE_DEEP)
    c.setFont("Jost-Medium", 6.4)
    c.drawString(fx + 15, iy + 5, "DRUZA")
    remaining = fh - 58
    units = sum(max(1, s.get("weight", 1)) for s in p["sections"])
    cursor = iy - 5
    for idx, s in enumerate(p["sections"]):
        sh = remaining * max(1, s.get("weight", 1)) / units - 5
        fill = [WARM, BLUSH, ROSE_INST, WHITE][idx % 4]
        c.setFillColor(fill)
        c.setStrokeColor(LINE)
        c.roundRect(fx + 14, cursor - sh, fw - 28, sh, 4, fill=1, stroke=1)
        c.setFillColor(s.get("accent", ROSE_DEEP))
        c.setFont("Jost-Medium", 6.8)
        c.drawString(fx + 22, cursor - 15, s["label"])
        if s.get("lines"):
            c.setStrokeColor(SILVER)
            for line_i in range(min(3, s["lines"])):
                ly = cursor - 27 - line_i * 8
                c.line(fx + 22, ly, fx + fw - 35 - line_i * 14, ly)
        cursor -= sh + 5
    notes_x = 300 if device == "mobile" else 398
    notes_w = W - notes_x - 46
    ny = 640
    for idx, note in enumerate(p["notes"][:4]):
        c.setFillColor(ROSE if idx == 0 else PARAIBA if idx == 1 else SILVER)
        c.circle(notes_x, ny + 4, 4, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Jost-Medium", 8.1)
        c.drawString(notes_x + 12, ny, note["title"])
        ny = draw_lines(c, note["text"], notes_x + 12, ny - 15, notes_w - 12, size=7.5, leading=10.5, color=MUTED, max_lines=4) - 18
    c.setFillColor(ROSE_DEEP)
    c.roundRect(notes_x, 194, notes_w, 74, 8, fill=1, stroke=0)
    section_label(c, "HIPÓTESE A VALIDAR", notes_x + 12, 250, ROSE_INST)
    draw_lines(c, p["hypothesis"], notes_x + 12, 231, notes_w - 24, size=7.6, leading=10.5, color=WHITE, max_lines=4)


def draw_matrix_page(c: canvas.Canvas, p: dict, page_no: int) -> None:
    page_header(c, page_no, p["section"])
    section_label(c, p.get("kicker", "PRIORIZAÇÃO"), 46, H - 61)
    y = title(c, p["title"], 46, H - 90, W - 92, 30)
    draw_lines(c, p["subtitle"], 46, y - 4, W - 92, size=8.8, leading=12, color=MUTED, max_lines=2)
    x0, y0, mw, mh = 68, 185, 455, 420
    c.setFillColor(WARM)
    c.rect(x0, y0, mw, mh, fill=1, stroke=0)
    c.setStrokeColor(SILVER)
    c.line(x0 + mw / 2, y0, x0 + mw / 2, y0 + mh)
    c.line(x0, y0 + mh / 2, x0 + mw, y0 + mh / 2)
    c.setFont("Jost-Medium", 7)
    c.setFillColor(MUTED)
    c.drawString(x0, y0 - 17, "MENOR ESFORÇO")
    c.drawRightString(x0 + mw, y0 - 17, "MAIOR ESFORÇO")
    c.saveState()
    c.translate(x0 - 19, y0)
    c.rotate(90)
    c.drawString(0, 0, "MENOR IMPACTO")
    c.drawRightString(mh, 0, "MAIOR IMPACTO")
    c.restoreState()
    for item in p["items"]:
        px = x0 + 18 + (mw - 36) * item["effort"]
        py = y0 + 18 + (mh - 36) * item["impact"]
        col = {"P1": RED, "P2": AMBER, "P3": ROSE, "IDEIA": PARAIBA}.get(item["level"], ROSE)
        c.setFillColor(col)
        c.circle(px, py, 11, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Jost-Medium", 6.5)
        c.drawCentredString(px, py - 2.4, item["id"])
        c.setFillColor(INK)
        c.setFont("Jost", 6.3)
        c.drawString(px + 14, py - 2, item["label"][:34])


def draw_timeline_page(c: canvas.Canvas, p: dict, page_no: int) -> None:
    page_header(c, page_no, p["section"])
    section_label(c, p.get("kicker", "ROADMAP"), 46, H - 61)
    y = title(c, p["title"], 46, H - 90, W - 92, 31)
    draw_lines(c, p["subtitle"], 46, y - 4, W - 92, size=8.8, leading=12, color=MUTED, max_lines=2)
    xline = 88
    c.setStrokeColor(ROSE)
    c.setLineWidth(2)
    c.line(xline, 164, xline, 625)
    ty = 610
    for idx, item in enumerate(p["items"]):
        c.setFillColor(item.get("color", ROSE))
        c.circle(xline, ty, 10, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Jost-Medium", 6.5)
        c.drawCentredString(xline, ty - 2.4, str(idx + 1).zfill(2))
        c.setFillColor(INK)
        c.setFont("Jost-Medium", 9)
        c.drawString(112, ty + 4, item["title"])
        yy = draw_lines(c, item["text"], 112, ty - 13, 405, size=7.6, leading=10.5, color=MUTED, max_lines=3)
        if item.get("meta"):
            c.setFillColor(BLUSH)
            c.roundRect(112, yy - 14, 405, 16, 7, fill=1, stroke=0)
            c.setFillColor(ROSE_DEEP)
            c.setFont("Jost", 6.6)
            c.drawString(120, yy - 9, item["meta"])
        ty -= p.get("step_gap", 88)


def draw_sources_page(c: canvas.Canvas, p: dict, page_no: int) -> None:
    page_header(c, page_no, p["section"])
    section_label(c, "FONTES E FECHAMENTO", 46, H - 61)
    y = title(c, p["title"], 46, H - 90, W - 92, 30)
    draw_lines(c, p["subtitle"], 46, y - 4, W - 92, size=8.6, leading=12, color=MUTED, max_lines=3)
    sy = y - 30
    for idx, source in enumerate(SOURCES):
        col = idx % 2
        row = idx // 2
        x = 46 + col * 258
        yy = sy - row * 61
        c.setFillColor(ROSE)
        c.circle(x + 4, yy + 3, 3, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Jost-Medium", 7.2)
        c.drawString(x + 13, yy, source["name"])
        display_url = source["url"].removeprefix("https://").removeprefix("http://")
        if len(display_url) > 48:
            display_url = f"{display_url[:45]}..."
        c.setFillColor(MUTED)
        c.setFont("Jost", 5.9)
        c.drawString(x + 13, yy - 11, display_url)
        c.linkURL(source["url"], (x + 10, yy - 27, x + 248, yy + 9), relative=0)
    c.setFillColor(ROSE_DEEP)
    c.roundRect(46, 58, W - 92, 96, 10, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Cormorant-Italic", 20)
    c.drawString(62, 121, "Desejo com disciplina comercial.")
    draw_lines(c, p["closing"], 62, 98, W - 124, size=8.2, leading=12, color=ROSE_INST, max_lines=4)


def render() -> None:
    register_fonts()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1)
    c.setTitle("Druza Developer Master Guide")
    c.setAuthor("Druza Semi Joias")
    c.setSubject("Marca, produto, arquitetura, UX, UI, operacao e roadmap")
    c.setKeywords("Druza, brand guide, arquitetura, UX, UI, e-commerce, roadmap")
    for page_no, p in enumerate(PAGES, start=1):
        kind = p.get("kind", "body")
        if kind == "cover":
            draw_cover(c, p)
        elif kind == "score":
            draw_score_page(c, p, page_no)
        elif kind == "screenshot":
            draw_screenshot_page(c, p, page_no)
        elif kind == "flow":
            draw_flow_page(c, p, page_no)
        elif kind == "wireframe":
            draw_wireframe_page(c, p, page_no)
        elif kind == "matrix":
            draw_matrix_page(c, p, page_no)
        elif kind == "timeline":
            draw_timeline_page(c, p, page_no)
        elif kind == "sources":
            draw_sources_page(c, p, page_no)
        else:
            draw_body_page(c, p, page_no)
        c.showPage()
    c.save()
    print(f"PDF: {OUT}")
    print(f"PAGES: {len(PAGES)}")
    print(f"BYTES: {OUT.stat().st_size}")


if __name__ == "__main__":
    render()
