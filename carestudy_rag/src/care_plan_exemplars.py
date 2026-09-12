"""Care-plan exemplar index for AI-first generation (v2).

Extracts complete care-plan rows from the school's sample care studies
(attached_assets/*.docx), indexes them with TF-IDF, and retrieves the most
similar real rows as few-shot examples for the LLM — so ANY diagnosis (even
ones with no library family) gets grounded in authentic local style.

Falls back to the deterministic order library when the exemplar index is
missing (e.g. fresh deploys where ingest hasn't run) — the v1 chain remains
the safety net at every layer.
"""

from __future__ import annotations

import glob
import html
import json
import os
import re
import sys
import zipfile
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Row extraction from sample .docx files
# ---------------------------------------------------------------------------

# The samples number orders inconsistently: '1) ... 2) ...', '1.) ...', and
# sometimes no numbers at all ('Reassure patient.Lock bed wheels.Raise side
# rails.'). Acceptance is therefore style-agnostic: a long cell rich in care
# verbs. This keeps every genuine care-plan row while rejecting drugs-table
# rows ('Thiazide diuretic') and header noise.
_CARE_VERB_RX = re.compile(
    r"\b(?:assess|reassur|encourag|educat|assist|administer|monitor|check|"
    r"provide|ensure|teach|give|serve|offer|observe|raise|keep|restrict|"
    r"explain|instruct|apply|perform|change|involve|maintain|record|evaluate|"
    r"establish|organise|organize|plan|allow|let|prevent|promote|support)\w*",
    re.I,
)

# Cell indices in the school's care-plan layout (verified across the samples).
_IDX_DIAGNOSIS = 1
_IDX_OBJECTIVE = 2
_IDX_ORDERS = 3
_IDX_INTERVENTIONS = 4


def _docx_table_rows(path: str) -> List[List[str]]:
    """Extract every non-empty table row's cell texts from a .docx file."""
    try:
        with zipfile.ZipFile(path) as archive:
            xml = archive.read("word/document.xml").decode("utf-8")
    except Exception:
        return []
    rows: List[List[str]] = []
    for row_xml in re.findall(r"<w:tr[ >].*?</w:tr>", xml, re.S):
        cells: List[str] = []
        for cell_xml in re.findall(r"<w:tc[ >].*?</w:tc>", row_xml, re.S):
            text = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", cell_xml))
            cells.append(html.unescape(text).replace("\r", "").strip())
        if any(cells):
            rows.append(cells)
    return rows


def _looks_like_orders(text: str) -> bool:
    """A usable orders cell is long and rich in care-action verbs — robust to
    every numbering style used in the samples (1), 1.), unnumbered)."""
    return len(text) >= 120 and len(set(_CARE_VERB_RX.findall(text))) >= 3


def extract_exemplar_rows(paths: List[str]) -> List[Dict[str, str]]:
    """Extract clean care-plan rows (diagnosis, objective, orders,
    interventions) from sample .docx files. Rows without a diagnosis or a
    properly-structured orders cell are skipped."""
    exemplars: List[Dict[str, str]] = []
    for path in paths:
        for cells in _docx_table_rows(path):
            if len(cells) < 5:
                continue
            diagnosis = cells[_IDX_DIAGNOSIS].strip()
            objective = cells[_IDX_OBJECTIVE].strip()
            orders = cells[_IDX_ORDERS].strip()
            interventions = cells[_IDX_INTERVENTIONS].strip()
            if len(diagnosis) < 12 or not _looks_like_orders(orders):
                continue
            if len(interventions) < 40 or len(objective) < 30:
                continue
            # Skip table-continuation header noise that lands in the cell.
            if "nursing care plan" in diagnosis.lower() and "table" in diagnosis.lower():
                continue
            exemplars.append({
                "diagnosis": diagnosis,
                "objective": objective,
                "orders": orders,
                "interventions": interventions,
                "source": os.path.basename(path),
            })
    return exemplars


# ---------------------------------------------------------------------------
# TF-IDF retrieval over the diagnosis phrases
# ---------------------------------------------------------------------------


