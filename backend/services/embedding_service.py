from typing import List, Union
import numpy as np

_model = None


def get_model():
    """
    Lazy loader for SentenceTransformer model.
    Avoids model download overhead during import or unit testing.
    """
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def generate_embeddings(texts: Union[List[str], str]):
    """
    Generates normalized embeddings using all-MiniLM-L6-v2.
    Accepts a single string or list of strings.
    """
    if isinstance(texts, str):
        texts = [texts]

    if not texts:
        return np.array([])

    model = get_model()
    cleaned = [t if isinstance(t, str) else str(t) for t in texts]
    return model.encode(cleaned, convert_to_numpy=True)