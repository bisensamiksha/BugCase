import type { ReproductionRecording, ReproductionStep } from '@bugcase/schema';

/**
 * Copy-as-Markdown + timeline-offset helpers for the Reproduction pane (S4-10). Pure — no React,
 * no clipboard; the pane owns the clipboard call so this stays trivially unit-testable.
 */

/** Millisecond offset of `timestamp` from `startedAt`; null when unparseable or negative. */
export function stepOffsetMs(startedAt: string, timestamp: string): number | null {
  const start = Date.parse(startedAt);
  const at = Date.parse(timestamp);
  if (Number.isNaN(start) || Number.isNaN(at) || at < start) {
    return null;
  }
  return at - start;
}

/** `m:ss` for a non-negative millisecond duration; `h:mm:ss` from one hour up. */
export function formatOffset(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const two = (n: number): string => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/** Inline code span whose fence outgrows any backtick run inside `text` (CommonMark-safe). */
function inlineCode(text: string): string {
  const runs = text.match(/`+/g);
  const longest = runs === null ? 0 : Math.max(...runs.map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return longest > 0 ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

function stepLine(step: ReproductionStep, index: number, startedAt: string): string {
  const offset = stepOffsetMs(startedAt, step.timestamp);
  const prefix = offset === null ? `${index + 1}.` : `${index + 1}. (+${formatOffset(offset)})`;
  const line = `${prefix} ${step.description}`;
  return step.selector ? `${line} — ${inlineCode(step.selector)}` : line;
}

/** GitHub-issue-ready Markdown: header + summary sentence + numbered step list. */
export function reproMarkdown(recording: ReproductionRecording): string {
  const count = recording.steps.length;
  const date = Number.isNaN(Date.parse(recording.startedAt))
    ? null
    : recording.startedAt.slice(0, 10);
  const duration = stepOffsetMs(recording.startedAt, recording.endedAt);
  const countText = `${count} ${count === 1 ? 'step' : 'steps'}`;
  const overText = duration === null ? '' : ` over ${formatOffset(duration)}`;
  const sentence = date
    ? `Recorded ${date}, ${countText}${overText}.`
    : `Recorded ${countText}${overText}.`;
  const lines = recording.steps.map((step, index) => stepLine(step, index, recording.startedAt));
  return ['## Reproduction steps', '', sentence, '', ...lines, ''].join('\n');
}
