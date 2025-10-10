import { Outlet } from 'react-router-dom';
import Header from '../components/Header';
import { palette } from '../styles/theme';

export default function MainLayout() {
  // Kopējais izkārtojums ar galveni un vietu bērnu lapām.
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
