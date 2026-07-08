import { describe, expect, it } from 'vitest';

import {
  BUGCASE_BRIDGE_SOURCE,
  createFlushRequest,
  createFlushResponse,
  createPassiveError,
  createRecorderControl,
  createRecorderStep,
  createVerifierToken,
  isBridgeMessage,
  isFlushRequest,
  isFlushResponse,
  isPassiveError,
  isRecorderControl,
  isRecorderStep,
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

describe('createRecorderControl', () => {
  it('builds a tagged control message carrying the action and token', () => {
    const msg = createRecorderControl('start', 'tok');
    expect(msg).toEqual({
      source: BUGCASE_BRIDGE_SOURCE,
      kind: 'recorder-control',
      action: 'start',
      token: 'tok',
    });
  });

  it('supports the stop action', () => {
    expect(createRecorderControl('stop', 'tok').action).toBe('stop');
  });
});

describe('isRecorderControl', () => {
  it('accepts a recorder-control message and rejects flush messages', () => {
    const control = createRecorderControl('start', 'tok');
    const flush = createFlushRequest('reproduction', 'tok');
    expect(isRecorderControl(control)).toBe(true);
    expect(isRecorderControl(flush)).toBe(false);
    // A recorder-control is not mistaken for a flush request/response.
    expect(isFlushRequest(control)).toBe(false);
    expect(isFlushResponse(control)).toBe(false);
  });

  it('is recognized as a bridge message', () => {
    expect(isBridgeMessage(createRecorderControl('stop', 'tok'))).toBe(true);
  });

  it('rejects a look-alike without our source tag', () => {
    expect(isRecorderControl({ source: 'other', kind: 'recorder-control', action: 'start' })).toBe(
      false,
    );
  });
});

describe('createRecorderStep / isRecorderStep', () => {
  it('builds a tagged recorder-step message carrying the step and token', () => {
    const step = { type: 'click', selector: '#x' };
    const msg = createRecorderStep(step, 'tok');
    expect(msg).toEqual({
      source: BUGCASE_BRIDGE_SOURCE,
      kind: 'recorder-step',
      step,
      token: 'tok',
    });
    expect(isRecorderStep(msg)).toBe(true);
  });

  it('is a bridge message but not a flush or control message', () => {
    const msg = createRecorderStep({}, 'tok');
    expect(isBridgeMessage(msg)).toBe(true);
    expect(isFlushRequest(msg)).toBe(false);
    expect(isRecorderControl(msg)).toBe(false);
  });

  it('rejects a look-alike without our source tag', () => {
    expect(isRecorderStep({ kind: 'recorder-step', step: {}, token: 't' })).toBe(false);
  });
});

describe('createPassiveError / isPassiveError', () => {
  it('builds a tagged passive-error signal', () => {
    const msg = createPassiveError();
    expect(msg).toEqual({ source: BUGCASE_BRIDGE_SOURCE, kind: 'passive-error' });
    expect(isPassiveError(msg)).toBe(true);
    expect(isBridgeMessage(msg)).toBe(true);
  });

  it('is not confused with a flush or control message', () => {
    const msg = createPassiveError();
    expect(isFlushRequest(msg)).toBe(false);
    expect(isRecorderControl(msg)).toBe(false);
    expect(isRecorderStep(msg)).toBe(false);
  });

  it('rejects a look-alike without our source tag', () => {
    expect(isPassiveError({ kind: 'passive-error' })).toBe(false);
  });
});

describe('reproduction flush channel', () => {
  it('is a valid flush channel', () => {
    const req = createFlushRequest('reproduction', 'tok');
    expect(req.channel).toBe('reproduction');
    expect(isFlushRequest(req)).toBe(true);
  });
});

describe('tokenMatches', () => {
  it('is true only when the source and token both match', () => {
    const res = createFlushResponse(createFlushRequest('console', 'right'), []);
    expect(tokenMatches(res, 'right')).toBe(true);
    expect(tokenMatches(res, 'wrong')).toBe(false);
  });
});
