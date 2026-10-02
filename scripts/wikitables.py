"""Tiny helper that pulls tables out of Wikipedia HTML using only Python's standard library.

A Wikipedia table can have cells that span several rows or columns (rowspan / colspan).
This reader copies those cells into every row/column they cover, so each row comes out
as a plain, complete list of text values.
"""
import json
import re
from html.parser import HTMLParser


SEP = "¦"  # marks a line break inside a table cell; split on it to get a list


class _TableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []      # finished tables: list of (caption, rows)
        self._stack = []      # tables being read (tables can be nested)
        self._skip = 0        # depth inside <sup> / <style> / <script> (footnotes, etc.)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table" and "wikitable" in (a.get("class") or ""):
            self._stack.append({"caption": "", "rows": [], "row": None, "cell": None, "in_caption": False})
        elif not self._stack:
            return
        t = self._stack[-1] if self._stack else None
        if t is None:
            return
        if tag in ("sup", "style", "script"):
            self._skip += 1
        elif tag == "caption":
            t["in_caption"] = True
        elif tag == "tr":
            t["row"] = []
        elif tag in ("td", "th") and t["row"] is not None:
            t["cell"] = {
                "text": [],
                "rowspan": int(re.sub(r"\D", "", a.get("rowspan") or "1") or 1),
                "colspan": int(re.sub(r"\D", "", a.get("colspan") or "1") or 1),
            }
        elif tag in ("br", "p", "li") and t["cell"] is not None:
            t["cell"]["text"].append(SEP)  # line break inside a cell, e.g. a list of clubs

    def handle_endtag(self, tag):
        if not self._stack:
            return
        t = self._stack[-1]
        if tag in ("sup", "style", "script") and self._skip:
            self._skip -= 1
        elif tag == "caption":
            t["in_caption"] = False
        elif tag in ("td", "th") and t["cell"] is not None:
            c = t["cell"]
            joined = re.sub(r"\s+", " ", "".join(c["text"]))
            joined = re.sub(rf"\s*{SEP}[\s{SEP}]*", SEP, joined)  # tidy spaces / repeated breaks
            c["text"] = joined.strip().strip(SEP).strip()
            t["row"].append(c)
            t["cell"] = None
        elif tag == "tr" and t["row"] is not None:
            if t["row"]:
                t["rows"].append(t["row"])
            t["row"] = None
        elif tag == "table":
            self.tables.append((t["caption"].strip(), _expand(t["rows"])))
            self._stack.pop()

    def handle_data(self, data):
        if not self._stack or self._skip:
            return
        t = self._stack[-1]
        if t["in_caption"]:
            t["caption"] += data
        elif t["cell"] is not None:
            t["cell"]["text"].append(data)


def _expand(rows):
    """Turn rows of cells (with rowspan/colspan) into rows of plain strings."""
    out, carry = [], {}  # carry: column index -> (text, rows still to fill)
    for row in rows:
        cells, col, it = [], 0, iter(row)
        while True:
            if col in carry:
                text, left = carry[col]
                cells.append(text)
                carry[col] = (text, left - 1) if left > 1 else None
                if carry[col] is None:
                    del carry[col]
                col += 1
                continue
            cell = next(it, None)
            if cell is None:
                break
            for _ in range(cell["colspan"]):
                cells.append(cell["text"])
                if cell["rowspan"] > 1:
                    carry[col] = (cell["text"], cell["rowspan"] - 1)
                col += 1
        # leftover carried cells at the end of the row
        while col in carry:
            text, left = carry[col]
            cells.append(text)
            if left > 1:
                carry[col] = (text, left - 1)
            else:
                del carry[col]
            col += 1
        out.append(cells)
    return out


def tables_from_file(path):
    """Read a saved Wikipedia API response and return [(caption, rows), ...]."""
    html = json.load(open(path))["parse"]["text"]
    p = _TableParser()
    p.feed(html)
    return p.tables
