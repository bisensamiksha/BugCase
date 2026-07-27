/**
 * Buffers the sub-64MiB slices of a large annotated screenshot's data URL between the
 * FINALIZE_ANNOTATION_CHUNK messages and FINALIZE_REPORT, keyed by `reportId` (BUG-03). Chrome caps
 * `runtime.sendMessage` at 64 MiB, so a large flattened screenshot is streamed in slices and
 * reassembled here before it is folded into the ZIP.
 */
export class AnnotationChunkBuffer {
  private readonly buffers = new Map<string, string[]>();

  /** Store one slice; a mismatched `total` (a fresh stream for the same report) resets the buffer. */
  add(reportId: string, seq: number, total: number, chunk: string): void {
    let slices = this.buffers.get(reportId);
    if (!slices || slices.length !== total) {
      slices = new Array<string>(total).fill('');
      this.buffers.set(reportId, slices);
    }
    if (seq >= 0 && seq < total) {
      slices[seq] = chunk;
    }
  }

  /** Reassemble and clear the buffered slices for a report; `''` when none were buffered. */
  take(reportId: string): string {
    const slices = this.buffers.get(reportId);
    this.buffers.delete(reportId);
    return slices ? slices.join('') : '';
  }

  /** Discard any buffered slices for a report (e.g. when its hold expired). */
  clear(reportId: string): void {
    this.buffers.delete(reportId);
  }
}
