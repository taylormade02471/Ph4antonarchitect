import crypto from "crypto";

import { sql } from "@/lib/db";
import type { SourceAdapter } from "@/lib/sources/types";

type SourceId = number | string;

export async function runSource(sourceId: SourceId, adapter: SourceAdapter) {
  const jobId = crypto.randomUUID();
  const scanRows = await sql`
    INSERT INTO source_scan_runs (
      source_id,
      job_id,
      status,
      adapter_version,
      pages_requested
    )
    VALUES (
      ${sourceId},
      ${jobId},
      'STARTED',
      ${adapter.version},
      ${adapter.pagesRequested ?? 1}
    )
    RETURNING id
  `;
  const scanRunId = scanRows[0].id;

  try {
    const observations = await adapter.discover();
    const inserts = observations.map((observation) => {
      const payload = observation.rawPayload ?? {};
      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify(observation))
        .digest("hex");

      return sql`
        INSERT INTO raw_product_observations (
          source_id,
          scan_run_id,
          parent_observation_id,
          observation_kind,
          source_product_key,
          source_variant_key,
          source_url,
          brand_raw,
          title_raw,
          concentration_raw,
          size_raw,
          source_sku,
          source_item_id,
          currency,
          current_price,
          list_price,
          availability_raw,
          rating,
          review_count,
          trend_flag,
          source_position,
          promotion_raw,
          content_hash,
          raw_payload
        )
        VALUES (
          ${sourceId},
          ${scanRunId},
          ${observation.parentObservationId ?? null},
          ${observation.observationKind ?? "DISCOVERY"},
          ${observation.sourceProductKey ?? null},
          ${observation.sourceVariantKey ?? null},
          ${observation.sourceUrl},
          ${observation.brandRaw ?? null},
          ${observation.titleRaw ?? null},
          ${observation.concentrationRaw ?? null},
          ${observation.sizeRaw ?? null},
          ${observation.sourceSku ?? null},
          ${observation.sourceItemId ?? null},
          ${observation.currency ?? "USD"},
          ${observation.currentPrice ?? null},
          ${observation.listPrice ?? null},
          ${observation.availabilityRaw ?? null},
          ${observation.rating ?? null},
          ${observation.reviewCount ?? null},
          ${observation.trendFlag ?? null},
          ${observation.sourcePosition ?? null},
          ${observation.promotionRaw ?? null},
          ${hash},
          ${JSON.stringify(payload)}::JSONB
        )
      `;
    });

    await sql.transaction([
      ...inserts,
      sql`UPDATE source_scan_runs
          SET status = 'SUCCESS',
              completed_at = NOW(),
              pages_succeeded = ${adapter.pagesRequested ?? 1},
              observations_created = ${observations.length}
          WHERE id = ${scanRunId}`,
      sql`UPDATE sources
          SET access_status = 'ALLOWED',
              last_success_at = NOW(),
              consecutive_failures = 0,
              updated_at = NOW()
          WHERE id = ${sourceId}`,
      sql`INSERT INTO audit_events (
            event_type,
            entity_type,
            entity_id,
            status,
            details
          )
          VALUES (
            'SOURCE_SCAN',
            'SOURCE',
            ${String(sourceId)},
            'SUCCESS',
            ${JSON.stringify({
              jobId,
              adapter: adapter.key,
              adapterVersion: adapter.version,
              observationsCreated: observations.length,
            })}::JSONB
          )`,
    ]);

    return {
      jobId,
      scanRunId,
      observations: observations.length,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown source scan error";
    const accessStatus = /\b(401|403|429)\b/.test(errorMessage)
      ? "LIMITED"
      : "UNVERIFIED";

    await sql.transaction([
      sql`UPDATE source_scan_runs
          SET status = 'FAILED',
              completed_at = NOW(),
              error_message = ${errorMessage}
          WHERE id = ${scanRunId}`,
      sql`UPDATE sources
          SET access_status = ${accessStatus},
              last_failure_at = NOW(),
              consecutive_failures = consecutive_failures + 1,
              updated_at = NOW()
          WHERE id = ${sourceId}`,
      sql`INSERT INTO audit_events (
            event_type,
            entity_type,
            entity_id,
            status,
            details
          )
          VALUES (
            'SOURCE_SCAN',
            'SOURCE',
            ${String(sourceId)},
            'FAILED',
            ${JSON.stringify({ jobId, error: errorMessage })}::JSONB
          )`,
    ]);

    throw error;
  }
}
