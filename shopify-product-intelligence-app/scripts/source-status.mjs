import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL");
}

const sql = neon(databaseUrl);
const [source] = await sql`
  SELECT
    id,
    name,
    access_status,
    adapter_key,
    last_success_at,
    consecutive_failures
  FROM sources
  WHERE domain = 'ulta.com'
`;
const [latestScan] = await sql`
  SELECT
    id,
    status,
    pages_requested,
    pages_succeeded,
    observations_created,
    started_at,
    completed_at
  FROM source_scan_runs
  WHERE source_id = ${source.id}
  ORDER BY started_at DESC
  LIMIT 1
`;
const samples = await sql`
  SELECT
    id,
    source_position,
    brand_raw,
    title_raw,
    source_url,
    rating,
    review_count,
    raw_payload->>'priceText' AS price_raw,
    observed_at
  FROM raw_product_observations
  WHERE scan_run_id = ${latestScan.id}
  ORDER BY source_position
  LIMIT 5
`;

process.stdout.write(
  `${JSON.stringify({ source, latestScan, samples })}\n`
);
