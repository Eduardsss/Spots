import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '../lib/api';
import { palette, radii, shadows, transitions } from '../styles/theme';

type AdminStats = {
  totalUsers: number;
  totalSpots: number;
  publicSpots: number;
  privateSpots: number;
  totalComments: number;
  pendingReports: number;
};

type RecentUser = {
  id: number;
  username: string;
  role: string;
  created_at: string;
};

type RecentSpot = {
  id: number;
  name: string;
  status: 'public' | 'private';
  created_at: string;
  owner: string;
};

type AdminOverviewResponse = {
  stats: AdminStats;
  recentUsers: RecentUser[];
  recentSpots: RecentSpot[];
};

type ReportedSpot = {
  name: string | null;
  status: 'public' | 'private' | null;
  owner: string | null;
};

type ReportedComment = {
  content: string | null;
  author: string | null;
};

type ReportItem = {
  id: number;
  targetType: 'spot' | 'comment';
  targetId: number;
  reason: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  reporter: string;
  spot: ReportedSpot | null;
  comment: ReportedComment | null;
};

type ReportsResponse = {
  reports: ReportItem[];
};

type ModerationItem = {
  id: number;
  content: string;
  created_at: string;
  spot_id: number;
  spot_name: string;
  author: string;
  reportCount: number;
  lastReportedAt: string;
};

type ModerationResponse = {
  comments: ModerationItem[];
};

type UpdateReportResponse = {
  success: boolean;
  status: 'pending' | 'resolved' | 'dismissed';
  targetType: 'spot' | 'comment';
  targetId: number;
  removed?: boolean;
};

const sectionCardStyle = {
  borderRadius: radii.xl,
  boxShadow: shadows.medium,
  border: `1px solid ${palette.border}`,
  background: palette.surface,
  padding: '28px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
} as const;

