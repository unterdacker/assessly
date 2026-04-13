import { Readable } from "stream";
import * as fs from "fs/promises";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockSend, mockEncryptFile, mockDecryptFile } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockEncryptFile: vi.fn(),
  mockDecryptFile: vi.fn(),
}));

vi.mock("fs/promises");

vi.mock("@/lib/crypto", () => ({
  encryptFile: mockEncryptFile,
  decryptFile: mockDecryptFile,
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
import { getLocalFile, putLocalFile } from "@/lib/storage";

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

describe("putLocalFile / getLocalFile (local filesystem)", () => {
  const LOCAL_STORAGE_DIR = path.join(process.cwd(), ".venshield-storage");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.realpath).mockImplementation(async (p) => p as string);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.alloc(50, 0xaa) as never);
    mockEncryptFile.mockReturnValue(Buffer.from("encrypted"));
    mockDecryptFile.mockReturnValue(Buffer.from("decrypted"));
  });

  describe("putLocalFile", () => {
    it("rejects absolute paths", async () => {
      await expect(putLocalFile("/etc/passwd", Buffer.from("x"))).rejects.toThrow(/absolute/i);
    });

    it("rejects path traversal via ..", async () => {
      await expect(putLocalFile("../escape.txt", Buffer.from("x"))).rejects.toThrow(/traversal|escape/i);
    });

    it("encrypts data and writes file for a valid relative path", async () => {
      await putLocalFile("reports/evidence.pdf", Buffer.from("plaintext"));

      expect(mockEncryptFile).toHaveBeenCalledWith(Buffer.from("plaintext"));
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledTimes(1);
      const [writePath, writeData] = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writePath as string).toContain("evidence.pdf");
      expect(writeData).toEqual(Buffer.from("encrypted"));
    });

    it("creates parent directories before writing", async () => {
      await putLocalFile("nested/dir/file.pdf", Buffer.from("x"));
      expect(vi.mocked(fs.mkdir)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ recursive: true }),
      );
    });

    it("detects symlink escape on parent directory", async () => {
      vi.mocked(fs.realpath).mockImplementation(async (p) => {
        const s = p as string;
        if (s === LOCAL_STORAGE_DIR) return LOCAL_STORAGE_DIR;
        return "/etc";
      });

      await expect(putLocalFile("nested/report.pdf", Buffer.from("x"))).rejects.toThrow(/symlink|escape|traversal/i);
    });
  });

  describe("getLocalFile", () => {
    it("rejects absolute paths", async () => {
      await expect(getLocalFile("/etc/passwd")).rejects.toThrow(/absolute/i);
    });

    it("rejects path traversal via ..", async () => {
      await expect(getLocalFile("../escape.txt")).rejects.toThrow(/traversal|escape/i);
    });

    it("returns raw buffer for files shorter than 28 bytes (legacy pre-encryption)", async () => {
      const raw = Buffer.alloc(10, 0x01);
      vi.mocked(fs.readFile).mockResolvedValue(raw as never);

      const result = await getLocalFile("legacy/old.pdf");
      expect(result).toEqual(raw);
      expect(mockDecryptFile).not.toHaveBeenCalled();
    });

    it("calls decryptFile and returns decrypted buffer for >=28-byte files", async () => {
      const raw = Buffer.alloc(50, 0xaa);
      const plain = Buffer.from("plaintext");
      vi.mocked(fs.readFile).mockResolvedValue(raw as never);
      mockDecryptFile.mockReturnValue(plain);

      const result = await getLocalFile("reports/file.pdf");

      expect(mockDecryptFile).toHaveBeenCalledWith(raw);
      expect(result).toEqual(plain);
    });

    it("propagates decryptFile error for >=28-byte files (no silent swallowing)", async () => {
      const raw = Buffer.alloc(50, 0xbb);
      vi.mocked(fs.readFile).mockResolvedValue(raw as never);
      mockDecryptFile.mockImplementation(() => {
        throw new Error("GCM auth tag mismatch");
      });

      await expect(getLocalFile("tampered.pdf")).rejects.toThrow("GCM auth tag mismatch");
    });

    it("detects symlink escape on resolved target path", async () => {
      const base = LOCAL_STORAGE_DIR;
      vi.mocked(fs.realpath).mockImplementation(async (p) => {
        const s = p as string;
        if (s === base) return base;
        return "/etc/passwd";
      });

      await expect(getLocalFile("file.pdf")).rejects.toThrow(/symlink|escape|traversal/i);
    });
  });
});
