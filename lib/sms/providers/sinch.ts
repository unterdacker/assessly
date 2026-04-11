import type { SmsProvider, SmsResult } from "../types";

/**
 * Sinch SMS provider (Sweden, GDPR-compliant EU provider).
 * Uses @sinch/sdk-core.
 * Docs: https://developers.sinch.com/docs/sms/
 *
 * SECURITY: Do NOT pass a debug logger or logLevel to SinchClient —
 * HTTP request bodies contain tempPassword.
 */
export class SinchSmsProvider implements SmsProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly client: any;

  constructor(
    private readonly servicePlanId: string,
    private readonly apiToken: string,
    private readonly from: string,
  ) {
    // Lazy import to avoid module-load errors when Sinch is not the active provider
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SinchClient } = require("@sinch/sdk-core") as {
      SinchClient: new (opts: { servicePlanId: string; apiToken: string }) => {
        sms: { batches: { send: (opts: unknown) => Promise<{ id?: string }> } };
      };
    };
    // SECURITY: No logger or logLevel passed — prevents HTTP body from appearing in debug output
    this.client = new SinchClient({ servicePlanId, apiToken });
  }

  async send(to: string, body: string): Promise<SmsResult> {
    try {
      const response = await this.client.sms.batches.send({
        from: this.from,
        to: [to],
        body,
      });
      return { ok: true, messageId: response?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sinch error";
      // Strip any password-like content from SDK error messages
      const safeMessage = message.replace(/password[=: ].*/gi, "[REDACTED]");
      return { ok: false, error: safeMessage };
    }
  }
}
