import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SpotComments } from '../components/SpotComments';
import { SpotGallery } from '../components/SpotGallery';
import SaveToCollectionModal from '../components/SaveToCollectionModal';
import { apiFetch } from '../lib/api';
import { palette, radii, shadows } from '../styles/theme';

// Publisko spotu lapā lietotāji var pārlūkot, saglabāt un dalīties ar kopienas vietām.
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
  images: string[];
  lat: number;
  lng: number;
  status: 'public' | 'private';
  likesCount: number;
  likedByCurrentUser?: boolean;
  tags: string[];
};

type SpotsResponse = {
  spots: Spot[];
};

type SortOption = 'latest' | 'mostLiked';

// Props, kas tiek nodoti katrai spot kartītei un nosaka pieejamās darbības.
type SpotCardProps = {
  spot: Spot;
  canLike: boolean;
  canDelete: boolean;
  isDeleting: boolean;
  onToggleLike: (spot: Spot) => void;
  onDelete: (spot: Spot) => void;
  currentUser: AuthUser | null;
  onShowOnMap: (spot: Spot) => void;
  onShare: (spot: Spot) => void;
  onReport: (spot: Spot) => void;
  onSaveToCollection: (spot: Spot) => void;
  highlighted?: boolean;
  initiallyOpenComments?: boolean;
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
  onShowOnMap,
  onShare,
  onReport,
  onSaveToCollection,
  highlighted = false,
  initiallyOpenComments = false,
}: SpotCardProps) {
  // Vietējais stāvoklis lai kontrolētu komentāru atvēršanu un citu interaktīvo loģiku.
  const [showComments, setShowComments] = useState(initiallyOpenComments);
  const canComment = Boolean(currentUser);
  const toggleLabel = showComments ? 'Slēpt komentārus' : 'Skatīt komentārus';
  const isAdminManagingOther =
    currentUser?.role === 'admin' && currentUser.id !== spot.user_id;
  const galleryImages =
    Array.isArray(spot.images) && spot.images.length
      ? spot.images
      : spot.image
      ? [spot.image]
      : [];
  const canReport = Boolean(currentUser) && currentUser!.id !== spot.user_id;

  useEffect(() => {
    if (initiallyOpenComments) {
      setShowComments(true);
    }
  }, [initiallyOpenComments]);

    // Kartīte apvieno attēlu galeriju, aprakstu un darbību pogas vienā blokā.
    return (
      <article
      id={`spot-card-${spot.id}`}
      className="spotz-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: radii.lg,
        overflow: 'hidden',
        background: palette.surface,
        border: highlighted ? `2px solid ${palette.accentStrong}` : `1px solid ${palette.border}`,
        boxShadow: highlighted ? shadows.medium : shadows.soft,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      <div style={{ borderBottom: `1px solid ${palette.border}` }}>
        <SpotGallery images={galleryImages} title={spot.name} height={220} />
      </div>

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
              Apraksts nav pievienots.
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
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => onShowOnMap(spot)}
              className="spotz-btn spotz-btn--outline"
              style={{
                padding: '8px 16px',
                borderRadius: radii.md,
                border: `1px solid ${palette.border}`,
                background: palette.surfaceAlt,
                color: palette.accentStrong,
              }}
            >
              Parādīt kartē
            </button>
            <button
              type="button"
              onClick={() => onShare(spot)}
              className="spotz-btn spotz-btn--ghost"
              style={{ padding: '8px 14px', borderRadius: radii.md }}
            >
              Kopēt saiti
            </button>
            <button
              type="button"
              onClick={() => onSaveToCollection(spot)}
              className="spotz-btn spotz-btn--outline"
              style={{
                padding: '8px 16px',
                borderRadius: radii.md,
                border: `1px solid ${palette.border}`,
                background: palette.surfaceAlt,
                color: palette.accentStrong,
              }}
            >
              Saglabāt kolekcijā
            </button>
            {canReport ? (
              <button
                type="button"
                onClick={() => onReport(spot)}
                className="spotz-btn spotz-btn--outline"
                style={{
                  padding: '8px 14px',
                  borderRadius: radii.md,
                  borderColor: palette.danger,
                  color: palette.danger,
                }}
              >
                Ziņot
              </button>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div
              className="spotz-chip"
              style={{ background: palette.accentGradientSoft, color: palette.accentStrong }}
            >
              <span aria-hidden="true">❤️</span>
              <span>{spot.likesCount}</span>
            </div>

            {canLike ? (
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
                {spot.likedByCurrentUser ? 'Noņemt patīk' : 'Patīk'}
              </button>
            ) : null}

            {canDelete ? (
              <button
                type="button"
                onClick={() => onDelete(spot)}
                disabled={isDeleting}
                className="spotz-btn spotz-btn--danger"
                style={{ padding: '8px 16px', borderRadius: radii.md, opacity: isDeleting ? 0.6 : 1 }}
              >
                {isDeleting
                  ? 'Dzēšam…'
                  : isAdminManagingOther
                  ? 'Dzēst (admin)'
                  : 'Dzēst'}
              </button>
            ) : null}
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
  const navigate = useNavigate();
  const location = useLocation();
  // Pamatstāvokļi lapai: lietotājs, ielādes statusi, meklēšana un atlasītie spoti.
  const [user, setUser] = useState<AuthUser | null>(() => parseStoredUser());
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('latest');
  const [deletingSpotId, setDeletingSpotId] = useState<number | null>(null);
  const [highlightedSpotId, setHighlightedSpotId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [collectionSpot, setCollectionSpot] = useState<Spot | null>(null);

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

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const timeout = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

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

    // Ielādējam visus publiskos spotus, ņemot vērā meklēšanu un kārtošanas izvēli.
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
          setError('Neizdevās ielādēt publiskos spotus. Lūdzu, pamēģini vēlreiz.');
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const spotParam = parseInt(params.get('spotId') ?? '', 10);

    if (!Number.isNaN(spotParam)) {
      setHighlightedSpotId(spotParam);
    } else {
      setHighlightedSpotId(null);
    }
  }, [location.search]);

  useEffect(() => {
    if (!highlightedSpotId) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const element = document.getElementById(`spot-card-${highlightedSpotId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedSpotId, spots]);

  const handleToggleLike = async (spot: Spot) => {
    // Izmanto optimistisku atjaunināšanu, lai lietotājs uzreiz redzētu patīk izmaiņas.
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
    // Tikai administrators var dzēst spotu no publiskās lentes.
    if (!user || user.role !== 'admin') {
      return;
    }

      const confirmed = window.confirm(`Vai tiešām dzēst "${spot.name}"? Šo darbību nevarēs atsaukt.`);

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
      setError('Neizdevās dzēst spotu. Lūdzu, mēģini vēlreiz.');
      setSpots(previousSpots);
    } finally {
      setDeletingSpotId(null);
    }
  };

  const handleShowOnMap = (spot: Spot) => {
    const params = new URLSearchParams();
    params.set('spotId', String(spot.id));

    if (
      typeof spot.lat === 'number' &&
      Number.isFinite(spot.lat) &&
      typeof spot.lng === 'number' &&
      Number.isFinite(spot.lng)
    ) {
      params.set('lat', String(spot.lat));
      params.set('lng', String(spot.lng));
    }

    navigate(`/map?${params.toString()}`);
  };

  const handleShareSpot = async (spot: Spot) => {
    if (typeof window === 'undefined') {
      return;
    }

    const shareUrl = `${window.location.origin}/public?spotId=${spot.id}`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setStatusMessage('Saite uz spotu ir nokopēta.');
        return;
      }

      throw new Error('Clipboard API is not available');
    } catch (error) {
      console.warn('Clipboard write failed', error);
      window.prompt('Kopējiet šo saiti ar draugiem:', shareUrl);
      setStatusMessage('Saite sagatavota kopēšanai.');
    }
  };

  const handleReportSpot = async (spot: Spot) => {
    if (!user) {
      setError('Lai ziņotu par spotu, lūdzu, piesakies.');
      return;
    }

    if (user.id === spot.user_id) {
      setError('Tu nevari ziņot par savu spotu.');
      return;
    }

    const reason = window.prompt(
      'Pastāsti, kas šajā spotā ir neatbilstošs (neobligāti):'
    );

    if (reason === null) {
      return;
    }

    try {
      setError(null);
      await apiFetch('/reports', {
        method: 'POST',
        body: {
          targetType: 'spot',
          targetId: spot.id,
          reason: reason.trim() ? reason.trim() : undefined,
        },
      });

      setStatusMessage('Ziņojums nosūtīts moderatoriem.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Neizdevās nosūtīt ziņojumu.';
      setError(message);
    }
  };

  const handleSaveToCollection = useCallback(
    (spot: Spot) => {
      if (!user) {
        navigate('/login');
        return;
      }

      setCollectionSpot(spot);
    },
    [navigate, user]
  );

  const isAdmin = user?.role === 'admin';

  // Lapa sastāv no filtru galvenes, statusa paziņojumiem un saraksta ar spot kartītēm.
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
            Atklāj
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: '40px',
              color: palette.textPrimary,
              letterSpacing: '-0.02em',
            }}
          >
            Publiskie spoti no Spotz kopienas
          </h1>
          <p style={{ margin: 0, color: palette.textSecondary, maxWidth: '720px', lineHeight: 1.7 }}>
            Iedvesmojies no vietām, kuras kopiena ir publicējusi visiem redzēšanai. Izmanto meklēšanu un kārtošanu, lai
            ātri atrastu nākamo galamērķi savam piedzīvojumam.
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
            <span style={{ fontSize: '14px', color: palette.textSecondary, fontWeight: 600 }}>Meklēt</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Meklēt pēc spota nosaukuma…"
              className="spotz-input"
            />
          </label>

          <label style={{ width: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: palette.textSecondary, fontWeight: 600 }}>Kārtot pēc</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              className="spotz-input"
              style={{ cursor: 'pointer' }}
            >
              <option value="latest">Jaunākie</option>
              <option value="mostLiked">Visvairāk patīk</option>
            </select>
          </label>
        </div>

        {statusMessage ? (
          <div
            style={{
              padding: '16px',
              borderRadius: radii.lg,
              background: palette.successSoft,
              color: palette.success,
              border: `1px solid ${palette.border}`,
              fontWeight: 600,
            }}
          >
            {statusMessage}
          </div>
        ) : null}

        {loading ? (
          <div
            style={{
              padding: '80px 0',
              textAlign: 'center',
              color: palette.textSecondary,
              fontSize: '18px',
            }}
          >
            Ielādējam publiskos spotus…
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
            Publiskie spoti netika atrasti. Pamēģini mainīt meklēšanas nosacījumus.
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
              // Katrā kartītē nododam nepieciešamās atļaujas un notikumu apstrādātājus.
              <SpotCard
                key={spot.id}
                spot={spot}
                canLike={Boolean(user)}
                canDelete={isAdmin}
                isDeleting={deletingSpotId === spot.id}
                onToggleLike={handleToggleLike}
                onDelete={handleDeleteSpot}
                currentUser={user}
                onShowOnMap={handleShowOnMap}
                onShare={handleShareSpot}
                onReport={handleReportSpot}
                onSaveToCollection={handleSaveToCollection}
                highlighted={highlightedSpotId === spot.id}
                initiallyOpenComments={highlightedSpotId === spot.id}
              />
            ))}
          </div>
        )}
      </section>

        {/* Modālis, kas ļauj pievienot atlasīto spotu kolekcijai. */}
        <SaveToCollectionModal
        open={Boolean(collectionSpot)}
        spotId={collectionSpot?.id ?? null}
        spotName={collectionSpot?.name ?? ''}
        onClose={() => setCollectionSpot(null)}
        onSaved={(collection) => {
          setStatusMessage(`Spots saglabāts kolekcijā “${collection.name}”.`);
          setCollectionSpot(null);
        }}
      />
    </main>
  );
}
