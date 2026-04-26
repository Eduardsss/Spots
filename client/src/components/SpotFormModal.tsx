import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { SpotGallery } from './SpotGallery';
import { TagInput } from './TagInput';
import { palette, radii } from '../styles/theme';
import { MAX_TAGS_PER_SPOT } from '../lib/tags';

export type SpotFormValues = {
  name: string;
  description: string;
  status: 'public' | 'private';
  image: string | null;
  images: string[];
  tags: string[];
};

export type SpotFormSubmission = SpotFormValues & {
  imagesChanged: boolean;
};

const MAX_IMAGE_DIMENSION = 1920;
const IMAGE_QUALITY = 0.82;

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Neizdevās nolasīt failu'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Neizdevās ielādēt attēlu'));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
            width = MAX_IMAGE_DIMENSION;
          } else {
            width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
            height = MAX_IMAGE_DIMENSION;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
      };
      img.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  });
}

export function SpotFormModal({
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
  const [galleryState, setGalleryState] = useState<{ previews: string[]; changed: boolean }>({
    previews: [...initialValues.images],
    changed: false,
  });
  const [tags, setTags] = useState<string[]>([...initialValues.tags]);
  const tagLimit = maxTags ?? MAX_TAGS_PER_SPOT;

  useEffect(() => {
    if (!open) return;
    setName(initialValues.name);
    setDescription(initialValues.description);
    setStatus(initialValues.status);
    setGalleryState({ previews: [...initialValues.images], changed: false });
    setTags([...initialValues.tags]);
  }, [initialValues, open]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    try {
      const base64List = await Promise.all(files.map((file) => compressImage(file)));
      setGalleryState((current) => {
        const combined = [...current.previews, ...base64List];
        return { previews: combined.slice(0, 6), changed: true };
      });
    } catch (err) {
      console.error('Failed to convert image', err);
    }
  };

  const handleRemoveImage = (index: number) => {
    setGalleryState((current) => ({
      previews: current.previews.filter((_, i) => i !== index),
      changed: true,
    }));
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

  if (!open) return null;

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
                background: status === 'private'
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
