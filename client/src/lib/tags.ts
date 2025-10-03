export const MAX_TAGS_PER_SPOT = 8;

export const normalizeTagName = (raw: string): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }

  let value = raw.trim().toLowerCase();
  if (!value) {
    return null;
  }

  value = value.replace(/^#+/u, '');
  value = value.replace(/[^\p{L}\p{N}]+/gu, '-');
  value = value.replace(/-+/g, '-');
  value = value.replace(/^-|-$/g, '');

  if (!value) {
    return null;
  }

  if (value.length > 30) {
    value = value.slice(0, 30);
  }

  return `#${value}`;
};

export const normalizeTagList = (input: unknown): string[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    const normalized = normalizeTagName(String(raw));
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
      if (result.length >= MAX_TAGS_PER_SPOT) {
        break;
      }
    }
  }

  return result;
};

export const mergeTagLists = (current: string[], next: string[]): string[] => {
  const combined = new Set(current);
  next.forEach((tag) => {
    if (tag) {
      combined.add(tag);
    }
  });
  return Array.from(combined).sort((a, b) => a.localeCompare(b));
};

export const areTagListsEqual = (a: string[] = [], b: string[] = []): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  return sortedA.every((tag, index) => tag === sortedB[index]);
};
