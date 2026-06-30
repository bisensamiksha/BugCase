/**
 * Encode a Blob as a base64 `data:` URL using only web-platform APIs. Safe in an MV3 service
 * worker, which has no `FileReader` (and Chrome's has no `URL.createObjectURL`). The blob's own
 * MIME type is used; type-less blobs fall back to `application/octet-stream`.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}
