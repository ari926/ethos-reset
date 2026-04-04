import { useState, useMemo } from 'react';
import { useHealthStore } from '../stores/healthStore';
import { Heart, FileText, ShieldAlert, Activity, Clock, Plus, TrendingUp, AlertTriangle, CheckCircle, ArrowUpRight } from 'lucide-react';
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

/* ── Clinical concern definitions ── */
interface HealthConcern {
  title: string;
  severity: 'high' | 'moderate' | 'low';
  detail: string;
  region: string;
  metrics: string[];
}

function computeHealthConcerns(metrics: Array<{ metric_name: string; metric_value: number | string; metric_unit: string | null; status: string | null; body_region: string | null; recorded_date: string; ref_range_low: number | null; ref_range_high: number | null }>): HealthConcern[] {
  const concerns: HealthConcern[] = [];

  // Get latest metrics by name
  const latestByName = new Map<string, typeof metrics[0]>();
  for (const m of metrics) {
    const existing = latestByName.get(m.metric_name);
    if (!existing || m.recorded_date > existing.recorded_date) {
      latestByName.set(m.metric_name, m);
    }
  }

  // Get all metrics with trend data
  const metricHistory = new Map<string, typeof metrics>();
  for (const m of metrics) {
    const arr = metricHistory.get(m.metric_name) ?? [];
    arr.push(m);
    metricHistory.set(m.metric_name, arr);
  }

  // Check for cardiovascular concerns
  const ldl = latestByName.get('LDL Cholesterol');
  const apoB = latestByName.get('Apolipoprotein B');
  const nonHdl = latestByName.get('Non-HDL Cholesterol');

  if (ldl && (ldl.status === 'high' || Number(ldl.metric_value) > 99)) {
    const ldlHistory = metricHistory.get('LDL Cholesterol') ?? [];
    const trending = ldlHistory.length > 1 ? (Number(ldlHistory[0].metric_value) > Number(ldlHistory[1].metric_value) ? 'rising' : 'improving') : 'stable';
    concerns.push({
      title: 'Elevated LDL Cholesterol',
      severity: Number(ldl.metric_value) > 130 ? 'high' : 'moderate',
      detail: `LDL at ${ldl.metric_value} ${ldl.metric_unit} (goal <100). ${trending === 'rising' ? 'Trending upward — was lower in previous labs.' : trending === 'improving' ? 'Trending down from previous labs.' : ''} ${apoB ? `ApoB also elevated at ${apoB.metric_value} mg/dL.` : ''} ${nonHdl ? `Non-HDL cholesterol ${nonHdl.metric_value} mg/dL.` : ''} Consider discussing statin therapy or lifestyle changes with your doctor.`,
      region: 'heart',
      metrics: ['LDL Cholesterol', 'Total Cholesterol', 'Apolipoprotein B'].filter(n => latestByName.has(n)),
    });
  }

  // Strep antibodies — persistent infection marker
  const aso = latestByName.get('Antistreptolysin O Ab');
  const antiDnase = latestByName.get('Anti-DNase B Strep Ab');
  if (aso && Number(aso.metric_value) > 200) {
    const asoHistory = metricHistory.get('Antistreptolysin O Ab') ?? [];
    const persistentHigh = asoHistory.length > 1 && asoHistory.every(h => Number(h.metric_value) > 200);
    concerns.push({
      title: 'Elevated Strep Antibodies',
      severity: 'high',
      detail: `ASO at ${aso.metric_value} IU/mL (ref <200)${antiDnase ? `, Anti-DNase B at ${antiDnase.metric_value} U/mL (ref <120)` : ''}. ${persistentHigh ? 'Persistently elevated across multiple labs — indicates ongoing or recent strep exposure.' : ''} This may be linked to autoimmune or inflammatory processes. Discuss with your provider.`,
      region: 'blood',
      metrics: ['Antistreptolysin O Ab', 'Anti-DNase B Strep Ab'].filter(n => latestByName.has(n)),
    });
  }

  // SHBG elevated
  const shbg = latestByName.get('SHBG');
  if (shbg && Number(shbg.metric_value) > 55.9) {
    concerns.push({
      title: 'Elevated SHBG',
      severity: 'moderate',
      detail: `SHBG at ${shbg.metric_value} nmol/L (ref 16.5-55.9). High SHBG can reduce free testosterone availability even when total testosterone is normal or high. May be related to thyroid function or liver metabolism.`,
      region: 'blood',
      metrics: ['SHBG', 'Testosterone Total', 'Free Testosterone'].filter(n => latestByName.has(n)),
    });
  }

  // GI concerns
  const hPylori = latestByName.get('H. pylori');
  const candida = latestByName.get('Candida spp.');
  const citrobacter = latestByName.get('Citrobacter freundii');
  const strep = latestByName.get('Streptococcus spp.');

  if (hPylori && Number(hPylori.metric_value) > 1000) {
    const flagged = [hPylori, candida, citrobacter, strep].filter(m => m && (m.status === 'high'));
    concerns.push({
      title: 'GI Dysbiosis & H. pylori',
      severity: 'high',
      detail: `H. pylori elevated at ${hPylori.metric_value} org/g (ref <1000). ${flagged.length > 1 ? `${flagged.length} gut organisms flagged high including ${candida ? 'Candida, ' : ''}${citrobacter ? 'Citrobacter, ' : ''}${strep ? 'Streptococcus' : ''}.` : ''} GI dysbiosis can affect nutrient absorption, immune function, and inflammation. Follow up with GI specialist.`,
      region: 'abdomen',
      metrics: ['H. pylori', 'Candida spp.', 'Citrobacter freundii', 'Streptococcus spp.', 'Bacteroidetes'].filter(n => latestByName.has(n)),
    });
  }

  // Immune markers
  const cd8 = latestByName.get('Absolute CD8 Suppressor');
  const cd3 = latestByName.get('Absolute CD3');
  if (cd8 && cd8.status === 'high') {
    concerns.push({
      title: 'Elevated CD8 T-Cells',
      severity: 'moderate',
      detail: `CD8 Suppressor cells at ${cd8.metric_value}/uL (ref 109-897)${cd3 ? `, CD3 also high at ${cd3.metric_value}/uL` : ''}. Elevated CD8 can indicate chronic viral infection, autoimmune activity, or immune system activation. Monitor alongside symptoms.`,
      region: 'blood',
      metrics: ['Absolute CD8 Suppressor', 'Absolute CD3', 'CD4/CD8 Ratio'].filter(n => latestByName.has(n)),
    });
  }

  // Good news items
  const glucose = latestByName.get('Glucose');
  const hba1c = latestByName.get('HbA1c');
  const egfr = latestByName.get('eGFR');
  const ast = latestByName.get('AST');
  const alt = latestByName.get('ALT');

  if (glucose?.status === 'normal' && hba1c?.status === 'normal') {
    concerns.push({
      title: 'Blood Sugar Well Controlled',
      severity: 'low',
      detail: `Glucose ${glucose.metric_value} mg/dL and HbA1c ${hba1c.metric_value}% — both in optimal range. No diabetes risk indicated.`,
      region: 'blood',
      metrics: ['Glucose', 'HbA1c'],
    });
  }

  if (egfr?.status === 'normal' && latestByName.get('Creatinine')?.status === 'normal') {
    concerns.push({
      title: 'Kidney Function Normal',
      severity: 'low',
      detail: `eGFR ${egfr.metric_value} mL/min, Creatinine ${latestByName.get('Creatinine')?.metric_value} mg/dL — kidney function is healthy.`,
      region: 'kidneys',
      metrics: ['eGFR', 'Creatinine', 'BUN'],
    });
  }

  if (ast?.status === 'normal' && alt?.status === 'normal') {
    concerns.push({
      title: 'Liver Enzymes Normal',
      severity: 'low',
      detail: `AST ${ast.metric_value} IU/L, ALT ${alt.metric_value} IU/L — liver function is healthy.`,
      region: 'liver',
      metrics: ['AST', 'ALT', 'Alkaline Phosphatase'],
    });
  }

  // Sort: high first, then moderate, then low
  const order = { high: 0, moderate: 1, low: 2 };
  concerns.sort((a, b) => order[a.severity] - order[b.severity]);

  return concerns;
}

