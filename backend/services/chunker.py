import re
from typing import List, Dict, Any, Optional


def split_into_sentences(text: str) -> List[str]:
    """
    Splits text into sentences while respecting common punctuation and sentence boundaries.
    Normalizes excessive whitespace within sentences.
    """
    if not text:
        return []

    # First split paragraphs by double or multiple newlines
    paragraphs = [p.strip() for p in re.split(r'\n+', text) if p.strip()]
    sentences: List[str] = []

    for p in paragraphs:
        # Regex to split on sentence terminators (. ! ?) followed by whitespace and uppercase/number
        raw_sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9"\'\(\[])', p)
        for s in raw_sentences:
            s_clean = re.sub(r'\s+', ' ', s).strip()
            if s_clean:
                sentences.append(s_clean)

    return sentences


def create_chunks(
    pages: List[Dict[str, Any]],
    chunk_size: int = 300,
    overlap: int = 50,
    document_name: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Sentence and paragraph-aware text chunking.

    Parameters:
    - pages: List of dicts with 'page_number' and 'text'.
    - chunk_size: Approximate maximum number of words per chunk.
    - overlap: Number of words to overlap between consecutive chunks.
    - document_name: Optional filename/identifier to preserve in chunk metadata.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer")
    if overlap < 0:
        raise ValueError("overlap must be non-negative")
    if overlap >= chunk_size:
        raise ValueError("overlap must be strictly less than chunk_size")

    all_chunks: List[Dict[str, Any]] = []
    chunk_id = 1

    for page in pages:
        page_num = page.get("page_number", 1)
        raw_text = page.get("text", "")
        if not raw_text or not raw_text.strip():
            continue

        sentences = split_into_sentences(raw_text)
        if not sentences:
            continue

        # Break oversized sentences that exceed chunk_size into word-bounded segments
        sentence_units: List[str] = []
        for s in sentences:
            words = s.split()
            if not words:
                continue
            if len(words) > chunk_size:
                step = max(1, chunk_size - overlap)
                for start_w in range(0, len(words), step):
                    sub_words = words[start_w : start_w + chunk_size]
                    if sub_words:
                        sentence_units.append(" ".join(sub_words))
            else:
                sentence_units.append(s)

        current_sentences: List[str] = []
        current_words = 0

        i = 0
        while i < len(sentence_units):
            s = sentence_units[i]
            s_words = len(s.split())

            if current_words + s_words <= chunk_size or not current_sentences:
                current_sentences.append(s)
                current_words += s_words
                i += 1
            else:
                # Emit current chunk
                chunk_text = " ".join(current_sentences).strip()
                if chunk_text:
                    chunk_obj: Dict[str, Any] = {
                        "chunk_id": chunk_id,
                        "page_number": page_num,
                        "text": chunk_text,
                        "word_count": len(chunk_text.split())
                    }
                    if document_name:
                        chunk_obj["document_name"] = document_name
                    all_chunks.append(chunk_obj)
                    chunk_id += 1

                # Calculate overlap: take trailing sentences that fit within overlap limit
                overlap_sentences: List[str] = []
                overlap_words = 0
                for prev_s in reversed(current_sentences):
                    pw = len(prev_s.split())
                    if overlap_words + pw <= overlap:
                        overlap_sentences.insert(0, prev_s)
                        overlap_words += pw
                    else:
                        break

                current_sentences = list(overlap_sentences)
                current_words = overlap_words

        # Handle remaining sentences for this page
        if current_sentences:
            chunk_text = " ".join(current_sentences).strip()
            word_count = len(chunk_text.split())
            # If trailing chunk is very short (< 25 words) and there is a preceding chunk on same page
            if (
                word_count < 25
                and all_chunks
                and all_chunks[-1]["page_number"] == page_num
                and all_chunks[-1]["word_count"] + word_count <= int(chunk_size * 1.3)
            ):
                all_chunks[-1]["text"] += " " + chunk_text
                all_chunks[-1]["word_count"] += word_count
            else:
                chunk_obj = {
                    "chunk_id": chunk_id,
                    "page_number": page_num,
                    "text": chunk_text,
                    "word_count": word_count
                }
                if document_name:
                    chunk_obj["document_name"] = document_name
                all_chunks.append(chunk_obj)
                chunk_id += 1

    return all_chunks