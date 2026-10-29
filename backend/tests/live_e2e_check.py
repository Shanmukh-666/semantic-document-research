import urllib.request
import json
import sys

def main():
    print("=== 1. FRONTEND DEV SERVER TEST ===", flush=True)
    try:
        with urllib.request.urlopen("http://127.0.0.1:5173", timeout=10) as res:
            print(f"Frontend HTTP Status: {res.status} OK", flush=True)
    except Exception as e:
        print("Frontend error:", e, flush=True)

    print("\n=== 2. BACKEND HEALTH TEST ===", flush=True)
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/", timeout=10) as res:
            data = json.loads(res.read().decode())
            print(f"Backend Status: {data.get('status')} | Docs indexed: {data.get('indexed_documents')} | Chunks: {data.get('indexed_chunks')}", flush=True)
    except Exception as e:
        print("Backend error:", e, flush=True)

    print("\n=== 3. BACKEND DOCUMENTS LIST ===", flush=True)
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/documents", timeout=10) as res:
            docs = json.loads(res.read().decode()).get("documents", [])
            print(f"Total docs in vector store: {len(docs)}", flush=True)
            for d in docs:
                print(f" - {d['document_name']} ({d['chunk_count']} chunks, {d['page_count']} pages)", flush=True)
    except Exception as e:
        print("Docs error:", e, flush=True)

    print("\n=== 4. LIVE NLP SEMANTIC SEARCH TEST ===", flush=True)
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8000/search",
            data=json.dumps({"query": "electronic health records and clinical entity recognition", "top_k": 3}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=20) as res:
            results = json.loads(res.read().decode()).get("results", [])
            print(f"Semantic search returned {len(results)} chunks:", flush=True)
            for r in results:
                print(f"   -> doc: {r['document_name']}, page: {r['page_number']}, L2 dist: {r['distance']:.4f}, words: {r.get('word_count', 'N/A')}", flush=True)
    except Exception as e:
        print("Search error:", e, flush=True)

    print("\n=== 5. LIVE NLP RAG QA WITH GEMINI (Grounded Query) ===", flush=True)
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8000/ask",
            data=json.dumps({"query": "How is NLP used for clinical records and entity extraction in healthcare?", "top_k": 3}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=40) as res:
            qa = json.loads(res.read().decode())
            print(f"LLM Status: {qa.get('llm_status')}", flush=True)
            print(f"Retrieved sources count: {len(qa.get('sources', []))}", flush=True)
            for s in qa.get("sources", []):
                print(f"   Source Citation -> Doc: {s['document_name']}, Page: {s['page_number']}, Chunk: {s['chunk_id']}", flush=True)
            print("\nGenerated Grounded Answer:", flush=True)
            print("-" * 50, flush=True)
            print(qa.get("answer", ""), flush=True)
            print("-" * 50, flush=True)
    except Exception as e:
        print("Ask error:", e, flush=True)

    print("\n=== 6. LIVE NLP RAG QA REFUSAL (Out-of-Domain Query) ===", flush=True)
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8000/ask",
            data=json.dumps({"query": "What is the best recipe to bake a chocolate cake?", "top_k": 3}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=40) as res:
            qa = json.loads(res.read().decode())
            print(f"LLM Status: {qa.get('llm_status')}", flush=True)
            print(f"Answer: {qa.get('answer')}", flush=True)
    except Exception as e:
        print("Refusal check error:", e, flush=True)

if __name__ == "__main__":
    main()
