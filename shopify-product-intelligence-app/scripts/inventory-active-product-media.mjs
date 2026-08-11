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
    throw new Error(`Shopify product-media query failed: ${response.status}`);
  }

  return body.data;
}

const query = `
  query ActiveProductMedia($after: String) {
    products(first: 100, after: $after, query: "status:active", sortKey: TITLE) {
      nodes {
        id
        title
        handle
        vendor
        status
        media(first: 20) {
          nodes {
            id
            mediaContentType
            status
            ... on MediaImage {
              alt
              image {
                url
                width
                height
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            barcode
            media(first: 5) {
              nodes {
                id
                mediaContentType
              }
              pageInfo {
                hasNextPage
              }
            }
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

function safeFilename(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function extensionFor(contentType, url) {
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";

  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)
      ? extension
      : ".png";
  } catch {
    return ".png";
  }
}

async function downloadImage(url, targetBase) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }

  const extension = extensionFor(response.headers.get("content-type"), url);
  const target = `${targetBase}${extension}`;
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

await loadLocalEnvironment();

const outputDirectory = path.resolve(
  process.argv[2] ?? path.join("work", "shopify-active-media")
);
const currentImageDirectory = path.join(outputDirectory, "current");
await mkdir(currentImageDirectory, { recursive: true });

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

const manifestProducts = [];

for (const [index, product] of products.entries()) {
  const images = product.media.nodes.filter(
    (media) => media.mediaContentType === "IMAGE" && media.image?.url
  );
  let localImage = null;

  if (images[0]) {
    const prefix = String(index + 1).padStart(3, "0");
    localImage = await downloadImage(
      images[0].image.url,
      path.join(currentImageDirectory, `${prefix}-${safeFilename(product.handle)}`)
    );
  }

  manifestProducts.push({
    shopifyProductId: product.id,
    title: product.title,
    handle: product.handle,
    vendor: product.vendor,
    status: product.status,
    imageCount: images.length,
    currentImage: images[0]
      ? {
          shopifyMediaId: images[0].id,
          url: images[0].image.url,
          alt: images[0].alt ?? "",
          width: images[0].image.width,
          height: images[0].image.height,
          localPath: localImage,
        }
      : null,
    mediaTruncated: product.media.pageInfo.hasNextPage,
    variantsTruncated: product.variants.pageInfo.hasNextPage,
    variants: product.variants.nodes.map((variant) => ({
      shopifyVariantId: variant.id,
      title: variant.title,
      sku: variant.sku,
      barcode: variant.barcode,
      assignedMediaIds: variant.media.nodes.map((media) => media.id),
      mediaTruncated: variant.media.pageInfo.hasNextPage,
    })),
    visualClassification: "PENDING_REVIEW",
    generatedImageRequired: null,
  });
}

const manifest = {
  generatedAt: new Date().toISOString(),
  shop: process.env.SHOPIFY_SHOP,
  policy: {
    scope: "ACTIVE_PRODUCTS_ONLY",
    shopifyWrites: 0,
    automaticPublishing: false,
    identityEvidenceExcluded: ["NAME_ONLY", "COLOR_ONLY"],
  },
  summary: {
    activeProducts: manifestProducts.length,
    productsWithoutImages: manifestProducts.filter((product) => !product.currentImage)
      .length,
    productsWithVariantMedia: manifestProducts.filter((product) =>
      product.variants.some((variant) => variant.assignedMediaIds.length > 0)
    ).length,
  },
  products: manifestProducts,
};

await writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

process.stdout.write(`${JSON.stringify(manifest.summary)}\n`);
