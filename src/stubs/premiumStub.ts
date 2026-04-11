import { LicenseRequiredError, type PremiumFeatures } from '../types/premium';

export const premiumStub: PremiumFeatures = {
  async aggregateReportData(_assessmentId: string, _companyId: string) {
    throw new LicenseRequiredError('advanced-reporting');
  },
  async generateAiDraft(_assessmentId: string, _companyId: string, _locale?: 'en' | 'de') {
    throw new LicenseRequiredError('advanced-reporting');
  },
  async generatePdfBuffer(_assessmentId: string, _companyId: string) {
    throw new LicenseRequiredError('advanced-reporting');
  },
  async getOidcConfiguration(_companyId: string) {
    // Returns null rather than throwing - graceful degradation for read-only config queries
    return null;
  },
  async initiateOidcFlow(_companyId: string, _redirectUri: string) {
    throw new LicenseRequiredError('sso');
  },
};
