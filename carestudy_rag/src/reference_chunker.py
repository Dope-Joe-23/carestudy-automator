"""
Generic paragraph-based chunker for reference material (textbooks, formularies).
Unlike chunker.py (which relies on the care-study's numbered-heading structure),
this just splits on blank lines and regroups into ~400-word chunks with overlap.
"""
from typing import List
from dataclasses import dataclass, asdict


@dataclass
class RefChunk:
    text: str
    heading: str
    source: str


def chunk_reference_text(text: str, source_name: str, target_words: int = 350, overlap_words: int = 50) -> List[RefChunk]:
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    chunks = []
    buffer_words = []
    for para in paragraphs:
        words = para.split()
        buffer_words.extend(words)
        if len(buffer_words) >= target_words:
            chunk_text = " ".join(buffer_words)
            chunks.append(RefChunk(text=chunk_text, heading=chunk_text[:60] + "...", source=source_name))
            # keep overlap for continuity
            buffer_words = buffer_words[-overlap_words:]
    if buffer_words:
        chunk_text = " ".join(buffer_words)
        chunks.append(RefChunk(text=chunk_text, heading=chunk_text[:60] + "...", source=source_name))
    return chunks


def ref_chunks_to_dicts(chunks: List[RefChunk]):
    return [asdict(c) for c in chunks]
