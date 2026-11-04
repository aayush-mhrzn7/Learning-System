import { getProviderConnectionStatuses } from "@/lib/provider-credentials";
import { requireUserId } from "@/lib/auth";

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const statuses = await getProviderConnectionStatuses(userId);
  return Response.json({ statuses });
}
