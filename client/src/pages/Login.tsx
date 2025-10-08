import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { palette, radii, shadows, transitions } from '../styles/theme';

type AuthUser = {
  id: number;
  username: string;
  role: string;
  profile_image?: string | null;
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

type LocationState = {
  from?: Location;
  registered?: boolean;
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? {};
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (typeof window !== 'undefined' && localStorage.getItem('token')) {
    const fromPath = state.from?.pathname ?? '/';
    return <Navigate to={fromPath} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const { token, user } = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { username, password },
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      }

      const redirectPath = state.from?.pathname ?? '/';
      navigate(redirectPath, { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Neizdevās pieteikties. Lūdzu, mēģini vēlreiz.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        alignItems: 'center',
        background: palette.background,
        display: 'flex',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        transition: `background ${transitions.slow}`,
      }}
    >
      <form
        className="spotz-card"
        style={{
          width: '100%',
          maxWidth: '420px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '36px',
          borderRadius: radii.xl,
          boxShadow: shadows.soft,
          backdropFilter: 'var(--backdrop-blur)',
        }}
        onSubmit={handleSubmit}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h1 style={{ margin: 0, fontSize: '28px', color: palette.textPrimary }}>Laipni lūgts atpakaļ</h1>
          <p style={{ margin: 0, color: palette.textSecondary }}>Piesakies savā kontā un turpini Spotz piedzīvojumus.</p>
        </div>

        {state.registered && !error ? (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: radii.md,
              fontSize: '14px',
              background: palette.successSoft,
              color: palette.success,
            }}
          >
            Reģistrācija veiksmīga! Lūdzu, piesakies.
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: radii.md,
              fontSize: '14px',
              background: palette.dangerSoft,
              color: palette.danger,
            }}
          >
            {error}
          </div>
        ) : null}

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
          Lietotājvārds
          <input
            className="spotz-input"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
          Parole
          <input
            className="spotz-input"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <button
          type="submit"
          className="spotz-btn spotz-btn--primary"
          style={{ padding: '12px 16px', borderRadius: radii.md, fontSize: '16px' }}
          disabled={submitting}
        >
          {submitting ? 'Piesakām…' : 'Pieteikties'}
        </button>

        <p style={{ margin: 0, color: palette.textSecondary, fontSize: '14px', textAlign: 'center' }}>
          Vēlies kontu?{' '}
          <Link
            to="/register"
            style={{ color: palette.accent, fontWeight: 600, textDecoration: 'none', transition: `color ${transitions.fast}` }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = palette.accentStrong;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = palette.accent;
            }}
          >
            Reģistrējies
          </Link>
        </p>
      </form>
    </div>
  );
}
