import React from 'react';
import { BookOpen, RefreshCw, Database } from 'lucide-react';
import type { ApiStatus } from '../types';

interface HeaderProps {
  status: ApiStatus;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({ status, onRefresh, isRefreshing }) => {
  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-logo">
          <BookOpen size={20} />
        </div>
        <div>
          <h1 className="brand-title">Semantic Document Research</h1>
          <p className="brand-subtitle">Evidence-Grounded NLP Retrieval & Question Answering</p>
        </div>
      </div>

      <div className="header-meta">

        {status.online && (
          <div className="status-badge">
            <Database size={13} style={{ marginRight: 4 }} />
            <span>{status.indexedChunks} indexed chunks</span>
          </div>
        )}

        <button
          className="btn btn-secondary"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh backend status"
          style={{ padding: '6px 12px', fontSize: '13px' }}
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
};
