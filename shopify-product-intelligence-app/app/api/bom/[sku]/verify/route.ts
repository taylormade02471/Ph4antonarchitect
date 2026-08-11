import { isCronAuthorized } from "@/lib/cron-auth";
import { verifyBom } from "@/lib/bom/service";

export async function POST(request: Request, context: { params: Promise<{ sku: string }> }) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    return Response.json({ status: "ok", ...(await verifyBom(decodeURIComponent((await context.params).sku))), shopifyWrites: 0 });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "BOM verification failed" }, { status: 400 });
  }
}
