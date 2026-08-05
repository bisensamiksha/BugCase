import type { ElementInspection, ElementInspectionsManifest } from '@bugcase/schema';
import { Lightbox } from '@bugcase/shared-ui';
import { useEffect, useMemo, useState } from 'react';

import { AsyncState } from '../components/AsyncState';
import { HtmlSnippet } from '../components/HtmlSnippet';
import { categorizeStyles, filterStyles } from '../lib/computed-style-diff';
import type { ReportSource } from '../lib/report-source';
import { formatHash } from '../router/hash-router';

import { ancestorBreadcrumb, deriveSelector, elementLabel } from './inspection-selector';

export interface ElementInspectionsPaneProps {
  /** Parsed `report.elementInspections`; null when nothing was picked. */
  readonly manifest: ElementInspectionsManifest | null;
  /** Active report id — builds the DOM-pane deep-links + lightbox keys. */
  readonly reportId: string;
  /** Lazy ZIP access for the crop PNGs (S4-05 seam). */
  readonly source: ReportSource;
}

const LABEL = 'text-xs font-semibold text-[var(--bc-fg-muted)]';

/** Crop image with the ScreenshotCard lifecycle: '' → none, null read → unavailable. */
function CropImage({
  path,
  source,
  alt,
  testId,
  className,
}: {
  readonly path: string;
  readonly source: ReportSource;
  readonly alt: string;
  readonly testId: string;
  readonly className: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    if (!path) {
      return;
    }
    void source
      .objectUrl(path)
      .then((resolved) => {
        if (cancelled) {
          return;
        }
        if (resolved) {
          setUrl(resolved);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, path]);

  if (!path) {
    return (
      <span data-testid={`${testId}-none`} className="text-xs text-[var(--bc-fg-muted)]">
        No crop captured.
      </span>
    );
  }
  if (failed) {
    return (
      <span data-testid={`${testId}-unavailable`} className="text-xs text-[var(--bc-fg-muted)]">
        Image unavailable
      </span>
    );
  }
  if (!url) {
    return (
      <span data-testid={`${testId}-loading`} className="text-xs text-[var(--bc-fg-muted)]">
        Loading…
      </span>
    );
  }
  return <img src={url} alt={alt} data-testid={`${testId}-img`} className={className} />;
}

/**
 * Element inspections pane (S4-11): master–detail view of the S3-13 picker output — crop
 * screenshot (thumbnail + shared Lightbox), position, ancestor breadcrumb, Shiki-highlighted
 * HTML, and the stored non-default computed-styles diff grouped DevTools-style with a filter.
 * ZIP-derived strings render as text nodes; the only raw markup is Shiki's escaped output.
 */
export function ElementInspectionsPane({
  manifest,
  reportId,
  source,
}: ElementInspectionsPaneProps) {
  const inspections = useMemo(() => manifest?.inspections ?? [], [manifest]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [styleQuery, setStyleQuery] = useState('');
  const [lightboxPath, setLightboxPath] = useState<string | null>(null);

  const selected: ElementInspection | null =
    inspections.find((inspection) => inspection.id === selectedId) ?? inspections[0] ?? null;

  if (selected === null) {
    return (
      <section
        data-testid="element-inspections-pane"
        aria-label="Inspections"
        className="flex h-full flex-col p-4"
      >
        <AsyncState
          status="empty"
          empty={
            <p data-testid="inspections-empty" className="text-[var(--bc-fg-muted)]">
              No element inspections captured.
            </p>
          }
        />
      </section>
    );
  }

  const rect = selected.boundingClientRect;
  const positionText = `${Math.round(rect.x)}, ${Math.round(rect.y)} · ${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
  const selector = deriveSelector(selected.outerHtml);
  const styleCount = Object.keys(selected.computedStyles).length;
  const styleGroups = categorizeStyles(filterStyles(selected.computedStyles, styleQuery));

  return (
    <section
      data-testid="element-inspections-pane"
      aria-label="Inspections"
      className="flex h-full gap-4 p-4"
    >
      <ol
        data-testid="inspections-list"
        aria-label="Inspected elements"
        className="w-56 shrink-0 list-none space-y-2 overflow-auto"
      >
        {inspections.map((inspection, index) => {
          const isSelected = inspection.id === selected.id;
          return (
            <li key={inspection.id}>
              <button
                type="button"
                data-testid={`inspection-row-${index}`}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => setSelectedId(inspection.id)}
                className={`w-full rounded border p-2 text-left text-sm ${
                  isSelected
                    ? 'border-[var(--bc-accent)] bg-[var(--bc-surface)]'
                    : 'border-[var(--bc-border-strong)]'
                }`}
              >
                <span className="font-mono text-xs text-[var(--bc-fg-muted)]">{index + 1}. </span>
                <span className="font-mono text-xs text-[var(--bc-fg)]">
                  {elementLabel(inspection.outerHtml)}
                </span>
                <span className="mt-1 block">
                  <CropImage
                    path={inspection.screenshotCropPath}
                    source={source}
                    alt={`Crop of ${elementLabel(inspection.outerHtml)}`}
                    testId={`inspection-thumb-${index}`}
                    className="max-h-16 w-full object-contain"
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div
        data-testid="inspection-detail"
        className="min-w-0 flex-1 space-y-3 overflow-auto rounded border border-[var(--bc-border)] p-3"
      >
        <div>
          <p className={LABEL}>Crop screenshot</p>
          <button
            type="button"
            data-testid="inspection-crop-open"
            aria-label="Open element crop screenshot"
            onClick={() => setLightboxPath(selected.screenshotCropPath)}
            disabled={!selected.screenshotCropPath}
            className="mt-1 block bg-transparent p-0"
          >
            <CropImage
              path={selected.screenshotCropPath}
              source={source}
              alt="Element crop screenshot"
              testId="inspection-crop"
              className="max-h-48 object-contain"
            />
          </button>
        </div>

        <div>
          <p className={LABEL}>Position</p>
          <p data-testid="inspection-position" className="font-mono text-sm text-[var(--bc-fg)]">
            {positionText}
          </p>
        </div>

        <div>
          <p className={LABEL}>Ancestors</p>
          <p data-testid="inspection-breadcrumb" className="font-mono text-xs text-[var(--bc-fg)]">
            {ancestorBreadcrumb(selected.ancestors, selected.outerHtml)}
          </p>
          {selector !== null ? (
            <a
              data-testid="inspection-dom-link"
              href={formatHash({ activePane: 'dom', reportId, params: { el: selector } })}
              className="text-sm text-[var(--bc-accent)] underline"
            >
              Find in DOM snapshot
            </a>
          ) : null}
        </div>

        <div>
          <p className={LABEL}>HTML</p>
          <div className="mt-1">
            <HtmlSnippet html={selected.outerHtml} testId="inspection-html" />
          </div>
        </div>

        <div>
          <label htmlFor="inspection-style-filter" className={LABEL}>
            Computed styles (non-default)
          </label>
          <input
            id="inspection-style-filter"
            data-testid="inspection-style-filter"
            type="text"
            value={styleQuery}
            onChange={(event) => setStyleQuery(event.target.value)}
            placeholder="Filter properties…"
            className="mt-1 block w-full max-w-xs rounded border border-[var(--bc-border-strong)] bg-[var(--bc-bg)] px-2 py-1 text-sm text-[var(--bc-fg)]"
          />
          {styleCount === 0 ? (
            <p
              data-testid="inspection-styles-empty"
              className="mt-2 text-sm text-[var(--bc-fg-muted)]"
            >
              No styles differ from defaults.
            </p>
          ) : styleGroups.length === 0 ? (
            <p
              data-testid="inspection-styles-nomatch"
              className="mt-2 text-sm text-[var(--bc-fg-muted)]"
            >
              No matching properties.
            </p>
          ) : (
            styleGroups.map((group) => (
              <div key={group.label} className="mt-2">
                <p className={LABEL}>
                  {group.label} ({group.entries.length})
                </p>
                <dl
                  data-testid="inspection-style-group"
                  className="mt-1 grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-0.5"
                >
                  {group.entries.map(([prop, value]) => (
                    <div key={prop} className="contents">
                      <dt className="font-mono text-xs text-[var(--bc-fg-muted)]">{prop}</dt>
                      <dd className="break-all font-mono text-xs text-[var(--bc-fg)]">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))
          )}
        </div>
      </div>

      {lightboxPath ? (
        <Lightbox
          loadKey={`${reportId}:${lightboxPath}`}
          alt="Element crop screenshot"
          onCancel={() => setLightboxPath(null)}
          load={() => source.objectUrl(lightboxPath)}
        />
      ) : null}
    </section>
  );
}
