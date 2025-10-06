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
import { TagInput } from '../components/TagInput';
import { apiFetch } from '../lib/api';
import {
  areTagListsEqual,
  mergeTagLists,
  MAX_TAGS_PER_SPOT,
  normalizeTagName,
} from '../lib/tags';
import { palette, radii, shadows, transitions } from '../styles/theme';

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
  tags: string[];
};

type OwnerOption = {
  id: number;
  username: string;
};

type SpotFormSubmission = SpotFormValues & {
  imageChanged: boolean;
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
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
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
  const [imageState, setImageState] = useState<{
    preview: string | null;
    value: string | null;
    changed: boolean;
  }>({
    preview: initialValues.image,
    value: initialValues.image,
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
    setImageState({
      preview: initialValues.image,
      value: initialValues.image,
      changed: false,
    });
    setTags([...initialValues.tags]);
  }, [initialValues, open]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImageState({ preview: null, value: null, changed: true });
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      setImageState({ preview: base64, value: base64, changed: true });
    } catch (err) {
      console.error('Failed to convert image', err);
      setImageState((current) => ({ ...current, changed: false }));
    }
  };

  const handleRemoveImage = () => {
    setImageState({ preview: null, value: null, changed: true });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description,
      status,
      image: imageState.value,
      tags,
      imageChanged: imageState.changed,
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
            Close
          </button>
        </div>

        {mode === 'create' && position ? (
          <p style={{ margin: 0, color: palette.textMuted, fontSize: '14px' }}>
            You selected coordinates <strong>{position.lat.toFixed(5)}</strong>,{' '}
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
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="Spot title"
            className="spotz-input"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="Share more about this spot"
            className="spotz-input"
            style={{ resize: 'vertical', minHeight: '120px' }}
          />
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
          <span style={{ fontWeight: 600 }}>Visibility</span>
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
              Public
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
              Private
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: palette.textPrimary }}>
          <span style={{ fontWeight: 600 }}>Tags</span>
          <TagInput
            value={tags}
            onChange={setTags}
            suggestions={availableTags}
            maxTags={tagLimit}
            placeholder="Add categories like #nature or #city"
          />
          <span style={{ fontSize: '12px', color: palette.textMuted }}>
            Add up to {tagLimit} tags to help others discover this spot.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: palette.textPrimary }}>
          <span style={{ fontWeight: 600 }}>Cover image</span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: radii.md,
                background: palette.surfaceAlt,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                border: `1px dashed ${palette.border}`,
              }}
            >
              {imageState.preview ? (
                <img
                  src={imageState.preview}
                  alt="Preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: '12px', color: palette.textMuted }}>Preview</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <label className="spotz-btn spotz-btn--outline" style={{ padding: '10px 18px' }}>
                Upload
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
              </label>
              <button
                type="button"
                onClick={handleRemoveImage}
                className="spotz-btn spotz-btn--danger"
                style={{ padding: '10px 18px', borderRadius: radii.md }}
                disabled={!imageState.preview}
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        {imageState.preview ? (
          <div className="spotz-card" style={{ padding: 0, overflow: 'hidden', borderRadius: radii.lg }}>
            <img
              src={imageState.preview}
              alt="Selected spot"
              style={{ display: 'block', width: '100%', maxHeight: '240px', objectFit: 'cover' }}
            />
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onClose}
            className="spotz-btn spotz-btn--outline"
            style={{ padding: '10px 18px', borderRadius: radii.md }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="spotz-btn spotz-btn--primary"
            style={{ padding: '12px 18px', borderRadius: radii.md, fontSize: '16px' }}
          >
            {submitting ? 'Saving…' : mode === 'create' ? 'Add spot' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function MapPage() {
  const location = useLocation();
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
            error instanceof Error ? error.message : 'Failed to load spots. Please try again.';
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
      values: { name: '', description: '', status: 'public', image: null, tags: [] },
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
      setFormError('Name is required.');
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
      setNotification({ type: 'success', message: 'Spot added successfully.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create spot.';
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

    if (values.imageChanged) {
      updates.image = values.image ?? null;
    }

    if (!areTagListsEqual(values.tags, target.tags ?? [])) {
      updates.tags = values.tags;
    }

    if (Object.keys(updates).length === 0) {
      setFormError('No changes to save.');
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
      setNotification({ type: 'success', message: 'Spot updated successfully.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update spot.';
      setFormError(message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteSpot = async (spot: Spot) => {
    if (!window.confirm(`Delete "${spot.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await apiFetch(`/spots/${spot.id}`, { method: 'DELETE' });
      setSpots((current) => current.filter((item) => item.id !== spot.id));
      setSelectedSpotId(null);
      setNotification({ type: 'success', message: 'Spot removed.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete spot.';
      setNotification({ type: 'error', message });
    }
  };

  const handleToggleLike = async (spot: Spot) => {
    if (!currentUser) {
      setNotification({ type: 'error', message: 'You need to be signed in to like spots.' });
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
      const message = error instanceof Error ? error.message : 'Unable to update like.';
      setSpots((current) => current.map((item) => (item.id === spot.id ? spot : item)));
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
                Shared by {selectedSpot.owner.username} ·{' '}
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
                  {selectedSpot.status === 'public' ? 'Public' : 'Private'}
                </span>
              </span>
            </div>
          </div>

          {selectedSpot.image ? (
            <img
              src={selectedSpot.image}
              alt={selectedSpot.name}
              style={{ width: '100%', borderRadius: radii.md, maxHeight: '180px', objectFit: 'cover' }}
            />
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
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
                {liked ? 'Unlike' : 'Like'} · {selectedSpot.likesCount}
              </button>
            ) : (
              <span
                className="spotz-chip"
                style={{ background: palette.dangerSoft, color: palette.danger }}
                aria-label={`${selectedSpot.likesCount} likes`}
              >
                ❤ {selectedSpot.likesCount}
              </span>
            )}

            {canManageSpot(selectedSpot) ? (
              <div style={{ display: 'flex', gap: '8px' }}>
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
                        tags: [...(selectedSpot.tags ?? [])],
                      },
                    });
                  }}
                  className="spotz-btn spotz-btn--outline"
                  style={{ padding: '8px 14px', borderRadius: radii.md }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSpot(selectedSpot)}
                  className="spotz-btn spotz-btn--danger"
                  style={{ padding: '8px 14px', borderRadius: radii.md }}
                >
                  Delete
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
        Failed to load Google Maps. Please check your API key.
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
            background: 'rgba(15, 23, 42, 0.82)',
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
            <h2 style={{ margin: 0, fontSize: '16px', color: palette.textPrimary }}>Map filters</h2>
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
              Clear
            </button>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
            Visibility
            <select
              value={statusFilter}
              onChange={(event) => handleStatusFilterChange(event.target.value)}
              className="spotz-input"
              style={{ cursor: 'pointer' }}
            >
              <option value="all">All spots</option>
              <option value="public">Public only</option>
              <option value="private" disabled={!canSeePrivate}>
                Private only
              </option>
              <option value="mine" disabled={!canSeePrivate}>
                Only my spots
              </option>
            </select>
            {!canSeePrivate ? (
              <span style={{ fontSize: '11px', color: palette.textMuted }}>
                Sign in to view private or personal spots.
              </span>
            ) : null}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
            Owner
            <select
              value={ownerFilterValue}
              onChange={(event) => handleOwnerFilterChange(event.target.value)}
              className="spotz-input"
              style={{ cursor: 'pointer' }}
            >
              <option value="any">Any owner</option>
              {currentUser ? <option value="me">Only me</option> : null}
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={String(owner.id)}>
                  {owner.username}
                  {currentUser && owner.id === currentUser.id ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
            <span>Category</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={tagFilterInput}
                onChange={(event) => handleTagFilterInputChange(event.target.value)}
                onKeyDown={handleTagFilterKeyDown}
                placeholder="#nature"
                className="spotz-input"
                style={{ flex: 1 }}
                list="map-tag-options"
              />
              <button
                type="button"
                onClick={handleTagFilterApply}
                className="spotz-btn spotz-btn--outline"
                style={{ padding: '8px 14px', borderRadius: radii.md }}
              >
                Apply
              </button>
            </div>
            {tagFilter ? (
              <span style={{ fontSize: '12px', color: palette.accent }}>
                Filtering by <strong>{tagFilter}</strong>
              </span>
            ) : (
              <span style={{ fontSize: '12px', color: palette.textMuted }}>
                Choose a tag or enter your own to highlight matching spots.
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
          <span style={{ color: palette.textSecondary, fontWeight: 600 }}>Loading map…</span>
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
              background: 'rgba(15, 23, 42, 0.88)',
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
                          background: active ? 'rgba(34, 197, 94, 0.18)' : 'rgba(15, 23, 42, 0.6)',
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
            background: 'rgba(15, 23, 42, 0.12)',
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
            Loading spots…
          </div>
        </div>
      ) : null}

      <SpotFormModal
        title={formState?.mode === 'edit' ? 'Edit spot' : 'Add spot'}
        open={Boolean(formState)}
        onClose={handleCloseForm}
        onSubmit={formState?.mode === 'edit' ? handleEditSubmit : handleCreateSubmit}
        initialValues={
          formState
            ? formState.values
            : { name: '', description: '', status: 'public', image: null, tags: [] }
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
