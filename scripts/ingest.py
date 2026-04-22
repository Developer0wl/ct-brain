"""
C&T Brain — Document Ingestion CLI

Usage:
  python ingest.py --file path/to/doc.pdf
  python ingest.py --file path/to/doc.docx
  python ingest.py --file path/to/doc.txt
  python ingest.py --dir path/to/folder/   # ingest all supported files in a directory

Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY from .env
"""

import argparse
import os
import sys
import time
import uuid
from pathlib import Path

# Ensure UTF-8 output on Windows (avoids charmap codec errors)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

import google.generativeai as genai
from supabase import create_client

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
GEMINI_API_KEY = os.environ['GEMINI_API_KEY']

genai.configure(api_key=GEMINI_API_KEY)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

CHUNK_SIZE = 500   # words per chunk
OVERLAP = 50       # words of overlap between chunks
EMBED_MODEL = 'models/gemini-embedding-001'  # 3072 dimensions
SUPPORTED_EXTENSIONS = {'.pdf', '.docx', '.txt'}


def extract_text_from_pdf(path: Path) -> str:
    import fitz  # pymupdf
    doc = fitz.open(str(path))
    pages = [page.get_text() for page in doc]
    return '\n\n'.join(pages)


def extract_text_from_docx(path: Path) -> str:
    from docx import Document
    doc = Document(str(path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return '\n\n'.join(paragraphs)


def extract_text_from_txt(path: Path) -> str:
    return path.read_text(encoding='utf-8', errors='replace')


def extract_text(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == '.pdf':
        return extract_text_from_pdf(path)
    elif ext == '.docx':
        return extract_text_from_docx(path)
    elif ext == '.txt':
        return extract_text_from_txt(path)
    else:
        raise ValueError(f'Unsupported file type: {ext}')


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = OVERLAP) -> list[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = ' '.join(words[i:i + chunk_size])
        if len(chunk.strip()) > 20:
            chunks.append(chunk.strip())
        i += chunk_size - overlap
        if i + chunk_size >= len(words) and i < len(words):
            chunk = ' '.join(words[i:])
            if len(chunk.strip()) > 20:
                chunks.append(chunk.strip())
            break
    return chunks


def embed_single(text: str) -> list[float]:
    """Embed a single text chunk using Gemini text-embedding-004."""
    result = genai.embed_content(
        model=EMBED_MODEL,
        content=text[:8000],
        task_type='retrieval_document',
    )
    return result['embedding']


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed texts in small batches, respecting Gemini rate limits."""
    embeddings = []
    batch_size = 5  # conservative to avoid rate limits
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        for text in batch:
            embeddings.append(embed_single(text))
        if i + batch_size < len(texts):
            time.sleep(0.5)  # brief pause between batches
        print(f'  -> Embedded {min(i + batch_size, len(texts))}/{len(texts)} chunks...', end='\r')
    print()
    return embeddings


def ingest_file(path: Path, dry_run: bool = False) -> None:
    print(f'\n[FILE] Ingesting: {path.name}')

    text = extract_text(path)
    if not text.strip():
        print(f'  [SKIP] No text found in {path.name}, skipping.')
        return

    chunks = chunk_text(text)
    print(f'  -> {len(chunks)} chunks created')

    if dry_run:
        for i, c in enumerate(chunks[:3]):
            print(f'  [chunk {i+1}] {c[:120]}...')
        print(f'  (dry run -- not saving to Supabase)')
        return

    print(f'  -> Embedding {len(chunks)} chunks via Gemini gemini-embedding-001...')
    embeddings = embed_batch(chunks)

    source_id = str(uuid.uuid4())
    ext = path.suffix.lstrip('.').lower()

    # Insert source record
    supabase.table('knowledge_sources').insert({
        'id': source_id,
        'name': path.name,
        'type': ext,
        'size_bytes': path.stat().st_size,
        'chunk_count': len(chunks),
    }).execute()

    # Insert chunks in batches
    rows = [
        {
            'id': str(uuid.uuid4()),
            'source_name': path.name,
            'source_type': ext,
            'title': f'{path.stem} - chunk {i + 1}',
            'content': chunk,
            'embedding': embedding,
            'metadata': {'source_id': source_id},
        }
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]

    batch_size = 50
    for i in range(0, len(rows), batch_size):
        supabase.table('knowledge_chunks').insert(rows[i:i + batch_size]).execute()

    print(f'  [OK] Saved {len(chunks)} chunks from {path.name}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Ingest documents into C&T Brain knowledge base')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--file', type=Path, help='Single file to ingest (.pdf, .docx, .txt)')
    group.add_argument('--dir', type=Path, help='Directory of files to ingest')
    parser.add_argument('--dry-run', action='store_true', help='Preview chunks without saving')
    args = parser.parse_args()

    if args.file:
        if not args.file.exists():
            print(f'Error: File not found: {args.file}')
            sys.exit(1)
        if args.file.suffix.lower() not in SUPPORTED_EXTENSIONS:
            print(f'Error: Unsupported file type. Supported: {", ".join(SUPPORTED_EXTENSIONS)}')
            sys.exit(1)
        ingest_file(args.file, dry_run=args.dry_run)

    elif args.dir:
        if not args.dir.is_dir():
            print(f'Error: Not a directory: {args.dir}')
            sys.exit(1)
        files = [f for f in args.dir.iterdir() if f.suffix.lower() in SUPPORTED_EXTENSIONS]
        if not files:
            print(f'No supported files found in {args.dir}')
            sys.exit(1)
        print(f'Found {len(files)} files to ingest...')
        for f in sorted(files):
            ingest_file(f, dry_run=args.dry_run)

    print('\nIngestion complete.')


if __name__ == '__main__':
    main()
