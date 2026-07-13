export { App, type AppProps } from './App';
export { AppShell, type AppShellProps } from './layout/AppShell';
export { DropZone, zipFilesFrom, type DropZoneProps } from './components/DropZone';
export { JsonTree, type JsonTreeProps } from './components/JsonTree';
export { ReportTabBar, type ReportTabBarProps } from './components/ReportTabBar';
export { PanePlaceholder, type PanePlaceholderProps } from './panes/PanePlaceholder';
export { OverviewPane, type OverviewPaneProps } from './panes/OverviewPane';
export {
  consoleCounts,
  networkCounts,
  screenshotSummary,
  type ConsoleCounts,
  type NetworkCounts,
  type ScreenshotKind,
  type ScreenshotSummary,
  type ScreenshotSummaryItem,
} from './panes/overview-metrics';
export { renderMarkdownToSafeHtml } from './lib/markdown';
export { readReportZip, type ReadReportResult } from './lib/read-report-zip';
export {
  addReportTab,
  closeReportTab,
  findTab,
  makeReportTab,
  neighborTabId,
  reorderReportTabs,
  type ReportTab,
} from './state/report-tabs';
export {
  DASHBOARD_PANES,
  PANE_LABELS,
  formatHash,
  parseHash,
  type DashboardPane,
  type RouteState,
} from './router/hash-router';
export { useHashRoute } from './router/use-hash-route';
