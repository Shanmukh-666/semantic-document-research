import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Settings2,
  Loader2,
  XCircle,
  Search,
  MessageSquareText,
  PlusCircle,
  Layers,
  Hash,
  Wifi
} from 'lucide-react';
import { api } from '../api';
import type { UploadResponse, ReindexResponse, DocumentItem } from '../types';

interface UploadSectionProps {
  onSuccess: (uploadedDoc?: DocumentItem) => void;
  onNavigateTab?: (tab: 'ask' | 'search' | 'library') => void;
  isBackendOnline?: boolean;
}

export const UploadSection: React.FC<UploadSectionProps> = ({ onSuccess, onNavigateTab, isBackendOnline }) => {
  const [chunkSize, setChunkSize] = useState<number>(300);
  const [overlap, setOverlap] = useState<number>(50);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isWakingUp, setIsWakingUp] = useState<boolean>(false);
  const [wakeUpMessage, setWakeUpMessage] = useState<string>('');
  const [uploadingFileName, setUploadingFileName] = useState<string>('');
  const [uploadingFileSize, setUploadingFileSize] = useState<string>('');
  const [isReindexing, setIsReindexing] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [lastUploaded, setLastUploaded] = useState<UploadResponse | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleCancelUpload = () => {
    cancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsWakingUp(false);
    setIsUploading(false);
    setUploadingFileName('');
    setUploadingFileSize('');
    setWakeUpMessage('');
    setFeedback({
      type: 'info',
      message: 'Upload was cancelled.'
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processFile = async (file: File) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const validExtensions = ['.pdf', '.docx'];
    if (!validExtensions.includes(ext)) {
      setFeedback({
        type: 'error',
        message: `Unsupported file format '${ext}'. Please upload a PDF or DOCX file.`
      });
      return;
    }

    cancelledRef.current = false;
    setLastUploaded(null);
    setFeedback(null);
    setUploadingFileName(file.name);
    setUploadingFileSize(formatFileSize(file.size));

    // Only attempt wake-up if backend is not already confirmed online
    if (!isBackendOnline) {
      setIsWakingUp(true);
      setWakeUpMessage('Checking cloud server connection...');

      const isOnline = await api.waitForBackend(45000, (msg) => {
        if (!cancelledRef.current) {
          setWakeUpMessage(msg);
        }
      });

      if (cancelledRef.current) return;

      if (!isOnline) {
        setIsWakingUp(false);
        setFeedback({
          type: 'error',
          message: 'The cloud server is currently waking up (~30–50s). Please wait a moment and try again.'
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setIsWakingUp(false);
    }

    // Step 2: Upload the file directly
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsUploading(true);

    try {
      const res: UploadResponse = await api.uploadDocument(
        file,
        chunkSize,
        overlap,
        controller.signal
      );
      if (!cancelledRef.current) {
        setLastUploaded(res);
        setFeedback(null);
        onSuccess({
          document_name: res.filename,
          chunk_count: res.chunks_stored,
          page_count: res.pages
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || cancelledRef.current) {
        return;
      }
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to upload and index document.'
      });
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
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
    if (
      !window.confirm(
        'This will safely clear the current vector index and re-index all uploaded and sample documents with the selected chunk settings. Continue?'
      )
    ) {
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

  const isBusy = isWakingUp || isUploading;

  return (
    <div className="research-card">
      <h2 className="card-title">
        <UploadCloud size={18} />
        Document Ingestion &amp; Chunking
      </h2>
      <p className="card-description">
        Upload research PDFs or Word documents (DOCX). Texts are parsed, segmented with sentence-aware boundaries, embedded into 384-dimensional vectors, and indexed in ChromaDB.
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
            disabled={isReindexing || isBusy}
            title="Re-index all documents with current chunk parameters"
            style={{ fontSize: '13px', padding: '6px 12px' }}
          >
            <RefreshCw size={13} className={isReindexing ? 'spin' : ''} />
            <span>{isReindexing ? 'Re-indexing...' : 'Re-index Library'}</span>
          </button>
        </div>
      </div>

      {/* 1. WAKING UP STATE: Backend cold start */}
      {isWakingUp ? (
        <div
          style={{
            border: '2px dashed var(--accent)',
            borderRadius: 'var(--radius-lg)',
            padding: '40px 24px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-subtle)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16
          }}
        >
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <Wifi size={44} className="spin" color="var(--accent)" style={{ animationDuration: '2s' }} />
          </div>

          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: 4 }}>
              Waking Up Cloud Server
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              <strong>{uploadingFileName}</strong>{uploadingFileSize && ` (${uploadingFileSize})`} ready to upload
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-subtle)', marginTop: 4 }}>
              {wakeUpMessage || 'Connecting to Render cloud server...'}
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: 4, opacity: 0.7 }}>
              💡 Free Render instances sleep when inactive. First request takes ~30–50s to wake up.
            </p>
          </div>

          <button
            className="btn btn-danger"
            onClick={handleCancelUpload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', marginTop: 8 }}
          >
            <XCircle size={15} />
            <span>Cancel</span>
          </button>
        </div>

      ) : isUploading ? (
        /* 2. UPLOADING STATE */
        <div
          style={{
            border: '2px dashed var(--accent)',
            borderRadius: 'var(--radius-lg)',
            padding: '40px 24px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-subtle)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16
          }}
        >
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <Loader2 size={44} className="spin" color="var(--accent)" />
          </div>

          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: 4 }}>
              Uploading &amp; Indexing Document
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              <strong>{uploadingFileName}</strong> {uploadingFileSize && `(${uploadingFileSize})`}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-subtle)', marginTop: 4 }}>
              Extracting text, computing sentence-aware chunks &amp; generating ONNX embeddings...
            </p>
          </div>

          <button
            className="btn btn-danger"
            onClick={handleCancelUpload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', marginTop: 8 }}
          >
            <XCircle size={15} />
            <span>Cancel Upload</span>
          </button>
        </div>

      ) : lastUploaded ? (
        /* 3. SUCCESS STATE */
        <div
          style={{
            border: '1px solid var(--success-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '32px 24px',
            backgroundColor: 'var(--success-bg)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16
          }}
        >
          <CheckCircle2 size={48} color="var(--success)" />

          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>
              Document Successfully Indexed!
            </h3>
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-main)' }}>
              {lastUploaded.filename}
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <FileText size={12} /> {lastUploaded.file_type}
              </span>
              <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Layers size={12} /> {lastUploaded.pages} {lastUploaded.pages === 1 ? 'Page' : 'Pages'}
              </span>
              <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Hash size={12} /> {lastUploaded.chunks_stored} Chunks Stored
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setLastUploaded(null);
                setFeedback(null);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <PlusCircle size={15} />
              <span>Upload Another Document</span>
            </button>

            {onNavigateTab && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => onNavigateTab('search')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Search size={15} />
                  <span>Semantic Search</span>
                </button>

                <button
                  className="btn btn-primary"
                  onClick={() => onNavigateTab('ask')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <MessageSquareText size={15} />
                  <span>Ask AI Questions</span>
                </button>
              </>
            )}
          </div>
        </div>

      ) : (
        /* 4. IDLE STATE: Default Drag & Drop box */
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
            Click to select or drag and drop document
          </div>
          <div className="dropzone-hint">
            Supports research PDF and DOCX files
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      {feedback && (
        <div style={{ marginTop: 16 }}>
          <div className={`alert ${feedback.type === 'success' ? 'alert-info' : feedback.type === 'info' ? 'alert-info' : 'alert-danger'}`}>
            {feedback.type === 'success' || feedback.type === 'info' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};
