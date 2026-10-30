import type {
  DocumentsResponse,
  SearchResponse,
  AskResponse,
  UploadResponse,
  ReindexResponse,
  ApiStatus
} from './types';

export const CLOUD_API_URL = 'https://semantic-document-research.onrender.com';
export const LOCAL_API_URL = 'http://127.0.0.1:8000';

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
   window.location.hostname === '127.0.0.1');

// Determine initial active URL
function getInitialApiUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('custom_api_url');
    if (saved) return saved;
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return isLocalhost ? LOCAL_API_URL : CLOUD_API_URL;
}

let currentApiUrl = getInitialApiUrl();

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
    const targetUrl = api.getApiUrl();
    const isCloud = api.isCloud();
    const reason = isCloud
      ? `Unable to connect to Render Cloud API (${targetUrl}). The instance may be waking from spin-down (~30s). Please wait a moment and click Refresh.`
      : `Unable to connect to local FastAPI server (${targetUrl}). Ensure backend is running or switch to Cloud API.`;
    throw new Error(reason);
  }
}

export const api = {
  getApiUrl(): string {
    return currentApiUrl;
  },

  setApiUrl(url: string) {
    currentApiUrl = url;
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_api_url', url);
    }
  },

  isCloud(): boolean {
    return currentApiUrl.includes('onrender.com');
  },

  isLocal(): boolean {
    return currentApiUrl.includes('127.0.0.1') || currentApiUrl.includes('localhost');
  },

  async getStatus(): Promise<ApiStatus> {
    const checkEndpoint = async (url: string): Promise<ApiStatus | null> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(`${url}/`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) return null;
        const data = await res.json();
        return {
          online: true,
          indexedChunks: data.indexed_chunks ?? 0,
          apiUrl: url
        };
      } catch {
        return null;
      }
    };

    // 1. Try current API URL
    const status = await checkEndpoint(currentApiUrl);
    if (status) return status;

    // 2. On localhost, if local backend is down, auto-fallback to Cloud API
    if (isLocalhost && currentApiUrl === LOCAL_API_URL) {
      const cloudStatus = await checkEndpoint(CLOUD_API_URL);
      if (cloudStatus) {
        currentApiUrl = CLOUD_API_URL;
        return cloudStatus;
      }
    }

    return {
      online: false,
      indexedChunks: 0,
      apiUrl: currentApiUrl,
      error: api.isCloud()
        ? 'Render cloud server is currently waking up or unreachable. Please allow ~30s.'
        : 'FastAPI local server is offline on port 8000.'
    };
  },

  async getDocuments(): Promise<DocumentsResponse> {
    const res = await resilientFetch(`${currentApiUrl}/documents`);
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

    const res = await resilientFetch(`${currentApiUrl}/upload`, {
      method: 'POST',
      body: formData,
      signal
    });
    return handleResponse<UploadResponse>(res);
  },

  async deleteDocument(filename: string): Promise<{ filename: string; message: string }> {
    const res = await resilientFetch(`${currentApiUrl}/documents/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    return handleResponse(res);
  },

  async clearDocuments(): Promise<{ message: string; total_documents: number; total_chunks: number }> {
    const res = await resilientFetch(`${currentApiUrl}/documents/clear`, {
      method: 'POST'
    });
    return handleResponse(res);
  },

  async search(
    query: string,
    topK: number = 5,
    distanceThreshold: number | null = 1.5
  ): Promise<SearchResponse> {
    const res = await resilientFetch(`${currentApiUrl}/search`, {
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
    const res = await resilientFetch(`${currentApiUrl}/ask`, {
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
      `${currentApiUrl}/reindex?chunk_size=${chunkSize}&overlap=${overlap}`,
      { method: 'POST' }
    );
    return handleResponse<ReindexResponse>(res);
  }
};
