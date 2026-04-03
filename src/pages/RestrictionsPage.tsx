import { useState } from 'react';
import { useHealthStore, type Restriction } from '../stores/healthStore';
import { ShieldAlert, Plus, Trash2, Edit2 } from 'lucide-react';
import RestrictionModal from '../components/Restrictions/RestrictionModal';
import ConfirmDialog from '../components/common/ConfirmDialog';

const QUICK_ADD_PRESETS = [
  'Peanuts', 'Tree Nuts', 'Shellfish', 'Dairy', 'Gluten', 'Eggs', 'Soy',
  'Penicillin', 'Aspirin', 'NSAIDs', 'Sulfa Drugs', 'Latex',
];

export default function RestrictionsPage() {
  const { restrictions, activeMemberId, familyMembers, addRestriction, deleteRestriction } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Restriction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleQuickAdd = (item: string) => {
    if (!activeMemberId) return;
    addRestriction({
      member_id: activeMemberId,
      restriction_type: 'food_allergy',
      item_name: item,
      severity: 'warning',
      source: 'manual',
      confirmed: true,
    });
  };

  const confirmed = restrictions.filter(r => r.confirmed);
  const suggested = restrictions.filter(r => !r.confirmed);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Restrictions</h1>
          <p className="view-subtitle">
            {member ? `${member.first_name}'s food & medicine restrictions` : 'Select a family member'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditItem(null); setModalOpen(true); }} disabled={!activeMemberId}>
          <Plus size={14} /> Add Restriction
        </button>
      </div>

      {activeMemberId && (
        <div className="section">
          <h3 className="section-title">Quick Add Common Allergens</h3>
          <div className="restriction-chips">
            {QUICK_ADD_PRESETS.map(item => (
              <button
                key={item}
                className="badge badge-muted"
                style={{ cursor: 'pointer' }}
                onClick={() => handleQuickAdd(item)}
                disabled={restrictions.some(r => r.item_name === item)}
              >
                + {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {suggested.length > 0 && (
        <div className="section">
          <h3 className="section-title" style={{ color: 'var(--color-warning)' }}>
            AI-Suggested Restrictions ({suggested.length})
          </h3>
          <div className="restriction-list">
            {suggested.map(r => (
              <div key={r.id} className="restriction-item suggested">
                <div className="restriction-info">
                  <span className={`badge badge-${r.severity === 'critical' ? 'error' : 'warning'}`}>{r.restriction_type.replace(/_/g, ' ')}</span>
                  <strong>{r.item_name}</strong>
                  {r.reaction && <span className="restriction-reaction">{r.reaction}</span>}
                </div>
                <div className="restriction-actions">
                  <button className="btn btn-sm btn-primary" onClick={() => {/* confirm */}}>Confirm</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setDeleteId(r.id)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmed.length === 0 && suggested.length === 0 ? (
        <div className="empty-state">
          <ShieldAlert size={48} />
          <h2>No restrictions</h2>
          <p>Add food allergies, drug interactions, or dietary restrictions for this family member.</p>
        </div>
      ) : (
        <div className="restriction-list">
          {confirmed.map(r => (
            <div key={r.id} className="restriction-item">
              <div className="restriction-info">
                <span className={`severity-dot severity-${r.severity}`} />
                <span className="badge badge-muted">{r.restriction_type.replace(/_/g, ' ')}</span>
                <strong>{r.item_name}</strong>
                {r.reaction && <span className="restriction-reaction">\u2014 {r.reaction}</span>}
              </div>
              <div className="restriction-actions">
                <button className="btn btn-sm btn-ghost" onClick={() => { setEditItem(r); setModalOpen(true); }}>
                  <Edit2 size={14} />
                </button>
                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--color-error)' }} onClick={() => setDeleteId(r.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RestrictionModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null); }}
        restriction={editItem}
        memberId={activeMemberId}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteRestriction(deleteId); }}
        title="Delete Restriction"
        message="Are you sure you want to remove this restriction?"
      />
    </div>
  );
}
