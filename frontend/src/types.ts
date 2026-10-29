export interface DocumentItem {
  document_name: string;
  chunk_count: number;
  page_count: number;
}

export interface DocumentsResponse {
  total_documents: number;
  total_chunks: number;
  documents: DocumentItem[];
}

export interface ChunkResult {
  document_name: string;
  page_number: number;
  chunk_id: number;
  text: string;
  distance: number;
  metric?: string;
}

export interface SearchResponse {
  query: string;
  total_results: number;
  results: ChunkResult[];
}

export interface SourceReference {
  document_name: string;
  page_number: number;
  chunk_id: number;
}

export interface AskResponse {
  question: string;
  answer: string;
  llm_status: 'success' | 'unavailable' | 'error' | 'no_context';
  llm_error: string | null;
  retrieved_chunks: ChunkResult[];
  sources: SourceReference[];
}

export interface UploadResponse {
  filename: string;
  file_type: string;
  pages: number;
  chunks_created: number;
  chunks_stored: number;
  message: string;
}

export interface ReindexResponse {
  message: string;
  total_documents_indexed: number;
  total_chunks_stored: number;
  processed_documents: Array<{
    filename: string;
    chunks: number;
    pages: number;
  }>;
  errors: Array<{
    filename: string;
    error: string;
  }>;
}

export interface ApiStatus {
  online: boolean;
  indexedChunks: number;
  error?: string;
}
