"""
Convert various document formats to plain text.
Supports: .doc, .docx, .pdf, .txt
"""
import subprocess
import tempfile
import os


def load_as_text(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()

    if ext == ".txt":
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    if ext == ".docx":
        import docx
        doc = docx.Document(path)
        return "\n".join(p.text for p in doc.paragraphs)

    if ext == ".doc":
        # Legacy binary Word format - needs LibreOffice to convert
        with tempfile.TemporaryDirectory() as tmpdir:
            subprocess.run(
                ["soffice", "--headless", "--convert-to", "txt:Text", path,
                 "--outdir", tmpdir],
                check=True, capture_output=True, timeout=120
            )
            out_name = os.path.splitext(os.path.basename(path))[0] + ".txt"
            out_path = os.path.join(tmpdir, out_name)
            with open(out_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()

    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    raise ValueError(f"Unsupported file type: {ext}")
