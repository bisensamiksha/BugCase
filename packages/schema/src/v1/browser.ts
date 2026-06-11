export interface UserAgentBrand {
  readonly brand: string;
  readonly version: string;
}

export interface UserAgentData {
  readonly brands: readonly UserAgentBrand[];
  readonly platform: string | null;
  readonly platformVersion: string | null;
  readonly mobile: boolean;
  readonly architecture: string | null;
  readonly bitness: string | null;
}

export interface InstalledExtensionInfo {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly type: string;
}

export interface BrowserInfo {
  readonly schemaVersion: 'v1';
  readonly userAgent: string;
  readonly userAgentData: UserAgentData | null;
  readonly languages: readonly string[];
  readonly timezone: string;
  readonly installedExtensions: readonly InstalledExtensionInfo[] | null;
}
