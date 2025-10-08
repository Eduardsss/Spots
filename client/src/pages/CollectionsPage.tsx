import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { SpotGallery } from '../components/SpotGallery';
import { apiFetch } from '../lib/api';
import { palette, radii, shadows, transitions } from '../styles/theme';

type CollectionVisibility = 'public' | 'private';

type CollectionSummary = {
  id: number;
  name: string;
  description: string | null;
  visibility: CollectionVisibility;
  spotsCount: number;
  created_at: string;
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
  created_at: string;
  likesCount: number;
  likedByCurrentUser?: boolean;
  tags: string[];
};

type CollectionsResponse = {
  collections: CollectionSummary[];
};

type CollectionResponse = {
  collection: CollectionSummary;
};

type CollectionSpotsResponse = {
  collection: {
    id: number;
    name: string;
    visibility: CollectionVisibility;
    spotsCount: number;
    isOwner: boolean;
  };
  spots: Spot[];
};

const VISIBILITY_LABELS: Record<CollectionVisibility, string> = {
  public: 'Publiska',
  private: 'Privāta',
};

export default function CollectionsPage() {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [updatingCollectionId, setUpdatingCollectionId] = useState<number | null>(null);
  const [deletingCollectionId, setDeletingCollectionId] = useState<number | null>(null);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newVisibility, setNewVisibility] = useState<CollectionVisibility>('private');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [activeCollectionId, setActiveCollectionId] = useState<number | null>(null);
  const [activeCollection, setActiveCollection] = useState<CollectionSummary | null>(null);
  const [collectionSpots, setCollectionSpots] = useState<Spot[]>([]);
  const [loadingSpots, setLoadingSpots] = useState(false);
  const [spotsError, setSpotsError] = useState<string | null>(null);
  const [removingSpotId, setRemovingSpotId] = useState<number | null>(null);

  const fetchCollections = useCallback(async () => {
    setLoadingCollections(true);
    setCollectionsError(null);
    try {
      const response = await apiFetch<CollectionsResponse>('/collections');
      const list = Array.isArray(response.collections) ? response.collections : [];
      setCollections(list);
      if (activeCollectionId && !list.some((collection) => collection.id === activeCollectionId)) {
        setActiveCollectionId(null);
        setActiveCollection(null);
        setCollectionSpots([]);
      }
    } catch (error) {
      console.error('Failed to load collections', error);
      setCollectionsError('Neizdevās ielādēt kolekcijas.');
      setCollections([]);
    } finally {
      setLoadingCollections(false);
    }
  }, [activeCollectionId]);

  useEffect(() => {
    void fetchCollections();
  }, [fetchCollections]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newName.trim()) {
      setCreateError('Lūdzu, ievadi kolekcijas nosaukumu.');
      return;
    }

    setCreateError(null);
    setCreating(true);

    try {
      const response = await apiFetch<CollectionResponse>('/collections', {
        method: 'POST',
        body: {
          name: newName.trim(),
          description: newDescription.trim() ? newDescription.trim() : undefined,
          visibility: newVisibility,
        },
      });

      if (response?.collection) {
        setCollections((current) => [response.collection, ...current]);
        setNewName('');
        setNewDescription('');
        setNewVisibility('private');
      }
    } catch (error) {
      console.error('Failed to create collection', error);
      setCreateError('Neizdevās izveidot kolekciju.');
    } finally {
      setCreating(false);
    }
  };

  const handleVisibilityChange = async (collection: CollectionSummary, visibility: CollectionVisibility) => {
    if (collection.visibility === visibility) {
      return;
    }

    setUpdatingCollectionId(collection.id);

    try {
      const response = await apiFetch<CollectionResponse>(`/collections/${collection.id}`, {
        method: 'PUT',
        body: { visibility },
      });

      if (response?.collection) {
        setCollections((current) =>
          current.map((item) => (item.id === response.collection.id ? response.collection : item))
        );
        if (activeCollectionId === collection.id) {
          setActiveCollection(response.collection);
        }
      }
    } catch (error) {
      console.error('Failed to update visibility', error);
    } finally {
      setUpdatingCollectionId(null);
    }
  };

  const handleDeleteCollection = async (collection: CollectionSummary) => {
    if (!window.confirm(`Vai tiešām dzēst kolekciju "${collection.name}"?`)) {
      return;
    }

    setDeletingCollectionId(collection.id);

    try {
      await apiFetch(`/collections/${collection.id}`, { method: 'DELETE' });
      setCollections((current) => current.filter((item) => item.id !== collection.id));
      if (activeCollectionId === collection.id) {
        setActiveCollectionId(null);
        setActiveCollection(null);
        setCollectionSpots([]);
      }
    } catch (error) {
      console.error('Failed to delete collection', error);
    } finally {
      setDeletingCollectionId(null);
    }
  };

  const fetchCollectionSpots = useCallback(
    async (collectionId: number) => {
      setLoadingSpots(true);
      setSpotsError(null);
      try {
        const response = await apiFetch<CollectionSpotsResponse>(`/collections/${collectionId}/spots`);
        setCollectionSpots(Array.isArray(response.spots) ? response.spots : []);

        setActiveCollection((current) => {
          const fromList = collections.find((item) => item.id === collectionId);
          const base = fromList ?? current ?? null;

          if (!response?.collection) {
            return base;
          }

          if (base) {
            return {
              ...base,
              name: response.collection.name,
              visibility: response.collection.visibility,
              spotsCount: response.collection.spotsCount,
            };
          }

          return {
            id: response.collection.id,
            name: response.collection.name,
            description: null,
            visibility: response.collection.visibility,
            spotsCount: response.collection.spotsCount,
            created_at: new Date().toISOString(),
          };
        });
      } catch (error) {
        console.error('Failed to load collection spots', error);
        setSpotsError('Neizdevās ielādēt kolekcijas saturu.');
      } finally {
        setLoadingSpots(false);
      }
    },
    [collections]
  );

  const handleSelectCollection = (collection: CollectionSummary) => {
    setActiveCollectionId(collection.id);
    setActiveCollection(collection);
    void fetchCollectionSpots(collection.id);
  };

  const handleRemoveSpot = async (collectionId: number, spotId: number) => {
    setRemovingSpotId(spotId);
    try {
      const response = await apiFetch<CollectionResponse>(`/collections/${collectionId}/spots/${spotId}`, {
        method: 'DELETE',
      });
      setCollectionSpots((current) => current.filter((spot) => spot.id !== spotId));
      if (response?.collection) {
        setCollections((current) =>
          current.map((item) => (item.id === response.collection.id ? response.collection : item))
        );
        if (activeCollectionId === response.collection.id) {
          setActiveCollection(response.collection);
        }
      }
    } catch (error) {
      console.error('Failed to remove spot from collection', error);
    } finally {
      setRemovingSpotId(null);
    }
  };

  const activeCollectionTitle = useMemo(() => {
    if (!activeCollection) {
      return 'Izvēlies kolekciju, lai redzētu tās saturu.';
    }
    return `Kolekcija: ${activeCollection.name}`;
  }, [activeCollection]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '24px clamp(16px, 4vw, 48px) 80px',
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '32px', color: palette.textPrimary }}>Kolekcijas</h1>
        <p style={{ margin: 0, color: palette.textSecondary }}>
          Veido tematiskus sarakstus saviem mīļākajiem spotiem un izvēlies, kuri no tiem ir publiski
          vai tikai tev redzami.
        </p>
      </header>

      <section
        style={{
          border: `1px solid ${palette.border}`,
          borderRadius: radii.xl,
          padding: '24px',
          background: palette.surface,
          boxShadow: shadows.soft,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '22px', color: palette.textPrimary }}>Izveidot jaunu kolekciju</h2>
        <form
          onSubmit={handleCreate}
          style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Nosaukums</span>
            <input
              required
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="spotz-input"
              placeholder="Romantiskie spoti Rīgā"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Apraksts (nav obligāts)</span>
            <textarea
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              className="spotz-input"
              rows={2}
              style={{ resize: 'vertical', minHeight: '72px' }}
              placeholder="Kur un ar ko šo kolekciju dalīsies?"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: palette.textPrimary }}>Redzamība</span>
            <select
              value={newVisibility}
              onChange={(event) => setNewVisibility(event.target.value as CollectionVisibility)}
              className="spotz-input"
              style={{ appearance: 'none' }}
            >
              <option value="private">Privāta</option>
              <option value="public">Publiska</option>
            </select>
          </label>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start' }}>
            <button
              type="submit"
              className="spotz-btn spotz-btn--primary"
              style={{ padding: '12px 24px', borderRadius: radii.pill }}
              disabled={creating}
            >
              {creating ? 'Veidojam…' : 'Izveidot kolekciju'}
            </button>
          </div>
        </form>
        {createError ? (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: radii.md,
              background: palette.dangerSoft,
              color: palette.danger,
              border: `1px solid ${palette.border}`,
            }}
          >
            {createError}
          </div>
        ) : null}
      </section>

      <section style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {loadingCollections ? (
          <div className="spotz-card" style={{ padding: '32px', textAlign: 'center', color: palette.textSecondary }}>
            Ielādējam kolekcijas…
          </div>
        ) : collectionsError ? (
          <div
            role="alert"
            className="spotz-card"
            style={{
              padding: '24px',
              borderRadius: radii.lg,
              background: palette.dangerSoft,
              color: palette.danger,
              border: `1px solid ${palette.border}`,
              fontWeight: 600,
            }}
          >
            {collectionsError}
          </div>
        ) : collections.length === 0 ? (
          <div className="spotz-card" style={{ padding: '32px', textAlign: 'center', color: palette.textSecondary }}>
            Vēl nav izveidota neviena kolekcija.
          </div>
        ) : (
          collections.map((collection) => {
            const isActive = activeCollectionId === collection.id;
            return (
              <article
                key={collection.id}
                className="spotz-card"
                style={{
                  padding: '20px',
                  borderRadius: radii.xl,
                  border: `1px solid ${isActive ? palette.accentStrong : palette.border}`,
                  boxShadow: isActive ? shadows.medium : shadows.soft,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: transitions.base,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '20px', color: palette.textPrimary }}>{collection.name}</h3>
                    {collection.description ? (
                      <p style={{ margin: 0, color: palette.textSecondary, lineHeight: 1.5 }}>
                        {collection.description}
                      </p>
                    ) : null}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span
                        className="spotz-chip"
                        style={{
                          background:
                            collection.visibility === 'public'
                              ? palette.accentGradientSoft
                              : palette.surfaceAlt,
                          color:
                            collection.visibility === 'public'
                              ? palette.accentStrong
                              : palette.textSecondary,
                          border: `1px solid ${palette.border}`,
                        }}
                      >
                        {VISIBILITY_LABELS[collection.visibility]}
                      </span>
                      <span style={{ color: palette.textSecondary, fontSize: '13px' }}>
                        {collection.spotsCount} spoti
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: palette.textSecondary, fontSize: '14px' }}>Redzamība:</span>
                    <select
                      value={collection.visibility}
                      onChange={(event) =>
                        handleVisibilityChange(collection, event.target.value as CollectionVisibility)
                      }
                      className="spotz-input"
                      style={{ padding: '6px 12px', borderRadius: radii.pill }}
                      disabled={updatingCollectionId === collection.id}
                    >
                      <option value="private">Privāta</option>
                      <option value="public">Publiska</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleSelectCollection(collection)}
                    className="spotz-btn spotz-btn--outline"
                    style={{ padding: '8px 16px', borderRadius: radii.pill }}
                  >
                    Skatīt spotus
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteCollection(collection)}
                    className="spotz-btn spotz-btn--danger"
                    style={{ padding: '8px 16px', borderRadius: radii.pill }}
                    disabled={deletingCollectionId === collection.id}
                  >
                    {deletingCollectionId === collection.id ? 'Dzēšam…' : 'Dzēst'}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      <section
        style={{
          border: `1px solid ${palette.border}`,
          borderRadius: radii.xl,
          padding: '24px',
          background: palette.surface,
          boxShadow: shadows.soft,
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', color: palette.textPrimary }}>{activeCollectionTitle}</h2>
          {activeCollection ? (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span
                className="spotz-chip"
                style={{
                  background:
                    activeCollection.visibility === 'public'
                      ? palette.accentGradientSoft
                      : palette.surfaceAlt,
                  color:
                    activeCollection.visibility === 'public'
                      ? palette.accentStrong
                      : palette.textSecondary,
                  border: `1px solid ${palette.border}`,
                }}
              >
                {VISIBILITY_LABELS[activeCollection.visibility as CollectionVisibility]}
              </span>
              <span style={{ color: palette.textSecondary, fontSize: '14px' }}>
                {collectionSpots.length} spoti šajā kolekcijā
              </span>
            </div>
          ) : null}
        </header>

        {spotsError ? (
          <div
            role="alert"
            style={{
              padding: '16px',
              borderRadius: radii.lg,
              background: palette.dangerSoft,
              color: palette.danger,
              border: `1px solid ${palette.border}`,
              fontWeight: 600,
            }}
          >
            {spotsError}
          </div>
        ) : loadingSpots ? (
          <p style={{ margin: 0, color: palette.textSecondary }}>Ielādējam kolekcijas saturu…</p>
        ) : !activeCollection ? (
          <p style={{ margin: 0, color: palette.textSecondary }}>{activeCollectionTitle}</p>
        ) : collectionSpots.length === 0 ? (
          <p style={{ margin: 0, color: palette.textSecondary }}>Šajā kolekcijā vēl nav neviena spota.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {collectionSpots.map((spot) => {
              const images = Array.isArray(spot.images) && spot.images.length
                ? spot.images
                : spot.image
                ? [spot.image]
                : [];
              return (
                <article
                  key={spot.id}
                  className="spotz-card"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
                    gap: '20px',
                    alignItems: 'stretch',
                    padding: '20px',
                    borderRadius: radii.lg,
                    border: `1px solid ${palette.border}`,
                    background: palette.surfaceAlt,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '20px', color: palette.textPrimary }}>{spot.name}</h3>
                      <span style={{ color: palette.textSecondary, fontSize: '14px' }}>
                        ♥ {spot.likesCount}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: palette.textSecondary, lineHeight: 1.6 }}>
                      {spot.description && spot.description.trim().length
                        ? spot.description
                        : 'Apraksts nav pievienots.'}
                    </p>
                    {spot.tags?.length ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {spot.tags.map((tag) => (
                          <span
                            key={tag}
                            className="spotz-chip"
                            style={{
                              background: palette.surface,
                              color: palette.accentStrong,
                              border: `1px solid ${palette.border}`,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (activeCollectionId) {
                            void handleRemoveSpot(activeCollectionId, spot.id);
                          }
                        }}
                        className="spotz-btn spotz-btn--danger"
                        style={{ padding: '8px 16px', borderRadius: radii.pill }}
                        disabled={removingSpotId === spot.id}
                      >
                        {removingSpotId === spot.id ? 'Noņemam…' : 'Noņemt no kolekcijas'}
                      </button>
                    </div>
                  </div>
                  <div style={{ width: '100%' }}>
                    <SpotGallery images={images} title={spot.name} height={220} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
