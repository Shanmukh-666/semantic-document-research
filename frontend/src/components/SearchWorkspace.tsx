import React, { useState } from 'react';
import { Search, Sliders, Copy, Check, FileText, Info } from 'lucide-react';
import { api } from '../api';
import type { ChunkResult } from '../types';

export const SearchWorkspace: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [topK, setTopK] = useState<number>(5);
  const [distanceThreshold] = useState<number | null>(1.5);
  const [enableThreshold, setEnableThreshold] = useState<boolean>(true);
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);
    setHasSearched(true);

    try {
      const res = await api.search(
        query.trim(),
        topK,
        enableThreshold ? distanceThreshold : null
      );
      setResults(res.results);
    } catch (err: any) {
      setError(err.message || 'Semantic search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="research-card">
      <h2 className="card-title">
        <Search size={18} />
        Semantic Similarity Search
      </h2>
      <p className="card-description">
        Vector similarity search converts your query into a dense 384-dimensional embedding and retrieves the closest passages based on ChromaDB L2 distance.
      </p>

      {/* Query Input */}
      <form onSubmit={handleSearch}>
        <div className="input-group">
          <input
            type="text"
            className="text-input"
            placeholder="Enter research query or technical concept (e.g. 'clinical EHR extraction with transformers')..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSearching || !query.trim()}
          >
            <Search size={16} />
            <span>{isSearching ? 'Searching...' : 'Search'}</span>
          </button>
        </div>
      </form>

      {/* Parameter Controls */}
      <div className="controls-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
          <Sliders size={16} color="var(--text-muted)" />
          <strong style={{ fontSize: '13px' }}>Retrieval Parameters:</strong>
        </div>

        <div className="control-item">
          <label htmlFor="topKInput">Top-k Passages:</label>
          <input
            id="topKInput"
            type="range"
            min="1"
            max="15"
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
          />
          <span className="control-value">{topK}</span>
        </div>

        <div className="control-item" style={{ gap: 8 }}>
          <input
            type="checkbox"
            id="enableThreshold"
            checked={enableThreshold}
            onChange={(e) => setEnableThreshold(e.target.checked)}
          />
          <label htmlFor="enableThreshold">Filter L2 &le; 1.5</label>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--text-subtle)' }}>
          <Info size={13} />
          <span>Metric: L2 distance (lower = closer match; raw distance is not a probability percentage)</span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="alert alert-danger">
          <span>{error}</span>
        </div>
      )}

      {/* Results List */}
      {isSearching ? (
        <div className="empty-state">
          <p>Computing query embedding and searching vector store...</p>
        </div>
      ) : hasSearched && results.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">No matching passages found</div>
          <p className="empty-desc">
            No document chunks matched your query within the selected distance threshold. Try rephrasing or relaxing the filter.
          </p>
        </div>
      ) : (
        results.length > 0 && (
          <div>
            <div className="passages-header">
              <span className="passages-count">Retrieved {results.length} relevant passage(s)</span>
            </div>

            {results.map((chunk, idx) => {
              const cardId = `${chunk.document_name}-${chunk.chunk_id}-${idx}`;
              return (
                <div key={cardId} className="passage-card">
                  <div className="passage-meta">
                    <div className="meta-badges">
                      <span className="badge doc-badge">
                        <FileText size={12} style={{ display: 'inline', marginRight: 4 }} />
                        {chunk.document_name}
                      </span>
                      <span className="badge">Page {chunk.page_number}</span>
                      <span className="badge">Chunk #{chunk.chunk_id}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="distance-metric">
                        L2 Distance: <strong>{chunk.distance.toFixed(4)}</strong>
                      </span>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                        onClick={() => copyToClipboard(chunk.text, cardId)}
                        title="Copy passage text"
                      >
                        {copiedId === cardId ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                        <span>{copiedId === cardId ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  <p className="passage-text">{chunk.text}</p>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};
