from pathlib import Path
from typing import List, Dict, Any, Optional
import chromadb

from services.embedding_service import generate_embeddings

# Deterministic storage path in backend directory
DB_PATH = Path(__file__).resolve().parent.parent / "chroma_db"
DB_PATH.mkdir(parents=True, exist_ok=True)

_client = None
_collection = None


def get_client():
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=str(DB_PATH))
    return _client


def get_collection(force_refresh: bool = False):
    global _collection
    client = get_client()
    if force_refresh or _collection is None:
        _collection = client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "l2"}
        )
        return _collection

    # Verify existing handle is still valid on disk
    try:
        _ = _collection.count()
    except Exception:
        _collection = client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "l2"}
        )
    return _collection


def add_chunks(chunks: List[Dict[str, Any]], document_name: str) -> int:
    """
    Adds chunks to ChromaDB. Replaces existing chunks for the same document to prevent duplicate IDs.
    """
    if not chunks:
        return 0

    col = get_collection()

    # Remove existing chunks for this document if previously uploaded
    try:
        col.delete(where={"document_name": document_name})
    except Exception:
        pass

    texts = [chunk["text"] for chunk in chunks]
    embeddings = generate_embeddings(texts)

    ids: List[str] = []
    metadatas: List[Dict[str, Any]] = []

    for chunk in chunks:
        chunk_id = f"{document_name}_{chunk['chunk_id']}"
        ids.append(chunk_id)
        metadatas.append({
            "document_name": document_name,
            "page_number": int(chunk.get("page_number", 1)),
            "chunk_id": int(chunk.get("chunk_id", 0)),
            "word_count": int(chunk.get("word_count", len(chunk["text"].split())))
        })

    col.add(
        ids=ids,
        embeddings=embeddings.tolist(),
        documents=texts,
        metadatas=metadatas
    )

    return len(chunks)


def search_chunks(
    query: str,
    top_k: int = 5,
    distance_threshold: Optional[float] = 1.5
) -> List[Dict[str, Any]]:
    """
    Performs semantic similarity search over stored document chunks.
    Labels raw L2 distance explicitly; does not fabricate probability percentages.
    """
    col = get_collection()
    total_docs = col.count()
    if total_docs == 0:
        return []

    # Clamp top_k to sensible bounds
    effective_k = max(1, min(top_k, total_docs, 50))

    query_embedding = generate_embeddings([query])[0]

    results = col.query(
        query_embeddings=[query_embedding.tolist()],
        n_results=effective_k
    )

    search_results: List[Dict[str, Any]] = []
    if not results or not results.get("documents") or not results["documents"][0]:
        return []

    for i in range(len(results["documents"][0])):
        dist = float(results["distances"][0][i])
        # Only apply threshold if specified
        if distance_threshold is None or dist <= distance_threshold:
            meta = results["metadatas"][0][i]
            search_results.append({
                "document_name": meta.get("document_name", "Unknown"),
                "page_number": meta.get("page_number", 1),
                "chunk_id": meta.get("chunk_id", i + 1),
                "text": results["documents"][0][i],
                "word_count": meta.get("word_count", len(results["documents"][0][i].split())),
                "distance": round(dist, 4),
                "metric": "l2_distance"
            })

    return search_results


def list_indexed_documents() -> List[Dict[str, Any]]:
    """
    Retrieves summary of all distinct documents currently indexed in ChromaDB.
    """
    col = get_collection()
    total = col.count()
    if total == 0:
        return []

    data = col.get(include=["metadatas"])
    doc_map: Dict[str, Dict[str, Any]] = {}

    for meta in data.get("metadatas", []):
        dname = meta.get("document_name", "Unknown")
        pnum = meta.get("page_number", 1)
        if dname not in doc_map:
            doc_map[dname] = {
                "document_name": dname,
                "chunks": 0,
                "pages": set()
            }
        doc_map[dname]["chunks"] += 1
        doc_map[dname]["pages"].add(pnum)

    summary = []
    for dname, info in doc_map.items():
        summary.append({
            "document_name": dname,
            "chunk_count": info["chunks"],
            "page_count": len(info["pages"])
        })

    return sorted(summary, key=lambda x: x["document_name"])


def delete_document(document_name: str) -> bool:
    """
    Deletes all chunks associated with a specific document.
    """
    col = get_collection()
    try:
        col.delete(where={"document_name": document_name})
        return True
    except Exception:
        return False


def reset_collection() -> int:
    """
    Clears all chunks from the documents collection safely.
    """
    client = get_client()
    try:
        client.delete_collection("documents")
    except Exception:
        pass
    global _collection
    _collection = client.create_collection(
        name="documents",
        metadata={"hnsw:space": "l2"}
    )
    return 0


def get_collection_count() -> int:
    col = get_collection()
    return col.count()