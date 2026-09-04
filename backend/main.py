from fastapi import FastAPI, UploadFile, File, HTTPException
from pathlib import Path
from pydantic import BaseModel
import shutil

from services.document_processor import (
    extract_text_from_pdf,
    extract_text_from_docx
)
from services.chunker import create_chunks
from services.vector_store import add_chunks, search_chunks, get_collection_count
from services.llm_service import generate_answer


app = FastAPI(
    title="Semantic Document Research",
    description="NLP-based semantic document research system",
    version="1.0.0"
)


UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


@app.get("/")
def root():
    return {
        "message": "Semantic Document Research API is running"
    }


@app.post("/upload")
def upload_document(file: UploadFile = File(...)):

    allowed_types = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only PDF and DOCX files are allowed"
        )

    file_path = UPLOAD_DIR / file.filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if file.content_type == "application/pdf":
        pages = extract_text_from_pdf(str(file_path))
    else:
        pages = extract_text_from_docx(str(file_path))

    chunks = create_chunks(pages)

    stored_chunks = add_chunks(
        chunks,
        file.filename
    )

    return {
        "filename": file.filename,
        "file_type": file.content_type,
        "pages": len(pages),
        "chunks_created": len(chunks),
        "chunks_stored": stored_chunks,
        "message": "Document processed and stored successfully"
    }


@app.post("/search")
def search_documents(request: SearchRequest):

    results = search_chunks(
        request.query,
        request.top_k
    )

    return {
        "query": request.query,
        "results": results
    }

@app.post("/ask")
def ask_question(request: SearchRequest):

    results = search_chunks(
        request.query,
        request.top_k
    )

    if not results:
        return {
            "question": request.query,
            "answer": "No relevant information was found in the uploaded documents.",
            "retrieved_chunks": [],
            "sources": []
        }

    answer = generate_answer(
        request.query,
        results
    )

    retrieved_chunks = []

    for chunk in results:
        retrieved_chunks.append({
            "document_name": chunk["document_name"],
            "page_number": chunk["page_number"],
            "chunk_id": chunk["chunk_id"],
            "distance": chunk["distance"],
            "text": chunk["text"]
        })

    sources = []

    for chunk in results:
        sources.append({
            "document_name": chunk["document_name"],
            "page_number": chunk["page_number"],
            "chunk_id": chunk["chunk_id"]
        })

    return {
        "question": request.query,
        "answer": answer,
        "retrieved_chunks": retrieved_chunks,
        "sources": sources
    }

@app.get("/debug/chroma")
def debug_chroma():

    return {
        "total_chunks": get_collection_count()
    }