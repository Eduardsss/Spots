import { FormEvent, useEffect, useState } from 'react';
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

type CollectionsResponse = {
  collections: CollectionSummary[];
};

type SaveResponse = {
  success: boolean;
  collection: CollectionSummary;
};

type CreateResponse = {
  collection: CollectionSummary;
};

type SaveToCollectionModalProps = {
  open: boolean;
  spotId: number | null;
  spotName: string;
  onClose: () => void;
  onSaved?: (collection: CollectionSummary) => void;
};

const VISIBILITY_LABELS: Record<CollectionVisibility, string> = {
  public: 'Publiska',
  private: 'Privāta',
};

export default function SaveToCollectionModal({
  open,
  spotId,
  spotName,
  onClose,
  onSaved,
}: SaveToCollectionModalProps) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingCollectionId, setSavingCollectionId] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVisibility, setNewVisibility] = useState<CollectionVisibility>('private');

  useEffect(() => {
    if (!open || !spotId) {
      return undefined;
    }

    let ignore = false;

    const fetchCollections = async () => {
      setLoadingCollections(true);
      setCollectionsError(null);
      try {
        const response = await apiFetch<CollectionsResponse>('/collections');
        if (!ignore) {
          setCollections(Array.isArray(response.collections) ? response.collections : []);
        }
      } catch (error) {
        if (!ignore) {
          console.error('Failed to load collections', error);
          setCollectionsError('Neizdevās ielādēt kolekcijas.');
          setCollections([]);
        }
      } finally {
        if (!ignore) {
          setLoadingCollections(false);
        }
      }
    };

    void fetchCollections();

    return () => {
      ignore = true;
    };
  }, [open, spotId]);

  useEffect(() => {
    if (!open) {
      setCollectionsError(null);
      setSuccessMessage(null);
      setSavingCollectionId(null);
      setCreateError(null);
      setCreating(false);
      setNewName('');
      setNewVisibility('private');
    }
  }, [open]);

  if (!open || !spotId) {
    return null;
  }

  const handleSave = async (collectionId: number) => {
    setSavingCollectionId(collectionId);
    setSuccessMessage(null);
    try {
      const response = await apiFetch<SaveResponse>(`/collections/${collectionId}/spots`, {
        method: 'POST',
        body: { spotId },
      });

      if (response?.collection) {
        setCollections((current) => {
          const existingIds = new Set(current.map((collection) => collection.id));
          const next = existingIds.has(response.collection.id)
            ? current.map((collection) =>
                collection.id === response.collection.id ? response.collection : collection
              )
            : [response.collection, ...current];
          return next;
        });
        setSuccessMessage(`Spots “${spotName}” ir saglabāts kolekcijā “${response.collection.name}”.`);
        onSaved?.(response.collection);
      } else {
        setSuccessMessage('Spots ir saglabāts kolekcijā.');
      }
    } catch (error) {
      console.error('Failed to save spot to collection', error);
      setSuccessMessage('Neizdevās saglabāt spotu kolekcijā.');
    } finally {
      setSavingCollectionId(null);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newName.trim()) {
      setCreateError('Lūdzu, ievadi kolekcijas nosaukumu.');
      return;
    }

    setCreateError(null);
    setCreating(true);

    try {
      const response = await apiFetch<CreateResponse>('/collections', {
        method: 'POST',
        body: { name: newName.trim(), visibility: newVisibility },
      });

      if (response?.collection) {
        setCollections((current) => [response.collection, ...current]);
        setNewName('');
        setNewVisibility('private');
        setSuccessMessage(`Kolekcija “${response.collection.name}” ir izveidota.`);
      }
    } catch (error) {
      console.error('Failed to create collection', error);
      setCreateError('Neizdevās izveidot kolekciju.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="spotz-modal-overlay" role="dialog" aria-modal="true">
      <div
        className="spotz-modal"
        style={{
          width: 'min(520px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          maxHeight: '90vh',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', color: palette.textPrimary }}>Saglabāt kolekcijā</h2>
            <p style={{ margin: '6px 0 0', color: palette.textSecondary }}>
              Izvēlies sarakstu, kurā saglabāt spotu “{spotName}”.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="spotz-btn spotz-btn--ghost"
            style={{ padding: '6px 12px', borderRadius: radii.pill }}
            aria-label="Aizvērt logu"
          >
            ×
          </button>
        </header>

        {successMessage ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: radii.md,
              background: palette.successSoft,
              color: palette.success,
              border: `1px solid ${palette.success}`,
              fontSize: '14px',
            }}
          >
            {successMessage}
          </div>
        ) : null}

        {collectionsError ? (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              borderRadius: radii.md,
              background: palette.dangerSoft,
              color: palette.danger,
              border: `1px solid ${palette.border}`,
            }}
          >
            {collectionsError}
          </div>
        ) : null}

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            border: `1px solid ${palette.border}`,
            borderRadius: radii.lg,
            padding: '16px',
            background: palette.surfaceAlt,
            boxShadow: shadows.soft,
          }}
        >
          <h3 style={{ margin: 0, fontSize: '18px', color: palette.textPrimary }}>Manas kolekcijas</h3>
          {loadingCollections ? (
            <p style={{ margin: 0, color: palette.textSecondary }}>Ielādējam kolekcijas…</p>
          ) : collections.length === 0 ? (
            <p style={{ margin: 0, color: palette.textSecondary }}>
              Vēl nav izveidota neviena kolekcija.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {collections.map((collection) => (
                <li
                  key={collection.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: radii.md,
                    background: palette.surface,
                    border: `1px solid ${palette.border}`,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontWeight: 600, color: palette.textPrimary }}>{collection.name}</span>
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
                  <button
                    type="button"
                    onClick={() => handleSave(collection.id)}
                    disabled={savingCollectionId === collection.id}
                    className="spotz-btn spotz-btn--primary"
                    style={{
                      padding: '8px 16px',
                      borderRadius: radii.pill,
                      transition: transitions.fast,
                    }}
                  >
                    {savingCollectionId === collection.id ? 'Saglabājam…' : 'Saglabāt'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: radii.lg,
            padding: '16px',
            background: palette.surface,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '18px', color: palette.textPrimary }}>Izveidot jaunu kolekciju</h3>
          <form
            onSubmit={handleCreate}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontWeight: 600, color: palette.textPrimary }}>Nosaukums</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="spotz-input"
                placeholder="Piemēram, Romantiskie spoti Rīgā"
                required
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontWeight: 600, color: palette.textPrimary }}>Redzamība</span>
              <select
                value={newVisibility}
                onChange={(event) => setNewVisibility(event.target.value as CollectionVisibility)}
                className="spotz-input"
              >
                <option value="private">Privāta</option>
                <option value="public">Publiska</option>
              </select>
            </label>

            {createError ? (
              <div
                role="alert"
                style={{
                  padding: '8px 12px',
                  borderRadius: radii.md,
                  background: palette.dangerSoft,
                  color: palette.danger,
                  border: `1px solid ${palette.border}`,
                  fontSize: '13px',
                }}
              >
                {createError}
              </div>
            ) : null}

            <button
              type="submit"
              className="spotz-btn spotz-btn--outline"
              style={{ padding: '10px 18px', borderRadius: radii.pill, alignSelf: 'flex-start' }}
              disabled={creating}
            >
              {creating ? 'Veidojam…' : 'Izveidot kolekciju'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
