import type { ToolMetadata } from '@bugcase/schema';

export type BrowserBuildTarget = ToolMetadata['browserBuildTarget'];

export interface BrowserTargetEnv {
  readonly userAgent: string;
  /** Low-entropy UA-CH brands, when available (Chromium-based browsers). */
  readonly brands?: readonly { readonly brand: string }[] | undefined;
  /** Brave exposes `navigator.brave.isBrave()`; it's the only reliable Brave signal. */
  readonly isBrave?: (() => Promise<boolean>) | undefined;
}

/**
 * Best-effort detection of which browser is running, used for `tool.browserBuildTarget`.
 * Order matters: Brave and Edge both report a Chrome UA, so they must be checked first.
 */
export async function detectBrowserBuildTarget(env: BrowserTargetEnv): Promise<BrowserBuildTarget> {
  const ua = env.userAgent;
  const brands = (env.brands ?? []).map((b) => b.brand.toLowerCase());

  if (env.isBrave) {
    try {
      if (await env.isBrave()) {
        return 'brave';
      }
    } catch {
      // isBrave() can reject; fall through to UA/brand heuristics.
    }
  }
  if (brands.some((b) => b.includes('brave'))) return 'brave';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua) || brands.some((b) => b.includes('edge'))) return 'edge';
  if (/Chrome\//.test(ua) || brands.some((b) => b.includes('chrom'))) return 'chrome';
  return 'unknown';
}
