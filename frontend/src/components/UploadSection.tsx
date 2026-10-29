import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, RefreshCw, Settings2 } from 'lucide-react';
import { api } from '../api';
import type { UploadResponse, ReindexResponse } from '../types';

interface UploadSectionProps {
  onSuccess: () => void;
}

export const UploadSection: React.FC<UploadSectionProps> = ({ onSuccess }) => {
  const [chunkSize, setChunkSize] = useState<number>(300);
  const [overlap, setOverlap] = useState<number>(50);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isReindexing, setIsReindexing] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.pdf' && ext !== '.docx') {
      setFeedback({
        type: 'error',
        message: `Unsupported file format '${ext}'. Please upload a PDF or DOCX file.`
      });
      return;
    }

    setIsUploading(true);
    setFeedback(null);

    try {
      const res: UploadResponse = await api.uploadDocument(file, chunkSize, overlap);
      setFeedback({
        type: 'success',
        message: `Successfully indexed "${res.filename}" (${res.pages} pages, ${res.chunks_stored} chunks created).`
      });
      onSuccess();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to upload and index document.'
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleReindex = async () => {
    if (!window.confirm('This will safely clear the current vector index and re-index all uploaded and sample documents with the selected chunk settings. Continue?')) {
      return;
    }
    setIsReindexing(true);
    setFeedback(null);
    try {
      const res: ReindexResponse = await api.reindex(chunkSize, overlap);
      setFeedback({
        type: 'success',
        message: `Re-indexing complete: ${res.total_documents_indexed} documents processed (${res.total_chunks_stored} total chunks).`
      });
      onSuccess();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to re-index documents.'
      });
    } finally {
      setIsReindexing(false);
    }
  };

  return (
    <div className="research-card">
      <h2 className="card-title">
        <UploadCloud size={18} />
        Document Ingestion & Chunking
      </h2>
      <p className="card-description">
        Upload research PDFs or Word documents (DOCX). Texts are normalized, divided with sentence-aware boundaries, embedded via Sentence Transformers, and stored in ChromaDB.
      </p>

      {/* Chunking configuration parameters */}
      <div className="controls-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
          <Settings2 size={16} color="var(--text-muted)" />
          <strong style={{ fontSize: '13px' }}>Chunk Settings:</strong>
        </div>

        <div className="control-item">
          <label htmlFor="chunkSizeInput">Max Words:</label>
          <input
            id="chunkSizeInput"
            type="range"
            min="100"
            max="600"
            step="10"
            value={chunkSize}
            onChange={(e) => {
              const newSize = Number(e.target.value);
              setChunkSize(newSize);
              if (overlap >= newSize) {
                setOverlap(Math.max(0, newSize - 10));
              }
            }}
          />
          <span className="control-value">{chunkSize} words</span>
        </div>

        <div className="control-item">
          <label htmlFor="overlapInput">Overlap:</label>
          <input
            id="overlapInput"
            type="range"
            min="0"
            max="300"
            step="5"
            value={overlap}
            onChange={(e) => {
              const val = Number(e.target.value);
              setOverlap(Math.min(val, chunkSize - 10));
            }}
          />
          <span className="control-value">{overlap} words</span>
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <button
            className="btn btn-secondary"
            onClick={handleReindex}
            disabled={isReindexing || isUploading}
            title="Re-index all documents with current chunk parameters"
            style={{ fontSize: '13px', padding: '6px 12px' }}
          >
            <RefreshCw size={13} className={isReindexing ? 'spin' : ''} />
            <span>{isReindexing ? 'Re-indexing...' : 'Re-index Library'}</span>
          </button>
        </div>
      </div>

      {/* Drag & Drop Box */}
      <div
        className={`dropzone ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div className="dropzone-icon">
          <FileText size={32} />
        </div>
        <div className="dropzone-title">
          {isUploading ? 'Extracting, chunking and embedding...' : 'Click to select or drag and drop document'}
        </div>
        <div className="dropzone-hint">
          Supports research PDF and DOCX files
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div style={{ marginTop: 16 }}>
          <div className={`alert ${feedback.type === 'success' ? 'alert-info' : 'alert-danger'}`}>
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};
