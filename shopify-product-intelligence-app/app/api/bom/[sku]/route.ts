import { isCronAuthorized } from "@/lib/cron-auth";
import { createBomRevision, getBom, type BomInput } from "@/lib/bom/service";

type Context = { params: Promise<{ sku: string }> };

export async function GET(_request: Request, context: Context) {
  return Response.json({ status: "ok", ...(await getBom(decodeURIComponent((await context.params).sku))) });
}

export async function PUT(request: Request, context: Context) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    const sku = decodeURIComponent((await context.params).sku);
    return Response.json({ status: "ok", ...(await createBomRevision({ ...await request.json() as BomInput, shopifyVariantId: sku })), shopifyWrites: 0 });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "BOM update failed" }, { status: 400 });
  }
}
