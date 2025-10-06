import { palette, radii, shadows, transitions } from '../styles/theme';

export default function AdminReportsPage() {
  return (
    <main
      style={{
        padding: '64px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div
        className="spotz-card"
        style={{
          padding: '32px 40px',
          maxWidth: '520px',
          width: '100%',
          borderRadius: radii.xl,
          boxShadow: shadows.soft,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'center',
          transition: transitions.base,
        }}
      >
        <h2 style={{ margin: 0, fontSize: '32px', color: palette.textPrimary }}>
          Admin Reports
        </h2>
        <p style={{ margin: 0, color: palette.textSecondary }}>
          Review platform analytics and moderation reports.
        </p>
      </div>
    </main>
  );
}
