export interface LicensePayload {
  licenseId: string;
  plan: "PREMIUM";
  maxInstances: number;
  issuedAt: number;
  expiresAt: number | null;
  customerId: string | null;
  licenseeEmail: string;
}

export interface SignedLicense {
  payload: LicensePayload;
  signature: string;
}

export type LicenseStatus = "valid" | "expired" | "revoked" | "overlimit" | "invalid" | "missing";

export interface LicenseCheck {
  allowed: boolean;
  status: LicenseStatus;
  reason?: string;
}
