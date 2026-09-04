def create_chunks(pages, chunk_size=500, overlap=50):
    all_chunks = []

    chunk_id = 1

    for page in pages:
        words = page["text"].split()

        start = 0

        while start < len(words):
            end = start + chunk_size

            chunk_text = " ".join(words[start:end])

            if chunk_text.strip():
                all_chunks.append({
                    "chunk_id": chunk_id,
                    "page_number": page["page_number"],
                    "text": chunk_text
                })

                chunk_id += 1

            start += chunk_size - overlap

    return all_chunks