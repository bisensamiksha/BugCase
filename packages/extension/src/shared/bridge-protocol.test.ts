import { describe, expect, it } from 'vitest';

import {
  BUGCASE_BRIDGE_SOURCE,
  createFlushRequest,
  createFlushResponse,
  createVerifierToken,
  isBridgeMessage,
  isFlushRequest,
  isFlushResponse,
  tokenMatches,
} from './bridge-protocol';

describe('createVerifierToken', () => {
  it('returns a non-empty string', () => {
    expect(createVerifierToken()).toMatch(/\S/);
  });

  it('returns a different token each call (so requests cannot be trivially guessed)', () => {
    expect(createVerifierToken()).not.toBe(createVerifierToken());
  });
});

describe('createFlushRequest', () => {
  it('builds a tagged request carrying the channel, token, and a fresh correlation id', () => {
    const req = createFlushRequest('console', 'tok');
    expect(req).toMatchObject({
      source: BUGCASE_BRIDGE_SOURCE,
      kind: 'flush-request',
      channel: 'console',
      token: 'tok',
    });
    expect(req.id).toMatch(/\S/);
    expect(createFlushRequest('console', 'tok').id).not.toBe(req.id);
  });
});

describe('createFlushResponse', () => {
  it('echoes the request channel/id/token and attaches the entries', () => {
    const req = createFlushRequest('network', 'tok');
    const res = createFlushResponse(req, [{ a: 1 }]);
    expect(res).toEqual({
      source: BUGCASE_BRIDGE_SOURCE,
      kind: 'flush-response',
      channel: 'network',
      id: req.id,
      token: 'tok',
      entries: [{ a: 1 }],
    });
  });
});

describe('type guards', () => {
  const req = createFlushRequest('console', 'tok');
  const res = createFlushResponse(req, []);

  it('isBridgeMessage accepts our messages and rejects anything else', () => {
    expect(isBridgeMessage(req)).toBe(true);
    expect(isBridgeMessage(res)).toBe(true);
    expect(isBridgeMessage({ source: 'other', kind: 'flush-request' })).toBe(false);
    expect(isBridgeMessage({ kind: 'flush-request' })).toBe(false);
    expect(isBridgeMessage(null)).toBe(false);
    expect(isBridgeMessage('flush')).toBe(false);
  });

  it('isFlushRequest / isFlushResponse discriminate by kind', () => {
    expect(isFlushRequest(req)).toBe(true);
    expect(isFlushRequest(res)).toBe(false);
    expect(isFlushResponse(res)).toBe(true);
    expect(isFlushResponse(req)).toBe(false);
  });

  it('rejects a bridge-shaped message with an unknown kind', () => {
    expect(isFlushRequest({ source: BUGCASE_BRIDGE_SOURCE, kind: 'nope' })).toBe(false);
    expect(isBridgeMessage({ source: BUGCASE_BRIDGE_SOURCE, kind: 'nope' })).toBe(false);
  });
});

describe('tokenMatches', () => {
  it('is true only when the source and token both match', () => {
    const res = createFlushResponse(createFlushRequest('console', 'right'), []);
    expect(tokenMatches(res, 'right')).toBe(true);
    expect(tokenMatches(res, 'wrong')).toBe(false);
  });
});
