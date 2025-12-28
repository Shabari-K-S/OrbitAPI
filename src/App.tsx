import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window"; // Import window controls
import "./App.css";

// --- Types ---
interface HttpResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
  size: number;
}

interface RequestData {
  id: string; 
  name: string;
  method: string;
  url: string;
  body: string;
  protocol: "HTTP" | "GraphQL" | "gRPC" | "WebSocket" | "SocketIO" | "MQTT" | "EMPTY";
  response?: HttpResponse | null;
  isLoading?: boolean;
  error?: string;
  savedInCollectionId?: string;
}

interface Collection {
  id: string;
  name: string;
  requests: RequestData[];
  isOpen: boolean;
}

// --- Icons (SVGs) ---
const Icons = {
  HTTP: <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>,
  GraphQL: <svg viewBox="0 0 24 24" fill="#e535ab" width="40" height="40"><path d="M12 2l-9.8 5.7v11.4L12 24.8l9.8-5.7V7.7L12 2zm0 2.3l7.8 4.5-2.9 1.7-4.9-2.8V2.7v1.6zm0 17l-7.8-4.5 2.9-1.7 4.9 2.8v5l.1-1.6zm8.8-5.6l-1.5.9-4.3-7.5 1.5-.9 4.3 7.5zm-10.3-6.6l-1.5.9-4.3-7.5 1.5-.9 4.3 7.5z"/></svg>,
  gRPC: <svg viewBox="0 0 24 24" fill="#2487ab" width="40" height="40"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.8L18.5 8 12 11.2 5.5 8 12 4.8zM4 16.2V8.8L11 12v7.2L4 16.2zm9 3V12l7-3.2v7.4L13 19.2z"/></svg>,
  WebSocket: <svg viewBox="0 0 24 24" fill="#e6b450" width="40" height="40"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H9v-2h6v2zm0-5H9v-2h6v2zm0-5H9v-2h6v2z"/></svg>,
  SocketIO: <svg viewBox="0 0 24 24" fill="#f44747" width="40" height="40"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v6h2V7zm0 8h-2v2h2v-2z"/></svg>,
  MQTT: <svg viewBox="0 0 24 24" fill="#9c64c4" width="40" height="40"><path d="M18.6 6.6c-1.2-1.2-2.8-1.9-4.6-1.9-1.8 0-3.4.7-4.6 1.9L8 8l1.4 1.4c.8-.8 2-1.3 3.2-1.3 1.2 0 2.4.5 3.2 1.3L17.2 8l1.4-1.4zM21 4.2l-1.4-1.4c-2-2-5.3-2-7.3 0L11 4.1l1.4 1.4c1.2-1.2 3.2-1.2 4.4 0l1.4-1.4c.8-.8 1.9-1.3 3-1.3 1.1 0 2.2.5 3 1.3l-1.4 1.5zM6.5 11C4 11 2 13 2 15.5S4 20 6.5 20s4.5-2 4.5-4.5S9 11 6.5 11zm0 7c-1.4 0-2.5-1.1-2.5-2.5S5.1 13 6.5 13s2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5zm11.2-5.2c-.6-.6-1.5-.9-2.4-.9-.9 0-1.8.3-2.4.9l-1.4-1.4c1-1 2.4-1.5 3.8-1.5 1.4 0 2.8.5 3.8 1.5l-1.4 1.4z"/></svg>,
};

// --- Theme Colors ---
const THEMES = [
  { name: "Blue", color: "#007acc" },
  { name: "Green", color: "#4ec9b0" },
  { name: "Orange", color: "#e6b450" },
  { name: "Purple", color: "#c586c0" },
  { name: "Red", color: "#f44747" },
];

