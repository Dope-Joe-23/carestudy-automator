"""Extract drug monographs from the WHO Model Formulary 2008 into data/reference/.

The WHO Model Formulary (the companion to the WHO Model List of Essential
Medicines) is published under CC BY-NC-SA 3.0 IGO, so monographs can be
redistributed with attribution — replacing the Wikipedia drug articles with an
authoritative formulary source. All eight drugs are WHO essential medicines
with full monographs (uses, contraindications, precautions, dosage, adverse
effects).

The 634-page PDF is downloaded from IRIS (the WHO institutional repository),
each monograph is located by its "drug name + dosage forms" heading, and only
that monograph's text is saved as `data/reference/formulary_<drug>.txt` with
an attribution header and an entry in data/reference/citations.json so drafts
cite it as "(WHO Model Formulary, 2008)".

Usage:
    python scripts_fetch_who_formulary.py

Then rebuild the retrieval index so the new sources are searchable:
    python src/ingest_reference.py data/reference/*
"""
import json
import os
import re
import sys
import tempfile
import urllib.request
from datetime import date

from pypdf import PdfReader

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "reference")
CITATIONS_PATH = os.path.join(OUT_DIR, "citations.json")
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "carestudy-automator/1.0 (openly-licensed reference library build)"
)
# IRIS item for "WHO model formulary 2008" (ISBN 978-92-4-154765-9).
IRIS_ITEM = "https://iris.who.int/server/api/core/items/8bdde138-003e-4b61-9208-1abe1e7b0d02"
FORMULARY_URL = "https://www.who.int/publications/i/item/9789241547659"

# (output file, monograph title, section intro to include or None).
# The insulin file bundles chapter 18.5's introduction ("Insulin", "Surgery",
# "Oral antidiabetic drugs" narratives — the "note above" the insulin
# monographs keep referencing) plus both insulin monographs.
DRUGS = [
    ("formulary_ceftriaxone.txt", "Ceftriaxone", ["Ceftriaxone"], None),
    ("formulary_paracetamol.txt", "Paracetamol", ["Paracetamol"], None),
    ("formulary_amoxicillin.txt", "Amoxicillin", ["Amoxicillin"], None),
    ("formulary_metformin.txt", "Metformin", ["Metformin"], None),
    ("formulary_furosemide.txt", "Furosemide", ["Furosemide"], None),
    ("formulary_artemether_lumefantrine.txt", "Artemether + lumefantrine", ["Artemether + lumefantrine"], None),
    ("formulary_folic_acid.txt", "Folic acid", ["Folic acid"], None),
    ("formulary_insulin.txt", "Insulin (medication)", ["Insulin injection (soluble)", "Intermediate-acting insulin"], "18.5 Insulins and other antidiabetic agents"),
]

DOSAGE_RE = re.compile(
    r"^(Tablet|Injection|Oral|Powder|Solution|Capsule|Eye|Ear|Nasal|Suspension|"
    r"Suppository|Ointment|Cream|Inhalation|Lotion|Gel|Pessary|Spray|Granules|Liquid|Drops)"
)
NAME_RE = re.compile(r"^[A-Za-z][A-Za-z +/\-()]{2,45}$")
# Running chapter header at the top of every page, e.g. "6. Anti-infective medicines".
CHAP_RE = re.compile(r"^\d+\.\s+[A-Z][a-z]")
# Real body heading, e.g. "18.6 Ovulation inducers" — acts as a monograph boundary.
SECTION_RE = re.compile(r"^\d+\.\d+\s+[A-Z]")


