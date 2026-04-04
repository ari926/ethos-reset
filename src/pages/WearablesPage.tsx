import { useState, useEffect } from 'react';
import { Watch, Link, Unlink, RefreshCw, Clock, Activity, Heart, Moon, Key, TrendingUp, Zap, Footprints, Brain } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useHealthStore } from '../stores/healthStore';
import { useOuraStore } from '../stores/ouraStore';
import toast from 'react-hot-toast';
import { timeAgo, formatDate } from '../lib/utils';

// Oura proxy worker URL — update after deploying
const OURA_PROXY_URL = 'https://oura-proxy.ari-863.workers.dev';

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

// ─── Score color helpers ───

function scoreColor(score: number | null): string {
  if (score == null) return 'var(--color-tx-muted)';
  if (score >= 85) return 'var(--color-success)';
  if (score >= 70) return 'var(--color-warning)';
  return 'var(--color-error)';
}

function scoreLabel(score: number | null): string {
  if (score == null) return '--';
  if (score >= 85) return 'Optimal';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Low';
}

function stressEmoji(summary: string | null): string {
  if (!summary) return '--';
  const map: Record<string, string> = {
    restored: 'Restored',
    normal: 'Normal',
    stressful: 'Stressful',
  };
  return map[summary] ?? summary;
}

