import { useEffect, useMemo, useState } from 'react';
import { SpotComments } from '../components/SpotComments';
import { apiFetch } from '../lib/api';
import { palette, radii, shadows } from '../styles/theme';

type AuthUser = {
  id: number;
  username: string;
  role: string;
  profile_image?: string | null;
};

type Spot = {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  image: string | null;
  status: 'public' | 'private';
  likesCount: number;
  likedByCurrentUser?: boolean;
  tags: string[];
};

type SpotsResponse = {
  spots: Spot[];
};

type SortOption = 'latest' | 'mostLiked';

type SpotCardProps = {
  spot: Spot;
  canLike: boolean;
  canDelete: boolean;
  isDeleting: boolean;
  onToggleLike: (spot: Spot) => void;
  onDelete: (spot: Spot) => void;
  currentUser: AuthUser | null;
};

function parseStoredUser(): AuthUser | null {
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
}

function SpotCard({
  spot,
  canLike,
  canDelete,
  isDeleting,
  onToggleLike,
  onDelete,
  currentUser,
}: SpotCardProps) {
  const [showComments, setShowComments] = useState(false);
  const canComment = Boolean(currentUser);
  const toggleLabel = showComments ? 'Slēpt komentārus' : 'Skatīt komentārus';

  return (
    <article
      className="spotz-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: radii.lg,
        overflow: 'hidden',
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        boxShadow: shadows.soft,
      }}
    >
      {spot.image ? (
        <img
          src={spot.image}
          alt={spot.name}
          style={{
            width: '100%',
            height: '200px',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            height: '200px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(29, 78, 216, 0.24))',
            color: palette.textSecondary,
            fontWeight: 600,
            letterSpacing: '0.08em',
          }}
        >
          Spotz
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px 22px 24px',
          flex: 1,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3
            style={{
              margin: 0,
              fontSize: '20px',
              color: palette.textPrimary,
              letterSpacing: '-0.01em',
            }}
          >
            {spot.name}
          </h3>
          {spot.description ? (
            <p style={{ margin: 0, color: palette.textSecondary, lineHeight: 1.6 }}>
              {spot.description}
            </p>
          ) : (
            <p style={{ margin: 0, color: palette.textMuted, fontStyle: 'italic' }}>
              No description provided.
            </p>
          )}
        </div>

        {spot.tags.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {spot.tags.map((tag) => (
              <span
                key={tag}
                className="spotz-chip"
                style={{
                  background: palette.surfaceAlt,
                  color: palette.accentStrong,
                  border: `1px solid ${palette.border}`,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 'auto',
            gap: '12px',
          }}
        >
          <div
            className="spotz-chip"
            style={{ background: palette.accentGradientSoft, color: palette.accentStrong }}
          >
            <span aria-hidden="true">❤️</span>
            <span>{spot.likesCount}</span>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {canLike && (
              <button
                type="button"
                onClick={() => onToggleLike(spot)}
                disabled={isDeleting}
                className="spotz-btn"
                style={{
                  padding: '8px 18px',
                  borderRadius: radii.pill,
                  border: `1px solid ${palette.border}`,
                  background: spot.likedByCurrentUser
                    ? 'linear-gradient(135deg, rgba(248, 113, 113, 0.28), rgba(239, 68, 68, 0.35))'
                    : palette.surfaceAlt,
                  color: palette.danger,
                  opacity: isDeleting ? 0.6 : 1,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                }}
              >
                {spot.likedByCurrentUser ? 'Unlike' : 'Like'}
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(spot)}
                disabled={isDeleting}
                className="spotz-btn spotz-btn--danger"
                style={{ padding: '8px 16px', borderRadius: radii.md, opacity: isDeleting ? 0.6 : 1 }}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            type="button"
            onClick={() => setShowComments((value) => !value)}
            className="spotz-btn spotz-btn--outline"
            style={{
              padding: '8px 14px',
              borderRadius: radii.md,
              border: `1px solid ${palette.border}`,
              background: palette.surfaceAlt,
              color: palette.textSecondary,
            }}
          >
            {toggleLabel}
          </button>
        </div>

        {showComments ? (
          <div
            style={{
              borderTop: `1px solid ${palette.border}`,
              paddingTop: '16px',
            }}
          >
            <SpotComments
              spotId={spot.id}
              currentUser={currentUser}
              canComment={canComment}
              maxHeight={220}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function PublicSpotsPage() {
  const [user, setUser] = useState<AuthUser | null>(() => parseStoredUser());
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  the [sort, setSort] = useState<SortOption>('latest');
  const [deletingSpotId, setDeletingSpotId] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'user') {
        if (event.newValue) {
          try {
            setUser(JSON.parse(event.newValue) as AuthUser);
          } catch (err) {
            console.warn('Failed to parse user from storage', err);
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }

      if (event.key === 'token' && !event.newValue) {
        setUser(null);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim().length > 0) {
      params.set('q', search.trim());
    }
    if (sort) {
      params.set('sort', sort);
    }
    const query = params.toString();
    return query ? `?${query}` : '';
  }, [search, sort]);

  useEffect(() => {
    let isCancelled = false;

    const loadSpots = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch<SpotsResponse>(`/spots${queryString}`);
        if (isCancelled) {
          return;
        }
        setSpots(response.spots.filter((spot) => spot.status === 'public'));
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to load public spots', err);
          setError('Failed to load public spots. Please try again later.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadSpots();

    return () => {
      isCancelled = true;
    };
  }, [queryString]);

  const handleToggleLike = async (spot: Spot) => {
    if (!user) {
      return;
    }

    const optimisticLiked = !spot.likedByCurrentUser;
    const likeDelta = optimisticLiked ? 1 : -1;

    setSpots((current) =>
      current.map((item) =>
        item.id === spot.id
          ? {
              ...item,
              likedByCurrentUser: optimisticLiked,
              likesCount: Math.max(0, item.likesCount + likeDelta),
            }
          : item,
      ),
    );

    try {
      if (optimisticLiked) {
        await apiFetch(`/spots/${spot.id}/like`, { method: 'POST' });
      } else {
        await apiFetch(`/spots/${spot.id}/like`, { method: 'DELETE' });
      }
    } catch (err) {
      console.error('Failed to toggle like', err);
      setSpots((current) =>
        current.map((item) =>
          item.id === spot.id
            ? {
                ...item,
                likedByCurrentUser: spot.likedByCurrentUser ?? false,
                likesCount: spot.likesCount,
              }
            : item,
        ),
      );
    }
  };

  const handleDeleteSpot = async (spot: Spot) => {
    if (!user || user.role !== 'admin') {
      return;
    }

    const confirmed = window.confirm(`Delete "${spot.name}"? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    const previousSpots = [...spots];
    setDeletingSpotId(spot.id);
    setError(null);
    setSpots((current) => current.filter((item) => item.id !== spot.id));

    try {
      await apiFetch(`/spots/${spot.id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete spot', err);
      setError('Failed to delete spot. Please try again later.');
      setSpots(previousSpots);
    } finally {
      setDeletingSpotId(null);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <main
      style={{
        padding: '64px clamp(16px, 5vw, 72px) 88px',
        background: palette.background,
        minHeight: 'calc(100vh - 72px)',
        transition: 'background var(--transition-slow)',
      }}
    >
      <section
        style={{
          margin: '0 auto',
          maxWidth: '1200px',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
        }}
      >
        <header style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p
            style={{
              margin: 0,
              fontSize: '14px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: palette.accent,
              fontWeight: 700,
            }}
          >
            Discover
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: '40px',
              color: palette.textPrimary,
              letterSpacing: '-0.02em',
            }}
          >
            Public Spots Shared by the Community
          </h1>
          <p style={{ margin: 0, color: palette.textSecondary, maxWidth: '720px', lineHeight: 1.7 }}>
            Browse a curated collection of scenic places shared by adventurers around
            the world. Use the search and sorting options to quickly find the perfect
            spot for your next outing.
          </p>
        </header>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            alignItems: 'stretch',
            justifyContent: 'space-between',
            background: palette.surface,
            padding: '20px',
            borderRadius: radii.lg,
            border: `1px solid ${palette.border}`,
            boxShadow: shadows.soft,
          }}
        >
          <label style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: palette.textSecondary, fontWeight: 600 }}>Search</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by spot name..."
              className="spotz-input"
            />
          </label>

          <label style={{ width: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: palette.textSecondary, fontWeight: 600 }}>Sort by</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              className="spotz-input"
              style={{ cursor: 'pointer' }}
            >
              <option value="latest">Latest</option>
              <option value="mostLiked">Most liked</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div
            style={{
              padding: '80px 0',
              textAlign: 'center',
              color: palette.textSecondary,
              fontSize: '18px',
            }}
          >
            Loading public spots...
          </div>
        ) : error ? (
          <div
            role="alert"
            style={{
              padding: '24px',
              borderRadius: radii.lg,
              background: palette.dangerSoft,
              color: palette.danger,
              border: `1px solid ${palette.border}`,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        ) : spots.length === 0 ? (
          <div
            style={{
              padding: '80px 0',
              textAlign: 'center',
              color: palette.textSecondary,
              fontSize: '18px',
            }}
          >
            No public spots found. Try adjusting your filters.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '24px',
            }}
          >
            {spots.map((spot) => (
              <SpotCard
                key={spot.id}
                spot={spot}
                canLike={Boolean(user)}
                canDelete={isAdmin}
                isDeleting={deletingSpotId === spot.id}
                onToggleLike={handleToggleLike}
                onDelete={handleDeleteSpot}
                currentUser={user}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
