import { isCronAuthorized } from "@/lib/cron-auth";
import { sql } from "@/lib/db";
import { normalizeAndMatchScan } from "@/lib/normalization/run-normalization";
import { ultaDetailAdapter } from "@/lib/sources/adapters/ulta-detail";
import { runSource } from "@/lib/sources/run-source";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    const sources = await sql`SELECT id, name, enabled FROM sources WHERE domain = 'ulta.com' LIMIT 1`;
    const source = sources[0];
    if (!source || !source.enabled) return Response.json({ status: "error", message: "Ulta source is unavailable" }, { status: 409 });
    const scan = await runSource(source.id, ultaDetailAdapter);
    const report = await normalizeAndMatchScan(scan.scanRunId as string);
    return Response.json({ status: "ok", source: source.name, scanRunId: scan.scanRunId,
      parentProducts: 5, variantObservationsStored: scan.observations, ...report, shopifyWrites: 0 });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "Ulta enrichment failed" }, { status: 500 });
  }
}
