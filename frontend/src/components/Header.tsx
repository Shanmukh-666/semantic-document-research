import React from 'react';
import { BookOpen, RefreshCw, Database, Cloud, Server } from 'lucide-react';
import type { ApiStatus } from '../types';
import { api, CLOUD_API_URL, LOCAL_API_URL } from '../api';

interface HeaderProps {
  status: ApiStatus;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({ status, onRefresh, isRefreshing }) => {
  const isCloud = api.isCloud();

  const handleToggleBackend = () => {
    const nextUrl = isCloud ? LOCAL_API_URL : CLOUD_API_URL;
    api.setApiUrl(nextUrl);
    onRefresh();
  };

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
        {/* Backend Target Selector Button */}
        <button
          className="btn btn-secondary"
          onClick={handleToggleBackend}
          title={`Active API: ${status.apiUrl || api.getApiUrl()}. Click to switch target.`}
          style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {isCloud ? <Cloud size={14} color="var(--accent)" /> : <Server size={14} color="var(--accent)" />}
          <span>{isCloud ? 'Cloud API' : 'Local API'}</span>
        </button>

        {/* Online/Offline Status Indicator */}
        <div
          className={`status-badge ${status.online ? 'online' : 'offline'}`}
          title={`Backend API: ${status.apiUrl || 'detecting...'}`}
        >
          <span className="status-dot" />
          <span>{status.online ? 'Online' : 'Offline'}</span>
        </div>

        {status.online && (
          <div className="status-badge">
            <Database size={13} style={{ marginRight: 4 }} />
            <span>{status.indexedChunks} chunks</span>
          </div>
        )}

        <button
          className="btn btn-secondary"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh backend status and reload index"
          style={{ padding: '6px 12px', fontSize: '13px' }}
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
};
