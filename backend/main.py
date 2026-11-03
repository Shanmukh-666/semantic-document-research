import os
import tempfile
import gc
import logging
import threading
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from services.document_processor import (
    iter_text_from_pdf,
    iter_text_from_docx,
    extract_text_from_pdf,
    extract_text_from_docx,
    extract_text_from_txt
)
from services.chunker import create_chunks, iter_chunks
from services.embedding_service import _log_memory
from services.vector_store import (
    add_chunks,
    search_chunks,
    get_collection_count,
    list_indexed_documents,
    delete_document,
    reset_collection
)
from services.llm_service import generate_answer, LLMUnavailableError


app = FastAPI(
    title="Semantic Document Research",
    description="NLP-based semantic document research and retrieval-augmented question answering system",
    version="1.1.0"
)

# Permissive CORS allowing cross-origin requests from Vercel, localhost, and preview URLs
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
logger = logging.getLogger(__name__)


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        logger.warning("Invalid %s; using %s", name, default)
        return default


MAX_UPLOAD_SIZE = _env_int("MAX_UPLOAD_SIZE_MB", 10) * 1024 * 1024
MAX_PAGE_COUNT = _env_int("MAX_PAGE_COUNT", 200)
MAX_FILES_PER_REQUEST = _env_int("MAX_FILES_PER_REQUEST", 1)
MAX_CONCURRENT_INGESTIONS = _env_int("MAX_CONCURRENT_INGESTIONS", 1)
INGESTION_LIMIT = threading.BoundedSemaphore(MAX_CONCURRENT_INGESTIONS)


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural language search query")
    top_k: int = Field(default=5, ge=1, le=50, description="Number of passages to retrieve")
    distance_threshold: Optional[float] = Field(
        default=1.5,
        description="Maximum L2 distance threshold for retrieval filtering. None to disable."
    )


class AskRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Research question to ask")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of supporting passages to retrieve")
    distance_threshold: Optional[float] = Field(
        default=1.5,
        description="Maximum L2 distance threshold for retrieval filtering"
    )


@app.get("/")
@app.get("/api")
@app.get("/api/")
def root():
    return {
        "name": "Semantic Document Research API",
        "status": "online",
        "version": "1.1.0",
        "indexed_chunks": get_collection_count()
    }


@app.get("/documents")
@app.get("/api/documents")
def get_documents():
    """Returns a list of all documents currently indexed in ChromaDB."""
    documents = list_indexed_documents()
    return {
        "total_documents": len(documents),
        "total_chunks": get_collection_count(),
        "documents": documents
    }


@app.delete("/documents/{filename}")
@app.delete("/api/documents/{filename}")
def remove_document(filename: str):
    """Deletes all chunks for a document from the vector store."""
    success = delete_document(filename)
    # Also clean up disk file if present
    file_path = UPLOAD_DIR / filename
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass

    if not success:
        raise HTTPException(status_code=404, detail=f"Document '{filename}' not found in index")

    gc.collect()

    return {
        "filename": filename,
        "message": f"Document '{filename}' removed successfully",
        "remaining_chunks": get_collection_count()
    }


