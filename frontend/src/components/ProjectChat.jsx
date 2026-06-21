import React, { useState, useEffect, useRef } from 'react';

export default function ProjectChat({ state, onSendMessage, liveActivities = [] }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [state?.agents, liveActivities]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || state?.is_running) return;
    onSendMessage(input);
    setInput('');
  };

  // Helper to parse message contents into Thoughts, Actions and Final Answers
  const parseMessage = (content) => {
    if (!content) return { thoughts: '', action: '', answer: '' };

    const thoughtMatch = content.match(/Thought:\s*([\s\S]*?)(?:Action:|Final Answer:|$)/i);
    const actionMatch = content.match(/Action:\s*([\s\S]*?)(?:Final Answer:|$)/i);
    const finalMatch = content.match(/Final Answer:\s*([\s\S]*)/i);

    return {
      thoughts: thoughtMatch ? (thoughtMatch[1].strip ? thoughtMatch[1].strip() : thoughtMatch[1].trim()) : '',
      action: actionMatch ? (actionMatch[1].strip ? actionMatch[1].strip() : actionMatch[1].trim()) : '',
      answer: finalMatch ? (finalMatch[1].strip ? finalMatch[1].strip() : finalMatch[1].trim()) : (!thoughtMatch && !actionMatch ? content : '')
    };
  };

  // Extract all assistant/user messages from all agents in chronological order or use the Root AI's message log
  const getGlobalChat = () => {
    if (state?.chat_history) {
      return state.chat_history;
    }
    if (!state?.agents) return [];
    
    // Fallback to legacy parsing if chat_history is not available
    const rootAi = state.agents.find(a => a.name === "Root_AI");
    if (!rootAi) return [];

    // Filter out initial system prompts and thoughts/actions/observations to keep conversation clean
    return rootAi.messages.filter(m => {
      if (m.role === 'system') return false;
      const contentLower = m.content.toLowerCase();
      if (contentLower.includes("observation:") || contentLower.includes("thought:") || contentLower.includes("action:")) {
        return false;
      }
      return true;
    });
  };

  const chatMessages = getGlobalChat();

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {chatMessages.length === 0 && liveActivities.length === 0 ? (
          <div className="editor-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p>Welcome! Type a command to start cooperating with ATT.</p>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Try: "Write a python script that prints primes up to 100"</span>
          </div>
        ) : (
          <>
            {chatMessages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const parsed = isUser ? { answer: msg.content } : parseMessage(msg.content);

              return (
                <div key={idx} className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
                  <div className="msg-sender">
                    {isUser ? 'You' : 'ATT AI Team'}
                  </div>
                  
                  {/* Main bubble displaying final answer/message */}
                  {(parsed.answer || (!parsed.thoughts && !parsed.action)) && (
                    <div className="msg-text-box">
                      {parsed.answer || "Cooperating..."}
                    </div>
                  )}

                  {/* Collapsible Thoughts & Actions inside assistant bubble */}
                  {!isUser && (parsed.thoughts || parsed.action) && (
                    <ThoughtAccordion thoughts={parsed.thoughts} action={parsed.action} />
                  )}
                </div>
              );
            })}

            {/* Live streaming activities when running */}
            {liveActivities.length > 0 && (
              <div className="live-activities-container">
                <div className="live-activities-header">
                  <span className="live-pulse-dot"></span>
                  <span>Live Agent Execution Stream</span>
                </div>
                <div className="live-activities-list">
                  {liveActivities.map((act, idx) => (
                    <div key={idx} className={`live-activity-item ${act.activity_type.toLowerCase()}`}>
                      <span className="activity-agent">🤖 {act.agent_name}</span>
                      <span className="activity-badge">{act.activity_type}</span>
                      <div className="activity-content">
                        {act.activity_type === 'Action' ? (
                          <code>{act.content}</code>
                        ) : (
                          act.content
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-bar">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={state?.is_running ? "ATT is working..." : "Ask ATT to do something..."}
          className="chat-input-field"
          disabled={state?.is_running}
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={!input.trim() || state?.is_running}
        >
          {state?.is_running ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="animate-spin" style={{ fill: 'none', animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
                <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Running
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
              Send
            </>
          )}
        </button>
      </form>
      
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}

function ThoughtAccordion({ thoughts, action }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="accordion-thought">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <span>⚙️ Show Agent Thoughts & Actions</span>
        <span>{isOpen ? '▲' : '▼'}</span>
      </div>
      {isOpen && (
        <div className="accordion-content">
          {thoughts && (
            <div style={{ marginBottom: action ? '12px' : 0 }}>
              <strong style={{ color: 'var(--accent-purple)', display: 'block', marginBottom: '4px' }}>Thought:</strong>
              {thoughts}
            </div>
          )}
          {action && (
            <div>
              <strong style={{ color: 'var(--accent-cyan)', display: 'block', marginBottom: '4px' }}>Action:</strong>
              <code>{action}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
