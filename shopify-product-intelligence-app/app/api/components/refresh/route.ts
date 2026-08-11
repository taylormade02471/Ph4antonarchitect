import { isCronAuthorized } from "@/lib/cron-auth";
import { refreshComponentSupplierItems } from "@/lib/components/refresh";
import type { ComponentSupplierItem } from "@/lib/components/component-import";

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    const body = await request.json() as { items?: ComponentSupplierItem[]; staleAfterHours?: number };
    return Response.json({ status: "ok", ...await refreshComponentSupplierItems(body.items ?? [], body.staleAfterHours ?? 48) });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "Component refresh failed" }, { status: 400 });
  }
}
