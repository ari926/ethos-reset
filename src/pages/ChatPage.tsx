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

type RoomTab = 'atlas' | 'nova' | 'conference';
type MessageSender = 'user' | 'atlas' | 'nova' | 'system';

interface ChatMessage {
  id: string;
  sender: MessageSender;
  content: string;
  timestamp: number;
}

interface RoomState {
  messages: ChatMessage[];
  loading: { atlas: boolean; nova: boolean };
}

const QUICK_QUESTIONS = [
  'What should I be most concerned about?',
  'Summarize my latest labs',
  'What lifestyle changes do you recommend?',
  'Compare my cholesterol trend over time',
  'Explain my MRI findings',
  'What do my gut health markers suggest?',
];

let msgIdCounter = 0;
function nextId(): string {
  return `msg-${++msgIdCounter}-${Date.now()}`;
}

/* ── Individual Room Chat ── */
function DoctorRoom({
  doctor,
  room,
  setRoom,
  healthContext,
  contextCount,
  activeMemberId,
}: {
  doctor: 'atlas' | 'nova';
  room: RoomState;
  setRoom: (updater: (prev: RoomState) => RoomState) => void;
  healthContext: string;
  contextCount: number;
  activeMemberId: string | null;
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLoading = doctor === 'atlas' ? room.loading.atlas : room.loading.nova;
  const doctorName = doctor === 'atlas' ? 'Dr. Atlas' : 'Dr. Nova';
  const model = doctor === 'atlas' ? 'claude' as const : 'gpt' as const;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.messages, room.loading]);

  const buildMessages = useCallback(
    (msgs: ChatMessage[]): Array<{ role: string; content: string }> => {
      return msgs.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));
    },
    []
  );

  const sendMessage = useCallback(
    async (text?: string) => {
      const messageText = (text ?? input).trim();
      if (!messageText || isLoading || !activeMemberId) return;
      setInput('');

      const userMsg: ChatMessage = { id: nextId(), sender: 'user', content: messageText, timestamp: Date.now() };
      setRoom(prev => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        loading: { ...prev.loading, [doctor]: true },
      }));

      const allMsgs = [...room.messages, userMsg];
      const apiMsgs = buildMessages(allMsgs);
      const response = await sendDualDoctorChat(model, apiMsgs, healthContext);

      const doctorMsg: ChatMessage = { id: nextId(), sender: doctor, content: response, timestamp: Date.now() };
      setRoom(prev => ({
        ...prev,
        messages: [...prev.messages, doctorMsg],
        loading: { ...prev.loading, [doctor]: false },
      }));

      inputRef.current?.focus();
    },
    [input, isLoading, activeMemberId, room.messages, doctor, model, healthContext, buildMessages, setRoom]
  );

  return (
    <div className="doctor-room">
      <div className="doctor-room-header">
        <div className={`chat-avatar chat-avatar-${doctor}`}>
          {doctor === 'atlas' ? <Stethoscope size={16} /> : <Sparkles size={16} />}
        </div>
        <div>
          <h3>{doctorName}</h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', margin: 0 }}>
            {doctor === 'atlas' ? 'Methodical · Evidence-based · Cautious' : 'Bold · Pattern-finding · Holistic'}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {contextCount > 0 && (
            <span className="chat-context-badge">
              <Database size={11} /> {contextCount}
            </span>
          )}
          {room.messages.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setRoom(prev => ({ ...prev, messages: [] }))}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages">
        {room.messages.length === 0 && (
          <div className="chat-welcome" style={{ padding: '2rem 1rem' }}>
            <div className={`chat-avatar chat-avatar-${doctor}`} style={{ width: 48, height: 48, margin: '0 auto 1rem' }}>
              {doctor === 'atlas' ? <Stethoscope size={24} /> : <Sparkles size={24} />}
            </div>
            <h2 style={{ fontSize: 'var(--text-base)' }}>Chat with {doctorName}</h2>
            <p style={{ fontSize: 'var(--text-xs)', maxWidth: 400 }}>
              {doctor === 'atlas'
                ? 'I take a careful, evidence-based approach. I\'ll cite reference ranges and clinical guidelines.'
                : 'I look for hidden patterns and connections. I consider functional medicine alongside conventional views.'}
            </p>
            <div className="chat-suggestions" style={{ marginTop: '1rem' }}>
              {QUICK_QUESTIONS.slice(0, 4).map(q => (
                <button key={q} className="btn btn-secondary btn-sm" onClick={() => sendMessage(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {room.messages.map(msg => (
          <div key={msg.id} className={`chat-message chat-message-${msg.sender}`}>
            {msg.sender !== 'user' && (
              <div className={`chat-avatar chat-avatar-${msg.sender}`}>
                {msg.sender === 'atlas' ? <Stethoscope size={14} /> : <Sparkles size={14} />}
              </div>
            )}
            <div className="chat-msg-body">
              {msg.sender !== 'user' && (
                <span className={`chat-doctor-label chat-doctor-label-${msg.sender}`}>{doctorName}</span>
              )}
              <div className="chat-message-content">
                {msg.content.split('\n').map((line, j) => (
                  <span key={j}>{line}{j < msg.content.split('\n').length - 1 && <br />}</span>
                ))}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className={`chat-message chat-message-${doctor}`}>
            <div className={`chat-avatar chat-avatar-${doctor}`}>
              {doctor === 'atlas' ? <Stethoscope size={14} /> : <Sparkles size={14} />}
            </div>
            <div className="chat-msg-body">
              <span className={`chat-doctor-label chat-doctor-label-${doctor}`}>{doctorName}</span>
              <div className="chat-message-content typing">
                <Loader size={14} className="spin" /> {doctor === 'atlas' ? 'Analyzing...' : 'Thinking...'}
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
          placeholder={`Ask ${doctorName}...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
          disabled={!activeMemberId || isLoading}
        />
        <button className="btn btn-primary" onClick={() => sendMessage()} disabled={!input.trim() || isLoading || !activeMemberId}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

/* ── Conference Room ── */
function ConferenceRoom({
  room,
  setRoom,
  healthContext,
  contextCount,
  activeMemberId,
}: {
  room: RoomState;
  setRoom: (updater: (prev: RoomState) => RoomState) => void;
  healthContext: string;
  contextCount: number;
  activeMemberId: string | null;
}) {
  const [input, setInput] = useState('');
  const [rounds, setRounds] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLoading = room.loading.atlas || room.loading.nova;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.messages, room.loading]);

  const buildDoctorMessages = useCallback(
    (sender: 'atlas' | 'nova', msgs: ChatMessage[], extra?: string): Array<{ role: string; content: string }> => {
      const apiMsgs: Array<{ role: string; content: string }> = [];
      for (const msg of msgs) {
        if (msg.sender === 'user' || msg.sender === 'system') {
          apiMsgs.push({ role: 'user', content: msg.content });
        } else if (msg.sender === sender) {
          apiMsgs.push({ role: 'assistant', content: msg.content });
        } else {
          const name = msg.sender === 'atlas' ? 'Dr. Atlas' : 'Dr. Nova';
          apiMsgs.push({ role: 'user', content: `[${name} said]: ${msg.content}` });
        }
      }
      if (extra) apiMsgs.push({ role: 'user', content: extra });
      return apiMsgs;
    },
    []
  );

  const sendMessage = useCallback(
    async (text?: string) => {
      const messageText = (text ?? input).trim();
      if (!messageText || isLoading || !activeMemberId) return;
      setInput('');

      const userMsg: ChatMessage = { id: nextId(), sender: 'user', content: messageText, timestamp: Date.now() };
      let allMsgs = [...room.messages, userMsg];
      setRoom(prev => ({ ...prev, messages: allMsgs, loading: { atlas: true, nova: true } }));

      // Both doctors respond
      const [atlasRes, novaRes] = await Promise.all([
        sendDualDoctorChat('claude', buildDoctorMessages('atlas', allMsgs), healthContext),
        sendDualDoctorChat('gpt', buildDoctorMessages('nova', allMsgs), healthContext),
      ]);

      const atlasMsg: ChatMessage = { id: nextId(), sender: 'atlas', content: atlasRes, timestamp: Date.now() };
      const novaMsg: ChatMessage = { id: nextId(), sender: 'nova', content: novaRes, timestamp: Date.now() };
      allMsgs = [...allMsgs, atlasMsg, novaMsg];
      setRoom(prev => ({ ...prev, messages: allMsgs, loading: { atlas: false, nova: false } }));

      // Discussion rounds
      for (let r = 0; r < rounds; r++) {
        const separator: ChatMessage = {
          id: nextId(),
          sender: 'system',
          content: `── Discussion Round ${r + 1} ──`,
          timestamp: Date.now(),
        };
        allMsgs = [...allMsgs, separator];
        setRoom(prev => ({ ...prev, messages: allMsgs, loading: { atlas: true, nova: true } }));

        const prompt = r === 0
          ? 'Please comment on the other doctor\'s assessment. Where do you agree or disagree? What did they miss?'
          : 'Continue the discussion. Add any final thoughts, points of agreement, or recommendations you both endorse.';

        const [atlasDiscuss, novaDiscuss] = await Promise.all([
          sendDualDoctorChat('claude', buildDoctorMessages('atlas', allMsgs, prompt), healthContext),
          sendDualDoctorChat('gpt', buildDoctorMessages('nova', allMsgs, prompt), healthContext),
        ]);

        const aDis: ChatMessage = { id: nextId(), sender: 'atlas', content: atlasDiscuss, timestamp: Date.now() };
        const nDis: ChatMessage = { id: nextId(), sender: 'nova', content: novaDiscuss, timestamp: Date.now() };
        allMsgs = [...allMsgs, aDis, nDis];
        setRoom(prev => ({ ...prev, messages: allMsgs, loading: { atlas: false, nova: false } }));
      }

      inputRef.current?.focus();
    },
    [input, isLoading, activeMemberId, room.messages, rounds, healthContext, buildDoctorMessages, setRoom]
  );

  return (
    <div className="doctor-room conference-room">
      <div className="doctor-room-header">
        <div className="conference-avatars">
          <div className="chat-avatar chat-avatar-atlas" style={{ marginRight: '-8px', zIndex: 2 }}>
            <Stethoscope size={14} />
          </div>
          <div className="chat-avatar chat-avatar-nova">
            <Sparkles size={14} />
          </div>
        </div>
        <div>
          <h3>Conference Room</h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', margin: 0 }}>
            Both doctors analyze and debate
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            Rounds:
            <select
              value={rounds}
              onChange={e => setRounds(Number(e.target.value))}
              style={{ fontSize: 'var(--text-xs)', padding: '0.15rem 0.3rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-offset)', border: '1px solid var(--color-divider)', color: 'var(--color-tx)' }}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          {contextCount > 0 && (
            <span className="chat-context-badge">
              <Database size={11} /> {contextCount}
            </span>
          )}
          {room.messages.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setRoom(prev => ({ ...prev, messages: [] }))}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages">
        {room.messages.length === 0 && (
          <div className="chat-welcome" style={{ padding: '2rem 1rem' }}>
            <div className="conference-avatars" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
              <div className="chat-avatar chat-avatar-atlas" style={{ width: 48, height: 48, marginRight: '-8px', zIndex: 2 }}>
                <Stethoscope size={24} />
              </div>
              <div className="chat-avatar chat-avatar-nova" style={{ width: 48, height: 48 }}>
                <Sparkles size={24} />
              </div>
            </div>
            <h2 style={{ fontSize: 'var(--text-base)' }}>Medical Conference</h2>
            <p style={{ fontSize: 'var(--text-xs)', maxWidth: 450 }}>
              Ask a question and both doctors will respond independently, then debate each other's findings.
              Adjust the number of discussion rounds for deeper analysis.
            </p>
            <div className="chat-suggestions" style={{ marginTop: '1rem' }}>
              {QUICK_QUESTIONS.map(q => (
                <button key={q} className="btn btn-secondary btn-sm" onClick={() => sendMessage(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {room.messages.map(msg => (
          msg.sender === 'system' ? (
            <div key={msg.id} className="chat-system-divider">
              <span>{msg.content}</span>
            </div>
          ) : (
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
                    <span key={j}>{line}{j < msg.content.split('\n').length - 1 && <br />}</span>
                  ))}
                </div>
              </div>
            </div>
          )
        ))}

        {(room.loading.atlas || room.loading.nova) && (
          <div className="conference-loading">
            {room.loading.atlas && (
              <div className="chat-message chat-message-atlas">
                <div className="chat-avatar chat-avatar-atlas"><Stethoscope size={14} /></div>
                <div className="chat-msg-body">
                  <span className="chat-doctor-label chat-doctor-label-atlas">Dr. Atlas</span>
                  <div className="chat-message-content typing"><Loader size={14} className="spin" /> Analyzing...</div>
                </div>
              </div>
            )}
            {room.loading.nova && (
              <div className="chat-message chat-message-nova">
                <div className="chat-avatar chat-avatar-nova"><Sparkles size={14} /></div>
                <div className="chat-msg-body">
                  <span className="chat-doctor-label chat-doctor-label-nova">Dr. Nova</span>
                  <div className="chat-message-content typing"><Loader size={14} className="spin" /> Thinking...</div>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <input
          ref={inputRef}
          type="text"
          className="input-field"
          placeholder="Ask both doctors..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
          disabled={!activeMemberId || isLoading}
        />
        <button className="btn btn-primary" onClick={() => sendMessage()} disabled={!input.trim() || isLoading || !activeMemberId}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

/* ═══════ MAIN PAGE ═══════ */
export default function ChatPage() {
  const store = useHealthStore();
  const { activeMemberId, familyMembers, metrics, restrictions, reports, vitals, alerts } = store;
  const member = familyMembers.find(m => m.id === activeMemberId);

  const [activeTab, setActiveTab] = useState<RoomTab>('conference');
  const [atlasRoom, setAtlasRoom] = useState<RoomState>({ messages: [], loading: { atlas: false, nova: false } });
  const [novaRoom, setNovaRoom] = useState<RoomState>({ messages: [], loading: { atlas: false, nova: false } });
  const [conferenceRoom, setConferenceRoom] = useState<RoomState>({ messages: [], loading: { atlas: false, nova: false } });

  const healthContext = buildHealthContext({ familyMembers, activeMemberId, metrics, restrictions, reports, vitals, alerts });
  const contextCount = getHealthContextCount({ metrics, restrictions, reports, vitals, alerts });

  // Reset on member switch
  useEffect(() => {
    setAtlasRoom({ messages: [], loading: { atlas: false, nova: false } });
    setNovaRoom({ messages: [], loading: { atlas: false, nova: false } });
    setConferenceRoom({ messages: [], loading: { atlas: false, nova: false } });
  }, [activeMemberId]);

  return (
    <div className="chat-page doctor-ai-page">
      <div className="view-header">
        <div>
          <h1 className="view-title">Doctor AI</h1>
          <p className="view-subtitle">
            {member ? `Health consultation for ${member.first_name}` : 'Select a family member'}
          </p>
        </div>
      </div>

      <div className="chat-disclaimer">
        <AlertTriangle size={14} />
        <span>AI provides general health information only. Always consult your doctor for medical decisions.</span>
      </div>

      {/* Tab bar */}
      <div className="doctor-ai-tabs">
        <button
          className={`doctor-ai-tab doctor-ai-tab-atlas${activeTab === 'atlas' ? ' active' : ''}`}
          onClick={() => setActiveTab('atlas')}
        >
          <Stethoscope size={16} />
          <span className="doctor-ai-tab-label">Dr. Atlas</span>
          <span className="doctor-ai-tab-sub">Claude</span>
          {atlasRoom.messages.length > 0 && (
            <span className="doctor-ai-tab-badge">{atlasRoom.messages.filter(m => m.sender === 'atlas').length}</span>
          )}
        </button>
        <button
          className={`doctor-ai-tab doctor-ai-tab-nova${activeTab === 'nova' ? ' active' : ''}`}
          onClick={() => setActiveTab('nova')}
        >
          <Sparkles size={16} />
          <span className="doctor-ai-tab-label">Dr. Nova</span>
          <span className="doctor-ai-tab-sub">GPT-4</span>
          {novaRoom.messages.length > 0 && (
            <span className="doctor-ai-tab-badge">{novaRoom.messages.filter(m => m.sender === 'nova').length}</span>
          )}
        </button>
        <button
          className={`doctor-ai-tab doctor-ai-tab-conference${activeTab === 'conference' ? ' active' : ''}`}
          onClick={() => setActiveTab('conference')}
        >
          <Users size={16} />
          <span className="doctor-ai-tab-label">Conference</span>
          <span className="doctor-ai-tab-sub">Both debate</span>
          {conferenceRoom.messages.length > 0 && (
            <span className="doctor-ai-tab-badge">{conferenceRoom.messages.filter(m => m.sender !== 'user' && m.sender !== 'system').length}</span>
          )}
        </button>
      </div>

      {/* Active Room */}
      {activeTab === 'atlas' && (
        <DoctorRoom doctor="atlas" room={atlasRoom} setRoom={setAtlasRoom} healthContext={healthContext} contextCount={contextCount} activeMemberId={activeMemberId} />
      )}
      {activeTab === 'nova' && (
        <DoctorRoom doctor="nova" room={novaRoom} setRoom={setNovaRoom} healthContext={healthContext} contextCount={contextCount} activeMemberId={activeMemberId} />
      )}
      {activeTab === 'conference' && (
        <ConferenceRoom room={conferenceRoom} setRoom={setConferenceRoom} healthContext={healthContext} contextCount={contextCount} activeMemberId={activeMemberId} />
      )}
    </div>
  );
}
