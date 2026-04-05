import { useState, useMemo } from 'react';
import { useHealthStore } from '../stores/healthStore';
import type { HealthMetric } from '../stores/healthStore';
import { Heart, FileText, ShieldAlert, Activity, Clock, Plus, TrendingUp, AlertTriangle, CheckCircle, ArrowUpRight, BarChart3, Zap, Shield, Brain, FlaskConical, Flame, Bug } from 'lucide-react';
import { formatDate, calculateAge } from '../lib/utils';
import Modal from '../components/common/Modal';
import TrendChart from '../components/Dashboard/TrendChart';
import AlertsBanner from '../components/Dashboard/AlertsBanner';

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
      <AlertsBanner />

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

      {/* ── Health Score by System ── */}
      <HealthScoreSection metrics={metrics} />

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

      {/* ── Metric Trends ── */}
      <MetricTrendsSection metrics={metrics} />

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

/* ── Health Score Section ── */

const HEALTH_CATEGORIES = [
  { key: 'cardiovascular', label: 'Cardiovascular', icon: Heart, keywords: ['ldl', 'apob', 'apolipoprotein', 'non-hdl', 'triglyceride', 'cholesterol', 'hdl'] },
  { key: 'immune', label: 'Immune', icon: Shield, keywords: ['cd3', 'cd4', 'cd8', 'wbc', 'white blood', 'lymphocyte', 'neutrophil', 'igg', 'igm', 'iga'] },
  { key: 'neurological', label: 'Neurological', icon: Brain, keywords: ['mri', 'neurofilament', 'b12', 'folate'] },
  { key: 'gut', label: 'Gut', icon: FlaskConical, keywords: ['zonulin', 'h. pylori', 'candida', 'calprotectin', 'casein', "cow's milk"] },
  { key: 'metabolic', label: 'Metabolic', icon: Flame, keywords: ['glucose', 'hba1c', 'insulin', 'testosterone', 'shbg', 'thyroid', 'tsh'] },
  { key: 'infectious', label: 'Infectious', icon: Bug, keywords: ['lyme', 'babesia', 'bartonella', 'ehrlichia', 'anaplasma', 'strep', 'aso', 'anti-dnase'] },
] as const;

interface CategoryMetricDetail {
  name: string;
  value: string;
  unit: string | null;
  status: string | null;
  score: number;
  date: string;
}

interface CategoryScore {
  key: string;
  label: string;
  icon: typeof Heart;
  score: number;
  grade: string;
  gradeColor: string;
  metricCount: number;
  details: CategoryMetricDetail[];
}

function computeHealthScores(metrics: HealthMetric[]): CategoryScore[] {
  // Get latest metrics by name
  const latestByName = new Map<string, HealthMetric>();
  for (const m of metrics) {
    const existing = latestByName.get(m.metric_name);
    if (!existing || m.recorded_date > existing.recorded_date) {
      latestByName.set(m.metric_name, m);
    }
  }

  return HEALTH_CATEGORIES.map(cat => {
    // Find metrics matching this category
    const matched: HealthMetric[] = [];
    for (const [, m] of latestByName) {
      const nameLower = m.metric_name.toLowerCase();
      if (cat.keywords.some(kw => nameLower.includes(kw))) {
        matched.push(m);
      }
    }

    // Score each metric
    let totalScore = 0;
    const details: CategoryMetricDetail[] = [];
    for (const m of matched) {
      let metricScore = 70;
      if (m.status === 'normal') metricScore = 100;
      else if (m.status === 'low') metricScore = 40;
      else if (m.status === 'high') metricScore = 40;
      else if (m.status === 'critical') metricScore = 10;
      totalScore += metricScore;
      details.push({
        name: m.metric_name,
        value: String(m.metric_value),
        unit: m.metric_unit,
        status: m.status,
        score: metricScore,
        date: m.recorded_date,
      });
    }
    // Sort: worst scores first
    details.sort((a, b) => a.score - b.score);

    const score = matched.length > 0 ? Math.round(totalScore / matched.length) : 0;

    let grade: string;
    let gradeColor: string;
    if (score >= 90) { grade = 'A'; gradeColor = 'var(--color-success)'; }
    else if (score >= 75) { grade = 'B'; gradeColor = 'var(--color-primary)'; }
    else if (score >= 60) { grade = 'C'; gradeColor = 'var(--color-warning)'; }
    else if (score >= 40) { grade = 'D'; gradeColor = 'var(--color-error)'; }
    else { grade = 'F'; gradeColor = 'var(--color-error)'; }

    if (matched.length === 0) {
      grade = '--';
      gradeColor = 'var(--color-tx-muted)';
    }

    return {
      key: cat.key,
      label: cat.label,
      icon: cat.icon,
      score,
      grade,
      gradeColor,
      metricCount: matched.length,
      details,
    };
  });
}

