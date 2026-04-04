import { useState, type FormEvent } from 'react';
import { Heart } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const { signIn, signInWithGoogle, signUp, loading } = useAuthStore();
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = fd.get('email') as string;
    const password = fd.get('password') as string;

    if (isSignUp) {
      const name = fd.get('name') as string;
      const result = await signUp(email, password, name);
      if (result.error) setError(result.error);
    } else {
      const result = await signIn(email, password);
      if (result.error) setError(result.error);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <Heart size={56} className="login-logo" fill="var(--color-primary)" color="var(--color-primary)" />
        <h1 className="login-title">Family Health Tracker</h1>
        <p className="login-subtitle">
          {isSignUp ? 'Create your account' : 'Sign in to your account'}
        </p>

        <div className="login-card">
          <button
            type="button"
            onClick={async () => {
              setError(null);
              const result = await signInWithGoogle();
              if (result.error) setError(result.error);
            }}
            disabled={loading}
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
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-offset, #f8fafc)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface, #fff)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            margin: '1.25rem 0',
            color: 'var(--color-tx-muted, #94a3b8)',
            fontSize: 'var(--text-xs, 0.75rem)',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--color-divider, #e2e8f0)' }} />
            <span>or</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--color-divider, #e2e8f0)' }} />
          </div>

          <form onSubmit={handleSubmit}>
            {isSignUp && (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input name="name" className="input-field" required placeholder="Your name" />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Email</label>
              <input name="email" type="email" className="input-field" required placeholder="you@example.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input name="password" type="password" className="input-field" required minLength={6} placeholder="Min 6 characters" />
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: 'var(--text-sm)', color: 'var(--color-tx-muted)' }}>
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 500 }}
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
