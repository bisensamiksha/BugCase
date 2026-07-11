/**
 * Open the first-install onboarding on install (S3-18).
 *
 * The service worker calls this from `runtime.onInstalled`. It opens the options page — where the
 * OnboardingTour overlays on first run — only on a genuine fresh install (`reason === 'install'`), not
 * on extension/browser updates. `openOptionsPage` is injected so this is unit-tested; it never throws,
 * since an install handler must not fail.
 */

export interface OpenOnboardingDeps {
  /** Opens the extension's options page; defaults (at the call site) to `runtime.openOptionsPage`. */
  readonly openOptionsPage: () => Promise<void>;
}

export async function openOnboardingOnInstall(
  reason: string,
  deps: OpenOnboardingDeps,
): Promise<void> {
  if (reason !== 'install') {
    return;
  }
  try {
    await deps.openOptionsPage();
  } catch {
    // Best-effort: failing to open onboarding must never break install.
  }
}
