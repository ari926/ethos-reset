import { useState, type FormEvent } from 'react';
import Modal from '../common/Modal';
import type { FamilyMember } from '../../stores/healthStore';

interface Props {
  open: boolean;
  onClose: () => void;
  member: FamilyMember | null;
  onSave: (data: Partial<FamilyMember>) => void;
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function MemberModal({ open, onClose, member, onSave }: Props) {
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const data: Partial<FamilyMember> = {
      first_name: fd.get('first_name') as string,
      last_name: fd.get('last_name') as string,
      date_of_birth: (fd.get('date_of_birth') as string) || null,
      gender: (fd.get('gender') as string) || null,
      blood_type: (fd.get('blood_type') as string) || null,
      height_cm: fd.get('height_cm') ? Number(fd.get('height_cm')) : null,
      weight_kg: fd.get('weight_kg') ? Number(fd.get('weight_kg')) : null,
      notes: (fd.get('notes') as string) || null,
    };
    onSave(data);
    setSaving(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={member ? 'Edit Family Member' : 'Add Family Member'}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">First Name *</label>
            <input name="first_name" className="input-field" required defaultValue={member?.first_name ?? ''} />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name *</label>
            <input name="last_name" className="input-field" required defaultValue={member?.last_name ?? ''} />
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input name="date_of_birth" type="date" className="input-field" defaultValue={member?.date_of_birth ?? ''} />
          </div>
          <div className="form-group">
            <label className="form-label">Gender</label>
            <select name="gender" className="select-field" defaultValue={member?.gender ?? ''}>
              <option value="">--</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Blood Type</label>
            <select name="blood_type" className="select-field" defaultValue={member?.blood_type ?? ''}>
              <option value="">--</option>
              {BLOOD_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Height (cm)</label>
            <input name="height_cm" type="number" className="input-field" defaultValue={member?.height_cm ?? ''} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Weight (kg)</label>
          <input name="weight_kg" type="number" step="0.1" className="input-field" defaultValue={member?.weight_kg ?? ''} />
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea name="notes" className="input-field" rows={3} defaultValue={member?.notes ?? ''} />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : member ? 'Save' : 'Add Member'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
