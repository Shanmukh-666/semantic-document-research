from pathlib import Path
from typing import List, Dict, Any, Optional
import gc
import logging
import chromadb
from chromadb.config import Settings

from services.embedding_service import generate_embeddings

logger = logging.getLogger(__name__)

# Deterministic storage path in backend directory
DB_PATH = Path(__file__).resolve().parent.parent / "chroma_db"
DB_PATH.mkdir(parents=True, exist_ok=True)

_client = None
_collection = None


def _reset_client():
    """Resets global client/collection and clears ChromaDB's internal system cache."""
    global _client, _collection
    _client = None
    _collection = None
    try:
        from chromadb.api.client import SharedSystemClient
        SharedSystemClient.clear_system_cache()
    except Exception:
        pass
    gc.collect()


def get_client(force_new: bool = False):
    """
    Returns a healthy PersistentClient instance.
    Self-heals automatically if ChromaDB's internal system has been invalidated.
    """
    global _client
    if force_new or _client is None:
        _reset_client()
        _client = chromadb.PersistentClient(
            path=str(DB_PATH),
            settings=Settings(anonymized_telemetry=False, is_persistent=True)
        )
        return _client

    # Verify existing client is responsive
    try:
        _client.heartbeat()
        return _client
    except Exception:
        logger.warning("Existing ChromaDB client failed heartbeat; reinitializing...")
        _reset_client()
        _client = chromadb.PersistentClient(
            path=str(DB_PATH),
            settings=Settings(anonymized_telemetry=False, is_persistent=True)
        )
        return _client


def get_collection(force_refresh: bool = False):
    """
    Returns a healthy documents Collection instance.
    Automatically re-initializes on system eviction or KeyError.
    """
    global _collection
    if force_refresh or _collection is None:
        client = get_client(force_new=force_refresh)
        _collection = client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "l2"}
        )
        return _collection

    # Verify collection handle is active and responding
    try:
        _ = _collection.count()
        return _collection
    except Exception:
        logger.warning("Existing ChromaDB collection handle invalid; recovering...")
        client = get_client(force_new=True)
        _collection = client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "l2"}
        )
        return _collection


def add_chunks(chunks: List[Dict[str, Any]], document_name: str) -> int:
    """
    Adds chunks to ChromaDB. Replaces existing chunks for the same document to prevent duplicate IDs.
    Features automatic recovery if vector store connection is stale.
    """
    if not chunks:
        return 0

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

    def _execute_add(col):
        try:
            col.delete(where={"document_name": document_name})
        except Exception:
            pass

        col.add(
            ids=ids,
            embeddings=embeddings.tolist(),
            documents=texts,
            metadatas=metadatas
        )

    # Attempt 1
    try:
        col = get_collection()
        _execute_add(col)
        return len(chunks)
    except Exception as first_err:
        logger.warning(f"First attempt to add chunks failed ({first_err}); retrying with fresh vector store handle...")
        # Attempt 2 with fresh client/collection
        col = get_collection(force_refresh=True)
        _execute_add(col)
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
    query_embedding = generate_embeddings([query])[0]

    def _execute_query(col):
        total_docs = col.count()
        if total_docs == 0:
            return []

        effective_k = max(1, min(top_k, total_docs, 50))
        return col.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=effective_k
        )

    try:
        col = get_collection()
        results = _execute_query(col)
    except Exception as first_err:
        logger.warning(f"Search query failed ({first_err}); retrying with fresh vector store handle...")
        col = get_collection(force_refresh=True)
        results = _execute_query(col)

    search_results: List[Dict[str, Any]] = []
    if not results or not results.get("documents") or not results["documents"][0]:
        return []

    for i in range(len(results["documents"][0])):
        dist = float(results["distances"][0][i])
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
    def _execute_list(col):
        total = col.count()
        if total == 0:
            return []
        return col.get(include=["metadatas"])

    try:
        col = get_collection()
        data = _execute_list(col)
    except Exception as first_err:
        logger.warning(f"List documents failed ({first_err}); retrying with fresh vector store handle...")
        col = get_collection(force_refresh=True)
        data = _execute_list(col)

    if not data or not data.get("metadatas"):
        return []

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
    def _execute_delete(col):
        col.delete(where={"document_name": document_name})
        return True

    try:
        col = get_collection()
        return _execute_delete(col)
    except Exception as first_err:
        logger.warning(f"Delete document failed ({first_err}); retrying with fresh handle...")
        try:
            col = get_collection(force_refresh=True)
            return _execute_delete(col)
        except Exception:
            return False


def reset_collection() -> int:
    """
    Clears all chunks from the documents collection safely.
    """
    try:
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
    except Exception:
        client = get_client(force_new=True)
        try:
            client.delete_collection("documents")
        except Exception:
            pass
        _collection = client.create_collection(
            name="documents",
            metadata={"hnsw:space": "l2"}
        )
        return 0


def get_collection_count() -> int:
    """Returns total chunks indexed in collection with auto-recovery."""
    try:
        col = get_collection()
        return col.count()
    except Exception:
        try:
            col = get_collection(force_refresh=True)
            return col.count()
        except Exception:
            return 0