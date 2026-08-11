import { isCronAuthorized } from "@/lib/cron-auth";
import { createBomRevision, type BomInput } from "@/lib/bom/service";

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    return Response.json({ status: "ok", ...(await createBomRevision(await request.json() as BomInput)), shopifyWrites: 0 });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "BOM creation failed" }, { status: 400 });
  }
}
