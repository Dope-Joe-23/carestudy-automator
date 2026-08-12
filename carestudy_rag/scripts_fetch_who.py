"""Fetch openly-licensed WHO fact sheets into data/reference/.

WHO fact sheets are published under CC BY-NC-SA 3.0 IGO, so they can be
redistributed with attribution — unlike copyrighted textbooks (Potter & Perry,
NANDA-I), which cannot be bundled and must instead be excerpted by the student.

Each fact sheet is saved as `data/reference/who_<slug>.txt` with an attribution
header, and a matching entry is written into `data/reference/citations.json` so
drafts cite it as "(WHO, 2024)" — the style used in the sample care studies.

Usage:
    python scripts_fetch_who.py

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

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "reference")
CITATIONS_PATH = os.path.join(OUT_DIR, "citations.json")
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "carestudy-automator/1.0 (openly-licensed reference library build)"
)
MONTHS = (
    r"January|February|March|April|May|June|July|August|"
    r"September|October|November|December"
)
DATE_RE = re.compile(rf"\b(\d{{1,2}})\s+({MONTHS})\s+(20\d{{2}})\b")
# Pages served without an extractable article body (or truncated by a bot wall)
# must never land in the library — require a real amount of prose.
MIN_WORDS = 200

# (output file, fact-sheet slug, fallback year) — the fallback year is used
# only when the page itself doesn't carry a date. The cardiovascular-diseases
# page is deliberately absent: WHO serves it without an extractable article
# body (the myocardial infarction topic keeps its Wikipedia source).
FACT_SHEETS = [
    ("who_asthma.txt", "asthma", 2024),
    ("who_diabetes.txt", "diabetes", 2024),
    ("who_hypertension.txt", "hypertension", 2023),
    ("who_malaria.txt", "malaria", 2024),
    ("who_tuberculosis.txt", "tuberculosis", 2024),
    ("who_pneumonia.txt", "pneumonia", 2022),
    ("who_sickle_cell_disease.txt", "sickle-cell-disease", 2023),
    ("who_anaemia.txt", "anaemia", 2024),
]


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def extract_fact_sheet(raw_html: str) -> tuple:
    """Return (title, year, article_lines) from a WHO fact sheet page."""
    title_match = re.search(r"<h1[^>]*>(.*?)</h1>", raw_html, re.S)
    title = re.sub(r"<[^>]+>", "", title_match.group(1)).strip() if title_match else ""

    start = raw_html.find('class="row sf-detail-content"')
    if start == -1:
        start = raw_html.find("sf-detail-content")
    if start == -1:
        raise ValueError("fact-sheet article block not found")

    # The article ends where the site's 'Fact sheets' navigation begins.
    cut = raw_html.find("Fact sheets", start)
    body = raw_html[start:cut if cut > start else len(raw_html)]

    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", body, flags=re.S)
    text = re.sub(r"<[^>]+>", "\n", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t\xa0]+", " ", text)
    lines = [line.strip() for line in text.split("\n") if line.strip()]

    # Drop structural residue (class names, reading-time hints, breadcrumbs).
    noise = (
        "sf-detail-content",
        "data-sf-element",
        "data-placeholder-label",
        "sf-item-header",
        "sf_colsIn",
        "sf_colsOut",
        "Reading time:",
        "Fact sheet",
    )
    cleaned = []
    for line in lines:
        if any(marker in line for marker in noise):
            continue
        if line in ("Related", "Fact sheets", "Click here for fact sheets on other topics"):
            continue
        cleaned.append(line)

    # Drop the article's own title + "last updated" date lines — the file
    # header already carries the title and the citation carries the year.
    while cleaned and cleaned[0] == title:
        cleaned.pop(0)
    while cleaned and DATE_RE.fullmatch(cleaned[0]):
        cleaned.pop(0)

    # Prefer the page's own "last updated" date for the citation year. Only
    # scan the header region — dates inside the article body ("In 2026…")
    # would otherwise be mistaken for the update date.
    year = None
    for match in DATE_RE.finditer(raw_html[start:start + 3000]):
        try:
            year = int(match.group(3))
            break
        except ValueError:
            continue
    return title, year, cleaned


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(CITATIONS_PATH, "r", encoding="utf-8") as handle:
        citations = json.load(handle)

    # Keep the WHO section of the registry in sync with FACT_SHEETS: drop any
    # who_* entries from previous runs so removed/renamed sheets never linger.
    for key in [k for k in citations if k.startswith("who_")]:
        del citations[key]

    today = date.today().isoformat()
    for out_file, slug, fallback_year in FACT_SHEETS:
        url = f"https://www.who.int/news-room/fact-sheets/detail/{slug}"
        print(f"Fetching {url} ...")
        try:
            raw_html = fetch(url)
            title, year, lines = extract_fact_sheet(raw_html)
        except Exception as exc:
            print(f"  SKIPPED ({exc})")
            continue
        if not lines:
            print("  SKIPPED (no article text extracted)")
            continue
        body = "\n\n".join(lines)
        if len(body.split()) < MIN_WORDS:
            print(f"  SKIPPED (only {len(body.split())} words — page probably has no article body)")
            continue

        year = year or fallback_year
        header = (
            "SOURCE: World Health Organization fact sheet\n"
            f"TITLE: {title}\n"
            f"URL: {url}\n"
            "LICENSE: CC BY-NC-SA 3.0 IGO (https://creativecommons.org/licenses/by-nc-sa/3.0/igo/)\n"
            f"RETRIEVED: {today}\n"
        )
        with open(os.path.join(OUT_DIR, out_file), "w", encoding="utf-8") as handle:
            handle.write(header + "\n\n" + body + "\n")
        print(f"  -> {out_file} ({title}, {len(body.split())} words, year {year})")

        citations[out_file] = {
            "title": title,
            "author": "World Health Organization",
            "year": year,
            "citeKey": "WHO",
            "venue": "Fact sheet",
            "url": url,
        }

    with open(CITATIONS_PATH, "w", encoding="utf-8") as handle:
        json.dump(citations, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print("\nUpdated", CITATIONS_PATH)
    print("Next: rebuild the index with  python src/ingest_reference.py data/reference/*")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
