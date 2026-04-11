import 'server-only';

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { importSPKI, jwtVerify, errors as joseErrors } from 'jose';

import { AuditLogger } from '@/lib/structured-logger';

import { premiumStub } from './stubs/premiumStub';
import {
  type PremiumFeatures,
  type LicensePayload,
  type LicenseFailureReason,
  LicenseRequiredError,
} from './types/premium';

const MODULE_MAP = {
  'advanced-reporting': () => import('../modules/advanced-reporting'),
  sso: () => import('../modules/sso'),
} as const;

const LICENSE_FILE_MAX_BYTES = 64 * 1024;

type VerifyResult =
  | { valid: true; features: string[] }
  | { valid: false; reason: LicenseFailureReason };

let verifyCache: { result: VerifyResult; expiresAt: number } | null = null;

async function verifyLicense(featureName: string): Promise<VerifyResult> {
  if (verifyCache && Date.now() < verifyCache.expiresAt) {
    return verifyCache.result;
  }

  const licenseFilePath = process.env.LICENSE_FILE_PATH
    ?? path.join(process.cwd(), 'modules', 'license.json');

  let fileContent: string;
  let fileStats: Awaited<ReturnType<typeof stat>>;
  try {
    fileStats = await stat(licenseFilePath);
  } catch {
    logLicenseFailure('FILE_NOT_FOUND', false, false, featureName);
    return { valid: false, reason: 'FILE_NOT_FOUND' };
  }

  if (fileStats.size > LICENSE_FILE_MAX_BYTES) {
    logLicenseFailure('FILE_TOO_LARGE', true, false, featureName);
    return { valid: false, reason: 'FILE_TOO_LARGE' };
  }

  try {
    fileContent = await readFile(licenseFilePath, 'utf-8');
  } catch {
    logLicenseFailure('FILE_NOT_FOUND', false, false, featureName);
    return { valid: false, reason: 'FILE_NOT_FOUND' };
  }

  const licenseKey = process.env.LICENSE_KEY;
  if (!licenseKey) {
    logLicenseFailure('MISSING_KEY', true, false, featureName);
    return { valid: false, reason: 'MISSING_KEY' };
  }

  const audience = process.env.LICENSE_AUDIENCE;
  if (!audience) {
    logLicenseFailure('AUDIENCE_MISMATCH', true, false, featureName);
    return { valid: false, reason: 'AUDIENCE_MISMATCH' };
  }

  let token: string;
  try {
    const parsed: unknown = JSON.parse(fileContent.trim());
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).token !== 'string'
    ) {
      logLicenseFailure('INVALID_TOKEN_STRUCTURE', true, false, featureName);
      return { valid: false, reason: 'INVALID_TOKEN_STRUCTURE' };
    }
    token = (parsed as { token: string }).token;
    if (!token || !token.includes('.')) {
      logLicenseFailure('MALFORMED_JSON', true, false, featureName);
      return { valid: false, reason: 'MALFORMED_JSON' };
    }
  } catch {
    logLicenseFailure('MALFORMED_JSON', true, false, featureName);
    return { valid: false, reason: 'MALFORMED_JSON' };
  }

  let publicKey: Awaited<ReturnType<typeof importSPKI>>;
  try {
    publicKey = await importSPKI(licenseKey, 'RS256');
  } catch {
    logLicenseFailure('KEY_PARSE_ERROR', true, false, featureName);
    return { valid: false, reason: 'KEY_PARSE_ERROR' };
  }

  let payload: LicensePayload;
  try {
    const result = await jwtVerify<LicensePayload>(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'assessly-licensing',
      audience,
    });
    payload = result.payload as LicensePayload;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      logLicenseFailure('TOKEN_EXPIRED', true, true, featureName);
      return { valid: false, reason: 'TOKEN_EXPIRED' };
    }
    if (
      err instanceof joseErrors.JWTClaimValidationFailed &&
      (err as { claim?: string }).claim === 'aud'
    ) {
      logLicenseFailure('AUDIENCE_MISMATCH', true, true, featureName);
      return { valid: false, reason: 'AUDIENCE_MISMATCH' };
    }
    logLicenseFailure('SIGNATURE_INVALID', true, true, featureName);
    return { valid: false, reason: 'SIGNATURE_INVALID' };
  }

  if (!Array.isArray(payload.features)) {
    logLicenseFailure('INVALID_TOKEN_STRUCTURE', true, true, featureName);
    return { valid: false, reason: 'INVALID_TOKEN_STRUCTURE' };
  }

  const successResult: VerifyResult = { valid: true, features: payload.features as string[] };
  verifyCache = { result: successResult, expiresAt: Date.now() + 5 * 60 * 1000 };
  return successResult;
}

async function checkFeature(featureName: string): Promise<boolean> {
  const result = await verifyLicense(featureName);
  if (!result.valid) return false;

  if (!result.features.includes(featureName)) {
    logLicenseFailure('FEATURE_NOT_GRANTED', true, true, featureName);
    return false;
  }
  return true;
}

export async function getPremiumModule<K extends keyof typeof MODULE_MAP>(
  featureName: K,
): Promise<PremiumFeatures> {
  const isLicensed = await checkFeature(featureName);
  if (!isLicensed) {
    return premiumStub;
  }

  try {
    const mod = await MODULE_MAP[featureName]();
    return (mod as { default: PremiumFeatures }).default;
  } catch (err) {
    AuditLogger.systemHealth('license.module.load.failed', 'failure', {
      details: {
        featureName,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw new LicenseRequiredError(featureName);
  }
}

function logLicenseFailure(
  reason: LicenseFailureReason,
  wasFileFound: boolean,
  wasStructurallyValid: boolean,
  requestedFeature: string,
): void {
  AuditLogger.systemHealth('license.verification.failed', 'failure', {
    details: {
      reason,
      wasFileFound,
      wasStructurallyValid,
      requestedFeature,
    },
  });
}
