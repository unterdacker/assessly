import type { SmsProvider, SmsResult } from "../types";

/**
 * Infobip SMS provider (Croatia/EU, GDPR-compliant EU provider).
 * Uses @infobip-api/sdk (official Infobip Node SDK).
 * Docs: https://github.com/infobip/infobip-api-node-sdk
 *
 * SECURITY: SDK does not expose a debug log option.
 * Do NOT pass a logger instance to the Infobip constructor.
 */
export class InfobipSmsProvider implements SmsProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly client: any;

  constructor(
    private readonly apiKey: string,
    baseUrl: string,
    private readonly from: string,
  ) {
    // Normalize: ensure https:// prefix and no trailing slash
    const normalizedBase = baseUrl.startsWith("https://")
      ? baseUrl.replace(/\/$/, "")
      : `https://${baseUrl.replace(/\/$/, "")}`;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const InfobipModule = require("@infobip-api/sdk") as {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Infobip?: new (opts: unknown) => unknown;
      AuthType?: {
        ApiKey?: string;
      };
      default?: new (opts: unknown) => unknown;
    };
    const InfobipClass = InfobipModule.Infobip ?? InfobipModule.default;
    if (!InfobipClass) throw new Error("@infobip-api/sdk: cannot resolve constructor");
    const apiKeyAuthType = InfobipModule.AuthType?.ApiKey ?? "App";

    // SECURITY: Do NOT pass a debug logger — SDK does not expose logLevel.
    // We avoid verbose SDK debug output by using only the required constructor options.
    this.client = new InfobipClass({
      baseUrl: normalizedBase,
      apiKey,
      authType: apiKeyAuthType,
    });
  }

  async send(to: string, body: string): Promise<SmsResult> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.client as any).channels.sms.send({
        messages: [
          {
            destinations: [{ to }],
            from: this.from,
            text: body,
          },
        ],
      });
      if (response instanceof Error) {
        const safeMessage = response.message.replace(/password[=: ].*/gi, "[REDACTED]");
        return { ok: false, error: safeMessage };
      }
      const messageId =
        (response?.data?.messages?.[0]?.messageId as string | undefined) ??
        (response?.messages?.[0]?.messageId as string | undefined);
      return { ok: true, messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Infobip error";
      const safeMessage = message.replace(/password[=: ].*/gi, "[REDACTED]");
      return { ok: false, error: safeMessage };
    }
  }
}
