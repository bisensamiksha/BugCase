import type { BugReportV1 } from '@bugcase/schema';
import { useRef, useState } from 'react';

import { DropZone, zipFilesFrom } from './components/DropZone';
import { JsonTree } from './components/JsonTree';
import { ReportTabBar } from './components/ReportTabBar';
import { AppShell } from './layout/AppShell';
import { readReportZip, type ReadReportResult } from './lib/read-report-zip';
import { ConsoleTable } from './panes/ConsoleTable';
import { NetworkTable } from './panes/NetworkTable';
import { PanePlaceholder } from './panes/PanePlaceholder';
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
}

/** Render the active pane for a loaded report. Panes without a viewer yet show a placeholder. */
function LoadedPane({
  pane,
  report,
}: {
  readonly pane: DashboardPane;
  readonly report: BugReportV1;
}) {
  switch (pane) {
    case 'console':
      return <ConsoleTable log={report.console} />;
    case 'network':
      return <NetworkTable log={report.network} />;
    case 'overview':
      // Interim: the raw report tree until the real Overview pane lands (S4-03).
      return (
        <div data-testid="pane-overview" className="overflow-auto">
          <JsonTree name="report" data={report} />
        </div>
      );
    default:
      return <PanePlaceholder pane={pane} />;
  }
}

export function App({ read = readReportZip }: AppProps = {}) {
  const [tabs, setTabs] = useState<readonly ReportTab[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const route = useHashRoute();
  const addInputRef = useRef<HTMLInputElement>(null);

  // Active report = the tab matching the URL's reportId, falling back to the first open tab.
  const activeReport = findTab(tabs, route.reportId) ?? tabs[0];

  function navigateTo(reportId: string | null): void {
    window.location.hash = formatHash({ activePane: route.activePane, reportId });
  }

  async function handleFiles(files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }
    setStatus('loading');
    setError(null);

    const opened: ReportTab[] = [];
    let firstError: string | null = null;
    for (const file of files) {
      const result = await read(file);
      if (result.ok) {
        opened.push(makeReportTab(result.report, file.name));
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

      {status === 'error' && (
        <p data-testid="error" role="alert" className="mb-3 text-red-600">
          {error}
        </p>
      )}
      {status === 'loading' && (
        <p data-testid="status" className="mb-3 text-[var(--bc-fg-muted)]">
          Reading report…
        </p>
      )}

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
          <LoadedPane pane={route.activePane} report={activeReport.report} />
        </div>
      ) : (
        <>
          <DropZone onFiles={(files) => void handleFiles(files)} />
          <p data-testid="empty" className="mx-auto mt-4 max-w-3xl text-[var(--bc-fg-muted)]">
            No report loaded yet.
          </p>
        </>
      )}
    </AppShell>
  );
}
