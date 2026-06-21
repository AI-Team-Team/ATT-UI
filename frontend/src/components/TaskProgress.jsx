import React, { useEffect, useState } from 'react';

export default function TaskProgress({ state, onSelectNode }) {
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [dimensions, setDimensions] = useState({ width: 850, height: 400 });

  useEffect(() => {
    if (!state) return;

    const tempNodes = [];
    const tempLinks = [];

    // 1. Add Root AI Node
    const rootName = state.agents?.find(a => a.name === "Root_AI")?.name || "Root_AI";
    const rootNode = {
      id: "Root",
      type: "root",
      title: rootName,
      subtitle: "Root AI Coordinator",
      status: state.is_running ? "Active" : "Idle",
      x: 50,
      y: 200
    };
    tempNodes.push(rootNode);

    // 2. Add Team Nodes
    const teams = state.teams || [];
    
    // Group teams by depth
    const teamsByDepth = {};
    teams.forEach(team => {
      const d = team.depth || 1;
      if (!teamsByDepth[d]) teamsByDepth[d] = [];
      teamsByDepth[d].push(team);
    });

    // Positions mapping
    const colWidth = 240;
    const rowHeight = 110;

    // Traverse and position nodes
    teams.forEach(team => {
      const depth = team.depth || 1;
      const x = 50 + depth * colWidth;
      
      // Calculate y position based on index in depth group
      const depthList = teamsByDepth[depth];
      const idx = depthList.indexOf(team);
      const y = 50 + idx * rowHeight + (depth === 1 ? 50 : 0);

      const teamNode = {
        id: team.team_id,
        type: "team",
        title: team.team_id,
        subtitle: team.preset_name,
        purpose: team.team_purpose,
        progress: team.team_progress,
        status: team.status_map ? Object.values(team.status_map).join(', ') : "Idle",
        x: x,
        y: y
      };
      tempNodes.push(teamNode);

      // Add link to parent
      if (team.parent_team_id) {
        tempLinks.push({
          source: team.parent_team_id,
          target: team.team_id
        });
      } else {
        tempLinks.push({
          source: "Root",
          target: team.team_id
        });
      }
    });

    setNodes(tempNodes);
    setLinks(tempLinks);

    // Calculate bounding box for SVG canvas dynamic resizing
    let maxX = 50;
    let maxY = 200;
    tempNodes.forEach(node => {
      if (node.x > maxX) maxX = node.x;
      if (node.y > maxY) maxY = node.y;
    });
    setDimensions({
      width: Math.max(850, maxX + 220),
      height: Math.max(450, maxY + 120)
    });
  }, [state]);

  // Helper to draw curved connections (bezier path)
  const drawLinkPath = (link) => {
    const srcNode = nodes.find(n => n.id === link.source);
    const dstNode = nodes.find(n => n.id === link.target);
    if (!srcNode || !dstNode) return '';

    const startX = srcNode.x + 180;
    const startY = srcNode.y + 40;
    const endX = dstNode.x;
    const endY = dstNode.y + 40;

    const controlX = startX + (endX - startX) / 2;

    return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
  };

  // Get active activities/tool runs
  const getActivities = () => {
    const list = [];
    if (!state?.agents) return [];
    
    state.agents.forEach(agent => {
      if (agent.last_context) {
        const status = agent.last_context.status || 'Idle';
        if (status !== 'Idle') {
          list.push({
            name: agent.name,
            role: agent.role,
            status: agent.last_context.status
          });
        }
      }
    });
    return list;
  };

  const activeActivities = getActivities();

  return (
    <div className="progress-view">
      <div className="drawer-section">
        <h4>Hierarchical Lineage Topology Tree</h4>
        <div className="tree-container">
          <svg className="tree-svg" width={dimensions.width} height={dimensions.height}>
            {/* Draw Links */}
            {links.map((link, idx) => (
              <path
                key={idx}
                d={drawLinkPath(link)}
                className="tree-link active-path"
              />
            ))}

            {/* Draw Nodes */}
            {nodes.map(node => {
              const isActive = node.status && (
                node.type === 'root' 
                  ? node.status !== 'Idle' 
                  : node.status.split(', ').some(s => s !== 'Idle')
              );
              return (
                <g 
                  key={node.id} 
                  className={`node-group ${isActive ? 'active' : ''}`}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => onSelectNode(node.type, node.id)}
                >
                  <rect
                    width="180"
                    height="80"
                    className="node-rect"
                  />
                  <text x="15" y="25" className="node-text-title">
                    {node.title}
                  </text>
                  <text x="15" y="42" className="node-text-purpose" style={{ fill: 'var(--text-muted)' }}>
                    Role: {node.subtitle.slice(0, 22)}
                  </text>
                  <text x="15" y="58" className="node-text-purpose" style={{ fill: 'var(--accent-cyan)' }}>
                    Status: {node.status ? node.status.split(',')[0].slice(0, 20) : "Idle"}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
        <div className="drawer-section">
          <h4>Active Agent Panel</h4>
          <div className="drawer-list" style={{ maxHeight: '250px', overflowY: 'auto' }}>
            {state?.agents?.map(agent => {
              const status = agent.last_context?.status || 'Idle';
              const isActiveAgent = status !== 'Idle';
              let statusColor = 'var(--text-muted)';
              if (status.startsWith('Executing Tool')) {
                statusColor = 'var(--accent-cyan)';
              } else if (status.startsWith('Thinking')) {
                statusColor = 'var(--accent-purple)';
              }
              return (
                <div key={agent.name} className="member-item" style={{ cursor: 'pointer' }} onClick={() => onSelectNode('agent', agent.name)}>
                  <span className="member-role">👤 {agent.name} ({agent.role})</span>
                  <span className="member-status" style={{ color: statusColor, fontWeight: isActiveAgent ? '600' : 'normal' }}>
                    {status}
                  </span>
                </div>
              );
            })}
            {(!state?.agents || state.agents.length === 0) && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No active agents found in database.
              </div>
            )}
          </div>
        </div>

        <div className="drawer-section">
          <h4>Completed Workspace Accomplishments</h4>
          <div className="task-list-box" style={{ maxHeight: '250px', overflowY: 'auto' }}>
            {state?.teams?.map(t => (
              <div key={t.team_id} className={`task-progress-item ${t.team_progress.includes('Complete') || t.team_progress.includes('Success') ? 'completed' : ''}`}>
                <div className="task-checkbox">
                  {(t.team_progress.includes('Complete') || t.team_progress.includes('Success')) && (
                    <svg width="12" height="12" viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="task-title-text">{t.team_purpose}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginTop: '2px' }}>
                    Progress: {t.team_progress}
                  </span>
                </div>
              </div>
            ))}
            {(!state?.teams || state.teams.length === 0) && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No team milestones registered.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
