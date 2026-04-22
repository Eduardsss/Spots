import { useEffect, useMemo, useRef, useState } from 'react';
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
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem('user');
    if (!stored) return null;
    try { return JSON.parse(stored) as AuthUser; } catch { return null; }
  });

  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
    if (typeof window === 'undefined') return undefined;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'user') {
        if (event.newValue) {
          try { setUser(JSON.parse(event.newValue) as AuthUser); } catch { /* ignore */ }
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
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    setIsPopupOpen(false);
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);

  const navLinks = useMemo(() => [
    { path: '/map', label: 'Karte' },
    { path: '/public', label: 'Publiskie spoti' },
    { path: '/myspots', label: 'Mani spoti' },
    { path: '/collections', label: 'Kolekcijas' },
  ], []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('user');
    }
    setUser(null);
    setIsPopupOpen(false);
    setIsMobileMenuOpen(false);
    navigate('/login');
  };

  const handleUserUpdated = (updatedUser: AuthUser) => {
    setUser(updatedUser);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  const toggleTheme = () => setTheme((c) => (c === 'light' ? 'dark' : 'light'));

  return (
    <>
      <style>{`
        .spotz-header-nav { display: flex; align-items: center; gap: 4px; flex: 1; }
        .spotz-header-actions { display: flex; align-items: center; gap: 10px; }
        .spotz-hamburger { display: none; }
        .spotz-mobile-menu { display: none; }

        @media (max-width: 768px) {
          .spotz-header-nav { display: none; }
          .spotz-header-actions { display: none; }
          .spotz-hamburger { display: flex; }
          .spotz-mobile-menu { display: flex; }
        }
      `}</style>

      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'var(--backdrop-blur)',
          background: palette.surfaceGlass,
          borderBottom: `1px solid ${palette.border}`,
          transition: 'background var(--transition-slow), border-color var(--transition-slow)',
          boxShadow: '0 4px 20px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div
          style={{
            margin: '0 auto',
            maxWidth: '1200px',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {/* Logo */}
          <Link
            to="/"
            style={{
              fontWeight: 800,
              fontSize: '22px',
              textDecoration: 'none',
              color: palette.textPrimary,
              letterSpacing: '-0.02em',
              flexShrink: 0,
            }}
          >
            Spotz
          </Link>

          {/* Desktop nav */}
          <nav className="spotz-header-nav">
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

          {/* Desktop actions */}
          <div className="spotz-header-actions">
            <button
              type="button"
              onClick={toggleTheme}
              className="spotz-btn spotz-btn--outline"
              style={{ padding: '7px 12px', fontSize: '13px', borderRadius: radii.pill }}
            >
              {theme === 'light' ? '🌞' : '🌚'}
            </button>

            {user ? (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsPopupOpen((o) => !o)}
                  className="spotz-avatar"
                  style={{ padding: 0, borderRadius: radii.full, border: '2px solid rgba(37, 99, 235, 0.35)' }}
                  aria-haspopup="dialog"
                  aria-expanded={isPopupOpen}
                >
                  {user.profile_image ? (
                    <img src={user.profile_image} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    (user.username?.slice(0, 1) || '?').toUpperCase()
                  )}
                </button>
                {isPopupOpen && (
                  <ProfilePopup user={user} onClose={() => setIsPopupOpen(false)} onUserUpdated={handleUserUpdated} onLogout={handleLogout} />
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link to="/login" className="spotz-btn spotz-btn--outline" style={{ padding: '7px 16px', fontSize: '14px' }}>Ienākt</Link>
                <Link to="/register" className="spotz-btn spotz-btn--primary" style={{ padding: '7px 16px', fontSize: '14px' }}>Reģistrēties</Link>
              </div>
            )}
          </div>

          {/* Mobile: right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }} ref={menuRef}>
            {/* Mobile avatar when logged in */}
            <div className="spotz-hamburger" style={{ alignItems: 'center', gap: '8px' }}>
              {user && (
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setIsPopupOpen((o) => !o)}
                    className="spotz-avatar"
                    style={{ padding: 0, width: 36, height: 36, fontSize: 14, border: '2px solid rgba(37, 99, 235, 0.35)', borderRadius: radii.full }}
                  >
                    {user.profile_image ? (
                      <img src={user.profile_image} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      (user.username?.slice(0, 1) || '?').toUpperCase()
                    )}
                  </button>
                  {isPopupOpen && (
                    <ProfilePopup user={user} onClose={() => setIsPopupOpen(false)} onUserUpdated={handleUserUpdated} onLogout={handleLogout} />
                  )}
                </div>
              )}

              {/* Hamburger button */}
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen((o) => !o)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${palette.border}`,
                  borderRadius: radii.md,
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                  cursor: 'pointer',
                }}
                aria-label="Izvēlne"
              >
                <span style={{ width: 20, height: 2, background: palette.textPrimary, borderRadius: 2, display: 'block', transition: `transform ${transitions.fast}`, transform: isMobileMenuOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none' }} />
                <span style={{ width: 20, height: 2, background: palette.textPrimary, borderRadius: 2, display: 'block', opacity: isMobileMenuOpen ? 0 : 1, transition: `opacity ${transitions.fast}` }} />
                <span style={{ width: 20, height: 2, background: palette.textPrimary, borderRadius: 2, display: 'block', transition: `transform ${transitions.fast}`, transform: isMobileMenuOpen ? 'rotate(-45deg) translate(5px, -5px)' : 'none' }} />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {isMobileMenuOpen && (
          <div
            className="spotz-mobile-menu"
            style={{
              flexDirection: 'column',
              borderTop: `1px solid ${palette.border}`,
              background: palette.surfaceGlass,
              backdropFilter: 'var(--backdrop-blur)',
              padding: '12px 20px 20px',
              gap: '4px',
            }}
          >
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`spotz-nav-link${location.pathname === link.path ? ' is-active' : ''}`}
                style={{ padding: '12px 16px', fontSize: '15px', fontWeight: 500 }}
              >
                {link.label}
              </Link>
            ))}

            <div style={{ borderTop: `1px solid ${palette.border}`, marginTop: '8px', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={toggleTheme}
                className="spotz-btn spotz-btn--outline"
                style={{ width: '100%', padding: '10px', fontSize: '14px' }}
              >
                {theme === 'light' ? '🌞 Gaišs režīms' : '🌚 Tumšs režīms'}
              </button>

              {!user && (
                <>
                  <Link to="/login" className="spotz-btn spotz-btn--outline" style={{ width: '100%', padding: '11px', fontSize: '15px' }}>Ienākt</Link>
                  <Link to="/register" className="spotz-btn spotz-btn--primary" style={{ width: '100%', padding: '11px', fontSize: '15px' }}>Reģistrēties</Link>
                </>
              )}

              {user && (
                <button type="button" onClick={handleLogout} className="spotz-btn spotz-btn--danger" style={{ width: '100%', padding: '11px', fontSize: '15px' }}>
                  Iziet
                </button>
              )}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
