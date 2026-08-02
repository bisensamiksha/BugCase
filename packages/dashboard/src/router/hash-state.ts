import type { ConsoleLevel, NetworkInitiator } from '@bugcase/schema';

import { CONSOLE_LEVELS } from '../panes/console-filters';

/**
 * Pane-scoped view state ⇄ hash params (S4-26). Pure — no React, no DOM — so it is unit-testable in
 * a plain node environment, matching how `hash-router.ts` was built.
 *
 * Two rules shape everything here:
 *
 * 1. **Only non-default values are encoded.** A bare `#/console/<id>` means "no filters", so a
 *    default view yields a clean, short link.
 * 2. **Decoding never throws and never strands the reader.** These URLs travel between machines, so
 *    every input is untrusted: unknown values are dropped, and a filter that would select nothing
 *    falls back to the default rather than rendering an empty pane.
 *
 * View state only — never report content. Notably the Storage pane's reveal state is deliberately
 * absent: a shared link must not auto-unmask cookie or storage values.
 */

export type HashParams = Readonly<Record<string, string>>;

/** Free-text queries are capped so a pathological paste cannot produce an unusable URL. */
export const MAX_QUERY_LENGTH = 200;

const ALL_LEVELS: readonly ConsoleLevel[] = CONSOLE_LEVELS;

function encodeSet(values: Iterable<string>): string {
  // Sorted so the same view always produces the same URL.
  return [...values].sort().join(',');
}

function decodeList(raw: string | undefined): string[] {
  return raw ? raw.split(',').filter((value) => value.length > 0) : [];
}

function sameMembers(a: ReadonlySet<string>, b: readonly string[]): boolean {
  return a.size === b.length && b.every((value) => a.has(value));
}

function encodeQuery(query: string): string {
  return query.slice(0, MAX_QUERY_LENGTH);
}

/**
 * Restrict requested values to those that exist, falling back to everything available when the
 * intersection is empty. A link built against another capture must not strand the reader with an
 * empty table — but a report that genuinely has no such values yields an empty set, not a lie.
 */
function intersectOrAll<T extends string>(
  requested: string[],
  availableValues: readonly T[],
): Set<T> {
  if (requested.length === 0) {
    return new Set(availableValues);
  }
  const allowed = new Set<string>(availableValues);
  const kept = requested.filter((value): value is T => allowed.has(value));
  return kept.length > 0 ? new Set(kept) : new Set(availableValues);
}

/* ------------------------------------------------------------------ console */

export interface ConsoleFilterState {
  readonly levels: ReadonlySet<ConsoleLevel>;
  readonly query: string;
  readonly useRegex: boolean;
  readonly cutoffMs: number | null;
  readonly selectedId: string | null;
}

export function encodeConsoleFilters(state: ConsoleFilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (!sameMembers(state.levels, ALL_LEVELS)) {
    params.lv = encodeSet(state.levels);
  }
  if (state.query) {
    params.q = encodeQuery(state.query);
  }
  if (state.useRegex) {
    params.rx = '1';
  }
  if (state.cutoffMs !== null) {
    params.since = String(state.cutoffMs);
  }
  if (state.selectedId) {
    params.sel = state.selectedId;
  }
  return params;
}

export function decodeConsoleFilters(params: HashParams): ConsoleFilterState {
  const requested = decodeList(params.lv);
  const levels = intersectOrAll<ConsoleLevel>(requested, ALL_LEVELS);
  return {
    levels,
    query: (params.q ?? '').slice(0, MAX_QUERY_LENGTH),
    useRegex: params.rx !== undefined,
    cutoffMs: decodeCutoff(params.since),
    selectedId: params.sel || null,
  };
}

/** A finite, non-negative millisecond offset, or null. Rejects NaN, Infinity and negatives. */
function decodeCutoff(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/* ------------------------------------------------------------------ network */

/** The filter values actually present in the report being viewed. */
export interface NetworkAvailable {
  readonly classes: readonly string[];
  readonly methods: readonly string[];
  readonly initiators: readonly NetworkInitiator[];
}

export interface NetworkFilterState {
  readonly classes: ReadonlySet<string>;
  readonly methods: ReadonlySet<string>;
  readonly initiators: ReadonlySet<NetworkInitiator>;
  readonly query: string;
  readonly useRegex: boolean;
  readonly selectedId: string | null;
}

export function encodeNetworkFilters(
  state: NetworkFilterState,
  available: NetworkAvailable,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (!sameMembers(state.classes, available.classes)) {
    params.cls = encodeSet(state.classes);
  }
  if (!sameMembers(state.methods, available.methods)) {
    params.m = encodeSet(state.methods);
  }
  if (!sameMembers(state.initiators, available.initiators)) {
    params.ini = encodeSet(state.initiators);
  }
  if (state.query) {
    params.q = encodeQuery(state.query);
  }
  if (state.useRegex) {
    params.rx = '1';
  }
  if (state.selectedId) {
    params.sel = state.selectedId;
  }
  return params;
}

export function decodeNetworkFilters(
  params: HashParams,
  available: NetworkAvailable,
): NetworkFilterState {
  return {
    classes: intersectOrAll(decodeList(params.cls), available.classes),
    methods: intersectOrAll(decodeList(params.m), available.methods),
    initiators: intersectOrAll<NetworkInitiator>(decodeList(params.ini), available.initiators),
    query: (params.q ?? '').slice(0, MAX_QUERY_LENGTH),
    useRegex: params.rx !== undefined,
    selectedId: params.sel || null,
  };
}

/* ---------------------------------------------------------------------- DOM */

export type DomTab = 'rendered' | 'source';

export interface DomViewState {
  /** Reuses the existing `el` param — the DOM pane's query *is* its element selector (S4-09). */
  readonly elementQuery: string;
  readonly tab: DomTab;
}

export function encodeDomView(state: DomViewState): Record<string, string> {
  const params: Record<string, string> = {};
  if (state.elementQuery) {
    params.el = encodeQuery(state.elementQuery);
  }
  if (state.tab !== 'rendered') {
    params.tab = state.tab;
  }
  return params;
}

export function decodeDomView(params: HashParams): DomViewState {
  return {
    elementQuery: (params.el ?? '').slice(0, MAX_QUERY_LENGTH),
    tab: params.tab === 'source' ? 'source' : 'rendered',
  };
}
