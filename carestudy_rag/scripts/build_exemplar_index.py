"""Build the care-plan exemplar index over the full local corpus.

Sources (merged, deduplicated by diagnosis text):
  - attached_assets/*.docx|*.pdf       (the school's own sample studies)
  - data/library/care_studies/*.pdf|.docx  (harvested NMC Berekum repository)

PDF care-plan tables are extracted with pdfplumber (ruled-table detection —
the school's 8-column care-plan layout yields clean cells), with a pypdf
layout-mode column-reconstruction fallback for borderless tables. The result
is cached to data/library/care_studies/exemplar_index.json so the runtime
(care_plan_exemplars.get_exemplar_index) loads it instantly instead of
re-parsing hundreds of PDFs per request.

Resumable: per-file extraction results are cached under
data/library/care_studies/.exemplar_cache/ — re-run after a timeout and it
continues where it stopped.

Run:  python carestudy_rag/scripts/build_exemplar_index.py [--budget-seconds 480] [--max-files N]
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import time

_HERE = os.path.abspath(os.path.dirname(__file__))
_SRC = os.path.abspath(os.path.join(_HERE, "..", "src"))
_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
sys.path.insert(0, _SRC)

from care_plan_exemplars import (  # noqa: E402
    _CARE_VERB_RX,
    _docx_table_rows,
    _looks_like_orders,
)

CORPUS_DIR = os.path.join(_ROOT, "data", "library", "care_studies")
FILE_CACHE_DIR = os.path.join(CORPUS_DIR, ".exemplar_cache")
INDEX_JSON = os.path.join(CORPUS_DIR, "exemplar_index.json")

_HEADER_TOKENS = (
    ("order", "orders"),
    ("intervention", "interventions"),
    ("diagnos", "diagnosis"),
    ("objective", "objective"),
    ("outcome", "objective"),
    ("evaluat", "evaluation"),
)
_ORDER_NUM_RX = re.compile(r"(\d{1,2})\s*[.)]\s")


# ---------------------------------------------------------------------------
# Shared text cleanup + row validation
# ---------------------------------------------------------------------------

def _clean(text: str) -> str:
    text = (text or "").replace("\ufffd", " ").replace("�", " ")
    text = re.sub(r"\s*\n\s*", " ", text)
    text = re.sub(r"\s{2,}", " ", text)
    # Trailing page-number junk that lands at the end of a page's last cell.
    text = re.sub(r"(?<=[a-z,;])\s+\d{1,3}$", "", text.strip())
    return text.strip(" |").strip()


def _row_is_valid(diag: str, obj: str, orders: str, interv: str) -> bool:
    if len(diag) < 12 or not _looks_like_orders(orders):
        return False
    if len(interv) < 40 or len(obj) < 30:
        return False
    low = diag.lower()
    if "nursing care plan" in low and "table" in low:
        return False
    if "related to" not in low and "risk for" not in low:
        return False
    return True


def _make_row(diag: str, obj: str, orders: str, interv: str, source: str) -> dict[str, str] | None:
    diag, obj = _clean(diag), _clean(obj)
    orders, interv = _clean(orders), _clean(interv)
    if not _row_is_valid(diag, obj, orders, interv):
        return None
    return {
        "diagnosis": diag,
        "objective": obj,
        "orders": orders,
        "interventions": interv,
        "source": os.path.basename(source),
    }


# ---------------------------------------------------------------------------
# PDF: pdfplumber ruled-table extraction (primary)
# ---------------------------------------------------------------------------

def _map_columns(header_rows: list[list[str | None]], width: int) -> dict[str, int] | None:
    """Map logical columns from the table's first header rows."""
    votes: dict[str, list[int]] = {}
    for row in header_rows[:2]:
        for idx, cell in enumerate(row):
            text = (cell or "").lower()
            for token, key in _HEADER_TOKENS:
                if token in text:
                    votes.setdefault(key, []).append(idx)
    if "orders" not in votes or "interventions" not in votes:
        return None
    mapping = {}
    for key, idxs in votes.items():
        # Most common column index wins (header text may span two rows).
        mapping[key] = max(set(idxs), key=idxs.count)
    if mapping["interventions"] == mapping["orders"]:
        return None
    return mapping if width >= max(mapping.values()) + 1 else None


