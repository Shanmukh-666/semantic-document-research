import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageSquareText, Sparkles, AlertTriangle, FileText, ChevronDown, ChevronUp, Copy, Check, Info } from 'lucide-react';
import { api } from '../api';
import type { AskResponse, ChunkResult } from '../types';

export const AskWorkspace: React.FC = () => {
  const [question, setQuestion] = useState<string>('');
  const [topK, setTopK] = useState<number>(5);
  const [isAsking, setIsAsking] = useState<boolean>(false);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);
  const [copiedAnswer, setCopiedAnswer] = useState<boolean>(false);

  const handleAsk = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!question.trim()) return;

    setIsAsking(true);
    setError(null);

    try {
      const res = await api.ask(question.trim(), topK);
      setResponse(res);
    } catch (err: any) {
      setError(err.message || 'Failed to generate answer.');
    } finally {
      setIsAsking(false);
    }
  };

  const copyAnswer = () => {
    if (response?.answer) {
      navigator.clipboard.writeText(response.answer);
      setCopiedAnswer(true);
      setTimeout(() => setCopiedAnswer(false), 2000);
    }
  };

  return (
    <div className="research-card">
      <h2 className="card-title">
        <MessageSquareText size={18} />
        Evidence-Grounded Question Answering (RAG)
      </h2>
      <p className="card-description">
        Ask a specific question. The system retrieves relevant passages from your indexed documents and provides them to the LLM to synthesize an evidence-grounded answer with citations.
      </p>

      {/* Input */}
      <form onSubmit={handleAsk}>
        <div className="input-group">
          <input
            type="text"
            className="text-input"
            placeholder="Ask a technical or research question about your uploaded documents..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isAsking || !question.trim()}
          >
            {isAsking ? (
              <>
                <Sparkles size={16} className="spin" />
                <span>Synthesizing...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Ask Question</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Parameter bar */}
      <div className="controls-row">
        <div className="control-item">
          <label htmlFor="ragTopK">Context Passages (top-k):</label>
          <input
            id="ragTopK"
            type="range"
            min="1"
            max="10"
            value={topK}
            disabled={isAsking}
            onChange={(e) => setTopK(Number(e.target.value))}
          />
          <span className="control-value">{topK} chunks</span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--text-subtle)' }}>
          <Info size={13} />
          <span>LLM is instructed to strictly cite retrieved sources and admit insufficient evidence</span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="alert alert-danger">
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isAsking && (
        <div className="empty-state" style={{ padding: '32px 20px' }}>
          <div className="empty-icon">
            <Sparkles size={32} className="spin" color="var(--accent)" />
          </div>
          <div className="empty-title">Retrieving evidence & synthesizing answer...</div>
          <p className="empty-desc">
            Context chunks retrieved from ChromaDB. Gemini is currently analyzing passages and formatting citations...
          </p>
          <div className="loading-bar-track">
            <div className="loading-bar-thumb"></div>
          </div>
        </div>
      )}

      {/* LLM Answer Display */}
      {response && !isAsking && (
        <div>
          {/* Warning banner if LLM was unavailable but search succeeded */}
          {response.llm_status === 'unavailable' && (
            <div className="alert alert-warning">
              <AlertTriangle size={16} />
              <div>
                <strong>LLM Generation Offline:</strong> {response.llm_error || 'GEMINI_API_KEY is not configured in backend environment.'}
                <div style={{ marginTop: 4, fontSize: '12px' }}>
                  Semantic retrieval succeeded. You can inspect the retrieved document passages below.
                </div>
              </div>
            </div>
          )}

          {response.llm_status === 'error' && (
            <div className="alert alert-danger">
              <AlertTriangle size={16} />
              <div>
                <strong>LLM Request Error:</strong> {response.llm_error}
                <div style={{ marginTop: 4, fontSize: '12px' }}>
                  Retrieved passages are displayed below.
                </div>
              </div>
            </div>
          )}

          <div className="answer-box">
            <div className="answer-header">
              <span className="answer-tag">
                <Sparkles size={13} />
                Synthesized Research Answer
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '12px' }}
                onClick={copyAnswer}
                title="Copy answer to clipboard"
              >
                {copiedAnswer ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                <span>{copiedAnswer ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="answer-content markdown-body">
              <ReactMarkdown>{response.answer}</ReactMarkdown>
            </div>
          </div>

          {/* Inspectable Source Passages */}
          <div className="passages-header">
            <span style={{ fontSize: '14px', fontWeight: 600 }}>
              Retrieved Context & Source Citations ({response.retrieved_chunks.length})
            </span>
            <span className="passages-count">Click passage to inspect exact text</span>
          </div>

          {response.retrieved_chunks.map((chunk: ChunkResult, idx: number) => {
            const chunkKey = `${chunk.document_name}-${chunk.chunk_id}-${idx}`;
            const isExpanded = expandedChunkId === chunkKey;

            return (
              <div key={chunkKey} className="passage-card" style={{ marginBottom: 10 }}>
                <div
                  className="passage-meta"
                  style={{ cursor: 'pointer', marginBottom: isExpanded ? 10 : 0 }}
                  onClick={() => setExpandedChunkId(isExpanded ? null : chunkKey)}
                >
                  <div className="meta-badges">
                    <span className="badge doc-badge">
                      <FileText size={12} style={{ display: 'inline', marginRight: 4 }} />
                      {chunk.document_name}
                    </span>
                    <span className="badge">Page {chunk.page_number}</span>
                    <span className="badge">Chunk #{chunk.chunk_id}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="distance-metric">
                      L2 Distance: <strong>{chunk.distance.toFixed(4)}</strong>
                    </span>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '2px 6px', fontSize: '11px', border: 'none' }}
                      type="button"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                    <p className="passage-text">{chunk.text}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