@app.post("/upload")
@app.post("/api/upload")
def upload_document(
    file: UploadFile = File(...),
    chunk_size: int = Form(default=300),
    overlap: int = Form(default=50)
):
    """
    Uploads, extracts, sentence-chunks, and indexes a PDF or DOCX file.
    Replaces existing records if the document was previously uploaded.
    """
    if MAX_FILES_PER_REQUEST != 1:
        logger.warning("The upload endpoint accepts one file per request; MAX_FILES_PER_REQUEST is informational.")
    if chunk_size <= 0:
        raise HTTPException(status_code=400, detail="chunk_size must be a positive integer")
    if overlap < 0 or overlap >= chunk_size:
        raise HTTPException(status_code=400, detail="overlap must be non-negative and less than chunk_size")

    filename = file.filename or "uploaded_file"
    ext = Path(filename).suffix.lower()

    supported_exts = [".pdf", ".docx"]
    if ext not in supported_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Only PDF and DOCX files are supported."
        )


    if not INGESTION_LIMIT.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Another document is being processed. Please retry shortly.")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_file:
            tmp_path = tmp_file.name
            total_bytes = 0
            while True:
                block = file.file.read(1024 * 1024)
                if not block:
                    break
                total_bytes += len(block)
                if total_bytes > MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {MAX_UPLOAD_SIZE // (1024 * 1024)} MB upload limit."
                    )
                tmp_file.write(block)
        _log_memory(f"before_ingestion:{filename}")
        page_count = 0
        text_page_count = 0

        def page_stream():
            nonlocal page_count, text_page_count
            extractor = iter_text_from_pdf if ext == ".pdf" else iter_text_from_docx
            for page in extractor(tmp_path, max_pages=MAX_PAGE_COUNT):
                page_count += 1
                if page.get("text", "").strip():
                    text_page_count += 1
                _log_memory(f"extraction_page_{page_count}:{filename}")
                yield page

        chunks_count = 0

        def chunk_stream():
            nonlocal chunks_count
            for chunk in iter_chunks(
                page_stream(),
                chunk_size=chunk_size,
                overlap=overlap,
                document_name=filename
            ):
                chunks_count += 1
                yield chunk

        stored_count = add_chunks(chunk_stream(), filename)
        _log_memory(f"after_chroma_insertion:{filename}")
        if page_count == 0 or text_page_count == 0 or chunks_count == 0:
            raise HTTPException(status_code=422, detail="No valid text chunks could be produced from this document.")
        return {
            "filename": filename,
            "file_type": ext[1:].upper(),
            "pages": page_count,
            "chunks_created": chunks_count,
            "chunks_stored": stored_count,
            "message": "Document processed and indexed successfully"
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Document processing failed: {e}")
    except Exception as e:
        logger.exception("Document processing failed for %s", filename)
        raise HTTPException(status_code=500, detail=f"Document processing failed: {e}")
    finally:
        try:
            file.file.close()
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
            gc.collect()
            _log_memory(f"after_cleanup:{filename}")
            INGESTION_LIMIT.release()


@app.post("/search")
@app.post("/api/search")
def search_documents(request: SearchRequest):
    """
    Performs semantic vector search across all indexed document chunks.
    Returns matching chunks with document metadata and L2 vector distances.
    """
    clean_query = request.query.strip()
    if not clean_query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty")

    results = search_chunks(
        query=clean_query,
        top_k=request.top_k,
        distance_threshold=request.distance_threshold
    )

    return {
        "query": clean_query,
        "total_results": len(results),
        "results": results
    }


@app.post("/ask")
@app.post("/api/ask")
def ask_question(request: AskRequest):
    """
    Answers a research question grounded in retrieved semantic context.
    If LLM generation fails or is unconfigured, semantic search passages are still returned.
    """
    clean_query = request.query.strip()
    if not clean_query:
        raise HTTPException(status_code=400, detail="Question query cannot be empty")

    results = search_chunks(
        query=clean_query,
        top_k=request.top_k,
        distance_threshold=request.distance_threshold
    )

    if not results:
        return {
            "question": clean_query,
            "answer": "No relevant information was found in the indexed documents for this query.",
            "llm_status": "no_context",
            "llm_error": None,
            "retrieved_chunks": [],
            "sources": []
        }

    # Attempt LLM answer generation
    llm_status = "success"
    llm_error = None
    try:
        answer = generate_answer(clean_query, results)
    except LLMUnavailableError as e:
        llm_status = "unavailable"
        llm_error = str(e)
        answer = (
            "LLM generation is currently unavailable. However, relevant document passages "
            "were successfully retrieved below for your review."
        )
    except Exception as e:
        llm_status = "error"
        llm_error = str(e)
        answer = (
            "An error occurred while generating the answer with the LLM provider. "
            "Relevant document evidence has been retrieved below."
        )

    retrieved_chunks = []
    sources = []

    for chunk in results:
        chunk_entry = {
            "document_name": chunk["document_name"],
            "page_number": chunk["page_number"],
            "chunk_id": chunk["chunk_id"],
            "distance": chunk["distance"],
            "metric": chunk.get("metric", "l2_distance"),
            "text": chunk["text"]
        }
        retrieved_chunks.append(chunk_entry)
        sources.append({
            "document_name": chunk["document_name"],
            "page_number": chunk["page_number"],
            "chunk_id": chunk["chunk_id"]
        })

    return {
        "question": clean_query,
        "answer": answer,
        "llm_status": llm_status,
        "llm_error": llm_error,
        "retrieved_chunks": retrieved_chunks,
        "sources": sources
    }


def index_all_disk_documents(
    chunk_size: int = 300,
    overlap: int = 50,
    clear_existing: bool = False
):
    """
    Scans data/ and uploads/ folders, parses PDFs and DOCX files,
    creates sentence-aware chunks, and persists them into ChromaDB.
    """
    if clear_existing:
        reset_collection()

    processed = []
    errors = []

    # Check backend/data/, root data/, and backend/uploads/
    candidate_dirs = [
        BASE_DIR / "data",
        BASE_DIR.parent / "data",
        UPLOAD_DIR
    ]

    seen_files = set()

    for folder in candidate_dirs:
        if not folder.exists():
            continue
        for file_path in folder.iterdir():
            if file_path.suffix.lower() in [".pdf", ".docx"] and file_path.name not in seen_files:
                seen_files.add(file_path.name)
                try:
                    ext = file_path.suffix.lower()
                    if ext == ".pdf":
                        pages = extract_text_from_pdf(str(file_path))
                    else:
                        pages = extract_text_from_docx(str(file_path))



                    if not pages or not any(p.get("text", "").strip() for p in pages):
                        continue

                    chunks = create_chunks(
                        pages,
                        chunk_size=chunk_size,
                        overlap=overlap,
                        document_name=file_path.name
                    )

                    if chunks:
                        stored = add_chunks(chunks, file_path.name)
                        processed.append({
                            "filename": file_path.name,
                            "chunks": stored,
                            "pages": len(pages)
                        })
                except Exception as e:
                    errors.append({"filename": file_path.name, "error": str(e)})

    return processed, errors


@app.on_event("startup")
def startup_event():
    """
    Server startup handler.
    Starts with a clean slate; sample documents are not automatically indexed by default.
    """
    _log_memory("startup_before_model_load")
    logger.info(
        "Semantic Document Research API started; memory stage=before_model_load "
        "limits upload_mb=%s pages=%s concurrency=%s",
        MAX_UPLOAD_SIZE // (1024 * 1024), MAX_PAGE_COUNT, MAX_CONCURRENT_INGESTIONS
    )


@app.post("/documents/clear")
@app.post("/api/documents/clear")
def clear_all_documents():
    """
    Safely clears all documents and chunks from the ChromaDB vector store.
    """
    reset_collection()
    return {
        "message": "All documents and chunks have been cleared successfully",
        "total_documents": 0,
        "total_chunks": 0
    }




@app.post("/reindex")
@app.post("/api/reindex")
def reindex_all_documents(
    chunk_size: int = Query(default=300),
    overlap: int = Query(default=50)
):
    """
    Safely clears the existing ChromaDB index and re-chunks/re-embeds all files in uploads/ and data/.
    Prevents mixing old and new embeddings when chunking settings change.
    """
    processed, errors = index_all_disk_documents(
        chunk_size=chunk_size,
        overlap=overlap,
        clear_existing=True
    )

    return {
        "message": "Re-indexing completed",
        "total_documents_indexed": len(processed),
        "total_chunks_stored": get_collection_count(),
        "processed_documents": processed,
        "errors": errors
    }


@app.get("/debug/chroma")
def debug_chroma():
    return {
        "total_chunks": get_collection_count(),
        "documents": list_indexed_documents()
    }


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)