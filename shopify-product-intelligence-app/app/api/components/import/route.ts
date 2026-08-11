import { importComponentSupplierItems, type ComponentSupplierItem } from "@/lib/components/component-import";
import { isCronAuthorized } from "@/lib/cron-auth";

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    const body = await request.json() as { items?: ComponentSupplierItem[] };
    return Response.json({ status: "ok", ...await importComponentSupplierItems(body.items ?? []) });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "Component import failed" }, { status: 400 });
  }
}
