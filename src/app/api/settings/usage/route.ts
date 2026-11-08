import { requireUserId } from "@/lib/auth";
import { getUsageSummary } from "@/lib/ai-usage";

export async function GET(request: Request) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const url = new URL(request.url);
  const range = Number(url.searchParams.get("range") ?? "7");
  const summary = await getUsageSummary(userId, Number.isFinite(range) ? range : 7);

  return Response.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
