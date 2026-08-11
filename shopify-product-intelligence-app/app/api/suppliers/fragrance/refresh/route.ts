import { isCronAuthorized } from "@/lib/cron-auth";
import { refreshFragranceSupplierItems } from "@/lib/suppliers/refresh";
import type { FragranceSupplierItem } from "@/lib/suppliers/fragrance-import";

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    const body = await request.json() as { items?: FragranceSupplierItem[]; staleAfterHours?: number };
    return Response.json({ status: "ok", ...await refreshFragranceSupplierItems(body.items ?? [], body.staleAfterHours ?? 48) });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "Supplier refresh failed" }, { status: 400 });
  }
}
