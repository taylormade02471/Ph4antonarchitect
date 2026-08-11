import { load } from "cheerio";

import { sql } from "@/lib/db";
import type {
  RawProductObservation,
  SourceAdapter,
} from "@/lib/sources/types";

const TOP_PRODUCT_LIMIT = 5;
const ULTA_ORIGIN = "https://www.ulta.com";
const REQUEST_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "ShopifyProductIntelligence/1.0 (+https://shopify-product-intelligence.vercel.app)",
};

type DiscoveryRow = {
  id: string;
  source_product_key: string | null;
  source_url: string;
  brand_raw: string | null;
  title_raw: string | null;
  rating: string | null;
  review_count: number | null;
  source_position: number | null;
};

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseMoney(value: string) {
  return [
    ...new Set(
      [...value.matchAll(/\$([\d,]+(?:\.\d{2})?)/g)].map((match) =>
        Number(match[1].replaceAll(",", ""))
      )
    ),
  ];
}

function selectedSize($: ReturnType<typeof load>) {
  const active = normalizedText(
    $(".ProductVariant .pal-c-SelectablePill--active").first().text()
  );

  if (active) {
    return active;
  }

  return normalizedText($(".ProductDimension span").last().text());
}

function availability($: ReturnType<typeof load>) {
  const fulfillment = normalizedText($(".FulfillmentSection").first().text());

  if (/in stock|add for ship|ready in/i.test(fulfillment)) {
    return "AVAILABLE";
  }

  if (/out of stock|unavailable|not available/i.test(fulfillment)) {
    return "UNAVAILABLE";
  }

  return "UNKNOWN";
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Ulta detail request failed: ${response.status}`);
  }

  return response.text();
}

async function variantLinks(productUrl: string) {
  const $ = load(await fetchHtml(productUrl));
  const links = $(".ProductVariant .SelectablePill a[href*='sku=']")
    .map((_, element) =>
      new URL($(element).attr("href") ?? productUrl, ULTA_ORIGIN).toString()
    )
    .get();

  return [...new Set(links.length > 0 ? links : [productUrl])];
}

async function exactVariant(
  parent: DiscoveryRow,
  sourceUrl: string
): Promise<RawProductObservation> {
  const $ = load(await fetchHtml(sourceUrl));
  const priceText = normalizedText($(".ProductPricing .Price").first().text());
  const prices = parseMoney(priceText);
  const sourceItemId =
    new URL(sourceUrl).searchParams.get("sku") ??
    normalizedText($("main").text()).match(/\bItem\s+(\d+)\b/i)?.[1];
  const sizeRaw = selectedSize($);

  if (!sizeRaw || prices.length === 0 || !sourceItemId) {
    throw new Error(`Ulta variant data was incomplete: ${sourceUrl}`);
  }

  return {
    parentObservationId: parent.id,
    observationKind: "VARIANT",
    sourceProductKey: parent.source_product_key ?? undefined,
    sourceVariantKey: sourceItemId,
    sourceUrl,
    brandRaw: parent.brand_raw ?? undefined,
    titleRaw: parent.title_raw ?? undefined,
    sizeRaw,
    sourceItemId,
    currency: "USD",
    currentPrice: prices[0],
    listPrice: prices.length > 1 ? prices.at(-1) : undefined,
    availabilityRaw: availability($),
    rating: parent.rating ? Number(parent.rating) : undefined,
    reviewCount: parent.review_count ?? undefined,
    trendFlag: "BEST_SELLER_VARIANT",
    sourcePosition: parent.source_position ?? undefined,
    rawPayload: {
      parentDiscoveryObservationId: parent.id,
      priceText,
      sizeText: sizeRaw,
      itemId: sourceItemId,
      selectedUrl: sourceUrl,
    },
  };
}

export const ultaDetailAdapter: SourceAdapter = {
  key: "ulta-detail",
  version: "1.0.0",
  pagesRequested: TOP_PRODUCT_LIMIT,

  async discover() {
    const discoveryRows = (await sql`
      SELECT
        observation.id,
        observation.source_product_key,
        observation.source_url,
        observation.brand_raw,
        observation.title_raw,
        observation.rating,
        observation.review_count,
        observation.source_position
      FROM raw_product_observations AS observation
      JOIN source_scan_runs AS scan
        ON scan.id = observation.scan_run_id
      JOIN sources AS source
        ON source.id = observation.source_id
      WHERE source.domain = 'ulta.com'
        AND observation.observation_kind = 'DISCOVERY'
        AND scan.status = 'SUCCESS'
        AND scan.id = (
          SELECT latest.id
          FROM source_scan_runs AS latest
          JOIN raw_product_observations AS latest_observation
            ON latest_observation.scan_run_id = latest.id
          WHERE latest.source_id = source.id
            AND latest.status = 'SUCCESS'
            AND latest_observation.observation_kind = 'DISCOVERY'
          ORDER BY latest.completed_at DESC
          LIMIT 1
        )
      ORDER BY observation.source_position
      LIMIT ${TOP_PRODUCT_LIMIT}
    `) as DiscoveryRow[];

    if (discoveryRows.length !== TOP_PRODUCT_LIMIT) {
      throw new Error("Ulta detail enrichment requires five discovery rows");
    }

    const observations: RawProductObservation[] = [];

    for (const parent of discoveryRows) {
      const links = await variantLinks(parent.source_url);

      for (const link of links) {
        observations.push(await exactVariant(parent, link));
      }
    }

    return observations;
  },
};
