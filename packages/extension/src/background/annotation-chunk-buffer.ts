/**
 * Buffers the sub-64MiB slices of a large annotated screenshot's data URL between the
 * FINALIZE_ANNOTATION_CHUNK messages and FINALIZE_REPORT, keyed by `reportId` (BUG-03). Chrome caps
 * `runtime.sendMessage` at 64 MiB, so a large flattened screenshot is streamed in slices and
 * reassembled here before it is folded into the ZIP.
 *
 * Element crops are annotatable too (BUG-05), so a single report can stream several large images.
 * Slices are therefore keyed by report **and** target screenshot path — keying by report alone let a
 * second image overwrite the first's buffer.
 */
export class AnnotationChunkBuffer {
  private readonly buffers = new Map<string, string[]>();

  /** `\u0000` cannot appear in a ZIP path, so it is a safe composite-key separator. */
  private static key(reportId: string, screenshotPath?: string): string {
    return `${reportId}\u0000${screenshotPath ?? ''}`;
  }

  /** Store one slice; a mismatched `total` (a fresh stream for the same target) resets the buffer. */
  add(reportId: string, seq: number, total: number, chunk: string, screenshotPath?: string): void {
    const key = AnnotationChunkBuffer.key(reportId, screenshotPath);
    let slices = this.buffers.get(key);
    if (!slices || slices.length !== total) {
      slices = new Array<string>(total).fill('');
      this.buffers.set(key, slices);
    }
    if (seq >= 0 && seq < total) {
      slices[seq] = chunk;
    }
  }

  /** Reassemble and clear the buffered slices for one target; `''` when none were buffered. */
  take(reportId: string, screenshotPath?: string): string {
    const key = AnnotationChunkBuffer.key(reportId, screenshotPath);
    const slices = this.buffers.get(key);
    this.buffers.delete(key);
    return slices ? slices.join('') : '';
  }

  /** Discard every buffered slice for a report, across all of its targets (e.g. an expired hold). */
  clear(reportId: string): void {
    const prefix = `${reportId}\u0000`;
    for (const key of [...this.buffers.keys()]) {
      if (key.startsWith(prefix)) {
        this.buffers.delete(key);
      }
    }
  }
}
