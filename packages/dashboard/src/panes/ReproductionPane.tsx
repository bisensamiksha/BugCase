import type { ReproStepType, ReproductionRecording } from '@bugcase/schema';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AsyncState } from '../components/AsyncState';
import { formatOffset, reproMarkdown, stepOffsetMs } from '../lib/repro-markdown';
import { formatHash } from '../router/hash-router';

import {
  INITIAL_PLAYBACK,
  advanceDelayMs,
  advancePlayback,
  pausePlayback,
  selectStep,
  startPlayback,
  stepBackward,
  stepForward,
  type PlaybackState,
} from './repro-highlight';

export interface ReproductionPaneProps {
  /** Parsed `report.reproduction`; null when nothing was recorded. */
  readonly reproduction: ReproductionRecording | null;
  /** Active report id — builds the DOM-pane deep-links. */
  readonly reportId: string;
}

const BTN =
  'rounded border border-[var(--bc-border)] px-2 py-0.5 text-sm text-[var(--bc-fg)] disabled:opacity-50';

const TYPE_TINT: Record<ReproStepType, string> = {
  click: 'text-blue-700 dark:text-blue-300',
  input: 'text-emerald-700 dark:text-emerald-300',
  change: 'text-emerald-700 dark:text-emerald-300',
  scroll: 'text-slate-600 dark:text-slate-300',
  'keydown-modifier': 'text-purple-700 dark:text-purple-300',
  navigation: 'text-amber-700 dark:text-amber-300',
};

/**
 * Reproduction pane (S4-10): numbered timeline of the S3-12 recorder's steps, a play mode that
 * walks the active-step highlight at the recording's own clamped rhythm, and a copy-as-Markdown
 * export. All ZIP-derived text renders as text nodes — never HTML.
 */
