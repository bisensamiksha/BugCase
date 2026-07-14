import type { BugReportV1, ScreenshotRef } from '@bugcase/schema';
import { Lightbox } from '@bugcase/shared-ui';
import { useEffect, useState } from 'react';

import { AsyncState } from '../components/AsyncState';
import type { ReportSource } from '../lib/report-source';

import { annotationSummaryFor, formatAnnotationSummary } from './annotation-metadata';
import type { ScreenshotKind } from './overview-metrics';

export interface ScreenshotsPaneProps {
  readonly report: BugReportV1;
  readonly reportId: string;
  readonly source: ReportSource;
}

interface ScreenshotEntry {
  readonly kind: ScreenshotKind;
  readonly ref: ScreenshotRef;
}

const KIND_LABELS: Readonly<Record<ScreenshotKind, string>> = {
  fullPage: 'Full page',
  viewport: 'Viewport',
  elementCrop: 'Element crop',
};

/** All screenshots in a stable display order: full page, viewport, then element crops. */
export function screenshotEntries(report: BugReportV1): readonly ScreenshotEntry[] {
  const s = report.screenshots as BugReportV1['screenshots'] | undefined;
  const entries: ScreenshotEntry[] = [];
  if (s?.fullPage) {
    entries.push({ kind: 'fullPage', ref: s.fullPage });
  }
  if (s?.viewport) {
    entries.push({ kind: 'viewport', ref: s.viewport });
  }
  for (const ref of s?.elementCrops ?? []) {
    entries.push({ kind: 'elementCrop', ref });
  }
  return entries;
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function ScreenshotCard({
  entry,
  report,
  source,
  onOpen,
}: {
  readonly entry: ScreenshotEntry;
  readonly report: BugReportV1;
  readonly source: ReportSource;
  readonly onOpen: () => void;
}) {
  const { kind, ref } = entry;
  const kindLabel = KIND_LABELS[kind];
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    void source
      .objectUrl(ref.path)
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
  }, [source, ref.path]);

  const summary = annotationSummaryFor(report, ref.path);

  return (
    <li
      data-testid="screenshot-card"
      className="rounded-[var(--bc-radius)] border border-[var(--bc-border)] p-3"
    >
      <button
        type="button"
        data-testid="screenshot-thumb"
        aria-label={`Open ${kindLabel} screenshot`}
        onClick={onOpen}
        disabled={!url}
        className="block w-full bg-transparent p-0"
      >
        {url ? (
          <img
            src={url}
            alt={`${kindLabel} screenshot`}
            data-testid="screenshot-thumb-img"
            className="max-h-48 w-full object-contain"
          />
        ) : failed ? (
          <span data-testid="screenshot-unavailable" className="text-sm text-[var(--bc-fg-muted)]">
            Image unavailable
          </span>
        ) : (
          <span
            data-testid="screenshot-thumb-loading"
            className="text-sm text-[var(--bc-fg-muted)]"
          >
            Loading…
          </span>
        )}
      </button>
      <p className="mt-2 text-sm text-[var(--bc-fg)]">
        {kindLabel} · {ref.width}×{ref.height} · {ref.captureMethod}
      </p>
      {summary ? (
        <p data-testid="screenshot-annotations" className="text-sm text-[var(--bc-fg-muted)]">
          ✎ {formatAnnotationSummary(summary)}
        </p>
      ) : null}
      {url ? (
        <a
          href={url}
          download={basename(ref.path)}
          data-testid="screenshot-download"
          aria-label={`Download ${kindLabel} screenshot`}
          className="mt-2 inline-block text-sm text-[var(--bc-accent)] underline"
        >
          Download
        </a>
      ) : null}
    </li>
  );
}

/**
 * Screenshots pane (S4-06). Renders a gallery of the baked screenshot PNGs, each read on demand
 * through the S4-05 {@link ReportSource} seam (thumbnail, download, and lightbox reuse the one cached
 * object URL, revoked by the App on report close). Annotation metadata is shown as additive text only.
 */
export function ScreenshotsPane({ report, reportId, source }: ScreenshotsPaneProps) {
  const entries = screenshotEntries(report);
  const [openPath, setOpenPath] = useState<string | null>(null);

  return (
    <section data-testid="screenshots-pane" aria-label="Screenshots" className="h-full p-4">
      <AsyncState
        status={entries.length > 0 ? 'ready' : 'empty'}
        empty={
          <p data-testid="screenshots-empty" className="text-[var(--bc-fg-muted)]">
            No screenshots captured.
          </p>
        }
      >
        <ul
          data-testid="screenshots-grid"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {entries.map((entry) => (
            <ScreenshotCard
              key={entry.ref.path}
              entry={entry}
              report={report}
              source={source}
              onOpen={() => setOpenPath(entry.ref.path)}
            />
          ))}
        </ul>
      </AsyncState>
      {openPath ? (
        <Lightbox
          loadKey={`${reportId}:${openPath}`}
          alt={`Screenshot ${basename(openPath)}`}
          onCancel={() => setOpenPath(null)}
          load={() => source.objectUrl(openPath)}
        />
      ) : null}
    </section>
  );
}
