import { refreshReviewQueue } from "@/lib/opportunities/review-queue";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const requested = Number(new URL(request.url).searchParams.get("limit") ?? 25);
    const items = await refreshReviewQueue(Math.min(100, Math.max(1, requested || 25)));
    const counts = items.reduce<Record<string, number>>((result, item) => {
      result[item.decision] = (result[item.decision] ?? 0) + 1;
      return result;
    }, {});
    return Response.json({ status: "ok", generatedFrom: "real_observations", shopifyWrites: 0,
      liveActionsExecuted: 0, counts, items });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "Review queue failed" }, { status: 500 });
  }
}
