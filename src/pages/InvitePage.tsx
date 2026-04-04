import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, UserPlus, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

interface InviteData {
  id: string;
  first_name: string;
  last_name: string;
  invite_status: string;
  owner_id: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, signInWithGoogle, initialized } = useAuthStore();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [inviterName, setInviterName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load invite data
  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error: fetchError } = await supabase
        .from('family_members')
        .select('id, first_name, last_name, invite_status, owner_id')
        .eq('invite_token', token)
        .single();

      if (fetchError || !data) {
        setError('This invite link is invalid or has expired.');
        setLoading(false);
        return;
      }

      if (data.invite_status === 'accepted') {
        setError('This invite has already been accepted.');
        setLoading(false);
        return;
      }

      setInvite(data);

      // Get inviter name
      if (data.owner_id) {
        const { data: ownerData } = await supabase
          .from('family_members')
          .select('first_name, last_name')
          .eq('owner_id', data.owner_id)
          .eq('auth_user_id', data.owner_id)
          .single();
        if (ownerData) {
          setInviterName(`${ownerData.first_name} ${ownerData.last_name}`);
        }
      }

      setLoading(false);
    })();
  }, [token]);

  // Auto-accept if already signed in
  useEffect(() => {
    if (session && invite && !accepting) {
      acceptInvite();
    }
  }, [session, invite]);

  const acceptInvite = async () => {
    if (!session || !invite) return;
    setAccepting(true);

    const { error: updateError } = await supabase
      .from('family_members')
      .update({
        auth_user_id: session.user.id,
        invite_status: 'accepted',
      })
      .eq('id', invite.id)
      .eq('invite_token', token);

    if (updateError) {
      toast.error('Failed to accept invite. Please try again.');
      setAccepting(false);
      return;
    }

    toast.success(`Welcome, ${invite.first_name}! Your account is set up.`);
    navigate('/dashboard');
  };

  const handleGoogleSignIn = async () => {
    // Store the token in localStorage so we can pick it up after redirect
    if (token) {
      localStorage.setItem('pending_invite_token', token);
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
          <p style={{ marginTop: '1rem', color: 'var(--color-tx-muted)' }}>Loading invite...</p>
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
          <p style={{ marginTop: '1rem', color: 'var(--color-tx-muted)' }}>Setting up your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <Heart size={56} className="login-logo" fill="var(--color-primary)" color="var(--color-primary)" />
        <h1 className="login-title">Ethos Reset</h1>
        <p className="login-subtitle">You've been invited to join a family health profile</p>

        <div className="login-card">
          <div style={{
            textAlign: 'center',
            padding: '1.5rem 0',
            marginBottom: '1rem',
          }}>
            <UserPlus size={36} style={{ color: 'var(--color-primary)', marginBottom: '0.75rem' }} />
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: '0 0 0.5rem' }}>
              Welcome, {invite?.first_name}!
            </h2>
            <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
              {inviterName ? `${inviterName} has` : 'Someone has'} created a health profile for you.
              Sign in to access your health dashboard.
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
