"""
Long-lived drafting worker used by the API server.

The one-shot CLI (generate.py) pays a ~30s startup on every run because it
reloads the pickled retrieval indexes from disk each time. This worker loads
them exactly once at startup and then serves one draft request per line,
so every request after the first starts at model speed.

Protocol (JSON lines, one object per line):

    draft request  ->  {"id": <int>, "op": "draft", "heading": "...", "notes": "...", "tabular": false, "kind": "section" | "chapter_intro", "studyId": <int|None>}
    draft response ->  {"id": <int>, "draft": "...", "references": [{...}, ...]}
    ingest request ->  {"id": <int>, "op": "ingest", "studyId": <int>, "paths": [<abs file paths>]}
    ingest response -> {"id": <int>, "files": [{"path": ..., "textLength": <int|None>, "error": <str|None>}], "chunks": <int>}
    viva_bank request ->  {"id": <int>, "op": "viva_bank", "title": {..}, "chapters": [..]}
    viva_bank response -> {"id": <int>, "bank": {"questions": [{category, question, guidance, tip}, ...]}}
    error response ->  {"id": <int>, "error": "..."}   (request failed, worker stays alive)
    error response ->  {"error": "..."}                  (unparseable line, no id to echo)

The worker inherits the server's environment, so ANTHROPIC_API_KEY /
ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL / ANTHROPIC_MODEL work exactly as
they do for generate.py. Non-protocol diagnostics go to stderr, never stdout.
"""
import json
import os
import sys
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(__file__))
from generate import draft_section, load_indexes  # noqa: E402
from loaders import load_as_text  # noqa: E402
from viva import generate_viva_bank  # noqa: E402
from reference_chunker import chunk_reference_text, ref_chunks_to_dicts  # noqa: E402
from retrieval import SimpleIndex  # noqa: E402

# Per-study retrieval indexes, keyed by study id and cached in memory so each
# draft doesn't reload the pickled index from disk. Lives at the project root
# (data/studies) so the API server can clean it up alongside study deletion.
STUDY_INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "studies")
LIBRARY_INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "library")
_study_indexes: Dict[int, SimpleIndex] = {}

# The user's personal reference library (ebooks, notes, articles, external
# resources) — a single shared index, loaded at startup like the bundled ones.
_library_index = SimpleIndex()


def _study_index_path(study_id: int) -> str:
    return os.path.join(STUDY_INDEX_DIR, str(study_id), "index.pkl")


def _get_study_index(study_id: Optional[int]) -> Optional[SimpleIndex]:
    """The cached per-study index for a study, or None when absent."""
    if study_id is None:
        return None
    if study_id in _study_indexes:
        return _study_indexes[study_id]
    path = _study_index_path(study_id)
    if not os.path.exists(path):
        return None
    index = SimpleIndex()
    try:
        index.load(path)
        _study_indexes[study_id] = index
        return index
    except Exception as exc:
        print(f"[worker] failed to load study index {path}: {exc}", file=sys.stderr, flush=True)
        return None


def _load_library_index() -> None:
    """Load the personal-library index once at startup (empty when absent)."""
    path = os.path.join(LIBRARY_INDEX_DIR, "index.pkl")
    if not os.path.exists(path):
        return
    try:
        _library_index.load(path)
    except Exception as exc:
        print(f"[worker] failed to load library index {path}: {exc}", file=sys.stderr, flush=True)


def ingest_library_sources(sources: List[dict]) -> dict:
    """Extract text from the personal library's sources and rebuild its index.

    Each source: {"path": <abs path>, "citation": {label, inText, url}} where the
    citation was registered by the user (or auto-derived). Empty sources clears
    the index.
    """
    results = []
    all_records = []
    for source in sources:
        path = source.get("path")
        citation = source.get("citation") or {}
        try:
            text = load_as_text(path)
        except Exception as exc:
            results.append({"path": path, "textLength": None, "error": str(exc)})
            continue
        text = text.strip()
        if not text:
            results.append({"path": path, "textLength": 0, "error": "No extractable text (scanned PDF?)"})
            continue
        results.append({"path": path, "textLength": len(text), "error": None})
        for chunk in chunk_reference_text(text, os.path.basename(path)):
            all_records.append({
                "text": chunk.text,
                "heading": chunk.heading,
                "source": path,
                "chapter": "",
                "citation": citation,
            })

    global _library_index
    if all_records:
        index = SimpleIndex()
        index.build(all_records)
        os.makedirs(LIBRARY_INDEX_DIR, exist_ok=True)
        index.save(os.path.join(LIBRARY_INDEX_DIR, "index.pkl"))
        _library_index = index
    else:
        try:
            os.remove(os.path.join(LIBRARY_INDEX_DIR, "index.pkl"))
        except OSError:
            pass
        _library_index = SimpleIndex()
    return {"files": results, "chunks": len(all_records)}


