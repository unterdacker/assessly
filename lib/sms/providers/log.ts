import type { SmsProvider, SmsResult } from "../types";

/** Masks an E.164 phone number, keeping only the last 4 digits. */
function maskPhone(e164: string): string {
  if (e164.length <= 4) return "****";
  return `${"*".repeat(e164.length - 4)}${e164.slice(-4)}`;
}

/**
 * Development/simulation SMS provider.
 * Logs a masked phone number only — NEVER logs the message body.
 */
export class LogSmsProvider implements SmsProvider {
  // SECURITY: _body is intentionally unused — do NOT log it (contains tempPassword)
  async send(to: string, _body: string): Promise<SmsResult> {
    console.log(`[SIMULATED SMS -> ${maskPhone(to)}]`);
    console.log(`  [SMS BODY REDACTED -- password delivered to device only]`);
    return { ok: true };
  }
}
