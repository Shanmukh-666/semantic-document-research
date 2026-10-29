from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from main import app
from services.vector_store import reset_collection

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_teardown():
    reset_collection()
    yield
    reset_collection()


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "version" in data


def test_upload_invalid_extension():
    fake_file = ("bad.txt", b"plain text is not supported", "text/plain")
    response = client.post("/upload", files={"file": fake_file})
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]


def test_upload_valid_pdf():
    pdf_path = DATA_DIR / "01_NLP_in_Healthcare.pdf"
    assert pdf_path.exists()

    with open(pdf_path, "rb") as f:
        response = client.post(
            "/upload",
            files={"file": (pdf_path.name, f, "application/pdf")},
            data={"chunk_size": 300, "overlap": 50}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "01_NLP_in_Healthcare.pdf"
    assert data["chunks_stored"] >= 1

    # Verify /documents lists it
    doc_res = client.get("/documents")
    assert doc_res.status_code == 200
    assert doc_res.json()["total_documents"] == 1


def test_search_endpoint():
    # First upload a sample file
    pdf_path = DATA_DIR / "01_NLP_in_Healthcare.pdf"
    with open(pdf_path, "rb") as f:
        client.post(
            "/upload",
            files={"file": (pdf_path.name, f, "application/pdf")}
        )

    # Valid search
    res = client.post("/search", json={"query": "clinical documentation EHR", "top_k": 3})
    assert res.status_code == 200
    data = res.json()
    assert len(data["results"]) >= 1
    assert data["results"][0]["metric"] == "l2_distance"

    # Empty query should return 400
    bad_res = client.post("/search", json={"query": "   ", "top_k": 3})
    assert bad_res.status_code == 400


def test_ask_endpoint_with_mocked_llm():
    pdf_path = DATA_DIR / "01_NLP_in_Healthcare.pdf"
    with open(pdf_path, "rb") as f:
        client.post(
            "/upload",
            files={"file": (pdf_path.name, f, "application/pdf")}
        )

    mock_llm_answer = (
        "NLP aids healthcare by extracting clinical data from EHRs and assisting diagnostic coding "
        "[Document: 01_NLP_in_Healthcare.pdf, Page: 1, Chunk: 1]."
    )

    with patch("main.generate_answer", return_value=mock_llm_answer):
        res = client.post("/ask", json={"query": "How is NLP used in healthcare?", "top_k": 3})
        assert res.status_code == 200
        data = res.json()
        assert data["llm_status"] == "success"
        assert "EHRs" in data["answer"]
        assert len(data["retrieved_chunks"]) >= 1
        assert len(data["sources"]) >= 1


def test_ask_endpoint_when_llm_fails_graceful_fallback():
    pdf_path = DATA_DIR / "01_NLP_in_Healthcare.pdf"
    with open(pdf_path, "rb") as f:
        client.post(
            "/upload",
            files={"file": (pdf_path.name, f, "application/pdf")}
        )

    from services.llm_service import LLMUnavailableError

    with patch("main.generate_answer", side_effect=LLMUnavailableError("API key missing")):
        res = client.post("/ask", json={"query": "clinical health question", "top_k": 3})
        assert res.status_code == 200
        data = res.json()
        assert data["llm_status"] == "unavailable"
        assert "LLM generation is currently unavailable" in data["answer"]
        # Retrieved chunks must still be returned!
        assert len(data["retrieved_chunks"]) >= 1


def test_reindex_and_delete_endpoints():
    reindex_res = client.post("/reindex?chunk_size=300&overlap=50")
    assert reindex_res.status_code == 200
    data = reindex_res.json()
    assert data["total_documents_indexed"] >= 1

    # Delete one document
    doc_to_delete = data["processed_documents"][0]["filename"]
    del_res = client.delete(f"/documents/{doc_to_delete}")
    assert del_res.status_code == 200
    assert del_res.json()["filename"] == doc_to_delete