def _get_json(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def download_formulary_pdf(dest_dir: str) -> str:
    """Download the formulary PDF from IRIS via the DSpace REST API."""
    bundles = _get_json(f"{IRIS_ITEM}/bundles")
    original = next(
        (b for b in bundles.get("_embedded", {}).get("bundles", []) if b.get("name") == "ORIGINAL"),
        None,
    )
    if not original:
        raise RuntimeError("ORIGINAL bundle not found on IRIS")
    bitstreams = _get_json(original["_links"]["bitstreams"]["href"])
    content_url = bitstreams["_embedded"]["bitstreams"][0]["_links"]["content"]["href"]
    dest = os.path.join(dest_dir, "who_model_formulary_2008.pdf")
    request = urllib.request.Request(content_url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=180) as response:
        data = response.read()
    with open(dest, "wb") as handle:
        handle.write(data)
    print(f"  downloaded {len(data) / 1024 / 1024:.1f} MB PDF -> {dest}")
    return dest


def load_flat_pages(pdf_path: str):
    """Return (flat_lines, header_positions) with page furniture removed."""
    reader = PdfReader(pdf_path)
    flat = []
    headers = []
    for page in reader.pages:
        page_lines = []
        for ln in (page.extract_text() or "").split("\n"):
            s = ln.strip()
            if not s:
                continue
            if re.fullmatch(r"\d+", s):
                continue  # page number
            if s.startswith("WHO Model Formulary 2008"):
                continue  # page footer
            if CHAP_RE.match(s):
                continue  # running chapter header
            page_lines.append(s)
        for i, ln in enumerate(page_lines):
            pos = len(flat)
            flat.append(ln)
            if (
                NAME_RE.match(ln)
                and i + 1 < len(page_lines)
                and DOSAGE_RE.match(page_lines[i + 1])
            ):
                headers.append((pos, ln))
    return flat, headers


def monograph_span(flat, headers, start_pos):
    """Lines from start_pos to the next monograph header or section heading."""
    end = len(flat)
    for pos, _name in headers:
        if pos > start_pos:
            end = pos
            break
    for n in range(start_pos + 1, len(flat)):
        if SECTION_RE.match(flat[n]):
            end = min(end, n)
            break
    return flat[start_pos:end]


def best_monograph(flat, headers, name):
    """Pick the fullest monograph for a drug (cross-ref entries score lowest)."""
    candidates = [pos for pos, nm in headers if nm == name]
    best, best_score = None, -1
    labels = ("Uses:", "Contraindications:", "Precautions:", "Dose:", "Adverse effects:")
    for pos in candidates:
        seg = monograph_span(flat, headers, pos)
        score = sum(1 for label in labels if label in " ".join(seg))
        if score > best_score:
            best, best_score = (pos, seg), score
    return best


def section_intro(flat, headers, heading):
    """Lines from a section heading to the first monograph header after it."""
    pos = next((i for i, ln in enumerate(flat) if ln == heading), None)
    if pos is None:
        return None
    end = len(flat)
    for hp, _nm in headers:
        if hp > pos:
            end = hp
            break
    return flat[pos:end]


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(CITATIONS_PATH, "r", encoding="utf-8") as handle:
        citations = json.load(handle)

    # Keep the formulary section of the registry in sync with DRUGS.
    for key in [k for k in citations if k.startswith("formulary_")]:
        del citations[key]

    tmpdir = tempfile.mkdtemp(prefix="who_formulary_")
    print("Downloading WHO Model Formulary 2008 from IRIS ...")
    try:
        pdf_path = download_formulary_pdf(tmpdir)
        print("Extracting monograph text ...")
        flat, headers = load_flat_pages(pdf_path)
    finally:
        for entry in os.listdir(tmpdir):
            os.unlink(os.path.join(tmpdir, entry))
        os.rmdir(tmpdir)

    today = date.today().isoformat()
    for out_file, title, monograph_names, intro_heading in DRUGS:
        parts = []
        if intro_heading:
            intro = section_intro(flat, headers, intro_heading)
            if intro:
                parts.append("\n\n".join(intro))
        for name in monograph_names:
            found = best_monograph(flat, headers, name)
            if not found:
                print(f"  SKIPPED {out_file} (monograph {name!r} not found)")
                break
            _pos, seg = found
            parts.append("\n\n".join(seg))
        else:
            body = "\n\n".join(parts)
            header = (
                "SOURCE: WHO Model Formulary 2008 (companion to the WHO Model List of Essential Medicines)\n"
                f"TITLE: {title}\n"
                f"URL: {FORMULARY_URL}\n"
                "LICENSE: CC BY-NC-SA 3.0 IGO (https://creativecommons.org/licenses/by-nc-sa/3.0/igo/)\n"
                f"RETRIEVED: {today}\n"
            )
            with open(os.path.join(OUT_DIR, out_file), "w", encoding="utf-8") as handle:
                handle.write(header + "\n\n" + body + "\n")
            print(f"  -> {out_file} ({title}, {len(body.split())} words)")

            citations[out_file] = {
                "title": title,
                "author": "World Health Organization",
                "year": 2008,
                "citeKey": "WHO Model Formulary",
                "venue": "WHO Model Formulary 2008",
                "url": FORMULARY_URL,
            }

    with open(CITATIONS_PATH, "w", encoding="utf-8") as handle:
        json.dump(citations, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print("\nUpdated", CITATIONS_PATH)
    print("Next: rebuild the index with  python src/ingest_reference.py data/reference/*")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
