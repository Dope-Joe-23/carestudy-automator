"""
Convert various document formats to plain text.
Supports: .doc, .docx, .pdf, .txt, .md, .epub, .html/.htm
"""
import html as html_mod
import re
import subprocess
import tempfile
import os
import zipfile
from html.parser import HTMLParser


class _TextExtractor(HTMLParser):
    """Pulls readable text out of an HTML/EPUB fragment (no dependencies)."""

    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        elif tag in ("p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "tr", "blockquote"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def html_to_text(raw: str) -> str:
    """Strip tags/scripts from an HTML string, preserving paragraph breaks."""
    parser = _TextExtractor()
    parser.feed(raw)
    text = html_mod.unescape("".join(parser.parts))
    lines = [re.sub(r"[ \t\xa0]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def _load_epub(path: str) -> str:
    """Read an EPUB (zip of XHTML) as plain text. Navigation/TOC entries are
    skipped; chapter bodies keep their paragraph structure."""
    parts = []
    with zipfile.ZipFile(path) as zf:
        names = sorted(
            n for n in zf.namelist()
            if n.lower().endswith((".html", ".xhtml", ".htm"))
        )
        for name in names:
            base = os.path.basename(name).lower()
            if base.startswith(("toc", "nav", "cover", "about")):
                continue
            try:
                raw = zf.read(name).decode("utf-8", errors="ignore")
            except (KeyError, zipfile.BadZipFile):
                continue
            text = html_to_text(raw)
            if text.strip():
                parts.append(text)
    if not parts:
        raise ValueError("No readable chapter content found in this EPUB")
    return "\n\n".join(parts)


def load_as_text(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()

    if ext in (".txt", ".md"):
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    if ext in (".html", ".htm"):
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return html_to_text(f.read())

    if ext == ".epub":
        return _load_epub(path)

    if ext == ".docx":
        import docx
        doc = docx.Document(path)
        return "\n".join(p.text for p in doc.paragraphs)

    if ext == ".doc":
        # Legacy binary Word format - needs LibreOffice to convert
        with tempfile.TemporaryDirectory() as tmpdir:
            subprocess.run(
                ["soffice", "--headless", "--convert-to", "txt:Text", path,
                 "--outdir", tmpdir],
                check=True, capture_output=True, timeout=120
            )
            out_name = os.path.splitext(os.path.basename(path))[0] + ".txt"
            out_path = os.path.join(tmpdir, out_name)
            with open(out_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()

    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    raise ValueError(f"Unsupported file type: {ext}")
