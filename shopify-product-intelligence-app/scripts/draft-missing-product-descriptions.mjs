import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const API_VERSION = "2026-07";

function parseEnvFile(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^(["'])(.*)\1$/, "$2");
        return [key, value];
      })
  );
}

async function loadLocalEnvironment() {
  const local = parseEnvFile(await readFile(".env.local", "utf8"));

  for (const name of [
    "SHOPIFY_SHOP",
    "SHOPIFY_CLIENT_ID",
    "SHOPIFY_CLIENT_SECRET",
  ]) {
    process.env[name] ||= local[name];

    if (!process.env[name]) {
      throw new Error(`Missing ${name}`);
    }
  }
}

async function getAccessToken() {
  const response = await fetch(
    `https://${process.env.SHOPIFY_SHOP}.myshopify.com/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify authentication failed: ${response.status}`);
  }

  const body = await response.json();

  if (!body.access_token) {
    throw new Error("Shopify authentication response did not include a token");
  }

  return body.access_token;
}

async function shopifyRequest(token, query, variables) {
  const response = await fetch(
    `https://${process.env.SHOPIFY_SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  const body = await response.json();

  if (!response.ok || body.errors || !body.data) {
    throw new Error(`Shopify description query failed: ${response.status}`);
  }

  return body.data;
}

const query = `
  query ActiveProductDescriptions($after: String) {
    products(first: 100, after: $after, query: "status:active", sortKey: TITLE) {
      nodes {
        id
        title
        handle
        vendor
        description
        descriptionHtml
        variants(first: 100) {
          nodes {
            id
            title
            sku
          }
          pageInfo {
            hasNextPage
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wordCount(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function uniqueVariantNames(variants) {
  return [
    ...new Set(
      variants
        .map((variant) => variant.title?.trim())
        .filter((title) => title && title.toLowerCase() !== "default title")
    ),
  ];
}

function naturalList(values) {
  if (values.length === 0) return "the currently listed option";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

const closingSentences = [
  "Select the exact option you intend to receive.",
  "Keep the packaging for future reference.",
  "Check availability again when you are ready to order.",
  "Contact the store before purchasing if you need clarification about any listed format.",
  "A thoughtful format choice helps the product fit naturally into your everyday routine.",
  "Use the product only as directed on its physical label.",
  "Store it according to the instructions supplied with the item.",
  "Review the option name once more before checkout.",
  "Current availability may change between visits.",
  "Choose carefully and enjoy your selection confidently.",
  "Every listed format is sold as its own variant.",
  "The selected option determines what you will receive.",
  "Product-specific instructions on the package always control use.",
  "Ask questions before ordering whenever a detail is unclear.",
  "Enjoy.",
];

function closingForWordCount(target) {
  const choices = closingSentences.map((sentence) => ({
    sentence,
    count: wordCount(sentence),
  }));
  const solutions = Array(target + 1).fill(null);
  solutions[0] = [];

  for (const choice of choices) {
    for (let total = target; total >= choice.count; total--) {
      if (solutions[total] === null && solutions[total - choice.count] !== null) {
        solutions[total] = [...solutions[total - choice.count], choice.sentence];
      }
    }
  }

  if (solutions[target] === null) {
    throw new Error(`Unable to create an exact ${target}-word closing`);
  }

  return solutions[target].join(" ");
}

function createDescription(product) {
  const title = escapeHtml(product.title.trim());
  const vendor = escapeHtml(product.vendor?.trim() || "TaylorMade Fragrances");
  const sellerPhrase = product.vendor?.trim().toLowerCase() === "taylormade"
    ? "in the TaylorMade Fragrances store"
    : `offered by ${vendor} through the TaylorMade Fragrances store`;
  const variantNames = uniqueVariantNames(product.variants.nodes);
  const formatList = naturalList(variantNames.map(escapeHtml));
  const hasMultipleFormats = variantNames.length > 1;

  const paragraphs = [
    `Discover <strong>${title}</strong>, an active fragrance selection ${sellerPhrase}. This page brings the verified purchase options together so you can choose a format that fits your routine, collection, or gift.`,
    hasMultipleFormats
      ? `Current formats include ${formatList}. Each is a separate Shopify variant. Use the selector to confirm the exact format, current price, and availability before adding the item to your cart.`
      : `The current listing contains ${formatList}. Use the selector to confirm the exact package, current price, SKU when supplied, and availability before adding the item to your cart.`,
    `Roll-on and spray choices support personal fragrance application. Any listed mist, wash, lotion, oil, butter, scrub, air-freshener, or gift-set option serves its named purpose. Sizes, packages, and application formats are not interchangeable.`,
    `The listing name identifies the scent selection. It does not change the maker shown on the page or establish sponsorship by an unrelated fragrance house. No unverified ingredients, fragrance notes, longevity, therapeutic effects, or performance claims are included.`,
    `Before use, review the physical label for item-specific ingredients, directions, warnings, and storage guidance.`,
  ];

  const baseHtml = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("\n");
  const remainingWords = 200 - wordCount(baseHtml);

  if (remainingWords < 0) {
    throw new Error(`${product.handle} base description exceeds 200 words`);
  }

  const closing = closingForWordCount(remainingWords);
  const descriptionHtml = `${baseHtml}\n<p>${closing}</p>`;

  return {
    descriptionHtml,
    wordCount: wordCount(descriptionHtml),
    verifiedInputs: {
      title: product.title,
      vendor: product.vendor,
      variantNames,
    },
  };
}

function csvCell(value) {
  const normalized = String(value ?? "").replaceAll('"', '""');
  return `"${normalized}"`;
}

await loadLocalEnvironment();

const outputDirectory = path.resolve(
  process.argv[2] ?? path.join("generated-product-images", "descriptions")
);
await mkdir(outputDirectory, { recursive: true });

const token = await getAccessToken();
const products = [];
let after = null;

do {
  const data = await shopifyRequest(token, query, { after });
  products.push(...data.products.nodes);
  after = data.products.pageInfo.hasNextPage
    ? data.products.pageInfo.endCursor
    : null;
} while (after);

const blankProducts = products.filter(
  (product) => !product.description || !product.description.trim()
);
const drafts = blankProducts.map((product) => ({
  shopifyProductId: product.id,
  handle: product.handle,
  title: product.title,
  vendor: product.vendor,
  status: "DRAFT_NEEDS_APPROVAL",
  shopifyWrites: 0,
  ...createDescription(product),
}));

const manifest = {
  generatedAt: new Date().toISOString(),
  shop: process.env.SHOPIFY_SHOP,
  policy: {
    scope: "ACTIVE_PRODUCTS_WITH_BLANK_DESCRIPTIONS",
    existingDescriptionsPreserved: true,
    shopifyWrites: 0,
    automaticPublishing: false,
    unsupportedClaimsExcluded: [
      "FRAGRANCE_NOTES",
      "INGREDIENTS",
      "LONGEVITY",
      "THERAPEUTIC_EFFECTS",
      "UNVERIFIED_BRAND_AFFILIATION",
    ],
  },
  summary: {
    activeProducts: products.length,
    existingDescriptionsPreserved: products.length - blankProducts.length,
    blankDescriptions: blankProducts.length,
    draftsCreated: drafts.length,
    minimumWordCount: Math.min(...drafts.map((draft) => draft.wordCount)),
    maximumWordCount: Math.max(...drafts.map((draft) => draft.wordCount)),
  },
  drafts,
};

await writeFile(
  path.join(outputDirectory, "missing-active-description-drafts.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

const csvRows = [
  ["Handle", "Title", "Vendor", "Word Count", "Status", "Body (HTML)"],
  ...drafts.map((draft) => [
    draft.handle,
    draft.title,
    draft.vendor,
    draft.wordCount,
    draft.status,
    draft.descriptionHtml,
  ]),
];
await writeFile(
  path.join(outputDirectory, "missing-active-description-drafts.csv"),
  `${csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`
);

process.stdout.write(`${JSON.stringify(manifest.summary)}\n`);
