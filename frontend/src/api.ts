import type {
  DocumentsResponse,
  SearchResponse,
  AskResponse,
  UploadResponse,
  ReindexResponse,
  ApiStatus
} from './types';

// The application connects exclusively to the deployed Render backend
export const API_BASE = 'https://semantic-document-research.onrender.com';

// Clean up any previously stored local storage overrides
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

// Wrapper for fetch that catches network disconnects ("Failed to fetch")
async function resilientFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    throw new Error(
      'Unable to connect to the Render cloud backend. The server may be waking up (~30s). Please wait a moment and click Refresh.'
    );
  }
}

export const api = {
  getApiUrl(): string {
    return API_BASE;
  },

  isCloud(): boolean {
    return true;
  },

  async getStatus(): Promise<ApiStatus> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${API_BASE}/`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return {
          online: false,
          indexedChunks: 0,
          apiUrl: API_BASE,
          error: `Server responded with status ${res.status}`
        };
      }

      const data = await res.json();
      return {
        online: true,
        indexedChunks: data.indexed_chunks ?? 0,
        apiUrl: API_BASE
      };
    } catch (err: any) {
      return {
        online: false,
        indexedChunks: 0,
        apiUrl: API_BASE,
        error: err.name === 'AbortError'
          ? 'Connecting to Render cloud server timed out (~15s).'
          : (err.message || 'Cannot connect to Render cloud server.')
      };
    }
  },

  async getDocuments(): Promise<DocumentsResponse> {
    const res = await resilientFetch(`${API_BASE}/documents`);
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

    const res = await resilientFetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
      signal
    });
    return handleResponse<UploadResponse>(res);
  },

  async deleteDocument(filename: string): Promise<{ filename: string; message: string }> {
    const res = await resilientFetch(`${API_BASE}/documents/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    return handleResponse(res);
  },

  async clearDocuments(): Promise<{ message: string; total_documents: number; total_chunks: number }> {
    const res = await resilientFetch(`${API_BASE}/documents/clear`, {
      method: 'POST'
    });
    return handleResponse(res);
  },

  async search(
    query: string,
    topK: number = 5,
    distanceThreshold: number | null = 1.5
  ): Promise<SearchResponse> {
    const res = await resilientFetch(`${API_BASE}/search`, {
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
    const res = await resilientFetch(`${API_BASE}/ask`, {
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
      `${API_BASE}/reindex?chunk_size=${chunkSize}&overlap=${overlap}`,
      { method: 'POST' }
    );
    return handleResponse<ReindexResponse>(res);
  }
};
