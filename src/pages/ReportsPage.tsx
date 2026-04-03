import { useState, useRef } from 'react';
import { useHealthStore, type HealthReport } from '../stores/healthStore';
import { FileText, Upload, Trash2, Eye, X } from 'lucide-react';
import { formatDate } from '../lib/utils';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';

const REPORT_TYPES = [
  { value: 'blood_test', label: 'Blood Test' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'pathology', label: 'Pathology' },
  { value: 'general', label: 'General' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'discharge', label: 'Discharge' },
  { value: 'lab_panel', label: 'Lab Panel' },
  { value: 'other', label: 'Other' },
];

export default function ReportsPage() {
  const { reports, activeMemberId, familyMembers, uploadReport, deleteReport } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailReport, setDetailReport] = useState<HealthReport | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  const filtered = filterType === 'all' ? reports : reports.filter(r => r.report_type === filterType);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Medical Reports</h1>
          <p className="view-subtitle">
            {member ? `${member.first_name}'s uploaded reports and AI analysis` : 'Select a family member'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setUploadOpen(true)} disabled={!activeMemberId}>
          <Upload size={14} /> Upload Report
        </button>
      </div>

      {reports.length > 0 && (
        <div className="filter-bar">
          <select className="select-field" style={{ width: 'auto' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <span className="filter-count">{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <h2>{reports.length === 0 ? 'No reports yet' : 'No matching reports'}</h2>
          <p>Upload a medical report (PDF or image) and AI will extract the data automatically.</p>
        </div>
      ) : (
        <div className="report-list">
          {filtered.map(r => (
            <div key={r.id} className="report-card" onClick={() => setDetailReport(r)} style={{ cursor: 'pointer' }}>
              <div className="report-card-header">
                <FileText size={18} />
                <div>
                  <div className="report-card-title">{r.title}</div>
                  <div className="report-card-meta">
                    {r.report_type.replace(/_/g, ' ')} &middot; {formatDate(r.report_date)}
                  </div>
                </div>
                <span className={`badge badge-${r.processing_status === 'complete' ? 'success' : r.processing_status === 'failed' ? 'error' : 'muted'}`}>
                  {r.processing_status}
                </span>
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
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!memberId || !file) return;
    setUploading(true);

    const fd = new FormData(e.currentTarget);
    const title = fd.get('title') as string;
    const reportType = fd.get('report_type') as string;
    const reportDate = (fd.get('report_date') as string) || null;

    await onUpload(memberId, file, title, reportType, reportDate);
    setUploading(false);
    setFile(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload Report">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">File *</label>
          <div
            className="scanner-capture-zone"
            style={{ padding: '1.5rem' }}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} />
                <span>{file.name}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <Upload size={24} />
                <p>Click to select a PDF or image</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Title *</label>
          <input name="title" className="input-field" required placeholder="e.g. Annual Blood Panel" />
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Report Type</label>
            <select name="report_type" className="select-field" defaultValue="blood_test">
              {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Report Date</label>
            <input name="report_date" type="date" className="input-field" />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={uploading || !file}>
            {uploading ? 'Uploading...' : 'Upload & Process'}
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
          <span className={`badge badge-${report.processing_status === 'complete' ? 'success' : report.processing_status === 'failed' ? 'error' : 'muted'}`}>
            {report.processing_status}
          </span>
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
          <a href={report.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            <Eye size={14} /> View Original File
          </a>
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
