import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

let client: S3Client | null = null;

export function getR2Client() {
  if (client) return client;
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
  client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

export function getR2Bucket() {
  return requiredEnv("R2_BUCKET");
}

export function mediaObjectUrl(key: string) {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function uploadObject({
  body,
  contentType,
  keyPrefix,
  filename,
}: {
  body: Buffer;
  contentType: string;
  keyPrefix: string;
  filename: string;
}) {
  const bucket = getR2Bucket();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  const key = `${keyPrefix}/${randomUUID()}-${safeName || "file"}`;
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, url: mediaObjectUrl(key) };
}
