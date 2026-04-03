import { useState } from 'react';
import { useHealthStore, type FamilyMember } from '../stores/healthStore';
import { useAuthStore } from '../stores/authStore';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';
import { getInitials, memberColor, calculateAge, formatDate } from '../lib/utils';
import MemberModal from '../components/Family/MemberModal';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function FamilyPage() {
  const { familyMembers, addFamilyMember, updateFamilyMember, deleteFamilyMember, activeMemberId, setActiveMember } = useHealthStore();
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
    </div>
  );
}
