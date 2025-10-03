import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ProfilePopup from './ProfilePopup';
import { palette, radii, transitions } from '../styles/theme';

type AuthUser = {
  id: number;
  username: string;
  role: string;
  profile_image?: string | null;
};

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  const stored = window.localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const stored = window.localStorage.getItem('user');
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored) as AuthUser;
    } catch (error) {
      console.warn('Failed to parse stored user', error);
      return null;
    }
  });
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'user') {
        if (event.newValue) {
          try {
            setUser(JSON.parse(event.newValue) as AuthUser);
          } catch (error) {
            console.warn('Failed to parse updated user from storage', error);
          }
        } else {
          setUser(null);
          setIsPopupOpen(false);
        }
      }
      if (event.key === 'token' && !event.newValue) {
        setUser(null);
        setIsPopupOpen(false);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    setIsPopupOpen(false);
  }, [location.pathname]);

  const navLinks = useMemo(() => {
    const links = [
      { path: '/map', label: 'Map' },
      { path: '/public', label: 'Public Spots' },
      { path: '/myspots', label: 'My Spots' },
    ];

    if (user?.role === 'admin') {
      links.push({ path: '/admin/reports', label: 'Reports' });
    }

    return links;
  }, [user?.role]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('user');
    }
    setUser(null);
    setIsPopupOpen(false);
    navigate('/login');
  };

  const handleUserUpdated = (updatedUser: AuthUser) => {
    setUser(updatedUser);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  const toggleTheme = () => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backdropFilter: 'var(--backdrop-blur)',
        background: palette.surfaceGlass,
        borderBottom: `1px solid ${palette.border}`,
        transition:
          'background var(--transition-slow), border-color var(--transition-slow), box-shadow var(--transition-slow)',
        boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)',
      }}
    >
      <div
        style={{
          margin: '0 auto',
          maxWidth: '1200px',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        <Link
          to="/"
          style={{
            fontWeight: 700,
            fontSize: '20px',
            textDecoration: 'none',
            color: palette.textPrimary,
            letterSpacing: '-0.01em',
            transition: `color ${transitions.fast}`,
          }}
        >
          Spotz
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`spotz-nav-link${location.pathname === link.path ? ' is-active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={toggleTheme}
            className="spotz-btn spotz-btn--outline"
            style={{
              padding: '8px 14px',
              fontSize: '14px',
              borderRadius: radii.pill,
              minWidth: '96px',
            }}
          >
            {theme === 'light' ? '🌞 Light' : '🌚 Dark'}
          </button>

          {user ? (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsPopupOpen((open) => !open)}
                className="spotz-avatar"
                style={{ padding: 0, borderRadius: radii.full, border: '2px solid rgba(37, 99, 235, 0.35)' }}
                aria-haspopup="dialog"
                aria-expanded={isPopupOpen}
              >
                {user.profile_image ? (
                  <img
                    src={user.profile_image}
                    alt={user.username}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  (user.username?.slice(0, 1) || '?').toUpperCase()
                )}
              </button>
              {isPopupOpen ? (
                <ProfilePopup
                  user={user}
                  onClose={() => setIsPopupOpen(false)}
                  onUserUpdated={handleUserUpdated}
                  onLogout={handleLogout}
                />
              ) : null}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link
                to="/login"
                className="spotz-btn spotz-btn--outline"
                style={{ padding: '8px 18px', fontSize: '14px' }}
              >
                Log in
              </Link>
              <Link
                to="/register"
                className="spotz-btn spotz-btn--primary"
                style={{ padding: '8px 20px', fontSize: '14px' }}
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