function formatHours(hours: number | null): string {
  if (hours == null) return '--';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

export default function WearablesPage() {
  const { user } = useAuthStore();
  const { familyMembers, activeMemberId, loadMemberData } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [connections, setConnections] = useState<WearableConnection[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Oura store
  const oura = useOuraStore();
  const [patInput, setPatInput] = useState('');
  const [showPatInput, setShowPatInput] = useState(false);

  const loadConnections = async () => {
    const { data } = await supabase
      .from('wearable_connections')
      .select('*')
      .order('created_at', { ascending: false });
    setConnections(data ?? []);
  };

  useEffect(() => { loadConnections(); }, []);

  // Load Oura token from DB when member changes
  useEffect(() => {
    if (activeMemberId) {
      oura.loadTokenFromDb(activeMemberId);
    }
  }, [activeMemberId]);

  // Auto-fetch Oura data when token becomes available
  useEffect(() => {
    if (oura.connected && oura.token && activeMemberId) {
      oura.fetchOuraData(activeMemberId);
    }
  }, [oura.connected, oura.token, activeMemberId]);

  // Handle OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');
    if (connected === 'oura') {
      toast.success('Oura Ring connected successfully!');
      loadConnections();
      // Clean URL
      window.history.replaceState({}, '', '/wearables');
    } else if (error) {
      toast.error(`Connection failed: ${error.replace(/_/g, ' ')}`);
      window.history.replaceState({}, '', '/wearables');
    }
  }, []);

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
    if (provider === 'oura') {
      // Real OAuth flow — redirect to Oura via our proxy worker
      const proxyBase = OURA_PROXY_URL;
      const authUrl = `${proxyBase}/auth/start?member_id=${activeMemberId}&owner_id=${user.id}`;
      window.location.href = authUrl;
      return;
    }

    if (def?.integration === 'direct') {
      // WHOOP — OAuth coming soon
      toast.success(`${def.name} — OAuth integration coming soon`);

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
    oura.clearToken();
    loadConnections();
  };

  const handleSync = async (connectionId: string, provider: string) => {
    setSyncing(provider);
    try {
      if (provider === 'oura') {
        const res = await fetch(`${OURA_PROXY_URL}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: connectionId }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success(`Synced ${data.synced ?? 0} data points from Oura`);
        } else {
          toast.error(data.error ?? 'Sync failed');
          if (res.status === 401) {
            toast.error('Token expired — please reconnect your Oura Ring');
          }
        }
      } else {
        // Placeholder for other providers
        await new Promise(r => setTimeout(r, 1500));
        await supabase.from('wearable_connections').update({ last_sync_at: new Date().toISOString() }).eq('id', connectionId);
        toast.success('Sync complete');
      }
    } catch (err) {
      toast.error('Sync failed — check your connection');
      console.error('Sync error:', err);
    }
    setSyncing(null);
    loadConnections();
  };

  const handlePatConnect = () => {
    if (!patInput.trim()) {
      toast.error('Enter a valid Personal Access Token');
      return;
    }
    oura.setToken(patInput.trim());
    setShowPatInput(false);
    setPatInput('');
    toast.success('Token set — fetching Oura data...');
    if (activeMemberId) {
      oura.fetchOuraData(activeMemberId);
    }
  };

  const handleOuraSyncToVitals = async () => {
    if (!activeMemberId) return;
    await oura.syncToVitals(activeMemberId);
    // Reload member data so dashboard reflects new vitals
    loadMemberData(activeMemberId);
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
                  {def.id === 'oura' && oura.connected && !isConnected && (
                    <span className="badge badge-warning">PAT</span>
                  )}
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
                ) : def.id === 'oura' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <button className="btn btn-sm btn-primary" onClick={() => handleConnect(def.id)} disabled={!activeMemberId}>
                      <Link size={14} /> OAuth
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => setShowPatInput(!showPatInput)}
                      disabled={!activeMemberId}
                    >
                      <Key size={14} /> Token
                    </button>
                  </div>
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

      {/* ── PAT Input ── */}
      {showPatInput && (
        <div className="oura-pat-section">
          <div className="oura-pat-card">
            <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
              <Key size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.4rem' }} />
              Oura Personal Access Token
            </h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', margin: '0.25rem 0 0.75rem' }}>
              Temporary method until OAuth is set up. Get your token from cloud.ouraring.com &rarr; Personal Access Tokens.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="password"
                className="input-field"
                placeholder="Paste your Oura PAT here..."
                value={patInput}
                onChange={e => setPatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePatConnect()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary btn-sm" onClick={handlePatConnect} disabled={!patInput.trim()}>
                Connect
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowPatInput(false); setPatInput(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Oura Data Panel ── */}
      {(oura.connected || oura.snapshot) && (
        <div className="oura-data-section">
          <div className="oura-data-header">
            <h2 className="section-title" style={{ margin: 0 }}>
              <Heart size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.4rem', color: '#1a1a2e' }} />
              Oura Ring Data
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {oura.lastSyncAt && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>
                  {timeAgo(oura.lastSyncAt)}
                </span>
              )}
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => activeMemberId && oura.fetchOuraData(activeMemberId)}
                disabled={oura.loading}
              >
                <RefreshCw size={14} className={oura.loading ? 'spinning' : ''} />
                {oura.loading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleOuraSyncToVitals}
                disabled={oura.syncing || !oura.snapshot}
              >
                <TrendingUp size={14} />
                {oura.syncing ? 'Syncing...' : 'Sync to Vitals'}
              </button>
              {oura.connected && (
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ color: 'var(--color-error)' }}
                  onClick={() => oura.clearToken()}
                  title="Disconnect PAT"
                >
                  <Unlink size={14} />
                </button>
              )}
            </div>
          </div>

          {oura.loading && !oura.snapshot && (
            <div className="oura-loading">
              <RefreshCw size={24} className="spinning" style={{ color: 'var(--color-tx-muted)' }} />
              <p>Fetching data from Oura...</p>
            </div>
          )}

          {/* ── Latest Snapshot KPIs ── */}
          {oura.snapshot && (
            <>
              <div className="oura-snapshot-grid">
                <div className="oura-kpi">
                  <div className="oura-kpi-icon" style={{ color: scoreColor(oura.snapshot.sleepScore) }}>
                    <Moon size={18} />
                  </div>
                  <div className="oura-kpi-label">Sleep</div>
                  <div className="oura-kpi-value" style={{ color: scoreColor(oura.snapshot.sleepScore) }}>
                    {oura.snapshot.sleepScore ?? '--'}
                  </div>
                  <div className="oura-kpi-sub">{scoreLabel(oura.snapshot.sleepScore)}</div>
                </div>

                <div className="oura-kpi">
                  <div className="oura-kpi-icon" style={{ color: scoreColor(oura.snapshot.readinessScore) }}>
                    <Zap size={18} />
                  </div>
                  <div className="oura-kpi-label">Readiness</div>
                  <div className="oura-kpi-value" style={{ color: scoreColor(oura.snapshot.readinessScore) }}>
                    {oura.snapshot.readinessScore ?? '--'}
                  </div>
                  <div className="oura-kpi-sub">{scoreLabel(oura.snapshot.readinessScore)}</div>
                </div>

                <div className="oura-kpi">
                  <div className="oura-kpi-icon" style={{ color: scoreColor(oura.snapshot.activityScore) }}>
                    <Activity size={18} />
                  </div>
                  <div className="oura-kpi-label">Activity</div>
                  <div className="oura-kpi-value" style={{ color: scoreColor(oura.snapshot.activityScore) }}>
                    {oura.snapshot.activityScore ?? '--'}
                  </div>
                  <div className="oura-kpi-sub">{scoreLabel(oura.snapshot.activityScore)}</div>
                </div>

                <div className="oura-kpi">
                  <div className="oura-kpi-icon" style={{ color: 'var(--color-primary)' }}>
                    <Heart size={18} />
                  </div>
                  <div className="oura-kpi-label">HRV</div>
                  <div className="oura-kpi-value">
                    {oura.snapshot.hrv ?? '--'}
                    <span className="oura-kpi-unit">ms</span>
                  </div>
                  <div className="oura-kpi-sub">Avg during sleep</div>
                </div>

                <div className="oura-kpi">
                  <div className="oura-kpi-icon" style={{ color: 'var(--color-error)' }}>
                    <Heart size={18} />
                  </div>
                  <div className="oura-kpi-label">Resting HR</div>
                  <div className="oura-kpi-value">
                    {oura.snapshot.restingHeartRate != null ? Math.round(oura.snapshot.restingHeartRate) : '--'}
                    <span className="oura-kpi-unit">bpm</span>
                  </div>
                  <div className="oura-kpi-sub">Sleep average</div>
                </div>

                <div className="oura-kpi">
                  <div className="oura-kpi-icon" style={{ color: 'var(--color-primary)' }}>
                    <Clock size={18} />
                  </div>
                  <div className="oura-kpi-label">Total Sleep</div>
                  <div className="oura-kpi-value">
                    {formatHours(oura.snapshot.totalSleepHours)}
                  </div>
                  <div className="oura-kpi-sub">Last night</div>
                </div>

                <div className="oura-kpi">
                  <div className="oura-kpi-icon" style={{ color: 'var(--color-success)' }}>
                    <Footprints size={18} />
                  </div>
                  <div className="oura-kpi-label">Steps</div>
                  <div className="oura-kpi-value">
                    {oura.snapshot.steps != null ? oura.snapshot.steps.toLocaleString() : '--'}
                  </div>
                  <div className="oura-kpi-sub">Today</div>
                </div>

                <div className="oura-kpi">
                  <div className="oura-kpi-icon" style={{ color: 'var(--color-warning)' }}>
                    <Brain size={18} />
                  </div>
                  <div className="oura-kpi-label">Stress</div>
                  <div className="oura-kpi-value" style={{ fontSize: 'var(--text-md)' }}>
                    {stressEmoji(oura.snapshot.stressSummary)}
                  </div>
                  <div className="oura-kpi-sub">
                    {oura.snapshot.tempDeviation != null
                      ? `Temp: ${oura.snapshot.tempDeviation > 0 ? '+' : ''}${oura.snapshot.tempDeviation.toFixed(1)}°C`
                      : 'Day summary'}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)', marginTop: '0.5rem' }}>
                Data for {formatDate(oura.snapshot.day)}
              </p>
            </>
          )}

          {/* ── 7-Day History ── */}
          {oura.sleepHistory.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '0.75rem' }}>
                <TrendingUp size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.4rem' }} />
                7-Day History
              </h3>
              <div className="oura-history-table-wrap">
                <table className="oura-history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sleep</th>
                      <th>Readiness</th>
                      <th>Activity</th>
                      <th>HRV</th>
                      <th>RHR</th>
                      <th>Steps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Build a day-indexed map
                      const days = new Set<string>();
                      oura.sleepHistory.forEach(s => days.add(s.day));
                      oura.readinessHistory.forEach(r => days.add(r.day));
                      oura.activityHistory.forEach(a => days.add(a.day));

                      const sortedDays = Array.from(days).sort().reverse();
                      const sleepMap = new Map(oura.sleepHistory.map(s => [s.day, s]));
                      const readinessMap = new Map(oura.readinessHistory.map(r => [r.day, r]));
                      const activityMap = new Map(oura.activityHistory.map(a => [a.day, a]));
                      const sleepPeriodMap = new Map<string, typeof oura.sleepPeriods[0]>();
                      for (const sp of oura.sleepPeriods) {
                        if (sp.type === 'long_sleep' && !sleepPeriodMap.has(sp.day)) {
                          sleepPeriodMap.set(sp.day, sp);
                        }
                      }

                      return sortedDays.map(day => {
                        const sleep = sleepMap.get(day);
                        const readiness = readinessMap.get(day);
                        const activity = activityMap.get(day);
                        const sp = sleepPeriodMap.get(day);

                        return (
                          <tr key={day}>
                            <td className="oura-history-date">{formatDate(day)}</td>
                            <td>
                              <span className="oura-score-pill" style={{ background: scoreColor(sleep?.score ?? null), color: '#fff' }}>
                                {sleep?.score ?? '--'}
                              </span>
                            </td>
                            <td>
                              <span className="oura-score-pill" style={{ background: scoreColor(readiness?.score ?? null), color: '#fff' }}>
                                {readiness?.score ?? '--'}
                              </span>
                            </td>
                            <td>
                              <span className="oura-score-pill" style={{ background: scoreColor(activity?.score ?? null), color: '#fff' }}>
                                {activity?.score ?? '--'}
                              </span>
                            </td>
                            <td>{sp?.average_hrv ?? '--'}<span className="oura-unit">ms</span></td>
                            <td>{sp?.average_heart_rate != null ? Math.round(sp.average_heart_rate) : '--'}<span className="oura-unit">bpm</span></td>
                            <td>{activity?.steps != null ? activity.steps.toLocaleString() : '--'}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

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
