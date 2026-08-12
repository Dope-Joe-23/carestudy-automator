"""
Lightweight retrieval index using TF-IDF (no model downloads required).

Two separate indexes are kept:
  - template index: past care-study chunks, retrieved by chapter/subsection match
  - reference index: textbook/formulary chunks, retrieved by free-text topic query

Swap in real embeddings later (e.g. voyage/sentence-transformers) by replacing
the vectorizer + similarity function if retrieval quality needs to improve.
"""
import json
import os
import pickle
from dataclasses import dataclass
from typing import List

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class RetrievedChunk:
    text: str
    heading: str
    source: str
    score: float
    # Optional pre-computed citation ({label, inText, url}) baked in at ingest
    # time (e.g. personal-library sources whose metadata the user supplied).
    citation: dict | None = None


class SimpleIndex:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(stop_words="english", max_features=20000)
        self.matrix = None
        self.records = []  # list of dicts: text, heading, source, (chapter optional)

    def build(self, records: List[dict]):
        self.records = records
        texts = [r["text"] for r in records]
        self.matrix = self.vectorizer.fit_transform(texts)

    def query(self, text: str, k: int = 4, chapter_filter: str = None) -> List[RetrievedChunk]:
        if self.matrix is None or len(self.records) == 0:
            return []
        qvec = self.vectorizer.transform([text])
        sims = cosine_similarity(qvec, self.matrix)[0]

        candidates = list(enumerate(sims))
        if chapter_filter:
            candidates = [
                (i, s) for i, s in candidates
                if chapter_filter.lower() in self.records[i].get("chapter", "").lower()
            ]
        candidates.sort(key=lambda x: x[1], reverse=True)

        results = []
        for i, score in candidates[:k]:
            r = self.records[i]
            results.append(RetrievedChunk(
                text=r["text"], heading=r.get("heading", ""),
                source=r.get("source", ""), score=float(score),
                citation=r.get("citation"),
            ))
        return results

    def save(self, path: str):
        with open(path, "wb") as f:
            pickle.dump({"vectorizer": self.vectorizer, "matrix": self.matrix,
                         "records": self.records}, f)

    def load(self, path: str):
        with open(path, "rb") as f:
            data = pickle.load(f)
        self.vectorizer = data["vectorizer"]
        self.matrix = data["matrix"]
        self.records = data["records"]
        return self
