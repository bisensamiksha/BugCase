// The self-contained report.html shell built by @bugcase/report-template (S4-14); Vite inlines the
// file's text at build time (the build scripts build report-template first). embedReportData injects
// the captured report into its window.__BUG_REPORT__ placeholder at finalize time (S4-15).
import reportTemplateHtml from '@bugcase/report-template/dist/report.html?raw';

export { reportTemplateHtml };
