import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Heart, Stethoscope, FileText, Activity, AlertTriangle, Loader, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface MemberData {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
  blood_type: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  notes: string | null;
}

interface MetricData {
  id: string;
  metric_name: string;
  metric_value: string;
  metric_unit: string | null;
  status: string | null;
  body_region: string | null;
  recorded_date: string;
  ref_range_low: number | null;
  ref_range_high: number | null;
}

interface ReportData {
  id: string;
  title: string;
  report_type: string | null;
  report_date: string | null;
  summary: string | null;
}

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}

export default function DoctorSharePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState('');
  const [members, setMembers] = useState<MemberData[]>([]);
  const [metrics, setMetrics] = useState<Record<string, MetricData[]>>({});
  const [reports, setReports] = useState<Record<string, ReportData[]>>({});
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    loadShareData();
  }, [token]);

  const loadShareData = async () => {
    // Find the doctor by share token
    const { data: doc, error: docError } = await supabase
      .from('doctors')
      .select('id, full_name, name, email, status')
      .eq('share_token', token)
      .single();

    if (docError || !doc) {
      setError('This share link is invalid or has expired.');
      setLoading(false);
      return;
    }

    if (doc.status === 'revoked') {
      setError('Access has been revoked for this share link.');
      setLoading(false);
      return;
    }

    setDoctorName(doc.full_name || doc.name || doc.email);

    // Get which members this doctor has access to
    const { data: access } = await supabase
      .from('doctor_member_access')
      .select('member_id')
      .eq('doctor_id', doc.id);

    if (!access || access.length === 0) {
      setError('No patient access has been granted for this link.');
      setLoading(false);
      return;
    }

    const memberIds = access.map(a => a.member_id);

    // Fetch member profiles
    const { data: memberData } = await supabase
      .from('family_members')
      .select('id, first_name, last_name, date_of_birth, gender, blood_type, height_cm, weight_kg, notes')
      .in('id', memberIds);

    if (memberData) {
      setMembers(memberData);
      // Auto-expand first member
      if (memberData.length > 0) {
        setExpandedMembers(new Set([memberData[0].id]));
      }
    }

    // Fetch metrics for all accessible members
    const metricsMap: Record<string, MetricData[]> = {};
    const reportsMap: Record<string, ReportData[]> = {};

    for (const mid of memberIds) {
      const { data: mets } = await supabase
        .from('health_metrics')
        .select('id, metric_name, metric_value, metric_unit, status, body_region, recorded_date, ref_range_low, ref_range_high')
        .eq('member_id', mid)
        .order('recorded_date', { ascending: false })
        .limit(200);
      metricsMap[mid] = mets ?? [];

      const { data: reps } = await supabase
        .from('health_reports')
        .select('id, title, report_type, report_date, summary')
        .eq('member_id', mid)
        .order('report_date', { ascending: false });
      reportsMap[mid] = reps ?? [];
    }

    setMetrics(metricsMap);
    setReports(reportsMap);
    setLoading(false);
  };

  const toggleMember = (id: string) => {
    setExpandedMembers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem', color: 'var(--color-tx-muted)' }}>
        <Loader size={32} className="spin" style={{ color: 'var(--color-primary)' }} />
        <p>Loading patient data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <Heart size={56} fill="var(--color-primary)" color="var(--color-primary)" />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Ethos Reset</h1>
        <p style={{ color: 'var(--color-error)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-divider)' }}>
        <Heart size={32} fill="var(--color-primary)" color="var(--color-primary)" />
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Ethos Reset</h1>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-tx-muted)' }}>
            <Stethoscope size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.25rem' }} />
            Doctor Portal — {doctorName}
          </p>
        </div>
        <span className="badge badge-success" style={{ marginLeft: 'auto' }}>Read-Only</span>
      </div>

      {/* Patient Cards */}
      {members.map(member => {
        const isExpanded = expandedMembers.has(member.id);
        const memberMetrics = metrics[member.id] ?? [];
        const memberReports = reports[member.id] ?? [];
        const age = calculateAge(member.date_of_birth);
        const flaggedCount = memberMetrics.filter(m => m.status === 'high' || m.status === 'critical' || m.status === 'low').length;

        // Group metrics by body region
        const metricsByRegion: Record<string, MetricData[]> = {};
        for (const m of memberMetrics) {
          const region = m.body_region ?? 'other';
          if (!metricsByRegion[region]) metricsByRegion[region] = [];
          metricsByRegion[region].push(m);
        }

        return (
          <div key={member.id} style={{
            border: '1px solid var(--color-divider)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '1rem',
            overflow: 'hidden',
          }}>
            {/* Patient Header */}
            <button
              onClick={() => toggleMember(member.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '1rem 1.25rem', background: 'var(--color-surface)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                  {member.first_name} {member.last_name}
                </h2>
                <p style={{ margin: '0.15rem 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-tx-muted)' }}>
                  {age !== null ? `${age} yrs` : ''}
                  {member.gender ? ` · ${member.gender}` : ''}
                  {member.blood_type ? ` · ${member.blood_type}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="badge badge-muted">{memberMetrics.length} metrics</span>
                <span className="badge badge-muted">{memberReports.length} reports</span>
                {flaggedCount > 0 && (
                  <span className="badge badge-warning">{flaggedCount} flagged</span>
                )}
              </div>
            </button>

            {isExpanded && (
              <div style={{ padding: '0 1.25rem 1.25rem', background: 'var(--color-surface-offset, #fafbfc)' }}>

                {/* Flagged Metrics Summary */}
                {flaggedCount > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <button
                      onClick={() => toggleSection(`${member.id}-flagged`)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 0.75rem', background: 'var(--color-error-bg, rgba(239,68,68,0.08))',
                        border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-tx)', textAlign: 'left',
                      }}
                    >
                      {expandedSections.has(`${member.id}-flagged`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <AlertTriangle size={14} style={{ color: 'var(--color-error)' }} />
                      Flagged Metrics ({flaggedCount})
                    </button>
                    {expandedSections.has(`${member.id}-flagged`) && (
                      <div style={{ padding: '0.5rem 0' }}>
                        {memberMetrics.filter(m => m.status === 'high' || m.status === 'critical' || m.status === 'low').map(m => (
                          <div key={m.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-divider)',
                            fontSize: 'var(--text-sm)',
                          }}>
                            <div>
                              <span style={{ fontWeight: 500 }}>{m.metric_name}</span>
                              <span style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-xs)', marginLeft: '0.5rem' }}>
                                {m.recorded_date}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span>{m.metric_value} {m.metric_unit ?? ''}</span>
                              {m.ref_range_low != null && m.ref_range_high != null && (
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>
                                  [{m.ref_range_low}-{m.ref_range_high}]
                                </span>
                              )}
                              <span className={`badge badge-${m.status === 'critical' ? 'error' : 'warning'}`} style={{ fontSize: '10px' }}>
                                {m.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Reports */}
                {memberReports.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <button
                      onClick={() => toggleSection(`${member.id}-reports`)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 0.75rem', background: 'var(--color-surface)',
                        border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-tx)', textAlign: 'left',
                      }}
                    >
                      {expandedSections.has(`${member.id}-reports`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <FileText size={14} />
                      Reports ({memberReports.length})
                    </button>
                    {expandedSections.has(`${member.id}-reports`) && (
                      <div style={{ padding: '0.5rem 0' }}>
                        {memberReports.map(r => (
                          <div key={r.id} style={{
                            padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--color-divider)',
                            fontSize: 'var(--text-sm)',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 500 }}>{r.title}</span>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {r.report_type && <span className="badge badge-muted">{r.report_type}</span>}
                                {r.report_date && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>{r.report_date}</span>}
                              </div>
                            </div>
                            {r.summary && (
                              <p style={{ margin: '0.35rem 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', lineHeight: 1.5 }}>
                                {r.summary}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* All Metrics by Body Region */}
                {Object.entries(metricsByRegion).map(([region, mets]) => (
                  <div key={region} style={{ marginTop: '0.75rem' }}>
                    <button
                      onClick={() => toggleSection(`${member.id}-${region}`)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 0.75rem', background: 'var(--color-surface)',
                        border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-tx)', textAlign: 'left',
                      }}
                    >
                      {expandedSections.has(`${member.id}-${region}`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <Activity size={14} />
                      {region.charAt(0).toUpperCase() + region.slice(1)} ({mets.length})
                    </button>
                    {expandedSections.has(`${member.id}-${region}`) && (
                      <div style={{ padding: '0.5rem 0' }}>
                        {mets.map(m => (
                          <div key={m.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--color-divider)',
                            fontSize: 'var(--text-sm)',
                          }}>
                            <div>
                              <span style={{ fontWeight: 500 }}>{m.metric_name}</span>
                              <span style={{ color: 'var(--color-tx-faint)', fontSize: 'var(--text-xs)', marginLeft: '0.5rem' }}>{m.recorded_date}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span>{m.metric_value} {m.metric_unit ?? ''}</span>
                              {m.status && m.status !== 'normal' && (
                                <span className={`badge badge-${m.status === 'critical' ? 'error' : m.status === 'high' || m.status === 'low' ? 'warning' : 'success'}`} style={{ fontSize: '10px' }}>
                                  {m.status}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-tx-faint)', fontSize: 'var(--text-xs)' }}>
        <Heart size={14} fill="var(--color-primary)" color="var(--color-primary)" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.25rem' }} />
        Powered by Ethos Reset · Read-only access · Data shared by patient
      </div>
    </div>
  );
}
