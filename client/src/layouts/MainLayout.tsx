import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header';
import { palette } from '../styles/theme';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3000' : '');

const PING_INTERVAL_MS = 14 * 60 * 1000;

export default function MainLayout() {
  useEffect(() => {
    const ping = () => fetch(`${API_BASE_URL}/health`).catch(() => {});
    void ping();
    const id = setInterval(() => void ping(), PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: palette.background,
        transition: 'background var(--transition-slow)',
      }}
    >
      <Header />
      <main
        style={{
          flex: 1,
          padding: '32px clamp(16px, 5vw, 48px)',
          transition: 'background var(--transition-slow)',
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
