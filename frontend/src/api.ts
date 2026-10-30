import type {
  DocumentsResponse,
  SearchResponse,
  AskResponse,
  UploadResponse,
  ReindexResponse,
  ApiStatus
} from './types';

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
   window.location.hostname === '127.0.0.1');

export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (isLocalhost
    ? 'http://localhost:8000'
    : 'https://semantic-document-research.onrender.com');


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

export const api = {
  getApiUrl(): string {
    return API_BASE;
  },

  isCloud(): boolean {
    return !isLocalhost && API_BASE.includes('onrender.com');
  },

  async getStatus(): Promise<ApiStatus> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${API_BASE}/`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Backend responded with status ${res.status}`);
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
        error: err.name === 'AbortError' ? 'Connecting to backend timed out' : (err.message || 'Cannot connect to backend')
      };
    }
  },

  async getDocuments(): Promise<DocumentsResponse> {
    const res = await fetch(`${API_BASE}/documents`);

    return handleResponse<DocumentsResponse>(res);
  },

  async uploadDocument(
    file: File,
    chunkSize: number = 300,
    overlap: number = 50
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('chunk_size', chunkSize.toString());
    formData.append('overlap', overlap.toString());

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });
    return handleResponse<UploadResponse>(res);
  },

  async deleteDocument(filename: string): Promise<{ filename: string; message: string }> {
    const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    return handleResponse(res);
  },

  async search(
    query: string,
    topK: number = 5,
    distanceThreshold: number | null = 1.5
  ): Promise<SearchResponse> {
    const res = await fetch(`${API_BASE}/search`, {
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
    const res = await fetch(`${API_BASE}/ask`, {
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
    const res = await fetch(
      `${API_BASE}/reindex?chunk_size=${chunkSize}&overlap=${overlap}`,
      { method: 'POST' }
    );
    return handleResponse<ReindexResponse>(res);
  }
};
