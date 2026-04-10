import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
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
