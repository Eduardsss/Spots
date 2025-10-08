import { useMemo, useState } from 'react';
import { areTagListsEqual, normalizeTagName } from '../lib/tags';
import { palette, radii, shadows, transitions } from '../styles/theme';

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  suggestions?: string[];
  maxTags?: number;
};

const suggestionLimit = 6;

export function TagInput({
  value,
  onChange,
  placeholder = 'Pievieno tagu…',
  disabled = false,
  suggestions = [],
  maxTags,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const availableSuggestions = useMemo(() => {
    if (!suggestions.length) {
      return [];
    }

    const lowerValue = new Set(value.map((tag) => tag.toLowerCase()));
    return suggestions
      .filter((tag) => !lowerValue.has(tag.toLowerCase()))
      .slice(0, suggestionLimit);
  }, [suggestions, value]);

  const normalizedValue = useMemo(() => value.map((tag) => normalizeTagName(tag) ?? tag), [value]);

  const emit = (next: string[]) => {
    if (!areTagListsEqual(next, normalizedValue)) {
      onChange(next);
    }
  };

  const handleAddTag = (raw: string) => {
    if (disabled) {
      return;
    }

    const tag = normalizeTagName(raw);
    if (!tag) {
      return;
    }

    if (maxTags && value.length >= maxTags) {
      return;
    }

    if (value.includes(tag)) {
      return;
    }

    emit([...value, tag]);
    setDraft('');
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      event.preventDefault();
      handleAddTag(draft);
    } else if (event.key === 'Backspace' && !draft && value.length > 0) {
      emit(value.slice(0, -1));
    }
  };

  const handleBlur: React.FocusEventHandler<HTMLInputElement> = () => {
    if (draft.trim()) {
      handleAddTag(draft);
    }
  };

  const handleRemove = (tag: string) => {
    emit(value.filter((item) => item !== tag));
  };

  const helperMessage = maxTags && value.length >= maxTags ? `Sasniegts maksimālais ${maxTags} tagu skaits.` : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        className="spotz-input"
        style={{
          minHeight: '48px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          background: palette.surfaceAlt,
          border: `1px solid ${palette.border}`,
          borderRadius: radii.md,
          boxShadow: 'none',
        }}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="spotz-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: palette.accentGradientSoft,
              color: palette.accentStrong,
              borderRadius: radii.pill,
              padding: '6px 10px',
              fontWeight: 600,
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemove(tag)}
              disabled={disabled}
              style={{
                appearance: 'none',
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              aria-label={`Noņemt ${tag}`}
            >
              ×
            </button>
          </span>
        ))}

        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled || (Boolean(maxTags) && value.length >= (maxTags ?? 0))}
          style={{
            flex: 1,
            minWidth: '160px',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: palette.textPrimary,
            fontSize: '14px',
          }}
        />
      </div>

      {helperMessage ? (
        <span style={{ fontSize: '12px', color: palette.textMuted }}>{helperMessage}</span>
      ) : null}

      {availableSuggestions.length ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            padding: '10px',
            borderRadius: radii.md,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            boxShadow: shadows.soft,
            transition: `border-color ${transitions.base}`,
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 600, color: palette.textSecondary }}>Ieteikumi:</span>
          {availableSuggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleAddTag(tag)}
              disabled={
                disabled || (Boolean(maxTags) && value.length >= (maxTags ?? 0))
              }
              className="spotz-btn spotz-btn--ghost"
              style={{
                padding: '6px 12px',
                borderRadius: radii.pill,
                border: `1px solid transparent`,
                color: palette.accent,
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
