"""Pull readable text out of each saved club page so it can be reviewed and turned into data.

For every club in data/raw/clubs/ this writes data/raw/club_text/<club>.txt with:
  - INFOBOX: the quick-facts box (founded, ground, capacity, nickname...)
  - LEAD:    the opening paragraphs of the page (a short summary of the club)
  - STADIUM SECTIONS: every section whose heading mentions a ground / stadium / park

Run:  python3 scripts/extract_club_text.py
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLUBS = ROOT / "data" / "raw" / "clubs"
OUT = ROOT / "data" / "raw" / "club_text"

HEADING = re.compile(r"<h([2-4])[^>]*>(.*?)</h\1>", re.S)
GROUND_WORDS = re.compile(r"ground|stadium|park\b|road\b|new home|move to", re.I)


def text_of(fragment):
    """HTML fragment -> plain text (drops footnote numbers, styles, tags)."""
    fragment = re.sub(r"<(style|script)[^>]*>.*?</\1>", "", fragment, flags=re.S)
    fragment = re.sub(r"<sup[^>]*>.*?</sup>", "", fragment, flags=re.S)
    fragment = re.sub(r"<(br|/p|/li|/tr)[^>]*>", "\n", fragment)
    fragment = re.sub(r"</t[dh]>", " | ", fragment)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    fragment = html.unescape(fragment)
    fragment = re.sub(r"[ \t ]+", " ", fragment)
    return re.sub(r"\n\s*\n+", "\n", fragment).strip()


def infobox(page_html):
    m = re.search(r'<table class="infobox[^"]*".*?</table>', page_html, re.S)
    if not m:
        return ""
    lines = []
    for row in re.findall(r"<tr.*?</tr>", m.group(0), re.S):
        t = text_of(row).replace(" | ", ": ", 1).replace(" | ", " ").strip()
        if t and ":" in t:
            lines.append(t)
    return "\n".join(lines)


def lead(page_html):
    first_heading = HEADING.search(page_html)
    top = page_html[: first_heading.start()] if first_heading else page_html
    top = re.sub(r'<table class="infobox.*?</table>', "", top, flags=re.S)
    paras = [text_of(p) for p in re.findall(r"<p>.*?</p>", top, re.S)]
    return "\n\n".join(p for p in paras if len(p) > 40)


def sections(page_html):
    """Yield (heading, level, text) for every section on the page."""
    marks = list(HEADING.finditer(page_html))
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(page_html)
        heading = text_of(m.group(2)).replace("[edit]", "").strip()
        yield heading, int(m.group(1)), text_of(page_html[m.end():end])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in sorted(CLUBS.glob("*.json")):
        page = json.loads(f.read_text())["parse"]
        h = page["text"]
        parts = [f"TITLE: {page['title']}", "== INFOBOX ==", infobox(h), "== LEAD ==", lead(h)]
        for heading, level, body in sections(h):
            if GROUND_WORDS.search(heading) and body:
                parts += [f"== STADIUM SECTION (h{level}): {heading} ==", body]
        (OUT / f"{f.stem}.txt").write_text("\n".join(parts))
    print(f"wrote {len(list(OUT.glob('*.txt')))} files to {OUT}")


if __name__ == "__main__":
    main()
