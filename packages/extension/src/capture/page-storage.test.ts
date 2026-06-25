import { describe, expect, it } from 'vitest';

import type { RawPageStorage } from '../injected/storage-reader';

import { collectPageStorage } from './page-storage';

function read(raw: RawPageStorage): () => Promise<RawPageStorage> {
  return () => Promise.resolve(raw);
}

const SCRUBBED = '[scrubbed]';

describe('collectPageStorage', () => {
  it('keeps benign values and records key/sizeBytes', async () => {
    const dump = await collectPageStorage({
      readStorage: read({
        localStorage: [{ key: 'theme', value: 'dark', sizeBytes: 4 }],
        sessionStorage: [],
      }),
    });
    expect(dump?.localStorage).toEqual([{ key: 'theme', value: 'dark', sizeBytes: 4 }]);
    expect(dump?.sessionStorage).toEqual([]);
    expect(dump?.schemaVersion).toBe('v1');
    expect(dump?.note.length).toBeGreaterThan(0);
  });

  it('masks values whose key looks sensitive', async () => {
    const dump = await collectPageStorage({
      readStorage: read({
        localStorage: [
          { key: 'authToken', value: 'abc123', sizeBytes: 6 },
          { key: 'refresh_token', value: 'opaque', sizeBytes: 6 },
          { key: 'APIKey', value: 'zzz', sizeBytes: 3 },
        ],
        sessionStorage: null,
      }),
    });
    expect(dump?.localStorage?.map((e) => e.value)).toEqual([SCRUBBED, SCRUBBED, SCRUBBED]);
    expect(dump?.sessionStorage).toBeNull();
  });

  it('masks Bearer/JWT tokens inside otherwise-benign values', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc';
    const dump = await collectPageStorage({
      readStorage: read({
        localStorage: [{ key: 'last_response', value: `token ${jwt}`, sizeBytes: 40 }],
        sessionStorage: null,
      }),
    });
    expect(dump?.localStorage?.[0]?.value).toBe(`token ${SCRUBBED}`);
  });

  it('sorts entries by key and caps at 500', async () => {
    const entries = Array.from({ length: 600 }, (_, i) => ({
      key: `k${String(599 - i).padStart(4, '0')}`,
      value: 'v',
      sizeBytes: 1,
    }));
    const dump = await collectPageStorage({
      readStorage: read({ localStorage: entries, sessionStorage: null }),
    });
    expect(dump?.localStorage).toHaveLength(500);
    expect(dump?.localStorage?.[0]?.key).toBe('k0000');
    expect(dump?.localStorage?.[499]?.key).toBe('k0499');
  });

  it('passes both-null areas straight through with a note', async () => {
    const dump = await collectPageStorage({
      readStorage: read({ localStorage: null, sessionStorage: null }),
    });
    expect(dump?.schemaVersion).toBe('v1');
    expect(dump?.localStorage).toBeNull();
    expect(dump?.sessionStorage).toBeNull();
    expect(typeof dump?.note).toBe('string');
    expect(dump?.note.length).toBeGreaterThan(0);
  });

  it('returns null when the read rejects', async () => {
    const dump = await collectPageStorage({
      readStorage: () => Promise.reject(new Error('executeScript failed')),
    });
    expect(dump).toBeNull();
  });
});
