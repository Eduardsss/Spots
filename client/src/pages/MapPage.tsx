import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  GoogleMap,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from '@react-google-maps/api';
import { SpotComments } from '../components/SpotComments';
import { SpotGallery } from '../components/SpotGallery';
import { TagInput } from '../components/TagInput';
import { apiFetch } from '../lib/api';
import {
  areTagListsEqual,
  mergeTagLists,
  MAX_TAGS_PER_SPOT,
  normalizeTagName,
} from '../lib/tags';
import { palette, radii, shadows, transitions } from '../styles/theme';

// Kartes lapā apvienojam Google Maps karti, spotu sarakstu un iespēju veidot/rediģēt savus punktus.
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
  owner: {
    id: number;
    username: string;
    profile_image: string | null;
  }; 
  tags: string[];
};

type SpotFormValues = {
  name: string;
  description: string;
  status: 'public' | 'private';
  image: string | null;
  images: string[];
  tags: string[];
};

type OwnerOption = {
  id: number;
  username: string;
};

type SpotFormSubmission = SpotFormValues & {
  imagesChanged: boolean;
};

type SpotFormState =
  | {
      mode: 'create';
      position: { lat: number; lng: number };
      values: SpotFormValues;
    }
  | {
      mode: 'edit';
      spot: Spot;
      values: SpotFormValues;
    };

type SpotsResponse = {
  spots: Spot[];
};

type CreateSpotResponse = {
  spot: Spot;
};

type UpdateSpotResponse = {
  spot: Spot;
};

type NearbySpot = Spot & {
  distance: number;
};

type NearbySpotsResponse = {
  spots: Array<Spot & { distance?: number }>;
};

type NotificationState = {
  type: 'success' | 'error';
  message: string;
};

type TagsResponse = {
  tags: string[];
};

const mergeOwnerLists = (current: OwnerOption[], incoming: OwnerOption[]): OwnerOption[] => {
  if (!incoming.length) {
    return current;
  }

  const map = new Map<number, OwnerOption>();
  current.forEach((owner) => {
    map.set(owner.id, owner);
  });

  let changed = false;
  incoming.forEach((owner) => {
    if (!map.has(owner.id) || map.get(owner.id)?.username !== owner.username) {
      map.set(owner.id, owner);
      changed = true;
    }
  });

  if (!changed) {
    return current;
  }

  return Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username));
};

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
};

const MAP_WRAPPER_STYLE: CSSProperties = {
  height: '100%',
  width: '100%',
  borderRadius: radii.xl,
  overflow: 'hidden',
  boxShadow: shadows.medium,
  border: `1px solid ${palette.border}`,
  transition: `box-shadow ${transitions.base}, border-color ${transitions.base}`,
};

const DEFAULT_CENTER = { lat: 56.9496, lng: 24.1052 };

const mapContainerStyle: CSSProperties = { width: '100%', height: '100%' };

// Nolasa lietotāju no localStorage, lai zinātu kuras darbības ir atļautas.
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('Neizdevās nolasīt failu'));
    reader.readAsDataURL(file);
  });
}

