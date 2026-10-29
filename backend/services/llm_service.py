import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load from backend/.env deterministically
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)
load_dotenv()


class LLMUnavailableError(Exception):
    """Raised when the LLM provider is unconfigured, unreachable, or encounters an error."""
    pass


def get_llm_client():
    """
    Initializes Google GenAI client lazily.
    Does not crash the application on import if GEMINI_API_KEY is missing.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_api_key_here":
        raise LLMUnavailableError(
            "GEMINI_API_KEY is not configured in backend environment (.env). "
            "Semantic retrieval is active, but LLM generation is unavailable."
        )

    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except Exception as e:
        raise LLMUnavailableError(f"Failed to initialize GenAI client: {str(e)}")


def generate_answer(question: str, chunks: List[Dict[str, Any]]) -> str:
    """
    Generates a source-grounded answer based strictly on retrieved context.
    Cites specific document names, page numbers, and chunk IDs.
    """
    if not chunks:
        return "No relevant information was found in the uploaded documents."

    client = get_llm_client()

    context_parts = []
    for chunk in chunks:
        context_parts.append(
            f"--- Source [Document: {chunk.get('document_name', 'Unknown')}, "
            f"Page: {chunk.get('page_number', 1)}, "
            f"Chunk: {chunk.get('chunk_id', 0)}] ---\n"
            f"{chunk.get('text', '')}\n"
        )

    context = "\n".join(context_parts)

    prompt = f"""You are an expert document research and NLP synthesis assistant.

INSTRUCTIONS:
1. Provide a comprehensive, beautifully structured research answer based STRICTLY on the DOCUMENT CONTEXT below.
2. Structure your answer using rich, clean Markdown formatting:
   - Use '### ' section headings to organize your response (e.g., '### Overview & Executive Summary', '### Core Findings & Capabilities', '### Workflow & Practical Implications').
   - Use bold formatting ('**concept**') to emphasize key technical terms, methods, and findings.
   - Use structured bullet points ('* ') for specific capabilities, evidence, and applications.
3. For EVERY fact or claim, cite the exact source using the format: [Document: <filename>, Page: <page>, Chunk: <id>].
4. If the provided context does not contain enough evidence to answer, state:
   "The provided documents do not contain sufficient evidence to answer this question."
5. Do not speculate, extrapolate, or use outside world knowledge.

DOCUMENT CONTEXT:
{context}

USER QUESTION:
{question}

RESEARCH ANSWER:"""

    from google.genai import types

    # Fast models list with immediate fallback
    model_candidates = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]
    last_error = None

    config = types.GenerateContentConfig(
        max_output_tokens=1200,
        temperature=0.2
    )

    for model_name in model_candidates:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )
            if response and response.text:
                return response.text.strip()
        except Exception as err:
            last_error = err
            continue

    # Fallback to interactions API if generate_content has unexpected failure
    try:
        response = client.interactions.create(
            model="gemini-3.8-flash",
            input=prompt
        )
        if hasattr(response, "output_text") and response.output_text:
            return response.output_text.strip()
    except Exception as err:
        last_error = err

    raise LLMUnavailableError(f"LLM generation failed: {str(last_error)}")