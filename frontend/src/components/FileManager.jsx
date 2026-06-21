import React, { useState, useEffect } from 'react';

export default function FileManager({ projectName, state, onFileWrite, onFileDelete }) {
  const [selectedLibId, setSelectedLibId] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  // Auto-select first library if none selected
  useEffect(() => {
    if (state?.libraries?.length > 0 && !selectedLibId) {
      setSelectedLibId(state.libraries[0].lib_id);
    }
  }, [state, selectedLibId]);

  const fetchFileContent = async (libId, path) => {
    setLoadingFile(true);
    try {
      const response = await fetch(`/api/projects/${projectName}/files/${libId}?path=${encodeURIComponent(path)}`);
      if (response.ok) {
        const data = await response.json();
        setEditorContent(data.content || '');
        setSelectedLibId(libId);
        setSelectedFilePath(path);
        setIsEditing(true);
      } else {
        alert("Failed to load file contents.");
      }
    } catch (e) {
      console.error(e);
      alert("Error loading file.");
    } finally {
      setLoadingFile(false);
    }
  };

  const handleSave = async () => {
    if (!selectedLibId || !selectedFilePath) return;
    try {
      const res = await fetch(`/api/projects/${projectName}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lib_id: selectedLibId,
          path: selectedFilePath,
          content: editorContent
        })
      });
      if (res.ok) {
        alert("File saved successfully!");
        onFileWrite();
      } else {
        alert("Failed to save file.");
      }
    } catch (e) {
      alert("Error saving file.");
    }
  };

  const handleDelete = async () => {
    if (!selectedLibId || !selectedFilePath) return;
    if (!confirm(`Are you sure you want to delete ${selectedFilePath}?`)) return;
    try {
      const res = await fetch(`/api/projects/${projectName}/files/${selectedLibId}?path=${encodeURIComponent(selectedFilePath)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setIsEditing(false);
        setEditorContent('');
        setSelectedFilePath('');
        onFileDelete();
      } else {
        alert("Failed to delete file.");
      }
    } catch (e) {
      alert("Error deleting file.");
    }
  };

  const handleCreateFile = () => {
    if (!selectedLibId) {
      alert("Please select a library first.");
      return;
    }
    const filename = prompt("Enter new filename (e.g. notes.txt):");
    if (!filename) return;
    setSelectedFilePath(filename);
    setEditorContent('');
    setIsEditing(true);
  };

  const activeLibrary = state?.libraries?.find(l => l.lib_id === selectedLibId);

  return (
    <div className="file-manager">
      <div className="file-sidebar">
        <div className="file-tree-header">
          <h3>Libraries</h3>
          <div className="file-tree-actions">
            <button className="icon-btn" onClick={handleCreateFile} title="New File">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="file-tree-content">
          {state?.libraries?.map(lib => (
            <div key={lib.lib_id} className="lib-section">
              <div 
                className={`lib-header ${selectedLibId === lib.lib_id ? 'active' : ''}`}
                onClick={() => setSelectedLibId(lib.lib_id)}
              >
                📁 {lib.name.length > 22 ? lib.name.slice(0, 19) + '...' : lib.name}
              </div>
              <div style={{ paddingLeft: '12px' }}>
                {lib.files?.map(file => (
                  <div 
                    key={file.path} 
                    className={`file-tree-item ${selectedFilePath === file.path && selectedLibId === lib.lib_id ? 'active' : ''}`}
                    onClick={() => fetchFileContent(lib.lib_id, file.path)}
                  >
                    📄 {file.path}
                  </div>
                ))}
                {(!lib.files || lib.files.length === 0) && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '8px' }}>
                    Empty
                  </div>
                )}
              </div>
            </div>
          ))}
          {(!state?.libraries || state.libraries.length === 0) && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No libraries created yet.
            </div>
          )}
        </div>

        {/* Permissions list */}
        {activeLibrary && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.1)' }}>
            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Permissions ACL
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Owner team:</span>
                <strong style={{ color: 'var(--accent-purple)' }}>{activeLibrary.owner_team_id}</strong>
              </div>
              {activeLibrary.permissions?.map((perm, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>{perm.team_id} ({perm.path}):</span>
                  <span style={{ color: 'var(--accent-emerald)' }}>{perm.permission}</span>
                </div>
              ))}
              {(!activeLibrary.permissions || activeLibrary.permissions.length === 0) && (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No extra share rules.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="file-editor-area">
        {loadingFile ? (
          <div className="editor-placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="animate-spin" style={{ fill: 'none', animation: 'spin 1s linear infinite' }}>
              <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
              <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <p>Loading file...</p>
          </div>
        ) : isEditing ? (
          <>
            <div className="editor-header">
              <span className="editor-file-info">
                ✏️ {selectedFilePath}
              </span>
              <div className="editor-actions">
                <button className="editor-btn" onClick={handleSave}>Save</button>
                <button className="editor-btn" onClick={handleDelete} style={{ color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}>Delete</button>
              </div>
            </div>
            <textarea
              className="editor-textarea"
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              placeholder="Write text or code here..."
            />
          </>
        ) : (
          <div className="editor-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
            <p>Select a file from libraries to view/edit, or create a new file.</p>
          </div>
        )}
      </div>
    </div>
  );
}
