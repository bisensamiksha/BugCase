import { DOM_SANDBOX, buildSandboxSrcDoc } from '@bugcase/shared-ui';

export interface SandboxFrameProps {
  /** Captured HTML to render. Wrapped with the shared network-blocking CSP before display. */
  readonly html: string;
  /** Accessible name for the iframe (required — a frame without one fails the a11y gate). */
  readonly title: string;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * The ONE dashboard surface allowed to render captured HTML as a document (S4-09). Everything
 * security-critical is delegated to the shared `sandbox-html` copy in `@bugcase/shared-ui`:
 * `DOM_SANDBOX` (empty sandbox — opaque origin, no scripts) and `buildSandboxSrcDoc` (network-
 * blocking CSP). Never render captured markup through any other element, and never add an
 * `allow-*` token here.
 */
export function SandboxFrame({ html, title, className, ...rest }: SandboxFrameProps) {
  return (
    <iframe
      data-testid={rest['data-testid']}
      title={title}
      sandbox={DOM_SANDBOX}
      referrerPolicy="no-referrer"
      srcDoc={buildSandboxSrcDoc(html)}
      className={className}
    />
  );
}
