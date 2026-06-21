import React, { useState, useEffect, useRef } from 'react';
import ProjectChat from './components/ProjectChat';
import FileManager from './components/FileManager';
import TaskProgress from './components/TaskProgress';
import DetailDrawer from './components/DetailDrawer';
import DecisionModal from './components/DecisionModal';
import './App.css';

export default function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [projectState, setProjectState] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPrompt, setNewProjectPrompt] = useState('');
  
  // Real-time agent streaming activities
  const [liveActivities, setLiveActivities] = useState([]);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState(null);
  const [drawerId, setDrawerId] = useState(null);

  const socketRef = useRef(null);

  // Fetch available projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  // Sync state and connect websocket when project changes
  useEffect(() => {
    if (selectedProject) {
      setLiveActivities([]);
      fetchProjectState(selectedProject);
      connectWebSocket(selectedProject);
    } else {
      setProjectState(null);
      setLiveActivities([]);
      closeWebSocket();
    }
  }, [selectedProject]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        if (data.length > 0 && !selectedProject) {
          setSelectedProject(data[0].name);
        }
      }
    } catch (e) {
      console.error("Error loading projects list:", e);
    }
  };

  const fetchProjectState = async (name) => {
    try {
      const res = await fetch(`/api/projects/${name}/state`);
      if (res.ok) {
        const data = await res.json();
        setProjectState(data);
      }
    } catch (e) {
      console.error("Error loading project state:", e);
    }
  };

  const connectWebSocket = (name) => {
    closeWebSocket();
    
    // Construct websocket URI relative to location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${name}`;
    logger.info(`Connecting to WebSocket: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.project_id === name) {
          logger.info("Received WebSocket event:", payload.type);
          
          if (payload.type === 'session_start') {
            setLiveActivities([]);
          } else if (payload.type === 'activity_added') {
            setLiveActivities(prev => [...prev, payload.data]);
          } else if (payload.type === 'session_end') {
            fetchProjectState(name);
            setTimeout(() => {
              setLiveActivities([]);
            }, 2500);
            return;
          }
          
          // State changed in SQLite, pull the latest snapshot
          fetchProjectState(name);
        }
      } catch (err) {
        console.error("Error parsing WebSocket event:", err);
      }
    };

    ws.onclose = () => {
      logger.info("WebSocket connection closed.");
    };
  };

  const closeWebSocket = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    const cleanName = newProjectName.trim().replace(/\s+/g, '_');
    if (!cleanName || !newProjectPrompt.trim()) return;

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          prompt: newProjectPrompt
        })
      });

      if (res.ok) {
        setIsNewProjectModalOpen(false);
        setNewProjectName('');
        setNewProjectPrompt('');
        setSelectedProject(cleanName);
        fetchProjects();
      } else {
        const err = await res.json();
        alert(`Error creating project: ${err.detail || 'Server error'}`);
      }
    } catch (e) {
      alert("Error sending request to create project.");
    }
  };

  const handleDeleteProject = async (name) => {
    if (!window.confirm(`Are you sure you want to permanently delete the workspace "${name.replace(/_/g, ' ')}"?\nAll history and files will be lost.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/projects/${name}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        if (selectedProject === name) {
          const remaining = projects.filter(p => p.name !== name);
          if (remaining.length > 0) {
            setSelectedProject(remaining[0].name);
          } else {
            setSelectedProject('');
          }
        }
        fetchProjects();
      } else {
        const err = await res.json();
        alert(`Error deleting project: ${err.detail || 'Server error'}`);
      }
    } catch (e) {
      alert("Error sending request to delete project.");
    }
  };

  const handleSendMessage = async (promptText) => {
    if (!selectedProject) return;
    try {
      const res = await fetch(`/api/projects/${selectedProject}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
      });
      if (!res.ok) {
        alert("Failed to send instruction.");
      }
    } catch (e) {
      alert("Error sending message.");
    }
  };

  const handleSelectNode = (type, id) => {
    setDrawerType(type);
    setDrawerId(id);
    setDrawerOpen(true);
  };

  return (
    <div className="app-container">
      {/* Left Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>ATT<span>-UI</span></h1>
        </div>
        <div className="sidebar-content">
          <button 
            className="new-project-btn"
            onClick={() => setIsNewProjectModalOpen(true)}
          >
            <span>+</span> New Project Task
          </button>
          
          <div className="projects-box">
            <h3>Active Workspaces</h3>
            <div className="projects-list">
              {projects.map(proj => (
                <div 
                  key={proj.name}
                  className={`project-item ${selectedProject === proj.name ? 'active' : ''}`}
                  onClick={() => setSelectedProject(proj.name)}
                >
                  <div className="project-item-header">
                    <h4>💼 {proj.name.replace(/_/g, ' ')}</h4>
                    <button
                      className="delete-project-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(proj.name);
                      }}
                      title="Delete Project Workspace"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="metrics">
                    <span>Teams: {proj.teams || 0}</span>
                    <span>Agents: {proj.agents || 0}</span>
                  </div>
                </div>
              ))}
              {projects.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '10px' }}>
                  No projects created.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Panel */}
      <div className="main-panel">
        <div className="panel-header">
          <div className="project-title">
            <h2>{selectedProject ? selectedProject.replace(/_/g, ' ') : 'Select a Project'}</h2>
            {projectState && (
              <span className={`status-badge ${projectState.is_running ? 'running' : 'idle'}`}>
                <span className="dot" style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: projectState.is_running ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  display: 'inline-block'
                }}></span>
                {projectState.is_running ? 'ATT Working' : 'Idle'}
              </span>
            )}
          </div>

          <div className="tabs-list">
            <button 
              className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              Task Chat
            </button>
            <button 
              className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
              onClick={() => setActiveTab('files')}
            >
              Workspace Files
            </button>
            <button 
              className={`tab-btn ${activeTab === 'progress' ? 'active' : ''}`}
              onClick={() => setActiveTab('progress')}
            >
              Task Progress
            </button>
          </div>
        </div>

        <div className="panel-content">
          {selectedProject ? (
            <>
              {activeTab === 'chat' && (
                <ProjectChat 
                  state={projectState} 
                  onSendMessage={handleSendMessage} 
                  liveActivities={liveActivities}
                />
              )}
              {activeTab === 'files' && (
                <FileManager 
                  projectName={selectedProject} 
                  state={projectState} 
                  onFileWrite={() => fetchProjectState(selectedProject)}
                  onFileDelete={() => fetchProjectState(selectedProject)}
                />
              )}
              {activeTab === 'progress' && (
                <TaskProgress 
                  state={projectState} 
                  onSelectNode={handleSelectNode} 
                />
              )}
            </>
          ) : (
            <div className="editor-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.008 1.24l.885 1.77a2.25 2.25 0 002.007 1.24h1.98a2.25 2.25 0 002.007-1.24l.885-1.77a2.25 2.25 0 012.007-1.24h3.86m-18 0h18" />
              </svg>
              <p>Please select an active workspace or create a new one to begin.</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Drawer */}
      <DetailDrawer 
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        type={drawerType}
        id={drawerId}
        state={projectState}
      />

      {/* Decisial voting overlay modal */}
      <DecisionModal 
        projectName={selectedProject}
        state={projectState}
        onProposalResolved={() => fetchProjectState(selectedProject)}
      />

      {/* New Project Modal */}
      {isNewProjectModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Create New Project Task</h3>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Project Name</label>
                  <input 
                    type="text" 
                    required 
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. Code_Refactoring"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Objective & Prompt</label>
                  <textarea 
                    required 
                    value={newProjectPrompt}
                    onChange={(e) => setNewProjectPrompt(e.target.value)}
                    placeholder="Describe the task for the AI team, e.g., 'Summarize notes.txt and output as summary.md'"
                    className="form-input"
                    style={{ height: '100px', resize: 'none' }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="editor-btn"
                  onClick={() => setIsNewProjectModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="new-project-btn"
                  style={{ padding: '8px 16px', boxShadow: 'none' }}
                >
                  Initialize Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Log utility for web client
const logger = {
  info: (...args) => console.log("[ATT-UI]", ...args),
  error: (...args) => console.error("[ATT-UI]", ...args)
};
