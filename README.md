# Semantic Document Research

Semantic Document Research is a full-stack retrieval-augmented generation (RAG)
application for researching uploaded PDF and DOCX documents. It extracts and
chunks document text, creates 384-dimensional `all-MiniLM-L6-v2` embeddings,
stores them in ChromaDB, and retrieves relevant passages for semantic search or
Google Gemini-backed answers.

The application is intended for research and demonstration. Answers are
grounded in retrieved passages, which are always returned for inspection.

## Features

- Upload PDF and DOCX files and index them incrementally.
- Sentence-aware chunking with configurable chunk size and overlap.
- Semantic similarity search with configurable top-k and L2-distance filtering.
- Evidence-grounded question answering with retrieved source passages and
  document/page/chunk citations.
- Document library with indexed document counts, deletion, and clear-index
  controls.
- Re-index all files in `data/` and `backend/uploads/` after changing chunk
  settings.
- Retrieval-only fallback when `GEMINI_API_KEY` is not configured or Gemini is
  unavailable.
- React workspace UI plus FastAPI Swagger documentation.

## Architecture

```text
React + Vite frontend
        |
        | HTTPS / JSON / multipart upload
        v
FastAPI backend
  |             |
  |             +--> Google Gemini (optional answer generation)
  |
  +--> PDF/DOCX extraction
  +--> sentence-aware chunking
  +--> ONNX all-MiniLM-L6-v2 embeddings
  +--> ChromaDB persistent vector store
```

In the deployed setup, the frontend is hosted on Vercel and the backend runs
on Render. The frontend first uses the Render API and falls back to the Vercel
`/api` reverse proxy when necessary. For local development, the frontend can
still use the same cloud API configuration, or the backend can be run locally
for API and integration testing.

## Project Structure

```text
semantic-document-research/
├── backend/
│   ├── main.py                 # FastAPI application and API routes
│   ├── requirements.txt
│   ├── .env.example
│   ├── services/
│   │   ├── document_processor.py
│   │   ├── chunker.py
│   │   ├── embedding_service.py
│   │   ├── vector_store.py
│   │   └── llm_service.py
│   ├── tests/
│   ├── uploads/                # Runtime uploads
│   └── chroma_db/              # Local ChromaDB data
├── data/                       # Optional documents for re-indexing
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
├── vercel.json                 # Frontend routing and API proxy
└── README.md
```

## Requirements

- Python 3.10 or newer
- Node.js and npm
- A Google Gemini API key for generated answers (optional)

## Local Setup

From the repository root:

### 1. Create and activate a Python environment

Windows PowerShell:

```powershell
python -m venv backend\venv
.\backend\venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
python -m venv backend/venv
source backend/venv/bin/activate
```

### 2. Install backend dependencies

```bash
python -m pip install -r backend/requirements.txt
```

### 3. Configure the backend

Copy `backend/.env.example` to `backend/.env` and set the variables you need.

```env
GEMINI_API_KEY=your_gemini_api_key_here
MAX_UPLOAD_SIZE_MB=10
MAX_PAGE_COUNT=200
MAX_CONCURRENT_INGESTIONS=1
EMBEDDING_BATCH_SIZE=8
CHROMA_INSERT_BATCH_SIZE=32
```

`GEMINI_API_KEY` is optional. Without it, document processing and semantic
search continue to work, while `/ask` returns the retrieved evidence with an
LLM-unavailable status.

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

## Run Locally

Start the backend from the repository root:

```powershell
.\backend\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

Or from the `backend` directory:

```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

The backend is available at <http://localhost:8000>. Interactive Swagger
documentation is available at <http://localhost:8000/docs>.

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

The Vite development server is normally available at
<http://localhost:5173>.

## API Reference

Every core route is also available under the `/api` prefix for the Vercel
proxy, for example `/api/search`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | API status, version, and indexed chunk count |
| `GET` | `/documents` | List indexed documents and chunk/page metadata |
| `POST` | `/upload` | Upload and index one PDF or DOCX file |
| `DELETE` | `/documents/{filename}` | Remove one document from the index |
| `POST` | `/documents/clear` | Clear the complete vector index |
| `POST` | `/search` | Retrieve semantically similar passages |
| `POST` | `/ask` | Retrieve passages and generate an evidence-grounded answer |
| `POST` | `/reindex` | Clear and re-index documents from disk |
| `GET` | `/debug/chroma` | Return ChromaDB collection diagnostics |

### Search request

```json
{
  "query": "How can NLP help identify suspicious activity?",
  "top_k": 5,
  "distance_threshold": 1.5
}
```

`top_k` is limited by the API to 50 for `/search` and 20 for `/ask`.
`distance_threshold` can be set to `null` to disable distance filtering.

### Upload request

`/upload` accepts a multipart form with:

- `file`: one `.pdf` or `.docx` file
- `chunk_size`: optional word target, default `300`
- `overlap`: optional overlap word count, default `50`

The default upload limit is 10 MB and the default maximum page count is 200.

## Testing and Builds

Run the backend tests:

```powershell
.\backend\venv\Scripts\python.exe -m pytest backend\tests -v
```

Build the frontend:

```bash
cd frontend
npm run build
```

Run the frontend linter:

```bash
npm run lint
```

## Deployment Notes

The repository includes Vercel configuration for frontend hosting and
`/api/*` proxy rewrites to the Render backend. A typical Render start command
is:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1
```

Use one worker on memory-constrained deployments. The backend deliberately
limits upload size, page count, concurrent ingestion, embedding batches, and
Chroma insert batches.

The local ChromaDB store is under `backend/chroma_db`. Deployments with an
ephemeral filesystem can lose indexed documents after a restart, redeploy, or
spin-down. Durable persistence requires a persistent disk or an externally
hosted ChromaDB-compatible service. Do not commit API keys or other secrets;
configure them through local environment files or deployment secrets.

## Limitations

- The system uses pretrained embeddings and does not train or fine-tune an NLP
  model.
- Scanned PDFs require OCR and are not automatically converted to text.
- Retrieval quality depends on document quality, chunk settings, and semantic
  similarity thresholds.
- Generated answers should be checked against the returned source passages.
- DOCX page metadata is based on extracted document structure rather than
  printed page layout.

## License

No license file is currently included in the repository.
