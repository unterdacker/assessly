import "server-only";
import fs from "fs/promises";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { encryptFile, decryptFile } from "@/lib/crypto";
import { env } from "@/lib/env";

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  });
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (key.includes("..")) throw new Error("Invalid storage key: contains '..' segment");
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    }),
  );
}

export async function getObject(key: string): Promise<Buffer> {
  if (key.includes("..")) throw new Error("Invalid storage key: contains '..' segment");
  const s3 = getS3Client();
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
  if (!response.Body) {
    throw new Error(`S3 object not found: ${key}`);
  }
  const stream = response.Body as Readable;
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function deleteObject(key: string): Promise<void> {
  if (key.includes("..")) throw new Error("Invalid storage key: contains '..' segment");
  const s3 = getS3Client();
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } catch (err: unknown) {
    const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name;
    if (code === "NoSuchKey") return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Local filesystem storage helpers  (application-level AES-256-GCM)
// Used when S3 is not configured.  Files are stored under .venshield-storage/
// and encrypted at rest using STORAGE_ENCRYPTION_KEY.
// ---------------------------------------------------------------------------

const LOCAL_STORAGE_DIR = path.join(process.cwd(), ".venshield-storage");

/**
 * Writes an encrypted file to the local filesystem under .venshield-storage/.
 * `relativePath` must be a relative path (e.g. "question-evidence/uuid.pdf").
 * Path-traversal and symlink-escape attacks are blocked.
 */
export async function putLocalFile(relativePath: string, data: Buffer): Promise<void> {
  // Reject absolute paths before resolving
  if (path.isAbsolute(relativePath)) {
    throw new Error("Invalid storage path: absolute paths are not permitted.");
  }

  // Ensure the base dir exists before calling realpath
  await fs.mkdir(LOCAL_STORAGE_DIR, { recursive: true });
  const realBase = await fs.realpath(LOCAL_STORAGE_DIR);

  const target = path.resolve(realBase, relativePath);
  if (!target.startsWith(realBase + path.sep)) {
    throw new Error("Invalid storage path: path traversal detected.");
  }

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(target), { recursive: true });

  // Defense-in-depth: check parent dir does not escape via symlink
  const realTargetDir = await fs.realpath(path.dirname(target));
  if (!realTargetDir.startsWith(realBase + path.sep) && realTargetDir !== realBase) {
    throw new Error("Invalid storage path: symlink escape detected.");
  }

  const encrypted = encryptFile(data);
  await fs.writeFile(target, encrypted);
}

/**
 * Reads and decrypts a file from the local filesystem under .venshield-storage/.
 * `relativePath` must be a relative path.
 * Returns the decrypted plaintext buffer.
 * If the file is shorter than 28 bytes, returns the raw buffer as-is (pre-encryption legacy file).
 * If the file is 28 bytes or longer, decryptFile() is called and GCM auth-tag failures propagate.
 */
export async function getLocalFile(relativePath: string): Promise<Buffer> {
  // Reject absolute paths before resolving
  if (path.isAbsolute(relativePath)) {
    throw new Error("Invalid storage path: absolute paths are not permitted.");
  }

  await fs.mkdir(LOCAL_STORAGE_DIR, { recursive: true });
  const realBase = await fs.realpath(LOCAL_STORAGE_DIR);

  const target = path.resolve(realBase, relativePath);
  if (!target.startsWith(realBase + path.sep)) {
    throw new Error("Invalid storage path: path traversal detected.");
  }

  // Dereference symlinks in the target to prevent symlink-escape
  const realTarget = await fs.realpath(target);
  if (!realTarget.startsWith(realBase + path.sep)) {
    throw new Error("Invalid storage path: symlink escape detected.");
  }

  const raw = await fs.readFile(realTarget) as Buffer;

  // Migration tolerance: files too short to contain IV+ciphertext+tag are
  // treated as pre-encryption legacy plaintext and returned as-is.
  // Otherwise decryptFile() is called and any auth-tag failure propagates.
  if (raw.length < 28) {
    return raw;
  }
  return decryptFile(raw);
}
