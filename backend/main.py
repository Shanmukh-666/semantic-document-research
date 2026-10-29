from pathlib import Path
from typing import Optional, List
import shutil

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from services.document_processor import (
    extract_text_from_pdf,
    extract_text_from_docx
)
from services.chunker import create_chunks
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

# Enable CORS for local React/Vite development and general web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


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
def root():
    return {
        "name": "Semantic Document Research API",
        "status": "online",
        "version": "1.1.0",
        "indexed_chunks": get_collection_count()
    }


@app.get("/documents")
def get_documents():
    """Returns a list of all documents currently indexed in ChromaDB."""
    documents = list_indexed_documents()
    return {
        "total_documents": len(documents),
        "total_chunks": get_collection_count(),
        "documents": documents
    }


@app.delete("/documents/{filename}")
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

    return {
        "filename": filename,
        "message": f"Document '{filename}' removed successfully",
        "remaining_chunks": get_collection_count()
    }


@app.post("/upload")
def upload_document(
    file: UploadFile = File(...),
    chunk_size: int = Form(default=300),
    overlap: int = Form(default=50)
):
    """
    Uploads, extracts, sentence-chunks, and indexes a PDF or DOCX file.
    Replaces existing records if the document was previously uploaded.
    """
    if chunk_size <= 0:
        raise HTTPException(status_code=400, detail="chunk_size must be a positive integer")
    if overlap < 0 or overlap >= chunk_size:
        raise HTTPException(status_code=400, detail="overlap must be non-negative and less than chunk_size")

    filename = file.filename or "uploaded_file"
    ext = Path(filename).suffix.lower()

    if ext not in [".pdf", ".docx"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Only PDF and DOCX files are supported."
        )

    file_path = UPLOAD_DIR / filename

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    # Extract text per page
    try:
        if ext == ".pdf":
            pages = extract_text_from_pdf(str(file_path))
        else:
            pages = extract_text_from_docx(str(file_path))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Text extraction failed: {str(e)}")

    if not pages or not any(p.get("text", "").strip() for p in pages):
        raise HTTPException(
            status_code=422,
            detail="The document was processed, but no extractable text was found."
        )

    # Sentence/paragraph aware chunking
    try:
        chunks = create_chunks(
            pages,
            chunk_size=chunk_size,
            overlap=overlap,
            document_name=filename
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Chunking failed: {str(e)}")

    if not chunks:
        raise HTTPException(
            status_code=422,
            detail="No valid text chunks could be produced from this document."
        )

    # Store in ChromaDB
    try:
        stored_count = add_chunks(chunks, filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store chunks in vector store: {str(e)}")

    return {
        "filename": filename,
        "file_type": ext[1:].upper(),
        "pages": len(pages),
        "chunks_created": len(chunks),
        "chunks_stored": stored_count,
        "message": "Document processed and indexed successfully"
    }


@app.post("/search")
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


@app.post("/reindex")
def reindex_all_documents(
    chunk_size: int = Query(default=300),
    overlap: int = Query(default=50)
):
    """
    Safely clears the existing ChromaDB index and re-chunks/re-embeds all files in uploads/ and data/.
    Prevents mixing old and new embeddings when chunking settings change.
    """
    reset_collection()

    processed = []
    errors = []

    # Check both data/ and backend/uploads/
    candidate_dirs = [
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