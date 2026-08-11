import { load } from "cheerio";

import type {
  RawProductObservation,
  SourceAdapter,
} from "@/lib/sources/types";

const LISTING_URL =
  "https://www.ulta.com/shop/fragrance/all?sort=best_sellers";
const MAX_PRODUCTS = 25;

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseRating(value: string) {
  const match = value.match(
    /([0-5](?:\.\d+)?) out of 5 stars\s*;\s*([\d,]+) reviews/i
  );

  if (!match) {
    return {};
  }

  return {
    rating: Number(match[1]),
    reviewCount: Number(match[2].replaceAll(",", "")),
  };
}

function parsePrices(value: string) {
  return [
    ...new Set(
      [...value.matchAll(/\$([\d,]+(?:\.\d{2})?)/g)].map((match) =>
        Number(match[1].replaceAll(",", ""))
      )
    ),
  ];
}

function productKeyFromUrl(url: string) {
  return url.match(/-(pimprod\d+)/i)?.[1];
}

export const ultaAdapter: SourceAdapter = {
  key: "ulta",
  version: "1.0.0",
  pagesRequested: 1,

  async discover(): Promise<RawProductObservation[]> {
    const response = await fetch(LISTING_URL, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "ShopifyProductIntelligence/1.0 (+https://shopify-product-intelligence.vercel.app)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Ulta listing request failed: ${response.status}`);
    }

    const html = await response.text();
    const $ = load(html);
    const observations: RawProductObservation[] = [];

    $("[data-test='products-list-item']")
      .slice(0, MAX_PRODUCTS)
      .each((index, element) => {
        const card = $(element);
        const sourceItemId = card.attr("data-sku-id") ?? undefined;
        const href = card.find("a[href*='/p/']").first().attr("href");
        const brandRaw = normalizedText(
          card.find(".pal-c-ProductCardBody--brandName").first().text()
        );
        const titleRaw = normalizedText(
          card.find(".pal-c-ProductCardBody--title").first().text()
        );
        const ratingText = normalizedText(
          card.find(".pal-c-Ratings .sr-only").first().text()
        );
        const priceText = normalizedText(
          card.find(".pal-c-ProductCardBody--price").first().text()
        );
        const variantSummary = normalizedText(
          card.find(".pal-c-ProductCardHeader__variant").first().text()
        );
        const promotions = card
          .find(".pal-c-Tag__messageText")
          .map((_, node) => normalizedText($(node).text()))
          .get()
          .filter(Boolean);
        const sourceUrl = href
          ? new URL(href, "https://www.ulta.com").toString()
          : undefined;

        if (!sourceUrl || !brandRaw || !titleRaw) {
          return;
        }

        const prices = parsePrices(priceText);
        const rating = parseRating(ratingText);
        const currentPrice = prices.length === 1 ? prices[0] : undefined;

        observations.push({
          observationKind: "DISCOVERY",
          sourceProductKey: productKeyFromUrl(sourceUrl),
          sourceUrl,
          brandRaw,
          titleRaw,
          sourceItemId,
          currency: "USD",
          currentPrice,
          availabilityRaw: "LISTED",
          rating: rating.rating,
          reviewCount: rating.reviewCount,
          trendFlag: "BEST_SELLER",
          sourcePosition: index + 1,
          promotionRaw: promotions.length > 0 ? promotions.join(" | ") : undefined,
          rawPayload: {
            listingUrl: LISTING_URL,
            priceText,
            priceValues: prices,
            variantSummary,
            ratingText,
            promotions,
          },
        });
      });

    if (observations.length === 0) {
      throw new Error("Ulta listing returned no parseable product cards");
    }

    return observations;
  },
};
