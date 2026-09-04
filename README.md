# Semantic Document Research

An NLP-based Retrieval-Augmented Question Answering system that allows users to upload multiple PDF and DOCX documents, search them using natural-language questions, retrieve semantically relevant document chunks, and generate answers using an LLM.

---

## Overview

Traditional keyword search depends heavily on exact words appearing in a document. This can fail when a user asks a question using different terminology from the source material.

**Semantic Document Research** addresses this problem using NLP-based semantic retrieval.

The system:

1. Accepts multiple PDF and DOCX documents.
2. Extracts text from the uploaded documents.
3. Splits the extracted text into smaller chunks.
4. Converts each chunk into a semantic embedding using a pretrained Sentence Transformer model.
5. Stores the embeddings and document metadata in ChromaDB.
6. Converts the user's question into an embedding.
7. Performs semantic similarity search across the uploaded documents.
8. Retrieves the most relevant document chunks.
9. Sends the retrieved chunks and the question to an LLM.
10. Generates a source-grounded final answer.

The retrieved chunks are also returned so that the user can see **which parts of the documents were selected to generate the answer**.

---

## Main Objective

The main objective of the project is to demonstrate how NLP techniques can be used to build a semantic document research system that understands the meaning of a query rather than relying only on exact keyword matching.

---

## System Workflow

```text
                 User
                   |
                   v
            Upload Documents
                   |
                   v
           Text Extraction
                   |
                   v
               Chunking
                   |
                   v
        Sentence Transformer
            Embeddings
                   |
                   v
              ChromaDB
                   |
                   |
            User Question
                   |
                   v
           Query Embedding
                   |
                   v
         Semantic Similarity
              Search
                   |
                   v
         Relevant Chunks
                   |
          +--------+--------+
          |                 |
          v                 v
   Display Retrieved       LLM
       Chunks               |
          |                 v
          |           Final Answer
          |                 |
          +--------+--------+
                   |
                   v
              API Response
```

---

## NLP Components

The project focuses on the following NLP concepts:

### 1. Text Extraction

Text is extracted from:

* PDF using PyMuPDF
* DOCX using python-docx

### 2. Text Chunking

Large documents are divided into smaller pieces so that individual sections can be represented and searched independently.

The current implementation uses approximately:

* 500 words per chunk
* 50 words of overlap

### 3. Semantic Embeddings

A pretrained Sentence Transformer model is used to convert text into dense vector representations.

Model:

```text
all-MiniLM-L6-v2
```

This allows semantically similar sentences to have similar vector representations even when their wording is different.

### 4. Semantic Similarity Search

The embedding of the user's query is compared against stored document embeddings.

ChromaDB retrieves the most relevant chunks according to vector distance.

### 5. Retrieval-Augmented Generation

The retrieved chunks are provided as context to the LLM.

```text
Question + Retrieved Context
            |
            v
           LLM
            |
            v
       Final Answer
```

The LLM is instructed to answer using the retrieved document context rather than relying on unrelated external information.

---

## Technology Stack

| Component             | Technology            |
| --------------------- | --------------------- |
| Programming Language  | Python                |
| API Framework         | FastAPI               |
| API Testing Interface | Swagger UI            |
| PDF Processing        | PyMuPDF               |
| DOCX Processing       | python-docx           |
| Embedding Model       | Sentence Transformers |
| Embedding Model       | all-MiniLM-L6-v2      |
| Vector Database       | ChromaDB              |
| LLM                   | Google Gemini         |
| Environment Variables | python-dotenv         |

---

## Project Structure

```text
semantic-document-research/
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example
│   │
│   ├── services/
│   │   ├── document_processor.py
│   │   ├── chunker.py
│   │   ├── embedding_service.py
│   │   ├── vector_store.py
│   │   └── llm_service.py
│   │
│   ├── uploads/
│   │
│   └── chroma_db/
│
├── data/
│   ├── 01_NLP_in_Healthcare.pdf
│   ├── 02_NLP_in_Education.docx
│   ├── 03_NLP_for_Cybersecurity.pdf
│   ├── 04_NLP_for_Finance.docx
│   └── 05_NLP_for_Climate_Research.pdf
│
├── .gitignore
└── README.md
```

---

## API Endpoints

### `GET /`

Checks whether the API is running.

Example response:

```json
{
  "message": "Semantic Document Research API is running"
}
```

---

### `POST /upload`

Uploads and processes a PDF or DOCX document.

The document is:

```text
Uploaded File
    ↓
Text Extraction
    ↓
Chunking
    ↓
Embedding Generation
    ↓
ChromaDB Storage
```

Example response:

```json
{
  "filename": "research.pdf",
  "pages": 5,
  "chunks_created": 10,
  "chunks_stored": 10,
  "message": "Document processed and stored successfully"
}
```

---

### `POST /search`

