import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { palette, radii, shadows, transitions } from '../styles/theme';

// Reģistrācijas forma jauniem lietotājiem ar paroles pārbaudi.
export default function Register() {
  const navigate = useNavigate();
  // Formas lauki un validācijas stāvokļi reģistrācijas procesam.
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    // Validējam paroles sakritību un nosūtām datus uz API.
    event.preventDefault();

    if (password !== confirmPassword) {
      setError('Paroles nesakrīt.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: { username, password },
      });

      navigate('/login', { state: { registered: true } });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Neizdevās reģistrēties. Lūdzu, mēģini vēlreiz.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Karte-stila forma ar laukiem reģistrācijai un saiti uz pieteikšanos.
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
          <h1 style={{ margin: 0, fontSize: '28px', color: palette.textPrimary }}>Izveido jaunu kontu</h1>
          <p style={{ margin: 0, color: palette.textSecondary }}>
            Pievienojies Spotz kopienai un sāc atklāt jaunus piedzīvojumus.
          </p>
        </div>

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
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
          Apstiprini paroli
          <input
            className="spotz-input"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
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
          {submitting ? 'Veidojam kontu…' : 'Izveidot kontu'}
        </button>

        <p style={{ margin: 0, color: palette.textSecondary, fontSize: '14px', textAlign: 'center' }}>
          Jau ir konts?{' '}
          <Link
            to="/login"
            style={{ color: palette.accent, fontWeight: 600, textDecoration: 'none', transition: `color ${transitions.fast}` }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = palette.accentStrong;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = palette.accent;
            }}
          >
            Piesakies
          </Link>
        </p>
      </form>
    </div>
  );
}
