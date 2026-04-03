import { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { useHealthStore, sendHealthChat } from '../stores/healthStore';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const { activeMemberId, familyMembers } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset chat when switching members
  useEffect(() => {
    setMessages([]);
  }, [activeMemberId]);

  const handleSend = async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || loading || !activeMemberId) return;
    setInput('');

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: messageText }];
    setMessages(newMessages);
    setLoading(true);

    const response = await sendHealthChat(
      activeMemberId,
      newMessages.map(m => ({ role: m.role, content: m.content }))
    );

    setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    setLoading(false);
    inputRef.current?.focus();
  };

  const clearChat = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <div className="chat-page">
      <div className="view-header">
        <div>
          <h1 className="view-title">AI Health Assistant</h1>
          <p className="view-subtitle">
            {member ? `Ask questions about ${member.first_name}'s health` : 'Select a family member'}
          </p>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={clearChat}>
            <Trash2 size={14} /> Clear
          </button>
        )}
      </div>

      <div className="chat-disclaimer">
        <AlertTriangle size={14} />
        <span>AI provides general health information only. Always consult your doctor for medical decisions.</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <MessageCircle size={48} />
            <h2>Ask me anything</h2>
            <p>
              I have context about {member?.first_name ?? 'your family member'}'s health data — reports, metrics, restrictions, and vitals.
            </p>
            <div className="chat-suggestions">
              <button className="btn btn-secondary btn-sm" onClick={() => handleSend('What does my latest blood test show?')}>
                Latest blood test results
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleSend('Are there any concerning trends in my health data?')}>
                Health trends
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleSend('Is melatonin safe given my current medications and restrictions?')}>
                Medication safety check
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleSend('Summarize my overall health status')}>
                Health summary
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message-${msg.role}`}>
            <div className="chat-message-content">
              {msg.content.split('\n').map((line, j) => (
                <span key={j}>
                  {line}
                  {j < msg.content.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-message-content typing">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <input
          ref={inputRef}
          type="text"
          className="input-field"
          placeholder={`Ask about ${member?.first_name ?? 'health'}...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          disabled={!activeMemberId}
        />
        <button className="btn btn-primary" onClick={() => handleSend()} disabled={!input.trim() || loading || !activeMemberId}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
