import { useState, useEffect } from 'react';
import { Stethoscope, Plus, Trash2, Shield, UserCheck, UserX, Mail, Phone, Edit2, Link, Copy, Check } from 'lucide-react';
import { useHealthStore, type Doctor } from '../stores/healthStore';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import { getInitials, formatDate } from '../lib/utils';

export default function DoctorsPage() {
  const { familyMembers, doctors, doctorAccess, loadDoctors, addDoctor, updateDoctor, deleteDoctor, grantAccess, revokeAccess } = useHealthStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editDoctor, setEditDoctor] = useState<Doctor | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);

  useEffect(() => { loadDoctors(); }, [loadDoctors]);

  const handleSave = async (data: {
    email: string;
    full_name: string;
    specialty: string;
    practice_name: string;
    phone: string;
    member_ids: string[];
  }) => {
    if (editDoctor) {
      await updateDoctor(editDoctor.id, {
        email: data.email,
        full_name: data.full_name || null,
        specialty: data.specialty || null,
        practice_name: data.practice_name || null,
        phone: data.phone || null,
      });

      // Sync member access
      const currentAccess = doctorAccess.filter(a => a.doctor_id === editDoctor.id);
      const currentMemberIds = new Set(currentAccess.map(a => a.member_id));
      const newMemberIds = new Set(data.member_ids);

      for (const mid of data.member_ids) {
        if (!currentMemberIds.has(mid)) await grantAccess(editDoctor.id, mid);
      }
      for (const mid of currentMemberIds) {
        if (!newMemberIds.has(mid)) await revokeAccess(editDoctor.id, mid);
      }
      await loadDoctors();
    } else {
      await addDoctor({
        email: data.email,
        full_name: data.full_name || null,
        specialty: data.specialty || null,
        practice_name: data.practice_name || null,
        phone: data.phone || null,
        status: 'active',
        access_level: 'read',
      });

      // Grant access to selected members for the newly created doctor
      const refreshed = useHealthStore.getState().doctors;
      const newDoc = refreshed.find(d => d.email === data.email);
      if (newDoc && data.member_ids.length > 0) {
        for (const mid of data.member_ids) {
          await grantAccess(newDoc.id, mid);
        }
      }
    }

    setModalOpen(false);
    setEditDoctor(null);
  };

  const handleGenerateShareLink = async (doc: Doctor) => {
    const token = crypto.randomUUID();
    await updateDoctor(doc.id, {
      share_token: token,
      last_shared_at: new Date().toISOString(),
    });
    const shareUrl = `${window.location.origin}/share/${token}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Ethos Reset — Doctor Access',
          text: `You've been invited to view patient health data on Ethos Reset`,
          url: shareUrl,
        });
        setCopiedId(doc.id);
        toast.success('Share link sent!');
      } catch {
        setShareLink(shareUrl);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedId(doc.id);
        toast.success('Share link copied to clipboard');
      } catch {
        setShareLink(shareUrl);
      }
    }
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (doctorId: string) => {
    await updateDoctor(doctorId, { status: 'revoked' });
  };

  const handleActivate = async (doctorId: string) => {
    await updateDoctor(doctorId, { status: 'active' });
  };

  const toggleMemberAccess = async (doctorId: string, memberId: string) => {
    const existing = doctorAccess.find(a => a.doctor_id === doctorId && a.member_id === memberId);
    if (existing) {
      await revokeAccess(doctorId, memberId);
    } else {
      await grantAccess(doctorId, memberId);
    }
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Doctors</h1>
          <p className="view-subtitle">Manage doctor access to family health data</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditDoctor(null); setModalOpen(true); }}>
          <Plus size={14} /> Add Doctor
        </button>
      </div>

      {doctors.length === 0 ? (
        <div className="empty-state">
          <Stethoscope size={48} />
          <h2>No doctors added</h2>
          <p>Add a doctor to manage their access to your family's health data and generate share links.</p>
          <button className="btn btn-primary" onClick={() => { setEditDoctor(null); setModalOpen(true); }}>
            <Plus size={14} /> Add First Doctor
          </button>
        </div>
      ) : (
        <div className="doctor-list">
          {doctors.map(doc => {
            const docAccess = doctorAccess.filter(a => a.doctor_id === doc.id);
            return (
              <div key={doc.id} className="doctor-card">
                <div className="doctor-card-header">
                  <div
                    className="doctor-card-avatar"
                    style={{
                      background: doc.status === 'active'
                        ? 'var(--color-success)'
                        : doc.status === 'revoked'
                          ? 'var(--color-error)'
                          : 'var(--color-tx-faint)',
                    }}
                  >
                    {getInitials(doc.full_name ?? doc.email)}
                  </div>
                  <div className="doctor-card-info">
                    <h3>{doc.full_name ?? doc.email}</h3>
                    <p>
                      {doc.specialty && <span>{doc.specialty}</span>}
                      {doc.practice_name && <span> &middot; {doc.practice_name}</span>}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', marginTop: '0.25rem' }}>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)', margin: 0 }}>
                        <Mail size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.25rem' }} />
                        {doc.email}
                      </p>
                      {doc.phone && (
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)', margin: 0 }}>
                          <Phone size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.25rem' }} />
                          {doc.phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <span className={`badge badge-${doc.status === 'active' ? 'success' : doc.status === 'revoked' ? 'error' : 'warning'}`}>
                      {doc.status}
                    </span>
                    <span className="badge badge-muted">
                      <Shield size={10} /> {doc.access_level}
                    </span>
                  </div>
                </div>

                <div className="doctor-card-access">
                  <h4>Patient Access</h4>
                  <div className="doctor-member-chips">
                    {familyMembers.map(member => {
                      const hasAccess = docAccess.some(a => a.member_id === member.id);
                      return (
                        <button
                          key={member.id}
                          className={`member-chip ${hasAccess ? 'active' : ''}`}
                          onClick={() => toggleMemberAccess(doc.id, member.id)}
                          title={hasAccess ? `Remove ${member.first_name} access` : `Grant ${member.first_name} access`}
                        >
                          <span className="member-chip-name">{member.first_name}</span>
                          {hasAccess ? <UserCheck size={12} /> : <UserX size={12} />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Share Link Section */}
                <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleGenerateShareLink(doc)}
                    title="Generate a read-only share link"
                  >
                    {copiedId === doc.id ? <Check size={14} /> : <Link size={14} />}
                    {copiedId === doc.id ? 'Copied!' : 'Generate Share Link'}
                  </button>
                  {doc.share_token && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <code style={{
                        fontSize: 'var(--text-xs)',
                        background: 'var(--color-surface-raised)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-tx-muted)',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        /share/{doc.share_token.slice(0, 8)}...
                      </code>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/share/${doc.share_token}`);
                          setCopiedId(doc.id);
                          toast.success('Link copied');
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        title="Copy link"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  )}
                  {doc.last_shared_at && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>
                      Last shared {formatDate(doc.last_shared_at)}
                    </span>
                  )}
                </div>

                <div className="doctor-card-actions">
                  {doc.status === 'active' && (
                    <button className="btn btn-sm btn-secondary" onClick={() => handleRevoke(doc.id)}>
                      <UserX size={14} /> Revoke
                    </button>
                  )}
                  {(doc.status === 'pending' || doc.status === 'revoked') && (
                    <button className="btn btn-sm btn-primary" onClick={() => handleActivate(doc.id)}>
                      <UserCheck size={14} /> Activate
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => { setEditDoctor(doc); setModalOpen(true); }}
                    title="Edit doctor"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ color: 'var(--color-error)' }}
                    onClick={() => setDeleteId(doc.id)}
                    title="Remove doctor"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DoctorModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditDoctor(null); }}
        onSave={handleSave}
        doctor={editDoctor}
        familyMembers={familyMembers}
        doctorAccess={doctorAccess}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteDoctor(deleteId); }}
        title="Remove Doctor"
        message="This will permanently remove this doctor and revoke all their access. This cannot be undone."
      />

      {shareLink && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem',
        }} onClick={() => setShareLink(null)}>
          <div style={{
            background: 'var(--color-surface, #fff)', borderRadius: 'var(--radius-lg, 12px)',
            padding: '1.5rem', maxWidth: '420px', width: '100%', boxShadow: 'var(--shadow-lg)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-base)' }}>Doctor Share Link</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-tx-muted)', margin: '0 0 1rem' }}>
              Copy this link and send it to your doctor:
            </p>
            <input
              type="text"
              readOnly
              value={shareLink}
              className="input-field"
              style={{ fontSize: 'var(--text-xs)', marginBottom: '1rem' }}
              onFocus={e => e.target.select()}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareLink);
                  toast.success('Copied!');
                  setShareLink(null);
                } catch {
                  toast('Long-press the link above to copy it');
                }
              }}>
                <Copy size={14} /> Copy Link
              </button>
              <button className="btn btn-secondary" onClick={() => setShareLink(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DoctorModal({ open, onClose, onSave, doctor, familyMembers, doctorAccess }: {
  open: boolean;
  onClose: () => void;
  onSave: (data: { email: string; full_name: string; specialty: string; practice_name: string; phone: string; member_ids: string[] }) => void;
  doctor: Doctor | null;
  familyMembers: Array<{ id: string; first_name: string; last_name: string }>;
  doctorAccess: Array<{ doctor_id: string; member_id: string }>;
}) {
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && doctor) {
      const memberIds = doctorAccess.filter(a => a.doctor_id === doctor.id).map(a => a.member_id);
      setSelectedMembers(new Set(memberIds));
    } else if (open) {
      setSelectedMembers(new Set());
    }
  }, [open, doctor, doctorAccess]);

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      email: fd.get('email') as string,
      full_name: fd.get('full_name') as string,
      specialty: fd.get('specialty') as string,
      practice_name: fd.get('practice_name') as string,
      phone: fd.get('phone') as string,
      member_ids: Array.from(selectedMembers),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={doctor ? 'Edit Doctor' : 'Add Doctor'}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Email *</label>
          <input
            name="email"
            type="email"
            className="input-field"
            required
            placeholder="doctor@example.com"
            defaultValue={doctor?.email ?? ''}
          />
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              name="full_name"
              className="input-field"
              placeholder="Dr. Jane Smith"
              defaultValue={doctor?.full_name ?? ''}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Specialty</label>
            <input
              name="specialty"
              className="input-field"
              placeholder="e.g. Cardiology"
              defaultValue={doctor?.specialty ?? ''}
            />
          </div>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Practice</label>
            <input
              name="practice_name"
              className="input-field"
              placeholder="Practice name"
              defaultValue={doctor?.practice_name ?? ''}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              name="phone"
              className="input-field"
              placeholder="(555) 555-5555"
              defaultValue={doctor?.phone ?? ''}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Grant Access To</label>
          <div className="restriction-chips">
            {familyMembers.map(m => (
              <button
                key={m.id}
                type="button"
                className={`badge ${selectedMembers.has(m.id) ? 'badge-primary' : 'badge-muted'}`}
                style={{ cursor: 'pointer' }}
                onClick={() => toggleMember(m.id)}
              >
                {selectedMembers.has(m.id) ? '\u2713' : '+'} {m.first_name} {m.last_name}
              </button>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{doctor ? 'Save Changes' : 'Add Doctor'}</button>
        </div>
      </form>
    </Modal>
  );
}
