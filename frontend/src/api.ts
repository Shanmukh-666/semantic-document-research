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

const API_BASE =
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
  async getStatus(): Promise<ApiStatus> {
    try {
      const res = await fetch(`${API_BASE}/`);
      if (!res.ok) throw new Error('Backend responded with error');
      const data = await res.json();
      return {
        online: true,
        indexedChunks: data.indexed_chunks ?? 0
      };
    } catch (err: any) {
      return {
        online: false,
        indexedChunks: 0,
        error: err.message || 'Cannot connect to backend'
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
