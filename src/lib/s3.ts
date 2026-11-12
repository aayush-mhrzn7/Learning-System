import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

let client: S3Client | null = null;

export function getS3Client() {
  if (client) return client;
  client = new S3Client({
    region: process.env.AWS_REGION?.trim() || "auto",
    endpoint: requiredEnv("AWS_ENDPOINT_URL_S3"),
    credentials: {
      accessKeyId: requiredEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("AWS_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: false,
  });
  return client;
}

export function getS3Bucket() {
  return requiredEnv("S3_BUCKET");
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
  const bucket = getS3Bucket();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  const key = `${keyPrefix}/${randomUUID()}-${safeName || "file"}`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, url: mediaObjectUrl(key) };
}
