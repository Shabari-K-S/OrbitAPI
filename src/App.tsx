import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

// --- Types ---
interface HttpResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

interface SavedRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  body: string;
}

interface Collection {
  id: string;
  name: string;
  requests: SavedRequest[];
  isOpen: boolean;
}

// --- Theme Colors ---
const THEMES = [
  { name: "Blue", color: "#007acc" },
  { name: "Green", color: "#4ec9b0" },
  { name: "Orange", color: "#e6b450" },
  { name: "Purple", color: "#c586c0" },
  { name: "Red", color: "#f44747" },
];

function App() {
  // --- Request State ---
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://httpbin.org/get");
  const [reqBody, setReqBody] = useState("");
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"body" | "headers">("body");
  const [error, setError] = useState("");

  // --- App Logic State ---
  const [activeView, setActiveView] = useState<"history" | "collections" | "env" | "settings">("history");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [history, setHistory] = useState<SavedRequest[]>([]);

  // --- Modals & Settings State ---
  const [isModalOpen, setIsModalOpen] = useState(false); // New Collection Modal
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState("#007acc");
  
  // --- NEW: Custom Popup States (Replaces alert/prompt) ---
  const [alertMsg, setAlertMsg] = useState<string | null>(null); // Replaces alert()
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false); // Replaces prompt()
  const [requestName, setRequestName] = useState("New Request");

  // Hidden input for file import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Layout State ---
  const [sidebarWidth, setSidebarWidth] = useState(260); 
  const [requestPaneWidth, setRequestPaneWidth] = useState(50);

  // --- Effects ---
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--accent-hover', adjustBrightness(accentColor, -20));
  }, [accentColor]);

  function adjustBrightness(col: string, amt: number) {
    let usePound = false;
    if (col[0] === "#") { col = col.slice(1); usePound = true; }
    let num = parseInt(col, 16);
    let r = (num >> 16) + amt; if (r > 255) r = 255; else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt; if (b > 255) b = 255; else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt; if (g > 255) g = 255; else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16);
  }

  // --- Import / Export Logic ---
  const exportData = () => {
    const data = {
      version: 1,
      timestamp: new Date().toISOString(),
      collections,
      history
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orbitapi_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.collections) setCollections(json.collections);
        if (json.history) setHistory(json.history);
        setAlertMsg("Data imported successfully!"); // Custom modal instead of alert
      } catch (err) {
        setAlertMsg("Failed to parse JSON file."); // Custom modal instead of alert
      }
    };
    reader.readAsText(file);
    event.target.value = ""; 
  };

  // --- Resizing Logic ---
  const startResizingSidebar = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = sidebarWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setSidebarWidth(Math.min(Math.max(startWidth + delta, 150), 600));
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const startResizingPane = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const workspaceElement = document.querySelector('.pane-container');
    if (!workspaceElement) return;
    const isVerticalMode = window.innerWidth <= 1200;
    const rect = workspaceElement.getBoundingClientRect();
    const containerSize = isVerticalMode ? rect.height : rect.width;
    const startPosition = isVerticalMode ? mouseDownEvent.clientY : mouseDownEvent.clientX;
    const startPercent = requestPaneWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentPosition = isVerticalMode ? moveEvent.clientY : moveEvent.clientX;
      const deltaPercent = ((currentPosition - startPosition) / containerSize) * 100;
      setRequestPaneWidth(Math.min(Math.max(startPercent + deltaPercent, 10), 90));
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // --- Actions ---
  async function handleSend() {
    if (!url) return;
    setLoading(true); setError(""); setResponse(null);
    try {
      const res = await invoke<HttpResponse>("send_request", {
        request: { method, url, headers: {}, body: reqBody },
      });
      setResponse(res);
      setHistory(prev => [{ id: crypto.randomUUID(), name: `${method} ${url}`, method, url, body: reqBody }, ...prev].slice(0, 50));
    } catch (e) {
      setError("Error: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  function openCollectionModal() { setNewCollectionName(""); setIsModalOpen(true); }
  function confirmCreateCollection() {
    if (!newCollectionName.trim()) { setIsModalOpen(false); return; }
    setCollections([...collections, { id: crypto.randomUUID(), name: newCollectionName, requests: [], isOpen: true }]);
    setIsModalOpen(false);
  }

  // --- NEW: Custom Save Logic ---
  function saveRequest() {
    if (collections.length === 0) { 
        setAlertMsg("Please create a collection first!"); 
        return; 
    }
    setRequestName("New Request");
    setIsSaveModalOpen(true); // Open custom modal instead of prompt
  }

  function confirmSaveRequest() {
    if (!requestName) return;
    const updatedCols = [...collections];
    // Saves to the first collection for now (logic from original code)
    updatedCols[0].requests.push({ id: crypto.randomUUID(), name: requestName, method, url, body: reqBody });
    setCollections(updatedCols);
    setIsSaveModalOpen(false);
  }

  function toggleCollection(id: string) { setCollections(collections.map(c => c.id === id ? { ...c, isOpen: !c.isOpen } : c)); }
  function loadRequest(req: SavedRequest) { setMethod(req.method); setUrl(req.url); setReqBody(req.body); setActiveView('history'); }
  function promptDeleteCollection(id: string, e: React.MouseEvent) { e.stopPropagation(); setCollectionToDelete(id); }
  function confirmDelete() { if (collectionToDelete) { setCollections(collections.filter(c => c.id !== collectionToDelete)); setCollectionToDelete(null); } }

  // Helper to close alert and handle redirect if needed
  function closeAlert() {
      const msg = alertMsg;
      setAlertMsg(null);
      if (msg === "Please create a collection first!") {
          setActiveView("collections");
          openCollectionModal();
      }
  }

  return (
    <div className="container">
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleFileImport} />

      <div className="sidebar" style={{ width: sidebarWidth }}>
        <h2 className="logo">OrbitAPI</h2>
        <div className="nav-menu">
          <div className={`nav-item ${activeView === 'history' ? 'active' : ''}`} onClick={() => setActiveView('history')}>History</div>
          <div className={`nav-item ${activeView === 'collections' ? 'active' : ''}`} onClick={() => setActiveView('collections')}>Collections</div>
          <div className={`nav-item ${activeView === 'env' ? 'active' : ''}`} onClick={() => setActiveView('env')}>Env</div>
        </div>
        <div className="sidebar-content">
          {activeView === 'history' && (
            <div className="list-container">
              {history.map(req => (
                <div key={req.id} className="list-item" onClick={() => loadRequest(req)}>
                  <span className={`method-tag ${req.method}`}>{req.method}</span>
                  <span className="url-truncate">{req.url}</span>
                </div>
              ))}
              {history.length === 0 && <div className="empty-sidebar">No history yet</div>}
            </div>
          )}
          {activeView === 'collections' && (
            <div className="list-container">
              <button className="new-btn" onClick={openCollectionModal}>+ New Collection</button>
              {collections.map(col => (
                <div key={col.id} className="collection-group">
                  <div className="collection-header" onClick={() => toggleCollection(col.id)}>
                    <span>{col.isOpen ? '▼' : '▶'} {col.name}</span>
                    <button className="icon-btn" onClick={(e) => promptDeleteCollection(col.id, e)}>×</button>
                  </div>
                  {col.isOpen && (
                    <div className="collection-items">
                      {col.requests.map(req => (
                        <div key={req.id} className="list-item sub-item" onClick={() => loadRequest(req)}>
                          <span className={`method-tag ${req.method}`}>{req.method}</span>
                          {req.name}
                        </div>
                      ))}
                      {col.requests.length === 0 && <div className="empty-sub">Empty</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {activeView === 'env' && <div className="empty-sidebar">No environments</div>}
        </div>
        <div className="sidebar-footer">
            <div className={`nav-item footer-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setActiveView('settings')}>⚙️ Settings</div>
        </div>
      </div>

      <div className="resizer-x" onMouseDown={startResizingSidebar}></div>

      <div className="workspace">
        {activeView === 'settings' ? (
            <div className="settings-page">
                <h2>Settings</h2>
                <div className="settings-section">
                    <h3>Appearance</h3>
                    <div className="setting-row">
                        <label>Accent Color</label>
                        <div className="color-options">
                            {THEMES.map(t => (
                                <button key={t.name} className={`color-swatch ${accentColor === t.color ? 'selected' : ''}`} style={{ backgroundColor: t.color }} onClick={() => setAccentColor(t.color)} title={t.name} />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="settings-section">
                    <h3>Data Management</h3>
                    <div className="data-actions">
                        <button className="action-btn" onClick={exportData}>💾 Export Data</button>
                        <button className="action-btn" onClick={triggerImport}>📂 Import Data</button>
                    </div>
                </div>
                <div className="settings-section"><h3>About</h3><p style={{ color: 'var(--text-muted)' }}>OrbitAPI v0.1.0 (Beta)</p></div>
            </div>
        ) : (
            <>
                <div className="url-bar">
                    <select value={method} onChange={(e) => setMethod(e.target.value)} className="method-select">
                        <option>GET</option> <option>POST</option> <option>PUT</option> <option>DELETE</option> <option>PATCH</option>
                    </select>
                    <input className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enter request URL" />
                    <button className="action-btn" onClick={saveRequest}>Save</button>
                    <button className="send-btn" onClick={handleSend} disabled={loading}>{loading ? "Sending..." : "Send"}</button>
                </div>
                <div className="pane-container">
                    <div className="panel request-panel" style={{ flexBasis: `${requestPaneWidth}%`, flexGrow: 0, flexShrink: 0 }}>
                        <div className="tabs">
                            <button className={activeTab === 'body' ? 'active' : ''} onClick={() => setActiveTab('body')}>Body</button>
                            <button className={activeTab === 'headers' ? 'active' : ''} onClick={() => setActiveTab('headers')}>Headers</button>
                        </div>
                        <div className="panel-content">
                            {activeTab === 'body' && (
                                <textarea className="code-editor" value={reqBody} onChange={e => setReqBody(e.target.value)} placeholder='{"key": "value"}' />
                            )}
                            {activeTab === 'headers' && <div className="empty-msg">Headers coming soon</div>}
                        </div>
                    </div>
                    <div className="resizer-pane" onMouseDown={startResizingPane}></div>
                    <div className="panel response-panel" style={{ flex: 1 }}>
                        <div className="panel-header">
                            <strong>Response</strong>
                            {response && (
                                <span className="meta">
                                    <span className={response.status < 400 ? "status-ok" : "status-err"}>{response.status} {response.status_text}</span>
                                    <span>{response.duration}ms</span> <span>{response.body.length} B</span>
                                </span>
                            )}
                        </div>
                        <div className="panel-content response-content">
                            {error && <div className="error-msg">{error}</div>}
                            {response ? <pre>{response.body}</pre> : !error && <div className="empty-msg">Ready</div>}
                        </div>
                    </div>
                </div> 
            </>
        )}
      </div>

      {/* --- Collection Create Modal --- */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>New Collection</h3>
            <input className="modal-input" autoFocus placeholder="Enter name..." value={newCollectionName} onChange={(e) => setNewCollectionName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmCreateCollection()} />
            <div className="modal-actions"><button className="action-btn" onClick={() => setIsModalOpen(false)}>Cancel</button><button className="send-btn" onClick={confirmCreateCollection}>Create</button></div>
          </div>
        </div>
      )}

      {/* --- Delete Confirmation Modal --- */}
      {collectionToDelete && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete Collection</h3>
            <p style={{ color: 'var(--text-muted)' }}>Are you sure? This cannot be undone.</p>
            <div className="modal-actions"><button className="action-btn" onClick={() => setCollectionToDelete(null)}>Cancel</button><button className="send-btn" style={{ backgroundColor: 'var(--error)' }} onClick={confirmDelete}>Delete</button></div>
          </div>
        </div>
      )}

      {/* --- NEW: Save Request Modal (Replaces Prompt) --- */}
      {isSaveModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Save Request</h3>
            <input className="modal-input" autoFocus value={requestName} onChange={(e) => setRequestName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmSaveRequest()} />
            <div className="modal-actions">
              <button className="action-btn" onClick={() => setIsSaveModalOpen(false)}>Cancel</button>
              <button className="send-btn" onClick={confirmSaveRequest}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* --- NEW: Generic Alert Modal (Replaces Alert) --- */}
      {alertMsg && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Notice</h3>
            <p style={{ color: 'var(--text-muted)' }}>{alertMsg}</p>
            <div className="modal-actions">
              <button className="send-btn" onClick={closeAlert}>OK</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;