export function ReproductionPane({ reproduction, reportId }: ReproductionPaneProps) {
  const steps = useMemo(() => reproduction?.steps ?? [], [reproduction]);
  const [playback, setPlayback] = useState<PlaybackState>(INITIAL_PLAYBACK);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const { activeIndex, playing } = playback;

  // Play mode: one timeout per active step. The model is pure; only this effect touches time.
  useEffect(() => {
    if (!playing || activeIndex === null) {
      return;
    }
    const timer = setTimeout(
      () => {
        setPlayback((prev) => advancePlayback(prev, steps.length));
      },
      advanceDelayMs(steps, activeIndex),
    );
    return () => clearTimeout(timer);
  }, [playing, activeIndex, steps]);

  // Keep the highlighted row visible while playing/stepping (jsdom has no scrollIntoView).
  useEffect(() => {
    if (activeIndex === null) {
      return;
    }
    const row = listRef.current?.querySelector(`[data-step-index="${activeIndex}"]`);
    if (row && typeof (row as HTMLElement).scrollIntoView === 'function') {
      (row as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  if (!reproduction || steps.length === 0) {
    return (
      <section
        data-testid="reproduction-pane"
        aria-label="Reproduction"
        className="flex h-full flex-col p-4"
      >
        <AsyncState
          status="empty"
          empty={
            <p data-testid="repro-empty" className="text-[var(--bc-fg-muted)]">
              No reproduction steps captured.
            </p>
          }
        />
      </section>
    );
  }

  const startDateOk = !Number.isNaN(Date.parse(reproduction.startedAt));
  const durationMs = stepOffsetMs(reproduction.startedAt, reproduction.endedAt);
  const summary = [
    startDateOk ? `Recorded ${reproduction.startedAt.slice(0, 10)}` : null,
    `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`,
    durationMs === null ? null : `over ${formatOffset(durationMs)}`,
  ]
    .filter((part) => part !== null)
    .join(' · ');

  async function copyMarkdown(): Promise<void> {
    if (!reproduction) {
      return;
    }
    if (!navigator.clipboard) {
      setCopyError('Clipboard unavailable in this browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(reproMarkdown(reproduction));
      setCopied(true);
      setCopyError(null);
    } catch {
      setCopyError('Copying to the clipboard failed.');
    }
  }

  return (
    <section
      data-testid="reproduction-pane"
      aria-label="Reproduction"
      className="flex h-full flex-col p-4"
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p data-testid="repro-summary" className="text-sm text-[var(--bc-fg-muted)]">
          {summary}
        </p>
        <button
          type="button"
          data-testid="repro-copy"
          onClick={() => void copyMarkdown()}
          className={BTN}
        >
          {copied ? 'Copied' : 'Copy as Markdown'}
        </button>
        <span role="status" className="sr-only">
          {copied ? 'Reproduction steps copied to the clipboard as Markdown' : ''}
        </span>
        <div role="group" aria-label="Playback" className="flex items-center gap-1">
          <button
            type="button"
            data-testid="repro-prev"
            aria-label="Previous step"
            onClick={() => setPlayback((prev) => stepBackward(prev, steps.length))}
            className={BTN}
          >
            Prev
          </button>
          <button
            type="button"
            data-testid="repro-play"
            aria-pressed={playing}
            onClick={() =>
              setPlayback((prev) =>
                prev.playing ? pausePlayback(prev) : startPlayback(prev, steps.length),
              )
            }
            className={BTN}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            data-testid="repro-next"
            aria-label="Next step"
            onClick={() => setPlayback((prev) => stepForward(prev, steps.length))}
            className={BTN}
          >
            Next
          </button>
        </div>
      </div>

      {copyError ? (
        <p data-testid="repro-copy-error" role="alert" className="mb-2 text-sm text-red-600">
          {copyError}
        </p>
      ) : null}

      <ol
        ref={listRef}
        data-testid="repro-timeline"
        aria-label="Reproduction timeline"
        className="min-h-0 flex-1 list-none overflow-auto rounded border border-[var(--bc-border)]"
      >
        {steps.map((step, index) => {
          const active = index === activeIndex;
          const offset = stepOffsetMs(reproduction.startedAt, step.timestamp);
          const metadataEntries = Object.entries(step.metadata);
          return (
            <li key={step.id} className="border-b border-[var(--bc-border)] last:border-b-0">
              <button
                type="button"
                data-testid={`repro-step-${index}`}
                data-step-index={index}
                aria-current={active ? 'step' : undefined}
                onClick={() => setPlayback((prev) => selectStep(prev, index, steps.length))}
                className={`flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm ${
                  active ? 'border-l-2 border-[var(--bc-accent)] bg-[var(--bc-surface)]' : ''
                }`}
              >
                <span className="w-8 shrink-0 text-right font-mono text-[var(--bc-fg-muted)]">
                  {index + 1}.
                </span>
                <span className="w-14 shrink-0 font-mono text-xs text-[var(--bc-fg-muted)]">
                  {offset === null ? '' : `+${formatOffset(offset)}`}
                </span>
                <span
                  className={`shrink-0 rounded border border-[var(--bc-border)] px-1 text-xs ${TYPE_TINT[step.type]}`}
                >
                  {step.type}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--bc-fg)]">
                  {step.description}
                </span>
              </button>
              {active ? (
                <div
                  data-testid="repro-step-detail"
                  className="space-y-2 border-l-2 border-[var(--bc-accent)] bg-[var(--bc-surface)] px-12 py-2 text-sm"
                >
                  {step.selector ? (
                    <p>
                      <span className="text-xs font-semibold text-[var(--bc-fg-muted)]">
                        Selector{' '}
                      </span>
                      <code data-testid="repro-detail-selector" className="font-mono text-xs">
                        {step.selector}
                      </code>
                    </p>
                  ) : null}
                  {metadataEntries.length > 0 ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                      {metadataEntries.map(([key, value]) => (
                        <div key={key} className="contents">
                          <dt className="text-xs font-semibold text-[var(--bc-fg-muted)]">{key}</dt>
                          <dd className="font-mono text-xs text-[var(--bc-fg)]">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {step.selector ? (
                    <p>
                      <a
                        data-testid="repro-dom-link"
                        href={formatHash({
                          activePane: 'dom',
                          reportId,
                          params: { el: step.selector },
                        })}
                        className="text-[var(--bc-accent)] underline"
                      >
                        Locate in DOM snapshot
                      </a>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
