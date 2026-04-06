import { useState } from 'react';
import { Heart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useHealthStore } from '../stores/healthStore';
import toast from 'react-hot-toast';

export default function OnboardingPage() {
  const { user } = useAuthStore();
  const { loadFamilyMembers } = useHealthStore();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const firstName = fd.get('first_name') as string;
    const lastName = fd.get('last_name') as string;
    const dob = (fd.get('dob') as string) || null;
    const gender = (fd.get('gender') as string) || null;

    const { error } = await supabase.from('family_members').insert({
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dob,
      gender: gender || null,
      owner_id: user.id,
      auth_user_id: user.id,
      role: 'self',
    });

    if (error) {
      console.error('Onboarding error:', error);
      toast.error('Failed to create profile. Please try again.');
      setSaving(false);
      return;
    }

    toast.success(`Welcome, ${firstName}!`);
    await loadFamilyMembers();
    setSaving(false);
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: 440 }}>
        <Heart size={56} className="login-logo" fill="var(--color-primary)" color="var(--color-primary)" />
        <h1 className="login-title">Welcome to Ethos Reset</h1>
        <p className="login-subtitle">Let's set up your health profile</p>

        <div className="login-card">
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">First Name *</label>
                <input
                  name="first_name"
                  className="input-field"
                  required
                  placeholder="Your first name"
                  defaultValue={displayName.split(' ')[0] || ''}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name *</label>
                <input
                  name="last_name"
                  className="input-field"
                  required
                  placeholder="Your last name"
                  defaultValue={displayName.split(' ').slice(1).join(' ') || ''}
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input name="dob" type="date" className="input-field" />
              </div>
              <div className="form-group">
                <label className="form-label">Gender</label>
                <select name="gender" className="select-field" defaultValue="">
                  <option value="">--</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div style={{
              background: 'var(--color-surface-offset, #f8fafc)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              margin: '1rem 0',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-tx-muted)',
              lineHeight: 1.6,
            }}>
              Your health data is private and encrypted. Only you and people you invite can see it.
              You can add family members and doctors later.
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>
              {saving ? 'Creating...' : 'Create My Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
