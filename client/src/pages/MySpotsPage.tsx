import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SpotGallery } from '../components/SpotGallery';
import SaveToCollectionModal from '../components/SaveToCollectionModal';
import { TagInput } from '../components/TagInput';
import { apiFetch } from '../lib/api';
import { areTagListsEqual, mergeTagLists, MAX_TAGS_PER_SPOT } from '../lib/tags';
import { palette, radii, shadows } from '../styles/theme';

// Šī lapa ļauj lietotājam pārvaldīt savus personīgos spotus un kolekcijas.
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
    reader.onerror = () => reject(reader.error ?? new Error('Neizdevās nolasīt failu'));
    reader.readAsDataURL(file);
  });
}

// Modālais logs spotu rediģēšanai ar galerijas un tagu pārvaldību.
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
  // Glabājam formā ievadītās vērtības, lai tās varētu iesniegt API.
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
    // Modālis tiek parādīts virs lapas, kad lietotājs rediģē izvēlēto spotu.
    <div className="spotz-modal-overlay" role="dialog" aria-modal="true">
      <div className="spotz-modal" style={{ width: 'min(600px, 100%)' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '24px', color: palette.textPrimary }}>Rediģēt spotu</h2>
          <button
            type="button"
            onClick={onClose}
            className="spotz-btn spotz-btn--ghost"
            style={{ padding: '6px 12px', borderRadius: radii.pill }}
            aria-label="Aizvērt"
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Nosaukums</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="spotz-input"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Apraksts</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="spotz-input"
              style={{ resize: 'vertical' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Statuss</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'public' | 'private')}
              className="spotz-input"
              style={{ appearance: 'none' }}
            >
              <option value="public">Publisks</option>
              <option value="private">Privāts</option>
            </select>
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Tagi</span>
            <TagInput
              value={tags}
              onChange={setTags}
              suggestions={availableTags}
              maxTags={tagLimit}
              placeholder="Pievieno tagus, piemēram, #saullēkts"
            />
            <span style={{ fontSize: '12px', color: palette.textMuted }}>
              Var pievienot līdz {tagLimit} tagiem, lai aprakstītu šo spotu.
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
              Atcelt
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="spotz-btn spotz-btn--primary"
              style={{ padding: '12px 24px', borderRadius: radii.md }}
            >
              {submitting ? 'Saglabājam…' : 'Saglabāt izmaiņas'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Atsevišķa kartīte, kas attēlo vienu no lietotāja spotiem ar darbības pogām.
function SpotCard({
  spot,
  onShow,
  onEdit,
  onDelete,
  onSave,
}: {
  spot: Spot;
  onShow: (spot: Spot) => void;
  onEdit: (spot: Spot) => void;
  onDelete: (spot: Spot) => void;
  onSave: (spot: Spot) => void;
}) {
  const statusIsPublic = spot.status === 'public';
  const galleryImages =
    Array.isArray(spot.images) && spot.images.length
      ? spot.images
      : spot.image
      ? [spot.image]
      : [];
  // Normalizējam tagu sarakstu, lai to būtu viegli attēlot.
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
            {statusIsPublic ? 'Publisks' : 'Privāts'}
          </span>
        </div>
        <p style={{ margin: 0, color: palette.textSecondary, lineHeight: 1.6 }}>
          {spot.description && spot.description.trim().length > 0
            ? spot.description
            : 'Apraksts nav pievienots.'}
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
            Rediģēt
          </button>
          <button
            type="button"
            onClick={() => onSave(spot)}
            className="spotz-btn spotz-btn--outline"
            style={{ padding: '10px 20px', borderRadius: radii.pill, color: palette.accent }}
          >
            Saglabāt kolekcijā
          </button>
          <button
            type="button"
            onClick={() => onShow(spot)}
            className="spotz-btn spotz-btn--outline"
            style={{ padding: '10px 20px', borderRadius: radii.pill, color: palette.accent }}
          >
            Parādīt kartē
          </button>
          <button
            type="button"
            onClick={() => onDelete(spot)}
            className="spotz-btn spotz-btn--danger"
            style={{ padding: '10px 20px', borderRadius: radii.pill }}
          >
            Dzēst
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
  // Stāvokļi, kas nepieciešami manu spotu saraksta, modāļu un paziņojumu pārvaldīšanai.
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [collectionSpot, setCollectionSpot] = useState<Spot | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
    // Ielādē lietotāja privātos un publiskos spotus no API.
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
      setError(err instanceof Error ? err.message : 'Neizdevās ielādēt spotus');
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
    // Nodrošina apstiprinājumu un dzēš spotu gan no servera, gan lokālā saraksta.
    async (spot: Spot) => {
      const confirmed = window.confirm(`Vai tiešām dzēst "${spot.name}"? Šo darbību nevarēs atsaukt.`);
      if (!confirmed) {
        return;
      }

      try {
        await apiFetch(`/spots/${spot.id}`, { method: 'DELETE' });
        setSpots((current) => current.filter((item) => item.id !== spot.id));
      } catch (err) {
        console.error('Failed to delete spot', err);
        alert('Neizdevās dzēst spotu. Lūdzu, mēģini vēlreiz.');
      }
    },
    []
  );

  const handleStartEdit = useCallback((spot: Spot) => {
    setEditError(null);
    setEditingSpot(spot);
  }, []);

  const handleSaveToCollection = useCallback((spot: Spot) => {
    setCollectionSpot(spot);
  }, []);

  useEffect(() => {
    if (!statusMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setStatusMessage(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [statusMessage]);

  const handleSubmitEdit = useCallback(
    // Apstrādā modāļa formu un nosūta izmaiņas uz serveri.
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
        setEditError(err instanceof Error ? err.message : 'Neizdevās atjaunināt spotu');
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
        <h3 style={{ margin: 0, fontSize: '24px', color: palette.textPrimary }}>Vēl nav spotu</h3>
        <p style={{ margin: '12px 0 0', color: palette.textSecondary }}>
          Sāc, pievienojot jaunu punktu kartē, un tas parādīsies šeit.
        </p>
      </div>
    ),
    []
  );

  // Galvenais saturs: virsraksts, stāvokļa paziņojumi un saraksts ar lietotāja spotiem.
  return (
    <div style={{ padding: '40px clamp(16px, 4vw, 48px) 80px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', color: palette.textPrimary }}>Mani spoti</h1>
          <p style={{ margin: '12px 0 0', color: palette.textSecondary }}>
            Pārvaldi un sakārto savus mīļākos atklājumus vienuviet.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchSpots}
          className="spotz-btn spotz-btn--primary"
          style={{ padding: '12px 24px', borderRadius: radii.pill }}
        >
          Atsvaidzināt
        </button>
      </header>

      {statusMessage ? (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: radii.lg,
            background: palette.successSoft,
            color: palette.success,
            border: `1px solid ${palette.success}`,
            fontWeight: 500,
          }}
        >
          {statusMessage}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: palette.textSecondary }}>Ielādējam tavus spotus…</p>
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
            // Katrā kartītē ieliekam atsauces uz darbībām (rediģēt, dzēst, saglabāt kolekcijā).
            <SpotCard
              key={spot.id}
              spot={spot}
              onShow={handleShowSpot}
              onEdit={handleStartEdit}
              onDelete={handleDeleteSpot}
              onSave={handleSaveToCollection}
            />
          ))}
        </div>
      )}

      {/* Modālis, kas ļauj pievienot spotu izvēlētai kolekcijai. */}
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
