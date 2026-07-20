import { describe, expect, it } from 'vitest';

import {
  assertNoExternalRefs,
  buildInlineHtml,
  injectReportData,
  REPORT_DATA_PLACEHOLDER,
} from './build-inline-html';

const TEMPLATE = [
  '<!doctype html><html><head>',
  '<!-- @BUGCASE_STYLE@ -->',
  '</head><body><div id="root"></div>',
  `<script>window.__BUG_REPORT__ = ${REPORT_DATA_PLACEHOLDER};</script>`,
  '<!-- @BUGCASE_SCRIPT@ -->',
  '</body></html>',
].join('\n');

describe('buildInlineHtml', () => {
  it('inlines css and js and consumes every marker', () => {
    const html = buildInlineHtml({
      templateHtml: TEMPLATE,
      js: 'console.log(1)',
      css: 'body{color:red}',
    });
    expect(html).toContain('<style>body{color:red}</style>');
    expect(html).toContain('<script type="module">console.log(1)</script>');
    // The two comment markers are consumed; the data sentinel intentionally remains (S4-15 seam).
    expect(html).not.toContain('@BUGCASE_STYLE@');
    expect(html).not.toContain('@BUGCASE_SCRIPT@');
  });

  it('keeps exactly one report-data placeholder and the window global', () => {
    const html = buildInlineHtml({ templateHtml: TEMPLATE, js: 'x', css: 'y' });
    expect(html.split(REPORT_DATA_PLACEHOLDER)).toHaveLength(2);
    expect(html).toContain('window.__BUG_REPORT__');
  });

  it('escapes </script> inside the js bundle', () => {
    const html = buildInlineHtml({ templateHtml: TEMPLATE, js: 'a="</script>"', css: 'y' });
    expect(html).toContain('a="<\\/script>"');
    expect(html).not.toContain('a="</script>"');
  });

  it('inserts js/css verbatim even when they contain $ replacement patterns', () => {
    // Minified bundles (e.g. React) contain `"$&"` etc.; a naive string replacement would splice
    // the marker text back into the code. These must be inserted literally.
    const js = `x.replace(re,"$&/").replace(a,"$'").replace(b,"$1")`;
    const css = `.a::before{content:"$&"}`;
    const html = buildInlineHtml({ templateHtml: TEMPLATE, js, css });
    expect(html).toContain(js);
    expect(html).toContain(css);
    expect(html).not.toContain('@BUGCASE_SCRIPT@');
    expect(html).not.toContain('@BUGCASE_STYLE@');
  });

  it.each([
    ['missing style marker', TEMPLATE.replace('<!-- @BUGCASE_STYLE@ -->', '')],
    ['missing script marker', TEMPLATE.replace('<!-- @BUGCASE_SCRIPT@ -->', '')],
    ['missing data placeholder', TEMPLATE.replace(REPORT_DATA_PLACEHOLDER, 'null')],
  ])('throws on %s', (_label, templateHtml) => {
    expect(() => buildInlineHtml({ templateHtml, js: 'x', css: 'y' })).toThrow();
  });

  it.each([
    ['empty js', '', 'y'],
    ['empty css', 'x', ''],
  ])('throws on %s', (_label, js, css) => {
    expect(() => buildInlineHtml({ templateHtml: TEMPLATE, js, css })).toThrow();
  });
});

describe('injectReportData', () => {
  it('replaces the placeholder with the json payload', () => {
    const empty = buildInlineHtml({ templateHtml: TEMPLATE, js: 'x', css: 'y' });
    const filled = injectReportData(empty, '{"schemaVersion":1}');
    expect(filled).toContain('window.__BUG_REPORT__ = {"schemaVersion":1};');
    expect(filled).not.toContain(REPORT_DATA_PLACEHOLDER);
  });

  it('throws when the placeholder is absent', () => {
    expect(() => injectReportData('<html></html>', '{}')).toThrow();
  });

  it('injects a json payload containing $ patterns verbatim', () => {
    const empty = buildInlineHtml({ templateHtml: TEMPLATE, js: 'x', css: 'y' });
    const json = `{"note":"$&$1$'$\`"}`;
    const filled = injectReportData(empty, json);
    expect(filled).toContain(`window.__BUG_REPORT__ = ${json};`);
  });
});

describe('assertNoExternalRefs', () => {
  it('passes when external-looking strings live only inside inline script bodies', () => {
    const html = buildInlineHtml({
      templateHtml: TEMPLATE,
      js: `const s = 'src="https://cdn.example/x.js"';`,
      css: 'y',
    });
    expect(() => assertNoExternalRefs(html)).not.toThrow();
  });

  it.each([
    [
      'external script src',
      '<html><body><script src="https://cdn.example/a.js"></script></body></html>',
    ],
    [
      'protocol-relative script',
      '<html><body><script src="//cdn.example/a.js"></script></body></html>',
    ],
    [
      'external stylesheet link',
      '<html><head><link rel="stylesheet" href="https://cdn.example/a.css"></head></html>',
    ],
    ['modulepreload link', '<html><head><link rel="modulepreload" href="app.js"></head></html>'],
  ])('throws on %s', (_label, html) => {
    expect(() => assertNoExternalRefs(html)).toThrow();
  });
});
