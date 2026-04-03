import { useState, useEffect } from 'react';
import { Watch, Link, Unlink, RefreshCw, Clock, Activity, Heart, Moon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useHealthStore } from '../stores/healthStore';
import toast from 'react-hot-toast';
import { timeAgo } from '../lib/utils';

interface WearableConnection {
  id: string;
  provider: string;
  member_id: string;
  status: string;
  last_sync_at: string | null;
  metadata: Record<string, unknown> | null;
}

const WEARABLE_DEFS = [
  {
    id: 'oura',
    name: 'Oura Ring',
    description: 'Sleep stages, readiness score, activity, heart rate, HRV, SpO2, body temperature',
    icon: Heart,
    color: '#1a1a2e',
    dataTypes: ['sleep_score', 'hrv', 'heart_rate', 'spo2', 'temperature', 'steps'],
    integration: 'direct',
  },
  {
    id: 'whoop',
    name: 'WHOOP',
    description: 'Recovery score, strain, sleep performance, HRV, respiratory rate, SpO2',
    icon: Activity,
    color: '#00b050',
    dataTypes: ['hrv', 'heart_rate', 'respiratory_rate', 'spo2', 'sleep_score'],
    integration: 'direct',
  },
  {
    id: 'apple_watch',
    name: 'Apple Watch',
    description: 'Activity rings, heart rate, workouts, sleep tracking, blood oxygen (via Vital API)',
    icon: Watch,
    color: '#333333',
    dataTypes: ['heart_rate', 'steps', 'spo2', 'sleep_score'],
    integration: 'vital',
  },
  {
    id: 'eight_sleep',
    name: 'Eight Sleep',
    description: 'Sleep tracking, bed temperature control, heart rate, HRV, respiratory rate',
    icon: Moon,
    color: '#1e3a5f',
    dataTypes: ['sleep_score', 'heart_rate', 'hrv', 'respiratory_rate', 'temperature'],
    integration: 'vital',
  },
];

export default function WearablesPage() {
  const { user } = useAuthStore();
  const { familyMembers, activeMemberId } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [connections, setConnections] = useState<WearableConnection[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);

  const loadConnections = async () => {
    const { data } = await supabase
      .from('wearable_connections')
      .select('*')
      .order('created_at', { ascending: false });
    setConnections(data ?? []);
  };

  useEffect(() => { loadConnections(); }, []);

  const handleConnect = async (provider: string) => {
    if (!user || !activeMemberId) {
      toast.error('Select a family member first');
      return;
    }

    // Check if already connected
    const existing = connections.find(c => c.provider === provider && c.member_id === activeMemberId);
    if (existing && existing.status === 'connected') {
      toast('Already connected');
      return;
    }

    const def = WEARABLE_DEFS.find(w => w.id === provider);
    if (def?.integration === 'direct') {
      // For Oura and WHOOP — OAuth flow will redirect
      // TODO: Implement OAuth redirect to provider
      toast.success(`${def.name} connection initiated — OAuth flow coming soon`);

      // Create placeholder connection record
      if (existing) {
        await supabase.from('wearable_connections').update({ status: 'connected' }).eq('id', existing.id);
      } else {
        await supabase.from('wearable_connections').insert({
          owner_id: user.id,
          member_id: activeMemberId,
          provider,
          status: 'connected',
        });
      }
    } else {
      // For Apple Watch / Eight Sleep — Vital API
      toast.success(`${def?.name} — Vital API integration coming soon`);

      if (!existing) {
        await supabase.from('wearable_connections').insert({
          owner_id: user.id,
          member_id: activeMemberId,
          provider,
          status: 'disconnected',
          metadata: { integration: 'vital', note: 'Pending Vital API setup' },
        });
      }
    }

    loadConnections();
  };

  const handleDisconnect = async (connectionId: string) => {
    await supabase.from('wearable_connections').update({ status: 'disconnected' }).eq('id', connectionId);
    toast.success('Disconnected');
    loadConnections();
  };

  const handleSync = async (connectionId: string, provider: string) => {
    setSyncing(provider);
    // TODO: Trigger actual sync via Edge Function or webhook
    await new Promise(r => setTimeout(r, 1500));
    await supabase.from('wearable_connections').update({ last_sync_at: new Date().toISOString() }).eq('id', connectionId);
    toast.success('Sync complete');
    setSyncing(null);
    loadConnections();
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Wearables</h1>
          <p className="view-subtitle">
            {member ? `Connected devices for ${member.first_name}` : 'Connect health wearables for live data'}
          </p>
        </div>
      </div>

      <div className="wearable-grid">
        {WEARABLE_DEFS.map(def => {
          const conn = connections.find(c => c.provider === def.id && c.member_id === activeMemberId);
          const isConnected = conn?.status === 'connected';
          const Icon = def.icon;

          return (
            <div key={def.id} className={`wearable-card ${isConnected ? 'connected' : ''}`}>
              <div className="wearable-card-icon-wrap" style={{ background: def.color }}>
                <Icon size={24} color="white" />
              </div>
              <div className="wearable-card-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3>{def.name}</h3>
                  {isConnected && <span className="badge badge-success">Connected</span>}
                  {conn && conn.status === 'error' && <span className="badge badge-error">Error</span>}
                  <span className="badge badge-muted" style={{ fontSize: '10px' }}>
                    {def.integration === 'direct' ? 'Direct API' : 'via Vital'}
                  </span>
                </div>
                <p>{def.description}</p>
                {conn?.last_sync_at && (
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)', marginTop: '0.25rem' }}>
                    <Clock size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.25rem' }} />
                    Last sync: {timeAgo(conn.last_sync_at)}
                  </p>
                )}
                <div className="wearable-data-types">
                  {def.dataTypes.map(dt => (
                    <span key={dt} className="badge badge-muted" style={{ fontSize: '10px' }}>
                      {dt.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
              <div className="wearable-card-actions">
                {isConnected ? (
                  <>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleSync(conn!.id, def.id)}
                      disabled={syncing === def.id}
                    >
                      <RefreshCw size={14} className={syncing === def.id ? 'spinning' : ''} />
                      {syncing === def.id ? 'Syncing...' : 'Sync'}
                    </button>
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--color-error)' }} onClick={() => handleDisconnect(conn!.id)}>
                      <Unlink size={14} />
                    </button>
                  </>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => handleConnect(def.id)} disabled={!activeMemberId}>
                    <Link size={14} /> Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {connections.filter(c => c.status === 'connected').length > 0 && (
        <div className="section" style={{ marginTop: '2rem' }}>
          <h2 className="section-title">All Connections</h2>
          <div className="list-compact">
            {connections.map(conn => {
              const def = WEARABLE_DEFS.find(w => w.id === conn.provider);
              const memberName = familyMembers.find(m => m.id === conn.member_id);
              return (
                <div key={conn.id} className="list-compact-item">
                  <span className={`severity-dot severity-${conn.status === 'connected' ? 'normal' : conn.status === 'error' ? 'critical' : 'nodata'}`} />
                  <span className="list-compact-title">{def?.name ?? conn.provider}</span>
                  <span className="badge badge-muted">{memberName?.first_name ?? 'Unknown'}</span>
                  <span className="badge badge-muted">{conn.status}</span>
                  <span className="list-compact-date">{conn.last_sync_at ? timeAgo(conn.last_sync_at) : 'Never synced'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
