import type { BugReportV1 } from '@bugcase/schema';
import { Suspense, useEffect, useRef, useState } from 'react';

import { AsyncState, type AsyncStatus } from './components/AsyncState';
import { DropZone, zipFilesFrom } from './components/DropZone';
import { ReportTabBar } from './components/ReportTabBar';
import { AppShell } from './layout/AppShell';
import {
  LazyConsolePane,
  LazyDomPane,
  LazyElementInspectionsPane,
  LazyNetworkPane,
  LazyOverviewPane,
  LazyPanePlaceholder,
  LazyPrivacyPane,
  LazyReproductionPane,
  LazyScreenshotsPane,
  LazyStoragePane,
} from './lib/lazy-panes';
import { readReportZip, type ReadReportResult } from './lib/read-report-zip';
import type { ReportSource } from './lib/report-source';
import { formatHash, type DashboardPane } from './router/hash-router';
import { useHashRoute } from './router/use-hash-route';
import {
  addReportTab,
  closeReportTab,
  findTab,
  makeReportTab,
  neighborTabId,
  reorderReportTabs,
  type ReportTab,
} from './state/report-tabs';

export interface AppProps {
  /** Defaults to the real client-side ZIP reader; injectable for tests. */
  readonly read?: (input: Blob) => Promise<ReadReportResult>;
  /**
   * When the dashboard is opened as a self-contained `report.html`, `main.tsx` parses the injected
   * `window.__BUG_REPORT__` payload into a {@link ReportSource} and passes it here so the report
   * auto-opens with no drop step (S4-15). Absent for the hosted dashboard.
   */
  readonly initialSource?: ReportSource;
}

/** The active pane's element, chosen by route. Each pane is a lazy chunk (see `lazy-panes.ts`). */
function paneElement(
  pane: DashboardPane,
  report: BugReportV1,
  reportId: string,
  source: ReportSource | undefined,
  elementQuery: string | null,
) {
  switch (pane) {
    case 'console':
      return <LazyConsolePane log={report.console} />;
    case 'network':
      return <LazyNetworkPane log={report.network} />;
    case 'screenshots':
      // The pane reads image bytes lazily via the report's ReportSource; without one (should not
      // happen for an open tab) fall back to the neutral placeholder rather than throwing.
      return source ? (
        <LazyScreenshotsPane report={report} reportId={reportId} source={source} />
      ) : (
        <LazyPanePlaceholder pane={pane} />
      );
    case 'dom':
      // Snapshot text is read lazily via the ReportSource; the `?el=` hash param deep-links to an
      // element (S4-11 seam).
      return source ? (
        <LazyDomPane
          dom={report.dom}
          reportId={reportId}
          source={source}
          initialElementQuery={elementQuery}
        />
      ) : (
        <LazyPanePlaceholder pane={pane} />
      );
    case 'inspections':
      // Crop bytes are read lazily via the ReportSource; without one fall back to the placeholder.
      return source ? (
        <LazyElementInspectionsPane
          manifest={report.elementInspections}
          reportId={reportId}
          source={source}
        />
      ) : (
        <LazyPanePlaceholder pane={pane} />
      );
    case 'reproduction':
      return <LazyReproductionPane reproduction={report.reproduction} reportId={reportId} />;
    case 'storage':
      return <LazyStoragePane cookies={report.cookies} storage={report.storage} />;
    case 'privacy':
      return <LazyPrivacyPane report={report} reportId={reportId} />;
    case 'overview':
      return (
        <div data-testid="pane-overview" className="h-full">
          <LazyOverviewPane report={report} reportId={reportId} />
        </div>
      );
    default:
      return <LazyPanePlaceholder pane={pane} />;
  }
}

/** Render the active pane behind a Suspense boundary so its lazy chunk loads with a skeleton. */
function LoadedPane({
  pane,
  report,
  reportId,
  source,
  elementQuery,
}: {
  readonly pane: DashboardPane;
  readonly report: BugReportV1;
  readonly reportId: string;
  readonly source: ReportSource | undefined;
  readonly elementQuery: string | null;
}) {
  return (
    <Suspense fallback={<AsyncState status="loading" loadingLabel="Loading view…" />}>
      {paneElement(pane, report, reportId, source, elementQuery)}
    </Suspense>
  );
}

