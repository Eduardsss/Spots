import { FormEvent, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '../lib/api';
import { palette, radii, shadows } from '../styles/theme';

type SpotCommentsUser = {
  id: number;
  username: string;
  role: string;
  profile_image?: string | null;
};

type SpotComment = {
  id: number;
  content: string;
  created_at: string;
  user: {
    id: number;
    username: string;
    profile_image: string | null;
  };
};

type CommentsResponse = {
  comments: SpotComment[];
};

type CreateCommentResponse = {
  comment: SpotComment;
};

type SpotCommentsProps = {
  spotId: number;
  currentUser: SpotCommentsUser | null;
  canComment: boolean;
  variant?: 'default' | 'compact';
  maxHeight?: number;
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

function SpotComments({
  spotId,
  currentUser,
  canComment,
  variant = 'default',
  maxHeight,
}: SpotCommentsProps) {
  const [comments, setComments] = useState<SpotComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [reportTarget, setReportTarget] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    let active = true;

    // Ielādējam komentārus katru reizi, kad mainās spota ID.
    async function loadComments() {
      setLoading(true);
      setError('');

      try {
        const response = await apiFetch(`/spots/${spotId}/comments`);

        if (!active) {
          return;
        }

        const data = response as CommentsResponse;
        setComments(data.comments);
      } catch (err) {
        if (!active) {
          return;
        }

        const message =
          err instanceof Error ? err.message : 'Neizdevās ielādēt komentārus.';
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadComments();

    return () => {
      active = false;
    };
  }, [spotId]);

  useEffect(() => {
    // Statusa paziņojumus rādam tikai dažas sekundes.
    if (!statusMessage) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const timeout = window.setTimeout(() => {
      setStatusMessage('');
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Neļaujam iesniegt tukšu formu vai klikšķināt pogu vairākas reizes.
    if (!canComment || submitting) {
      return;
    }

    const trimmed = formValue.trim();

    if (!trimmed) {
      setFormError('Komentāra teksts ir obligāts.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');

      const response = await apiFetch(`/spots/${spotId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });

      const data = response as CreateCommentResponse;
      setComments((current) => [...current, data.comment]);
      setFormValue('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Neizdevās pievienot komentāru.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (comment: SpotComment) => {
    // Administratori var dzēst komentārus – te apstrādājam pieprasījumu.
    if (!isAdmin) {
      return;
    }

    try {
      setDeleteTarget(comment.id);
      setError('');
      setStatusMessage('');
      await apiFetch(`/spots/${spotId}/comments/${comment.id}`, {
        method: 'DELETE',
      });

      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Neizdevās dzēst komentāru.';
      setError(message);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleReport = async (comment: SpotComment) => {
    // Ziņošana pieejama tikai pieslēgtajiem lietotājiem un ne uz saviem komentāriem.
    if (!currentUser) {
      setError('Lai ziņotu par komentāru, lūdzu, piesakies.');
      return;
    }

    if (currentUser.id === comment.user.id) {
      setError('Tu nevari ziņot par savu komentāru.');
      return;
    }

    const reason = window.prompt(
      'Pastāsti, kāpēc šis komentārs ir neatbilstošs (neobligāti):'
    );

    if (reason === null) {
      return;
    }

    try {
      setReportTarget(comment.id);
      setError('');
      setStatusMessage('');
      await apiFetch('/reports', {
        method: 'POST',
        body: {
          targetType: 'comment',
          targetId: comment.id,
          reason: reason.trim() ? reason.trim() : undefined,
        },
      });

      setStatusMessage('Ziņojums par komentāru nosūtīts moderatoriem.');
      setError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Neizdevās nosūtīt ziņojumu.';
      setError(message);
    } finally {
      setReportTarget(null);
    }
  };

  const headingStyle = useMemo(
    () => ({
      margin: 0,
      fontSize: variant === 'compact' ? '14px' : '16px',
      fontWeight: 600,
      color: palette.textPrimary,
      letterSpacing: '-0.01em',
    }),
    [variant]
  );

  const commentsWrapperStyle = useMemo(
    () => ({
      display: 'flex',
      flexDirection: 'column' as const,
      gap: variant === 'compact' ? '10px' : '12px',
      maxHeight: maxHeight ? `${maxHeight}px` : undefined,
      overflowY: maxHeight ? 'auto' : undefined,
      paddingRight: maxHeight ? '4px' : undefined,
    }),
    [maxHeight, variant]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: variant === 'compact' ? '12px' : '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <h4 style={headingStyle}>Komentāri</h4>
        {loading ? (
          <span style={{ fontSize: '12px', color: palette.textMuted }}>Ielādē…</span>
        ) : null}
      </div>

      {error ? (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: radii.md,
            background: palette.dangerSoft,
            color: palette.danger,
            fontSize: '13px',
            boxShadow: shadows.soft,
          }}
        >
          {error}
        </div>
      ) : null}

      {statusMessage ? (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: radii.md,
            background: palette.successSoft,
            color: palette.success,
            fontSize: '13px',
            boxShadow: shadows.soft,
          }}
        >
          {statusMessage}
        </div>
      ) : null}

      {loading && comments.length === 0 ? (
        <div
          style={{
            height: '60px',
            borderRadius: radii.md,
            background: palette.surfaceAlt,
          }}
        />
      ) : null}

      {!loading && comments.length === 0 && !error ? (
        <p style={{ margin: 0, fontSize: '13px', color: palette.textMuted }}>
          Šim spotam vēl nav komentāru.
        </p>
      ) : null}

      <div style={commentsWrapperStyle}>
        {comments.map((comment) => {
          const formattedDate = new Date(comment.created_at).toLocaleString(
            undefined,
            DATE_FORMAT
          );

          return (
            <div
              key={comment.id}
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                background: variant === 'compact' ? palette.surfaceAlt : palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: radii.md,
                padding: variant === 'compact' ? '10px 12px' : '12px 14px',
                boxShadow: variant === 'compact' ? 'none' : shadows.soft,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radii.full,
                  overflow: 'hidden',
                  background: palette.accentGradientSoft,
                  color: palette.accentStrong,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {comment.user.profile_image ? (
                  <img
                    src={comment.user.profile_image}
                    alt={comment.user.username}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  comment.user.username.slice(0, 1).toUpperCase()
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '10px',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: 600, color: palette.textPrimary }}>
                      {comment.user.username}
                    </span>
                    <span style={{ fontSize: '12px', color: palette.textMuted }}>
                      {formattedDate}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {currentUser && currentUser.id !== comment.user.id ? (
                      <button
                        type="button"
                        onClick={() => handleReport(comment)}
                        disabled={reportTarget === comment.id}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: palette.accentStrong,
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          opacity: reportTarget === comment.id ? 0.6 : 1,
                          transition: 'opacity 0.2s ease',
                        }}
                      >
                        Ziņot
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(comment)}
                        disabled={deleteTarget === comment.id}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: palette.danger,
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          opacity: deleteTarget === comment.id ? 0.6 : 1,
                          transition: 'opacity 0.2s ease',
                        }}
                      >
                        Dzēst
                      </button>
                    ) : null}
                  </div>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: palette.textSecondary,
                    fontSize: '14px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {comment.content}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {canComment ? (
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <textarea
            value={formValue}
            onChange={(event) => setFormValue(event.target.value)}
            placeholder="Dalies ar savu viedokli"
            rows={variant === 'compact' ? 2 : 3}
            style={{
              resize: 'vertical',
              minHeight: variant === 'compact' ? 60 : 80,
              borderRadius: radii.md,
              border: `1px solid ${palette.border}`,
              background: palette.surfaceAlt,
              color: palette.textPrimary,
              padding: '10px 12px',
              fontFamily: 'inherit',
              fontSize: '14px',
              lineHeight: 1.5,
              boxShadow: 'none',
              outline: 'none',
            }}
          />
          {formError ? (
            <span style={{ color: palette.danger, fontSize: '12px' }}>{formError}</span>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="spotz-btn"
              disabled={submitting}
              style={{
                padding: '8px 18px',
                borderRadius: radii.pill,
                background: palette.accentGradient,
                border: 'none',
                color: palette.accentContrast,
                fontWeight: 600,
                letterSpacing: '0.02em',
                boxShadow: shadows.soft,
                opacity: submitting ? 0.7 : 1,
                transition: 'opacity 0.2s ease, transform 0.2s ease',
                transform: submitting ? 'scale(0.98)' : 'scale(1)',
              }}
            >
              Pievienot
            </button>
          </div>
        </form>
      ) : (
        <p style={{ margin: 0, fontSize: '13px', color: palette.textMuted }}>
          Lai komentētu, lūdzu, piesakies savā kontā.
        </p>
      )}
    </div>
  );
}

export type { SpotCommentsUser, SpotComment };
export { SpotComments };
