import type { SmsProvider, SmsResult } from "../types";

/**
 * 46elks SMS provider (Sweden, GDPR-compliant EU provider).
 * Uses plain fetch — no SDK dependency.
 * Docs: https://46elks.com/docs/send-sms
 */
export class ElksSmsProvider implements SmsProvider {
  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly from: string,
  ) {}

  async send(to: string, body: string): Promise<SmsResult> {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString("base64");

    const params = new URLSearchParams();
    params.set("from", this.from);
    params.set("to", to);
    params.set("message", body);

    let res: Response;
    try {
      res = await fetch("https://api.46elks.com/a1/SMS", {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        // SECURITY: do NOT log body (contains tempPassword)
        body: params.toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "46elks network error",
      };
    }

    if (!res.ok) {
      // Do NOT include response body — may contain PII or sensitive metadata
      return { ok: false, error: `46elks HTTP ${res.status}` };
    }

    try {
      const json = (await res.json()) as { id?: string };
      return { ok: true, messageId: json.id };
    } catch {
      return { ok: true };
    }
  }
}
