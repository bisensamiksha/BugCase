/**
 * Reproduction recorder → schema `ReproductionRecording` mapper (S3-12).
 *
 * Turns the raw step entries the MAIN-world recorder flushes across the `reproduction` bridge channel
 * into the report schema's `ReproductionRecording`. Pure and defensive: malformed `unknown[]` entries
 * are skipped, epoch-ms timestamps become ISO strings, and metadata is narrowed to primitives so the
 * result always validates against `ReproductionRecordingSchema`. The recorder records no captured
 * content, so nothing sensitive flows through here.
 */

import type { ReproStepType, ReproductionRecording, ReproductionStep } from '@bugcase/schema';

const STEP_TYPES: ReadonlySet<string> = new Set<ReproStepType>([
  'click',
  'input',
  'change',
  'scroll',
  'keydown-modifier',
  'navigation',
]);

/** Default cap on retained steps in the report, independent of the recorder's own buffer cap. */
const DEFAULT_MAX_STEPS = 500;

export interface ToReproductionRecordingOptions {
  /** ISO time the recording session started. */
  readonly startedAt: string;
  /** ISO time the recording session ended. */
  readonly endedAt: string;
  /** Id generator (injectable for tests); defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
  /** Cap on retained steps; defaults to {@link DEFAULT_MAX_STEPS}. Keeps the most recent. */
  readonly maxSteps?: number;
}

function defaultNewId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoApi?.randomUUID ? cryptoApi.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** Keep only primitive metadata values (string/number/boolean); drop functions/objects/nullish. */
function sanitizeMetadata(value: unknown): Record<string, string | number | boolean> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const out: Record<string, string | number | boolean> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      out[key] = val;
    }
  }
  return out;
}

/** Narrow one raw bridge entry to a schema `ReproductionStep`, or `null` if malformed. */
function coerce(value: unknown, newId: () => string): ReproductionStep | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.type !== 'string' ||
    !STEP_TYPES.has(raw.type) ||
    typeof raw.selector !== 'string' ||
    typeof raw.description !== 'string' ||
    typeof raw.timestamp !== 'number' ||
    !Number.isFinite(raw.timestamp)
  ) {
    return null;
  }
  return {
    id: newId(),
    type: raw.type as ReproStepType,
    selector: raw.selector,
    description: raw.description,
    timestamp: new Date(raw.timestamp).toISOString(),
    metadata: sanitizeMetadata(raw.metadata),
  };
}

/** Map raw bridge `reproduction` entries to a schema `ReproductionRecording`. */
export function toReproductionRecording(
  entries: readonly unknown[],
  options: ToReproductionRecordingOptions,
): ReproductionRecording {
  const newId = options.newId ?? defaultNewId;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const mapped = entries.flatMap((value) => {
    const step = coerce(value, newId);
    return step ? [step] : [];
  });
  const steps = mapped.length > maxSteps ? mapped.slice(mapped.length - maxSteps) : mapped;
  return {
    schemaVersion: 'v1',
    startedAt: options.startedAt,
    endedAt: options.endedAt,
    steps,
  };
}
