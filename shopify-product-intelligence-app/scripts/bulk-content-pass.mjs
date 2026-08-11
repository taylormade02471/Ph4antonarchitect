import crypto from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const API_VERSION = "2026-07";
const ROOT = path.resolve(".");
const REVIEW_PATH = path.join(
  ROOT,
  "generated-product-images",
  "active-product-content-review.json",
);
const LOG_DIR = path.join(ROOT, "generated-product-images", "publish-logs");
const GIFT_CARD_HANDLE = "hunnee-bz-gift-cards";
const DESCRIPTION_PROFILES = [
  {
    pattern:
      /\b(rose|jasmine|gardenia|cherry|peony|flower|floral|bloom|her|paris|daisy|orchid|tulip|hibiscus|magnolia|fleur|lait|valentine|amour|damask)\b/i,
    notes: ["soft floral", "romantic floral", "bright floral", "smooth floral"],
  },
  {
    pattern:
      /\b(oud|sandal|cedar|wood|woods|tobacco|leather|tuxedo|saffron|noir|black|amber|tonka|vetiver|diamond|society|gentlemen|fahrenheit)\b/i,
    notes: ["rich woody", "warm woody", "smooth amber", "deep polished"],
  },
  {
    pattern:
      /\b(aqua|water|ocean|blue|fresh|citrus|bergamot|lime|lemon|orange|universal|universalis|ellis|swim|iced|citron|crystal)\b/i,
    notes: ["crisp fresh", "clean bright", "airy citrus", "fresh polished"],
  },
  {
    pattern:
      /\b(vanilla|sweet|sugar|candy|caramel|honey|cream|coconut|gourmand|girl|latte|chocolate|sorbet|strawberry|peach|nectar|milk|berry)\b/i,
    notes: ["smooth sweet", "cozy sweet", "soft gourmand", "creamy warm"],
  },
  {
    pattern:
      /\b(spice|spicy|amethyst|dubai|musk|intense|elixir|midnight|royal|gold|platinum|ruby|wanted|extreme|only|queening|master|checkmate|defense)\b/i,
    notes: ["bold warm", "smooth spicy", "confident warm", "standout polished"],
  },
];

const DEFAULT_NOTES = ["smooth signature", "balanced daily", "polished modern", "memorable clean"];
const DESCRIPTION_ENDINGS = [
  "with easy wear and a lasting finish.",
  "with polished depth and everyday charm.",
  "with smooth character and a refined finish.",
  "with soft impact and confident wear.",
];

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    imageOnly: argv.includes("--image-only"),
  };
}

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
          .replace(/^(['"])(.*)\1$/, "$2");
        return [key, value];
      }),
  );
}

async function loadEnvironment() {
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
    },
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

async function shopifyRequest(token, query, variables, operation) {
  const response = await fetch(
    `https://${process.env.SHOPIFY_SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.errors || !body.data) {
    const messages = Array.isArray(body.errors)
      ? body.errors.map((error) => error.message).filter(Boolean).join("; ")
      : "";
    throw new Error(
      `${operation} failed with HTTP ${response.status}${messages ? `: ${messages}` : ""}`,
    );
  }

  return body.data;
}

function assertNoUserErrors(errors, operation) {
  if (errors?.length) {
    throw new Error(`${operation} was rejected: ${errors.map((error) => error.message).join("; ")}`);
  }
}

const productQuery = `
  query ActiveProducts {
    products(first: 250, query: "status:active") {
      nodes {
        id
        title
        handle
        vendor
        status
        descriptionHtml
        onlineStoreUrl
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
        }
      }
    }
  }
`;

function cleanTitle(original) {
  let title = original
    .replace(/^\s*[A-Z0-9]+[-_]\s*/i, "")
    .replace(/\s+TYPE\s*[A-Z0-9]*\s*$/i, "")
    .replace(/\s+TYPE\s*[A-Z0-9]+\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const normalized = title.toLowerCase();
  const knownNames = new Map([
    ["aqua universalis", "Aqua Universalis"],
    ["dubai amethyst", "Dubai Amethyst"],
    ["tuxedo", "Tuxedo"],
    ["b. her", "B. Her"],
    ["good girl", "Good Girl"],
  ]);

  return knownNames.get(normalized) ?? title;
}

function numericId(gid, resourceName) {
  const value = gid.split("/").at(-1);

  if (!/^\d+$/.test(value ?? "")) {
    throw new Error(`Invalid ${resourceName} ID`);
  }

  return value;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getGrantedScopes(token) {
  const data = await shopifyRequest(
    token,
    `
      query CurrentAppScopes {
        currentAppInstallation {
          accessScopes { handle }
        }
      }
    `,
    {},
    "App scope lookup",
  );

  return data.currentAppInstallation.accessScopes.map((scope) => scope.handle);
}

async function updateProduct(token, productId, title, descriptionHtml) {
  const data = await shopifyRequest(
    token,
    `
      mutation UpdateProductContent($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { id title handle descriptionHtml }
          userErrors { field message }
        }
      }
    `,
    { product: { id: productId, title, descriptionHtml } },
    "Product content update",
  );
  assertNoUserErrors(data.productUpdate.userErrors, "Product content update");
  return data.productUpdate.product;
}

async function uploadImage(token, productId, buffer, filename, alt) {
  const response = await fetch(
    `https://${process.env.SHOPIFY_SHOP}.myshopify.com/admin/api/${API_VERSION}/products/${numericId(productId, "product")}/images.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        image: {
          attachment: buffer.toString("base64"),
          filename,
          alt,
          position: 1,
        },
      }),
    },
  );
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.image?.id) {
    throw new Error(`Product image upload failed: ${response.status}`);
  }

  return body.image;
}

