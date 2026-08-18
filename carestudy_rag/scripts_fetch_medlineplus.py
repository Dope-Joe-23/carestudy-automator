"""Fetch MedlinePlus health-topic pages into data/reference/.

MedlinePlus is produced by the U.S. National Library of Medicine; health-topic
summaries are works of the U.S. federal government and are not copyrighted
(public domain), so they can be redistributed freely with attribution — unlike
Wikipedia's share-alike content or copyrighted textbooks.

Only the "Summary" section of each page is kept (the NLM-authored article body);
the "Start Here" / "Diagnosis and Tests" / etc. sections are link lists to
third-party organizations and are deliberately dropped. Each topic is saved as
`data/reference/medlineplus_<slug>.txt` with an attribution header, and a
matching entry is written into `data/reference/citations.json` so drafts cite
it as "(MedlinePlus, 2026)".

Usage:
    python scripts_fetch_medlineplus.py

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
MIN_WORDS = 100

# (output file, MedlinePlus page slug) — topics WHO has no fact sheet for.
# Myocardial infarction uses MedlinePlus's "Heart attack" topic (WHO's
# cardiovascular-diseases page carries no extractable article body).
TOPICS = [
    ("medlineplus_appendicitis.txt", "appendicitis"),
    ("medlineplus_urinary_tract_infection.txt", "urinarytractinfections"),
    ("medlineplus_peptic_ulcer.txt", "pepticulcer"),
    ("medlineplus_myocardial_infarction.txt", "heartattack"),
]


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def extract_summary(raw_html: str) -> tuple:
    """Return (title, summary_lines, attribution) from a MedlinePlus page."""
    title_match = re.search(r"<title>(.*?)</title>", raw_html, re.S)
    title = re.sub(r"<[^>]+>", "", title_match.group(1)).strip() if title_match else ""
    title = title.replace(" | MedlinePlus", "").strip()

    start = raw_html.find('id="mplus-content"')
    if start == -1:
        raise ValueError("main content block not found")
    body = raw_html[start:]

    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", body, flags=re.S)
    text = re.sub(r"<[^>]+>", "\n", text)
    text = html.unescape(text)
    lines = [re.sub(r"[ \t\xa0]+", " ", line).strip() for line in text.split("\n")]

    # Drop the breadcrumbs + "URL of this page" boilerplate and the "On this
    # page" table of contents; keep from the "Summary" heading onward. The TOC
    # lists a "Summary" link before the real heading, so take the LAST
    # standalone "Summary" line.
    summary_idx = max((i for i, ln in enumerate(lines) if ln == "Summary"), default=-1)
    if summary_idx == -1:
        raise ValueError("Summary section not found")
    body_lines = [ln for ln in lines[summary_idx + 1:] if ln]

    # The summary ends where the link-list sections begin.
    cut = len(body_lines)
    for marker in ("Start Here", "Diagnosis and Tests", "Treatments and Therapies"):
        idx = next((i for i, ln in enumerate(body_lines) if ln == marker), -1)
        if idx != -1:
            cut = min(cut, idx)
    body_lines = body_lines[:cut]

    # Keep the NLM attribution line that closes the summary ("NIH: <Institute>").
    attribution = ""
    for ln in body_lines:
        if ln.startswith("NIH:"):
            attribution = ln
    body_lines = [ln for ln in body_lines if not ln.startswith("NIH:")]

    # Drop stray short fragments that sometimes leak past the last paragraph
    # (e.g. a dangling "Learn more" link row), but never below the summary.
    while (
        body_lines
        and len(body_lines[-1]) < 40
        and not body_lines[-1].endswith((".", "?", "!"))
        and "http" not in body_lines[-1]
    ):
        body_lines.pop()

    return title, body_lines, attribution


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(CITATIONS_PATH, "r", encoding="utf-8") as handle:
        citations = json.load(handle)

    # Keep the MedlinePlus section of the registry in sync with TOPICS.
    for key in [k for k in citations if k.startswith("medlineplus_")]:
        del citations[key]

    today = date.today().isoformat()
    for out_file, slug in TOPICS:
        url = f"https://medlineplus.gov/{slug}.html"
        print(f"Fetching {url} ...")
        try:
            raw_html = fetch(url)
            title, lines, attribution = extract_summary(raw_html)
        except Exception as exc:  # noqa: BLE001
            print(f"  SKIPPED ({exc})")
            continue
        body = "\n\n".join(lines)
        if len(body.split()) < MIN_WORDS:
            print(f"  SKIPPED (only {len(body.split())} words — page probably has no article body)")
            continue

        header = (
            "SOURCE: MedlinePlus health topic (U.S. National Library of Medicine)\n"
            f"TITLE: {title}\n"
            f"URL: {url}\n"
            "LICENSE: Public domain (U.S. federal government work — "
            "https://medlineplus.gov/about/using/usingcontent/)\n"
            f"RETRIEVED: {today}\n"
        )
        footer = f"\n\n{attribution}" if attribution else ""
        with open(os.path.join(OUT_DIR, out_file), "w", encoding="utf-8") as handle:
            handle.write(header + "\n\n" + body + footer + "\n")
        print(f"  -> {out_file} ({title}, {len(body.split())} words)")

        citations[out_file] = {
            "title": title,
            "author": "MedlinePlus",
            "year": 2026,
            "citeKey": "MedlinePlus",
            "venue": "Health topic, National Library of Medicine (US)",
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
