import os
import gc
from typing import List, Union
import numpy as np

# Constrain PyTorch and tokenizer thread pools to prevent memory explosion on 512MB containers
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

_model = None


def get_model():
    """
    Lazy loader for SentenceTransformer model.
    Configured for CPU execution with minimal memory footprint (1 thread).
    """
    global _model
    if _model is None:
        try:
            import torch
            torch.set_num_threads(1)
        except ImportError:
            pass
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
    return _model


def generate_embeddings(texts: Union[List[str], str]):
    """
    Generates normalized embeddings using all-MiniLM-L6-v2.
    Runs with torch.inference_mode() and batch_size=4 to fit comfortably within 512MB RAM limits.
    """
    if isinstance(texts, str):
        texts = [texts]

    if not texts:
        return np.array([])

    import torch
    model = get_model()
    cleaned = [t if isinstance(t, str) else str(t) for t in texts]

    with torch.inference_mode():
        embeddings = model.encode(
            cleaned,
            batch_size=4,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True
        )

    gc.collect()
    return embeddings