export default function AdminReportsPage() {
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState('');

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState('');

  const [moderationQueue, setModerationQueue] = useState<ModerationItem[]>([]);
  const [moderationLoading, setModerationLoading] = useState(true);
  const [moderationError, setModerationError] = useState('');

  const [actionMessage, setActionMessage] = useState('');
  const [processingReportId, setProcessingReportId] = useState<number | null>(null);
  const [processingCommentId, setProcessingCommentId] = useState<number | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('lv-LV', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  );

  const formatDateTime = useCallback(
    (value: string) => {
      try {
        return dateFormatter.format(new Date(value));
      } catch (error) {
        console.warn('Failed to format date', error);
        return value;
      }
    },
    [dateFormatter],
  );

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError('');

    try {
      const data = await apiFetch<AdminOverviewResponse>('/admin/overview');
      setOverview(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās ielādēt pārskatu.';
      setOverviewError(message);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError('');

    try {
      const data = await apiFetch<ReportsResponse>('/reports?status=pending');
      setReports(Array.isArray(data.reports) ? data.reports : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās ielādēt ziņojumus.';
      setReportsError(message);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const loadModerationQueue = useCallback(async () => {
    setModerationLoading(true);
    setModerationError('');

    try {
      const data = await apiFetch<ModerationResponse>('/admin/moderation/comments');
      setModerationQueue(Array.isArray(data.comments) ? data.comments : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās ielādēt moderācijas rindu.';
      setModerationError(message);
    } finally {
      setModerationLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadReports();
    loadModerationQueue();
  }, [loadOverview, loadReports, loadModerationQueue]);

  useEffect(() => {
    if (!actionMessage) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const timeout = window.setTimeout(() => setActionMessage(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [actionMessage]);

  const stats = overview?.stats;

  const handleReportAction = async (report: ReportItem, nextStatus: 'resolved' | 'dismissed') => {
    if (processingReportId !== null) {
      return;
    }

    setProcessingReportId(report.id);
    setReportsError('');
    setActionMessage('');

    try {
      const response = await apiFetch<UpdateReportResponse>(`/reports/${report.id}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });

      setReports((current) => current.filter((item) => item.id !== report.id));

      setOverview((current) => {
        if (!current || !current.stats) {
          return current;
        }

        const updatedStats: AdminStats = {
          ...current.stats,
          pendingReports: Math.max(0, current.stats.pendingReports - 1),
        };

        if (nextStatus === 'resolved' && response.removed) {
          if (report.targetType === 'spot') {
            updatedStats.totalSpots = Math.max(0, updatedStats.totalSpots - 1);

            if (report.spot?.status === 'public') {
              updatedStats.publicSpots = Math.max(0, updatedStats.publicSpots - 1);
            } else if (report.spot?.status === 'private') {
              updatedStats.privateSpots = Math.max(0, updatedStats.privateSpots - 1);
            }
          }

          if (report.targetType === 'comment') {
            updatedStats.totalComments = Math.max(0, updatedStats.totalComments - 1);
          }
        }

        return { ...current, stats: updatedStats };
      });

      if (nextStatus === 'resolved' && report.targetType === 'comment') {
        setModerationQueue((current) =>
          current.filter((item) => item.id !== report.targetId),
        );
      }

      setActionMessage(
        nextStatus === 'resolved'
          ? 'Ziņojums apstiprināts un saturs izdzēsts.'
          : 'Ziņojums noraidīts.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās atjaunināt ziņojumu.';
      setReportsError(message);
    } finally {
      setProcessingReportId(null);
    }
  };

  const handleRemoveComment = async (comment: ModerationItem) => {
    if (processingCommentId !== null) {
      return;
    }

    setProcessingCommentId(comment.id);
    setModerationError('');
    setActionMessage('');

    try {
      await apiFetch(`/admin/comments/${comment.id}`, { method: 'DELETE' });

      setModerationQueue((current) => current.filter((item) => item.id !== comment.id));

      setReports((current) =>
        current.filter(
          (report) => !(report.targetType === 'comment' && report.targetId === comment.id),
        ),
      );

      setOverview((current) => {
        if (!current || !current.stats) {
          return current;
        }

        const updatedStats: AdminStats = {
          ...current.stats,
          totalComments: Math.max(0, current.stats.totalComments - 1),
          pendingReports: Math.max(0, current.stats.pendingReports - comment.reportCount),
        };

        return { ...current, stats: updatedStats };
      });

      setActionMessage('Komentārs izdzēsts un ziņojumi atzīmēti kā atrisināti.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās dzēst komentāru.';
      setModerationError(message);
    } finally {
      setProcessingCommentId(null);
    }
  };

  return (
    <main
      style={{
        padding: '48px 24px 64px',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
        margin: '0 auto',
        maxWidth: '1100px',
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1 style={{ margin: 0, fontSize: '32px', color: palette.textPrimary }}>Admin panelis</h1>
        <p style={{ margin: 0, color: palette.textSecondary }}>
          Platformas pārskats, ziņojumi un komentāru moderācija.
        </p>
      </header>

      {actionMessage ? (
        <div
          className="spotz-card"
          style={{
            padding: '16px 20px',
            borderRadius: radii.lg,
            border: `1px solid rgba(34, 197, 94, 0.35)`,
            background: 'rgba(34, 197, 94, 0.12)',
            color: '#166534',
            fontWeight: 600,
          }}
        >
          {actionMessage}
        </div>
      ) : null}

      <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ ...sectionCardStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '22px', color: palette.textPrimary }}>Pārskats</h2>
            <button
              type="button"
              onClick={loadOverview}
              className="spotz-btn spotz-btn--ghost"
              style={{ padding: '8px 14px', borderRadius: radii.pill, fontSize: '14px' }}
            >
              Atsvaidzināt
            </button>
          </div>

          {overviewLoading ? (
            <p style={{ margin: 0, color: palette.textSecondary }}>Notiek ielāde…</p>
          ) : overviewError ? (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: radii.md,
                background: palette.dangerSoft,
                color: palette.danger,
              }}
            >
              {overviewError}
            </div>
          ) : stats ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gap: '16px',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                }}
              >
                {[{
                  label: 'Lietotāji kopā',
                  value: stats.totalUsers,
                },
                {
                  label: 'Spoti kopā',
                  value: stats.totalSpots,
                },
                {
                  label: 'Publiskie spoti',
                  value: stats.publicSpots,
                },
                {
                  label: 'Privātie spoti',
                  value: stats.privateSpots,
                },
                {
                  label: 'Komentāri kopā',
                  value: stats.totalComments,
                },
                {
                  label: 'Neapstrādāti ziņojumi',
                  value: stats.pendingReports,
                }].map((item) => (
                  <div
                    key={item.label}
                    className="spotz-card"
                    style={{
                      padding: '16px 18px',
                      borderRadius: radii.lg,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      background: palette.surfaceAlt,
                      border: `1px solid ${palette.border}`,
                      transition: transitions.base,
                    }}
                  >
                    <span style={{ color: palette.textMuted, fontSize: '13px' }}>{item.label}</span>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: palette.textPrimary }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: '16px',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                }}
              >
                <div
                  className="spotz-card"
                  style={{
                    padding: '20px',
                    borderRadius: radii.lg,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    border: `1px solid ${palette.border}`,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '18px', color: palette.textPrimary }}>
                    Jaunākie lietotāji
                  </h3>
                  {overview?.recentUsers?.length ? (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {overview.recentUsers.map((user) => (
                        <li key={user.id} style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: palette.textPrimary }}>
                            {user.username}
                          </span>
                          <span style={{ fontSize: '13px', color: palette.textMuted }}>
                            {user.role === 'admin' ? 'Administrators' : 'Lietotājs'} · {formatDateTime(user.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, color: palette.textSecondary }}>Nav nesenu lietotāju.</p>
                  )}
                </div>

                <div
                  className="spotz-card"
                  style={{
                    padding: '20px',
                    borderRadius: radii.lg,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    border: `1px solid ${palette.border}`,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '18px', color: palette.textPrimary }}>
                    Jaunākie spoti
                  </h3>
                  {overview?.recentSpots?.length ? (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {overview.recentSpots.map((spot) => (
                        <li key={spot.id} style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: palette.textPrimary }}>
                            {spot.name}
                          </span>
                          <span style={{ fontSize: '13px', color: palette.textMuted }}>
                            {spot.owner} · {spot.status === 'public' ? 'Publisks' : 'Privāts'} · {formatDateTime(spot.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, color: palette.textSecondary }}>Nav nesenu spotu.</p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ ...sectionCardStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '22px', color: palette.textPrimary }}>Ziņojumu rinda</h2>
            <button
              type="button"
              onClick={loadReports}
              className="spotz-btn spotz-btn--ghost"
              style={{ padding: '8px 14px', borderRadius: radii.pill, fontSize: '14px' }}
            >
              Atsvaidzināt
            </button>
          </div>

          {reportsLoading ? (
            <p style={{ margin: 0, color: palette.textSecondary }}>Notiek ziņojumu ielāde…</p>
          ) : reportsError ? (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: radii.md,
                background: palette.dangerSoft,
                color: palette.danger,
              }}
            >
              {reportsError}
            </div>
          ) : reports.length === 0 ? (
            <p style={{ margin: 0, color: palette.textSecondary }}>Nav jaunu ziņojumu.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="spotz-card"
                  style={{
                    padding: '18px 20px',
                    borderRadius: radii.lg,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    border: `1px solid ${palette.border}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: palette.textPrimary }}>
                        Ziņoja: {report.reporter}
                      </span>
                      <span style={{ fontSize: '13px', color: palette.textMuted }}>
                        {formatDateTime(report.created_at)}
                      </span>
                    </div>
                    <span
                      className="spotz-chip"
                      style={{
                        background: report.targetType === 'spot' ? palette.accentGradientSoft : palette.surfaceAlt,
                        color: report.targetType === 'spot' ? palette.accentStrong : palette.textPrimary,
                        border: `1px solid ${palette.border}`,
                        fontSize: '12px',
                      }}
                    >
                      {report.targetType === 'spot' ? 'Spots' : 'Komentārs'} #{report.targetId}
                    </span>
                  </div>

                  {report.reason ? (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: radii.md,
                        background: palette.surfaceAlt,
                        border: `1px solid ${palette.border}`,
                        fontSize: '14px',
                        color: palette.textSecondary,
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {report.reason}
                    </div>
                  ) : (
                    <span style={{ color: palette.textMuted, fontSize: '13px' }}>
                      Nav sniegts papildu skaidrojums.
                    </span>
                  )}

                  {report.targetType === 'spot' && report.spot ? (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: radii.md,
                        background: 'rgba(37, 99, 235, 0.08)',
                        border: `1px solid rgba(37, 99, 235, 0.2)`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        fontSize: '14px',
                      }}
                    >
                      <strong style={{ color: palette.textPrimary }}>{report.spot.name}</strong>
                      <span style={{ color: palette.textSecondary }}>
                        {report.spot.owner} · {report.spot.status === 'public' ? 'Publisks' : 'Privāts'}
                      </span>
                    </div>
                  ) : null}

                  {report.targetType === 'comment' && report.comment ? (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: radii.md,
                        background: 'rgba(248, 113, 113, 0.08)',
                        border: `1px solid rgba(248, 113, 113, 0.2)`,
                        fontSize: '14px',
                        color: palette.textSecondary,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <strong style={{ color: palette.textPrimary }}>{report.comment.author}</strong>
                      <span style={{ whiteSpace: 'pre-line' }}>{report.comment.content}</span>
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleReportAction(report, 'resolved')}
                      className="spotz-btn spotz-btn--primary"
                      style={{ padding: '10px 18px', borderRadius: radii.md }}
                      disabled={processingReportId === report.id}
                    >
                      Apstiprināt
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReportAction(report, 'dismissed')}
                      className="spotz-btn spotz-btn--outline"
                      style={{ padding: '10px 18px', borderRadius: radii.md }}
                      disabled={processingReportId === report.id}
                    >
                      Noraidīt
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
        <div style={{ ...sectionCardStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '22px', color: palette.textPrimary }}>Moderācijas rinda</h2>
            <button
              type="button"
              onClick={loadModerationQueue}
              className="spotz-btn spotz-btn--ghost"
              style={{ padding: '8px 14px', borderRadius: radii.pill, fontSize: '14px' }}
            >
              Atsvaidzināt
            </button>
          </div>

          {moderationLoading ? (
            <p style={{ margin: 0, color: palette.textSecondary }}>Notiek moderācijas rindas ielāde…</p>
          ) : moderationError ? (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: radii.md,
                background: palette.dangerSoft,
                color: palette.danger,
              }}
            >
              {moderationError}
            </div>
          ) : moderationQueue.length === 0 ? (
            <p style={{ margin: 0, color: palette.textSecondary }}>Nav ziņotu komentāru, kas gaida pārbaudi.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {moderationQueue.map((comment) => (
                <div
                  key={comment.id}
                  className="spotz-card"
                  style={{
                    padding: '18px 20px',
                    borderRadius: radii.lg,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    border: `1px solid ${palette.border}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: palette.textPrimary }}>
                        {comment.author}
                      </span>
                      <span style={{ fontSize: '13px', color: palette.textMuted }}>
                        Spots Nr. {comment.spot_id} · {comment.spot_name}
                      </span>
                    </div>
                    <span style={{ fontSize: '13px', color: palette.textMuted }}>
                      {comment.reportCount} ziņojumi · {formatDateTime(comment.lastReportedAt)}
                    </span>
                  </div>

                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: radii.md,
                      background: palette.surfaceAlt,
                      border: `1px solid ${palette.border}`,
                      fontSize: '14px',
                      whiteSpace: 'pre-line',
                      color: palette.textSecondary,
                    }}
                  >
                    {comment.content}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleRemoveComment(comment)}
                      className="spotz-btn spotz-btn--danger"
                      style={{ padding: '10px 18px', borderRadius: radii.md }}
                      disabled={processingCommentId === comment.id}
                    >
                      Dzēst komentāru
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
