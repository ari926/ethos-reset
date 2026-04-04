import { useState } from 'react';
import { useHealthStore, type FamilyMember } from '../stores/healthStore';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Users, UserPlus, CheckCircle, Copy } from 'lucide-react';
import { getInitials, memberColor, calculateAge, formatDate } from '../lib/utils';
import MemberModal from '../components/Family/MemberModal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import toast from 'react-hot-toast';

export default function FamilyPage() {
  const { familyMembers, addFamilyMember, updateFamilyMember, deleteFamilyMember, activeMemberId, setActiveMember, loadFamilyMembers } = useHealthStore();
  const { user } = useAuthStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editMember, setEditMember] = useState<FamilyMember | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleSave = (data: Partial<FamilyMember>) => {
    if (editMember) {
      updateFamilyMember(editMember.id, data);
    } else {
      addFamilyMember({ ...data, owner_id: user?.id ?? null });
    }
  };

  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const generateInviteLink = async (member: FamilyMember) => {
    const token = crypto.randomUUID();
    const { error } = await supabase
      .from('family_members')
      .update({ invite_token: token, invite_status: 'pending' })
      .eq('id', member.id);
    if (error) {
      toast.error('Failed to generate invite link');
      return;
    }
    const link = `${window.location.origin}/invite/${token}`;

    // Try native share (mobile), fallback to clipboard, fallback to showing link
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Ethos Reset Invite',
          text: `Join my family health profile on Ethos Reset`,
          url: link,
        });
        toast.success('Invite shared!');
      } catch {
        setInviteLink(link);
      }
    } else {
      try {
        await navigator.clipboard.writeText(link);
        toast.success('Invite link copied to clipboard!');
      } catch {
        setInviteLink(link);
      }
    }
    loadFamilyMembers();
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Family Members</h1>
          <p className="view-subtitle">Manage your family's health profiles</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditMember(null); setModalOpen(true); }}>
          <Plus size={14} /> Add Member
        </button>
      </div>

      {familyMembers.length === 0 ? (
        <div className="empty-state">
          <Users size={48} />
          <h2>No family members yet</h2>
          <p>Add your first family member to start tracking health data.</p>
          <button className="btn btn-primary" onClick={() => { setEditMember(null); setModalOpen(true); }}>
            <Plus size={14} /> Add First Member
          </button>
        </div>
      ) : (
        <div className="member-grid">
          {familyMembers.map(member => {
            const name = `${member.first_name} ${member.last_name}`;
            const age = calculateAge(member.date_of_birth);
            const color = memberColor(member.id);
            const isActive = member.id === activeMemberId;

            return (
              <div
                key={member.id}
                className={`member-card${isActive ? ' active' : ''}`}
                onClick={() => setActiveMember(member.id)}
              >
                <div className="member-card-avatar" style={{ background: color }}>
                  {getInitials(name)}
                </div>
                <div className="member-card-info">
                  <h3>{name}</h3>
                  <p>
                    {age !== null ? `${age} yrs` : ''}
                    {member.gender ? ` \u00B7 ${member.gender}` : ''}
                    {member.blood_type ? ` \u00B7 ${member.blood_type}` : ''}
                  </p>
                  {member.date_of_birth && (
                    <p className="member-card-dob">Born {formatDate(member.date_of_birth)}</p>
                  )}
                </div>
                <div className="member-card-actions">
                  {member.auth_user_id ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: 'var(--text-xs)', color: 'var(--color-success)', fontWeight: 500 }}>
                      <CheckCircle size={12} /> Linked
                    </span>
                  ) : member.invite_token && member.invite_status === 'pending' ? (
                    <button className="btn btn-sm btn-ghost" title="Share invite link" onClick={async (e) => {
                      e.stopPropagation();
                      const link = `${window.location.origin}/invite/${member.invite_token}`;
                      if (navigator.share) {
                        try { await navigator.share({ title: 'Ethos Reset Invite', url: link }); } catch { setInviteLink(link); }
                      } else {
                        try { await navigator.clipboard.writeText(link); toast.success('Invite link copied!'); } catch { setInviteLink(link); }
                      }
                    }}>
                      <Copy size={14} /> <span style={{ fontSize: 'var(--text-xs)' }}>Pending</span>
                    </button>
                  ) : member.id !== '00000000-0000-0000-0000-000000000001' ? (
                    <button className="btn btn-sm btn-ghost" title="Invite to app" style={{ color: 'var(--color-primary)' }} onClick={(e) => { e.stopPropagation(); generateInviteLink(member); }}>
                      <UserPlus size={14} />
                    </button>
                  ) : null}
                  <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setEditMember(member); setModalOpen(true); }}>
                    <Edit2 size={14} />
                  </button>
                  <button className="btn btn-sm btn-ghost" style={{ color: 'var(--color-error)' }} onClick={(e) => { e.stopPropagation(); setDeleteId(member.id); }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MemberModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditMember(null); }}
        member={editMember}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteFamilyMember(deleteId); }}
        title="Remove Family Member"
        message="This will permanently delete this family member and all their health data. This cannot be undone."
      />

      {/* Invite link fallback dialog (when clipboard/share fails) */}
      {inviteLink && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem',
        }} onClick={() => setInviteLink(null)}>
          <div style={{
            background: 'var(--color-surface, #fff)', borderRadius: 'var(--radius-lg, 12px)',
            padding: '1.5rem', maxWidth: '420px', width: '100%', boxShadow: 'var(--shadow-lg)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-base)' }}>Invite Link</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-tx-muted)', margin: '0 0 1rem' }}>
              Copy this link and send it to your family member:
            </p>
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="input-field"
              style={{ fontSize: 'var(--text-xs)', marginBottom: '1rem' }}
              onFocus={e => e.target.select()}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteLink);
                  toast.success('Copied!');
                  setInviteLink(null);
                } catch {
                  toast('Long-press the link above to copy it');
                }
              }}>
                <Copy size={14} /> Copy Link
              </button>
              <button className="btn btn-secondary" onClick={() => setInviteLink(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
