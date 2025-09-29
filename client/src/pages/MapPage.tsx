import {
  ChangeEvent,
  FormEvent,
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
import { apiFetch } from '../lib/api';
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
};

type SpotFormValues = {
  name: string;
  description: string;
  status: 'public' | 'private';
  image: string | null;
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

type NotificationState = {
  type: 'success' | 'error';
  message: string;
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

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'spotz-map-loader',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const latParam = parseFloat(params.get('lat') ?? '');
    const lngParam = parseFloat(params.get('lng') ?? '');

    if (!Number.isNaN(latParam) && !Number.isNaN(lngParam)) {
      setCenter({ lat: latParam, lng: lngParam });
    }
  }, [location.search]);

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
    let ignore = false;

    const fetchSpots = async () => {
      setLoading(true);
      setFetchError('');
      try {
        const response = await apiFetch<SpotsResponse>('/spots');
        if (!ignore) {
          setSpots(response.spots ?? []);
        }
      } catch (error) {
        if (!ignore) {
          const message =
            error instanceof Error ? error.message : 'Failed to load spots. Please try again.';
          setFetchError(message);
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
  }, []);

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
      values: { name: '', description: '', status: 'public', image: null },
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
      };

      const response = await apiFetch<CreateSpotResponse>('/spots', {
        method: 'POST',
        body,
      });

      setSpots((current) => [...current, response.spot]);
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

      {fetchError ? (
        <div
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            padding: '12px 18px',
            borderRadius: radii.md,
            background: palette.dangerSoft,
            color: palette.danger,
            fontWeight: 600,
            zIndex: 15,
            boxShadow: shadows.soft,
          }}
        >
          {fetchError}
        </div>
      ) : null}

      {isLoaded ? (
        <div style={MAP_WRAPPER_STYLE}>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={12}
            options={MAP_OPTIONS}
            onClick={handleMapClick}
          >
            {spots.map((spot) => (
              <Marker
                key={spot.id}
                position={{ lat: spot.lat, lng: spot.lng }}
                onClick={() => setSelectedSpotId(spot.id)}
              />
            ))}
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
            : { name: '', description: '', status: 'public', image: null }
        }
        submitting={formSubmitting}
        error={formError}
        mode={formState?.mode ?? 'create'}
        position={formState?.mode === 'create' ? formState.position : undefined}
      />
    </div>
  );
}
