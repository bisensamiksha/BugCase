/**
 * Overlay-side client for the durable overlay draft (BUG-06).
 *
 * The overlay (isolated world) can't reach `chrome.storage.session`, so it relays its draft to the
 * service worker, which persists it (overlay-draft-handler.ts / overlay-draft.ts). Every call is
 * best-effort — a failed relay must never break the capture UI, it only costs the restore.
 */

import {
  OVERLAY_DRAFT_CLEAR,
  OVERLAY_DRAFT_GET,
  OVERLAY_DRAFT_SAVE,
  type OverlayDraftRequest,
  type OverlayDraftResponse,
} from '../background/overlay-draft-handler';
import browser from '../lib/browser';
import type { OverlayDraft } from '../storage/overlay-draft';

export type DraftSendFn = (message: OverlayDraftRequest) => Promise<OverlayDraftResponse>;

function defaultSend(message: OverlayDraftRequest): Promise<OverlayDraftResponse> {
  return browser.runtime.sendMessage<OverlayDraftRequest, OverlayDraftResponse>(message);
}

async function relay(
  message: OverlayDraftRequest,
  send: DraftSendFn,
): Promise<OverlayDraftResponse> {
  try {
    return await send(message);
  } catch {
    return { ok: false };
  }
}

export async function getDraft(send: DraftSendFn = defaultSend): Promise<OverlayDraft | null> {
  const response = await relay({ type: OVERLAY_DRAFT_GET }, send);
  return response.ok ? (response.draft ?? null) : null;
}

export async function saveDraft(
  draft: OverlayDraft,
  send: DraftSendFn = defaultSend,
): Promise<void> {
  await relay({ type: OVERLAY_DRAFT_SAVE, draft }, send);
}

export async function clearDraft(send: DraftSendFn = defaultSend): Promise<void> {
  await relay({ type: OVERLAY_DRAFT_CLEAR }, send);
}
