import React, { useState } from 'react';
import { Files, Trash2, FileText, Layers, Hash } from 'lucide-react';
import type { DocumentItem } from '../types';
import { api } from '../api';

interface DocumentLibraryProps {
  documents: DocumentItem[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const DocumentLibrary: React.FC<DocumentLibraryProps> = ({
  documents,
  isLoading,
  onRefresh
}) => {
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}" from the vector index?`)) {
      return;
    }

    setDeletingDoc(filename);
    try {
      await api.deleteDocument(filename);
      onRefresh();
    } catch (err: any) {
      alert(`Failed to delete document: ${err.message}`);
    } finally {
      setDeletingDoc(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all indexed documents from the library?')) {
      return;
    }
    try {
      await api.clearDocuments();
      onRefresh();
    } catch (err: any) {
      alert(`Failed to clear library: ${err.message}`);
    }
  };

  return (
    <div className="research-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          <Files size={18} />
          Indexed Document Library
        </h2>
        {documents.length > 0 && (
          <button
            className="btn btn-secondary"
            onClick={handleClearAll}
            style={{ fontSize: '12px', padding: '4px 10px' }}
            title="Clear all documents from vector store"
          >
            <Trash2 size={13} />
            <span>Clear Library</span>
          </button>
        )}
      </div>
      <p className="card-description">
        Browse indexed documents, view page and chunk breakdowns, or delete documents from the vector store.
      </p>

      {isLoading ? (
        <div className="empty-state">
          <p>Loading document index...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <FileText size={36} />
          </div>
          <div className="empty-title">No documents indexed yet</div>
          <p className="empty-desc">
            Upload a research PDF or DOCX file above to start semantic search and AI question answering.
          </p>
        </div>
      ) : (

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>File Format</th>
                <th>Pages</th>
                <th>Chunks Indexed</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const ext = doc.document_name.split('.').pop()?.toUpperCase() || 'FILE';
                return (
                  <tr key={doc.document_name}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
                        <FileText size={16} color="var(--accent)" />
                        <span>{doc.document_name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge">{ext}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Layers size={13} color="var(--text-subtle)" />
                        <span>{doc.page_count}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Hash size={13} color="var(--text-subtle)" />
                        <span>{doc.chunk_count}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                        disabled={deletingDoc === doc.document_name}
                        onClick={() => handleDelete(doc.document_name)}
                        title="Remove document from index"
                      >
                        <Trash2 size={13} />
                        <span>{deletingDoc === doc.document_name ? 'Deleting...' : 'Delete'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
