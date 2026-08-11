import { isCronAuthorized } from "@/lib/cron-auth";
import { refreshReviewQueue } from "@/lib/opportunities/review-queue";

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    const body = await request.json() as { shopifyVariantId?: string };
    const items = await refreshReviewQueue(100, body.shopifyVariantId);
    return Response.json({ status: "ok", recalculated: items.length, items, shopifyWrites: 0, approvalRequired: true });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "Opportunity recalculation failed" }, { status: 400 });
  }
}
