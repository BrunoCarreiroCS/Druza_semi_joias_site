from __future__ import annotations

import sys
from pathlib import Path

import pdfplumber


def overlap(a: dict, b: dict) -> tuple[float, float]:
    width = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
    height = min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])
    return width, height


def main() -> int:
    path = Path(sys.argv[1])
    issues: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
            for idx, a in enumerate(words):
                if a["x0"] < -0.5 or a["x1"] > page.width + 0.5 or a["top"] < -0.5 or a["bottom"] > page.height + 0.5:
                    issues.append(f"p{page_no}: fora da pagina: {a['text']!r}")
                for b in words[idx + 1 :]:
                    ow, oh = overlap(a, b)
                    if ow > 1.0 and oh > 1.0:
                        # Words on the same intended line may have tiny box contact;
                        # require material overlap in both dimensions.
                        min_w = min(a["x1"] - a["x0"], b["x1"] - b["x0"])
                        min_h = min(a["bottom"] - a["top"], b["bottom"] - b["top"])
                        if ow / max(min_w, 0.1) > 0.18 and oh / max(min_h, 0.1) > 0.18:
                            issues.append(f"p{page_no}: colisao: {a['text']!r} x {b['text']!r}")
    print(f"pages={page_no}")
    print(f"issues={len(issues)}")
    for issue in issues[:200]:
        print(issue)
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
