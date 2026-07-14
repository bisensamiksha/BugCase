import type { ScreenshotRef } from '@bugcase/schema';
import { Lightbox } from '@bugcase/shared-ui';

import { requestPeekAsset } from '../overlay/request-capture';

export interface PeekAssetResult {
  readonly ok: boolean;
  readonly dataUrl?: string;
  readonly reason?: string;
}

export type PeekAssetFn = (reportId: string, path: string) => Promise<PeekAssetResult>;

export interface LightboxScreenshotViewerProps {
  readonly reportId?: string;
  readonly screenshot: ScreenshotRef;
  /** Drives `aria-busy` and gates interactions (matches the ticket contract). */
  readonly disabled?: boolean;
  /** Close the viewer (Escape / × / backdrop). */
  readonly onCancel?: () => void;
  /** Reserved by the ticket contract; a read-only viewer has no separate commit action. */
  readonly onComplete?: () => void;
  /** Fetches the held asset as a data URL; defaults to the real SW bridge. Injectable for tests. */
  readonly peekAsset?: PeekAssetFn;
}

const EXPIRED_ERROR = 'Couldn’t load this screenshot. It may have expired — capture again.';

/**
 * Extension adapter over the shared {@link Lightbox}. Preserves the preview's public API and testids
 * while delegating the viewer shell (zoom/pan/keyboard) to `@bugcase/shared-ui`. Image bytes still
 * arrive through the SW `peekAsset` bridge as a data URL.
 */
export function LightboxScreenshotViewer({
  reportId,
  screenshot,
  disabled,
  onCancel,
  peekAsset,
}: LightboxScreenshotViewerProps) {
  const peek = peekAsset ?? requestPeekAsset;
  return (
    <Lightbox
      loadKey={`${reportId ?? ''}:${screenshot.path}`}
      alt="Captured screenshot"
      disabled={disabled ?? false}
      onCancel={() => onCancel?.()}
      errorMessage={EXPIRED_ERROR}
      load={() =>
        reportId
          ? peek(reportId, screenshot.path).then((res) =>
              res.ok && res.dataUrl ? res.dataUrl : null,
            )
          : Promise.resolve(null)
      }
    />
  );
}
