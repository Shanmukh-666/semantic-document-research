from pathlib import Path
import pytest
from services.document_processor import extract_text_from_pdf, extract_text_from_docx
from services.chunker import create_chunks
from services.vector_store import add_chunks, search_chunks, reset_collection

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


@pytest.fixture(scope="module", autouse=True)
def index_sample_documents():
    """
    Indexes the 5 official sample documents from data/ before running the benchmark.
    """
    reset_collection()

    files = [
        "01_NLP_in_Healthcare.pdf",
        "02_NLP_in_Education.docx",
        "03_NLP_for_Cybersecurity.pdf",
        "04_NLP_for_Finance.docx",
        "05_NLP_for_Climate_Research.pdf"
    ]

    for fname in files:
        fpath = DATA_DIR / fname
        if not fpath.exists():
            continue
        ext = fpath.suffix.lower()
        if ext == ".pdf":
            pages = extract_text_from_pdf(str(fpath))
        else:
            pages = extract_text_from_docx(str(fpath))

        chunks = create_chunks(pages, chunk_size=300, overlap=50, document_name=fname)
        add_chunks(chunks, fname)

    yield
    reset_collection()


def test_retrieval_benchmark_precision_recall():
    """
    Evaluates semantic retrieval performance (Precision@1, Recall@1, Precision@3)
    across a labeled test set of technical domain queries.
    """
    labeled_queries = [
        {
            "query": "clinical decision support electronic health records patient medical coding",
            "target": "01_NLP_in_Healthcare.pdf",
            "domain": "Healthcare"
        },
        {
            "query": "personalized student learning feedback and automated essay scoring in schools",
            "target": "02_NLP_in_Education.docx",
            "domain": "Education"
        },
        {
            "query": "phishing email detection network security log analysis and malware classification",
            "target": "03_NLP_for_Cybersecurity.pdf",
            "domain": "Cybersecurity"
        },
        {
            "query": "financial market sentiment analysis fraud detection and algorithmic earnings report parsing",
            "target": "04_NLP_for_Finance.docx",
            "domain": "Finance"
        },
        {
            "query": "climate change mitigation greenhouse gas disclosures and carbon emissions tracking",
            "target": "05_NLP_for_Climate_Research.pdf",
            "domain": "Climate Research"
        }
    ]

    top_1_hits = 0
    top_3_hits = 0
    total_queries = len(labeled_queries)

    print("\n--- RETRIEVAL EVALUATION REPORT ---")

    for item in labeled_queries:
        results = search_chunks(item["query"], top_k=3, distance_threshold=None)
        assert len(results) > 0, f"No results retrieved for query: {item['query']}"

        retrieved_docs = [r["document_name"] for r in results]
        rank_1_doc = retrieved_docs[0]
        rank_1_dist = results[0]["distance"]

        is_top_1 = rank_1_doc == item["target"]
        is_top_3 = item["target"] in retrieved_docs

        if is_top_1:
            top_1_hits += 1
        if is_top_3:
            top_3_hits += 1

        print(
            f"Domain: {item['domain']:<18} | Target: {item['target']} | "
            f"Rank 1: {rank_1_doc} (L2={rank_1_dist:.4f}) | Hit@1: {is_top_1} | Hit@3: {is_top_3}"
        )

    precision_at_1 = top_1_hits / total_queries
    recall_at_3 = top_3_hits / total_queries

    print(f"Overall Precision@1 (Recall@1): {precision_at_1 * 100:.1f}%")
    print(f"Overall Recall@3: {recall_at_3 * 100:.1f}%\n")

    # Assert expected baseline performance on known-topic queries
    assert precision_at_1 >= 0.8, f"Precision@1 ({precision_at_1}) fell below 80% baseline"
    assert recall_at_3 == 1.0, f"Recall@3 ({recall_at_3}) should be 100% on domain queries"


def test_retrieval_out_of_domain_query_has_high_distance():
    """
    Tests that an unsupported topic (no evidence) yields high L2 distance or is filtered out.
    """
    unrelated_query = "quantum mechanical wave function superposition and gravitational spacetime singularities"
    filtered_results = search_chunks(unrelated_query, top_k=5, distance_threshold=0.8)
    # With a strict threshold, no chunk should match
    assert len(filtered_results) == 0

    # Without threshold, retrieved chunk distance should be noticeably higher than exact matches
    raw_results = search_chunks(unrelated_query, top_k=5, distance_threshold=None)
    assert len(raw_results) > 0
    assert raw_results[0]["distance"] > 0.95
