// Stub for `webextension-polyfill` in the standalone visual-regression harness (S3-17).
//
// PreviewApp pulls the polyfill in transitively (via lib/browser), and the real module throws at import
// outside an extension context. The harness injects every side-effecting dep into PreviewApp, so the
// runtime is never actually used — this no-op stub just lets the bundle import cleanly.
export default {};