async function getProductByHandle(token, handle) {
  const data = await shopifyRequest(
    token,
    `
      query ProductByHandle($search: String!) {
        products(first: 5, query: $search) {
          nodes {
            id title handle vendor status descriptionHtml onlineStoreUrl
            media(first: 20) {
              nodes {
                id mediaContentType status
                ... on MediaImage { alt image { url width height } }
              }
            }
          }
        }
      }
    `,
    { search: `handle:${handle}` },
    "Product verification lookup",
  );
  return data.products.nodes.find((product) => product.handle === handle) ?? null;
}

async function waitForUploadedMedia(token, handle, alt) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const product = await getProductByHandle(token, handle);
    const media = product?.media.nodes.find(
      (item) => item.mediaContentType === "IMAGE" && item.alt === alt,
    );

    if (media?.status === "FAILED") {
      throw new Error("Shopify reported that the new product image failed");
    }

    if (media?.status === "READY" && media.image?.url) {
      return { product, media };
    }

    await sleep(2000);
  }

  throw new Error("Timed out waiting for Shopify to process the new image");
}

async function reorderPrimary(token, productId, mediaId) {
  const data = await shopifyRequest(
    token,
    `
      mutation MakePrimary($id: ID!, $moves: [MoveInput!]!) {
        productReorderMedia(id: $id, moves: $moves) {
          job { id }
          mediaUserErrors { field message }
        }
      }
    `,
    { id: productId, moves: [{ id: mediaId, newPosition: "0" }] },
    "Product media reorder",
  );
  assertNoUserErrors(data.productReorderMedia.mediaUserErrors, "Product media reorder");
}

async function waitForPrimary(token, handle, mediaId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const product = await getProductByHandle(token, handle);

    if (product?.media.nodes[0]?.id === mediaId) {
      return product;
    }

    await sleep(2000);
  }

  throw new Error("Timed out waiting for the new image to become primary");
}

async function deleteProductImage(token, productId, mediaId) {
  const data = await shopifyRequest(
    token,
    `
      mutation DeleteProductMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          mediaUserErrors { field message }
        }
      }
    `,
    { productId, mediaIds: [mediaId] },
    "Product secondary media delete",
  );
  assertNoUserErrors(
    data.productDeleteMedia.mediaUserErrors,
    "Product secondary media delete",
  );
}

function descriptionFor(title) {
  const profile = DESCRIPTION_PROFILES.find((item) => item.pattern.test(title));
  const notes = profile?.notes ?? DEFAULT_NOTES;
  const hash = [...crypto.createHash("sha1").update(title).digest()].reduce(
    (total, value) => total + value,
    0,
  );
  const note = notes[hash % notes.length];
  const ending = DESCRIPTION_ENDINGS[hash % DESCRIPTION_ENDINGS.length];
  const compactTitle = title.length <= 28 ? `${title}: ` : "";
  const candidate = `${compactTitle}A ${note} fragrance ${ending}`;

  if (candidate.length <= 100) {
    return candidate;
  }

  return `A ${note} fragrance ${ending}`;
}