export default function DashboardPage() {
  const { familyMembers, activeMemberId, reports, metrics, vitals, addVital } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [vitalModalOpen, setVitalModalOpen] = useState(false);

  const concerns = useMemo(() => computeHealthConcerns(metrics), [metrics]);

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
  const totalMetrics = metrics.length;
  const criticalMetrics = metrics.filter(m => m.status === 'critical' || m.status === 'high' || m.status === 'low').length;
  const highConcerns = concerns.filter(c => c.severity === 'high').length;
  const moderateConcerns = concerns.filter(c => c.severity === 'moderate').length;
  const normalConcerns = concerns.filter(c => c.severity === 'low').length;

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
        <div className="kpi-card">
          <div className="kpi-icon" style={{ color: highConcerns > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
            <ShieldAlert size={20} />
          </div>
          <div className="kpi-label">Active Concerns</div>
          <div className="kpi-value">{highConcerns + moderateConcerns}</div>
        </div>
      </div>

      {/* ── Executive Health Summary ── */}
      {concerns.length > 0 && (
        <div className="section" style={{ marginTop: '1.5rem' }}>
          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />
            Executive Health Summary
          </h2>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
            Based on {totalMetrics} biomarkers across {totalReports} reports · {highConcerns} high priority · {moderateConcerns} moderate · {normalConcerns} normal
          </p>
          <div className="health-concerns-list">
            {concerns.map((c, i) => (
              <div key={i} className={`concern-card concern-${c.severity}`}>
                <div className="concern-header">
                  <div className="concern-icon">
                    {c.severity === 'high' ? <AlertTriangle size={16} /> : c.severity === 'moderate' ? <ArrowUpRight size={16} /> : <CheckCircle size={16} />}
                  </div>
                  <div className="concern-title">{c.title}</div>
                  <span className={`badge badge-${c.severity === 'high' ? 'error' : c.severity === 'moderate' ? 'warning' : 'success'}`}>
                    {c.severity}
                  </span>
                </div>
                <p className="concern-detail">{c.detail}</p>
                <div className="concern-metrics">
                  {c.metrics.map(m => (
                    <span key={m} className="badge badge-muted">{m}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
