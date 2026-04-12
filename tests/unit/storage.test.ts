import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    S3_ENDPOINT: "http://localhost:9000",
    S3_REGION: "eu-central-1",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_FORCE_PATH_STYLE: "true",
    S3_BUCKET: "assessly-test",
  },
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = mockSend;
  }

  class PutObjectCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  class GetObjectCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  class DeleteObjectCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  };
});

import { deleteObject, getObject, putObject } from "@/lib/storage";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("storage", () => {
  it("rejects keys with .. in putObject", async () => {
    await expect(putObject("tenant/../secret", Buffer.from("x"), "text/plain")).rejects.toThrow(
      "Invalid storage key: contains '..' segment",
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("accepts a valid key and uploads with SSE", async () => {
    mockSend.mockResolvedValueOnce({});

    await expect(putObject("tenant-1/reports/file.txt", Buffer.from("hello"), "text/plain")).resolves.toBeUndefined();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0] as { input?: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Bucket: "assessly-test",
      Key: "tenant-1/reports/file.txt",
      ContentType: "text/plain",
      ServerSideEncryption: "AES256",
    });
  });

  it("streams object body into a buffer", async () => {
    const mockReadable = new Readable({ read() {} });
    mockReadable.push(Buffer.from("file content"));
    mockReadable.push(null);
    mockSend.mockResolvedValueOnce({ Body: mockReadable });

    await expect(getObject("tenant-1/reports/file.txt")).resolves.toEqual(Buffer.from("file content"));
  });

  it("throws when getObject has no body", async () => {
    mockSend.mockResolvedValueOnce({ Body: undefined });
    await expect(getObject("tenant-1/reports/missing.txt")).rejects.toThrow(
      "S3 object not found: tenant-1/reports/missing.txt",
    );
  });

  it("ignores NoSuchKey errors in deleteObject", async () => {
    mockSend.mockRejectedValueOnce({ Code: "NoSuchKey" });
    await expect(deleteObject("tenant-1/reports/missing.txt")).resolves.toBeUndefined();
  });

  it("rethrows non-NoSuchKey delete errors", async () => {
    mockSend.mockRejectedValueOnce({ name: "AccessDenied", message: "denied" });
    await expect(deleteObject("tenant-1/reports/file.txt")).rejects.toMatchObject({ name: "AccessDenied" });
  });
});
