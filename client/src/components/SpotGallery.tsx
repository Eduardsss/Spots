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

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const showNext = useCallback(() => {
    setLightboxIndex((current) =>
      normalized.length ? (current + 1) % normalized.length : 0,
    );
  }, [normalized.length]);

  const showPrevious = useCallback(() => {
    setLightboxIndex((current) =>
      normalized.length ? (current - 1 + normalized.length) % normalized.length : 0,
    );
  }, [normalized.length]);

  useEffect(() => {
    if (!lightboxOpen) return;

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
          background: 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(29,78,216,0.22))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: palette.textSecondary,
          fontWeight: 600,
          letterSpacing: '0.08em',
        }}
      >
        Spotz
      </div>
    );
  }

  const activeImage = normalized[Math.min(activeIndex, normalized.length - 1)];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Thumbnail */}
      <div
        style={{ width: '100%', height, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
        onClick={() => openLightbox(activeIndex)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(activeIndex); }
        }}
        aria-label="Atvērt attēlu"
      >
        <img
          src={activeImage}
          alt={title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {normalized.length > 1 && (
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              right: 12,
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: 20,
              letterSpacing: '0.04em',
            }}
          >
            {activeIndex + 1} / {normalized.length}
          </div>
        )}
      </div>

      {/* Thumbnails strip */}
      {normalized.length > 1 ? (
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          {normalized.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: radii.sm,
                  overflow: 'hidden',
                  border: isActive ? `2px solid ${palette.accentStrong}` : `1px solid ${palette.border}`,
                  padding: 0,
                  background: palette.surfaceAlt,
                  cursor: 'pointer',
                  flexShrink: 0,
                  opacity: isActive ? 1 : 0.65,
                  transition: 'opacity 0.15s ease, border-color 0.15s ease',
                }}
                aria-label={`Izvēlēties attēlu ${index + 1}`}
              >
                <img
                  src={image}
                  alt={`${title} ${index + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Modern lightbox */}
      {lightboxOpen && normalized.length ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Skatīt attēlu"
          onClick={closeLightbox}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.93)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={closeLightbox}
            aria-label="Aizvērt"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(8px)',
              zIndex: 1,
            }}
          >
            ✕
          </button>

          {/* Image row with nav */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '0 20px',
              maxWidth: '100vw',
            }}
          >
            {normalized.length > 1 ? (
              <button
                type="button"
                onClick={showPrevious}
                aria-label="Iepriekšējais attēls"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 24,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  backdropFilter: 'blur(8px)',
                }}
              >
                ‹
              </button>
            ) : null}

            <img
              src={normalized[lightboxIndex]}
              alt={`${title} ${lightboxIndex + 1}`}
              style={{
                maxWidth: 'min(82vw, 960px)',
                maxHeight: '82vh',
                objectFit: 'contain',
                borderRadius: 12,
                boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
                display: 'block',
              }}
            />

            {normalized.length > 1 ? (
              <button
                type="button"
                onClick={showNext}
                aria-label="Nākamais attēls"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 24,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  backdropFilter: 'blur(8px)',
                }}
              >
                ›
              </button>
            ) : null}
          </div>

          {/* Dot indicators */}
          {normalized.length > 1 ? (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center' }}
            >
              {normalized.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`Attēls ${i + 1}`}
                  style={{
                    width: i === lightboxIndex ? 22 : 8,
                    height: 8,
                    borderRadius: 4,
                    border: 'none',
                    background: i === lightboxIndex ? '#fff' : 'rgba(255,255,255,0.35)',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'width 0.2s ease, background 0.2s ease',
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}