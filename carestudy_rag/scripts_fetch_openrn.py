"""Fetch the Nursing Process chapter of Open RN's Nursing Fundamentals into data/reference/.

Open RN (Wisconsin Technical College System / WisTech Open) publishes Nursing
Fundamentals 2e under a CC BY 4.0 license, so chapters can be redistributed
with attribution — unlike the copyrighted NANDA-I handbook, which must instead
be excerpted by the student.

Two files are produced from chapter 4 ("Nursing Process"):
  - openrn_nursing_process.txt   — the process itself: introduction, basic
    concepts, assessment, outcome identification, planning, implementation,
    evaluation (sections 4.1-4.3 and 4.5-4.8).
  - openrn_nursing_diagnosis.txt — section 4.4 "Diagnosis" (the NANDA-I-style
    diagnostic step), kept separate so care studies on nursing diagnoses cite
    it directly.

Chapter pages are scraped from the book's web edition (the WordPress REST API
exposes search but not direct post access), converted to plain text, and each
file carries an attribution header plus an entry in data/reference/citations.json
so drafts cite it as "(Open RN, 2024)".

Usage:
    python scripts_fetch_openrn.py

Then rebuild the retrieval index so the new sources are searchable:
    python src/ingest_reference.py data/reference/*
"""
import html
import json
import os
import re
import sys
import urllib.request
from datetime import date
from html.parser import HTMLParser

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "reference")
CITATIONS_PATH = os.path.join(OUT_DIR, "citations.json")
BOOK = "https://wtcs.pressbooks.pub/nursingfundamentals"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
MIN_WORDS = 100

# Section slugs of chapter 4 "Nursing Process", in reading order.
PROCESS_SECTIONS = [
    "4-1-nursing-process-introduction",
    "4-2-basic-concepts",
    "4-3-assessment",
    "4-5-outcome-identification",
    "4-6-planning",
    "4-7-implementation-of-interventions",
    "4-8-evaluation",
]
DIAGNOSIS_SECTIONS = ["4-4-diagnosis"]


class _TextExtractor(HTMLParser):
    """Pull readable text out of the chapter HTML (no dependencies)."""

    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        elif tag in ("p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "blockquote"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def html_to_text(raw: str) -> str:
    parser = _TextExtractor()
    parser.feed(raw)
    text = html.unescape("".join(parser.parts))
    lines = [re.sub(r"[ \t\xa0]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def fetch_section(slug: str) -> str:
    """Return the plain text of a chapter section, or raise."""
    url = f"{BOOK}/chapter/{slug}/"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        raw_html = response.read().decode("utf-8", errors="replace")

    start = raw_html.find('<section data-type="chapter"')
    if start == -1:
        raise ValueError(f"chapter block not found for {slug!r}")
    end = raw_html.find("</section>", start)
    if end == -1:
        raise ValueError(f"chapter block not terminated for {slug!r}")
    body = raw_html[start:end]

    # Glossary popups (<template>) duplicate definitions already in the text;
    # footnote markers (<sup>[1]</sup>) dangle without their footnote list.
    body = re.sub(r"<template.*?</template>", " ", body, flags=re.S)
    body = re.sub(r"<script.*?</script>|<style.*?</style>", " ", body, flags=re.S)
    body = re.sub(r"<sup[^>]*>.*?</sup>", " ", body, flags=re.S)
    body = re.sub(r'<p data-type="author">.*?</p>', " ", body, flags=re.S)

    text = html_to_text(body)
    if len(text.split()) < MIN_WORDS:
        raise ValueError(f"only {len(text.split())} words for {slug!r}")
    return text


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(CITATIONS_PATH, "r", encoding="utf-8") as handle:
        citations = json.load(handle)

    # Keep the Open RN section of the registry in sync with the fetch below.
    for key in [k for k in citations if k.startswith("openrn_")]:
        del citations[key]

    today = date.today().isoformat()
    book_url = BOOK + "/"
    jobs = [
        ("openrn_nursing_process.txt", "Nursing process", PROCESS_SECTIONS),
        ("openrn_nursing_diagnosis.txt", "Nursing diagnosis", DIAGNOSIS_SECTIONS),
    ]
    for out_file, title, slugs in jobs:
        print(f"Fetching {title} ({', '.join(slugs)}) ...")
        sections = []
        failed = False
        for slug in slugs:
            try:
                text = fetch_section(slug)
            except Exception as exc:  # noqa: BLE001
                print(f"  SKIPPED section {slug} ({exc})")
                failed = True
                break
            sections.append(text)
        if failed:
            continue

        body = "\n\n".join(sections)
        header = (
            "SOURCE: Open RN Nursing Fundamentals, chapter 4 — Nursing Process\n"
            f"TITLE: {title}\n"
            f"URL: {book_url}\n"
            "LICENSE: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)\n"
            f"RETRIEVED: {today}\n"
        )
        with open(os.path.join(OUT_DIR, out_file), "w", encoding="utf-8") as handle:
            handle.write(header + "\n\n" + body + "\n")
        print(f"  -> {out_file} ({len(body.split())} words)")

        citations[out_file] = {
            "title": f"{title} — Nursing Fundamentals",
            "author": "Open RN",
            "year": 2024,
            "citeKey": "Open RN",
            "venue": "Nursing Fundamentals (2nd ed.), WisTech Open",
            "url": book_url,
        }

    with open(CITATIONS_PATH, "w", encoding="utf-8") as handle:
        json.dump(citations, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print("\nUpdated", CITATIONS_PATH)
    print("Next: rebuild the index with  python src/ingest_reference.py data/reference/*")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
