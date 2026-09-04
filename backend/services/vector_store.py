import chromadb

from services.embedding_service import generate_embeddings


client = chromadb.PersistentClient(
    path="./chroma_db"
)

collection = client.get_or_create_collection(
    name="documents"
)


def add_chunks(chunks, document_name):
    texts = [chunk["text"] for chunk in chunks]

    embeddings = generate_embeddings(texts)

    ids = []
    metadatas = []

    for chunk in chunks:
        chunk_id = f"{document_name}_{chunk['chunk_id']}"

        ids.append(chunk_id)

        metadatas.append({
            "document_name": document_name,
            "page_number": chunk["page_number"],
            "chunk_id": chunk["chunk_id"]
        })

    collection.add(
        ids=ids,
        embeddings=embeddings.tolist(),
        documents=texts,
        metadatas=metadatas
    )

    return len(chunks)

def search_chunks(query: str, top_k: int = 5):

    query_embedding = generate_embeddings([query])[0]

    results = collection.query(
        query_embeddings=[query_embedding.tolist()],
        n_results=top_k
    )

    search_results = []

    for i in range(len(results["documents"][0])):

        distance = results["distances"][0][i]

        if distance <= 1.5:

            search_results.append({
                "document_name": results["metadatas"][0][i]["document_name"],
                "page_number": results["metadatas"][0][i]["page_number"],
                "chunk_id": results["metadatas"][0][i]["chunk_id"],
                "text": results["documents"][0][i],
                "distance": distance
            })

    return search_results

def get_collection_count():
    return collection.count()