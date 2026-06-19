/**
 * Bounded, cycle-safe serialization for untrusted runtime values.
 *
 * The capture engines feed arbitrary page values into the report — `console.*` arguments
 * (S2-06) and DOM-derived data the scrubbers touch (S2-08). Those values can be circular,
 * carry live DOM nodes, throw from getters, or be enormous, all of which make a plain
 * `JSON.stringify` throw or blow up. `safeStringify` first reduces a value to a plain,
 * JSON-safe shape — replacing cycles, DOM nodes, functions, Errors, and other non-JSON
 * values with short string markers, and bounding nesting depth and string length — then
 * serializes that. It never throws and always returns a valid JSON string.
 */

export interface SafeStringifyOptions {
  /** Maximum nesting depth expanded; deeper containers become `[Object]`/`[Array]`. */
  readonly maxDepth: number;
  /** Maximum length of any single string; longer strings are truncated with a marker. */
  readonly maxStringLength: number;
}

export const DEFAULT_SAFE_STRINGIFY_OPTIONS: SafeStringifyOptions = {
  maxDepth: 6,
  maxStringLength: 10_000,
};

/** Duck-typed DOM-node check so this works in the page (real Nodes) and in node tests alike. */
function isDomNode(value: object): value is { nodeType: number; nodeName: string } {
  return (
    typeof (value as { nodeType?: unknown }).nodeType === 'number' &&
    typeof (value as { nodeName?: unknown }).nodeName === 'string'
  );
}

function describeDomNode(node: { nodeType: number; nodeName: string }): string {
  if (node.nodeType !== 1) {
    return `[Node: ${node.nodeName}]`;
  }
  const el = node as { nodeName: string; id?: unknown; className?: unknown };
  let selector = node.nodeName.toLowerCase();
  if (typeof el.id === 'string' && el.id !== '') {
    selector += `#${el.id}`;
  }
  if (typeof el.className === 'string' && el.className.trim() !== '') {
    selector += `.${el.className.trim().split(/\s+/).join('.')}`;
  }
  return `[Element: ${selector}]`;
}

function truncate(value: string, maxStringLength: number): string {
  if (value.length <= maxStringLength) {
    return value;
  }
  return `${value.slice(0, maxStringLength)}…[+${value.length - maxStringLength} chars]`;
}

function sanitizePrimitive(value: unknown, maxStringLength: number): unknown {
  switch (typeof value) {
    case 'string':
      return truncate(value, maxStringLength);
    case 'number':
      return Number.isFinite(value) ? value : `[Number: ${String(value)}]`;
    case 'boolean':
      return value;
    case 'undefined':
      return '[undefined]';
    case 'bigint':
      return `[BigInt: ${value.toString()}]`;
    case 'symbol':
      return `[Symbol(${value.description ?? ''})]`;
    case 'function':
      return `[Function: ${(value as { name?: string }).name || 'anonymous'}]`;
    default:
      return undefined; // not a primitive — caller handles objects
  }
}

function sanitize(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  options: SafeStringifyOptions,
): unknown {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'object') {
    return sanitizePrimitive(value, options.maxStringLength);
  }

  // Special object shapes, caught before depth/cycle handling so they stay short and safe.
  if (isDomNode(value)) {
    return describeDomNode(value);
  }
  if (value instanceof Error) {
    return {
      name: truncate(value.name, options.maxStringLength),
      message: truncate(value.message, options.maxStringLength),
      stack: truncate(value.stack ?? '', options.maxStringLength),
    };
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '[Invalid Date]' : value.toISOString();
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  if (depth >= options.maxDepth) {
    return Array.isArray(value) ? '[Array]' : '[Object]';
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item, depth + 1, seen, options));
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      try {
        out[key] = sanitize((value as Record<string, unknown>)[key], depth + 1, seen, options);
      } catch (error) {
        out[key] = `[Throw: ${error instanceof Error ? error.message : String(error)}]`;
      }
    }
    return out;
  } finally {
    // Track only the current path, so a value reused across siblings is not a false cycle.
    seen.delete(value);
  }
}

/**
 * Serialize `value` to a bounded, cycle-safe JSON string. Never throws; unknown or hostile
 * inputs degrade to string markers (e.g. `[Circular]`, `[Function: f]`, `[Element: div#id]`).
 */
export function safeStringify(value: unknown, options: Partial<SafeStringifyOptions> = {}): string {
  const resolved: SafeStringifyOptions = { ...DEFAULT_SAFE_STRINGIFY_OPTIONS, ...options };
  try {
    return JSON.stringify(sanitize(value, 0, new WeakSet(), resolved)) ?? '"[undefined]"';
  } catch (error) {
    return JSON.stringify(
      `[Unserializable: ${error instanceof Error ? error.message : String(error)}]`,
    );
  }
}
