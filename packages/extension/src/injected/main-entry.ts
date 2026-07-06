// MAIN-world content script, registered at document_start on allowlisted origins
// (see background/content-script-registration.ts). It runs in the page's own JS world, so it can
// observe page globals that the isolated content-script world cannot. S2-03 established this
// injection point + idempotency guard; S2-05 installs the page-bridge client here so the isolated
// world can pull buffered data out. The console (S2-06) and network (S2-07) ring buffers register
// their flush providers on this client.

import { createRecorderStep } from '../shared/bridge-protocol';

import { installConsoleRingBuffer, type ConsoleRingBufferHandle } from './console-ring-buffer';
import { installNetworkRingBuffer, type NetworkRingBufferHandle } from './network-ring-buffer';
import { installPageBridgeClient, type PageBridgeClient } from './page-bridge-client';
import {
  installRecorderControlListener,
  installReproductionRecorder,
  type ReproductionRecorderHandle,
} from './reproduction-recorder';

/** Window flag marking that the MAIN-world script has installed, so a re-injection is a no-op. */
export const PASSIVE_MAIN_INSTALLED_FLAG = '__bugcasePassiveMainInstalled';

/** The MAIN-world bridge responder, available to ring buffers once this entry has installed. */
let pageBridgeClient: PageBridgeClient | undefined;

/** The console + error ring buffer, installed alongside the bridge client (S2-06). */
let consoleBuffer: ConsoleRingBufferHandle | undefined;

/** The fetch + XMLHttpRequest ring buffer, installed alongside the bridge client (S2-07). */
let networkBuffer: NetworkRingBufferHandle | undefined;

/** The reproduction-steps recorder, armed on demand from the overlay (S3-12). */
let reproductionRecorder: ReproductionRecorderHandle | undefined;

/** Accessor for the installed bridge client (e.g. S2-06/S2-07 register flush providers on it). */
export function getPageBridgeClient(): PageBridgeClient | undefined {
  return pageBridgeClient;
}

/** Accessor for the installed console ring buffer (used by capture flows / tests). */
export function getConsoleBuffer(): ConsoleRingBufferHandle | undefined {
  return consoleBuffer;
}

/** Accessor for the installed network ring buffer (used by capture flows / tests). */
export function getNetworkBuffer(): NetworkRingBufferHandle | undefined {
  return networkBuffer;
}

/** Accessor for the installed reproduction recorder (used by capture flows / tests). */
export function getReproductionRecorder(): ReproductionRecorderHandle | undefined {
  return reproductionRecorder;
}

/**
 * Install the MAIN-world passive-monitoring entry on `win`. Returns `true` if it installed now,
 * `false` if it was already installed (document_start scripts can run more than once per page —
 * e.g. same-document navigations — and must not double-install).
 */
export function installPassiveMainWorld(win: Window): boolean {
  const flags = win as unknown as Record<string, unknown>;
  if (flags[PASSIVE_MAIN_INSTALLED_FLAG]) {
    return false;
  }
  flags[PASSIVE_MAIN_INSTALLED_FLAG] = true;
  return true;
}

// Self-install when injected into a page. Guarded so importing the module in a non-DOM context
// (e.g. a node test) is side-effect free. The bridge client is installed only on first injection.
if (typeof window !== 'undefined' && installPassiveMainWorld(window)) {
  pageBridgeClient = installPageBridgeClient(window);
  // Capture console calls + global errors into a ring buffer, and serve it over the bridge's
  // `console` channel so the isolated world can pull it during a capture. The event-listener methods
  // are wrapped to the minimal scope signature so the buffer's listeners can be added/removed.
  consoleBuffer = installConsoleRingBuffer({
    console: window.console,
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
  });
  pageBridgeClient.registerFlushProvider('console', () => consoleBuffer?.snapshot() ?? []);
  // Capture fetch + XMLHttpRequest metadata (never bodies) and serve it over the `network` channel.
  networkBuffer = installNetworkRingBuffer(window);
  pageBridgeClient.registerFlushProvider('network', () => networkBuffer?.snapshot() ?? []);
  // Reproduction recorder (S3-12): idle until the overlay arms it via a recorder-control message.
  // Its buffered steps are served over the `reproduction` channel at capture time, and each step is
  // also pushed to the overlay as it happens so a recording survives navigation (Part B).
  reproductionRecorder = installReproductionRecorder(window, {
    onStep: (step, token) => window.postMessage(createRecorderStep(step, token), '*'),
  });
  pageBridgeClient.registerFlushProvider(
    'reproduction',
    () => reproductionRecorder?.snapshot() ?? [],
  );
  installRecorderControlListener(window, reproductionRecorder);
}
