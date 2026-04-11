export type SmsResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

export interface SmsProvider {
  send(to: string, body: string): Promise<SmsResult>;
}
