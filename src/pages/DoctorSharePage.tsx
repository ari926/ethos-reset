import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, Stethoscope, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

interface DoctorData {
  id: string;
  full_name: string | null;
  name: string | null;
  email: string;
  status: string;
}

export default function DoctorSharePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, signInWithGoogle, initialized } = useAuthStore();
  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load doctor data from share token
  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error: fetchError } = await supabase
        .from('doctors')
        .select('id, full_name, name, email, status')
        .eq('share_token', token)
        .single();

      if (fetchError || !data) {
        setError('This share link is invalid or has expired.');
        setLoading(false);
        return;
      }

      if (data.status === 'revoked') {
        setError('Access has been revoked for this share link.');
        setLoading(false);
        return;
      }

      setDoctor(data);
      setLoading(false);
    })();
  }, [token]);

  // Auto-accept if already signed in
  useEffect(() => {
    if (session && doctor && !accepting) {
      acceptDoctorInvite();
    }
  }, [session, doctor]);

  const acceptDoctorInvite = async () => {
    if (!session || !doctor) return;
    setAccepting(true);

    // Link the doctor record to this auth user
    const { error: updateError } = await supabase
      .from('doctors')
      .update({
        auth_user_id: session.user.id,
        status: 'active',
      })
      .eq('id', doctor.id);

    if (updateError) {
      toast.error('Failed to set up doctor access. Please try again.');
      setAccepting(false);
      return;
    }

    toast.success('Welcome! You now have access to patient health data.');
    navigate('/dashboard');
  };

  const handleGoogleSignIn = async () => {
    if (token) {
      localStorage.setItem('pending_doctor_token', token);
    }
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
    }
  };

  if (loading || !initialized) {
    return (
      <div className="login-page">
        <div className="login-container">
          <Loader size={32} className="spin" style={{ color: 'var(--color-primary)' }} />
          <p style={{ marginTop: '1rem', color: 'var(--color-tx-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="login-page">
        <div className="login-container">
          <Heart size={56} className="login-logo" fill="var(--color-primary)" color="var(--color-primary)" />
          <h1 className="login-title">Ethos Reset</h1>
          <div className="login-card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (accepting) {
    return (
      <div className="login-page">
        <div className="login-container">
          <Loader size={32} className="spin" style={{ color: 'var(--color-primary)' }} />
          <p style={{ marginTop: '1rem', color: 'var(--color-tx-muted)' }}>Setting up your access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <Heart size={56} className="login-logo" fill="var(--color-primary)" color="var(--color-primary)" />
        <h1 className="login-title">Ethos Reset</h1>
        <p className="login-subtitle">Doctor Portal Access</p>

        <div className="login-card">
          <div style={{
            textAlign: 'center',
            padding: '1.5rem 0',
            marginBottom: '1rem',
          }}>
            <Stethoscope size={36} style={{ color: 'var(--color-primary)', marginBottom: '0.75rem' }} />
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: '0 0 0.5rem' }}>
              Welcome, Doctor
            </h2>
            <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
              A patient has granted you access to their health data.
              Sign in to view their full health dashboard, reports, and lab results.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              padding: '0.7rem 1rem',
              background: 'var(--color-surface, #fff)',
              border: '1px solid var(--color-divider, #e2e8f0)',
              borderRadius: 'var(--radius-md, 8px)',
              cursor: 'pointer',
              fontSize: 'var(--text-sm, 0.875rem)',
              fontWeight: 500,
              color: 'var(--color-tx, #1a1a2e)',
              transition: 'background 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-offset, #f8fafc)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface, #fff)'; }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
