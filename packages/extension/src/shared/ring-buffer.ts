/**
 * A fixed-size FIFO buffer. Once it holds `maxSize` items, each new push evicts the oldest, so it
 * retains only the most recent `maxSize` entries with bounded memory. Used by the passive capture
 * ring buffers (console S2-06, network S2-07) to cap how much they keep in the page.
 */
export class RingBuffer<T> {
  readonly #items: T[] = [];
  readonly #maxSize: number;

  constructor(maxSize: number) {
    // Guard against negative/fractional sizes so the eviction loop always terminates sanely.
    this.#maxSize = Math.max(0, Math.floor(maxSize));
  }

  /** Append an item, evicting the oldest entries while over capacity. */
  push(item: T): void {
    this.#items.push(item);
    while (this.#items.length > this.#maxSize) {
      this.#items.shift();
    }
  }

  /** A defensive copy of the current items, oldest → newest. */
  snapshot(): readonly T[] {
    return [...this.#items];
  }

  get size(): number {
    return this.#items.length;
  }

  clear(): void {
    this.#items.length = 0;
  }
}
