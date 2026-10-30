import type {
  DocumentsResponse,
  SearchResponse,
  AskResponse,
  UploadResponse,
  ReindexResponse,
  ApiStatus
} from './types';

export const CLOUD_URL = 'https://semantic-document-research.onrender.com';
export const PROXY_URL = '/api';

// Default to direct Render cloud endpoint, with automatic silent fallback to Vercel same-origin proxy
let activeBaseUrl = CLOUD_URL;

// Clean up any old localStorage overrides
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('custom_api_url');
    localStorage.removeItem('preferred_api');
  } catch {
    // ignore
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `Request failed with status ${res.status}`;
    try {
      const errorJson = await res.json();
      if (errorJson.detail) {
        errorDetail = typeof errorJson.detail === 'string'
          ? errorJson.detail
          : JSON.stringify(errorJson.detail);
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }
  return res.json();
}

/**
 * Resilient fetch with automatic route failover:
 * 1. Tries primary URL (direct Render HTTPS)
 * 2. If blocked by browser/network/CORS, falls back to Vercel reverse proxy (/api)
 */
async function resilientFetch(path: string, init?: RequestInit): Promise<Response> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const primaryUrl = `${activeBaseUrl}${cleanPath}`;
  const altBase = activeBaseUrl === CLOUD_URL ? PROXY_URL : CLOUD_URL;
  const secondaryUrl = `${altBase}${cleanPath}`;

  try {
    const res = await fetch(primaryUrl, init);
    return res;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }

    // Try secondary fallback route
    try {
      console.warn(`Primary route ${primaryUrl} failed. Retrying with fallback route ${secondaryUrl}...`);
      const fallbackRes = await fetch(secondaryUrl, init);
      activeBaseUrl = altBase;
      return fallbackRes;
    } catch (fallbackErr: any) {
      if (fallbackErr.name === 'AbortError') {
        throw fallbackErr;
      }
      throw new Error(
        `Unable to reach backend (${err.message || 'connection failed'}). The Render server may be waking up (~30–50s). Please wait a moment and click Refresh.`
      );
    }
  }
}

export const api = {
  getApiUrl(): string {
    return activeBaseUrl;
  },

  isCloud(): boolean {
    return true;
  },

  async getStatus(): Promise<ApiStatus> {
    const checkUrl = async (base: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch(`${base}/`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          return { ok: true, chunks: data.indexed_chunks ?? 0 };
        }
      } catch {
        clearTimeout(timeoutId);
      }
      return { ok: false, chunks: 0 };
    };

    // 1. Try activeBaseUrl
    const check1 = await checkUrl(activeBaseUrl);
    if (check1.ok) {
      return { online: true, indexedChunks: check1.chunks, apiUrl: activeBaseUrl };
    }

    // 2. Try alternate route
    const altBase = activeBaseUrl === CLOUD_URL ? PROXY_URL : CLOUD_URL;
    const check2 = await checkUrl(altBase);
    if (check2.ok) {
      activeBaseUrl = altBase;
      return { online: true, indexedChunks: check2.chunks, apiUrl: activeBaseUrl };
    }

    return {
      online: false,
      indexedChunks: 0,
      apiUrl: activeBaseUrl,
      error: 'Backend is waking up (~30–50s). Please click Refresh once awake.'
    };
  },

  async waitForBackend(
    maxWaitMs: number = 90000,
    onProgress?: (msg: string) => void
  ): Promise<boolean> {
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < maxWaitMs) {
      attempt++;
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (attempt > 1 && onProgress) {
        onProgress(`Connecting to backend... (${elapsed}s)`);
      }

      const status = await this.getStatus();
      if (status.online) {
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    return false;
  },

  async getDocuments(): Promise<DocumentsResponse> {
    const res = await resilientFetch('/documents');
    return handleResponse<DocumentsResponse>(res);
  },

  async uploadDocument(
    file: File,
    chunkSize: number = 300,
    overlap: number = 50,
    signal?: AbortSignal
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('chunk_size', chunkSize.toString());
    formData.append('overlap', overlap.toString());

    const res = await resilientFetch('/upload', {
      method: 'POST',
      body: formData,
      signal
    });
    return handleResponse<UploadResponse>(res);
  },

  async deleteDocument(filename: string): Promise<{ filename: string; message: string }> {
    const res = await resilientFetch(`/documents/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    return handleResponse(res);
  },

  async clearDocuments(): Promise<{ message: string; total_documents: number; total_chunks: number }> {
    const res = await resilientFetch('/documents/clear', {
      method: 'POST'
    });
    return handleResponse(res);
  },

  async search(
    query: string,
    topK: number = 5,
    distanceThreshold: number | null = 1.5
  ): Promise<SearchResponse> {
    const res = await resilientFetch('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        top_k: topK,
        distance_threshold: distanceThreshold
      })
    });
    return handleResponse<SearchResponse>(res);
  },

  async ask(
    query: string,
    topK: number = 5,
    distanceThreshold: number | null = 1.5
  ): Promise<AskResponse> {
    const res = await resilientFetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        top_k: topK,
        distance_threshold: distanceThreshold
      })
    });
    return handleResponse<AskResponse>(res);
  },

  async reindex(chunkSize: number = 300, overlap: number = 50): Promise<ReindexResponse> {
    const res = await resilientFetch(
      `/reindex?chunk_size=${chunkSize}&overlap=${overlap}`,
      { method: 'POST' }
    );
    return handleResponse<ReindexResponse>(res);
  }
};