function HealthScoreSection({ metrics }: { metrics: HealthMetric[] }) {
  const scores = useMemo(() => computeHealthScores(metrics), [metrics]);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  if (metrics.length === 0) return null;

  return (
    <div className="section" style={{ marginTop: '1.5rem' }}>
      <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Zap size={16} style={{ color: 'var(--color-primary)' }} />
        Health Score by System
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '0.75rem',
      }}>
        {scores.map(s => {
          const Icon = s.icon;
          const isExpanded = expandedCat === s.key;
          return (
            <div key={s.key} style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${isExpanded ? s.gradeColor : 'var(--color-divider)'}`,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              cursor: s.metricCount > 0 ? 'pointer' : 'default',
              transition: 'border-color 0.15s',
              gridColumn: isExpanded ? '1 / -1' : undefined,
            }} onClick={() => s.metricCount > 0 && setExpandedCat(isExpanded ? null : s.key)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon size={16} style={{ color: 'var(--color-tx-muted)' }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', fontWeight: 500 }}>{s.label}</span>
                {s.metricCount > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>
                    {isExpanded ? '▼' : 'tap for details'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: s.gradeColor, lineHeight: 1 }}>{s.grade}</span>
                {s.metricCount > 0 && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)' }}>{s.score}%</span>
                )}
              </div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>
                {s.metricCount > 0 ? `${s.metricCount} metric${s.metricCount === 1 ? '' : 's'}` : 'No data'}
              </span>

              {/* Expanded detail view */}
              {isExpanded && s.details.length > 0 && (
                <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--color-divider)', paddingTop: '0.75rem' }}>
                  {s.details.map((d, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.4rem 0', borderBottom: i < s.details.length - 1 ? '1px solid var(--color-divider)' : 'none',
                      fontSize: 'var(--text-sm)',
                    }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500 }}>{d.name}</span>
                        <span style={{ color: 'var(--color-tx-faint)', fontSize: 'var(--text-xs)', marginLeft: '0.5rem' }}>{d.date}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{d.value} {d.unit ?? ''}</span>
                        <span style={{
                          display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                          background: d.status === 'critical' ? 'var(--color-error)' : d.status === 'high' || d.status === 'low' ? 'var(--color-warning)' : 'var(--color-success)',
                          color: '#fff',
                        }}>
                          {d.status ?? 'normal'}
                        </span>
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                    {s.details.filter(d => d.status === 'critical').length > 0
                      ? `⚠️ ${s.details.filter(d => d.status === 'critical').length} critical marker${s.details.filter(d => d.status === 'critical').length > 1 ? 's' : ''} need immediate attention. `
                      : ''}
                    {s.details.filter(d => d.status === 'high' || d.status === 'low').length > 0
                      ? `${s.details.filter(d => d.status === 'high' || d.status === 'low').length} marker${s.details.filter(d => d.status === 'high' || d.status === 'low').length > 1 ? 's' : ''} out of range. `
                      : ''}
                    {s.details.filter(d => d.status === 'normal').length > 0
                      ? `✓ ${s.details.filter(d => d.status === 'normal').length} marker${s.details.filter(d => d.status === 'normal').length > 1 ? 's' : ''} in healthy range.`
                      : ''}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricTrendsSection({ metrics }: { metrics: Array<{ metric_name: string; metric_value: number | string; metric_unit: string | null; recorded_date: string; ref_range_low: number | null; ref_range_high: number | null }> }) {
  // Build a map of metric name -> data points, only include metrics with 2+ points
  const metricOptions = useMemo(() => {
    const grouped = new Map<string, { dates: Set<string>; unit: string; refLow: number | null; refHigh: number | null }>();
    for (const m of metrics) {
      const existing = grouped.get(m.metric_name);
      if (!existing) {
        grouped.set(m.metric_name, { dates: new Set([m.recorded_date]), unit: m.metric_unit ?? '', refLow: m.ref_range_low, refHigh: m.ref_range_high });
      } else {
        existing.dates.add(m.recorded_date);
        if (m.ref_range_low != null) existing.refLow = m.ref_range_low;
        if (m.ref_range_high != null) existing.refHigh = m.ref_range_high;
      }
    }
    // Only metrics with multiple distinct data points
    const multi = Array.from(grouped.entries())
      .filter(([, v]) => v.dates.size >= 2)
      .map(([name]) => name)
      .sort();
    // Then all others
    const single = Array.from(grouped.keys()).filter(n => !multi.includes(n)).sort();
    return { multi, all: [...multi, ...single] };
  }, [metrics]);

  const defaultMetric = metricOptions.multi.includes('LDL Cholesterol')
    ? 'LDL Cholesterol'
    : metricOptions.multi[0] ?? metricOptions.all[0] ?? null;

  const [selected, setSelected] = useState<string | null>(defaultMetric);

  const chartData = useMemo(() => {
    if (!selected) return { points: [], unit: '', refLow: undefined as number | undefined, refHigh: undefined as number | undefined };
    const points = metrics
      .filter(m => m.metric_name === selected)
      .map(m => ({ date: m.recorded_date, value: Number(m.metric_value) }));
    const sample = metrics.find(m => m.metric_name === selected);
    return {
      points,
      unit: sample?.metric_unit ?? '',
      refLow: sample?.ref_range_low ?? undefined,
      refHigh: sample?.ref_range_high ?? undefined,
    };
  }, [selected, metrics]);

  if (metricOptions.all.length === 0) return null;

  return (
    <div className="section" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <h2 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BarChart3 size={16} style={{ color: 'var(--color-primary)' }} />
          Metric Trends
        </h2>
        <select
          className="select-field"
          style={{ maxWidth: 260, fontSize: 'var(--text-xs)' }}
          value={selected ?? ''}
          onChange={e => setSelected(e.target.value || null)}
        >
          {metricOptions.multi.length > 0 && (
            <optgroup label="Multiple readings">
              {metricOptions.multi.map(n => <option key={n} value={n}>{n}</option>)}
            </optgroup>
          )}
          {metricOptions.all.filter(n => !metricOptions.multi.includes(n)).length > 0 && (
            <optgroup label="Single reading">
              {metricOptions.all.filter(n => !metricOptions.multi.includes(n)).map(n => <option key={n} value={n}>{n}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      {selected && (
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          padding: '1rem',
          overflow: 'hidden',
        }}>
          <TrendChart
            data={chartData.points}
            metricName={selected}
            unit={chartData.unit}
            refRangeLow={chartData.refLow}
            refRangeHigh={chartData.refHigh}
          />
        </div>
      )}
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
