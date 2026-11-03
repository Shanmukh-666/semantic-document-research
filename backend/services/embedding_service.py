import os
import gc
import logging
from typing import List, Union
import numpy as np

# Constrain thread pools to avoid excessive memory on 512MB instances
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

_onnx_session = None
_tokenizer = None
logger = logging.getLogger(__name__)


def _log_memory(stage: str) -> None:
    try:
        import resource
        usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        if os.name == "nt":
            usage /= 1024
        if usage > 0:
            logger.info("memory stage=%s rss_mb=%.1f", stage, usage / 1024)
            return
        raise OSError("resource returned no RSS value")
    except (ImportError, AttributeError, OSError):
        if os.name != "nt":
            logger.debug("Memory metrics unavailable at stage=%s", stage)
            return
        try:
            import ctypes
            from ctypes import wintypes
            class ProcessMemoryCounters(ctypes.Structure):
                _fields_ = [
                    ("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                ]
            counters = ProcessMemoryCounters()
            counters.cb = ctypes.sizeof(counters)
            process = ctypes.windll.kernel32.GetCurrentProcess()
            get_memory_info = ctypes.windll.psapi.GetProcessMemoryInfo
            get_memory_info.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessMemoryCounters), wintypes.DWORD]
            get_memory_info.restype = wintypes.BOOL
            if not get_memory_info(
                process,
                ctypes.byref(counters),
                counters.cb
            ):
                raise OSError("GetProcessMemoryInfo failed")
            logger.info("memory stage=%s rss_mb=%.1f", stage, counters.WorkingSetSize / (1024 * 1024))
        except (AttributeError, OSError):
            logger.debug("Memory metrics unavailable at stage=%s", stage)


def _get_onnx_model():
    """
    Loads lightweight ONNX runtime engine for all-MiniLM-L6-v2.
    Memory footprint: ~170MB (compared to >500MB with standard PyTorch).
    Prevents Render Free Tier 512MB out-of-memory crashes.
    """
    global _onnx_session, _tokenizer
    if _onnx_session is None or _tokenizer is None:
        from tokenizers import Tokenizer
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download

        model_path = hf_hub_download("sentence-transformers/all-MiniLM-L6-v2", "onnx/model.onnx")
        tok_path = hf_hub_download("sentence-transformers/all-MiniLM-L6-v2", "tokenizer.json")

        tok = Tokenizer.from_file(tok_path)
        tok.enable_padding()
        tok.enable_truncation(max_length=256)

        opts = ort.SessionOptions()
        opts.enable_cpu_mem_arena = False
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        sess = ort.InferenceSession(model_path, sess_options=opts, providers=["CPUExecutionProvider"])

        _tokenizer = tok
        _onnx_session = sess
        _log_memory("after_embedding_model_load")
    return _onnx_session, _tokenizer


def generate_embeddings(texts: Union[List[str], str]) -> np.ndarray:
    """
    Generates normalized 384-dimensional embeddings for all-MiniLM-L6-v2.
    Uses one CPU-only ONNX Runtime session with small batches and arena disabled.
    """
    if isinstance(texts, str):
        texts = [texts]

    if not texts:
        return np.array([])

    cleaned = [t if isinstance(t, str) else str(t) for t in texts]

    try:
        sess, tok = _get_onnx_model()
        all_embeddings = []
        batch_size = max(1, int(os.getenv("EMBEDDING_BATCH_SIZE", "8")))

        for i in range(0, len(cleaned), batch_size):
            batch_texts = cleaned[i:i + batch_size]
            enc = tok.encode_batch(batch_texts)

            in_ids = np.array([e.ids for e in enc], dtype=np.int64)
            in_mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
            in_type = np.array([e.type_ids for e in enc], dtype=np.int64)

            outs = sess.run(None, {
                "input_ids": in_ids,
                "attention_mask": in_mask,
                "token_type_ids": in_type
            })

            token_emb = outs[0]
            mask_expanded = np.expand_dims(in_mask, -1)
            sum_emb = np.sum(token_emb * mask_expanded, axis=1)
            sum_mask = np.clip(np.sum(mask_expanded, axis=1), a_min=1e-9, a_max=None)
            mean_pooled = sum_emb / sum_mask

            norm = np.linalg.norm(mean_pooled, axis=1, keepdims=True)
            norm_emb = mean_pooled / np.clip(norm, a_min=1e-12, a_max=None)
            all_embeddings.append(norm_emb)
            _log_memory("embedding_batch")

            del enc, in_ids, in_mask, in_type, outs, token_emb, mask_expanded, sum_emb, sum_mask, mean_pooled, norm

        result = np.vstack(all_embeddings)
        del all_embeddings
        gc.collect()
        return result

    except Exception as e:
        raise RuntimeError(f"ONNX embedding generation failed: {e}") from e