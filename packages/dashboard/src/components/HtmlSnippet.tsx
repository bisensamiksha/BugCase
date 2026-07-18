import { useEffect, useState } from 'react';

import { highlightHtml, type HighlightResult } from '../lib/shiki';

export interface HtmlSnippetProps {
  /** Raw captured HTML to display (never rendered live). */
  readonly html: string;
  /** data-testid prefix; renders `<testId>-plain` / `<testId>-highlighted`. */
  readonly testId?: string;
}

/**
 * Displays captured HTML as read-only source (S4-11, extracted from the DomPane pattern): plain
 * `<pre>` text immediately, upgraded to Shiki-highlighted markup when the lazy highlighter
 * resolves. Over-cap input stays plain.
 */
export function HtmlSnippet({ html, testId = 'html-snippet' }: HtmlSnippetProps) {
  const [highlight, setHighlight] = useState<HighlightResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHighlight(null);
    void highlightHtml(html).then((result) => {
      if (!cancelled) {
        setHighlight(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [html]);

  return highlight?.kind === 'highlighted' ? (
    <div
      data-testid={`${testId}-highlighted`}
      className="text-xs [&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-[var(--bc-border)] [&_pre]:p-3"
      // Shiki output only: every character of the input is escaped into token spans, so no
      // captured markup goes live here.
      dangerouslySetInnerHTML={{ __html: highlight.html }}
    />
  ) : (
    <pre
      data-testid={`${testId}-plain`}
      className="overflow-x-auto whitespace-pre-wrap break-all rounded border border-[var(--bc-border)] p-3 font-mono text-xs text-[var(--bc-fg)]"
    >
      {html}
    </pre>
  );
}