def _pdfplumber_rows(path: str, candidate_pages: list[int]) -> list[dict[str, str]]:
    import pdfplumber

    rows: list[dict[str, str]] = []
    with pdfplumber.open(path) as pdf:
        wanted = set(candidate_pages)
        for delta in (-1, 1):  # tables that straddle page boundaries
            for pi in list(wanted):
                if 0 <= pi + delta < len(pdf.pages):
                    wanted.add(pi + delta)
        for pi in sorted(wanted):
            if pi >= len(pdf.pages):
                continue
            try:
                tables = pdf.pages[pi].extract_tables()
            except Exception:
                continue
            for grid in tables or []:
                if not grid or len(grid[0]) < 5:
                    continue
                mapping = _map_columns([grid[0], grid[1] if len(grid) > 1 else []], len(grid[0]))
                if not mapping:
                    continue
                for cells in grid[1:]:
                    def cell(key: str) -> str:
                        idx = mapping.get(key, -1)
                        if 0 <= idx < len(cells):
                            return cells[idx] or ""
                        return ""
                    diag, obj = cell("diagnosis"), cell("objective")
                    orders, interv = cell("orders"), cell("interventions")
                    # Header-text continuation rows land as data rows — skip.
                    head = (diag + orders).lower()
                    if "order" in head and "intervention" in head:
                        continue
                    row = _make_row(diag, obj, orders, interv, path)
                    if row:
                        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# PDF: pypdf layout-mode column reconstruction (fallback for borderless tables)
# ---------------------------------------------------------------------------

def _find_header_columns(lines: list[str]) -> dict[str, int] | None:
    cols: dict[str, int] = {}
    for line in lines[:60]:
        up = line.upper()
        for token, key in (
            ("DIAGNOSIS", "diagnosis"),
            ("OBJECTIVES", "objective"),
            ("OUTCOME", "objective"),
            ("NURSING ORDERS", "orders"),
            ("INTERVENTIONS", "interventions"),
            ("EVALUATION", "evaluation"),
        ):
            pos = up.find(token)
            if pos >= 0 and key not in cols:
                cols[key] = pos
    if "orders" in cols and "interventions" in cols and cols["interventions"] > cols["orders"]:
        return cols
    return None


def _band_for(line: str, cols: dict[str, int]) -> str | None:
    stripped = line.lstrip(" ")
    if not stripped or re.match(r"^\s{0,60}\d{1,3}\s*$", line):
        return None
    x = len(line) - len(stripped)
    bounds = [
        ("date", 0),
        ("diagnosis", cols.get("diagnosis", 10)),
        ("objective", cols.get("objective", cols.get("diagnosis", 10) + 1)),
        ("orders", cols["orders"]),
        ("interventions", cols["interventions"]),
        ("evaluation", cols.get("evaluation", 10 ** 6)),
    ]
    band = "date"
    for name, start in bounds:
        if x >= start:
            band = name
    return band if band in ("date", "diagnosis", "objective", "orders", "interventions") else None


