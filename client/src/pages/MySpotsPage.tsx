import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SpotGallery } from '../components/SpotGallery';
import { TagInput } from '../components/TagInput';
import { apiFetch } from '../lib/api';
import { areTagListsEqual, mergeTagLists, MAX_TAGS_PER_SPOT } from '../lib/tags';
import { palette, radii, shadows } from '../styles/theme';

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
  created_at: string;
  tags: string[];
};

type SpotsResponse = {
  spots: Spot[];
};

type SpotFormValues = {
  name: string;
  description: string;
  status: 'public' | 'private';
  image: string | null;
  images: string[];
  tags: string[];
};

type SpotFormSubmission = SpotFormValues & {
  imagesChanged: boolean;
};

type TagsResponse = {
  tags: string[];
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
  availableTags,
  maxTags,
}: {
  open: boolean;
  spot: Spot | null;
  onClose: () => void;
  onSubmit: (values: SpotFormSubmission) => void;
  submitting: boolean;
  error: string | null;
  availableTags: string[];
  maxTags?: number;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'public' | 'private'>('public');
  const [galleryState, setGalleryState] = useState<{
    previews: string[];
    changed: boolean;
  }>({ previews: [], changed: false });
  const [tags, setTags] = useState<string[]>([]);
  const tagLimit = maxTags ?? MAX_TAGS_PER_SPOT;

  useEffect(() => {
    if (!open || !spot) {
      return;
    }

    setName(spot.name);
    setDescription(spot.description ?? '');
    setStatus(spot.status);
    const images = Array.isArray(spot.images) && spot.images.length
      ? [...spot.images]
      : spot.image
      ? [spot.image]
      : [];
    setGalleryState({ previews: images, changed: false });
    setTags([...(spot.tags ?? [])]);
  }, [open, spot]);

  if (!open || !spot) {
    return null;
  }

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
      description,
      status,
      image: galleryState.previews[0] ?? null,
      images: galleryState.previews,
      tags,
      imagesChanged: galleryState.changed,
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Tags</span>
            <TagInput
              value={tags}
              onChange={setTags}
              suggestions={availableTags}
              maxTags={tagLimit}
              placeholder="Add categories like #sunrise"
            />
            <span style={{ fontSize: '12px', color: palette.textMuted }}>
              Use up to {tagLimit} tags to describe this spot.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Fotogrāfijas</span>
            {galleryState.previews.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    borderRadius: radii.md,
                    overflow: 'hidden',
                    boxShadow: shadows.soft,
                    border: `1px solid ${palette.border}`,
                  }}
                >
                  <img
                    src={galleryState.previews[0]}
                    alt={spot.name}
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
                          width: 88,
                          height: 88,
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
                            top: 4,
                            right: 4,
                            padding: '4px 6px',
                            borderRadius: radii.pill,
                            background: 'rgba(15, 23, 42, 0.6)',
                            color: 'white',
                            fontSize: '12px',
                          }}
                        >
                          ×
                        </button>
                        {index === 0 ? (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: 4,
                              left: 4,
                              padding: '2px 6px',
                              borderRadius: radii.pill,
                              background: 'rgba(15, 23, 42, 0.6)',
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
                  minHeight: 120,
                  borderRadius: radii.md,
                  border: `1px dashed ${palette.border}`,
                  background: palette.surfaceAlt,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: palette.textMuted,
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
  const galleryImages =
    Array.isArray(spot.images) && spot.images.length
      ? spot.images
      : spot.image
      ? [spot.image]
      : [];
  const tagList = Array.isArray(spot.tags) ? spot.tags : [];

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
        {tagList.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {tagList.map((tag) => (
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

      <div style={{ width: 'min(260px, 100%)', flexShrink: 0 }}>
        <SpotGallery images={galleryImages} title={spot.name} height={220} />
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
  const [availableTags, setAvailableTags] = useState<string[]>([]);

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

  const fetchSpots = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<SpotsResponse>('/spots?status=mine');
      setSpots(data.spots);
      if (data.spots?.length) {
        const collected = data.spots.flatMap((spot) => spot.tags ?? []);
        if (collected.length) {
          setAvailableTags((current) => mergeTagLists(current, collected));
        }
      }
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

      if (values.imagesChanged) {
        payload.image = values.image;
        payload.images = values.images;
      }

      if (!areTagListsEqual(values.tags, editingSpot.tags ?? [])) {
        payload.tags = values.tags;
      }

      try {
        const data = await apiFetch<{ spot: Spot }>(`/spots/${editingSpot.id}`, {
          method: 'PUT',
          body: payload,
        });

        setSpots((current) =>
          current.map((item) => (item.id === data.spot.id ? { ...item, ...data.spot } : item))
        );
        setAvailableTags((current) => mergeTagLists(current, data.spot.tags ?? []));
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
        availableTags={availableTags}
        maxTags={MAX_TAGS_PER_SPOT}
      />
    </div>
  );
}
