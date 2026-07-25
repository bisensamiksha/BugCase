/**
 * Keep the draggable overlay panel on-screen (S3-13 follow-up).
 *
 * The BugCase panel can be dragged by its header so it doesn't obscure the page. This clamps a
 * proposed position so a grabbable strip always stays within the viewport — you can push the panel
 * mostly off an edge, but never lose the header (and with it the way to drag it back or close it).
 * Pure, so the geometry is unit-tested without a DOM.
 */

export interface PanelPosition {
  readonly top: number;
  readonly left: number;
}

export interface PanelSize {
  readonly width: number;
  readonly height: number;
}

export interface ViewportSize {
  readonly innerWidth: number;
  readonly innerHeight: number;
}

/** Minimum panel strip (px) that must remain within the viewport, so it stays grabbable. */
export const MIN_VISIBLE = 48;

export function clampPanelPosition(
  pos: PanelPosition,
  panel: PanelSize,
  viewport: ViewportSize,
): PanelPosition {
  const minLeft = MIN_VISIBLE - panel.width;
  const maxLeft = viewport.innerWidth - MIN_VISIBLE;
  const minTop = 0;
  const maxTop = viewport.innerHeight - MIN_VISIBLE;
  return {
    left: Math.min(maxLeft, Math.max(minLeft, pos.left)),
    top: Math.min(maxTop, Math.max(minTop, pos.top)),
  };
}
