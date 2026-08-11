import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL");
}

const sql = neon(databaseUrl);
const [products, mappings, audits, sources, scans, observations] =
  await Promise.all([
  sql`SELECT COUNT(*)::INT AS count FROM products`,
  sql`SELECT COUNT(*)::INT AS count FROM shopify_product_map`,
  sql`SELECT COUNT(*)::INT AS count
      FROM audit_events
      WHERE event_type = 'SHOPIFY_CATALOG_SYNC'
        AND status = 'SUCCESS'`,
  sql`SELECT COUNT(*)::INT AS count FROM sources`,
  sql`SELECT COUNT(*)::INT AS count FROM source_scan_runs`,
  sql`SELECT COUNT(*)::INT AS count FROM raw_product_observations`,
  ]);

process.stdout.write(
  `${JSON.stringify({
    products: products[0].count,
    shopifyMappings: mappings[0].count,
    successfulSyncAudits: audits[0].count,
    sources: sources[0].count,
    sourceScanRuns: scans[0].count,
    rawObservations: observations[0].count,
  })}\n`
);