function App() {
  // --- Global App State ---
  const [activeView, setActiveView] = useState<"history" | "collections" | "env" | "settings">("history");
  const [accentColor, setAccentColor] = useState("#007acc");
  
  // --- Data Stores ---
  const [collections, setCollections] = useState<Collection[]>([]);
  const [history, setHistory] = useState<RequestData[]>([]);
  
  // --- Tab System State ---
  const [tabs, setTabs] = useState<RequestData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // --- UI/Modal States ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "rename">("create");
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [collectionNameInput, setCollectionNameInput] = useState("");
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveRequestName, setSaveRequestName] = useState("");
  const [saveTargetColId, setSaveTargetColId] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(260); 
  const [requestPaneWidth, setRequestPaneWidth] = useState(50);
  const [activeTabPanel, setActiveTabPanel] = useState<"body" | "headers">("body");

  const activeTab = tabs.find(t => t.id === activeTabId);
  const appWindow = getCurrentWindow(); // Get window instance

  // --- Persistence Effects ---
  useEffect(() => {
    const savedHist = localStorage.getItem("orbitapi_history");
    const savedCols = localStorage.getItem("orbitapi_collections");
    const savedTabs = localStorage.getItem("orbitapi_tabs");
    const savedActiveTab = localStorage.getItem("orbitapi_active_tab");
    const savedTheme = localStorage.getItem("orbitapi_theme");

    if (savedHist) setHistory(JSON.parse(savedHist));
    if (savedCols) setCollections(JSON.parse(savedCols));
    if (savedTabs && JSON.parse(savedTabs).length > 0) {
      setTabs(JSON.parse(savedTabs));
      setActiveTabId(savedActiveTab || null);
    } else {
      createNewTab();
    }
    if (savedTheme) setAccentColor(savedTheme);
  }, []);

  useEffect(() => { localStorage.setItem("orbitapi_history", JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem("orbitapi_collections", JSON.stringify(collections)); }, [collections]);
  useEffect(() => { localStorage.setItem("orbitapi_tabs", JSON.stringify(tabs)); }, [tabs]);
  useEffect(() => { if(activeTabId) localStorage.setItem("orbitapi_active_tab", activeTabId); }, [activeTabId]);
  useEffect(() => { 
    localStorage.setItem("orbitapi_theme", accentColor);
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

  // --- Logic ---
  const createNewTab = () => {
    const newTab: RequestData = { id: crypto.randomUUID(), name: "New Tab", method: "GET", url: "", body: "", protocol: "EMPTY" };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
  };

  const updateActiveTab = (updates: Partial<RequestData>) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };

  const initProtocol = (protocol: any) => {
    updateActiveTab({ 
      protocol, 
      method: protocol === "GraphQL" ? "POST" : "GET",
      body: protocol === "GraphQL" ? '{"query": "{ hello }"}' : "",
      name: "New Request"
    });
  };

  const loadRequestIntoTab = (req: RequestData) => {
    const existing = tabs.find(t => t.id === req.id);
    if (existing) { setActiveTabId(existing.id); return; }
    const newTab = { ...req, response: null, error: undefined, isLoading: false };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  async function handleSend() {
    if (!activeTab || !activeTab.url) return;
    updateActiveTab({ isLoading: true, error: undefined, response: null });
    try {
      const res = await invoke<HttpResponse>("send_request", { request: { method: activeTab.method, url: activeTab.url, headers: {}, body: activeTab.body }, });
      updateActiveTab({ isLoading: false, response: { ...res, size: res.body.length } });
      setHistory(prev => [{ ...activeTab, id: crypto.randomUUID(), name: `${activeTab.method} ${activeTab.url}` }, ...prev].slice(0, 50));
    } catch (e) {
      updateActiveTab({ isLoading: false, error: "Error: " + String(e) });
    }
  }

  // --- EXPORT & IMPORT ---
  const exportData = () => {
    const data = { version: 2, timestamp: new Date().toISOString(), collections, history };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orbitapi_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); 
    setAlertMsg("Backup file downloaded successfully!");
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        let importedCount = 0;
        if (Array.isArray(json.collections)) { setCollections(json.collections); importedCount++; }
        if (Array.isArray(json.history)) { setHistory(json.history); importedCount++; }
        if (importedCount > 0) setAlertMsg("Data imported successfully!");
        else setAlertMsg("Invalid backup file: No history or collections found.");
      } catch (err) { setAlertMsg("Failed to parse JSON file."); }
    };
    reader.readAsText(file);
    event.target.value = ""; 
  };

  const clearHistory = () => { if(confirm("Are you sure you want to clear all history?")) { setHistory([]); setAlertMsg("History cleared."); }};
  const resetAllData = () => { if(confirm("WARNING: This will delete ALL collections and history. Continue?")) { setCollections([]); setHistory([]); setAlertMsg("All data reset."); }};

  // --- Collection & UI Helpers ---
  const openCreateColModal = () => { setModalMode("create"); setCollectionNameInput(""); setIsModalOpen(true); };
  const openRenameColModal = (e: React.MouseEvent, col: Collection) => { e.stopPropagation(); setModalMode("rename"); setEditingColId(col.id); setCollectionNameInput(col.name); setIsModalOpen(true); };
  const handleCollectionSubmit = () => {
    if (!collectionNameInput.trim()) return;
    if (modalMode === "create") setCollections([...collections, { id: crypto.randomUUID(), name: collectionNameInput, requests: [], isOpen: true }]);
    else if (modalMode === "rename" && editingColId) setCollections(collections.map(c => c.id === editingColId ? { ...c, name: collectionNameInput } : c));
    setIsModalOpen(false);
  };
  const deleteCollection = (e: React.MouseEvent, id: string) => { e.stopPropagation(); if(confirm("Delete this collection?")) setCollections(collections.filter(c => c.id !== id)); };
  
  const handleSaveClick = () => {
    if (!activeTab) return;
    if (collections.length === 0) { setAlertMsg("Create a collection first!"); return; }
    if (activeTab.savedInCollectionId) updateSavedRequest(activeTab);
    else { setSaveRequestName(activeTab.name); setSaveTargetColId(collections[0].id); setIsSaveModalOpen(true); }
  };
  const confirmSaveAs = () => {
    if (!activeTab) return;
    const newReqId = crypto.randomUUID();
    const newReq = { ...activeTab, id: newReqId, name: saveRequestName, savedInCollectionId: saveTargetColId };
    setCollections(cols => cols.map(c => c.id === saveTargetColId ? { ...c, requests: [...c.requests, newReq] } : c));
    updateActiveTab({ id: newReqId, name: saveRequestName, savedInCollectionId: saveTargetColId });
    setIsSaveModalOpen(false); setAlertMsg("Saved successfully!");
  };
  const updateSavedRequest = (req: RequestData) => {
    setCollections(cols => cols.map(c => c.id === req.savedInCollectionId ? { ...c, requests: c.requests.map(r => r.id === req.id ? { ...req } : r) } : c));
    setAlertMsg("Request updated!");
  };

  // --- Resizers ---
  const startResizingSidebar = (e: React.MouseEvent) => { e.preventDefault(); const startX = e.clientX; const startW = sidebarWidth; const onMove = (ev: MouseEvent) => setSidebarWidth(Math.min(Math.max(startW + (ev.clientX - startX), 150), 600)); const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }; document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp); };
  const startResizingPane = (e: React.MouseEvent) => { e.preventDefault(); const el = document.querySelector('.pane-container'); if(!el) return; const isVert = window.innerWidth <= 1200; const rect = el.getBoundingClientRect(); const size = isVert ? rect.height : rect.width; const startPos = isVert ? e.clientY : e.clientX; const startP = requestPaneWidth; const onMove = (ev: MouseEvent) => { const delta = (( (isVert ? ev.clientY : ev.clientX) - startPos) / size) * 100; setRequestPaneWidth(Math.min(Math.max(startP + delta, 10), 90)); }; const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }; document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp); };

  // --- Main Layout ---
  return (
    <div className="app-layout">
        {/* === CUSTOM TITLE BAR === */}
        <div data-tauri-drag-region className="titlebar">
            <div className="titlebar-heading">
              <div className="titlebar-branding">OrbitAPI</div>
            </div>
            <div className="titlebar-controls">
                <div className="t-btn" onClick={() => appWindow.minimize()}>
                    <svg viewBox="0 0 10 10" width="10" height="10"><path d="M0,5 L10,5" stroke="currentColor" strokeWidth="1"/></svg>
                </div>
                <div className="t-btn" onClick={() => appWindow.toggleMaximize()}>
                    <svg viewBox="0 0 10 10" width="10" height="10"><rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
                </div>
                <div className="t-btn close" onClick={() => appWindow.close()}>
                    <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1,1 L9,9 M9,1 L1,9" stroke="currentColor" strokeWidth="1"/></svg>
                </div>
            </div>
        </div>

        {/* === MAIN CONTENT (Sidebar + Workspace) === */}
        <div className="main-content">
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleFileImport} />

            <div className="sidebar" style={{ width: sidebarWidth }}>
                <div className="nav-menu">
                    <div className={`nav-item ${activeView === 'history' ? 'active' : ''}`} onClick={() => setActiveView('history')}>History</div>
                    <div className={`nav-item ${activeView === 'collections' ? 'active' : ''}`} onClick={() => setActiveView('collections')}>Collections</div>
                </div>
                <div className="sidebar-content">
                    {activeView === 'history' && (
                        <div className="list-container">
                        {history.map(req => (
                            <div key={req.id} className="list-item" onClick={() => loadRequestIntoTab(req)}>
                            <span className={`method-tag ${req.method}`}>{req.method.slice(0,3)}</span>
                            <span className="url-truncate" title={req.name}>{req.name}</span>
                            </div>
                        ))}
                        {history.length === 0 && <div className="empty-sidebar">No history</div>}
                        </div>
                    )}
                    {activeView === 'collections' && (
                        <div className="list-container">
                        <button className="new-btn" onClick={openCreateColModal}>+ New Collection</button>
                        {collections.map(col => (
                            <div key={col.id} className="collection-group">
                            <div className="collection-header" onClick={() => setCollections(collections.map(c => c.id === col.id ? { ...c, isOpen: !c.isOpen } : c))}>
                                <span style={{flex:1}}>{col.isOpen ? '▼' : '▶'} {col.name}</span>
                                <div className="col-actions">
                                    <button className="icon-btn small" onClick={(e) => openRenameColModal(e, col)}>✎</button>
                                    <button className="icon-btn small" onClick={(e) => deleteCollection(e, col.id)}>×</button>
                                </div>
                            </div>
                            {col.isOpen && (
                                <div className="collection-items">
                                {col.requests.map(req => (
                                    <div key={req.id} className="list-item sub-item" onClick={() => loadRequestIntoTab(req)}>
                                    <span className={`method-tag ${req.method}`}>{req.method.slice(0,3)}</span>
                                    <span className="url-truncate">{req.name}</span>
                                    </div>
                                ))}
                                </div>
                            )}
                            </div>
                        ))}
                        </div>
                    )}
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
                        <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px'}}>
                            Your data is saved automatically to LocalStorage. Use export to backup your data to a file.
                        </p>
                        <div className="data-actions">
                            <button className="action-btn" onClick={exportData}>⬇ Export Backup</button>
                            <button className="action-btn" onClick={() => fileInputRef.current?.click()}>⬆ Import Backup</button>
                        </div>
                        <div className="data-actions" style={{marginTop: '10px'}}>
                            <button className="action-btn" onClick={clearHistory}>🗑 Clear History</button>
                            <button className="action-btn" style={{borderColor: 'var(--error)', color: 'var(--error)'}} onClick={resetAllData}>⚠ Reset All Data</button>
                        </div>
                    </div>
                    <button className="back-btn-settings" onClick={() => setActiveView('history')}>Close Settings</button>
                </div>
                ) : (
                    <>
                        <div className="tab-bar-container">
                            <div className="tab-bar">
                                {tabs.map(tab => (
                                    <div key={tab.id} className={`tab-item ${activeTabId === tab.id ? 'active' : ''}`} onClick={() => setActiveTabId(tab.id)}>
                                        <span className={`method-tag ${tab.method}`}>{tab.method}</span>
                                        <span className="tab-name">{tab.name || 'Untitled'}</span>
                                        <span className="tab-close" onClick={(e) => closeTab(e, tab.id)}>×</span>
                                    </div>
                                ))}
                            </div>
                            <button className="new-tab-btn" onClick={createNewTab} title="New Tab">＋</button>
                        </div>

                        {!activeTab || activeTab.protocol === "EMPTY" ? (
                            <div className="start-screen">
                                <h2>Start New Request</h2>
                                <div className="protocol-grid">
                                    {Object.entries(Icons).map(([key, icon]) => (
                                        <div key={key} className="protocol-card" onClick={() => initProtocol(key)}>
                                            <div className={`card-icon ${key.toLowerCase()}`}>{icon}</div>
                                            <span>{key}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="request-ui">
                                <div className="url-bar">
                                    <select value={activeTab.method} onChange={(e) => updateActiveTab({ method: e.target.value })} className="method-select">
                                        <option>GET</option> <option>POST</option> <option>PUT</option> <option>DELETE</option> <option>PATCH</option>
                                    </select>
                                    <input className="url-input" value={activeTab.url} onChange={(e) => updateActiveTab({ url: e.target.value })} placeholder="Enter request URL" />
                                    <button className="action-btn" onClick={handleSaveClick}>{activeTab.savedInCollectionId ? "Update" : "Save"}</button>
                                    <button className="send-btn" onClick={handleSend} disabled={activeTab.isLoading}>{activeTab.isLoading ? "Sending..." : "Send"}</button>
                                </div>
                                <div className="pane-container">
                                    <div className="panel request-panel" style={{ flexBasis: `${requestPaneWidth}%`, flexGrow: 0, flexShrink: 0 }}>
                                        <div className="tabs">
                                            <button className={activeTabPanel === 'body' ? 'active' : ''} onClick={() => setActiveTabPanel('body')}>Body</button>
                                            <button className={activeTabPanel === 'headers' ? 'active' : ''} onClick={() => setActiveTabPanel('headers')}>Headers</button>
                                        </div>
                                        <div className="panel-content">
                                            {activeTabPanel === 'body' && <textarea className="code-editor" value={activeTab.body} onChange={e => updateActiveTab({ body: e.target.value })} placeholder='{"key": "value"}' />}
                                            {activeTabPanel === 'headers' && <div className="empty-msg">Headers Config Coming Soon</div>}
                                        </div>
                                    </div>
                                    <div className="resizer-pane" onMouseDown={startResizingPane}></div>
                                    <div className="panel response-panel" style={{ flex: 1 }}>
                                        <div className="panel-header">
                                            <strong>Response</strong>
                                            {activeTab.response && <span className="meta"><span className={activeTab.response.status < 400 ? "status-ok" : "status-err"}>{activeTab.response.status} {activeTab.response.status_text}</span><span>{activeTab.response.duration}ms</span><span>{activeTab.response.size} B</span></span>}
                                        </div>
                                        <div className="panel-content response-content">
                                            {activeTab.error && <div className="error-msg">{activeTab.error}</div>}
                                            {activeTab.response ? <pre>{activeTab.response.body}</pre> : !activeTab.error && <div className="empty-msg">Ready to send</div>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {isModalOpen && <div className="modal-overlay"><div className="modal-content"><h3>{modalMode === 'create' ? 'New Collection' : 'Rename Collection'}</h3><input className="modal-input" autoFocus placeholder="Name..." value={collectionNameInput} onChange={(e) => setCollectionNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCollectionSubmit()} /><div className="modal-actions"><button className="action-btn" onClick={() => setIsModalOpen(false)}>Cancel</button><button className="send-btn" onClick={handleCollectionSubmit}>OK</button></div></div></div>}
            {isSaveModalOpen && <div className="modal-overlay"><div className="modal-content"><h3>Save Request As</h3><input className="modal-input" placeholder="Request Name" value={saveRequestName} onChange={(e) => setSaveRequestName(e.target.value)} /><select className="modal-input" value={saveTargetColId} onChange={(e) => setSaveTargetColId(e.target.value)}>{collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><div className="modal-actions"><button className="action-btn" onClick={() => setIsSaveModalOpen(false)}>Cancel</button><button className="send-btn" onClick={confirmSaveAs}>Save</button></div></div></div>}
            {alertMsg && <div className="modal-overlay"><div className="modal-content"><h3>Notice</h3><p>{alertMsg}</p><button className="send-btn" style={{width:'100%'}} onClick={() => setAlertMsg(null)}>OK</button></div></div>}
        </div>
    </div>
  );
}

export default App;