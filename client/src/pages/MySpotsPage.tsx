import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SpotGallery } from '../components/SpotGallery';
import SaveToCollectionModal from '../components/SaveToCollectionModal';
import { SpotFormModal, type SpotFormValues, type SpotFormSubmission } from '../components/SpotFormModal';
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

type TagsResponse = {
  tags: string[];
};

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
  // Normalizē tagu sarakstu, lai to būtu viegli attēlot.
  const tagList = Array.isArray(spot.tags) ? spot.tags : [];

  return (
    <article
      className="spotz-card spotz-myspot-card"
      style={{
        display: 'flex',
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

      <div className="spotz-myspot-img">
        <SpotGallery images={galleryImages} title={spot.name} height={220} />
      </div>
    </article>
  );
}

export default function MySpotsPage() {
  const navigate = useNavigate();
  // Stāvokļi, kas nepieciešami manu spotu sarakstam.
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
        payload.images = values.images;
      }

      if (!areTagListsEqual(values.tags, editingSpot.tags ?? [])) {
        payload.tags = values.tags;
      }

      try {
        const data = await apiFetch<{ spot: Spot }>(`/spots/${editingSpot.id}`, {
          method: 'PUT',
          body: payload,
          timeoutMs: 120_000,
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
      <style>{`
        .spotz-myspot-card { flex-direction: row; }
        .spotz-myspot-img { width: min(260px, 100%); flex-shrink: 0; }
        @media (max-width: 640px) {
          .spotz-myspot-card { flex-direction: column-reverse; }
          .spotz-myspot-img { width: 100%; }
        }
      `}</style>
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

      <SpotFormModal
        title="Rediģēt spotu"
        open={Boolean(editingSpot)}
        onClose={() => setEditingSpot(null)}
        onSubmit={handleSubmitEdit}
        initialValues={editingSpot ? {
          name: editingSpot.name,
          description: editingSpot.description ?? '',
          status: editingSpot.status,
          image: editingSpot.image,
          images: Array.isArray(editingSpot.images) && editingSpot.images.length
            ? [...editingSpot.images]
            : editingSpot.image ? [editingSpot.image] : [],
          tags: [...(editingSpot.tags ?? [])],
        } : { name: '', description: '', status: 'public', image: null, images: [], tags: [] }}
        submitting={saving}
        error={editError ?? ''}
        mode="edit"
        availableTags={availableTags}
        maxTags={MAX_TAGS_PER_SPOT}
      />
    </div>
  );
}
