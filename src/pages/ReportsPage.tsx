import { useState, useRef, useMemo } from 'react';
import { useHealthStore, type HealthReport } from '../stores/healthStore';
import { FileText, Upload, Trash2, Eye, X, Calendar, ChevronDown, ChevronRight, Beaker, ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatDate } from '../lib/utils';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import TrendChart from '../components/Dashboard/TrendChart';

const REPORT_TYPES = [
  { value: 'lab_results', label: 'Lab Results' },
  { value: 'blood_test', label: 'Blood Test' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'stool_test', label: 'Stool Test' },
  { value: 'specialty', label: 'Specialty' },
  { value: 'genetic', label: 'Genetic' },
  { value: 'doctor_notes', label: 'Doctor Notes' },
  { value: 'pathology', label: 'Pathology' },
  { value: 'general', label: 'General' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'discharge', label: 'Discharge' },
  { value: 'lab_panel', label: 'Lab Panel' },
  { value: 'other', label: 'Other' },
];

/* ── Auto-extract date, type, and clean title from filename ── */
function parseReportFilename(raw: string): { title: string; type: string; date: string | null } {
  let title = raw;
  let type = 'lab_results';
  let date: string | null = null;

  // Detect report type from keywords
  const lower = raw.toLowerCase();
  if (/\bmri\b|imaging|x[\s-]?ray|ct\b|cta\b|dexa|ultrasound|scan/i.test(lower)) type = 'imaging';
  else if (/\bstool\b|gi[\s-]?map|microbiome/i.test(lower)) type = 'stool_test';
  else if (/\bdr\.|doctor|appt|notes|tetlow|leist|wolk|phone notes|summary|supplement|intake/i.test(lower)) type = 'doctor_notes';
  else if (/\bgenetic|genome|3x4|dna\b/i.test(lower)) type = 'genetic';
  else if (/\blyme|mycotox|zoomer|glyphosate|antigen|p88|grail|metal test|hair analysis/i.test(lower)) type = 'specialty';
  else if (/\blab\b|labcorp|vibrant|blood/i.test(lower)) type = 'lab_results';

  // Try to extract date patterns

  // Pattern: "M-D-YY" or "M-DD-YY" (e.g., "2 24 23", "12 2 24", "11 18 24")
  const mdyy = raw.match(/(\d{1,2})[\s\-\/](\d{1,2})[\s\-\/](\d{2})\b/);
  if (mdyy) {
    const m = parseInt(mdyy[1]);
    const d = parseInt(mdyy[2]);
    let y = parseInt(mdyy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      y = y < 50 ? 2000 + y : 1900 + y;
      date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Pattern: month name + year (e.g., "May 2023", "June 2025", "Oct. 2025", "Nov 2024")
  if (!date) {
    const monthYear = raw.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\.?\s*(\d{4})/i);
    if (monthYear) {
      const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      };
      const monthKey = monthYear[1].toLowerCase().slice(0, 3);
      const mm = months[monthKey];
      if (mm) date = `${monthYear[2]}-${mm}-01`;
    }
  }

  // Pattern: standalone 4-digit year (e.g., "2016", "2019", "2022")
  if (!date) {
    const yearOnly = raw.match(/\b(20\d{2})\b/);
    if (yearOnly) {
      date = `${yearOnly[1]}-01-01`;
    }
  }

  // Clean up title: remove "copy", trailing numbers, extra spaces
  title = title
    .replace(/\bcopy\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { title, type, date };
}

function getReportYear(report: HealthReport): string {
  if (report.report_date) {
    return new Date(report.report_date).getFullYear().toString();
  }
  return 'Unknown';
}

/* ── Lab Explorer Categories ── */
const LAB_CATEGORIES: Array<{ key: string; label: string; icon: string; regions: string[]; description: string }> = [
  { key: 'blood', label: 'Blood Work', icon: '🩸', regions: ['blood'], description: 'CBC, hormones, vitamins, minerals, immune markers' },
  { key: 'heart', label: 'Cardiovascular', icon: '❤️', regions: ['heart'], description: 'Cholesterol, triglycerides, ApoB, lipid panel' },
  { key: 'liver', label: 'Liver Function', icon: '🫁', regions: ['liver'], description: 'AST, ALT, bilirubin, albumin, GGT' },
  { key: 'kidneys', label: 'Kidney Function', icon: '💧', regions: ['kidneys'], description: 'eGFR, creatinine, BUN, uric acid' },
  { key: 'gut', label: 'Gut & Stool', icon: '🧫', regions: ['abdomen', 'stomach'], description: 'GI-MAP, H. pylori, Candida, stool markers' },
  { key: 'neuro', label: 'Neurological', icon: '🧠', regions: ['head'], description: 'TSH, prolactin, neurofilament, NMO' },
];

function LabExplorer() {
  const { metrics } = useHealthStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  // Group metrics by category
  const categoryData = useMemo(() => {
    const data: Record<string, Array<{
      name: string;
      latestValue: string;
      unit: string | null;
      status: string | null;
      date: string;
      refLow: number | null;
      refHigh: number | null;
      history: Array<{ date: string; value: number; status: string | null }>;
      trend: 'up' | 'down' | 'stable' | null;
    }>> = {};

    for (const cat of LAB_CATEGORIES) {
      const catMetrics = metrics.filter(m => cat.regions.includes(m.body_region ?? ''));

      // Group by metric name
      const byName = new Map<string, typeof metrics>();
      for (const m of catMetrics) {
        const arr = byName.get(m.metric_name) ?? [];
        arr.push(m);
        byName.set(m.metric_name, arr);
      }

      data[cat.key] = Array.from(byName.entries()).map(([name, items]) => {
        // Sort by date descending
        const sorted = [...items].sort((a, b) => (b.recorded_date ?? '').localeCompare(a.recorded_date ?? ''));
        const latest = sorted[0];
        const prev = sorted[1];
        let trend: 'up' | 'down' | 'stable' | null = null;
        if (prev) {
          const latVal = Number(latest.metric_value);
          const prevVal = Number(prev.metric_value);
          if (!isNaN(latVal) && !isNaN(prevVal)) {
            const pctChange = ((latVal - prevVal) / Math.abs(prevVal || 1)) * 100;
            trend = pctChange > 3 ? 'up' : pctChange < -3 ? 'down' : 'stable';
          }
        }

        return {
          name,
          latestValue: String(latest.metric_value),
          unit: latest.metric_unit,
          status: latest.status,
          date: latest.recorded_date,
          refLow: latest.ref_range_low,
          refHigh: latest.ref_range_high,
          trend,
          history: sorted.map(m => ({
            date: m.recorded_date,
            value: Number(m.metric_value),
            status: m.status,
          })).reverse(), // chronological for chart
        };
      }).sort((a, b) => {
        // Flagged first, then alphabetical
        const statusOrder: Record<string, number> = { critical: 0, high: 1, low: 2, normal: 3 };
        return (statusOrder[a.status ?? 'normal'] ?? 3) - (statusOrder[b.status ?? 'normal'] ?? 3);
      });
    }
    return data;
  }, [metrics]);

  // Metric detail view with chart
  if (selectedMetric && selectedCategory) {
    const cat = categoryData[selectedCategory] ?? [];
    const metric = cat.find(m => m.name === selectedMetric);
    if (!metric) return null;

    const chartData = metric.history
      .filter(h => !isNaN(h.value))
      .map(h => ({ date: h.date, value: h.value }));

    return (
      <div className="lab-explorer">
        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedMetric(null)} style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} /> Back to {LAB_CATEGORIES.find(c => c.key === selectedCategory)?.label}
        </button>

        <div className="lab-metric-detail">
          <div className="lab-metric-detail-header">
            <h2 style={{ margin: 0 }}>{metric.name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
                {metric.latestValue} <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--color-tx-muted)' }}>{metric.unit}</span>
              </span>
              <span className={`badge badge-${metric.status === 'normal' ? 'success' : metric.status === 'critical' ? 'error' : 'warning'}`}>
                {metric.status}
              </span>
            </div>
          </div>

          {(metric.refLow != null || metric.refHigh != null) && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', margin: '0.25rem 0 1rem' }}>
              Reference range: {metric.refLow ?? '—'} – {metric.refHigh ?? '—'} {metric.unit}
            </p>
          )}

          {chartData.length >= 2 ? (
            <div style={{ marginTop: '0.5rem' }}>
              <TrendChart
                data={chartData}
                metricName={metric.name}
                unit={metric.unit ?? ''}
                refRangeLow={metric.refLow ?? undefined}
                refRangeHigh={metric.refHigh ?? undefined}
              />
            </div>
          ) : (
            <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)', padding: '2rem 0', textAlign: 'center' }}>
              Only 1 data point — need more readings for a trend chart.
            </p>
          )}

          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>History</h3>
          <div className="lab-history-table">
            <div className="lab-history-row lab-history-header">
              <span>Date</span>
              <span>Value</span>
              <span>Status</span>
            </div>
            {metric.history.slice().reverse().map((h, i) => (
              <div key={i} className="lab-history-row">
                <span>{formatDate(h.date)}</span>
                <span style={{ fontWeight: 600 }}>{h.value} {metric.unit}</span>
                <span className={`badge badge-${h.status === 'normal' ? 'success' : h.status === 'critical' ? 'error' : 'warning'}`}>
                  {h.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Category detail view — show all markers
  if (selectedCategory) {
    const cat = LAB_CATEGORIES.find(c => c.key === selectedCategory);
    const markers = categoryData[selectedCategory] ?? [];

    return (
      <div className="lab-explorer">
        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCategory(null)} style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} /> Back to categories
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.5rem' }}>{cat?.icon}</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>{cat?.label}</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)' }}>{markers.length} markers tracked</p>
          </div>
        </div>

        {markers.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 1rem' }}>
            <Beaker size={40} />
            <p>No lab data in this category yet. Upload reports to populate.</p>
          </div>
        ) : (
          <div className="lab-markers-list">
            {markers.map(m => (
              <button key={m.name} className="lab-marker-card" onClick={() => setSelectedMetric(m.name)}>
                <div className="lab-marker-info">
                  <span className="lab-marker-name">{m.name}</span>
                  <span className="lab-marker-date">{formatDate(m.date)}</span>
                </div>
                <div className="lab-marker-value-section">
                  <span className="lab-marker-value">
                    {m.latestValue} <span className="lab-marker-unit">{m.unit}</span>
                  </span>
                  {m.trend && (
                    <span className={`lab-marker-trend lab-marker-trend-${m.trend}`}>
                      {m.trend === 'up' ? <TrendingUp size={14} /> : m.trend === 'down' ? <TrendingDown size={14} /> : <Minus size={14} />}
                    </span>
                  )}
                  <span className={`badge badge-${m.status === 'normal' ? 'success' : m.status === 'critical' ? 'error' : 'warning'}`}>
                    {m.status}
                  </span>
                </div>
                <ChevronRight size={14} style={{ color: 'var(--color-tx-faint)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Category grid
  return (
    <div className="lab-explorer">
      <div className="lab-categories-grid">
        {LAB_CATEGORIES.map(cat => {
          const markers = categoryData[cat.key] ?? [];
          const flagged = markers.filter(m => m.status === 'high' || m.status === 'critical' || m.status === 'low').length;
          return (
            <button key={cat.key} className="lab-category-card" onClick={() => setSelectedCategory(cat.key)}>
              <div className="lab-category-icon">{cat.icon}</div>
              <div className="lab-category-info">
                <h3>{cat.label}</h3>
                <p>{cat.description}</p>
              </div>
              <div className="lab-category-stats">
                <span className="lab-category-count">{markers.length} markers</span>
                {flagged > 0 && <span className="badge badge-error">{flagged} flagged</span>}
              </div>
              <ChevronRight size={16} style={{ color: 'var(--color-tx-faint)' }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ReportsTab = 'documents' | 'labs';

export default function ReportsPage() {
  const { reports, activeMemberId, familyMembers, uploadReport, deleteReport } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailReport, setDetailReport] = useState<HealthReport | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ReportsTab>('documents');

  const filtered = filterType === 'all' ? reports : reports.filter(r => r.report_type === filterType);

  // Group by year, sorted descending
  const groupedByYear = useMemo(() => {
    const groups: Record<string, HealthReport[]> = {};
    for (const r of filtered) {
      const year = getReportYear(r);
      if (!groups[year]) groups[year] = [];
      groups[year].push(r);
    }
    // Sort years descending
    const sorted = Object.entries(groups).sort((a, b) => {
      if (a[0] === 'Unknown') return 1;
      if (b[0] === 'Unknown') return -1;
      return parseInt(b[0]) - parseInt(a[0]);
    });
    return sorted;
  }, [filtered]);

  const toggleYear = (year: string) => {
    setCollapsedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'imaging': return '🩻';
      case 'lab_results':
      case 'blood_test':
      case 'lab_panel': return '🩸';
      case 'stool_test': return '🧫';
      case 'genetic': return '🧬';
      case 'specialty': return '🔬';
      case 'doctor_notes': return '📋';
      default: return '📄';
    }
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Medical Reports</h1>
          <p className="view-subtitle">
            {member ? `${member.first_name}'s medical documents & reports` : 'Select a family member'}
          </p>
        </div>
        {activeTab === 'documents' && (
          <button className="btn btn-primary" onClick={() => setUploadOpen(true)} disabled={!activeMemberId}>
            <Upload size={14} /> Upload Reports
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div className="reports-tab-bar">
        <button
          className={`reports-tab${activeTab === 'documents' ? ' active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          <FileText size={15} />
          <span>Documents</span>
          <span className="reports-tab-count">{reports.length}</span>
        </button>
        <button
          className={`reports-tab reports-tab-labs${activeTab === 'labs' ? ' active' : ''}`}
          onClick={() => setActiveTab('labs')}
        >
          <Beaker size={15} />
          <span>Lab Explorer</span>
        </button>
      </div>

      {activeTab === 'labs' ? (
        <LabExplorer />
      ) : (
      <>
      {reports.length > 0 && (
        <div className="filter-bar">
          <select className="select-field" style={{ width: 'auto' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types ({reports.length})</option>
            {REPORT_TYPES.map(t => {
              const count = reports.filter(r => r.report_type === t.value).length;
              if (count === 0) return null;
              return <option key={t.value} value={t.value}>{t.label} ({count})</option>;
            })}
          </select>
          <span className="filter-count">{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <h2>{reports.length === 0 ? 'No reports yet' : 'No matching reports'}</h2>
          <p>Upload medical reports (PDF or images) and AI will extract the data automatically.</p>
        </div>
      ) : (
        <div className="report-year-groups">
          {groupedByYear.map(([year, yearReports]) => {
            const isCollapsed = collapsedYears.has(year);
            return (
              <div key={year} className="report-year-group">
                <button className="report-year-header" onClick={() => toggleYear(year)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <Calendar size={14} style={{ opacity: 0.5 }} />
                    <span className="report-year-label">{year}</span>
                  </div>
                  <span className="report-year-count">{yearReports.length} document{yearReports.length !== 1 ? 's' : ''}</span>
                </button>
                {!isCollapsed && (
                  <div className="report-list">
                    {yearReports.map(r => (
                      <div key={r.id} className="report-card" onClick={() => setDetailReport(r)} style={{ cursor: 'pointer' }}>
                        <div className="report-card-header">
                          <span style={{ fontSize: '1.25rem' }}>{getTypeIcon(r.report_type)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="report-card-title">{r.title}</div>
                            <div className="report-card-meta">
                              {r.report_type.replace(/_/g, ' ')} · {formatDate(r.report_date)}
                            </div>
                          </div>
                          {r.processing_status === 'complete' ? (
                            <span className="badge badge-success" title="AI analyzed — data extracted to Lab Explorer">✓ AI Analyzed</span>
                          ) : r.processing_status === 'failed' ? (
                            <span className="badge badge-error">Failed</span>
                          ) : r.processing_status === 'uploaded' ? (
                            <span className="badge badge-muted" title="Document uploaded but not yet analyzed by AI">Uploaded</span>
                          ) : (
                            <span className="badge badge-warning" title="Waiting for AI analysis">Pending</span>
                          )}
                        </div>
                        {r.ai_summary && (
                          <p className="report-card-summary">{r.ai_summary}</p>
                        )}
                        {r.body_regions && r.body_regions.length > 0 && (
                          <div className="report-card-regions">
                            {r.body_regions.map(region => (
                              <span key={region} className="badge badge-primary">{region}</span>
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
        </div>
      )}

      </>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        memberId={activeMemberId}
        onUpload={uploadReport}
      />

      {detailReport && (
        <ReportDetailModal
          report={detailReport}
          onClose={() => setDetailReport(null)}
          onDelete={(id) => { setDeleteId(id); setDetailReport(null); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteReport(deleteId); }}
        title="Delete Report"
        message="This will permanently delete this report and any extracted metrics. This cannot be undone."
      />
    </div>
  );
}

function UploadModal({ open, onClose, memberId, onUpload }: {
  open: boolean;
  onClose: () => void;
  memberId: string | null;
  onUpload: (memberId: string, file: File, title: string, reportType: string, reportDate: string | null) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [reportType, setReportType] = useState('lab_results');
  const [reportDate, setReportDate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    setFiles(prev => [...prev, ...Array.from(newFiles)]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!memberId || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const rawName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      const { title, type, date } = parseReportFilename(rawName);
      // Use user-selected values as override, otherwise use auto-detected
      const finalType = reportType !== 'lab_results' ? reportType : type;
      const finalDate = reportDate || date;
      await onUpload(memberId, file, title, finalType, finalDate);
      setUploadProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setUploading(false);
    setFiles([]);
    setReportDate('');
    setUploadProgress(0);
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload Reports">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Files *</label>
          <div
            className="scanner-capture-zone"
            style={{ padding: '1.5rem', minHeight: files.length > 0 ? 'auto' : '120px' }}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            {files.length > 0 ? (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }}>
                      <FileText size={14} style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ color: 'var(--color-tx-faint)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.15rem' }} onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)', textAlign: 'center' }}>
                  Click or drop to add more files · {files.length} selected
                </p>
              </div>
            ) : (
              <>
                <Upload size={24} />
                <p style={{ margin: '0.5rem 0 0.25rem' }}>Click or drag files here</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>PDF, JPG, PNG, WEBP, HEIC · Select multiple</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
              multiple
              onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Report Type</label>
            <select className="select-field" value={reportType} onChange={e => setReportType(e.target.value)}>
              {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Report Date</label>
            <input type="date" className="input-field" value={reportDate} onChange={e => setReportDate(e.target.value)} />
          </div>
        </div>

        {uploading && (
          <div style={{ margin: '0.75rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', marginBottom: '0.35rem' }}>
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div style={{ height: '4px', background: 'var(--color-surface-offset)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--color-primary)', borderRadius: '2px', transition: 'width 300ms ease' }} />
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={uploading || files.length === 0}>
            {uploading ? `Uploading ${files.length} files...` : `Upload ${files.length || ''} File${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReportDetailModal({ report, onClose, onDelete }: {
  report: HealthReport;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Modal open={true} onClose={onClose} title={report.title} wide>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <span className="badge badge-muted" style={{ marginRight: '0.5rem' }}>{report.report_type.replace(/_/g, ' ')}</span>
          {report.processing_status === 'complete' ? (
            <span className="badge badge-success">✓ AI Analyzed</span>
          ) : report.processing_status === 'uploaded' ? (
            <span className="badge badge-muted">Uploaded</span>
          ) : report.processing_status === 'failed' ? (
            <span className="badge badge-error">Failed</span>
          ) : (
            <span className="badge badge-warning">Pending</span>
          )}
        </div>
        <span style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)' }}>
          {formatDate(report.report_date)}
        </span>
      </div>

      {report.ai_summary && (
        <div className="section">
          <h3 className="section-title">AI Summary</h3>
          <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7, color: 'var(--color-tx-muted)' }}>{report.ai_summary}</p>
        </div>
      )}

      {report.body_regions && report.body_regions.length > 0 && (
        <div className="section">
          <h3 className="section-title">Body Regions</h3>
          <div className="restriction-chips">
            {report.body_regions.map(region => (
              <span key={region} className="badge badge-primary">{region}</span>
            ))}
          </div>
        </div>
      )}

      {report.structured_data && Object.keys(report.structured_data).length > 0 && (
        <div className="section">
          <h3 className="section-title">Extracted Data</h3>
          <pre style={{ fontSize: 'var(--text-xs)', background: 'var(--color-surface-offset)', padding: '1rem', borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: '300px' }}>
            {JSON.stringify(report.structured_data, null, 2)}
          </pre>
        </div>
      )}

      {report.file_url && (
        <div className="section">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <a href={report.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              <Eye size={14} /> Open in New Tab
            </a>
          </div>
          {report.file_url.endsWith('.pdf') || report.file_mime_type === 'application/pdf' ? (
            <iframe
              src={report.file_url}
              style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 'var(--radius-md)' }}
              title={report.title}
            />
          ) : report.file_url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
            <img src={report.file_url} alt={report.title} style={{ maxWidth: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)' }} />
          ) : null}
        </div>
      )}

      <div className="form-actions" style={{ marginTop: '1.5rem' }}>
        <button className="btn btn-danger" onClick={() => onDelete(report.id)}>
          <Trash2 size={14} /> Delete Report
        </button>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
