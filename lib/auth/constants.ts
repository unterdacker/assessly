/**
 * Authentication constants shared across auth primitives.
 * BCRYPT_COST_FACTOR can be overridden via env var BCRYPT_COST_FACTOR.
 * Enforced range: 10-15 (fails closed to 12 if invalid).
 */
const _raw = parseInt(process.env.BCRYPT_COST_FACTOR ?? "12", 10);
export const BCRYPT_COST_FACTOR =
  Number.isInteger(_raw) && _raw >= 10 && _raw <= 15 ? _raw : 12;

/** Token expiry: 48 hours for invite links */
export const INVITE_TOKEN_EXPIRES_MS = 48 * 60 * 60 * 1000;
