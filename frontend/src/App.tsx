import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { UploadSection } from './components/UploadSection';
import { DocumentLibrary } from './components/DocumentLibrary';
import { SearchWorkspace } from './components/SearchWorkspace';
import { AskWorkspace } from './components/AskWorkspace';
import { api } from './api';
import type { ApiStatus, DocumentItem } from './types';
import { MessageSquareText, Search, Files, AlertCircle } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'ask' | 'search' | 'library'>('ask');
  const [status, setStatus] = useState<ApiStatus>({ online: false, indexedChunks: 0 });
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(false);

  const fetchStatusAndDocs = async () => {
    setIsRefreshing(true);
    const s = await api.getStatus();
    setStatus(s);

    if (s.online) {
      setIsLoadingDocs(true);
      try {
        const docRes = await api.getDocuments();
        setDocuments(docRes.documents);
        setStatus(prev => ({ ...prev, indexedChunks: docRes.total_chunks }));
      } catch (err) {
        console.error('Failed to load documents:', err);
      } finally {
        setIsLoadingDocs(false);
      }
    }
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchStatusAndDocs();
    const interval = setInterval(() => {
      api.getStatus().then(s => setStatus(s));
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      <Header
        status={status}
        onRefresh={fetchStatusAndDocs}
        isRefreshing={isRefreshing}
      />

      {/* Backend Disconnected Alert */}
      {!status.online && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Backend API is currently unreachable:</strong> Unable to connect to{' '}
            <code>{status.apiUrl || api.getApiUrl()}</code>.
            {api.isCloud() ? (
              <div style={{ marginTop: 6, fontSize: '13px', opacity: 0.9 }}>
                💡 <em>Cloud instance status:</em> Free Render cloud instances automatically spin down when inactive. If the server is waking up, please allow ~30–50 seconds and click the <strong>Refresh</strong> button in the header.
              </div>
            ) : (
              <div style={{ marginTop: 6, fontSize: '13px', opacity: 0.9 }}>
                Ensure your local FastAPI server is running with <code>uvicorn main:app --reload</code> in the <code>backend/</code> folder.
              </div>
            )}
          </div>
        </div>
      )}


      {/* Navigation Tabs */}
      <nav className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'ask' ? 'active' : ''}`}
          onClick={() => setActiveTab('ask')}
        >
          <MessageSquareText size={16} />
          <span>Research Q&A</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <Search size={16} />
          <span>Semantic Search</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          <Files size={16} />
          <span>Document Library ({documents.length})</span>
        </button>
      </nav>

      {/* Tab Panels */}
      {activeTab === 'ask' && <AskWorkspace />}

      {activeTab === 'search' && <SearchWorkspace />}

      {activeTab === 'library' && (
        <div>
          <UploadSection onSuccess={fetchStatusAndDocs} />
          <DocumentLibrary
            documents={documents}
            isLoading={isLoadingDocs}
            onRefresh={fetchStatusAndDocs}
          />
        </div>
      )}
    </div>
  );
}

export default App;
