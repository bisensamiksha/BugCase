export { App, type AppProps } from './App';
export { AppShell, type AppShellProps } from './layout/AppShell';
export { DropZone, zipFilesFrom, type DropZoneProps } from './components/DropZone';
export { JsonTree, type JsonTreeProps } from './components/JsonTree';
export { ReportTabBar, type ReportTabBarProps } from './components/ReportTabBar';
export { PanePlaceholder, type PanePlaceholderProps } from './panes/PanePlaceholder';
export { AsyncState, type AsyncStateProps, type AsyncStatus } from './components/AsyncState';
export { ErrorBoundary, type ErrorBoundaryProps } from './components/ErrorBoundary';
export { OverviewPane, type OverviewPaneProps } from './panes/OverviewPane';
export {
  ScreenshotsPane,
  screenshotEntries,
  type ScreenshotsPaneProps,
} from './panes/ScreenshotsPane';
export {
  summarizeKonva,
  annotationSummaryFor,
  formatAnnotationSummary,
  type KonvaShapeSummary,
} from './panes/annotation-metadata';
export { ConsolePane, type ConsolePaneProps } from './panes/ConsolePane';
export {
  CONSOLE_LEVELS,
  consoleTimeRange,
  entryText,
  levelCounts,
  filterConsole,
  type ConsoleFilter,
} from './panes/console-filters';
export { NetworkPane, type NetworkPaneProps } from './panes/NetworkPane';
export {
  NETWORK_INITIATORS,
  FAILED_CLASS,
  statusClass,
  networkTimeRange,
  entryText as networkEntryText,
  presentStatusClasses,
  distinctMethods,
  presentInitiators,
  statusClassCounts,
  methodCounts,
  initiatorCounts,
  filterNetwork,
  type NetworkFilter,
} from './panes/network-filters';
export {
  Waterfall,
  barGeometry,
  statusClassColor,
  STATUS_CLASS_COLOR,
  type WaterfallProps,
  type BarGeometry,
} from './panes/Waterfall';
export { toCurl } from './lib/curl';
export { DomPane, type DomPaneProps } from './panes/DomPane';
export { SandboxFrame, type SandboxFrameProps } from './components/SandboxFrame';
export {
  ACTIVE_MATCH_ATTR,
  parseHtmlDocument,
  searchElements,
  elementBreadcrumb,
  elementSnippet,
  markedSnapshotHtml,
  type ElementSearchResult,
} from './panes/dom-search';
export { highlightHtml, HIGHLIGHT_MAX_CHARS, type HighlightResult } from './lib/shiki';
export { computeWindow, useVirtualWindow, type VirtualWindow } from './lib/virtual-window';
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
export { createReportSource, type ReportSource } from './lib/report-source';
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
