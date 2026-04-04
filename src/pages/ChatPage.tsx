import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  AlertTriangle,
  Trash2,
  Database,
  Stethoscope,
  Sparkles,
  Users,
  Loader,
} from 'lucide-react';
import {
  useHealthStore,
  buildHealthContext,
  getHealthContextCount,
  sendDualDoctorChat,
} from '../stores/healthStore';

type ChatMode = 'both' | 'atlas' | 'nova';
type MessageSender = 'user' | 'atlas' | 'nova';

interface ChatMessage {
  id: string;
  sender: MessageSender;
  content: string;
  timestamp: number;
}

const QUICK_QUESTIONS = [
  'What should I be most concerned about?',
  'Summarize my latest labs',
  'What lifestyle changes do you recommend?',
  'Explain my MRI findings',
];

let msgIdCounter = 0;
function nextId(): string {
  return `msg-${++msgIdCounter}-${Date.now()}`;
}

export default function ChatPage() {
  const store = useHealthStore();
  const { activeMemberId, familyMembers, metrics, restrictions, reports, vitals, alerts } = store;
  const member = familyMembers.find(m => m.id === activeMemberId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState<{ atlas: boolean; nova: boolean }>({ atlas: false, nova: false });
  const [mode, setMode] = useState<ChatMode>('both');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = loading.atlas || loading.nova;

  const healthContext = buildHealthContext({ familyMembers, activeMemberId, metrics, restrictions, reports, vitals, alerts });
  const contextCount = getHealthContextCount({ metrics, restrictions, reports, vitals, alerts });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Reset chat when switching members
  useEffect(() => {
    setMessages([]);
  }, [activeMemberId]);

  // Build messages array for a specific doctor from the conversation so far
  const buildDoctorMessages = useCallback(
    (sender: 'atlas' | 'nova', conversationMessages: ChatMessage[], extraUserMessage?: string): Array<{ role: string; content: string }> => {
      const apiMessages: Array<{ role: string; content: string }> = [];
      for (const msg of conversationMessages) {
        if (msg.sender === 'user') {
          apiMessages.push({ role: 'user', content: msg.content });
        } else if (msg.sender === sender) {
          apiMessages.push({ role: 'assistant', content: msg.content });
        } else {
          // Other doctor's message: present as user context
          const otherName = msg.sender === 'atlas' ? 'Dr. Atlas' : 'Dr. Nova';
          apiMessages.push({ role: 'user', content: `[${otherName} said]: ${msg.content}` });
        }
      }
      if (extraUserMessage) {
        apiMessages.push({ role: 'user', content: extraUserMessage });
      }
      return apiMessages;
    },
    []
  );

  const sendMessage = useCallback(
    async (text?: string) => {
      const messageText = (text ?? input).trim();
      if (!messageText || isLoading || !activeMemberId) return;
      setInput('');

      const userMsg: ChatMessage = { id: nextId(), sender: 'user', content: messageText, timestamp: Date.now() };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      if (mode === 'atlas') {
        // Dr. Atlas only
        setLoading({ atlas: true, nova: false });
        const apiMsgs = buildDoctorMessages('atlas', updatedMessages);
        const response = await sendDualDoctorChat('claude', apiMsgs, healthContext);
        const atlasMsg: ChatMessage = { id: nextId(), sender: 'atlas', content: response, timestamp: Date.now() };
        setMessages(prev => [...prev, atlasMsg]);
        setLoading({ atlas: false, nova: false });
      } else if (mode === 'nova') {
        // Dr. Nova only
        setLoading({ atlas: false, nova: true });
        const apiMsgs = buildDoctorMessages('nova', updatedMessages);
        const response = await sendDualDoctorChat('gpt', apiMsgs, healthContext);
        const novaMsg: ChatMessage = { id: nextId(), sender: 'nova', content: response, timestamp: Date.now() };
        setMessages(prev => [...prev, novaMsg]);
        setLoading({ atlas: false, nova: false });
      } else {
        // "Ask Both" mode: both respond, then 1 round of discussion
        setLoading({ atlas: true, nova: true });

        const atlasMsgs = buildDoctorMessages('atlas', updatedMessages);
        const novaMsgs = buildDoctorMessages('nova', updatedMessages);

        const [atlasResponse, novaResponse] = await Promise.all([
          sendDualDoctorChat('claude', atlasMsgs, healthContext),
          sendDualDoctorChat('gpt', novaMsgs, healthContext),
        ]);

        const atlasMsg: ChatMessage = { id: nextId(), sender: 'atlas', content: atlasResponse, timestamp: Date.now() };
        const novaMsg: ChatMessage = { id: nextId(), sender: 'nova', content: novaResponse, timestamp: Date.now() };
        const afterBothMessages = [...updatedMessages, atlasMsg, novaMsg];
        setMessages(afterBothMessages);
        setLoading({ atlas: false, nova: false });

        // Discussion round: each doctor comments on the other's response
        setLoading({ atlas: true, nova: true });

        const atlasDiscussMsgs = buildDoctorMessages(
          'atlas',
          afterBothMessages,
          'Please briefly comment on Dr. Nova\'s perspective above. Do you agree, disagree, or have anything to add? Keep it concise.'
        );
        const novaDiscussMsgs = buildDoctorMessages(
          'nova',
          afterBothMessages,
          'Please briefly comment on Dr. Atlas\'s perspective above. Do you agree, disagree, or have anything to add? Keep it concise.'
        );

        const [atlasDiscuss, novaDiscuss] = await Promise.all([
          sendDualDoctorChat('claude', atlasDiscussMsgs, healthContext),
          sendDualDoctorChat('gpt', novaDiscussMsgs, healthContext),
        ]);

        const atlasDiscussMsg: ChatMessage = { id: nextId(), sender: 'atlas', content: atlasDiscuss, timestamp: Date.now() };
        const novaDiscussMsg: ChatMessage = { id: nextId(), sender: 'nova', content: novaDiscuss, timestamp: Date.now() };
        setMessages(prev => [...prev, atlasDiscussMsg, novaDiscussMsg]);
        setLoading({ atlas: false, nova: false });
      }

      inputRef.current?.focus();
    },
    [input, isLoading, activeMemberId, messages, mode, healthContext, buildDoctorMessages]
  );

  const clearChat = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <div className="chat-page">
      <div className="view-header">
        <div>
          <h1 className="view-title">AI Consultation</h1>
          <p className="view-subtitle">
            {member ? `Dual-doctor analysis for ${member.first_name}` : 'Select a family member'}
          </p>
        </div>
        <div className="chat-header-actions">
          {contextCount > 0 && (
            <span className="chat-context-badge">
              <Database size={12} />
              {contextCount} data points
            </span>
          )}
          {messages.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={clearChat}>
              <Trash2 size={14} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="chat-disclaimer">
        <AlertTriangle size={14} />
        <span>AI provides general health information only. Always consult your doctor for medical decisions.</span>
      </div>

      {/* Mode selector */}
      <div className="chat-mode-bar">
        <button
          className={`chat-mode-btn${mode === 'both' ? ' active' : ''}`}
          onClick={() => setMode('both')}
        >
          <Users size={14} />
          Ask Both
        </button>
        <button
          className={`chat-mode-btn chat-mode-atlas${mode === 'atlas' ? ' active' : ''}`}
          onClick={() => setMode('atlas')}
        >
          <Stethoscope size={14} />
          Dr. Atlas
        </button>
        <button
          className={`chat-mode-btn chat-mode-nova${mode === 'nova' ? ' active' : ''}`}
          onClick={() => setMode('nova')}
        >
          <Sparkles size={14} />
          Dr. Nova
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="chat-welcome-doctors">
              <div className="chat-doctor-intro chat-doctor-intro-atlas">
                <div className="chat-avatar chat-avatar-atlas">
                  <Stethoscope size={20} />
                </div>
                <div>
                  <strong>Dr. Atlas</strong>
                  <p>Methodical, evidence-based, cautious</p>
                </div>
              </div>
              <div className="chat-doctor-intro chat-doctor-intro-nova">
                <div className="chat-avatar chat-avatar-nova">
                  <Sparkles size={20} />
                </div>
                <div>
                  <strong>Dr. Nova</strong>
                  <p>Bold, pattern-finding, holistic</p>
                </div>
              </div>
            </div>
            <h2>Two perspectives, one conversation</h2>
            <p>
              Ask a question and get analysis from both AI doctors, then watch them discuss each other's findings.
            </p>
            <div className="chat-suggestions">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  className="btn btn-secondary btn-sm"
                  onClick={() => sendMessage(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-message chat-message-${msg.sender}`}>
            {msg.sender !== 'user' && (
              <div className={`chat-avatar chat-avatar-${msg.sender}`}>
                {msg.sender === 'atlas' ? <Stethoscope size={14} /> : <Sparkles size={14} />}
              </div>
            )}
            <div className="chat-msg-body">
              {msg.sender !== 'user' && (
                <span className={`chat-doctor-label chat-doctor-label-${msg.sender}`}>
                  {msg.sender === 'atlas' ? 'Dr. Atlas' : 'Dr. Nova'}
                </span>
              )}
              <div className="chat-message-content">
                {msg.content.split('\n').map((line, j) => (
                  <span key={j}>
                    {line}
                    {j < msg.content.split('\n').length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}

        {loading.atlas && (
          <div className="chat-message chat-message-atlas">
            <div className="chat-avatar chat-avatar-atlas">
              <Stethoscope size={14} />
            </div>
            <div className="chat-msg-body">
              <span className="chat-doctor-label chat-doctor-label-atlas">Dr. Atlas</span>
              <div className="chat-message-content typing">
                <Loader size={14} className="spin" /> Analyzing...
              </div>
            </div>
          </div>
        )}
        {loading.nova && (
          <div className="chat-message chat-message-nova">
            <div className="chat-avatar chat-avatar-nova">
              <Sparkles size={14} />
            </div>
            <div className="chat-msg-body">
              <span className="chat-doctor-label chat-doctor-label-nova">Dr. Nova</span>
              <div className="chat-message-content typing">
                <Loader size={14} className="spin" /> Thinking...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <input
          ref={inputRef}
          type="text"
          className="input-field"
          placeholder={`Ask ${mode === 'atlas' ? 'Dr. Atlas' : mode === 'nova' ? 'Dr. Nova' : 'both doctors'}...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
          disabled={!activeMemberId || isLoading}
        />
        <button
          className="btn btn-primary"
          onClick={() => sendMessage()}
          disabled={!input.trim() || isLoading || !activeMemberId}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
