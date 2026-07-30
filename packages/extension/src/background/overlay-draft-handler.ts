/**
 * Service-worker message handlers for the durable overlay draft (BUG-06).
 *
 * The overlay runs in a page's isolated world and can't reach `chrome.storage.session`, so it relays
 * its draft over these messages and the worker persists it (overlay-draft.ts). Keyed by the sender's
 * tab, so a draft survives navigations within that tab.
 */

import {
  clearOverlayDraft,
  getOverlayDraft,
  saveOverlayDraft,
  type OverlayDraft,
  type OverlayDraftDeps,
} from '../storage/overlay-draft';

export const OVERLAY_DRAFT_GET = 'bugcase/overlay-draft-get';
export const OVERLAY_DRAFT_SAVE = 'bugcase/overlay-draft-save';
export const OVERLAY_DRAFT_CLEAR = 'bugcase/overlay-draft-clear';

export interface OverlayDraftGetRequest {
  readonly type: typeof OVERLAY_DRAFT_GET;
}
export interface OverlayDraftSaveRequest {
  readonly type: typeof OVERLAY_DRAFT_SAVE;
  readonly draft: OverlayDraft;
}
export interface OverlayDraftClearRequest {
  readonly type: typeof OVERLAY_DRAFT_CLEAR;
}

export type OverlayDraftRequest =
  | OverlayDraftGetRequest
  | OverlayDraftSaveRequest
  | OverlayDraftClearRequest;

export interface OverlayDraftResponse {
  readonly ok: boolean;
  readonly draft?: OverlayDraft | null;
}

const OVERLAY_DRAFT_TYPES = new Set<string>([
  OVERLAY_DRAFT_GET,
  OVERLAY_DRAFT_SAVE,
  OVERLAY_DRAFT_CLEAR,
]);

export function isOverlayDraftRequest(value: unknown): value is OverlayDraftRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    OVERLAY_DRAFT_TYPES.has((value as { type?: unknown }).type as string)
  );
}

export async function handleOverlayDraftRequest(
  message: OverlayDraftRequest,
  tabId: number | undefined,
  deps: OverlayDraftDeps = {},
): Promise<OverlayDraftResponse> {
  if (tabId === undefined) {
    return { ok: false };
  }
  switch (message.type) {
    case OVERLAY_DRAFT_SAVE:
      await saveOverlayDraft(tabId, message.draft, deps);
      return { ok: true };
    case OVERLAY_DRAFT_CLEAR:
      await clearOverlayDraft(tabId, deps);
      return { ok: true };
    case OVERLAY_DRAFT_GET:
      return { ok: true, draft: await getOverlayDraft(tabId, deps) };
  }
}
