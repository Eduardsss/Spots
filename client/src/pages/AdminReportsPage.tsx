import { useCallback, useEffect, useMemo, useState } from 'react';
import { SpotImageCarousel } from '../components/SpotImageCarousel';
import { apiFetch } from '../lib/api';
import { palette, radii, shadows } from '../styles/theme';

type SpotReport = {
  id: number;
  reason: string | null;
  status: 'pending' | 'resolved';
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
  spot: {
    id: number;
    name: string;
    status: 'public' | 'private';
    image: string | null;
    owner: {
      id: number;
      username: string;
      profile_image: string | null;
      is_blocked: boolean;
    };
  };
  reporter: {
    id: number;
    username: string;
    profile_image: string | null;
  };
};

type ReportsResponse = {
  reports: SpotReport[];
};

type ResolveAction = 'deleteSpot' | 'blockUser' | 'dismiss';

const formatDate = (value: string | null) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<SpotReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<ReportsResponse>('/spots/reports');
      setReports(response.reports ?? []);
    } catch (err) {
      console.error('Failed to load reports', err);
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const pendingReports = useMemo(
    () => reports.filter((report) => report.status === 'pending'),
    [reports]
  );
  const resolvedReports = useMemo(
    () => reports.filter((report) => report.status === 'resolved'),
    [reports]
  );

  const handleResolve = async (reportId: number, action: ResolveAction) => {
    setActionLoading(reportId);
    try {
      await apiFetch(`/spots/reports/${reportId}/resolve`, {
        method: 'POST',
        body: { action },
      });
      await fetchReports();
    } catch (err) {
      console.error('Failed to resolve report', err);
      window.alert('Failed to process report. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const renderReportCard = (report: SpotReport, isPending: boolean) => {
    const isResolving = actionLoading === report.id;
    const ownerBlocked = report.spot.owner.is_blocked;
    const imageList = report.spot.image ? [report.spot.image] : [];

    return (
      <article
        key={report.id}
        className="spotz-card"
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '24px',
          padding: '24px',
          borderRadius: radii.xl,
          border: `1px solid ${palette.border}`,
          boxShadow: shadows.soft,
          background: palette.surface,
        }}
      >
        <div style={{ width: '220px', flexShrink: 0 }}>
          <SpotImageCarousel images={imageList} height={200} borderRadius={radii.lg} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '14px', color: palette.textMuted }}>Report #{report.id}</span>
              <h3 style={{ margin: 0, fontSize: '22px', color: palette.textPrimary }}>{report.spot.name}</h3>
              <span style={{ fontSize: '13px', color: palette.textSecondary }}>
                Status: {report.spot.status === 'public' ? 'Public' : 'Private'} · Owner {report.spot.owner.username}
                {ownerBlocked ? ' (blocked)' : ''}
              </span>
            </div>
            <div
              style={{
                padding: '6px 12px',
                borderRadius: radii.pill,
                background:
                  report.status === 'pending'
                    ? 'linear-gradient(135deg, rgba(248, 113, 113, 0.18), rgba(239, 68, 68, 0.28))'
                    : palette.surfaceAlt,
                color: report.status === 'pending' ? palette.danger : palette.textSecondary,
                fontWeight: 600,
                alignSelf: 'flex-start',
              }}
            >
              {report.status === 'pending'
                ? 'Pending review'
                : `Resolved (${report.resolution ?? 'dismissed'})`}
            </div>
          </header>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong style={{ fontSize: '14px', color: palette.textPrimary }}>Reason</strong>
              <span style={{ color: palette.textSecondary }}>
                {report.reason?.length ? report.reason : 'No additional details provided.'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong style={{ fontSize: '14px', color: palette.textPrimary }}>Reported by</strong>
                <span style={{ color: palette.textSecondary }}>{report.reporter.username}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong style={{ fontSize: '14px', color: palette.textPrimary }}>Created</strong>
                <span style={{ color: palette.textSecondary }}>{formatDate(report.created_at)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong style={{ fontSize: '14px', color: palette.textPrimary }}>Resolved</strong>
                <span style={{ color: palette.textSecondary }}>{formatDate(report.resolved_at)}</span>
              </div>
            </div>
          </div>

          {isPending ? (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: 'auto' }}>
              <button
                type="button"
                onClick={() => handleResolve(report.id, 'deleteSpot')}
                disabled={isResolving}
                className="spotz-btn spotz-btn--danger"
                style={{ padding: '10px 18px', borderRadius: radii.pill }}
              >
                {isResolving ? 'Working…' : 'Delete spot'}
              </button>
              <button
                type="button"
                onClick={() => handleResolve(report.id, 'blockUser')}
                disabled={isResolving || ownerBlocked}
                className="spotz-btn spotz-btn--outline"
                style={{ padding: '10px 18px', borderRadius: radii.pill, opacity: ownerBlocked ? 0.6 : 1 }}
              >
                {ownerBlocked ? 'User blocked' : 'Block user'}
              </button>
              <button
                type="button"
                onClick={() => handleResolve(report.id, 'dismiss')}
                disabled={isResolving}
                className="spotz-btn"
                style={{ padding: '10px 18px', borderRadius: radii.pill }}
              >
                {isResolving ? 'Working…' : 'Dismiss'}
              </button>
            </div>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <main
      style={{
        padding: '48px clamp(16px, 5vw, 72px) 88px',
        background: palette.background,
        minHeight: 'calc(100vh - 72px)',
        transition: 'background var(--transition-slow)',
      }}
    >
      <section
        style={{
          margin: '0 auto',
          maxWidth: '1100px',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '34px', color: palette.textPrimary }}>Spot reports</h1>
            <p style={{ margin: '8px 0 0', color: palette.textSecondary }}>
              Review community reports, remove inappropriate content, or block abusive users.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchReports}
            className="spotz-btn spotz-btn--outline"
            style={{ padding: '10px 20px', borderRadius: radii.pill }}
          >
            Refresh
          </button>
        </header>

        {loading ? (
          <div
            style={{
              padding: '80px 0',
              textAlign: 'center',
              color: palette.textSecondary,
              fontSize: '18px',
            }}
          >
            Loading reports…
          </div>
        ) : error ? (
          <div
            role="alert"
            style={{
              padding: '20px 24px',
              borderRadius: radii.lg,
              background: palette.dangerSoft,
              color: palette.danger,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        ) : reports.length === 0 ? (
          <div
            className="spotz-card"
            style={{
              padding: '64px 24px',
              textAlign: 'center',
              borderRadius: radii.xl,
              border: `1px dashed ${palette.border}`,
              background: palette.surface,
            }}
          >
            <h2 style={{ margin: 0, fontSize: '24px', color: palette.textPrimary }}>No reports 🎉</h2>
            <p style={{ margin: '12px 0 0', color: palette.textSecondary }}>
              The community hasn’t flagged any spots yet.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {pendingReports.length ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '24px', color: palette.textPrimary }}>Pending review</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {pendingReports.map((report) => renderReportCard(report, true))}
                </div>
              </section>
            ) : null}

            {resolvedReports.length ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '24px', color: palette.textPrimary }}>Recently resolved</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {resolvedReports.map((report) => renderReportCard(report, false))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