Performs semantic retrieval without generating an LLM answer.

Example request:

```json
{
  "query": "How can NLP help detect suspicious activity in cybersecurity?",
  "top_k": 3
}
```

The response contains:

* Document name
* Page number
* Chunk ID
* Chunk text
* Distance

Example:

```json
{
  "query": "How can NLP help detect suspicious activity in cybersecurity?",
  "results": [
    {
      "document_name": "03_NLP_for_Cybersecurity.pdf",
      "page_number": 1,
      "chunk_id": 1,
      "text": "...",
      "distance": 0.67
    }
  ]
}
```

This endpoint is useful for demonstrating the **NLP semantic retrieval process**.

---

### `POST /ask`

Performs the complete RAG pipeline.

Example request:

```json
{
  "query": "How can NLP help detect suspicious activity in cybersecurity?",
  "top_k": 3
}
```

The endpoint:

```text
Question
   ↓
Query Embedding
   ↓
ChromaDB Search
   ↓
Relevant Chunks
   ↓
LLM
   ↓
Final Answer
```

The response contains:

* Question
* Generated answer
* Retrieved chunks
* Source documents
* Page numbers
* Chunk IDs

---

## Installation

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd semantic-document-research
```

### 2. Open the backend

```bash
cd backend
```

### 3. Create a virtual environment

Windows:

```powershell
python -m venv venv
venv\Scripts\activate
```

macOS/Linux:

```bash
python -m venv venv
source venv/bin/activate
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Configure the API key

Create a `.env` file inside `backend/`:

```env
GEMINI_API_KEY=your_api_key_here
```

Do not commit `.env` to GitHub.

Use `.env.example` as the template.

---

## Running the Project

From the `backend` directory:

```bash
python -m uvicorn main:app
```

Then open Swagger UI:

```text
http://127.0.0.1:8000/docs
```

---

## Using the System

### Step 1 — Upload documents

Use:

```text
POST /upload
```

Upload multiple PDF and DOCX documents.

Each document is processed and its chunks are stored in ChromaDB.

### Step 2 — Test semantic retrieval

Use:

```text
POST /search
```

Ask a natural-language question.

The API returns the most relevant chunks.

### Step 3 — Generate an answer

Use:

```text
POST /ask
```

The system retrieves the relevant chunks and uses them as context for the LLM.

---

## Example Questions

### Healthcare

```text
How is NLP used to analyze medical records?
```

### Education

```text
How can semantic search help students find learning material?
```

### Cybersecurity

```text
How can NLP help identify suspicious activity?
```

### Finance

```text
How can NLP help analysts find risks in financial reports?
```

### Cross-document research

```text
What are the major applications of NLP across different industries?
```

The last type of query can retrieve relevant information from multiple uploaded documents.

---

## Why This Is an NLP Project

The core intelligence of the system comes from NLP techniques:

```text
Text
 ↓
Text Processing
 ↓
Chunking
 ↓
Semantic Embeddings
 ↓
Vector Representation
 ↓
Semantic Similarity
 ↓
Information Retrieval
```

The LLM is used only after retrieval to generate a concise answer from the selected evidence.

Therefore, the project combines:

* Natural Language Processing
* Semantic Information Retrieval
* Vector Search
* Retrieval-Augmented Generation
* Large Language Models

---

## Dataset

No training dataset is required.

The project uses pretrained models for semantic embedding and language generation.

The documents uploaded by the user serve as the searchable knowledge source rather than a model-training dataset.

---

## Demo Documents

The repository contains five sample documents for demonstration:

1. NLP in Healthcare
2. NLP in Education
3. NLP for Cybersecurity
4. NLP in Finance
5. NLP for Climate Research

The documents intentionally contain related NLP concepts across different domains so that semantic retrieval can be demonstrated across multiple documents.

---

## Limitations

* The current system uses pretrained embedding models and does not fine-tune an NLP model.
* Retrieval quality depends on the embedding model, chunking strategy, and document quality.
* DOCX documents are currently treated as a single extracted text source for page metadata purposes.
* Generated answers should be verified against the retrieved source content.
* The system is designed as an academic research/demo application rather than a production document-management platform.

---

## Future Improvement Possibilities

Possible future improvements include:

* Better sentence/paragraph-aware chunking
* Improved retrieval and reranking
* Support for additional document formats
* OCR for scanned documents
* Retrieval evaluation using a labeled question set
* More advanced citation handling

These features are outside the current project scope.

---

## Project Classification

**Project Type:** NLP + Semantic Search + RAG

**Primary Domain:** Natural Language Processing

**Core NLP Technique:** Semantic Text Embeddings

**Retrieval Technology:** ChromaDB

**Generation Technology:** Google Gemini

**Interface:** FastAPI Swagger UI

---

## Author

**Semantic Document Research**

Academic NLP Project
