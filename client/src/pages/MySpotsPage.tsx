import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { palette, radii, shadows } from '../styles/theme';

type Spot = {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  image: string | null;
  lat: number;
  lng: number;
  status: 'public' | 'private';
  created_at: string;
};

type SpotsResponse = {
  spots: Spot[];
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

function EditSpotModal({
  open,
  spot,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  open: boolean;
  spot: Spot | null;
  onClose: () => void;
  onSubmit: (values: SpotFormSubmission) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'public' | 'private'>('public');
  const [imageState, setImageState] = useState<{
    preview: string | null;
    value: string | null;
    changed: boolean;
  }>({ preview: null, value: null, changed: false });

  useEffect(() => {
    if (!open || !spot) {
      return;
    }

    setName(spot.name);
    setDescription(spot.description ?? '');
    setStatus(spot.status);
    setImageState({ preview: spot.image ?? null, value: spot.image ?? null, changed: false });
  }, [open, spot]);

  if (!open || !spot) {
    return null;
  }

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
    }
  };

  const handleRemoveImage = () => {
    setImageState({ preview: null, value: null, changed: true });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description,
      status,
      image: imageState.value,
      imageChanged: imageState.changed,
    });
  };

  return (
    <div className="spotz-modal-overlay" role="dialog" aria-modal="true">
      <div className="spotz-modal" style={{ width: 'min(600px, 100%)' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '24px', color: palette.textPrimary }}>Edit Spot</h2>
          <button
            type="button"
            onClick={onClose}
            className="spotz-btn spotz-btn--ghost"
            style={{ padding: '6px 12px', borderRadius: radii.pill }}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Name</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="spotz-input"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="spotz-input"
              style={{ resize: 'vertical' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'public' | 'private')}
              className="spotz-input"
              style={{ appearance: 'none' }}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Image</span>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div
                style={{
                  width: '82px',
                  height: '82px',
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
                    alt={spot.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ color: palette.textMuted, fontSize: '12px' }}>No image</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <label className="spotz-btn spotz-btn--outline" style={{ padding: '10px 18px' }}>
                  {imageState.preview ? 'Replace image' : 'Choose image'}
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

            {imageState.preview ? (
              <div className="spotz-card" style={{ padding: 0, overflow: 'hidden', borderRadius: radii.lg }}>
                <img
                  src={imageState.preview}
                  alt={spot.name}
                  style={{ width: '100%', maxHeight: '240px', objectFit: 'cover' }}
                />
              </div>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              style={{
                padding: '12px 16px',
                borderRadius: radii.md,
                background: palette.dangerSoft,
                color: palette.danger,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onClose}
              className="spotz-btn spotz-btn--ghost"
              style={{ padding: '10px 20px', borderRadius: radii.md }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="spotz-btn spotz-btn--primary"
              style={{ padding: '12px 24px', borderRadius: radii.md }}
            >
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function SpotCard({
  spot,
  onShow,
  onEdit,
  onDelete,
}: {
  spot: Spot;
  onShow: (spot: Spot) => void;
  onEdit: (spot: Spot) => void;
  onDelete: (spot: Spot) => void;
}) {
  const statusIsPublic = spot.status === 'public';

  return (
    <article
      className="spotz-card"
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '24px',
        alignItems: 'stretch',
        padding: '24px',
        borderRadius: radii.xl,
        boxShadow: shadows.soft,
        border: `1px solid ${palette.border}`,
        background: palette.surface,
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: '22px', color: palette.textPrimary }}>{spot.name}</h3>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: radii.pill,
              background: statusIsPublic
                ? palette.accentGradientSoft
                : 'linear-gradient(135deg, rgba(14, 116, 144, 0.18), rgba(8, 145, 178, 0.22))',
              color: statusIsPublic ? palette.accentStrong : palette.textSecondary,
              fontWeight: 600,
              fontSize: '14px',
              textTransform: 'capitalize',
            }}
          >
            {spot.status}
          </span>
        </div>
        <p style={{ margin: 0, color: palette.textSecondary, lineHeight: 1.6 }}>
          {spot.description && spot.description.trim().length > 0
            ? spot.description
            : 'No description provided.'}
        </p>
        <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onEdit(spot)}
            className="spotz-btn spotz-btn--primary"
            style={{ padding: '10px 20px', borderRadius: radii.pill }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onShow(spot)}
            className="spotz-btn spotz-btn--outline"
            style={{ padding: '10px 20px', borderRadius: radii.pill, color: palette.accent }}
          >
            Show Spot
          </button>
          <button
            type="button"
            onClick={() => onDelete(spot)}
            className="spotz-btn spotz-btn--danger"
            style={{ padding: '10px 20px', borderRadius: radii.pill }}
          >
            Delete
          </button>
        </div>
      </div>

      <div
        style={{
          width: '240px',
          borderRadius: radii.lg,
          overflow: 'hidden',
          background: statusIsPublic
            ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(29, 78, 216, 0.2))'
            : 'linear-gradient(135deg, rgba(14, 116, 144, 0.24), rgba(8, 145, 178, 0.26))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {spot.image ? (
          <img
            src={spot.image}
            alt={spot.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ color: palette.textMuted, fontWeight: 700, letterSpacing: '0.08em' }}>Spotz</span>
        )}
      </div>
    </article>
  );
}
export default function MySpotsPage() {
  const navigate = useNavigate();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchSpots = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<SpotsResponse>('/spots?status=mine');
      setSpots(data.spots);
    } catch (err) {
      console.error('Failed to load spots', err);
      setError(err instanceof Error ? err.message : 'Failed to load spots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  const handleShowSpot = useCallback(
    (spot: Spot) => {
      navigate(`/map?lat=${encodeURIComponent(spot.lat)}&lng=${encodeURIComponent(spot.lng)}`);
    },
    [navigate]
  );

  const handleDeleteSpot = useCallback(
    async (spot: Spot) => {
      const confirmed = window.confirm(`Delete "${spot.name}"? This cannot be undone.`);
      if (!confirmed) {
        return;
      }

      try {
        await apiFetch(`/spots/${spot.id}`, { method: 'DELETE' });
        setSpots((current) => current.filter((item) => item.id !== spot.id));
      } catch (err) {
        console.error('Failed to delete spot', err);
        alert('Failed to delete the spot. Please try again.');
      }
    },
    []
  );

  const handleStartEdit = useCallback((spot: Spot) => {
    setEditError(null);
    setEditingSpot(spot);
  }, []);

  const handleSubmitEdit = useCallback(
    async (values: SpotFormSubmission) => {
      if (!editingSpot) {
        return;
      }

      setSaving(true);
      setEditError(null);

      const payload: Record<string, unknown> = {
        name: values.name,
        description: values.description,
        status: values.status,
      };

      if (values.imageChanged) {
        payload.image = values.image;
      }

      try {
        const data = await apiFetch<{ spot: Spot }>(`/spots/${editingSpot.id}`, {
          method: 'PUT',
          body: payload,
        });

        setSpots((current) =>
          current.map((item) => (item.id === data.spot.id ? { ...item, ...data.spot } : item))
        );
        setEditingSpot(null);
      } catch (err) {
        console.error('Failed to update spot', err);
        setEditError(err instanceof Error ? err.message : 'Failed to update spot');
      } finally {
        setSaving(false);
      }
    },
    [editingSpot]
  );

  const emptyState = useMemo(
    () => (
      <div
        className="spotz-card"
        style={{
          padding: '64px 24px',
          textAlign: 'center',
          background: palette.surface,
          borderRadius: radii.xl,
          border: `1px dashed ${palette.border}`,
        }}
      >
        <h3 style={{ margin: 0, fontSize: '24px', color: palette.textPrimary }}>No spots yet</h3>
        <p style={{ margin: '12px 0 0', color: palette.textSecondary }}>
          Start by adding a new spot on the map to see it listed here.
        </p>
      </div>
    ),
    []
  );

  return (
    <div style={{ padding: '40px clamp(16px, 4vw, 48px) 80px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', color: palette.textPrimary }}>My Spots</h1>
          <p style={{ margin: '12px 0 0', color: palette.textSecondary }}>
            Manage and curate your personal collection of hidden gems.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchSpots}
          className="spotz-btn spotz-btn--primary"
          style={{ padding: '12px 24px', borderRadius: radii.pill }}
        >
          Refresh
        </button>
      </header>

      {loading ? (
        <p style={{ color: palette.textSecondary }}>Loading your spots…</p>
      ) : error ? (
        <div
          role="alert"
          style={{
            padding: '16px 20px',
            borderRadius: radii.lg,
            background: palette.dangerSoft,
            color: palette.danger,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      ) : spots.length === 0 ? (
        emptyState
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {spots.map((spot) => (
            <SpotCard
              key={spot.id}
              spot={spot}
              onShow={handleShowSpot}
              onEdit={handleStartEdit}
              onDelete={handleDeleteSpot}
            />
          ))}
        </div>
      )}

      <EditSpotModal
        open={Boolean(editingSpot)}
        spot={editingSpot}
        onClose={() => setEditingSpot(null)}
        onSubmit={handleSubmitEdit}
        submitting={saving}
        error={editError}
      />
    </div>
  );
}
