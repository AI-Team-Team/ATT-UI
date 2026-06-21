import React from 'react';

export default function DetailDrawer({ isOpen, onClose, type, id, state }) {
  if (!isOpen) return null;

  let content = null;

  if (type === 'team' && state?.teams) {
    const team = state.teams.find(t => t.team_id === id);
    if (team) {
      content = (
        <>
          <div className="drawer-section">
            <h4>Team Meta</h4>
            <div className="drawer-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div><strong>Team ID:</strong> {team.team_id}</div>
              <div><strong>Preset:</strong> {team.preset_name}</div>
              <div><strong>Lineage Depth:</strong> Level {team.depth}</div>
              <div><strong>Migrations Executed:</strong> {team.migration_count}</div>
            </div>
          </div>

          <div className="drawer-section">
            <h4>Current Purpose & Status</h4>
            <div className="drawer-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div><strong>Purpose:</strong> {team.team_purpose}</div>
              <div><strong>Progress Status:</strong> <span style={{ color: 'var(--accent-cyan)' }}>{team.team_progress}</span></div>
            </div>
          </div>

          <div className="drawer-section">
            <h4>Team Members ({team.members?.length})</h4>
            <div className="drawer-list">
              {team.members?.map(memberName => {
                const agent = state.agents?.find(a => a.name === memberName);
                return (
                  <div key={memberName} className="member-item">
                    <span className="member-role">👤 {memberName}</span>
                    <span className="member-status">{agent ? agent.role : 'Member'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="drawer-section">
            <h4>Sibling Rules & Inbox Alerts</h4>
            <div className="drawer-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div><strong>Allow Sibling Talk:</strong> {team.communication_rules?.allow_sibling_talk ? 'Yes' : 'No'}</div>
              <div><strong>Unresolved Inbox Alerts:</strong> {team.inbox?.length || 0}</div>
              {team.inbox?.length > 0 && (
                <div style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  {team.inbox.map((msg, idx) => (
                    <div key={idx} style={{ padding: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', borderLeft: '3px solid var(--accent-rose)' }}>
                      <strong>From {msg.from}:</strong> {msg.reason || msg.objective || JSON.stringify(msg)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      );
    } else {
      content = <p style={{ color: 'var(--text-muted)' }}>Team not found.</p>;
    }
  } else if (type === 'agent' && state?.agents) {
    const agent = state.agents.find(a => a.name === id);
    if (agent) {
      content = (
        <>
          <div className="drawer-section">
            <h4>Agent Identity</h4>
            <div className="drawer-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div><strong>Agent Name:</strong> {agent.name}</div>
              <div><strong>Role Name:</strong> {agent.role}</div>
              <div><strong>Role Description:</strong> {agent.role_description || 'No description'}</div>
              <div><strong>Model Alias:</strong> {agent.model_alias || 'Default Model'}</div>
            </div>
          </div>

          <div className="drawer-section">
            <h4>System Prompt Instructions</h4>
            <pre style={{
              whiteSpace: 'pre-wrap',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)',
              padding: '12px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              maxHeight: '150px',
              overflowY: 'auto',
              color: 'var(--text-muted)'
            }}>
              {agent.system_instructions || 'No custom instructions.'}
            </pre>
          </div>

          <div className="drawer-section">
            <h4>Private Dialogue Memory History ({agent.messages?.length || 0} turns)</h4>
            <div className="drawer-messages-list" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {agent.messages?.map((msg, idx) => {
                let roleClass = msg.role;
                if (msg.content.includes('HISTORICAL SUMMARY')) {
                  roleClass = 'system';
                }
                return (
                  <div key={idx} className={`drawer-msg-turn ${roleClass}`}>
                    <div style={{ fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px', color: 'var(--text-muted)' }}>
                      {msg.role}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  </div>
                );
              })}
              {(!agent.messages || agent.messages.length === 0) && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No messages in memory history.
                </div>
              )}
            </div>
          </div>
        </>
      );
    } else {
      content = <p style={{ color: 'var(--text-muted)' }}>Agent not found.</p>;
    }
  }

  return (
    <div className="drawer">
      <div className="drawer-header">
        <h3>🔍 Detail Inspector ({id})</h3>
        <button className="icon-btn" onClick={onClose} style={{ fontSize: '1.2rem' }}>×</button>
      </div>
      <div className="drawer-content">
        {content}
      </div>
    </div>
  );
}
