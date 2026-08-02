import type { ConsoleLevel } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { CONSOLE_LEVELS } from '../panes/console-filters';

import {
  decodeConsoleFilters,
  decodeDomView,
  decodeNetworkFilters,
  encodeConsoleFilters,
  encodeDomView,
  encodeNetworkFilters,
  MAX_QUERY_LENGTH,
  type ConsoleFilterState,
  type NetworkAvailable,
  type NetworkFilterState,
} from './hash-state';

const ALL_LEVELS: ReadonlySet<ConsoleLevel> = new Set(CONSOLE_LEVELS);

const consoleDefaults: ConsoleFilterState = {
  levels: ALL_LEVELS,
  query: '',
  useRegex: false,
  cutoffMs: null,
  selectedId: null,
};

const available: NetworkAvailable = {
  classes: ['2xx', '4xx', '5xx'],
  methods: ['GET', 'POST'],
  initiators: ['fetch', 'xhr', 'unknown'],
};

const networkDefaults: NetworkFilterState = {
  classes: new Set(available.classes),
  methods: new Set(available.methods),
  initiators: new Set(available.initiators),
  query: '',
  useRegex: false,
  selectedId: null,
};

describe('console filter codec', () => {
  it('omits everything when the view is at its defaults', () => {
    // A default view must produce a clean, short link.
    expect(encodeConsoleFilters(consoleDefaults)).toEqual({});
  });

  it('round-trips a filtered view', () => {
    const state: ConsoleFilterState = {
      levels: new Set<ConsoleLevel>(['error', 'warn']),
      query: 'timeout',
      useRegex: true,
      cutoffMs: 1500,
      selectedId: 'entry-7',
    };
    expect(decodeConsoleFilters(encodeConsoleFilters(state))).toEqual(state);
  });

  it('emits levels in a stable order so the same view yields the same URL', () => {
    const a = encodeConsoleFilters({ ...consoleDefaults, levels: new Set(['warn', 'error']) });
    const b = encodeConsoleFilters({ ...consoleDefaults, levels: new Set(['error', 'warn']) });
    expect(a).toEqual(b);
  });

  it('drops unknown levels', () => {
    expect(decodeConsoleFilters({ lv: 'error,chartreuse' }).levels).toEqual(new Set(['error']));
  });

  it('falls back to all levels when none of the requested ones are valid', () => {
    // Better a full pane than an empty one for a link built against a different build.
    expect(decodeConsoleFilters({ lv: 'nonsense' }).levels).toEqual(ALL_LEVELS);
  });

  it.each([['NaN'], ['-1'], ['Infinity'], ['abc'], ['']])('ignores a bad cutoff %s', (raw) => {
    expect(decodeConsoleFilters({ since: raw }).cutoffMs).toBeNull();
  });

  it('accepts a zero cutoff', () => {
    expect(decodeConsoleFilters({ since: '0' }).cutoffMs).toBe(0);
  });

  it('treats a missing regex flag as false and any present value as true', () => {
    expect(decodeConsoleFilters({}).useRegex).toBe(false);
    expect(decodeConsoleFilters({ rx: '1' }).useRegex).toBe(true);
  });

  it('truncates an overlong query rather than emitting an unusable URL', () => {
    const long = 'x'.repeat(MAX_QUERY_LENGTH + 50);
    expect(encodeConsoleFilters({ ...consoleDefaults, query: long }).q).toHaveLength(
      MAX_QUERY_LENGTH,
    );
  });

  it('returns defaults for empty params', () => {
    expect(decodeConsoleFilters({})).toEqual(consoleDefaults);
  });
});

describe('network filter codec', () => {
  it('omits everything when every available value is active', () => {
    expect(encodeNetworkFilters(networkDefaults, available)).toEqual({});
  });

  it('round-trips a filtered view', () => {
    const state: NetworkFilterState = {
      classes: new Set(['4xx', '5xx']),
      methods: new Set(['POST']),
      initiators: new Set(['fetch']),
      query: '/api',
      useRegex: false,
      selectedId: 'req-17',
    };
    expect(decodeNetworkFilters(encodeNetworkFilters(state, available), available)).toEqual(state);
  });

  it('drops a filter value absent from this report instead of emptying the table', () => {
    // The whole point of sharing: the link was built against someone else's capture.
    const decoded = decodeNetworkFilters({ m: 'PATCH,GET' }, available);
    expect(decoded.methods).toEqual(new Set(['GET']));
  });

  it('falls back to every available value when none of the requested ones exist here', () => {
    expect(decodeNetworkFilters({ m: 'PATCH' }, available).methods).toEqual(
      new Set(available.methods),
    );
  });

  it('returns defaults for empty params', () => {
    expect(decodeNetworkFilters({}, available)).toEqual(networkDefaults);
  });

  it('handles a report with no entries at all', () => {
    // All three groups derive their default from the data, so an empty report yields empty sets —
    // matching the pane, which builds its defaults from presentStatusClasses/distinctMethods/
    // presentInitiators. Anything else would show filters the report cannot satisfy.
    const empty: NetworkAvailable = { classes: [], methods: [], initiators: [] };
    const decoded = decodeNetworkFilters({ cls: '2xx', m: 'GET', ini: 'fetch' }, empty);
    expect(decoded.classes).toEqual(new Set());
    expect(decoded.methods).toEqual(new Set());
    expect(decoded.initiators).toEqual(new Set());
  });
});

describe('DOM view codec', () => {
  it('omits defaults', () => {
    expect(encodeDomView({ elementQuery: '', tab: 'rendered' })).toEqual({});
  });

  it('round-trips a selector and tab', () => {
    const state = { elementQuery: '.checkout-btn', tab: 'source' } as const;
    expect(decodeDomView(encodeDomView(state))).toEqual(state);
  });

  it('falls back to the rendered tab for an unknown value', () => {
    expect(decodeDomView({ tab: 'wireframe' }).tab).toBe('rendered');
  });

  it('keeps the existing el param name so S4-09 deep-links still work', () => {
    expect(decodeDomView({ el: '#main' }).elementQuery).toBe('#main');
  });
});

describe('hostile input', () => {
  it('never throws on junk', () => {
    const junk = { lv: '%%%', q: '%E0%A4%A', rx: 'maybe', since: '{}', sel: '', tab: '42' };
    expect(() => decodeConsoleFilters(junk)).not.toThrow();
    expect(() => decodeNetworkFilters(junk, available)).not.toThrow();
    expect(() => decodeDomView(junk)).not.toThrow();
  });

  it('ignores params belonging to other panes', () => {
    expect(decodeConsoleFilters({ cls: '4xx', tab: 'source' })).toEqual(consoleDefaults);
  });
});
