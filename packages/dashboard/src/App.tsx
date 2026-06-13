import type { BugReportV1 } from '@bugcase/schema';
import { useState, type ChangeEvent, type DragEvent } from 'react';

import { JsonTree } from './components/JsonTree';
import { readReportZip, type ReadReportResult } from './lib/read-report-zip';

type State =
  | { readonly status: 'empty' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'loaded'; readonly report: BugReportV1 };

export interface AppProps {
  /** Defaults to the real client-side ZIP reader; injectable for tests. */
  readonly read?: (input: Blob) => Promise<ReadReportResult>;
}

export function App({ read = readReportZip }: AppProps = {}) {
  const [state, setState] = useState<State>({ status: 'empty' });

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
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-bold text-slate-800">BugCase Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Everything runs in your browser — nothing is uploaded.
      </p>

      <div
        data-testid="dropzone"
        onDrop={onDrop}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        className="mt-4 rounded-lg border-2 border-dashed border-slate-300 p-8 text-center"
      >
        <p className="text-slate-600">Drag a BugCase report .zip here, or</p>
        <label className="mt-2 inline-block cursor-pointer font-medium text-blue-600">
          choose a file
          <input type="file" accept=".zip,application/zip" className="hidden" onChange={onSelect} />
        </label>
      </div>

      {state.status === 'loading' && (
        <p data-testid="status" className="mt-4 text-slate-500">
          Reading report…
        </p>
      )}
      {state.status === 'empty' && (
        <p data-testid="empty" className="mt-4 text-slate-400">
          No report loaded yet.
        </p>
      )}
      {state.status === 'error' && (
        <p data-testid="error" role="alert" className="mt-4 text-red-600">
          {state.message}
        </p>
      )}
      {state.status === 'loaded' && (
        <section
          data-testid="report"
          className="mt-4 overflow-auto rounded border border-slate-200 p-3"
        >
          <JsonTree name="report" data={state.report} />
        </section>
      )}
    </main>
  );
}
