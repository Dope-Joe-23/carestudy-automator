"""Fetch open-licensed (CC BY-SA 4.0) Wikipedia medical articles into data/reference/.

Each article is saved as plain text (one .txt per topic). A SOURCES.txt file
records title, URL, license, and retrieval date for attribution.

Uses the MediaWiki API `prop=extracts` with `explaintext=1`, which returns the
page's plain text (no markup) and resolves redirects.

Usage:
    python scripts_fetch_reference.py
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "reference")
API = "https://en.wikipedia.org/w/api.php"

# topic title -> filename slug
TOPICS = {
    "Pneumonia": "pneumonia",
    "Hypertension": "hypertension",
    "Diabetes mellitus type 2": "diabetes_type_2",
    "Sickle cell disease": "sickle_cell_disease",
    "Malaria": "malaria",
    "Appendicitis": "appendicitis",
    "Asthma": "asthma",
    "Urinary tract infection": "urinary_tract_infection",
    "Peptic ulcer disease": "peptic_ulcer_disease",
    "Iron-deficiency anemia": "iron_deficiency_anemia",
    "Tuberculosis": "tuberculosis",
    "Myocardial infarction": "myocardial_infarction",
    "Ceftriaxone": "ceftriaxone",
    "Paracetamol": "paracetamol",
    "Amoxicillin": "amoxicillin",
    "Metformin": "metformin",
    "Furosemide": "furosemide",
    "Artemether/lumefantrine": "artemether_lumefantrine",
    "Folic acid": "folic_acid",
    "Insulin (medication)": "insulin_medication",
    "Nursing process": "nursing_process",
    "Nursing diagnosis": "nursing_diagnosis",
}

HEADERS = {
    "User-Agent": "CareStudyDraftingAssistant/1.0 (local student tool; contact: none)"
}

CUT_HEADINGS = ("References", "Further reading", "External links", "Bibliography", "Notes", "See also")


def fetch_plaintext(title, attempts=4):
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "extracts",
            "explaintext": "1",
            "redirects": "1",
            "titles": title,
        }
    )
    req = urllib.request.Request(f"{API}?{params}", headers=HEADERS)
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            page = data["query"]["pages"][0]
            if "missing" in page or "extract" not in page:
                raise ValueError(f"no extract for {title!r}")
            return page["extract"]
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < attempts - 1:
                time.sleep(8 * (attempt + 1))
                continue
            raise


def clean(text):
    # drop footnote/citation artifacts
    text = re.sub(r"\[\d+\]", "", text)
    text = re.sub(r"\[(citation needed|failed verification|verification needed)\]", "", text, flags=re.I)
    # cut everything from the reference-style sections onward
    for heading in CUT_HEADINGS:
        idx = text.find(f"\n{heading}\n")
        if idx != -1:
            text = text[:idx]
    lines = [ln.strip() for ln in text.splitlines()]
    # drop empty leading lines
    while lines and not lines[0]:
        lines.pop(0)
    return "\n".join(lines).strip()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    fetched = []
    failed = []
    for title, slug in TOPICS.items():
        path = os.path.join(OUT_DIR, f"{slug}.txt")
        if os.path.exists(path):
            print(f"SKIP {slug:28s} (already present)")
            fetched.append((title, slug, len(open(path, encoding="utf-8").read().split())))
            continue
        try:
            body = clean(fetch_plaintext(title))
            with open(path, "w", encoding="utf-8") as f:
                f.write(f"{title}\n\n{body}\n")
            words = len(body.split())
            fetched.append((title, slug, words))
            print(f"OK  {slug:28s} ({words:5d} words)")
        except Exception as exc:  # noqa: BLE001
            failed.append((title, str(exc)))
            print(f"ERR {slug:28s} {exc}")
        time.sleep(0.3)

    if fetched:
        with open(os.path.join(OUT_DIR, "SOURCES.txt"), "w", encoding="utf-8") as f:
            f.write("Reference library sources\n")
            f.write("=" * 40 + "\n")
            f.write("Retrieved: %s\n" % time.strftime("%Y-%m-%d"))
            f.write("License: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)\n")
            f.write("Source: Wikipedia (https://www.wikipedia.org/)\n\n")
            for title, slug, words in fetched:
                url = "https://en.wikipedia.org/wiki/" + title.replace(" ", "_")
                f.write(f"- {title} ({words} words) -> {slug}.txt\n  {url}\n")

    print(f"\nFetched {len(fetched)} articles, failed {len(failed)}")
    for title, err in failed:
        print(f"  FAILED {title}: {err}")


if __name__ == "__main__":
    main()