function imageOverrides() {
  const drafts = path.join(ROOT, "generated-product-images", "drafts");
  const exotic = path.join(ROOT, "generated-product-images", "exotic-redesigns");
  return new Map([
    ["a-goodnight-kiss", path.join(exotic, "a-goodnight-kiss-exotic-v1.png")],
    ["afternoon-swim-lv", path.join(exotic, "afternoon-swim-lv-exotic-v1.png")],
    ["b-rouge", path.join(exotic, "b-rouge-exotic-v1.png")],
    ["b-her", path.join(exotic, "b-her-exotic-v1.png")],
    ["black-amber-lavender", path.join(exotic, "black-amber-lavender-exotic-v1.png")],
    ["black-opium", path.join(exotic, "black-opium-exotic-v1.png")],
    ["blue-agave-sugar", path.join(exotic, "blue-agave-sugar-exotic-v1.png")],
    ["1-oz-roll-on-c-love", path.join(exotic, "1-oz-roll-on-c-love-exotic-v1.png")],
    ["centaurus", path.join(exotic, "centaurus-exotic-v1.png")],
    ["coconut-milk", path.join(exotic, "coconut-milk-exotic-v1.png")],
    ["dg-light-blue", path.join(exotic, "dg-light-blue-exotic-v1.png")],
    ["dubai-amethyst", path.join(exotic, "dubai-amethyst-exotic-v1.png")],
    ["dubai-oud", path.join(exotic, "dubai-oud-exotic-v1.png")],
    ["dubai-ruby", path.join(exotic, "dubai-ruby-exotic-v1.png")],
    ["24k-egyptian-musk", path.join(exotic, "24k-egyptian-musk-exotic-v1.png")],
    ["forever-wanted-elixir", path.join(exotic, "forever-wanted-elixir-exotic-v1.png")],
    ["french-defense", path.join(exotic, "french-defense-exotic-v1.png")],
    ["gentlemen-society-extreme", path.join(exotic, "gentlemen-society-extreme-exotic-v1.png")],
    ["grand-master", path.join(exotic, "grand-master-exotic-v1.png")],
    ["lemon-rose-water", path.join(exotic, "lemon-rose-water-exotic-v1.png")],
    ["libre-berry-crush", path.join(exotic, "libre-berry-crush-exotic-v1.png")],
    ["light-blue", path.join(exotic, "light-blue-exotic-v1.png")],
    ["midnight-citron-crush", path.join(exotic, "midnight-citron-crush-exotic-v1.png")],
    ["miu-miu-fleur-de-lait", path.join(exotic, "miu-miu-fleur-de-lait-exotic-v1.png")],
    ["most-wanted", path.join(exotic, "most-wanted-exotic-v1.png")],
    ["pink-amber-and-vanilla", path.join(exotic, "pink-amber-and-vanilla-exotic-v1.png")],
    ["queening", path.join(exotic, "queening-exotic-v1.png")],
    ["royal-tonka", path.join(exotic, "royal-tonka-exotic-v1.png")],
    ["sexy-amber", path.join(exotic, "sexy-amber-exotic-v1.png")],
    ["straight-to-heaven", path.join(exotic, "straight-to-heaven-exotic-v1.png")],
    ["strawberry-sorbet", path.join(exotic, "strawberry-sorbet-exotic-v1.png")],
    ["tiger-orchid-and-wild-cherry", path.join(exotic, "tiger-orchid-and-wild-cherry-exotic-v1.png")],
    ["uomo-coral-fantasy", path.join(exotic, "uomo-coral-fantasy-exotic-v1.png")],
    ["white-sands", path.join(exotic, "white-sands-exotic-v1.png")],
    ["white-sands-2", path.join(exotic, "white-sands-exotic-v1.png")],
    ["white-tea-and-sage", path.join(exotic, "white-tea-and-sage-exotic-v1.png")],
    ["aqua-universalis", path.join(drafts, "aqua-universalis", "aqua-universalis-primary-taylormade.png")],
    ["tuxedo", path.join(drafts, "tuxedo", "tuxedo-primary-taylormade-v2.png")],
    ["perry-ellis-acqua", path.join(drafts, "perry-ellis-acqua", "perry-ellis-acqua-primary-taylormade-v2.png")],
    ["good-girl-type599l", path.join(drafts, "good-girl-type599l", "good-girl-primary-taylormade-v2.png")],
  ]);
}

async function buildImageMap(imageOnly = false) {
  const review = JSON.parse(await readFile(REVIEW_PATH, "utf8"));
  const result = new Map();

  if (!imageOnly) {
    for (const item of review.products ?? []) {
      if (item.imageApprovalStatus === "REVIEW_READY" && item.proposedImagePath) {
        result.set(item.handle, item.proposedImagePath);
      }
    }
  }

  for (const [handle, imagePath] of imageOverrides()) {
    if (!imageOnly || imagePath.includes(`${path.sep}exotic-redesigns${path.sep}`)) {
      result.set(handle, imagePath);
    }
  }

  return result;
}