function SpotFormModal({
  title,
  open,
  onClose,
  onSubmit,
  initialValues,
  submitting,
  error,
  mode,
  position,
  availableTags,
  maxTags,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  onSubmit: (values: SpotFormSubmission) => void;
  initialValues: SpotFormValues;
  submitting: boolean;
  error: string;
  mode: 'create' | 'edit';
  position?: { lat: number; lng: number };
  availableTags: string[];
  maxTags?: number;
}) {
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description);
  const [status, setStatus] = useState<'public' | 'private'>(initialValues.status);
  const [galleryState, setGalleryState] = useState<{
    previews: string[];
    changed: boolean;
  }>({
    previews: [...initialValues.images],
    changed: false,
  });
  const [tags, setTags] = useState<string[]>([...initialValues.tags]);
  const tagLimit = maxTags ?? MAX_TAGS_PER_SPOT;

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(initialValues.name);
    setDescription(initialValues.description);
    setStatus(initialValues.status);
    setGalleryState({
      previews: [...initialValues.images],
      changed: false,
    });
    setTags([...initialValues.tags]);
  }, [initialValues, open]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (!files.length) {
      return;
    }

    try {
      const base64List = await Promise.all(files.map((file) => fileToBase64(file)));
      setGalleryState((current) => {
        const combined = [...current.previews, ...base64List];
        const limited = combined.slice(0, 6);
        return { previews: limited, changed: true };
      });
    } catch (err) {
      console.error('Failed to convert image', err);
    }
  };

  const handleRemoveImage = (index: number) => {
    setGalleryState((current) => {
      const next = current.previews.filter((_, i) => i !== index);
      return { previews: next, changed: true };
    });
  };

  const handleClearImages = () => {
    setGalleryState({ previews: [], changed: true });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description,
      status,
      image: galleryState.previews[0] ?? null,
      images: galleryState.previews,
      tags,
      imagesChanged: galleryState.changed,
    });
  };

  if (!open) {
    return null;
  }

  return (
    <div className="spotz-modal-overlay" role="dialog" aria-modal="true">
      <form className="spotz-modal" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', color: palette.textPrimary }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="spotz-btn spotz-btn--ghost"
            style={{ padding: '8px 16px', borderRadius: radii.pill, fontSize: '14px' }}
          >
            Aizvērt
          </button>
        </div>

        {mode === 'create' && position ? (
          <p style={{ margin: 0, color: palette.textMuted, fontSize: '14px' }}>
            Izvēlētās koordinātas: <strong>{position.lat.toFixed(5)}</strong>,{' '}
            <strong>{position.lng.toFixed(5)}</strong>
          </p>
        ) : null}

        {error ? (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: radii.md,
              background: palette.dangerSoft,
              color: palette.danger,
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        ) : null}

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
          Nosaukums
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="Spota nosaukums"
            className="spotz-input"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
          Apraksts
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="Pastāsti vairāk par šo spotu"
            className="spotz-input"
            style={{ resize: 'vertical', minHeight: '120px' }}
          />
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
          <span style={{ fontWeight: 600 }}>Redzamība</span>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setStatus('public')}
              className="spotz-btn"
              style={{
                padding: '10px 18px',
                borderRadius: radii.md,
                border: status === 'public' ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
                background: status === 'public' ? palette.accentGradientSoft : palette.surfaceAlt,
                color: status === 'public' ? palette.accentStrong : palette.textPrimary,
              }}
            >
              Publisks
            </button>
            <button
              type="button"
              onClick={() => setStatus('private')}
              className="spotz-btn"
              style={{
                padding: '10px 18px',
                borderRadius: radii.md,
                border: status === 'private' ? `1px solid ${palette.accentStrong}` : `1px solid ${palette.border}`,
                background:
                  status === 'private'
                    ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(168, 85, 247, 0.24))'
                    : palette.surfaceAlt,
                color: status === 'private' ? palette.textSecondary : palette.accentStrong,
              }}
            >
              Privāts
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: palette.textPrimary }}>
          <span style={{ fontWeight: 600 }}>Tagi</span>
          <TagInput
            value={tags}
            onChange={setTags}
            suggestions={availableTags}
            maxTags={tagLimit}
            placeholder="Pievieno tagus, piemēram, #daba vai #pilsēta"
          />
          <span style={{ fontSize: '12px', color: palette.textMuted }}>
            Vari pievienot līdz {tagLimit} tagiem, lai citiem būtu vieglāk atrast šo spotu.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: palette.textPrimary }}>
          <span style={{ fontWeight: 600 }}>Fotogrāfijas</span>
          <p style={{ margin: 0, fontSize: '12px', color: palette.textMuted }}>
            Augšupielādē līdz 6 attēliem. Pirmais attēls tiks izmantots kā galvenais attēls kartē un sarakstos.
          </p>

          {galleryState.previews.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                className="spotz-card"
                style={{ padding: 0, overflow: 'hidden', borderRadius: radii.lg, border: `1px solid ${palette.border}` }}
              >
                <img
                  src={galleryState.previews[0]}
                  alt="Galvenais attēls"
                  style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', display: 'block' }}
                />
              </div>

              {galleryState.previews.length > 1 ? (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {galleryState.previews.map((preview, index) => (
                    <div
                      key={`${preview}-${index}`}
                      style={{
                        position: 'relative',
                        width: '88px',
                        height: '88px',
                        borderRadius: radii.md,
                        overflow: 'hidden',
                        boxShadow: shadows.soft,
                        border: `1px solid ${palette.border}`,
                      }}
                    >
                      <img
                        src={preview}
                        alt={`Attēls ${index + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="spotz-btn spotz-btn--ghost"
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          padding: '4px 6px',
                          borderRadius: radii.pill,
                          fontSize: '12px',
                          background: 'rgba(15, 23, 42, 0.5)',
                          color: 'white',
                        }}
                        aria-label={`Noņemt attēlu ${index + 1}`}
                      >
                        ×
                      </button>
                      {index === 0 ? (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: '4px',
                            left: '4px',
                            padding: '2px 6px',
                            borderRadius: radii.pill,
                            background: 'rgba(15, 23, 42, 0.65)',
                            color: 'white',
                            fontSize: '11px',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Galvenais
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div
              style={{
                minHeight: '120px',
                borderRadius: radii.lg,
                border: `1px dashed ${palette.border}`,
                background: palette.surfaceAlt,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: palette.textMuted,
                fontSize: '14px',
              }}
            >
              Vēl nav pievienotu attēlu.
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <label className="spotz-btn spotz-btn--outline" style={{ padding: '10px 18px' }}>
              Pievienot attēlus
              <input type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: 'none' }} />
            </label>
            <button
              type="button"
              onClick={handleClearImages}
              className="spotz-btn spotz-btn--ghost"
              style={{ padding: '10px 18px', borderRadius: radii.md }}
              disabled={!galleryState.previews.length}
            >
              Noņemt visus
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onClose}
            className="spotz-btn spotz-btn--outline"
            style={{ padding: '10px 18px', borderRadius: radii.md }}
          >
            Atcelt
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="spotz-btn spotz-btn--primary"
            style={{ padding: '12px 18px', borderRadius: radii.md, fontSize: '16px' }}
          >
            {submitting ? 'Saglabājam…' : mode === 'create' ? 'Pievienot spotu' : 'Saglabāt izmaiņas'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function MapPage() {
  const location = useLocation();
  // Galvenie stāvokļi, kas kontrolē kartes izvēlētās vietas, filtrus un formu.
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => parseStoredUser());
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const [formState, setFormState] = useState<SpotFormState | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'public' | 'private' | 'mine'>('all');
  const [ownerFilter, setOwnerFilter] = useState<'any' | 'me' | number>('any');
  const [tagFilterInput, setTagFilterInput] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [nearbySpots, setNearbySpots] = useState<NearbySpot[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState('');
  const [spotIdFromQuery, setSpotIdFromQuery] = useState<number | null>(null);

  const ownerIdForQuery = useMemo(() => {
    if (ownerFilter === 'me') {
      return currentUser ? String(currentUser.id) : '';
    }

    if (typeof ownerFilter === 'number') {
      return Number.isNaN(ownerFilter) ? '' : String(ownerFilter);
    }

    return '';
  }, [ownerFilter, currentUser]);

  const spotsQuery = useMemo(() => {
    const params = new URLSearchParams();

    if (statusFilter === 'mine') {
      if (currentUser) {
        params.set('status', 'mine');
      }
    } else if (statusFilter === 'public' || statusFilter === 'private') {
      params.set('visibility', statusFilter);
    }

    if (ownerIdForQuery) {
      params.set('ownerId', ownerIdForQuery);
    }

    if (tagFilter) {
      params.set('tag', tagFilter);
    }

    return params.toString();
  }, [statusFilter, ownerIdForQuery, tagFilter, currentUser]);

  const spotsEndpoint = useMemo(
    () => (spotsQuery ? `/spots?${spotsQuery}` : '/spots'),
    [spotsQuery]
  );

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'spotz-map-loader',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  });

  const requestUserLocation = useCallback(() => {
    // Pieprasa lietotāja atrašanās vietu, lai atrastu tuvākos spotus.
    setIsRequestingLocation(true);

    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocationError('Neizdevās noteikt atrašanās vietu. Lūdzu, ieslēdz GPS vai atļauj piekļuvi.');
      setIsRequestingLocation(false);
      setNearbySpots([]);
      setNearbyError('');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(coords);
        setLocationError('');
        setNearbyError('');
        setIsRequestingLocation(false);
      },
      (error) => {
        console.warn('Failed to retrieve user location', error);
        setLocationError('Neizdevās noteikt atrašanās vietu. Lūdzu, ieslēdz GPS vai atļauj piekļuvi.');
        setIsRequestingLocation(false);
        setNearbySpots([]);
        setNearbyError('');
      },
      { enableHighAccuracy: false, maximumAge: 60_000 }
    );
  }, []);

  const fetchNearbySpots = useCallback(async () => {
    if (!userLocation) {
      return;
    }

    setNearbyLoading(true);
    setNearbyError('');

    try {
      const response = await apiFetch<NearbySpotsResponse>(
        `/spots/nearby?lat=${userLocation.lat}&lng=${userLocation.lng}&limit=10`
      );

      const normalized: NearbySpot[] = (response.spots ?? []).map((spot) => {
        const distanceValue = Number(spot.distance ?? 0);
        return {
          ...spot,
          distance: Number.isFinite(distanceValue) ? distanceValue : 0,
        };
      });

      setNearbySpots(normalized);
    } catch (error) {
      console.error('Failed to load nearby spots', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Neizdevās ielādēt tuvākos spotus. Lūdzu, mēģini vēlreiz.';
      setNearbyError(message);
      setNearbySpots([]);
    } finally {
      setNearbyLoading(false);
    }
  }, [userLocation]);

  useEffect(() => {
    // Nolasām URL parametrus, lai iespējotu dalīšanos ar konkrētu kartes skatu vai spotu.
    const params = new URLSearchParams(location.search);
    const latParam = parseFloat(params.get('lat') ?? '');
    const lngParam = parseFloat(params.get('lng') ?? '');
    const spotParam = parseInt(params.get('spotId') ?? '', 10);

    if (!Number.isNaN(latParam) && !Number.isNaN(lngParam)) {
      setCenter({ lat: latParam, lng: lngParam });
    }

    if (!Number.isNaN(spotParam)) {
      setSpotIdFromQuery(spotParam);
    } else {
      setSpotIdFromQuery(null);
    }
  }, [location.search]);

  // ✅ Šis bija konflikta fragments — tagad salabots:
  useEffect(() => {
    if (!spotIdFromQuery) {
      return;
    }

    const targetSpot = spots.find((spot) => spot.id === spotIdFromQuery);
    if (!targetSpot) {
      return;
    }

    setCenter({ lat: targetSpot.lat, lng: targetSpot.lng });
    setSelectedSpotId(targetSpot.id);
    setSpotIdFromQuery(null);
  }, [spotIdFromQuery, spots]);

  // ✅ Šis paliek, lai automātiski nolasītu lietotāja atrašanās vietu
  useEffect(() => {
    requestUserLocation();
  }, [requestUserLocation]);


  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'user') {
        setCurrentUser(parseStoredUser());
      }
      if (event.key === 'token' && !event.newValue) {
        setCurrentUser(null);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setStatusFilter((previous) => (previous === 'mine' || previous === 'private' ? 'all' : previous));
      setOwnerFilter((previous) => (previous === 'me' ? 'any' : previous));
      return;
    }

    setOwnerOptions((current) => {
      if (current.some((owner) => owner.id === currentUser.id)) {
        return current;
      }
      return mergeOwnerLists(current, [{ id: currentUser.id, username: currentUser.username }]);
    });
  }, [currentUser]);

  useEffect(() => {
    if (!userLocation) {
      return;
    }

    void fetchNearbySpots();
  }, [userLocation, fetchNearbySpots]);

  useEffect(() => {
    let ignore = false;

    const fetchTags = async () => {
      try {
        const response = await apiFetch<TagsResponse>('/spots/tags');
        if (!ignore && Array.isArray(response.tags)) {
          setAvailableTags(response.tags);
        }
      } catch (error) {
        if (!ignore) {
          setAvailableTags([]);
        }
      }
    };

    void fetchTags();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    // Sūta pieprasījumu ar aktīvajiem filtriem un atjauno kartes datus.
    const fetchSpots = async () => {
      setLoading(true);
      setFetchError('');
      setSelectedSpotId(null);
      try {
        const response = await apiFetch<SpotsResponse>(spotsEndpoint);
        if (!ignore) {
          const nextSpots = response.spots ?? [];
          setSpots(nextSpots);

          if (nextSpots.length) {
            const collectedTags = nextSpots.flatMap((spot) => spot.tags ?? []);
            if (collectedTags.length) {
              setAvailableTags((current) => mergeTagLists(current, collectedTags));
            }

            const owners = nextSpots.map((spot) => ({
              id: spot.owner.id,
              username: spot.owner.username,
            }));
            setOwnerOptions((current) => mergeOwnerLists(current, owners));
          }
        }
      } catch (error) {
        if (!ignore) {
          const message =
            error instanceof Error ? error.message : 'Neizdevās ielādēt spotus. Lūdzu, mēģini vēlreiz.';
          setFetchError(message);
          setSpots([]);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void fetchSpots();

    return () => {
      ignore = true;
    };
  }, [spotsEndpoint]);

  useEffect(() => {
    if (!notification || typeof window === 'undefined') {
      return undefined;
    }

    const timeout = window.setTimeout(() => setNotification(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notification]);

  const selectedSpot = useMemo(
    () => (selectedSpotId ? spots.find((spot) => spot.id === selectedSpotId) ?? null : null),
    [selectedSpotId, spots]
  );

  const nearbySpotIds = useMemo(() => new Set<number>(nearbySpots.map((spot) => spot.id)), [nearbySpots]);

  const handleStatusFilterChange = (nextValue: string) => {
    if (nextValue === 'public' || nextValue === 'private' || nextValue === 'mine' || nextValue === 'all') {
      setStatusFilter(nextValue);
    }
  };

  const handleOwnerFilterChange = (nextValue: string) => {
    if (nextValue === 'any' || nextValue === 'me') {
      setOwnerFilter(nextValue);
      return;
    }

    const numeric = Number(nextValue);
    setOwnerFilter(Number.isNaN(numeric) ? 'any' : numeric);
  };

  const handleTagFilterApply = () => {
    const normalized = normalizeTagName(tagFilterInput);
    if (normalized) {
      setTagFilter(normalized);
      setTagFilterInput(normalized);
    } else {
      setTagFilter('');
      setTagFilterInput('');
    }
  };

  const handleTagFilterInputChange = (value: string) => {
    setTagFilterInput(value);
  };

  const handleTagFilterKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleTagFilterApply();
    }
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setOwnerFilter('any');
    setTagFilter('');
    setTagFilterInput('');
  };

  const handleMapClick = (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) {
      return;
    }

    const lat = event.latLng.lat();
       const lng = event.latLng.lng();
    setSelectedSpotId(null);
    setFormError('');
    setFormState({
      mode: 'create',
      position: { lat, lng },
      values: {
        name: '',
        description: '',
        status: 'public',
        image: null,
        images: [],
        tags: [],
      },
    });
  };

  const handleCloseForm = () => {
    setFormState(null);
    setFormError('');
    setFormSubmitting(false);
  };

  const handleCreateSubmit = async (values: SpotFormSubmission) => {
    if (formState?.mode !== 'create') {
      return;
    }

    if (!values.name) {
      setFormError('Nosaukums ir obligāts.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');

    try {
      const body = {
        name: values.name,
        description: values.description.trim() ? values.description.trim() : null,
        status: values.status,
        image: values.image ?? null,
        images: values.images,
        lat: formState.position.lat,
        lng: formState.position.lng,
        tags: values.tags,
      };

      const response = await apiFetch<CreateSpotResponse>('/spots', {
        method: 'POST',
        body,
      });

      setSpots((current) => [...current, response.spot]);
      setAvailableTags((current) => mergeTagLists(current, response.spot.tags ?? []));
      handleCloseForm();
      setNotification({ type: 'success', message: 'Spots veiksmīgi pievienots.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās izveidot spotu.';
      setFormError(message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (values: SpotFormSubmission) => {
    if (formState?.mode !== 'edit') {
      return;
    }

    const target = formState.spot;
    const updates: Record<string, unknown> = {};

    if (values.name && values.name !== target.name) {
      updates.name = values.name;
    }

    const normalizedDescription = values.description.trim();
    if (normalizedDescription !== (target.description ?? '')) {
      updates.description = normalizedDescription ? normalizedDescription : null;
    }

    if (values.status !== target.status) {
      updates.status = values.status;
    }

    if (values.imagesChanged) {
      updates.image = values.image ?? null;
      updates.images = values.images;
    }

    if (!areTagListsEqual(values.tags, target.tags ?? [])) {
      updates.tags = values.tags;
    }

    if (Object.keys(updates).length === 0) {
      setFormError('Nav izmaiņu, ko saglabāt.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');

    try {
      const response = await apiFetch<UpdateSpotResponse>(`/spots/${target.id}`, {
        method: 'PUT',
        body: updates,
      });

      setSpots((current) =>
        current.map((spot) => (spot.id === target.id ? response.spot : spot))
      );
      setAvailableTags((current) => mergeTagLists(current, response.spot.tags ?? []));
      handleCloseForm();
      setNotification({ type: 'success', message: 'Spots atjaunināts.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās atjaunināt spotu.';
      setFormError(message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteSpot = async (spot: Spot) => {
    if (!window.confirm(`Vai tiešām dzēst "${spot.name}"? Šo darbību nevarēs atsaukt.`)) {
      return;
    }

    try {
      await apiFetch(`/spots/${spot.id}`, { method: 'DELETE' });
      setSpots((current) => current.filter((item) => item.id !== spot.id));
      setSelectedSpotId(null);
      setNotification({ type: 'success', message: 'Spots izdzēsts.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās dzēst spotu.';
      setNotification({ type: 'error', message });
    }
  };

  const handleToggleLike = async (spot: Spot) => {
    if (!currentUser) {
      setNotification({ type: 'error', message: 'Lai pievienotu patīk, nepieciešams pieteikties.' });
      return;
    }

    const liked = Boolean(spot.likedByCurrentUser);
    setSpots((current) =>
      current.map((item) =>
        item.id === spot.id
          ? {
              ...item,
              likedByCurrentUser: !liked,
              likesCount: Math.max(0, item.likesCount + (liked ? -1 : 1)),
            }
          : item
      )
    );

    try {
      if (liked) {
        await apiFetch(`/spots/${spot.id}/like`, { method: 'DELETE' });
      } else {
        await apiFetch(`/spots/${spot.id}/like`, { method: 'POST' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās atjaunināt patīk reakciju.';
      setSpots((current) => current.map((item) => (item.id === spot.id ? spot : item)));
      setNotification({ type: 'error', message });
    }
  };

  const handleShareSpot = async (spot: Spot) => {
    if (typeof window === 'undefined') {
      return;
    }

    const shareUrl = `${window.location.origin}/public?spotId=${spot.id}`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setNotification({ type: 'success', message: 'Saite uz spotu ir nokopēta.' });
        return;
      }

      throw new Error('Starpliktuves API nav pieejams');
    } catch (error) {
      console.warn('Clipboard write failed', error);
      window.prompt('Kopējiet šo saiti ar draugiem:', shareUrl);
      setNotification({ type: 'success', message: 'Saite sagatavota kopēšanai.' });
    }
  };

  const handleReportSpot = async (spot: Spot) => {
    if (!currentUser) {
      setNotification({ type: 'error', message: 'Lai ziņotu, nepieciešams pieteikties.' });
      return;
    }

    const reason = window.prompt(
      'Pastāsti, kas šajā spotā ir neatbilstošs (neobligāti):'
    );

    if (reason === null) {
      return;
    }

    try {
      await apiFetch('/reports', {
        method: 'POST',
        body: {
          targetType: 'spot',
          targetId: spot.id,
          reason: reason.trim() ? reason.trim() : undefined,
        },
      });

      setNotification({ type: 'success', message: 'Ziņojums nosūtīts moderatoriem.' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Neizdevās nosūtīt ziņojumu par spotu.';
      setNotification({ type: 'error', message });
    }
  };

  const canManageSpot = (spot: Spot) => {
    if (!currentUser) {
      return false;
    }

    return currentUser.role === 'admin' || currentUser.id === spot.user_id;
  };

  const renderInfoWindow = () => {
    if (!selectedSpot) {
      return null;
    }

    const galleryImages = (
      Array.isArray(selectedSpot.images) && selectedSpot.images.length
        ? selectedSpot.images
        : selectedSpot.image
        ? [selectedSpot.image]
        : []
    ).filter((image) => typeof image === 'string' && image.trim().length > 0);
    const liked = Boolean(selectedSpot.likedByCurrentUser);

    return (
      <InfoWindow
        position={{ lat: selectedSpot.lat, lng: selectedSpot.lng }}
        onCloseClick={() => setSelectedSpotId(null)}
      >
        <div
          className="spotz-card"
          style={{
            maxWidth: '300px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            borderRadius: radii.lg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: radii.md,
                overflow: 'hidden',
                background: palette.accentGradientSoft,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: palette.accentStrong,
                flexShrink: 0,
              }}
            >
              {selectedSpot.owner.profile_image ? (
                <img
                  src={selectedSpot.owner.profile_image}
                  alt={selectedSpot.owner.username}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                selectedSpot.owner.username.slice(0, 1).toUpperCase()
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: palette.textPrimary }}>{selectedSpot.name}</h3>
              <span style={{ fontSize: '13px', color: palette.textMuted }}>
                Dalījās {selectedSpot.owner.username} ·{' '}
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: radii.pill,
                    background:
                      selectedSpot.status === 'public'
                        ? palette.accentGradientSoft
                        : 'linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(168, 85, 247, 0.24))',
                    color: selectedSpot.status === 'public' ? palette.accentStrong : palette.textSecondary,
                    fontWeight: 600,
                  }}
                >
                  {selectedSpot.status === 'public' ? 'Publisks' : 'Privāts'}
                </span>
              </span>
            </div>
          </div>

          {galleryImages.length ? (
            <SpotGallery images={galleryImages} title={selectedSpot.name} height={180} />
          ) : null}

          {selectedSpot.description ? (
            <p style={{ margin: 0, color: palette.textSecondary, fontSize: '14px', lineHeight: 1.5 }}>
              {selectedSpot.description}
            </p>
          ) : null}

          {selectedSpot.tags.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {selectedSpot.tags.map((tag) => (
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => handleToggleLike(selectedSpot)}
                  className="spotz-btn"
                  style={{
                    padding: '8px 16px',
                    borderRadius: radii.pill,
                    border: liked ? `1px solid ${palette.danger}` : `1px solid ${palette.border}`,
                    background: liked
                      ? 'linear-gradient(135deg, rgba(248, 113, 113, 0.28), rgba(239, 68, 68, 0.4))'
                      : palette.surfaceAlt,
                    color: palette.danger,
                  }}
                >
                  {liked ? 'Noņemt patīk' : 'Patīk'} · {selectedSpot.likesCount}
                </button>
              ) : (
                <span
                  className="spotz-chip"
                  style={{ background: palette.dangerSoft, color: palette.danger }}
                  aria-label={`${selectedSpot.likesCount} patīk`}
                >
                  ❤ {selectedSpot.likesCount}
                </span>
              )}

              <button
                type="button"
                onClick={() => handleShareSpot(selectedSpot)}
                className="spotz-btn spotz-btn--ghost"
                style={{ padding: '8px 14px', borderRadius: radii.md }}
              >
                Kopēt saiti
              </button>

              {selectedSpot.status === 'public' ? (
                <button
                  type="button"
                  onClick={() => handleReportSpot(selectedSpot)}
                  className="spotz-btn spotz-btn--outline"
                  style={{ padding: '8px 14px', borderRadius: radii.md, borderColor: palette.danger, color: palette.danger }}
                >
                  Ziņot
                </button>
              ) : null}
            </div>

            {canManageSpot(selectedSpot) ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setFormError('');
                    setFormState({
                      mode: 'edit',
                      spot: selectedSpot,
                      values: {
                        name: selectedSpot.name,
                        description: selectedSpot.description ?? '',
                        status: selectedSpot.status,
                        image: selectedSpot.image,
                        images: [...(selectedSpot.images ?? [])],
                        tags: [...(selectedSpot.tags ?? [])],
                      },
                    });
                  }}
                  className="spotz-btn spotz-btn--outline"
                  style={{ padding: '8px 14px', borderRadius: radii.md }}
                >
                  Rediģēt
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSpot(selectedSpot)}
                  className="spotz-btn spotz-btn--danger"
                  style={{ padding: '8px 14px', borderRadius: radii.md }}
                >
                  Dzēst
                </button>
              </div>
            ) : null}
          </div>

          {selectedSpot.status === 'public' ? (
            <div
              style={{
                borderTop: `1px solid ${palette.border}`,
                paddingTop: '12px',
              }}
            >
              <SpotComments
                spotId={selectedSpot.id}
                currentUser={currentUser}
                canComment={Boolean(currentUser)}
                variant="compact"
                maxHeight={160}
              />
            </div>
          ) : null}
        </div>
      </InfoWindow>
    );
  };

  if (loadError) {
    return (
      <div
        className="spotz-card"
        style={{
          minHeight: '60vh',
          borderRadius: radii.xl,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: palette.surface,
          color: palette.danger,
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        Neizdevās ielādēt Google Maps. Lūdzu, pārbaudi API atslēgu.
      </div>
    );
  }

  const hasActiveFilters =
    statusFilter !== 'all' || ownerFilter !== 'any' || Boolean(tagFilter);
  const canSeePrivate = Boolean(currentUser);
  const ownerFilterValue =
    ownerFilter === 'any' || ownerFilter === 'me' ? ownerFilter : String(ownerFilter);
  const showNearbyButtonLabel = isRequestingLocation
    ? 'Nosakām atrašanās vietu…'
    : nearbyLoading
    ? 'Ielādējam tuvākos…'
    : 'Rādīt tuvākos 10 spotus';
  const shouldShowNearbyPanel =
    Boolean(userLocation) || nearbyLoading || Boolean(locationError) || nearbySpots.length > 0;

  const handleShowNearbyClick = () => {
    if (!userLocation) {
      requestUserLocation();
      return;
    }

    setCenter(userLocation);
    void fetchNearbySpots();
  };

  // UI tiek veidots no vairākiem slāņiem: kartes pārklājumiem un vadības paneļiem.
  return (
    <div style={{ height: 'calc(100vh - 160px)', minHeight: '520px', position: 'relative' }}>
      {notification ? (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 18px',
            borderRadius: radii.md,
            background:
              notification.type === 'success' ? palette.successSoft : palette.dangerSoft,
            color: notification.type === 'success' ? palette.success : palette.danger,
            fontWeight: 600,
            boxShadow: shadows.soft,
            zIndex: 15,
            backdropFilter: 'var(--backdrop-blur)',
          }}
        >
          {notification.message}
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '12px',
        }}
      >
        {fetchError ? (
          <div
            style={{
              padding: '12px 18px',
              borderRadius: radii.md,
              background: palette.dangerSoft,
              color: palette.danger,
              fontWeight: 600,
              boxShadow: shadows.soft,
              maxWidth: '280px',
              textAlign: 'right',
            }}
          >
            {fetchError}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleShowNearbyClick}
          className="spotz-btn spotz-btn--primary"
          disabled={isRequestingLocation || nearbyLoading}
          style={{
            padding: '10px 16px',
            borderRadius: radii.pill,
            fontWeight: 600,
            pointerEvents: 'auto',
            minWidth: '220px',
          }}
          aria-busy={isRequestingLocation || nearbyLoading}
        >
          {showNearbyButtonLabel}
        </button>

        {locationError ? (
          <div
            style={{
              padding: '10px 16px',
              borderRadius: radii.md,
              background: palette.dangerSoft,
              color: palette.danger,
              fontWeight: 600,
              boxShadow: shadows.soft,
              maxWidth: '280px',
              textAlign: 'right',
            }}
          >
            {locationError}
          </div>
        ) : null}

      </div>

      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 30,
          pointerEvents: 'none',
          maxWidth: '340px',
        }}
      >
        <div
          className="spotz-card"
          style={{
            padding: '18px',
            borderRadius: radii.lg,
            border: `1px solid ${palette.border}`,
            boxShadow: shadows.soft,
            background: palette.surfaceGlass,
            backdropFilter: 'var(--backdrop-blur)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '16px', color: palette.textPrimary }}>Kartes filtri</h2>
            <button
              type="button"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
              className="spotz-btn spotz-btn--ghost"
              style={{
                padding: '6px 12px',
                borderRadius: radii.pill,
                fontSize: '13px',
                opacity: hasActiveFilters ? 1 : 0.5,
              }}
            >
              Notīrīt
            </button>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
            Redzamība
            <select
              value={statusFilter}
              onChange={(event) => handleStatusFilterChange(event.target.value)}
              className="spotz-input"
              style={{ cursor: 'pointer' }}
            >
              <option value="all">Visi spoti</option>
              <option value="public">Tikai publiskie</option>
              <option value="private" disabled={!canSeePrivate}>
                Tikai privātie
              </option>
              <option value="mine" disabled={!canSeePrivate}>
                Tikai mani spoti
              </option>
            </select>
            {!canSeePrivate ? (
              <span style={{ fontSize: '11px', color: palette.textMuted }}>
                Piesakies, lai skatītu privātos vai savus spotus.
              </span>
            ) : null}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
            Autors
            <select
              value={ownerFilterValue}
              onChange={(event) => handleOwnerFilterChange(event.target.value)}
              className="spotz-input"
              style={{ cursor: 'pointer' }}
            >
              <option value="any">Jebkurš autors</option>
              {currentUser ? <option value="me">Tikai es</option> : null}
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={String(owner.id)}>
                  {owner.username}
                  {currentUser && owner.id === currentUser.id ? ' (tu)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              color: palette.textPrimary,
            }}
          >
            <span>Tags</span>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <input
                value={tagFilterInput}
                onChange={(event) => handleTagFilterInputChange(event.target.value)}
                onKeyDown={handleTagFilterKeyDown}
                placeholder="#daba"
                className="spotz-input"
                style={{ flex: 1 }}
                list="map-tag-options"
              />
              <button
                type="button"
                onClick={handleTagFilterApply}
                className="spotz-btn spotz-btn--outline"
                style={{ padding: '8px 14px', borderRadius: radii.md, flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                Piemērot
              </button>
            </div>
            {tagFilter ? (
              <span style={{ fontSize: '12px', color: palette.accent }}>
                Filtrē pēc <strong>{tagFilter}</strong>
              </span>
            ) : (
              <span style={{ fontSize: '12px', color: palette.textMuted }}>
                Izvēlies tagu vai ieraksti savu, lai izceltu atbilstošos spotus.
              </span>
            )}
            <datalist id="map-tag-options">
              {availableTags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      {isLoaded ? (
        <div style={MAP_WRAPPER_STYLE}>
          {/* Kad Google Maps bibliotēka ir ielādēta, uzzīmējam karti un pievienojam marķierus. */}
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={12}
            options={MAP_OPTIONS}
            onClick={handleMapClick}
          >
            {userLocation ? (
              <Marker
                position={userLocation}
                icon="http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                title="Tava atrašanās vieta"
                zIndex={999}
              />
            ) : null}
            {spots.map((spot) => {
              const isNearby = nearbySpotIds.has(spot.id);
              return (
                <Marker
                  key={spot.id}
                  position={{ lat: spot.lat, lng: spot.lng }}
                  onClick={() => setSelectedSpotId(spot.id)}
                  icon={
                    isNearby
                      ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
                      : undefined
                  }
                  zIndex={isNearby ? 50 : undefined}
                />
              );
            })}
            {renderInfoWindow()}
          </GoogleMap>
        </div>
      ) : (
        <div
          style={{
            ...MAP_WRAPPER_STYLE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: palette.surfaceAlt,
          }}
        >
          <span style={{ color: palette.textSecondary, fontWeight: 600 }}>Ielādējam karti…</span>
        </div>
      )}

      {shouldShowNearbyPanel ? (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            zIndex: 25,
            maxWidth: '320px',
            pointerEvents: 'none',
          }}
        >
          <div
            className="spotz-card"
            style={{
              padding: '18px',
              borderRadius: radii.lg,
              border: `1px solid ${palette.border}`,
              boxShadow: shadows.soft,
              background: palette.surfaceGlass,
              backdropFilter: 'var(--backdrop-blur)',
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px', color: palette.textPrimary }}>
              Tavi tuvākie spoti
            </h3>

            {locationError ? (
              <p style={{ margin: 0, color: palette.danger, fontWeight: 600 }}>
                {locationError}
              </p>
            ) : nearbyLoading ? (
              <p style={{ margin: 0, color: palette.accent }}>Ielādējam tuvākos spotus…</p>
            ) : nearbySpots.length ? (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              >
                {nearbySpots.map((spot) => {
                  const active = selectedSpotId === spot.id;
                  return (
                    <li key={spot.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCenter({ lat: spot.lat, lng: spot.lng });
                          setSelectedSpotId(spot.id);
                        }}
                        className="spotz-btn spotz-btn--ghost"
                        style={{
                          width: '100%',
                          justifyContent: 'space-between',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 14px',
                          borderRadius: radii.md,
                          border: `1px solid ${active ? palette.accent : palette.border}`,
                          background: active ? palette.successSoft : palette.surfaceAlt,
                          color: palette.textPrimary,
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ textAlign: 'left' }}>{spot.name}</span>
                        <span style={{ color: palette.accent }}>
                          {spot.distance.toFixed(1)} km
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p style={{ margin: 0, color: palette.textMuted }}>
                Nav atrasti tuvumā esoši spoti.
              </p>
            )}

            {nearbyError && !nearbyLoading && !locationError ? (
              <p style={{ margin: 0, color: palette.accent }}>{nearbyError}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: palette.overlay,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radii.xl,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '12px 18px',
              borderRadius: radii.pill,
              background: palette.surface,
              boxShadow: shadows.soft,
              color: palette.accent,
              fontWeight: 600,
            }}
          >
            Ielādējam spotus…
          </div>
        </div>
      ) : null}

      <SpotFormModal
        title={formState?.mode === 'edit' ? 'Rediģēt spotu' : 'Pievienot spotu'}
        open={Boolean(formState)}
        onClose={handleCloseForm}
        onSubmit={formState?.mode === 'edit' ? handleEditSubmit : handleCreateSubmit}
        initialValues={
          formState
            ? formState.values
            : { name: '', description: '', status: 'public', image: null, images: [], tags: [] }
        }
        submitting={formSubmitting}
        error={formError}
        mode={formState?.mode ?? 'create'}
        position={formState?.mode === 'create' ? formState.position : undefined}
        availableTags={availableTags}
        maxTags={MAX_TAGS_PER_SPOT}
      />
    </div>
  );
}
