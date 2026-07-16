import type { NetworkEntry } from '@bugcase/schema';

/**
 * POSIX single-quote escaping: wrap in `'…'` and rewrite each embedded `'` as `'\''` (close, an
 * escaped quote, reopen). Makes arbitrary URLs, header values, and bodies paste-safe in a shell.
 */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Build a copy-pasteable `curl` command reproducing a captured request: method, url, request headers,
 * and a text request body. Bodies without captured text (binary-only) are omitted — the bytes aren't
 * in the report as text and we never fabricate them. The string is assembled locally; nothing is sent.
 */
export function toCurl(entry: NetworkEntry): string {
  const parts = ['curl', shellQuote(entry.url)];

  if (entry.method && entry.method.toUpperCase() !== 'GET') {
    parts.push('-X', entry.method);
  }

  for (const header of entry.requestHeaders) {
    parts.push('-H', shellQuote(`${header.name}: ${header.value}`));
  }

  if (entry.request?.text !== undefined) {
    parts.push('--data-raw', shellQuote(entry.request.text));
  }

  return parts.join(' ');
}
