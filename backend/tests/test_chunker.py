import pytest
from services.chunker import create_chunks, split_into_sentences


def test_split_into_sentences_basic():
    text = "First sentence. Second sentence! Third sentence? Fourth sentence."
    sentences = split_into_sentences(text)
    assert len(sentences) == 4
    assert sentences[0] == "First sentence."
    assert sentences[1] == "Second sentence!"
    assert sentences[2] == "Third sentence?"
    assert sentences[3] == "Fourth sentence."


def test_empty_text_and_pages():
    assert create_chunks([]) == []
    assert create_chunks([{"page_number": 1, "text": ""}]) == []
    assert create_chunks([{"page_number": 1, "text": "   \n\n\t  "}]) == []


def test_invalid_settings_validation():
    sample_pages = [{"page_number": 1, "text": "Hello world. This is a test."}]

    # chunk_size <= 0
    with pytest.raises(ValueError, match="chunk_size must be a positive integer"):
        create_chunks(sample_pages, chunk_size=0, overlap=10)

    # overlap < 0
    with pytest.raises(ValueError, match="overlap must be non-negative"):
        create_chunks(sample_pages, chunk_size=100, overlap=-5)

    # overlap >= chunk_size
    with pytest.raises(ValueError, match="overlap must be strictly less than chunk_size"):
        create_chunks(sample_pages, chunk_size=50, overlap=50)

    with pytest.raises(ValueError, match="overlap must be strictly less than chunk_size"):
        create_chunks(sample_pages, chunk_size=50, overlap=70)


def test_sentence_boundaries_and_metadata():
    text = (
        "Natural language processing is a subfield of artificial intelligence. "
        "It focuses on the interaction between computers and human language. "
        "Modern systems rely on transformer models for semantic search and retrieval."
    )
    pages = [
        {"page_number": 1, "text": text}
    ]

    chunks = create_chunks(pages, chunk_size=15, overlap=5, document_name="test_paper.pdf")
    assert len(chunks) >= 2

    # Check metadata integrity
    for chunk in chunks:
        assert chunk["page_number"] == 1
        assert "document_name" in chunk
        assert chunk["document_name"] == "test_paper.pdf"
        assert chunk["chunk_id"] >= 1
        assert chunk["word_count"] > 0
        assert len(chunk["text"].strip()) > 0


def test_long_sentence_splitting():
    # A single sentence with 80 words
    words = [f"word{i}" for i in range(80)]
    long_sentence = " ".join(words) + "."
    pages = [{"page_number": 2, "text": long_sentence}]

    chunks = create_chunks(pages, chunk_size=30, overlap=10)
    assert len(chunks) >= 3
    for chunk in chunks:
        assert chunk["page_number"] == 2
        assert chunk["word_count"] <= 35  # Bounded around max words


def test_short_trailing_chunk_merging():
    # 2 sentences: first is 25 words, second is 4 words
    s1 = "This is a detailed opening statement with enough words to establish a primary chunk for our test document."
    s2 = "Short final note."
    pages = [{"page_number": 1, "text": f"{s1} {s2}"}]

    # With chunk_size=20, first chunk emits s1, trailing s2 has only 3 words and should merge or create clean chunk
    chunks = create_chunks(pages, chunk_size=20, overlap=5)
    assert len(chunks) >= 1
    total_text = " ".join(c["text"] for c in chunks)
    assert "Short final note." in total_text
