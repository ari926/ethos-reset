import { useState } from 'react';
import { useHealthStore } from '../stores/healthStore';
import { Heart, FileText, ShieldAlert, Activity, Clock, Plus, TrendingUp } from 'lucide-react';
import { formatDate, calculateAge } from '../lib/utils';
import Modal from '../components/common/Modal';

const VITAL_TYPES = [
  { value: 'blood_pressure', label: 'Blood Pressure', unit: 'mmHg', hasSecondary: true, secondaryLabel: 'Diastolic' },
  { value: 'heart_rate', label: 'Heart Rate', unit: 'bpm', hasSecondary: false },
  { value: 'temperature', label: 'Temperature', unit: '\u00B0F', hasSecondary: false },
  { value: 'weight', label: 'Weight', unit: 'lbs', hasSecondary: false },
  { value: 'blood_glucose', label: 'Blood Glucose', unit: 'mg/dL', hasSecondary: false },
  { value: 'spo2', label: 'SpO2', unit: '%', hasSecondary: false },
  { value: 'respiratory_rate', label: 'Respiratory Rate', unit: 'breaths/min', hasSecondary: false },
  { value: 'hrv', label: 'HRV', unit: 'ms', hasSecondary: false },
  { value: 'sleep_score', label: 'Sleep Score', unit: '/100', hasSecondary: false },
  { value: 'steps', label: 'Steps', unit: 'steps', hasSecondary: false },
];

export default function DashboardPage() {
  const { familyMembers, activeMemberId, reports, restrictions, metrics, vitals, addVital } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [vitalModalOpen, setVitalModalOpen] = useState(false);

  if (!member) {
    return (
      <div className="empty-state">
        <Heart size={48} />
        <h2>Welcome to Family Health Tracker</h2>
        <p>Add a family member to get started. Go to the Family page to add your first member.</p>
      </div>
    );
  }

  const age = calculateAge(member.date_of_birth);
  const totalReports = reports.length;
  const activeRestrictions = restrictions.filter(r => r.confirmed).length;
  const totalMetrics = metrics.length;
  const criticalMetrics = metrics.filter(m => m.status === 'critical' || m.status === 'high' || m.status === 'low').length;

  // Group vitals by type for latest reading
  const latestVitals = new Map<string, typeof vitals[0]>();
  for (const v of vitals) {
    if (!latestVitals.has(v.vital_type)) {
      latestVitals.set(v.vital_type, v);
    }
  }

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Dashboard</h1>
          <p className="view-subtitle">
            {member.first_name} {member.last_name}
            {age !== null ? ` \u00B7 ${age} years old` : ''}
            {member.blood_type ? ` \u00B7 ${member.blood_type}` : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setVitalModalOpen(true)}>
          <Plus size={14} /> Record Vital
        </button>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ color: 'var(--color-primary)' }}><FileText size={20} /></div>
          <div className="kpi-label">Reports</div>
          <div className="kpi-value">{totalReports}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ color: 'var(--color-warning)' }}><ShieldAlert size={20} /></div>
          <div className="kpi-label">Restrictions</div>
          <div className="kpi-value">{activeRestrictions}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ color: 'var(--color-success)' }}><Activity size={20} /></div>
          <div className="kpi-label">Metrics Tracked</div>
          <div className="kpi-value">{totalMetrics}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ color: criticalMetrics > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
            <Heart size={20} />
          </div>
          <div className="kpi-label">Flagged Metrics</div>
          <div className="kpi-value">{criticalMetrics}</div>
        </div>
      </div>

      {latestVitals.size > 0 && (
        <div className="section">
          <h2 className="section-title"><TrendingUp size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.4rem' }} />Latest Vitals</h2>
          <div className="kpi-grid">
            {Array.from(latestVitals.entries()).map(([type, v]) => {
              const def = VITAL_TYPES.find(vt => vt.value === type);
              return (
                <div key={type} className="kpi-card">
                  <div className="kpi-icon" style={{ color: 'var(--color-primary)' }}><Clock size={16} /></div>
                  <div className="kpi-label">{def?.label ?? type.replace(/_/g, ' ')}</div>
                  <div className="kpi-value">
                    {v.value_primary}{v.value_secondary ? `/${v.value_secondary}` : ''}
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--color-tx-muted)', marginLeft: '0.25rem' }}>
                      {v.unit ?? def?.unit ?? ''}
                    </span>
                  </div>
                  <div className="kpi-sub">{formatDate(v.recorded_at)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <div className="section">
          <h2 className="section-title">Recent Reports</h2>
          <div className="list-compact">
            {reports.slice(0, 5).map(r => (
              <div key={r.id} className="list-compact-item">
                <FileText size={14} />
                <span className="list-compact-title">{r.title}</span>
                <span className={`badge badge-${r.processing_status === 'complete' ? 'success' : 'muted'}`}>
                  {r.processing_status}
                </span>
                <span className="list-compact-date">{formatDate(r.report_date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {restrictions.length > 0 && (
        <div className="section">
          <h2 className="section-title">Active Restrictions</h2>
          <div className="restriction-chips">
            {restrictions.filter(r => r.confirmed).slice(0, 10).map(r => (
              <span key={r.id} className={`badge badge-${r.severity === 'critical' ? 'error' : r.severity === 'warning' ? 'warning' : 'muted'}`}>
                {r.item_name}
              </span>
            ))}
          </div>
        </div>
      )}

      <VitalModal
        open={vitalModalOpen}
        onClose={() => setVitalModalOpen(false)}
        memberId={activeMemberId}
        onSave={addVital}
      />
    </div>
  );
}

function VitalModal({ open, onClose, memberId, onSave }: {
  open: boolean;
  onClose: () => void;
  memberId: string | null;
  onSave: (vital: Record<string, unknown>) => Promise<void>;
}) {
  const [vitalType, setVitalType] = useState('blood_pressure');
  const [saving, setSaving] = useState(false);
  const def = VITAL_TYPES.find(vt => vt.value === vitalType);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!memberId) return;
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    await onSave({
      member_id: memberId,
      vital_type: vitalType,
      value_primary: Number(fd.get('value_primary')),
      value_secondary: fd.get('value_secondary') ? Number(fd.get('value_secondary')) : null,
      unit: def?.unit ?? null,
      recorded_at: (fd.get('recorded_at') as string) || new Date().toISOString(),
      source: 'manual',
      notes: (fd.get('notes') as string) || null,
    });

    setSaving(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Record Vital">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Vital Type</label>
          <select className="select-field" value={vitalType} onChange={e => setVitalType(e.target.value)}>
            {VITAL_TYPES.map(vt => <option key={vt.value} value={vt.value}>{vt.label}</option>)}
          </select>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">{def?.hasSecondary ? 'Systolic' : 'Value'} ({def?.unit}) *</label>
            <input name="value_primary" type="number" step="any" className="input-field" required />
          </div>
          {def?.hasSecondary && (
            <div className="form-group">
              <label className="form-label">{def.secondaryLabel} ({def.unit})</label>
              <input name="value_secondary" type="number" step="any" className="input-field" />
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Date & Time</label>
          <input name="recorded_at" type="datetime-local" className="input-field" defaultValue={new Date().toISOString().slice(0, 16)} />
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <input name="notes" className="input-field" placeholder="Optional notes" />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Record'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
