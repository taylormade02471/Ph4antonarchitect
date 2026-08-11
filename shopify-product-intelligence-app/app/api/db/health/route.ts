import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await sql`
      SELECT
        NOW() AS server_time,
        CURRENT_DATABASE() AS database_name
    `;

    return Response.json({
      status: "ok",
      database: "connected",
      serverTime: result[0].server_time,
      databaseName: result[0].database_name,
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        database: "disconnected",
        error:
          error instanceof Error
            ? error.message
            : "Unknown database error",
      },
      { status: 500 }
    );
  }
}
