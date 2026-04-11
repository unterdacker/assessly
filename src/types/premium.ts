// Exported types - no imports from modules/ allowed here

export class LicenseRequiredError extends Error {
  readonly featureName: string;
  override readonly name = 'LicenseRequiredError' as const;
  constructor(featureName: string) {
    super(`License required for feature: ${featureName}`);
    this.featureName = featureName;
  }
}

export type LicenseFailureReason =
  | 'FILE_NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'MALFORMED_JSON'
  | 'INVALID_TOKEN_STRUCTURE'
  | 'KEY_PARSE_ERROR'
  | 'MISSING_KEY'
  | 'SIGNATURE_INVALID'
  | 'TOKEN_EXPIRED'
  | 'AUDIENCE_MISMATCH'
  | 'FEATURE_NOT_GRANTED';

export interface LicensePayload {
  sub: string;
  features: string[];
  exp: number;
  iss: string;
  aud: string | string[];
}

// Supporting types that mirror submodule shapes without importing them
export interface CategoryBreakdown {
  category: string;
  totalQuestions: number;
  compliantCount: number;
  nonCompliantCount: number;
  compliancePercent: number;
}

export interface ReportSummary {
  assessmentId: string;
  companyId: string;
  vendorName: string;
  complianceScore: number;
  riskLevel: string;
  categoryBreakdown: CategoryBreakdown[];
}

export interface AiReportDraft {
  executiveSummary: string;
  remediationRoadmap: string;
  modelInfo: string;
  promptHash: string;
}

export interface SsoConfiguration {
  companyId: string;
  issuerUrl: string;
  clientId: string;
  isEnabled: boolean;
}

export interface PremiumFeatures {
  aggregateReportData(assessmentId: string, companyId: string): Promise<ReportSummary>;
  generateAiDraft(assessmentId: string, companyId: string, locale?: 'en' | 'de'): Promise<AiReportDraft>;
  generatePdfBuffer(assessmentId: string, companyId: string): Promise<Buffer>;
  getOidcConfiguration(companyId: string): Promise<SsoConfiguration | null>;
  initiateOidcFlow(companyId: string, redirectUri: string): Promise<{ redirectUrl: string; state: string }>;
}
