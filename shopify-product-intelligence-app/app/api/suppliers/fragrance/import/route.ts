import { isCronAuthorized } from "@/lib/cron-auth";
import { importFragranceSupplierItems, type FragranceSupplierItem } from "@/lib/suppliers/fragrance-import";

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    const body = await request.json() as { items?: FragranceSupplierItem[] };
    const result = await importFragranceSupplierItems(body.items ?? []);
    return Response.json({ status: "ok", ...result });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "Supplier import failed" }, { status: 400 });
  }
}
