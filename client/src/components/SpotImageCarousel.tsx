import { useEffect, useMemo, useState } from 'react';
import { palette, radii, shadows } from '../styles/theme';

type SpotImageCarouselProps = {
  images?: string[];
  height?: number;
  borderRadius?: string;
  showDots?: boolean;
  emptyLabel?: string;
};

const createKey = (index: number) => `spot-image-${index}`;

export function SpotImageCarousel({
  images = [],
  height = 200,
  borderRadius = radii.lg,
  showDots = true,
  emptyLabel = 'Spotz',
}: SpotImageCarouselProps) {
  const sanitized = useMemo(() => images.filter((img) => typeof img === 'string' && img.trim().length > 0), [images]);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasImages = sanitized.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [sanitized.length, sanitized[0]]);

  if (!hasImages) {
    return (
      <div
        style={{
          height,
          borderRadius,
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(29, 78, 216, 0.24))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: palette.textSecondary,
          fontWeight: 700,
          letterSpacing: '0.08em',
        }}
      >
        {emptyLabel}
      </div>
    );
  }

  const handlePrevious = () => {
    setActiveIndex((current) => (current === 0 ? sanitized.length - 1 : current - 1));
  };

  const handleNext = () => {
    setActiveIndex((current) => (current === sanitized.length - 1 ? 0 : current + 1));
  };

  return (
    <div
      style={{
        position: 'relative',
        height,
        borderRadius,
        overflow: 'hidden',
        boxShadow: shadows.soft,
        background: palette.surfaceAlt,
      }}
    >
      <img
        src={sanitized[activeIndex]}
        alt="Spot preview"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {sanitized.length > 1 ? (
        <>
          <button
            type="button"
            onClick={handlePrevious}
            aria-label="Previous image"
            className="spotz-btn spotz-btn--ghost"
            style={{
              position: 'absolute',
              top: '50%',
              left: 12,
              transform: 'translateY(-50%)',
              borderRadius: radii.pill,
              padding: '6px 10px',
              backdropFilter: 'var(--backdrop-blur)',
              background: 'rgba(15, 23, 42, 0.55)',
              color: palette.textPrimary,
            }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next image"
            className="spotz-btn spotz-btn--ghost"
            style={{
              position: 'absolute',
              top: '50%',
              right: 12,
              transform: 'translateY(-50%)',
              borderRadius: radii.pill,
              padding: '6px 10px',
              backdropFilter: 'var(--backdrop-blur)',
              background: 'rgba(15, 23, 42, 0.55)',
              color: palette.textPrimary,
            }}
          >
            ›
          </button>
        </>
      ) : null}
      {showDots && sanitized.length > 1 ? (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 6,
          }}
        >
          {sanitized.map((_, index) => (
            <span
              key={createKey(index)}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: index === activeIndex ? palette.accent : palette.surface,
                border: `1px solid ${palette.border}`,
                boxShadow: shadows.xs,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
