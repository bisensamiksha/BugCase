export type SearchMatcher = (text: string) => boolean;

export interface CompiledSearch {
  readonly match: SearchMatcher;
  /** false when `useRegex` is on and `query` is not a valid RegExp. */
  readonly valid: boolean;
}

/** Compile a search query into a matcher. Only called for non-empty queries. */
export function compileSearch(query: string, useRegex: boolean): CompiledSearch {
  if (useRegex) {
    try {
      const re = new RegExp(query, 'i');
      return { match: (text) => re.test(text), valid: true };
    } catch {
      return { match: () => false, valid: false };
    }
  }
  const needle = query.toLowerCase();
  return { match: (text) => text.toLowerCase().includes(needle), valid: true };
}

/** The string a primitive is matched against / rendered as. */
export function primitiveText(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value) ?? 'null';
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

/**
 * Prune `data` to the nodes whose key or primitive value matches, keeping ancestor paths. A
 * matching object key keeps that key's whole subtree. Returns `undefined` when nothing matches.
 */
export function filterJson(data: unknown, match: SearchMatcher): unknown {
  if (isPrimitive(data)) {
    return match(primitiveText(data)) ? data : undefined;
  }
  if (Array.isArray(data)) {
    const kept = data.filter((item) => filterJson(item, match) !== undefined);
    return kept.length > 0 ? kept : undefined;
  }
  const out: Record<string, unknown> = {};
  let any = false;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (match(key)) {
      out[key] = value;
      any = true;
    } else if (isPrimitive(value)) {
      if (match(primitiveText(value))) {
        out[key] = value;
        any = true;
      }
    } else {
      const child = filterJson(value, match);
      if (child !== undefined) {
        out[key] = child;
        any = true;
      }
    }
  }
  return any ? out : undefined;
}
