"""
Build the REFERENCE index from textbooks, drug formularies, NANDA handbooks, etc.

Usage:
    python src/ingest_reference.py data/reference/*
"""
import sys
import os
import glob
import json

sys.path.insert(0, os.path.dirname(__file__))
from loaders import load_as_text
from reference_chunker import chunk_reference_text, ref_chunks_to_dicts
from retrieval import SimpleIndex

INDEX_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "reference_index.pkl")
DEBUG_JSON = os.path.join(os.path.dirname(__file__), "..", "data", "reference_chunks.json")


def main(paths):
    all_records = []
    for pattern in paths:
        for path in glob.glob(pattern):
            if os.path.isdir(path):
                continue
            print(f"Loading {path} ...")
            try:
                text = load_as_text(path)
            except Exception as e:
                print(f"  skipped ({e})")
                continue
            chunks = chunk_reference_text(text, source_name=os.path.basename(path))
            print(f"  -> {len(chunks)} chunks")
            all_records.extend(ref_chunks_to_dicts(chunks))

    if not all_records:
        print("No reference documents found. Add PDFs/docs to data/reference/ first.")
        return

    index = SimpleIndex()
    index.build(all_records)
    os.makedirs(os.path.dirname(INDEX_PATH), exist_ok=True)
    index.save(INDEX_PATH)
    with open(DEBUG_JSON, "w") as f:
        json.dump(all_records, f, indent=2)

    print(f"\nBuilt reference index with {len(all_records)} chunks -> {INDEX_PATH}")


if __name__ == "__main__":
    args = sys.argv[1:] or ["data/reference/*"]
    main(args)
