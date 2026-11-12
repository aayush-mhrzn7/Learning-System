import { requireUserId } from "@/lib/auth";
import { uploadObject } from "@/lib/s3";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

export async function POST(request: Request) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return Response.json({ error: "File too large" }, { status: 400 });
  }

  try {
    const body = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadObject({
      body,
      contentType: file.type,
      keyPrefix: `notes/${userId}`,
      filename: file.name || "image",
    });
    return Response.json({ url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
