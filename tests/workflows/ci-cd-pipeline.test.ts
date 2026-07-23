import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Contract tests over the three GitHub Actions workflows (S4-19). `yaml` (1.2) keeps `on` as a string
// key (unlike YAML-1.1 parsers that coerce it to `true`), so `workflow.on` is safe to read.

interface On {
  pull_request?: unknown;
  workflow_call?: unknown;
  workflow_dispatch?: unknown;
  push?: { branches?: string[]; tags?: string[] };
}

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Job {
  'timeout-minutes'?: number;
  needs?: string | string[];
  uses?: string;
  strategy?: { matrix?: { browser?: string[] } };
  steps?: Step[];
}

interface Workflow {
  name?: string;
  on?: On;
  permissions?: Record<string, string>;
  concurrency?: unknown;
  jobs?: Record<string, Job>;
}

const workflowsDir = fileURLToPath(new URL('../../.github/workflows/', import.meta.url));

function load(name: string): Workflow {
  return parse(readFileSync(join(workflowsDir, name), 'utf8')) as Workflow;
}

const ci = load('ci.yml');
const pages = load('gh-pages.yml');
const release = load('release.yml');

function jobs(wf: Workflow): Job[] {
  return Object.values(wf.jobs ?? {});
}

describe('CI/CD workflow contract', () => {
  it('every workflow parses and has a name + triggers', () => {
    for (const wf of [ci, pages, release]) {
      expect(typeof wf.name).toBe('string');
      expect(wf.on).toBeTruthy();
    }
  });

  describe('ci.yml', () => {
    it('runs on PRs, main pushes, and is reusable via workflow_call', () => {
      expect(ci.on).toHaveProperty('pull_request');
      expect(ci.on?.push?.branches).toContain('main');
      expect(ci.on).toHaveProperty('workflow_call');
    });

    it('is least-privilege, concurrent-bounded, and time-bounded', () => {
      expect(ci.permissions?.contents).toBe('read');
      expect(ci.concurrency).toBeTruthy();
      for (const job of jobs(ci)) {
        expect(typeof job['timeout-minutes']).toBe('number');
      }
    });

    it('validates lint, typecheck (+workflows), unit (+workflows), build, and the e2e matrix', () => {
      expect(Object.keys(ci.jobs ?? {})).toEqual(
        expect.arrayContaining(['lint', 'typecheck', 'unit', 'build', 'e2e']),
      );
      expect(ci.jobs?.e2e?.strategy?.matrix?.browser).toEqual(
        expect.arrayContaining(['chromium', 'firefox']),
      );
      const asText = JSON.stringify(ci.jobs);
      expect(asText).toContain('typecheck:workflows');
      expect(asText).toContain('test:workflows');
    });
  });

  describe('gh-pages.yml', () => {
    it('deploys on main push or manual dispatch — never on PRs', () => {
      expect(pages.on?.push?.branches).toContain('main');
      expect(pages.on).toHaveProperty('workflow_dispatch');
      expect(pages.on).not.toHaveProperty('pull_request');
    });

    it('uses least-privilege Pages permissions and deploys only after build', () => {
      expect(pages.permissions?.pages).toBe('write');
      expect(pages.permissions?.['id-token']).toBe('write');
      expect(pages.jobs?.deploy?.needs).toContain('build');
    });

    it('bounds every job with a timeout', () => {
      for (const job of jobs(pages)) {
        expect(typeof job['timeout-minutes']).toBe('number');
      }
    });

    it('builds the privacy-site and publishes it under /legal/', () => {
      const asText = JSON.stringify(pages.jobs);
      expect(asText).toContain('@bugcase/privacy-site');
      expect(asText).toContain('legal');
    });
  });

  describe('release.yml', () => {
    it('triggers on version tags', () => {
      expect(release.on?.push?.tags).toContain('v*');
    });

    it('can write releases, is concurrent-bounded, and reuses ci.yml for validation', () => {
      expect(release.permissions?.contents).toBe('write');
      expect(release.concurrency).toBeTruthy();
      expect(jobs(release).some((job) => job.uses === './.github/workflows/ci.yml')).toBe(true);
    });

    it('bounds every step-based job with a timeout', () => {
      for (const job of jobs(release)) {
        if (job.uses) continue; // reusable-workflow jobs don't take timeout-minutes
        expect(typeof job['timeout-minutes']).toBe('number');
      }
    });

    it('asserts reproducible dist hashes before publishing', () => {
      expect(JSON.stringify(release.jobs)).toContain('hash-dist');
    });
  });

  it('every upload-artifact step bounds retention to <= 7 days', () => {
    for (const wf of [ci, pages, release]) {
      for (const job of jobs(wf)) {
        for (const step of job.steps ?? []) {
          if (typeof step.uses === 'string' && step.uses.startsWith('actions/upload-artifact')) {
            const days = step.with?.['retention-days'];
            expect(typeof days).toBe('number');
            expect(days as number).toBeLessThanOrEqual(7);
          }
        }
      }
    }
  });
});
