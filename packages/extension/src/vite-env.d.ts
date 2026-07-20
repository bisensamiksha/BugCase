// Vite's `?raw` import returns the file contents as a string (used to bundle the report.html template).
declare module '*?raw' {
  const content: string;
  export default content;
}
