from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from lxml import html


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_HTML = sorted(
    [p for p in ROOT.glob("*.html")]
    + [p for p in (ROOT / "produtos").glob("*.html")]
)


def text_content(node) -> str:
    return " ".join(" ".join(node.itertext()).split())


def local_target_exists(page: Path, href: str) -> bool:
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return True
    parts = urlsplit(href)
    if parts.scheme or parts.netloc:
        return True
    target = (page.parent / parts.path).resolve()
    try:
        target.relative_to(ROOT.resolve())
    except ValueError:
        return False
    if parts.path.endswith("/"):
        target = target / "index.html"
    return target.exists()


def audit_page(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    doc = html.fromstring(raw)
    title = doc.xpath("string(//title)").strip()
    desc = doc.xpath("string(//meta[@name='description']/@content)").strip()
    headings = []
    for node in doc.xpath("//h1|//h2|//h3|//h4|//h5|//h6"):
        headings.append({"level": int(node.tag[1]), "text": text_content(node)[:120]})
    heading_skips = []
    for previous, current in zip(headings, headings[1:]):
        if current["level"] > previous["level"] + 1:
            heading_skips.append([previous, current])

    images = doc.xpath("//img")
    inputs = doc.xpath("//input|//select|//textarea")
    labels_for = {x for x in doc.xpath("//label/@for") if x}
    form_issues = []
    for node in inputs:
        typ = (node.get("type") or node.tag).lower()
        if typ in {"hidden", "submit", "button"}:
            continue
        node_id = node.get("id")
        ancestor_label = bool(node.xpath("ancestor::label"))
        if not (node.get("aria-label") or ancestor_label or (node_id and node_id in labels_for)):
            form_issues.append({"type": typ, "issue": "missing-label", "name": node.get("name")})
        if not node.get("name"):
            form_issues.append({"type": typ, "issue": "missing-name", "id": node_id})
        if typ not in {"checkbox", "radio", "file"} and not node.get("autocomplete"):
            form_issues.append({"type": typ, "issue": "missing-autocomplete", "id": node_id})

    icon_button_issues = []
    for button in doc.xpath("//button"):
        visible = text_content(button).strip()
        if not visible and not button.get("aria-label"):
            icon_button_issues.append(html.tostring(button, encoding="unicode")[:180])

    broken_links = []
    for node in doc.xpath("//a[@href]"):
        href = node.get("href") or ""
        if not local_target_exists(path, href):
            broken_links.append(href)

    scripts_external_no_sri = []
    for script in doc.xpath("//script[@src]"):
        src = script.get("src") or ""
        if src.startswith(("http://", "https://")) and not script.get("integrity"):
            scripts_external_no_sri.append(src)

    placeholders = re.findall(
        r"(?i)foto em breve|dados fict[ií]cios|produto de exemplo|placeholder|busca em breve|simulad[oa]",
        text_content(doc),
    )
    og_image = doc.xpath("string(//meta[@property='og:image']/@content)").strip()

    return {
        "file": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "lang": doc.xpath("string(/html/@lang)").strip(),
        "title": title,
        "description": desc,
        "viewport": doc.xpath("string(//meta[@name='viewport']/@content)").strip(),
        "canonical": doc.xpath("string(//link[@rel='canonical']/@href)").strip(),
        "og_image": og_image,
        "h1_count": len(doc.xpath("//h1")),
        "heading_skips": heading_skips,
        "images": len(images),
        "images_missing_alt": sum(1 for x in images if x.get("alt") is None),
        "images_missing_dimensions": sum(1 for x in images if not (x.get("width") and x.get("height"))),
        "images_lazy": sum(1 for x in images if x.get("loading") == "lazy"),
        "forms": len(doc.xpath("//form")),
        "form_issues": form_issues,
        "icon_button_issues": icon_button_issues,
        "broken_links": sorted(set(broken_links)),
        "scripts_external_no_sri": scripts_external_no_sri,
        "inline_styles": len(doc.xpath("//*[@style]")),
        "disabled_controls": len(doc.xpath("//button[@disabled]|//input[@disabled]|//select[@disabled]")),
        "placeholder_markers": len(placeholders),
    }


pages = [audit_page(p) for p in PUBLIC_HTML]

css_text = "\n".join(p.read_text(encoding="utf-8") for p in (ROOT / "css").glob("*.css"))
js_text = "\n".join(p.read_text(encoding="utf-8") for p in (ROOT / "js").glob("*.js") if p.name != "config.js")

report = {
    "summary": {
        "pages": len(pages),
        "html_bytes": sum(p["bytes"] for p in pages),
        "missing_descriptions": sum(not p["description"] for p in pages),
        "missing_canonicals": sum(not p["canonical"] for p in pages),
        "pages_bad_h1": sum(p["h1_count"] != 1 for p in pages),
        "heading_skips": sum(len(p["heading_skips"]) for p in pages),
        "images": sum(p["images"] for p in pages),
        "images_missing_alt": sum(p["images_missing_alt"] for p in pages),
        "images_missing_dimensions": sum(p["images_missing_dimensions"] for p in pages),
        "images_lazy": sum(p["images_lazy"] for p in pages),
        "form_issues": sum(len(p["form_issues"]) for p in pages),
        "broken_links": sum(len(p["broken_links"]) for p in pages),
        "placeholder_markers": sum(p["placeholder_markers"] for p in pages),
        "external_scripts_without_sri": sum(len(p["scripts_external_no_sri"]) for p in pages),
    },
    "css": {
        "bytes": len(css_text.encode("utf-8")),
        "transition_all": len(re.findall(r"transition\s*:\s*all\b", css_text, re.I)),
        "outline_none": len(re.findall(r"outline\s*:\s*(?:none|0)\b", css_text, re.I)),
        "prefers_reduced_motion": len(re.findall(r"prefers-reduced-motion", css_text, re.I)),
        "layout_width_transitions": len(re.findall(r"transition[^;]*\bwidth\b", css_text, re.I)),
        "large_z_indexes": len(re.findall(r"z-index\s*:\s*(?:999|[1-9]\d{3,})", css_text, re.I)),
        "color_literals": len(re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", css_text)),
    },
    "js": {
        "bytes": len(js_text.encode("utf-8")),
        "inner_html": len(re.findall(r"\.innerHTML\s*=", js_text)),
        "fetch_calls": len(re.findall(r"\bfetch\s*\(", js_text)),
        "local_storage": len(re.findall(r"\blocalStorage\b", js_text)),
        "intl_number_format": len(re.findall(r"Intl\.NumberFormat", js_text)),
        "intersection_observer": len(re.findall(r"IntersectionObserver", js_text)),
    },
    "pages": pages,
}

output = ROOT / "tmp" / "pdfs" / "audit-site.json"
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
print(json.dumps(report["css"], ensure_ascii=False, indent=2))
print(json.dumps(report["js"], ensure_ascii=False, indent=2))
