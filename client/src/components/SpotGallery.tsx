import { useCallback, useEffect, useMemo, useState } from 'react';
import { palette, radii, shadows } from '../styles/theme';

type SpotGalleryProps = {
  images: string[];
  title: string;
  height?: number;
};

function sanitizeImages(images: string[]): string[] {
  return images.filter((image) => typeof image === 'string' && image.trim().length > 0);
}

export function SpotGallery({ images, title, height = 220 }: SpotGalleryProps) {
  const normalized = useMemo(() => sanitizeImages(images), [images]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    setLightboxIndex(0);
  }, [normalized.length, normalized[0]]);

  const openLightbox = useCallback(
    (index: number) => {
      if (!normalized.length) return;
      setLightboxIndex(Math.min(index, normalized.length - 1));
      setLightboxOpen(true);
    },
    [normalized.length],
  );

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const showNext = useCallback(() => {
    setLightboxIndex((current) => (current + 1) % normalized.length);
  }, [normalized.length]);

  const showPrevious = useCallback(() => {
    setLightboxIndex((current) => (current - 1 + normalized.length) % normalized.length);
  }, [normalized.length]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLightbox();
      else if (event.key === 'ArrowRight') showNext();
      else if (event.key === 'ArrowLeft') showPrevious();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, closeLightbox, showNext, showPrevious]);

  if (normalized.length === 0) {
    return (
      <div
        style={{
          height,
          width: '100%',
          borderRadius: radii.lg,
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(29, 78, 216, 0.24))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: palette.textSecondary,
          fontWeight: 600,
          letterSpacing: '0.08em',
          boxShadow: shadows.soft,
        }}
      >
        Spotz
      </div>
    );
  }

  const activeImage = normalized[Math.min(activeIndex, normalized.length - 1)];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Galvenais attēls */}
      <div
        style={{
          width: '100%',
          height,
          borderRadius: radii.lg,
          overflow: 'hidden',
          boxShadow: shadows.medium,
          border: `1px solid ${palette.border}`,
          cursor: 'pointer',
          position: 'relative',
        }}
        onClick={() => openLightbox(activeIndex)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openLightbox(activeIndex);
          }
        }}
        aria-label="Atvērt attēlu pilnekrāna režīmā"
      >
        <img
          src={activeImage}
          alt={title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>

      {/* Sīktēli (ja vairāk par 1 attēlu) */}
      {normalized.length > 1 ? (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {normalized.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: radii.md,
                  overflow: 'hidden',
                  border: isActive ? `2px solid ${palette.accentStrong}` : `1px solid ${palette.border}`,
                  padding: 0,
                  background: palette.surface,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label={`Izvēlēties attēlu ${index + 1}`}
              >
                <img
                  src={image}
                  alt={`${title} foto ${index + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Lightbox */}
      {lightboxOpen && normalized.length ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Skatīt attēlu"
          onClick={closeLightbox}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '16px',
          }}
        >
          {/* Aizvērt ar klikšķi ārpus attēla — bet ne uz pogas/attēla */}
          <div
            style={{
              position: 'relative',
              maxWidth: 'min(92vw, 960px)',
              maxHeight: '88vh',
              borderRadius: radii.xl,
              overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
              border: `1px solid ${palette.border}`,
              background: palette.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Aizvērt poga */}
            <button
              type="button"
              onClick={closeLightbox}
              aria-label="Aizvērt attēlu"
              className="spotz-btn spotz-btn--ghost"
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                zIndex: 1,
                borderRadius: radii.pill,
                padding: '6px 12px',
                background: 'rgba(15, 23, 42, 0.6)',
                color: 'white',
                lineHeight: 1,
              }}
            >
              ×
            </button>

            <img
              src={normalized[lightboxIndex]}
              alt={`${title} pilnekrāna attēls`}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: '88vh',
                objectFit: 'contain',
              }}
            />

            {/* Navigācija (ja vairāk par 1 attēlu) */}
            {normalized.length > 1 ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  pointerEvents: 'none',
                }}
              >
                <button
                  type="button"
                  onClick={showPrevious}
                  aria-label="Iepriekšējais attēls"
                  className="spotz-btn spotz-btn--ghost"
                  style={{
                    marginLeft: 10,
                    pointerEvents: 'auto',
                    borderRadius: radii.pill,
                    padding: '10px 14px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    color: 'white',
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={showNext}
                  aria-label="Nākamais attēls"
                  className="spotz-btn spotz-btn--ghost"
                  style={{
                    marginRight: 10,
                    pointerEvents: 'auto',
                    borderRadius: radii.pill,
                    padding: '10px 14px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    color: 'white',
                  }}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