def _pypdf_layout_rows(path: str, candidate_pages: list[int]) -> list[dict[str, str]]:
    from pypdf import PdfReader

    reader = PdfReader(path)
    date_rx = re.compile(r"^\s{0,6}\d{1,2}\s*[/\\-]\s*\d{1,2}(\s*[/\\-]\s*\d{2,4})?\b")
    num_rx = re.compile(r"^\s{0,4}(\d{1,2})\s*[.)]\s")
    rows: list[dict[str, str]] = []
    cols: dict[str, int] | None = None
    open_row: dict[str, list[str]] | None = None
    last_order_num = 0

    def close_row() -> None:
        nonlocal open_row, last_order_num
        if open_row:
            row = _make_row(
                " ".join(open_row.get("diagnosis", [])),
                " ".join(open_row.get("objective", [])),
                " ".join(open_row.get("orders", [])),
                " ".join(open_row.get("interventions", [])),
                path,
            )
            if row:
                rows.append(row)
        open_row = None
        last_order_num = 0

    for pi in candidate_pages:
        if pi >= len(reader.pages):
            continue
        try:
            text = reader.pages[pi].extract_text(extraction_mode="layout") or ""
        except Exception:
            continue
        lines = text.split("\n")
        header = _find_header_columns(lines)
        if header:
            close_row()
            cols = header
            start = 0
            for i, ln in enumerate(lines[:20]):
                if re.search(r"diagnosis|objective|intervention|evaluation|outcome", ln, re.I):
                    start = i + 1
            lines = lines[start:]
            open_row = {"date": [], "diagnosis": [], "objective": [], "orders": [], "interventions": []}
        elif cols is None or open_row is None:
            continue

        for line in lines:
            band = _band_for(line, cols)
            if band is None:
                continue
            stripped = line.strip()
            if not stripped:
                continue
            if band == "date" and date_rx.match(line) and open_row["orders"]:
                close_row()
                open_row = {"date": [], "diagnosis": [], "objective": [], "orders": [], "interventions": []}
            if band == "orders":
                m = num_rx.match(line)
                if m:
                    num = int(m.group(1))
                    if num <= last_order_num and last_order_num >= 2 and open_row["orders"]:
                        close_row()
                        open_row = {"date": [], "diagnosis": [], "objective": [], "orders": [], "interventions": []}
                        last_order_num = 0
                    last_order_num = max(last_order_num, num)
            if open_row is not None:
                open_row[band].append(stripped)
    close_row()
    return rows


def extract_pdf_rows(path: str) -> list[dict[str, str]]:
    """Care-plan rows from a PDF: fast pypdf page scan → pdfplumber tables,
    falling back to pypdf layout reconstruction for borderless tables."""
    import logging

    logging.getLogger("pypdf").setLevel(logging.ERROR)
    from pypdf import PdfReader

    reader = PdfReader(path)
    candidates: list[int] = []
    for i, page in enumerate(reader.pages):
        try:
            t = page.extract_text() or ""
        except Exception:
            continue
        if re.search(r"nursing order", t, re.I):
            candidates.append(i)
    if not candidates:
        return []

    rows = _pdfplumber_rows(path, candidates)
    if rows:
        return rows
    try:
        return _pypdf_layout_rows(path, candidates)
    except Exception:
        return []


# ---------------------------------------------------------------------------
# DOCX extraction (school's samples) — same gate as the runtime module
# ---------------------------------------------------------------------------

