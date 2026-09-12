"""Harvest patient/family care studies from the Holy Family NMTC Berekum
institutional repository (public DSpace REST API) into data/library/care_studies/.

Polite by design: 2 concurrent workers, per-request delay, exponential backoff
retries, and a resumable manifest. Only publicly downloadable PDFs/DOCX files
are fetched for research/training exemplars.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://ir.nmtcberekum.edu.gh/server/api"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "data", "library", "care_studies")
ITEMS_JSON = os.path.join(ROOT, "carestudy_rag", "data", "hfc_items.json")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")

WORKERS = 3
REQUEST_DELAY = 0.3
MAX_RETRIES = 3

_last_request = [0.0]


def _throttle() -> None:
    wait = REQUEST_DELAY - (time.monotonic() - _last_request[0])
    if wait > 0:
        time.sleep(wait)
    _last_request[0] = time.monotonic()


def fetch(url: str) -> bytes:
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        _throttle()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (corpus harvest for RAG research)"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_exc = exc
            time.sleep(3 * (attempt + 1))
    raise last_exc if last_exc else RuntimeError("fetch failed")


def get_json(url: str):
    return json.loads(fetch(url))


def slug(title: str) -> str:
    return "".join(c if c.isalnum() or c in " -_" else "_" for c in title)[:70].strip() or "untitled"


def process(item: dict) -> str:
    uuid = item["uuid"]
    if uuid in manifest and os.path.exists(manifest[uuid].get("path", "")):
        return "skip"
    try:
        bundles = get_json(f"{BASE}/core/items/{uuid}/bundles")
        link = name = None
        for bundle in bundles["_embedded"]["bundles"]:
            if bundle["name"] != "ORIGINAL":
                continue
            bits = get_json(bundle["_links"]["bitstreams"]["href"])
            for bs in bits["_embedded"]["bitstreams"]:
                nm = bs.get("name", "")
                if nm.lower().endswith((".pdf", ".docx")):
                    link = f"{BASE}/core/bitstreams/{bs['uuid']}/content"
                    name = nm
                    break
            if link:
                break
        if not link:
            return "nofile"
        data = fetch(link)
        ext = os.path.splitext(name)[1].lower()
        import hashlib

        digest = hashlib.md5(data).hexdigest()[:8]
        path = os.path.join(OUT_DIR, f"{slug(item['title'])}_{digest}{ext}")
        if not os.path.exists(path):
            with open(path, "wb") as fh:
                fh.write(data)
        manifest[uuid] = {
            "path": os.path.relpath(path, ROOT),
            "title": item["title"],
            "date": item.get("date", ""),
            "file": name,
            "bytes": len(data),
        }
        return "ok"
    except Exception as exc:
        return f"fail:{type(exc).__name__}"


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    global manifest
    manifest = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as fh:
            manifest = json.load(fh)
    items = json.load(open(ITEMS_JSON, encoding="utf-8"))
    todo = [it for it in items if it["uuid"] not in manifest or not os.path.exists(manifest[it["uuid"]].get("path", ""))]
    print(f"items: {len(items)}, already harvested: {len(items) - len(todo)}, to do: {len(todo)}", flush=True)

    results: dict[str, int] = {}
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(process, it) for it in todo]
        for fut in as_completed(futures):
            kind = fut.result()
            results[kind] = results.get(kind, 0) + 1
            done += 1
            if done % 20 == 0:
                with open(MANIFEST, "w", encoding="utf-8") as fh:
                    json.dump(manifest, fh, indent=1)
                print(f"{done}/{len(todo)}: {results}", flush=True)

    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    print("FINAL:", results, flush=True)
    print("manifest entries:", len(manifest), flush=True)


if __name__ == "__main__":
    sys.exit(main())
