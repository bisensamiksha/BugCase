import { z } from 'zod';

import { AnnotationsManifestSchema } from './annotation.schema';
import { BrowserInfoSchema } from './browser.schema';
import { ConsoleLogSchema } from './console.schema';
import { CookiesDumpSchema } from './cookies.schema';
import { DomSnapshotSchema } from './dom.schema';
import { ElementInspectionsManifestSchema } from './element-inspection.schema';
import { CaptureMetadataSchema } from './metadata.schema';
import { NavigationLogSchema } from './navigation.schema';
import { NetworkLogSchema } from './network.schema';
import { ReproductionRecordingSchema } from './reproduction.schema';
import { ScreenshotsManifestSchema } from './screenshots.schema';
import { StorageDumpSchema } from './storage.schema';
import { UserInputSchema } from './user-input.schema';

export const BugReportV1Schema = z
  .object({
    schemaVersion: z.literal('v1'),
    metadata: CaptureMetadataSchema,
    userInput: UserInputSchema,
    screenshots: ScreenshotsManifestSchema,
    browser: BrowserInfoSchema.nullable(),
    console: ConsoleLogSchema.nullable(),
    network: NetworkLogSchema.nullable(),
    dom: DomSnapshotSchema.nullable(),
    storage: StorageDumpSchema.nullable(),
    cookies: CookiesDumpSchema.nullable(),
    navigation: NavigationLogSchema.nullable(),
    reproduction: ReproductionRecordingSchema.nullable(),
    elementInspections: ElementInspectionsManifestSchema.nullable(),
    annotations: AnnotationsManifestSchema.nullable(),
  })
  .strict();

export type BugReportV1Inferred = z.infer<typeof BugReportV1Schema>;
