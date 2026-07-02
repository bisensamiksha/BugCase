import browser from './browser';

/** Outcome of a reveal attempt; `revealed: false` means the caller should show the fallback hint. */
export interface RevealResult {
  readonly revealed: boolean;
  readonly filename: string;
}

export interface RevealDeps {
  /** Opens the platform file manager at the download. Defaults to `browser.downloads.show`. */
  readonly show?: (downloadId: number) => void | Promise<unknown>;
}

function defaultShow(): RevealDeps['show'] {
  const downloads = (browser as { downloads?: { show?: (id: number) => void | Promise<unknown> } })
    .downloads;
  return downloads?.show ? (id: number) => downloads.show!(id) : undefined;
}

/**
 * Reveal a downloaded report's ZIP in the OS file manager so the user can drop it into the dashboard.
 *
 * Uses `downloads.show` (not `open`, which Firefox restricts by gesture/file type). Resolves
 * `{ revealed: false, filename }` — the signal to show *"Find `<filename>` in your Downloads"* — when the
 * id is `null`, no `downloads.show` exists, or the call throws/rejects (e.g. Firefox purged the download
 * record). Never throws.
 */
export async function revealDownload(
  downloadId: number | null,
  filename: string,
  deps: RevealDeps = {},
): Promise<RevealResult> {
  const show = deps.show ?? defaultShow();
  if (downloadId === null || !show) {
    return { revealed: false, filename };
  }
  try {
    await show(downloadId);
    return { revealed: true, filename };
  } catch {
    return { revealed: false, filename };
  }
}
