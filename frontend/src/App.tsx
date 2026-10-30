import { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { UploadSection } from './components/UploadSection';
import { DocumentLibrary } from './components/DocumentLibrary';
import { SearchWorkspace } from './components/SearchWorkspace';
import { AskWorkspace } from './components/AskWorkspace';
import { api } from './api';
import type { ApiStatus, DocumentItem } from './types';
import { MessageSquareText, Search, Files, AlertCircle, Wifi } from 'lucide-react';

const LOCAL_STORAGE_KEY = 'semantic_research_local_documents';

function getStoredDocuments(): DocumentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredDocuments(docs: DocumentItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(docs));
  } catch {
    // ignore
  }
}

export function App() {
  const [activeTab, setActiveTab] = useState<'ask' | 'search' | 'library'>('ask');
  const [status, setStatus] = useState<ApiStatus>({ online: false, indexedChunks: 0 });
  // Initialize from local browser storage so documents are immediately displayed
  const [documents, setDocuments] = useState<DocumentItem[]>(getStoredDocuments);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(false);
  const [isWakingUp, setIsWakingUp] = useState<boolean>(false);
  const [isInitialCheckDone, setIsInitialCheckDone] = useState<boolean>(false);
  const wakeUpAttemptedRef = useRef<boolean>(false);

  const loadDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const docRes = await api.getDocuments();
      const serverDocs = docRes.documents;

      setDocuments(() => {
        const mergedMap = new Map<string, DocumentItem>();
        // Add previously stored local documents
        getStoredDocuments().forEach(d => mergedMap.set(d.document_name, d));
        // Add or update with server-verified documents
        serverDocs.forEach(d => mergedMap.set(d.document_name, d));
        const merged = Array.from(mergedMap.values());
        saveStoredDocuments(merged);
        return merged;
      });

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

  // Called immediately when a document is uploaded
  const handleDocumentUploaded = (newDoc?: DocumentItem) => {
    if (newDoc) {
      setDocuments(prev => {
        const updated = [...prev.filter(d => d.document_name !== newDoc.document_name), newDoc];
        saveStoredDocuments(updated);
        return updated;
      });
    }
    fetchStatusAndDocs();
  };

  // Called when user deletes a document
  const handleDeleteDocument = (filename: string) => {
    setDocuments(prev => {
      const updated = prev.filter(d => d.document_name !== filename);
      saveStoredDocuments(updated);
      return updated;
    });
  };

  // Called when user clears the library
  const handleClearAllDocuments = () => {
    setDocuments([]);
    saveStoredDocuments([]);
  };

  // On startup: quietly wake up the backend in the background
  const wakeBackgroundBackend = async () => {
    if (wakeUpAttemptedRef.current) return;
    wakeUpAttemptedRef.current = true;

    try {
      const s = await api.getStatus();
      setStatus(s);

      if (s.online) {
        await loadDocuments();
        return;
      }

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
    } finally {
      setIsInitialCheckDone(true);
    }
  };

  useEffect(() => {
    wakeBackgroundBackend();

    // Periodic lightweight status poll every 20s
    const interval = setInterval(async () => {
      const s = await api.getStatus();
      setStatus(prev => {
        // If we were already confirmed online, do not flap to offline on a single transient poll hiccup
        if (!s.online && prev.online) {
          return prev;
        }
        if (!prev.online && s.online) {
          loadDocuments();
        }
        return s;
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
              💡 Free Render instances sleep when inactive. This takes ~30–50 seconds on first load. You can start searching as soon as the status shows <strong>Backend Online</strong>.
            </div>
          </div>
        </div>
      )}

      {!status.online && !isWakingUp && isInitialCheckDone && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Backend Offline:</strong> Connecting to the cloud server...
            <div style={{ marginTop: 6, fontSize: '13px', opacity: 0.9 }}>
              Click <strong>Refresh</strong> in the header to retry, or allow ~30–50 seconds for the Render instance to wake up.
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
          <UploadSection
            onSuccess={handleDocumentUploaded}
            onNavigateTab={setActiveTab}
            isBackendOnline={status.online}
          />
          <DocumentLibrary
            documents={documents}
            isLoading={isLoadingDocs}
            onRefresh={fetchStatusAndDocs}
            onDeleteDocument={handleDeleteDocument}
            onClearAll={handleClearAllDocuments}
          />
        </div>
      )}
    </div>
  );
}

export default App;
