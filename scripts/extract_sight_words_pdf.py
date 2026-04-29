#!/usr/bin/env python3
"""Extract sight words from PDF text + table structures using pdfplumber.

Usage:
  python scripts/extract_sight_words_pdf.py /path/to/file.pdf
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pdfplumber

WORD_PATTERN = re.compile(r"[A-Za-z']+")
CJK_PATTERN = re.compile(r"[\u3400-\u9FFF]")


def normalize_word(token: str) -> str:
    return token.strip().lower()


def extract_words_from_cell(cell: str) -> list[str]:
    if not cell:
        return []

    words: list[str] = []
    words.extend(WORD_PATTERN.findall(cell))
    words.extend(CJK_PATTERN.findall(cell))
    return [normalize_word(w) for w in words if w and normalize_word(w)]


def extract_sight_words(pdf_path: Path) -> list[str]:
    unique_words: set[str] = set()

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            print(f"--- PAGE {i + 1} ---")

            # 1) Extract table data (word grids, worksheet boxes, etc.)
            tables = page.extract_tables() or []
            for table in tables:
                flattened = [cell for row in table for cell in (row or []) if cell]
                table_words: list[str] = []
                for cell in flattened:
                    table_words.extend(extract_words_from_cell(cell))

                if table_words:
                    print(f"Table Data: {table_words}")
                    unique_words.update(table_words)

            # 2) Extract plain text lines
            text = page.extract_text() or ""
            if text:
                text_words = extract_words_from_cell(text)
                if text_words:
                    print(f"Text Content: {text[:300]}{'...' if len(text) > 300 else ''}")
                    unique_words.update(text_words)

    return sorted(unique_words)


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/extract_sight_words_pdf.py /path/to/file.pdf")
        return 1

    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    if not pdf_path.exists():
        print(f"File not found: {pdf_path}")
        return 1

    words = extract_sight_words(pdf_path)
    print("\n=== UNIQUE SIGHT WORDS ===")
    print(words)
    print(f"Total: {len(words)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
