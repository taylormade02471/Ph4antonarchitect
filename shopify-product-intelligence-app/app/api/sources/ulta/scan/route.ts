import { isCronAuthorized } from "@/lib/cron-auth";
import { sql } from "@/lib/db";
import { ultaAdapter } from "@/lib/sources/adapters/ulta";
import { runSource } from "@/lib/sources/run-source";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) {
      return Response.json(
        { status: "error", message: "Unauthorized" },
        { status: 401 }
      );
    }

    const sourceRows = await sql`
      SELECT id, name, enabled, adapter_key
      FROM sources
      WHERE domain = 'ulta.com'
      LIMIT 1
    `;
    const source = sourceRows[0];

    if (!source) {
      return Response.json(
        { status: "error", message: "Ulta source is not registered" },
        { status: 404 }
      );
    }

    if (!source.enabled || source.adapter_key !== ultaAdapter.key) {
      return Response.json(
        { status: "error", message: "Ulta source adapter is disabled" },
        { status: 409 }
      );
    }

    const result = await runSource(source.id, ultaAdapter);

    return Response.json({
      status: "ok",
      source: source.name,
      scanRunId: result.scanRunId,
      productsDiscovered: result.observations,
      observationsStored: result.observations,
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Ulta source scan failed",
      },
      { status: 500 }
    );
  }
}
