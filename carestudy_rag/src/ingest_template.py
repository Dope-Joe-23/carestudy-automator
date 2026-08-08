"""
Build the TEMPLATE index from one or more past care-study documents.

Usage:
    python src/ingest_template.py data/templates/*.doc
"""
import sys
import os
import glob
import json

sys.path.insert(0, os.path.dirname(__file__))
from loaders import load_as_text
from chunker import chunk_document, chunks_to_dicts
from retrieval import SimpleIndex

INDEX_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "template_index.pkl")
DEBUG_JSON = os.path.join(os.path.dirname(__file__), "..", "data", "template_chunks.json")


def main(paths):
    all_records = []
    for pattern in paths:
        for path in glob.glob(pattern):
            print(f"Loading {path} ...")
            text = load_as_text(path)
            chunks = chunk_document(text, source_name=os.path.basename(path))
            print(f"  -> {len(chunks)} chunks")
            all_records.extend(chunks_to_dicts(chunks))

    if not all_records:
        print("No documents found. Put past care-study files in data/templates/ first.")
        return

    index = SimpleIndex()
    index.build(all_records)
    os.makedirs(os.path.dirname(INDEX_PATH), exist_ok=True)
    index.save(INDEX_PATH)
    with open(DEBUG_JSON, "w") as f:
        json.dump(all_records, f, indent=2)

    print(f"\nBuilt template index with {len(all_records)} chunks -> {INDEX_PATH}")


if __name__ == "__main__":
    args = sys.argv[1:] or ["data/templates/*"]
    main(args)
