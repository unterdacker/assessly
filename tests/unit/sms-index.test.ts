import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockLogSend,
  mockElksSend,
  mockSinchSend,
  mockInfobipSend,
  mockEnv,
} = vi.hoisted(() => ({
  mockLogSend: vi.fn(),
  mockElksSend: vi.fn(),
  mockSinchSend: vi.fn(),
  mockInfobipSend: vi.fn(),
  mockEnv: {
    SMS_PROVIDER: undefined as string | undefined,
    ELKS_API_USERNAME: undefined as string | undefined,
    ELKS_API_PASSWORD: undefined as string | undefined,
    ELKS_FROM: undefined as string | undefined,
    SINCH_SERVICE_PLAN_ID: undefined as string | undefined,
    SINCH_API_TOKEN: undefined as string | undefined,
    SINCH_FROM: undefined as string | undefined,
    INFOBIP_API_KEY: undefined as string | undefined,
    INFOBIP_BASE_URL: undefined as string | undefined,
    INFOBIP_FROM: undefined as string | undefined,
  },
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));

// These alias paths resolve to the same absolute module IDs as the dynamic imports
// in lib/sms/index.ts, so Vitest matches these mocks after resolver normalization.
vi.mock("@/lib/sms/providers/log", () => ({
  LogSmsProvider: class {
    send = mockLogSend;
  },
}));

vi.mock("@/lib/sms/providers/46elks", () => ({
  ElksSmsProvider: class {
    send = mockElksSend;
  },
}));

vi.mock("@/lib/sms/providers/sinch", () => ({
  SinchSmsProvider: class {
    send = mockSinchSend;
  },
}));

vi.mock("@/lib/sms/providers/infobip", () => ({
  InfobipSmsProvider: class {
    send = mockInfobipSend;
  },
}));

import { sendSms } from "@/lib/sms";

function resetEnv() {
  mockEnv.SMS_PROVIDER = undefined;
  mockEnv.ELKS_API_USERNAME = undefined;
  mockEnv.ELKS_API_PASSWORD = undefined;
  mockEnv.ELKS_FROM = undefined;
  mockEnv.SINCH_SERVICE_PLAN_ID = undefined;
  mockEnv.SINCH_API_TOKEN = undefined;
  mockEnv.SINCH_FROM = undefined;
  mockEnv.INFOBIP_API_KEY = undefined;
  mockEnv.INFOBIP_BASE_URL = undefined;
  mockEnv.INFOBIP_FROM = undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetEnv();
  mockLogSend.mockResolvedValue({ ok: true });
  mockElksSend.mockResolvedValue({ ok: true });
  mockSinchSend.mockResolvedValue({ ok: true });
  mockInfobipSend.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("sendSms", () => {
  it("uses log provider by default", async () => {
    await expect(sendSms("+491234", "temp pwd")).resolves.toEqual({ ok: true });
    expect(mockLogSend).toHaveBeenCalledWith("+491234", "temp pwd");
  });

  it("returns configuration error for 46elks when credentials are missing", async () => {
    mockEnv.SMS_PROVIDER = "46elks";

    await expect(sendSms("+491234", "body")).resolves.toEqual({
      ok: false,
      error: "SMS misconfigured: missing ELKS_API_USERNAME or ELKS_API_PASSWORD",
    });
  });

  it("uses 46elks provider when configured", async () => {
    mockEnv.SMS_PROVIDER = "46elks";
    mockEnv.ELKS_API_USERNAME = "user";
    mockEnv.ELKS_API_PASSWORD = "pass";

    await expect(sendSms("+491234", "body")).resolves.toEqual({ ok: true });
    expect(mockElksSend).toHaveBeenCalledWith("+491234", "body");
  });

  it("returns configuration error for sinch when required config is missing", async () => {
    mockEnv.SMS_PROVIDER = "sinch";

    await expect(sendSms("+491234", "body")).resolves.toEqual({
      ok: false,
      error: "SMS misconfigured: missing SINCH_SERVICE_PLAN_ID, SINCH_API_TOKEN, or SINCH_FROM",
    });
  });

  it("returns configuration error for infobip when required config is missing", async () => {
    mockEnv.SMS_PROVIDER = "infobip";

    await expect(sendSms("+491234", "body")).resolves.toEqual({
      ok: false,
      error: "SMS misconfigured: missing INFOBIP_API_KEY or INFOBIP_BASE_URL",
    });
  });

  it("propagates provider promise rejection", async () => {
    mockEnv.SMS_PROVIDER = "infobip";
    mockEnv.INFOBIP_API_KEY = "key";
    mockEnv.INFOBIP_BASE_URL = "https://api.infobip.test";
    mockInfobipSend.mockImplementationOnce(() => {
      throw new Error("provider down");
    });

    await expect(sendSms("+491234", "body")).resolves.toMatchObject({
      ok: false,
      error: "provider down",
    });
  });
});