def extract_docx_rows(path: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for cells in _docx_table_rows(path):
        if len(cells) < 5:
            continue
        row = _make_row(cells[1], cells[2], cells[3], cells[4], path)
        if row:
            rows.append(row)
    return rows


def extract_any(path: str) -> list[dict[str, str]]:
    try:
        if path.lower().endswith(".docx"):
            return extract_docx_rows(path)
        if path.lower().endswith(".pdf"):
            return extract_pdf_rows(path)
    except Exception:
        return []
    return []


# ---------------------------------------------------------------------------
# Per-file cache + merged index
# ---------------------------------------------------------------------------

def _file_cache_key(path: str) -> str:
    stat = os.stat(path)
    return f"{os.path.basename(path)}_{stat.st_size}_{int(stat.st_mtime)}.json"


def _dedup_key(diagnosis: str) -> str:
    return re.sub(r"[^a-z0-9]", "", diagnosis.lower())[:60]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget-seconds", type=int, default=480)
    ap.add_argument("--max-files", type=int, default=0)
    ap.add_argument("--shard", type=str, default="",
                    help="optional 'i/n' — this run handles files i::n of the pending list")
    ap.add_argument("--no-merge", action="store_true",
                    help="skip rebuilding INDEX_JSON (pure parse shard run)")
    args = ap.parse_args()

    os.makedirs(FILE_CACHE_DIR, exist_ok=True)
    sample_paths = sorted(
        glob.glob(os.path.join(_ROOT, "attached_assets", "*.docx"))
        + glob.glob(os.path.join(_ROOT, "attached_assets", "*.pdf"))
    )
    corpus_paths = sorted(
        p for p in glob.glob(os.path.join(CORPUS_DIR, "*.pdf")) + glob.glob(os.path.join(CORPUS_DIR, "*.docx"))
        if not os.path.basename(p).startswith("exemplar_index")
    )

    # Merge existing partial index (from a previous interrupted run).
    merged: list[dict[str, str]] = []
    seen_keys: dict[str, int] = {}
    if os.path.exists(INDEX_JSON):
        try:
            merged = json.load(open(INDEX_JSON, encoding="utf-8")).get("rows", [])
        except Exception:
            merged = []
    for row in merged:
        key = _dedup_key(row["diagnosis"])
        seen_keys[key] = seen_keys.get(key, 0) + 1

    deadline = time.monotonic() + args.budget_seconds
    processed = cached = 0
    todo: list[str] = []
    for path in corpus_paths:
        if os.path.exists(os.path.join(FILE_CACHE_DIR, _file_cache_key(path))):
            cached += 1
            continue
        todo.append(path)
    if args.max_files:
        todo = todo[: args.max_files]
    if args.shard:
        i, n = (int(x) for x in args.shard.split("/"))
        todo = todo[i::n]

    print(f"corpus files: {len(corpus_paths)} (cached: {cached}, to parse now: {len(todo)})", flush=True)

    for path in todo:
        if time.monotonic() > deadline:
            print("budget exhausted — re-run to continue", flush=True)
            break
        rows = extract_any(path)
        for row in rows:
            key = _dedup_key(row["diagnosis"])
            if seen_keys.get(key, 0) >= 3:
                continue
            seen_keys[key] = seen_keys.get(key, 0) + 1
            merged.append(row)
        with open(os.path.join(FILE_CACHE_DIR, _file_cache_key(path)), "w", encoding="utf-8") as fh:
            json.dump(rows, fh)
        processed += 1
        if processed % 10 == 0:
            print(f"  parsed {processed}/{len(todo)} — exemplars so far: {len(merged)}", flush=True)

    if not args.no_merge:
        merge_index(sample_paths)


def merge_index(sample_paths: list[str]) -> None:
    """Rebuild INDEX_JSON from ALL per-file caches + the school's samples.
    Safe to run after any shard pattern; shards never write INDEX_JSON."""
    corpus_paths = sorted(
        p for p in glob.glob(os.path.join(CORPUS_DIR, "*.pdf")) + glob.glob(os.path.join(CORPUS_DIR, "*.docx"))
        if not os.path.basename(p).startswith("exemplar_index")
    )
    merged: list[dict[str, str]] = []
    seen: set[str] = set()
    for path in corpus_paths:
        cache_file = os.path.join(FILE_CACHE_DIR, _file_cache_key(path))
        if not os.path.exists(cache_file):
            continue
        try:
            rows = json.load(open(cache_file, encoding="utf-8"))
        except Exception:
            continue
        for row in rows:
            key = _dedup_key(row["diagnosis"])
            if key in seen:
                continue
            seen.add(key)
            merged.append(row)
    # The school's own samples always get in (highest authority, no dedup cap).
    for path in sample_paths:
        for row in extract_any(path):
            key = _dedup_key(row["diagnosis"])
            if key in seen:
                continue
            seen.add(key)
            merged.append(row)
    with open(INDEX_JSON, "w", encoding="utf-8") as fh:
        json.dump({"built_at": time.strftime("%Y-%m-%d %H:%M:%S"), "rows": merged}, fh)
    print(f"INDEX: {len(merged)} exemplar rows -> {os.path.relpath(INDEX_JSON, _ROOT)}", flush=True)


if __name__ == "__main__":
    main()