function fileDigest(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

const args = parseArgs(process.argv.slice(2));
await loadEnvironment();
const token = await getAccessToken();
const [data, grantedScopes, images] = await Promise.all([
  shopifyRequest(token, productQuery, {}, "Active product lookup"),
  getGrantedScopes(token),
  buildImageMap(args.imageOnly),
]);

const allActiveProducts = data.products.nodes.filter(
  (product) => product.status === "ACTIVE" && product.handle !== GIFT_CARD_HANDLE,
);
const activeProducts = args.imageOnly
  ? allActiveProducts.filter((product) => images.has(product.handle))
  : allActiveProducts;

if (args.apply && !grantedScopes.includes("write_products")) {
  throw new Error("The Shopify app is missing write_products permission");
}

  const plan = activeProducts.map((product) => ({
  id: product.id,
  handle: product.handle,
  oldTitle: product.title,
  newTitle: cleanTitle(product.title),
  descriptionCharacters: descriptionFor(cleanTitle(product.title)).length,
  imagePath: images.get(product.handle) ?? null,
  changeVariants: false,
  changePrices: false,
  changeInventory: false,
}));

if (!args.apply) {
  console.log(JSON.stringify({
    mode: "DRY_RUN",
    activeProducts: activeProducts.length,
    productsWithPreparedImages: plan.filter((item) => item.imagePath).length,
    writeProductsScope: grantedScopes.includes("write_products"),
    plan,
  }, null, 2));
  process.exit(0);
}

const results = [];
for (const product of activeProducts) {
  const newTitle = cleanTitle(product.title);
  const description = descriptionFor(newTitle);
  const imagePath = images.get(product.handle);
  const alt = `${newTitle} | TaylorMade Fragrances`;
  const result = {
    id: product.id,
    handle: product.handle,
    oldTitle: product.title,
    newTitle,
    descriptionCharacters: description.length,
    image: imagePath ? "PENDING" : "SKIPPED_NO_PREPARED_IMAGE",
    secondaryImagesDeleted: 0,
    variantsChanged: false,
    pricesChanged: false,
    inventoryChanged: false,
  };

  try {
    if (!args.imageOnly) {
      await updateProduct(token, product.id, newTitle, `<p>${description}</p>`);
    }

    if (imagePath) {
      const info = await stat(imagePath);
      if (!info.isFile() || info.size === 0) {
        throw new Error(`Prepared image is missing or empty: ${imagePath}`);
      }

      const imageBuffer = await readFile(imagePath);
      const current = await getProductByHandle(token, product.handle);
      let media = current.media.nodes.find(
        (item) => item.mediaContentType === "IMAGE" && item.alt === alt && item.status === "READY",
      );

      if (!media) {
        const uploaded = await uploadImage(token, product.id, imageBuffer, path.basename(imagePath), alt);
        const processed = await waitForUploadedMedia(token, product.handle, alt);
        media = processed.media;
        result.uploadedImageId = uploaded.id;
      } else {
        result.image = "ALREADY_PRESENT";
      }

      const latest = await getProductByHandle(token, product.handle);
      if (latest.media.nodes[0]?.id !== media.id) {
        await reorderPrimary(token, product.id, media.id);
      }

      const after = await waitForPrimary(token, product.handle, media.id);
      result.image = "UPDATED";
      result.primaryImageUrl = after.media.nodes[0]?.image?.url ?? null;

      const secondaryImages = after.media.nodes.filter(
        (item) => item.id !== media.id && item.mediaContentType === "IMAGE",
      );
      for (const secondaryImage of secondaryImages) {
        await deleteProductImage(token, product.id, secondaryImage.id);
        result.secondaryImagesDeleted += 1;
      }
    }

    result.status = "ok";
  } catch (error) {
    result.status = "error";
    result.error = error instanceof Error ? error.message : String(error);
  }

  results.push(result);
  await sleep(500);
}

await mkdir(LOG_DIR, { recursive: true });
const completedAt = new Date().toISOString();
const logPath = path.join(
  LOG_DIR,
  `bulk-content-pass-${completedAt.replace(/[:.]/g, "-")}.json`,
);
const log = {
  completedAt,
  mode: "APPLY",
  imageOnly: args.imageOnly,
  scope: {
    activeProducts: activeProducts.length,
    preparedImages: plan.filter((item) => item.imagePath).length,
    writeProducts: true,
  },
  guarantees: {
    productContentChanged: !args.imageOnly,
    variantsChanged: false,
    pricesChanged: false,
    inventoryChanged: false,
    purchasesTriggered: false,
  },
  results,
};
await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`);

console.log(JSON.stringify({
  status: results.some((result) => result.status === "error") ? "completed_with_errors" : "ok",
  activeProducts: activeProducts.length,
  succeeded: results.filter((result) => result.status === "ok").length,
  failed: results.filter((result) => result.status === "error").length,
  imagesUpdated: results.filter((result) => result.image === "UPDATED").length,
  imagesSkipped: results.filter((result) => result.image === "SKIPPED_NO_PREPARED_IMAGE").length,
  secondaryImagesDeleted: results.reduce(
    (total, result) => total + (result.secondaryImagesDeleted ?? 0),
    0,
  ),
  variantsChanged: false,
  pricesChanged: false,
  inventoryChanged: false,
  logPath,
}, null, 2));
