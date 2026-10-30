import { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { UploadSection } from './components/UploadSection';
import { DocumentLibrary } from './components/DocumentLibrary';
import { SearchWorkspace } from './components/SearchWorkspace';
import { AskWorkspace } from './components/AskWorkspace';
import { api } from './api';
import type { ApiStatus, DocumentItem } from './types';
import { MessageSquareText, Search, Files, AlertCircle, Wifi } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'ask' | 'search' | 'library'>('ask');
  const [status, setStatus] = useState<ApiStatus>({ online: false, indexedChunks: 0 });
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(false);
  const [isWakingUp, setIsWakingUp] = useState<boolean>(false);
  const wakeUpAttemptedRef = useRef<boolean>(false);

  const loadDocuments = async () => {
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
  };

  const fetchStatusAndDocs = async () => {
    setIsRefreshing(true);
    const s = await api.getStatus();
    setStatus(s);

    if (s.online) {
      await loadDocuments();
    }
    setIsRefreshing(false);
  };

  // On startup: quietly try to wake up the backend in the background
  const wakeBackgroundBackend = async () => {
    if (wakeUpAttemptedRef.current) return;
    wakeUpAttemptedRef.current = true;

    // First quick check
    const s = await api.getStatus();
    setStatus(s);

    if (s.online) {
      await loadDocuments();
      return;
    }

    // Backend sleeping — show waking up indicator and poll
    setIsWakingUp(true);
    const isOnline = await api.waitForBackend(90000);
    setIsWakingUp(false);

    if (isOnline) {
      const s2 = await api.getStatus();
      setStatus(s2);
      if (s2.online) {
        await loadDocuments();
      }
    }
  };

  useEffect(() => {
    wakeBackgroundBackend();

    // Periodic lightweight status poll every 20s
    const interval = setInterval(() => {
      api.getStatus().then(s => {
        setStatus(prev => {
          // If we just came online, load documents
          if (!prev.online && s.online) {
            loadDocuments();
          }
          return s;
        });
      });
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      <Header
        status={status}
        onRefresh={fetchStatusAndDocs}
        isRefreshing={isRefreshing}
      />

      {/* Backend Status Banners */}
      {isWakingUp && !status.online && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Wifi size={18} style={{ flexShrink: 0, marginTop: 2 }} className="spin" />
          <div>
            <strong>Waking up cloud server...</strong> The Render cloud backend is starting up after being idle.
            <div style={{ marginTop: 6, fontSize: '13px', opacity: 0.9 }}>
              💡 Free Render instances sleep when inactive. This takes ~30–50 seconds on first load. You can start using the app as soon as the status shows <strong>Backend Online</strong>.
            </div>
          </div>
        </div>
      )}

      {!status.online && !isWakingUp && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Backend Offline:</strong> Cannot connect to the cloud server.
            <div style={{ marginTop: 6, fontSize: '13px', opacity: 0.9 }}>
              Click <strong>Refresh</strong> in the header to retry, or wait ~30–50 seconds for the Render instance to wake up.
            </div>
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
          <span>Research Q&amp;A</span>
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
      {activeTab === 'ask' && (
        <AskWorkspace
          documentCount={documents.length}
          onNavigateToUpload={() => setActiveTab('library')}
        />
      )}

      {activeTab === 'search' && <SearchWorkspace />}

      {activeTab === 'library' && (
        <div>
          <UploadSection onSuccess={fetchStatusAndDocs} onNavigateTab={setActiveTab} />
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
