import { useCallback, useEffect, useMemo, useState } from 'react';
import { palette, radii, shadows } from '../styles/theme';

type SpotGalleryProps = {
  images: string[];
  title: string;
  height?: number;
};

function sanitizeImages(images: string[]): string[] {
  // Atsijājam tukšas vai nederīgas URL vērtības, lai nerādītu bojātus attēlus.
  return images.filter((image) => typeof image === 'string' && image.trim().length > 0);
}

export function SpotGallery({ images, title, height = 220 }: SpotGalleryProps) {
  const normalized = useMemo(() => sanitizeImages(images), [images]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isHoveringLightboxImage, setIsHoveringLightboxImage] = useState(false);

  useEffect(() => {
    // Ja saraksts mainās, vienmēr sākam rādīt pirmo attēlu.
    setActiveIndex(0);
    setLightboxIndex(0);
  }, [normalized.length, normalized[0]]);

  const openLightbox = useCallback(
    (index: number) => {
      if (!normalized.length) {
        return;
      }
      setLightboxIndex(Math.min(index, normalized.length - 1));
      setLightboxOpen(true);
    },
    [normalized.length],
  );

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const showNext = useCallback(() => {
    setLightboxIndex((current) => {
      if (!normalized.length) {
        return 0;
      }
      return (current + 1) % normalized.length;
    });
  }, [normalized.length]);

  const showPrevious = useCallback(() => {
    setLightboxIndex((current) => {
      if (!normalized.length) {
        return 0;
      }
      return (current - 1 + normalized.length) % normalized.length;
    });
  }, [normalized.length]);

  useEffect(() => {
    if (!lightboxOpen) {
      setIsHoveringLightboxImage(false);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLightbox();
      } else if (event.key === 'ArrowRight') {
        showNext();
      } else if (event.key === 'ArrowLeft') {
        showPrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
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

      {normalized.length > 1 ? (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {normalized.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => {
                  setActiveIndex(index);
                }}
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

      {lightboxOpen && normalized.length ? (
        <div
          className="spotz-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Skatīt attēlu"
          onClick={closeLightbox}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '24px',
          }}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: 'min(90vw, 960px)',
              maxHeight: '90vh',
              borderRadius: radii.xl,
              overflow: 'hidden',
              boxShadow: shadows.medium,
              border: `1px solid ${palette.border}`,
              background: palette.surface,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeLightbox}
              aria-label="Aizvērt attēlu"
              className="spotz-btn spotz-btn--ghost"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                zIndex: 1,
                borderRadius: radii.pill,
                padding: '6px 12px',
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
                maxHeight: '100%',
                objectFit: 'contain',
                backgroundColor: palette.surfaceAlt,
                transform: isHoveringLightboxImage ? 'scale(1.015)' : 'scale(1)',
                transition: 'transform 160ms ease-in-out',
              }}
              onMouseEnter={() => setIsHoveringLightboxImage(true)}
              onMouseLeave={() => setIsHoveringLightboxImage(false)}
            />

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
                    marginLeft: 12,
                    pointerEvents: 'auto',
                    borderRadius: radii.pill,
                    padding: '10px 14px',
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
                    marginRight: 12,
                    pointerEvents: 'auto',
                    borderRadius: radii.pill,
                    padding: '10px 14px',
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
