import { describe, expect, it } from 'vitest';

import { annotationFilePath, buildAnnotationFile } from './konva-serialization';

describe('buildAnnotationFile', () => {
  it('wraps the Konva JSON with the schema version and screenshot path', () => {
    const file = buildAnnotationFile('screenshots/viewport.png', '{"attrs":{}}');
    expect(file).toEqual({
      schemaVersion: 'v1',
      screenshotPath: 'screenshots/viewport.png',
      konvaJson: '{"attrs":{}}',
    });
  });
});

describe('annotationFilePath', () => {
  it('maps a viewport screenshot path to annotations/<name>.konva.json', () => {
    expect(annotationFilePath('screenshots/viewport.png')).toBe('annotations/viewport.konva.json');
  });

  it('maps a full-page screenshot path', () => {
    expect(annotationFilePath('screenshots/full-page.png')).toBe(
      'annotations/full-page.konva.json',
    );
  });

  it('handles a path without a directory or extension', () => {
    expect(annotationFilePath('shot')).toBe('annotations/shot.konva.json');
  });
});
