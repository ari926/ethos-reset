import { useState, useMemo, useRef } from 'react';
import { useHealthStore } from '../stores/healthStore';
import type { Treatment } from '../stores/healthStore';
import { HEALTH_AI_URL } from '../lib/supabase';
import Modal from '../components/common/Modal';
import { Pill, Plus, Square, Calendar, User, Camera, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

const CATEGORIES = ['Medications', 'Supplements', 'Protocols', 'Therapy'] as const;

export default function TreatmentsPage() {
  const { treatments, activeMemberId, addTreatment, updateTreatment, deleteTreatment } = useHealthStore();
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<Partial<Treatment> | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const handleScanPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const mimeType = file.type || 'image/jpeg';

      // Call AI to identify the medication
      const res = await fetch(HEALTH_AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'scan-treatment',
          image_base64: base64,
          mime_type: mimeType,
        }),
      });

      if (!res.ok) throw new Error('Scan failed');
      const data = await res.json();

      setScanResult({
        name: data.name ?? '',
        category: data.category ?? 'Medications',
        dosage: data.dosage ?? '',
        frequency: data.frequency ?? '',
        reason: data.reason ?? '',
        notes: data.notes ?? '',
      });
      setModalOpen(true);
      toast.success(`Identified: ${data.name}`);
    } catch (err) {
      console.error('Scan error:', err);
      toast.error('Could not identify medication. Try adding manually.');
    } finally {
      setScanning(false);
      if (scanInputRef.current) scanInputRef.current.value = '';
    }
  };

  const activeTreatments = useMemo(() => treatments.filter(t => t.is_active), [treatments]);
  const pastTreatments = useMemo(() => treatments.filter(t => !t.is_active), [treatments]);

  const groupedActive = useMemo(() => {
    const groups: Record<string, Treatment[]> = {};
    for (const cat of CATEGORIES) groups[cat] = [];
    for (const t of activeTreatments) {
      const cat = CATEGORIES.includes(t.category as typeof CATEGORIES[number]) ? t.category! : 'Medications';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    }
    return groups;
  }, [activeTreatments]);

  const handleStop = async (t: Treatment) => {
    await updateTreatment(t.id, {
      is_active: false,
      end_date: new Date().toISOString().slice(0, 10),
    });
  };

  const handleDelete = async (id: string) => {
    await deleteTreatment(id);
  };

  const displayed = tab === 'active' ? activeTreatments : pastTreatments;

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Treatment Tracker</h1>
          <p className="view-subtitle">{activeTreatments.length} active treatment{activeTreatments.length === 1 ? '' : 's'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleScanPhoto}
          />
          <button
            className="btn btn-secondary"
            onClick={() => scanInputRef.current?.click()}
            disabled={scanning}
          >
            {scanning ? <Loader size={14} className="spin" /> : <Camera size={14} />}
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
          <button className="btn btn-primary" onClick={() => { setScanResult(null); setModalOpen(true); }}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <button
          className={`btn btn-sm ${tab === 'active' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('active')}
        >
          Active ({activeTreatments.length})
        </button>
        <button
          className={`btn btn-sm ${tab === 'past' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('past')}
        >
          Past ({pastTreatments.length})
        </button>
      </div>

      {displayed.length === 0 ? (
        <div className="empty-state">
          <Pill size={48} />
          <h2>{tab === 'active' ? 'No active treatments' : 'No past treatments'}</h2>
          <p>{tab === 'active' ? 'Add a treatment to start tracking.' : 'Stopped treatments will appear here.'}</p>
        </div>
      ) : tab === 'active' ? (
        // Active: grouped by category
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {CATEGORIES.map(cat => {
            const items = groupedActive[cat];
            if (!items || items.length === 0) return null;
            return (
              <div key={cat}>
                <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-tx-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {cat}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {items.map(t => (
                    <TreatmentCard key={t.id} treatment={t} onStop={handleStop} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Past treatments
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {pastTreatments.map(t => (
            <div key={t.id} style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-divider)',
              padding: '0.875rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              opacity: 0.75,
            }}>
              <Pill size={16} style={{ color: 'var(--color-tx-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{t.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', marginTop: 2 }}>
                  {t.dosage && <span>{t.dosage}</span>}
                  {t.dosage && t.frequency && <span> &middot; </span>}
                  {t.frequency && <span>{t.frequency}</span>}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)', marginTop: 2 }}>
                  {formatDateShort(t.start_date)} &rarr; {t.end_date ? formatDateShort(t.end_date) : 'ongoing'}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)' }}
                onClick={() => handleDelete(t.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <AddTreatmentModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setScanResult(null); }}
        memberId={activeMemberId}
        onSave={addTreatment}
        prefill={scanResult}
      />
    </div>
  );
}

function TreatmentCard({ treatment: t, onStop }: { treatment: Treatment; onStop: (t: Treatment) => void }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-divider)',
      padding: '0.875rem 1rem',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
    }}>
      <Pill size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{t.name}</div>
        {(t.dosage || t.frequency) && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', marginTop: 2 }}>
            {t.dosage && <span>{t.dosage}</span>}
            {t.dosage && t.frequency && <span> &middot; </span>}
            {t.frequency && <span>{t.frequency}</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Calendar size={11} /> Started {formatDateShort(t.start_date)}
          </span>
          {t.prescriber && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <User size={11} /> {t.prescriber}
            </span>
          )}
        </div>
        {t.reason && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', marginTop: 4 }}>
            Reason: {t.reason}
          </div>
        )}
      </div>
      <button
        className="btn btn-ghost btn-sm"
        style={{ color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', flexShrink: 0 }}
        onClick={() => onStop(t)}
        title="Stop treatment"
      >
        <Square size={12} /> Stop
      </button>
    </div>
  );
}

function AddTreatmentModal({ open, onClose, memberId, onSave, prefill }: {
  open: boolean;
  onClose: () => void;
  memberId: string | null;
  onSave: (t: Partial<Treatment>) => Promise<void>;
  prefill?: Partial<Treatment> | null;
}) {
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!memberId) return;
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    await onSave({
      member_id: memberId,
      name: fd.get('name') as string,
      category: fd.get('category') as string || null,
      dosage: (fd.get('dosage') as string) || null,
      frequency: (fd.get('frequency') as string) || null,
      start_date: (fd.get('start_date') as string) || new Date().toISOString().slice(0, 10),
      prescriber: (fd.get('prescriber') as string) || null,
      reason: (fd.get('reason') as string) || null,
      notes: (fd.get('notes') as string) || null,
      is_active: true,
    });

    setSaving(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Treatment">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Name *</label>
          <input name="name" className="input-field" placeholder="e.g. Vitamin D, Metformin" required defaultValue={prefill?.name ?? ''} key={prefill?.name ?? 'empty'} />
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Category</label>
            <select name="category" className="select-field" defaultValue={prefill?.category ?? 'Supplements'} key={`cat-${prefill?.name ?? ''}`}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input name="start_date" type="date" className="input-field" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Dosage</label>
            <input name="dosage" className="input-field" placeholder="e.g. 5000 IU" defaultValue={prefill?.dosage ?? ''} key={`dos-${prefill?.name ?? ''}`} />
          </div>
          <div className="form-group">
            <label className="form-label">Frequency</label>
            <input name="frequency" className="input-field" placeholder="e.g. Daily, 2x/week" defaultValue={prefill?.frequency ?? ''} key={`freq-${prefill?.name ?? ''}`} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Prescriber</label>
          <input name="prescriber" className="input-field" placeholder="Dr. name or self" />
        </div>

        <div className="form-group">
          <label className="form-label">Reason</label>
          <input name="reason" className="input-field" placeholder="Why this treatment was started" defaultValue={prefill?.reason ?? ''} key={`rea-${prefill?.name ?? ''}`} />
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea name="notes" className="input-field" rows={2} placeholder="Additional notes" />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Add Treatment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
