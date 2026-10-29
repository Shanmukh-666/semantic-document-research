import pytest
from services.vector_store import (
    add_chunks,
    search_chunks,
    list_indexed_documents,
    delete_document,
    reset_collection,
    get_collection_count
)


@pytest.fixture(autouse=True)
def clean_collection():
    reset_collection()
    yield
    reset_collection()


def test_add_and_search_chunks():
    chunks = [
        {
            "chunk_id": 1,
            "page_number": 1,
            "text": "Electronic Health Records use clinical NLP models to extract patient diagnosis codes.",
            "word_count": 12
        },
        {
            "chunk_id": 2,
            "page_number": 1,
            "text": "Automated cyber attack detection uses recurrent neural networks to parse firewall syslogs.",
            "word_count": 12
        }
    ]

    stored = add_chunks(chunks, "test_doc.pdf")
    assert stored == 2
    assert get_collection_count() == 2

    # Query for clinical health NLP
    results = search_chunks("medical patient diagnosis", top_k=2)
    assert len(results) >= 1
    top_match = results[0]
    assert top_match["document_name"] == "test_doc.pdf"
    assert "diagnosis" in top_match["text"].lower() or "health" in top_match["text"].lower()
    assert top_match["metric"] == "l2_distance"
    assert isinstance(top_match["distance"], float)


def test_duplicate_upload_replaces_cleanly():
    chunks_v1 = [
        {"chunk_id": 1, "page_number": 1, "text": "Version one content.", "word_count": 3}
    ]
    chunks_v2 = [
        {"chunk_id": 1, "page_number": 1, "text": "Updated version two content.", "word_count": 4},
        {"chunk_id": 2, "page_number": 1, "text": "Additional section in version two.", "word_count": 5}
    ]

    add_chunks(chunks_v1, "duplicated_paper.pdf")
    assert get_collection_count() == 1

    # Re-uploading with same document_name should replace old chunks without duplicate ID errors
    stored_v2 = add_chunks(chunks_v2, "duplicated_paper.pdf")
    assert stored_v2 == 2
    assert get_collection_count() == 2


def test_list_and_delete_documents():
    chunks_a = [{"chunk_id": 1, "page_number": 1, "text": "Document Alpha text.", "word_count": 3}]
    chunks_b = [{"chunk_id": 1, "page_number": 1, "text": "Document Beta text.", "word_count": 3}]

    add_chunks(chunks_a, "alpha.pdf")
    add_chunks(chunks_b, "beta.pdf")

    docs = list_indexed_documents()
    doc_names = [d["document_name"] for d in docs]
    assert "alpha.pdf" in doc_names
    assert "beta.pdf" in doc_names

    # Delete alpha
    success = delete_document("alpha.pdf")
    assert success is True

    remaining = list_indexed_documents()
    remaining_names = [d["document_name"] for d in remaining]
    assert "alpha.pdf" not in remaining_names
    assert "beta.pdf" in remaining_names