def ingest_study_files(study_id: int, paths: List[str]) -> dict:
    """Extract text from the study's uploaded documents and (re)build its index.

    Returns per-file results so the server can mark each upload ready/error,
    plus the total chunk count. An empty path list clears the index.
    """
    results = []
    all_records = []
    for path in paths:
        try:
            text = load_as_text(path)
        except Exception as exc:
            results.append({"path": path, "textLength": None, "error": str(exc)})
            continue
        text = text.strip()
        if not text:
            results.append(
                {"path": path, "textLength": 0, "error": "No extractable text (scanned PDF?)"}
            )
            continue
        results.append({"path": path, "textLength": len(text), "error": None})
        for chunk in chunk_reference_text(text, os.path.basename(path)):
            all_records.append({
                "text": chunk.text,
                "heading": chunk.heading,
                "source": path,
                "chapter": "",
            })

    if all_records:
        index = SimpleIndex()
        index.build(all_records)
        os.makedirs(os.path.dirname(_study_index_path(study_id)), exist_ok=True)
        index.save(_study_index_path(study_id))
        _study_indexes[study_id] = index
    else:
        # Nothing to index (no files, or every extraction failed). Drop any
        # stale index so drafts never ground in a deleted document — building
        # an empty TF-IDF matrix would also crash (empty vocabulary).
        try:
            os.remove(_study_index_path(study_id))
        except OSError:
            pass
        _study_indexes.pop(study_id, None)
    return {"files": results, "chunks": len(all_records)}


def emit(obj: dict) -> None:
    # ensure_ascii keeps the wire format plain UTF-8-safe ASCII; newlines inside
    # the draft are escaped so one response always stays on one physical line.
    sys.stdout.write(json.dumps(obj, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def main() -> None:
    # Windows consoles default to cp1252, which can't encode every Unicode
    # character a model may output. Write UTF-8 and replace anything still
    # unencodable instead of crashing a draft.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    # load_indexes swallows per-file failures internally (degrading to empty
    # retrieval) and always returns SimpleIndex objects, so reuse them
    # directly — passing None here would make draft_section reload the slow
    # indexes on every request, which is exactly what this worker avoids.
    template_index, reference_index = load_indexes()
    _load_library_index()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError as exc:
            emit({"error": f"invalid request line: {exc}"})
            continue

        try:
            op = req.get("op", "draft")
            if op == "ingest":
                study_id = req.get("studyId")
                paths = req.get("paths", []) or []
                if not isinstance(study_id, int) or not isinstance(paths, list):
                    emit({"id": req.get("id"), "error": "ingest requires studyId and a paths list"})
                    continue
                emit({"id": req.get("id"), **ingest_study_files(study_id, paths)})
                continue
            if op == "extract":
                file_path = req.get("path", "")
                if not isinstance(file_path, str) or not file_path:
                    emit({"id": req.get("id"), "error": "extract requires a file path"})
                    continue
                emit({"id": req.get("id"), "text": load_as_text(file_path)})
                continue
            if op == "library_ingest":
                sources = req.get("sources", []) or []
                if not isinstance(sources, list):
                    emit({"id": req.get("id"), "error": "library_ingest requires a sources list"})
                    continue
                emit({"id": req.get("id"), **ingest_library_sources(sources)})
                continue
            if op == "viva_bank":
                title = req.get("title") or {}
                chapters = req.get("chapters") or []
                if not isinstance(title, dict) or not isinstance(chapters, list):
                    emit({"id": req.get("id"), "error": "viva_bank requires a title object and chapters list"})
                    continue
                bank = generate_viva_bank(title, chapters)
                emit({"id": req.get("id"), "bank": bank})
                continue

            study_id = req.get("studyId")
            study_index = _get_study_index(study_id)
            study_chunks = (
                study_index.query(req.get("notes", ""), k=4) if study_index else None
            )
            library_chunks = _library_index.query(req.get("notes", ""), k=3)
            result = draft_section(
                req.get("heading", ""),
                req.get("notes", ""),
                tabular=bool(req.get("tabular", False)),
                chapter_intro=(req.get("kind") == "chapter_intro"),
                template_index=template_index,
                reference_index=reference_index,
                study_chunks=study_chunks,
                library_chunks=library_chunks,
                row_columns=req.get("rowColumns") or None,
            )
            emit({"id": req.get("id"), "draft": result.draft, "references": result.references})
        except Exception as exc:
            # A failed model call must not kill the worker: report it for this
            # request and keep serving the next line.
            emit({"id": req.get("id"), "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
