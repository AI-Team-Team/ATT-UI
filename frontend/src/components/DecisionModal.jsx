import React from 'react';

export default function DecisionModal({ projectName, state, onProposalResolved }) {
  // Find first active proposal across all teams
  const getActiveProposal = () => {
    if (!state?.teams) return null;
    for (const team of state.teams) {
      if (team.proposals) {
        const active = team.proposals.find(p => p.status === 'active');
        if (active) {
          return { ...active, team_id: team.team_id };
        }
      }
    }
    return null;
  };

  const proposal = getActiveProposal();

  if (!proposal) return null;

  const handleResolve = async (approved) => {
    try {
      const res = await fetch(`/api/projects/${projectName}/proposals/${proposal.proposal_id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved })
      });
      if (res.ok) {
        onProposalResolved();
      } else {
        alert("Failed to resolve proposal.");
      }
    } catch (e) {
      alert("Error resolving proposal.");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header" style={{ borderBottomColor: 'rgba(255, 255, 255, 0.08)' }}>
          <h3>🗳️ Human-in-the-Loop Proposal Decision</h3>
        </div>
        <div className="modal-body" style={{ color: 'var(--text-main)' }}>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Active Team
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--accent-cyan)' }}>
              {proposal.team_id}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Proposed Action
            </span>
            <div style={{ fontSize: '1rem', fontWeight: '500' }}>
              {proposal.action.toUpperCase()} member <strong>'{proposal.target}'</strong>
            </div>
          </div>

          <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Initiator: {proposal.initiator_name} ({proposal.initiator_type})
            </span>
            <p style={{ fontSize: '0.9rem', fontStyle: 'italic', lineScale: 1.4 }}>
              "{proposal.rationale}"
            </p>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <strong>Ballot Summary:</strong> {Object.keys(proposal.votes).length} agent(s) have voted. Unanimous agent consensus requires deciding the vote. You can override and decide this proposal now.
          </div>
        </div>
        <div className="modal-footer" style={{ borderTopColor: 'rgba(255, 255, 255, 0.08)' }}>
          <button 
            className="editor-btn" 
            style={{ borderColor: 'rgba(244, 63, 94, 0.3)', color: 'var(--accent-rose)' }} 
            onClick={() => handleResolve(false)}
          >
            Reject Proposal
          </button>
          <button 
            className="new-project-btn" 
            style={{ padding: '8px 16px', background: 'var(--accent-emerald)', boxShadow: 'none' }} 
            onClick={() => handleResolve(true)}
          >
            Approve & Execute
          </button>
        </div>
      </div>
    </div>
  );
}
