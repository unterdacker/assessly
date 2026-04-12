import "server-only";

import { env } from "@/lib/env";
import type { SmsResult } from "./types";

export type { SmsResult };

/**
 * Sends an SMS using the provider configured via SMS_PROVIDER env var.
 *
 * @security The `body` parameter may contain a plaintext temporary password.
 * Provider implementations MUST NOT log the body parameter.
 *
 * If SMS_PROVIDER is "log" (the default), delivery is simulated in development.
 * "log" is blocked in production by lib/env.ts superRefine.
 *
 * Returns SmsResult — never throws. Callers should log failures via audit trail.
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const provider = env.SMS_PROVIDER ?? "log";

  try {
    switch (provider) {
      case "46elks": {
        if (!env.ELKS_API_USERNAME || !env.ELKS_API_PASSWORD) {
          return { ok: false, error: "SMS misconfigured: missing ELKS_API_USERNAME or ELKS_API_PASSWORD" };
        }
        const { ElksSmsProvider } = await import("./providers/46elks");
        return new ElksSmsProvider(
          env.ELKS_API_USERNAME,
          env.ELKS_API_PASSWORD,
          env.ELKS_FROM ?? "Venshield",
        ).send(to, body);
      }

      case "sinch": {
        if (!env.SINCH_SERVICE_PLAN_ID || !env.SINCH_API_TOKEN || !env.SINCH_FROM) {
          return { ok: false, error: "SMS misconfigured: missing SINCH_SERVICE_PLAN_ID, SINCH_API_TOKEN, or SINCH_FROM" };
        }
        const { SinchSmsProvider } = await import("./providers/sinch");
        return new SinchSmsProvider(
          env.SINCH_SERVICE_PLAN_ID,
          env.SINCH_API_TOKEN,
          env.SINCH_FROM,
        ).send(to, body);
      }

      case "infobip": {
        if (!env.INFOBIP_API_KEY || !env.INFOBIP_BASE_URL) {
          return { ok: false, error: "SMS misconfigured: missing INFOBIP_API_KEY or INFOBIP_BASE_URL" };
        }
        const { InfobipSmsProvider } = await import("./providers/infobip");
        return new InfobipSmsProvider(
          env.INFOBIP_API_KEY,
          env.INFOBIP_BASE_URL,
          env.INFOBIP_FROM ?? "Venshield",
        ).send(to, body);
      }

      default: {
        const { LogSmsProvider } = await import("./providers/log");
        return new LogSmsProvider().send(to, body);
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "SMS provider error" };
  }
}