export function App({ read = readReportZip, initialSource }: AppProps = {}) {
  // Seed the inline report (report.html) exactly once, before first paint, so it renders with no drop.
  const initialTabRef = useRef<ReportTab | null>(null);
  if (initialSource && !initialTabRef.current) {
    initialTabRef.current = makeReportTab(initialSource.report, 'report.html');
  }
  const [tabs, setTabs] = useState<readonly ReportTab[]>(
    initialTabRef.current ? [initialTabRef.current] : [],
  );
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const route = useHashRoute();
  const addInputRef = useRef<HTMLInputElement>(null);
  // Remember the last batch so the error state's Retry can re-invoke the loader on it.
  const lastFilesRef = useRef<File[]>([]);
  // Lazy ZIP data-access, one ReportSource per open tab (keyed by report id). Kept out of the pure
  // tab state; the App owns their object-URL lifecycle and disposes them on close/unmount (S4-05).
  const sourcesRef = useRef<Map<string, ReportSource>>(new Map());
  // Register the seeded inline source (report.html) once so its panes can read entries immediately.
  if (initialSource && initialTabRef.current && !sourcesRef.current.has(initialTabRef.current.id)) {
    sourcesRef.current.set(initialTabRef.current.id, initialSource);
  }

  // Dispose every open source when the dashboard unmounts so no object URLs leak.
  useEffect(() => {
    const sources = sourcesRef.current;
    return () => {
      for (const source of sources.values()) {
        source.dispose();
      }
      sources.clear();
    };
  }, []);

  // Active report = the tab matching the URL's reportId, falling back to the first open tab.
  const activeReport = findTab(tabs, route.reportId) ?? tabs[0];

  function navigateTo(reportId: string | null): void {
    window.location.hash = formatHash({ activePane: route.activePane, reportId });
  }

  async function handleFiles(files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }
    lastFilesRef.current = files;
    setStatus('loading');
    setError(null);

    const opened: ReportTab[] = [];
    let firstError: string | null = null;
    for (const file of files) {
      const result = await read(file);
      if (result.ok) {
        const tab = makeReportTab(result.source.report, file.name);
        if (sourcesRef.current.has(tab.id)) {
          // Re-dropped duplicate: the existing tab/source wins — dispose the new source, don't leak.
          result.source.dispose();
        } else {
          sourcesRef.current.set(tab.id, result.source);
        }
        opened.push(tab);
      } else if (firstError === null) {
        firstError = result.error;
      }
    }

    if (opened.length > 0) {
      setTabs((prev) => opened.reduce((acc, tab) => addReportTab(acc, tab), prev));
      // Focus the first report from this batch (its existing tab if it was a duplicate).
      navigateTo(opened[0]!.id);
    }
    setStatus(firstError ? 'error' : 'idle');
    setError(firstError);
  }

  function onClose(id: string): void {
    if (activeReport?.id === id) {
      navigateTo(neighborTabId(tabs, id));
    }
    // Revoke the closed report's object URLs before dropping the tab.
    sourcesRef.current.get(id)?.dispose();
    sourcesRef.current.delete(id);
    setTabs((prev) => closeReportTab(prev, id));
  }

  function onReorder(fromId: string, toId: string): void {
    setTabs((prev) => reorderReportTabs(prev, fromId, toId));
  }

  const tabBar =
    tabs.length > 0 ? (
      <ReportTabBar
        tabs={tabs}
        activeId={activeReport?.id ?? null}
        activePane={route.activePane}
        onClose={onClose}
        onReorder={onReorder}
        onAdd={() => addInputRef.current?.click()}
      />
    ) : null;

  // Full-region state: skeleton/error only pre-empt the content when no report is open yet; once a
  // report is active it stays visible (a later failed drop shows a transient banner instead).
  const region: AsyncStatus =
    status === 'loading' && !activeReport
      ? 'loading'
      : status === 'error' && !activeReport
        ? 'error'
        : activeReport
          ? 'ready'
          : 'empty';

  return (
    <AppShell route={route} tabs={tabBar}>
      {/* Hidden picker for the tab-bar "+" button (multi-select). */}
      <input
        ref={addInputRef}
        type="file"
        accept=".zip,application/zip"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleFiles(zipFilesFrom(event.target.files));
          event.target.value = '';
        }}
      />

      <AsyncState
        status={region}
        loadingLabel="Reading report…"
        errorMessage={error}
        onRetry={() => void handleFiles(lastFilesRef.current)}
        empty={
          <>
            <DropZone onFiles={(files) => void handleFiles(files)} />
            <p data-testid="empty" className="mx-auto mt-4 max-w-3xl text-[var(--bc-fg-muted)]">
              No report loaded yet.
            </p>
          </>
        }
      >
        {/* A later failed drop while a report stays open surfaces as a transient banner. */}
        {activeReport && status === 'error' && error ? (
          <p data-testid="error" role="alert" className="mb-3 text-red-600">
            {error}
          </p>
        ) : null}
        {activeReport ? (
          // Once a report is open, the whole content area accepts more dropped ZIPs (drop-to-add).
          <div
            data-testid="app-content-dropzone"
            onDrop={(event) => {
              event.preventDefault();
              void handleFiles(zipFilesFrom(event.dataTransfer.files));
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            className="h-full"
          >
            <LoadedPane
              pane={route.activePane}
              report={activeReport.report}
              reportId={activeReport.id}
              source={sourcesRef.current.get(activeReport.id)}
              elementQuery={route.params?.el ?? null}
            />
          </div>
        ) : null}
      </AsyncState>
    </AppShell>
  );
}
