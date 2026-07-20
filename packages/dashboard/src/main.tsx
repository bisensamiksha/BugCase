import { parseInlineReportPayload, WINDOW_REPORT_KEY } from '@bugcase/schema';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { createInlineReportSource } from './lib/inline-report-source';
import './styles/tokens.css';
import './index.css';

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('#root missing');
}

// When opened as a self-contained report.html, `window.__BUG_REPORT__` holds the report payload;
// parse it into an inline ReportSource so the report auto-opens. Absent (hosted dashboard) → drop UI.
const injected = (globalThis as unknown as Record<string, unknown>)[WINDOW_REPORT_KEY];
const payload = parseInlineReportPayload(injected);
const initialSource = payload ? createInlineReportSource(payload) : undefined;

createRoot(rootEl).render(
  <StrictMode>
    {/* Only pass initialSource when present (exactOptionalPropertyTypes forbids `={undefined}`). */}
    <App {...(initialSource ? { initialSource } : {})} />
  </StrictMode>,
);
