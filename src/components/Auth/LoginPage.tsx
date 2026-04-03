import { useState, type FormEvent } from 'react';
import { Heart } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const { signIn, signUp, loading } = useAuthStore();
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
