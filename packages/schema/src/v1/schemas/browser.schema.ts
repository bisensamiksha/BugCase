import { z } from 'zod';

export const UserAgentBrandSchema = z
  .object({
    brand: z.string(),
    version: z.string(),
  })
  .strict();

export const UserAgentDataSchema = z
  .object({
    brands: z.array(UserAgentBrandSchema).readonly(),
    platform: z.string().nullable(),
    platformVersion: z.string().nullable(),
    mobile: z.boolean(),
    architecture: z.string().nullable(),
    bitness: z.string().nullable(),
  })
  .strict();

export const InstalledExtensionInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    enabled: z.boolean(),
    type: z.string(),
  })
  .strict();

export const BrowserInfoSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    userAgent: z.string(),
    userAgentData: UserAgentDataSchema.nullable(),
    languages: z.array(z.string()).readonly(),
    timezone: z.string(),
    installedExtensions: z.array(InstalledExtensionInfoSchema).readonly().nullable(),
  })
  .strict();
