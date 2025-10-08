import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    setActiveIndex(0);
  }, [normalized.length, normalized[0]]);

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
        }}
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
                aria-label={`Skatīt attēlu ${index + 1}`}
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
    </div>
  );
}
