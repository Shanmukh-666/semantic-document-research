import os

from dotenv import load_dotenv
from google import genai


load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError("GEMINI_API_KEY is not set")

client = genai.Client(api_key=api_key)


def generate_answer(question: str, chunks: list):

    context_parts = []

    for chunk in chunks:
        context_parts.append(
            f"""
Document: {chunk['document_name']}
Page: {chunk['page_number']}
Chunk: {chunk['chunk_id']}

Content:
{chunk['text']}
"""
        )

    context = "\n".join(context_parts)

    prompt = f"""
You are a document research assistant.

Answer the user's question using ONLY the information
provided in the document context below.

If the answer cannot be found in the context, say:
"The information was not found in the uploaded documents."

Do not use outside knowledge.
Do not invent information.

DOCUMENT CONTEXT:
{context}

USER QUESTION:
{question}

Give a clear and concise answer.
"""

    response = client.interactions.create(
        model="gemini-3.8-flash",
        input=prompt
    )

    return response.output_text