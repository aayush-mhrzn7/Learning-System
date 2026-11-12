import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireUserId } from "@/lib/auth";
import { getS3Bucket, getS3Client } from "@/lib/s3";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const { key: parts } = await context.params;
  const key = parts.map((part) => decodeURIComponent(part)).join("/");
  if (!key || key.includes("..") || !key.startsWith(`notes/${userId}/`)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const object = await getS3Client().send(
      new GetObjectCommand({
        Bucket: getS3Bucket(),
        Key: key,
      }),
    );
    if (!object.Body) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const bytes = await object.Body.transformToByteArray();
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": object.ContentType || "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
