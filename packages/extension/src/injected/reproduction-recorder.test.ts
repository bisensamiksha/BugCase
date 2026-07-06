// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { createRecorderControl } from '../shared/bridge-protocol';
import { OVERLAY_HOST_ID } from '../shared/overlay-host';

import {
  installRecorderControlListener,
  installReproductionRecorder,
  type RawReproStep,
  type ReproductionRecorderHandle,
} from './reproduction-recorder';

let recorder: ReproductionRecorderHandle;

afterEach(() => {
  recorder.dispose();
  document.body.innerHTML = '';
});

function install(now: () => number = () => 1000, maxSteps = 200): void {
  recorder = installReproductionRecorder(window, { now, maxSteps });
}

function clickOn(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('installReproductionRecorder', () => {
  it('records nothing until armed', () => {
    install();
    document.body.innerHTML = '<button id="save">Save</button>';
    clickOn(document.getElementById('save') as Element);
    expect(recorder.snapshot()).toHaveLength(0);
  });

  it('records a click with its type and stable selector once armed', () => {
    install(() => 1234);
    document.body.innerHTML = '<button id="save">Save</button>';
    recorder.arm('tok');
    clickOn(document.getElementById('save') as Element);
    const steps = recorder.snapshot();
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: 'click', selector: '#save', timestamp: 1234 });
  });

  it('records clicks only — never scroll, typing, or keystrokes', () => {
    install();
    document.body.innerHTML = '<input id="email" type="text" />';
    const input = document.getElementById('email') as HTMLInputElement;
    input.value = 'secret@example.com';
    recorder.arm('tok');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
    expect(recorder.snapshot()).toHaveLength(0);
  });

  it('records a human-readable label and href path for a clicked link', () => {
    install(() => 1000);
    document.body.innerHTML = '<a href="/products?ref=nav#top">Products</a>';
    recorder.arm('tok');
    clickOn(document.querySelector('a') as Element);
    const step = recorder.snapshot()[0];
    expect(step?.type).toBe('click');
    expect(step?.description).toBe('Clicked "Products" (link)');
    // Query string + hash are dropped from the href to avoid leaking tokens.
    expect(step?.metadata).toMatchObject({ tag: 'a', label: 'Products', href: '/products' });
  });

  it('resolves a click on a graphic inside a labeled node to that node’s label', () => {
    install();
    // Mirrors a diagram/whiteboard node: a generated data-* id + a text label, clicked via an inner
    // shape that itself has no text (like an SVG <rect>).
    document.body.innerHTML =
      '<div data-node-id="g8GjkJAhvnSxXTZks0V1g"><i class="shape"></i><span>Introduction</span></div>';
    recorder.arm('tok');
    clickOn(document.querySelector('i') as Element);
    const step = recorder.snapshot()[0];
    expect(step?.description).toContain('Introduction');
    // The unstable generated data-node-id must not appear in the selector.
    expect(step?.selector).not.toContain('g8GjkJAhvnSxXTZks0V1g');
  });

  it('resolves the label and link for a click on a child of a link', () => {
    install();
    document.body.innerHTML = '<a href="/buy"><span>Buy now</span></a>';
    recorder.arm('tok');
    clickOn(document.querySelector('span') as Element);
    const step = recorder.snapshot()[0];
    expect(String(step?.metadata.label)).toContain('Buy now');
    expect(step?.metadata.href).toBe('/buy');
  });

  it('truncates a very long label', () => {
    install();
    document.body.innerHTML = `<button>${'x'.repeat(200)}</button>`;
    recorder.arm('tok');
    clickOn(document.querySelector('button') as Element);
    const label = String(recorder.snapshot()[0]?.metadata.label ?? '');
    expect(label.length).toBeLessThanOrEqual(81);
  });

  it('ignores events originating from the BugCase overlay', () => {
    install();
    document.body.innerHTML = `<div id="${OVERLAY_HOST_ID}"><button id="stop">Stop</button></div>`;
    recorder.arm('tok');
    clickOn(document.getElementById('stop') as Element);
    expect(recorder.snapshot()).toHaveLength(0);
  });

  it('stops recording after disarm but keeps the buffered steps', () => {
    install();
    document.body.innerHTML = '<button id="a">a</button>';
    recorder.arm('tok');
    clickOn(document.getElementById('a') as Element);
    recorder.disarm('tok');
    clickOn(document.getElementById('a') as Element);
    expect(recorder.snapshot()).toHaveLength(1);
    expect(recorder.isArmed()).toBe(false);
  });

  it('clears the buffer when a new session is armed', () => {
    install();
    document.body.innerHTML = '<button id="a">a</button>';
    recorder.arm('tok1');
    clickOn(document.getElementById('a') as Element);
    recorder.disarm('tok1');
    recorder.arm('tok2');
    expect(recorder.snapshot()).toHaveLength(0);
  });

  it('only disarms for the matching session token (anti-spoof)', () => {
    install();
    document.body.innerHTML = '<button id="a">a</button>';
    recorder.arm('right');
    recorder.disarm('wrong');
    expect(recorder.isArmed()).toBe(true);
    clickOn(document.getElementById('a') as Element);
    expect(recorder.snapshot()).toHaveLength(1);
  });

  it('caps the buffer at maxSteps, keeping the most recent', () => {
    install(() => 1, 2);
    document.body.innerHTML = '<button id="a">a</button><button id="b">b</button>';
    recorder.arm('tok');
    clickOn(document.getElementById('a') as Element);
    clickOn(document.getElementById('b') as Element);
    clickOn(document.getElementById('b') as Element);
    expect(recorder.snapshot()).toHaveLength(2);
  });

  it('emits each recorded step to onStep with the session token', () => {
    const emitted: Array<{ step: RawReproStep; token: string }> = [];
    recorder = installReproductionRecorder(window, {
      onStep: (step, token) => emitted.push({ step, token }),
    });
    document.body.innerHTML = '<button id="a">a</button>';
    recorder.arm('sess-1');
    clickOn(document.getElementById('a') as Element);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.step.type).toBe('click');
    expect(emitted[0]?.token).toBe('sess-1');
  });

  it('does not record after dispose', () => {
    install();
    document.body.innerHTML = '<button id="a">a</button>';
    recorder.arm('tok');
    recorder.dispose();
    expect(() => clickOn(document.getElementById('a') as Element)).not.toThrow();
    expect(recorder.snapshot()).toHaveLength(0);
  });
});

describe('installRecorderControlListener', () => {
  it('arms and disarms the recorder from control messages', () => {
    const armed: string[] = [];
    const disarmed: string[] = [];
    const off = installRecorderControlListener(window, {
      arm: (t) => armed.push(t),
      disarm: (t) => disarmed.push(t),
    });

    window.dispatchEvent(
      new MessageEvent('message', { data: createRecorderControl('start', 'tok') }),
    );
    window.dispatchEvent(
      new MessageEvent('message', { data: createRecorderControl('stop', 'tok') }),
    );
    expect(armed).toEqual(['tok']);
    expect(disarmed).toEqual(['tok']);

    off();
    window.dispatchEvent(
      new MessageEvent('message', { data: createRecorderControl('start', 'x') }),
    );
    expect(armed).toEqual(['tok']);
  });

  it('ignores non-control messages', () => {
    const armed: string[] = [];
    installRecorderControlListener(window, { arm: (t) => armed.push(t), disarm: () => {} });
    window.dispatchEvent(new MessageEvent('message', { data: { hello: 'world' } }));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { source: 'other', kind: 'recorder-control', action: 'start' },
      }),
    );
    expect(armed).toHaveLength(0);
  });
});
