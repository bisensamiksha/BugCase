import type { BugReportV1 } from '@bugcase/schema';
import { useState, type ChangeEvent, type DragEvent } from 'react';

import { JsonTree } from './components/JsonTree';
import { AppShell } from './layout/AppShell';
import { readReportZip, type ReadReportResult } from './lib/read-report-zip';
import { ConsoleTable } from './panes/ConsoleTable';
import { NetworkTable } from './panes/NetworkTable';
import { PanePlaceholder } from './panes/PanePlaceholder';
import type { DashboardPane } from './router/hash-router';
import { useHashRoute } from './router/use-hash-route';

type State =
  | { readonly status: 'empty' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'loaded'; readonly report: BugReportV1 };

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

/** Report intake shown until a report loads: the dropzone plus status/empty/error messaging. */
function Intake({
  state,
  onSelect,
}: {
  readonly state: State;
  readonly onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[var(--bc-radius)] border-2 border-dashed border-[var(--bc-border)] p-8 text-center">
        <p className="text-[var(--bc-fg-muted)]">Drag a BugCase report .zip here, or</p>
        <label className="mt-2 inline-block cursor-pointer font-medium text-[var(--bc-accent)]">
          choose a file
          <input type="file" accept=".zip,application/zip" className="hidden" onChange={onSelect} />
        </label>
      </div>

      {state.status === 'loading' && (
        <p data-testid="status" className="mt-4 text-[var(--bc-fg-muted)]">
          Reading report…
        </p>
      )}
      {state.status === 'empty' && (
        <p data-testid="empty" className="mt-4 text-[var(--bc-fg-muted)]">
          No report loaded yet.
        </p>
      )}
      {state.status === 'error' && (
        <p data-testid="error" role="alert" className="mt-4 text-red-600">
          {state.message}
        </p>
      )}
    </div>
  );
}

export function App({ read = readReportZip }: AppProps = {}) {
  const [state, setState] = useState<State>({ status: 'empty' });
  const route = useHashRoute();

  async function handleFile(file: File): Promise<void> {
    setState({ status: 'loading' });
    const result = await read(file);
    setState(
      result.ok
        ? { status: 'loaded', report: result.report }
        : { status: 'error', message: result.error },
    );
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      void handleFile(file);
    }
  }

  function onSelect(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
  }

  return (
    <AppShell route={route}>
      {/* The whole content area accepts a dropped ZIP (drop-to-replace) even once a report loads. */}
      <div
        data-testid="dropzone"
        onDrop={onDrop}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        className="h-full"
      >
        {state.status === 'loaded' ? (
          <LoadedPane pane={route.activePane} report={state.report} />
        ) : (
          <Intake state={state} onSelect={onSelect} />
        )}
      </div>
    </AppShell>
  );
}
