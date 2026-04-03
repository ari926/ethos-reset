import { useState, useEffect } from 'react';
import { Stethoscope, Plus, Trash2, Shield, UserCheck, UserX, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useHealthStore } from '../stores/healthStore';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import { getInitials } from '../lib/utils';

interface Doctor {
  id: string;
  created_at: string;
  email: string;
  full_name: string | null;
  specialty: string | null;
  practice_name: string | null;
  phone: string | null;
  status: string;
  access_level: string;
}

interface DoctorAccess {
  id: string;
  doctor_id: string;
  member_id: string;
}

export default function DoctorsPage() {
  const { user } = useAuthStore();
  const { familyMembers } = useHealthStore();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [accessList, setAccessList] = useState<DoctorAccess[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const loadDoctors = async () => {
    const [docRes, accessRes] = await Promise.all([
      supabase.from('doctors').select('*').order('created_at', { ascending: false }),
      supabase.from('doctor_member_access').select('*'),
    ]);
    setDoctors(docRes.data ?? []);
    setAccessList(accessRes.data ?? []);
  };

  useEffect(() => { loadDoctors(); }, []);

  const handleInvite = async (data: { email: string; full_name: string; specialty: string; practice_name: string; phone: string; member_ids: string[] }) => {
    if (!user) return;

    const { data: doc, error } = await supabase.from('doctors').insert({
      email: data.email,
      full_name: data.full_name || null,
      specialty: data.specialty || null,
      practice_name: data.practice_name || null,
      phone: data.phone || null,
      invited_by: user.id,
      status: 'pending',
      access_level: 'read',
    }).select('id').single();

    if (error) {
      toast.error('Failed to invite doctor');
      return;
    }

    if (doc && data.member_ids.length > 0) {
      const accessRecords = data.member_ids.map(mid => ({
        doctor_id: doc.id,
        member_id: mid,
        granted_by: user.id,
      }));
      await supabase.from('doctor_member_access').insert(accessRecords);
    }

    toast.success('Doctor invited');
    loadDoctors();
    setInviteOpen(false);
  };

  const handleRevoke = async (doctorId: string) => {
    await supabase.from('doctors').update({ status: 'revoked' }).eq('id', doctorId);
    toast.success('Access revoked');
    loadDoctors();
  };

  const handleActivate = async (doctorId: string) => {
    await supabase.from('doctors').update({ status: 'active' }).eq('id', doctorId);
    toast.success('Access activated');
    loadDoctors();
  };

  const handleDelete = async (doctorId: string) => {
    await supabase.from('doctors').delete().eq('id', doctorId);
    toast.success('Doctor removed');
    loadDoctors();
  };

  const toggleMemberAccess = async (doctorId: string, memberId: string) => {
    if (!user) return;
    const existing = accessList.find(a => a.doctor_id === doctorId && a.member_id === memberId);
    if (existing) {
      await supabase.from('doctor_member_access').delete().eq('id', existing.id);
    } else {
      await supabase.from('doctor_member_access').insert({
        doctor_id: doctorId,
        member_id: memberId,
        granted_by: user.id,
      });
    }
    loadDoctors();
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Doctors</h1>
          <p className="view-subtitle">Manage doctor access to family health data</p>
        </div>
        <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
          <Plus size={14} /> Invite Doctor
        </button>
      </div>

      {doctors.length === 0 ? (
        <div className="empty-state">
          <Stethoscope size={48} />
          <h2>No doctors assigned</h2>
          <p>Invite a doctor by email to give them read-only access to your family's health data.</p>
        </div>
      ) : (
        <div className="doctor-list">
          {doctors.map(doc => {
            const docAccess = accessList.filter(a => a.doctor_id === doc.id);
            return (
              <div key={doc.id} className="doctor-card">
                <div className="doctor-card-header">
                  <div className="doctor-card-avatar" style={{ background: doc.status === 'active' ? 'var(--color-success)' : doc.status === 'revoked' ? 'var(--color-error)' : 'var(--color-tx-faint)' }}>
                    {getInitials(doc.full_name ?? doc.email)}
                  </div>
                  <div className="doctor-card-info">
                    <h3>{doc.full_name ?? doc.email}</h3>
                    <p>
                      {doc.specialty && <span>{doc.specialty}</span>}
                      {doc.practice_name && <span> &middot; {doc.practice_name}</span>}
                    </p>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>
                      <Mail size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.25rem' }} />
                      {doc.email}
                    </p>
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
                  <button className="btn btn-sm btn-ghost" style={{ color: 'var(--color-error)' }} onClick={() => setDeleteId(doc.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvite={handleInvite} familyMembers={familyMembers} />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) handleDelete(deleteId); }}
        title="Remove Doctor"
        message="This will permanently remove this doctor and revoke all their access. This cannot be undone."
      />
    </div>
  );
}

function InviteModal({ open, onClose, onInvite, familyMembers }: {
  open: boolean;
  onClose: () => void;
  onInvite: (data: { email: string; full_name: string; specialty: string; practice_name: string; phone: string; member_ids: string[] }) => void;
  familyMembers: Array<{ id: string; first_name: string; last_name: string }>;
}) {
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

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
    onInvite({
      email: fd.get('email') as string,
      full_name: fd.get('full_name') as string,
      specialty: fd.get('specialty') as string,
      practice_name: fd.get('practice_name') as string,
      phone: fd.get('phone') as string,
      member_ids: Array.from(selectedMembers),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite Doctor">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Email *</label>
          <input name="email" type="email" className="input-field" required placeholder="doctor@example.com" />
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input name="full_name" className="input-field" placeholder="Dr. Jane Smith" />
          </div>
          <div className="form-group">
            <label className="form-label">Specialty</label>
            <input name="specialty" className="input-field" placeholder="e.g. Cardiology" />
          </div>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Practice</label>
            <input name="practice_name" className="input-field" placeholder="Practice name" />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input name="phone" className="input-field" placeholder="(555) 555-5555" />
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
          <button type="submit" className="btn btn-primary">Send Invite</button>
        </div>
      </form>
    </Modal>
  );
}
