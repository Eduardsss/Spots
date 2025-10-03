import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SpotImageCarousel } from '../components/SpotImageCarousel';
import { TagInput } from '../components/TagInput';
import { apiFetch } from '../lib/api';
import { areTagListsEqual, mergeTagLists, MAX_TAGS_PER_SPOT } from '../lib/tags';
import { palette, radii, shadows } from '../styles/theme';

type Spot = {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  images?: string[];
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
  tags: string[];
  images: string[];
};

type SpotFormSubmission = SpotFormValues;

type TagsResponse = {
  tags: string[];
};

const MAX_IMAGES_PER_SPOT = 6;

const areImageListsEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
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
  maxImages = MAX_IMAGES_PER_SPOT,
}: {
  open: boolean;
  spot: Spot | null;
  onClose: () => void;
  onSubmit: (values: SpotFormSubmission) => void;
  submitting: boolean;
  error: string | null;
  availableTags: string[];
  maxTags?: number;
  maxImages?: number;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'public' | 'private'>('public');
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const tagLimit = maxTags ?? MAX_TAGS_PER_SPOT;

  useEffect(() => {
    if (!open || !spot) {
      return;
    }

    setName(spot.name);
    setDescription(spot.description ?? '');
    setStatus(spot.status);
    setTags([...(spot.tags ?? [])]);
    setImages([...(spot.images ?? [])]);
  }, [open, spot]);

  if (!open || !spot) {
    return null;
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) {
      return;
    }

    const remainingSlots = Math.max(0, maxImages - images.length);
    if (remainingSlots === 0) {
      return;
    }

    const selected = Array.from(fileList).slice(0, remainingSlots);
    const converted: string[] = [];
    for (const file of selected) {
      try {
        const base64 = await fileToBase64(file);
        if (base64.trim()) {
          converted.push(base64.trim());
        }
      } catch (err) {
        console.error('Failed to convert image', err);
      }
    }

    if (converted.length > 0) {
      setImages((current) => [...current, ...converted].slice(0, maxImages));
    }
    event.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setImages((current) => current.filter((_, idx) => idx !== index));
  };

  const handleMoveImage = (index: number, direction: -1 | 1) => {
    setImages((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) {
        return next;
      }
      const [value] = next.splice(index, 1);
      next.splice(target, 0, value);
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description,
      status,
      tags,
      images,
    });
  };

  const disableAdd = images.length >= maxImages;

  return (
    <div className="spotz-modal-overlay" role="dialog" aria-modal="true">
      <div className="spotz-modal" style={{ width: 'min(640px, 100%)' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: palette.textPrimary }}>Images</span>
              <span style={{ fontSize: '12px', color: palette.textMuted }}>
                {images.length}/{maxImages} selected
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {images.map((preview, index) => (
                <div
                  key={`${preview}-${index}`}
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: radii.md,
                    overflow: 'hidden',
                    border: `1px solid ${palette.border}`,
                    position: 'relative',
                    background: palette.surfaceAlt,
                  }}
                >
                  <img
                    src={preview}
                    alt={`Spot image ${index + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="spotz-btn spotz-btn--danger"
                      style={{ padding: '4px 6px', fontSize: '12px', borderRadius: radii.pill }}
                    >
                      ✕
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => handleMoveImage(index, -1)}
                        disabled={index === 0}
                        className="spotz-btn spotz-btn--ghost"
                        style={{ padding: '2px 6px', fontSize: '12px', borderRadius: radii.pill, opacity: index === 0 ? 0.5 : 1 }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveImage(index, 1)}
                        disabled={index === images.length - 1}
                        className="spotz-btn spotz-btn--ghost"
                        style={{ padding: '2px 6px', fontSize: '12px', borderRadius: radii.pill, opacity: index === images.length - 1 ? 0.5 : 1 }}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <label className="spotz-btn spotz-btn--outline" style={{ padding: '10px 18px', alignSelf: 'flex-start' }}>
              {disableAdd ? 'Image limit reached' : 'Add image'}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                style={{ display: 'none' }}
                disabled={disableAdd}
              />
            </label>
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

      <div style={{ width: '240px', flexShrink: 0 }}>
        <SpotImageCarousel images={spot.images ?? []} height={220} borderRadius={radii.lg} />
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
      const normalized = (data.spots ?? []).map((spot) => ({
        ...spot,
        images: Array.isArray(spot.images) ? spot.images : [],
      }));
      setSpots(normalized);
      if (normalized.length) {
        const collected = normalized.flatMap((spot) => spot.tags ?? []);
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

      const trimmedName = values.name.trim();
      if (!trimmedName) {
        setEditError('Name is required.');
        return;
      }

      const payload: Record<string, unknown> = {};

      if (trimmedName !== editingSpot.name) {
        payload.name = trimmedName;
      }

      const normalizedDescription = values.description.trim();
      if (normalizedDescription !== (editingSpot.description ?? '')) {
        payload.description = normalizedDescription ? normalizedDescription : null;
      }

      if (values.status !== editingSpot.status) {
        payload.status = values.status;
      }

      if (!areTagListsEqual(values.tags, editingSpot.tags ?? [])) {
        payload.tags = values.tags;
      }

      if (!areImageListsEqual(values.images, editingSpot.images ?? [])) {
        payload.images = values.images;
      }

      if (Object.keys(payload).length === 0) {
        setEditError('No changes to save.');
        return;
      }

      setSaving(true);
      setEditError(null);

      try {
        const data = await apiFetch<{ spot: Spot }>(`/spots/${editingSpot.id}`, {
          method: 'PUT',
          body: payload,
        });

        const updatedSpot = {
          ...data.spot,
          images: Array.isArray(data.spot.images) ? data.spot.images : [],
        };

        setSpots((current) =>
          current.map((item) => (item.id === updatedSpot.id ? { ...item, ...updatedSpot } : item))
        );
        setAvailableTags((current) => mergeTagLists(current, updatedSpot.tags ?? []));
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
        maxImages={MAX_IMAGES_PER_SPOT}
      />
    </div>
  );
}
