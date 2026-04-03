import { useState, type FormEvent } from 'react';
import Modal from '../common/Modal';
import { useHealthStore, type Restriction } from '../../stores/healthStore';

interface Props {
  open: boolean;
  onClose: () => void;
  restriction: Restriction | null;
  memberId: string | null;
}

const TYPES = [
  { value: 'food_allergy', label: 'Food Allergy' },
  { value: 'food_intolerance', label: 'Food Intolerance' },
  { value: 'drug_allergy', label: 'Drug Allergy' },
  { value: 'drug_interaction', label: 'Drug Interaction' },
  { value: 'dietary', label: 'Dietary' },
  { value: 'contraindication', label: 'Contraindication' },
];

export default function RestrictionModal({ open, onClose, restriction, memberId }: Props) {
  const { addRestriction, updateRestriction } = useHealthStore();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!memberId) return;
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const data = {
      member_id: memberId,
      restriction_type: fd.get('restriction_type') as string,
      item_name: fd.get('item_name') as string,
      severity: fd.get('severity') as string,
      reaction: (fd.get('reaction') as string) || null,
      notes: (fd.get('notes') as string) || null,
      source: 'manual' as const,
      confirmed: true,
    };

    if (restriction) {
      await updateRestriction(restriction.id, data);
    } else {
      await addRestriction(data);
    }

    setSaving(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={restriction ? 'Edit Restriction' : 'Add Restriction'}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Type *</label>
            <select name="restriction_type" className="select-field" required defaultValue={restriction?.restriction_type ?? 'food_allergy'}>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Severity *</label>
            <select name="severity" className="select-field" required defaultValue={restriction?.severity ?? 'warning'}>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="caution">Caution</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Item Name *</label>
          <input name="item_name" className="input-field" required defaultValue={restriction?.item_name ?? ''} placeholder="e.g. Peanuts, Ibuprofen" />
        </div>

        <div className="form-group">
          <label className="form-label">Reaction</label>
          <input name="reaction" className="input-field" defaultValue={restriction?.reaction ?? ''} placeholder="e.g. Anaphylaxis, Rash, Nausea" />
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea name="notes" className="input-field" rows={2} defaultValue={restriction?.notes ?? ''} />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : restriction ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