class ExemplarIndex:
    """Tiny TF-IDF index over exemplar diagnoses. Built lazily from the sample
    files; a missing/corrupt corpus degrades to an empty index (callers then
    fall back to the order library)."""

    def __init__(self) -> None:
        self.rows: List[Dict[str, str]] = []
        self._vectorizer = None
        self._matrix = None

    @property
    def ready(self) -> bool:
        return self._matrix is not None and len(self.rows) > 0

    def build(self, paths: List[str]) -> int:
        self.rows = extract_exemplar_rows(paths)
        return self.build_from_rows(self.rows)

    def build_from_rows(self, rows: List[Dict[str, str]]) -> int:
        """Index pre-extracted rows (from the prebuilt corpus cache or fresh
        extraction). Returns the number of indexed rows."""
        self.rows = rows
        if not self.rows:
            return 0
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.metrics.pairwise import cosine_similarity
        except ImportError:
            self.rows = []
            return 0

        self._vectorizer = TfidfVectorizer(
            lowercase=True,
            stop_words="english",
            ngram_range=(1, 2),
        )
        self._matrix = self._vectorizer.fit_transform(
            [row["diagnosis"] for row in self.rows]
        )
        self._cosine = cosine_similarity
        return len(self.rows)

    def query(self, diagnosis: str, k: int = 2) -> List[Dict[str, str]]:
        if not self.ready:
            return []
        qvec = self._vectorizer.transform([diagnosis])
        sims = self._cosine(qvec, self._matrix)[0]
        ranked = sorted(enumerate(sims), key=lambda pair: pair[1], reverse=True)
        picked: List[Dict[str, str]] = []
        seen: set = set()
        for index, score in ranked:
            if score <= 0.05:
                break
            row = self.rows[index]
            key = row["diagnosis"].lower()
            if key in seen:
                continue
            seen.add(key)
            picked.append(row)
            if len(picked) >= k:
                break
        return picked


# ---------------------------------------------------------------------------
# Module-level lazy singleton
# ---------------------------------------------------------------------------

# Sample locations, resolved relative to the project root (carestudy_rag/..
# = project root, matching draftWorker.ts's RAG_DIR resolution).
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_SAMPLE_GLOBS = [
    os.path.join(_PROJECT_ROOT, "attached_assets", "*.docx"),
    os.path.join(_PROJECT_ROOT, "attached_assets", "*.pdf"),
]
# Prebuilt corpus index (built by carestudy_rag/scripts/build_exemplar_index.py
# over data/library/care_studies/ — hundreds of harvested care studies).
_CORPUS_INDEX_JSON = os.path.join(_PROJECT_ROOT, "data", "library", "care_studies", "exemplar_index.json")

_index: Optional[ExemplarIndex] = None


def get_exemplar_index() -> ExemplarIndex:
    """Build (once) and return the exemplar index. Never raises.

    Load order: the prebuilt corpus cache (fast, full corpus) → fresh
    extraction from attached_assets samples (slow, small). A corrupt/missing
    corpus degrades to the samples only; both failing yields an empty index
    (callers then fall back to the order library).
    """
    global _index
    if _index is None:
        index = ExemplarIndex()
        count = 0
        if os.path.exists(_CORPUS_INDEX_JSON):
            try:
                with open(_CORPUS_INDEX_JSON, encoding="utf-8") as fh:
                    rows = json.load(fh).get("rows", [])
                rows = [r for r in rows if isinstance(r, dict) and r.get("diagnosis")]
                count = index.build_from_rows(rows)
                if count:
                    print(
                        f"[worker] care-plan exemplar index ready (prebuilt): {count} rows",
                        file=sys.stderr, flush=True,
                    )
            except Exception as exc:  # pragma: no cover — defensive
                print(
                    f"[worker] care-plan exemplar cache unreadable: {exc}",
                    file=sys.stderr, flush=True,
                )
                index = ExemplarIndex()
                count = 0
        if not count:
            paths: List[str] = []
            for pattern in _SAMPLE_GLOBS:
                paths.extend(glob.glob(pattern))
            if paths:
                try:
                    count = index.build(paths)
                    if count:
                        print(
                            f"[worker] care-plan exemplar index ready (samples): {count} rows from {len(paths)} files",
                            file=sys.stderr, flush=True,
                        )
                except Exception as exc:  # pragma: no cover — defensive
                    print(
                        f"[worker] care-plan exemplar index unavailable: {exc}",
                        file=sys.stderr, flush=True,
                    )
                    index = ExemplarIndex()
        _index = index
    return _index


def format_exemplar_block(exemplars: List[Dict[str, str]]) -> str:
    """Render retrieved exemplars as a few-shot block for the LLM prompt."""
    if not exemplars:
        return ""
    parts: List[str] = []
    for exemplar in exemplars:
        parts.append(
            f"DIAGNOSIS: {exemplar['diagnosis']}\n"
            f"OBJECTIVE (as the samples write it): {exemplar['objective']}\n"
            f"NURSING ORDERS (as the samples write them): {exemplar['orders']}\n"
            f"NURSING INTERVENTIONS (as the samples write them): {exemplar['interventions']}"
        )
    return "\n\n---\n\n".join(parts)
