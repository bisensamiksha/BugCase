import { z } from 'zod';

import { IsoTimestampSchema, PermissionSchema, ScrubberRuleAppliedSchema } from './common.schema';

export const PageMetadataSchema = z
  .object({
    url: z.string().url().or(z.literal('about:blank')),
    title: z.string(),
    origin: z.string(),
    capturedAt: IsoTimestampSchema,
    referrer: z.string().nullable(),
  })
  .strict();

export const ViewportMetadataSchema = z
  .object({
    innerWidth: z.number().int().nonnegative(),
    innerHeight: z.number().int().nonnegative(),
    outerWidth: z.number().int().nonnegative(),
    outerHeight: z.number().int().nonnegative(),
    devicePixelRatio: z.number().positive(),
    zoomEstimate: z.number().positive(),
    screenWidth: z.number().int().nonnegative(),
    screenHeight: z.number().int().nonnegative(),
    orientation: z.string().nullable(),
  })
  .strict();

export const ToolMetadataSchema = z
  .object({
    name: z.literal('bugcase'),
    version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/),
    schemaVersion: z.literal('v1'),
    browserBuildTarget: z.enum(['chrome', 'firefox', 'edge', 'brave', 'unknown']),
  })
  .strict();

export const UserOptionsSchema = z
  .object({
    fullPageScreenshot: z.boolean(),
    viewportScreenshot: z.boolean(),
    domSnapshot: z.boolean(),
    navigationHistory: z.boolean(),
    consoleLogs: z.boolean(),
    networkLog: z.boolean(),
    browserInfo: z.boolean(),
    screenInfo: z.boolean(),
    installedExtensions: z.boolean(),
    cookies: z.boolean(),
    localStorage: z.boolean(),
    sessionStorage: z.boolean(),
    reproductionSteps: z.boolean(),
    elementInspections: z.boolean(),
  })
  .strict();

export const CaptureMetadataSchema = z
  .object({
    id: z.string().uuid(),
    tool: ToolMetadataSchema,
    page: PageMetadataSchema,
    viewport: ViewportMetadataSchema,
    permissionsAtCapture: z.array(PermissionSchema).readonly(),
    scrubbersApplied: z.array(ScrubberRuleAppliedSchema).readonly(),
    userOptions: UserOptionsSchema,
  })
  .strict();
