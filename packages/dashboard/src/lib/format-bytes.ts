/**
 * Human-readable byte size. Extracted verbatim from `DomPane` (S4-09) so the Storage pane (S4-12)
 * reuses the single formatter instead of forking it. Behavior unchanged: bytes under 1 KiB, then
 * KB/MB to one decimal (KiB/MiB steps).
 */
export function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}
