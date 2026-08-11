import crypto from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const API_VERSION = "2026-07";

function parseArgs(argv) {
  const args = { apply: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      args.apply = true;
      continue;
    }

    if (!arg.startsWith("--") || !argv[index + 1]) {
      throw new Error(`Invalid argument: ${arg}`);
    }

    args[arg.slice(2)] = argv[index + 1];
    index += 1;
  }

  return args;
}

function requiredArg(args, name) {
  const value = args[name];

  if (!value) {
    throw new Error(`Missing --${name}`);
  }

  return value;
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
          .replace(/^(["'])(.*)\1$/, "$2");
        return [key, value];
      }),
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
  const body = await response.json();

  if (!response.ok || body.errors || !body.data) {
    const messages = Array.isArray(body.errors)
      ? body.errors.map((error) => error.message).filter(Boolean).join("; ")
      : "";
    const detail = messages ? `: ${messages}` : "";
    throw new Error(
      `${operation} failed with HTTP ${response.status}${detail}`,
    );
  }

  return body.data;
}

function assertNoUserErrors(errors, operation) {
  if (errors?.length) {
    const messages = errors.map((error) => error.message).join("; ");
    throw new Error(`${operation} was rejected: ${messages}`);
  }
}

const productQuery = `
  query ExactProductForContentUpdate($search: String!) {
    products(first: 5, query: $search) {
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

async function getExactProduct(token, handle) {
  const data = await shopifyRequest(
    token,
    productQuery,
    { search: `handle:${handle}` },
    "Exact product lookup",
  );
  const matches = data.products.nodes.filter(
    (product) => product.handle === handle,
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one product for handle ${handle}; found ${matches.length}`,
    );
  }

  return matches[0];
}

async function getGrantedScopes(token) {
  const data = await shopifyRequest(
    token,
    `
      query CurrentAppScopes {
        currentAppInstallation {
          accessScopes {
            handle
          }
        }
      }
    `,
    {},
    "App scope lookup",
  );

  return data.currentAppInstallation.accessScopes.map((scope) => scope.handle);
}

function numericId(gid, resourceName) {
  const value = gid.split("/").at(-1);

  if (!/^\d+$/.test(value ?? "")) {
    throw new Error(`Invalid ${resourceName} ID`);
  }

  return value;
}

async function createProductImageFromAttachment(
  token,
  productId,
  imageBuffer,
  filename,
  altText,
) {
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
          attachment: imageBuffer.toString("base64"),
          filename,
          alt: altText,
          position: 1,
        },
      }),
    },
  );
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.image?.id) {
    throw new Error(`Product image attachment failed: ${response.status}`);
  }

  return body.image;
}

async function deleteProductImage(token, productId, imageId) {
  const response = await fetch(
    `https://${process.env.SHOPIFY_SHOP}.myshopify.com/admin/api/${API_VERSION}/products/${numericId(productId, "product")}/images/${imageId}.json`,
    {
      method: "DELETE",
      headers: { "X-Shopify-Access-Token": token },
    },
  );

  if (!response.ok) {
    throw new Error(`New-image rollback failed: ${response.status}`);
  }
}

async function updateDescription(token, productId, descriptionHtml) {
  const data = await shopifyRequest(
    token,
    `
      mutation UpdateOneProductDescription($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      product: {
        id: productId,
        descriptionHtml,
      },
    },
    "Product description update",
  );
  assertNoUserErrors(
    data.productUpdate.userErrors,
    "Product description update",
  );
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, " ");
}

function countWords(value) {
  return stripHtml(value).trim().split(/\s+/).filter(Boolean).length;
}

function normalizeHtml(value) {
  return value.replace(/>\s+</g, "><").trim();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForMedia(token, handle, altText) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const product = await getExactProduct(token, handle);
    const media = product.media.nodes.find(
      (item) => item.mediaContentType === "IMAGE" && item.alt === altText,
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

async function waitForPrimaryMedia(token, handle, mediaId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const product = await getExactProduct(token, handle);

    if (product.media.nodes[0]?.id === mediaId) {
      return product;
    }

    await sleep(2000);
  }

  throw new Error("Timed out waiting for the new image to become primary");
}

const args = parseArgs(process.argv.slice(2));
const handle = requiredArg(args, "handle");
const expectedId = requiredArg(args, "expected-id");
const expectedVendor = requiredArg(args, "expected-vendor");
const imagePath = path.resolve(requiredArg(args, "image"));
const descriptionPath = path.resolve(requiredArg(args, "description"));
const altText = requiredArg(args, "alt");
const forbiddenTerms = String(args.forbid ?? "type")
  .split(",")
  .map((term) => term.trim())
  .filter(Boolean);

await loadLocalEnvironment();

const [descriptionHtml, imageInfo] = await Promise.all([
  readFile(descriptionPath, "utf8"),
  stat(imagePath),
]);

if (!imageInfo.isFile() || imageInfo.size === 0) {
  throw new Error("The selected image is missing or empty");
}

if (countWords(descriptionHtml) !== 200) {
  throw new Error(
    `Description must contain exactly 200 words; found ${countWords(descriptionHtml)}`,
  );
}

const customerText = `${stripHtml(descriptionHtml)} ${altText}`;

for (const term of forbiddenTerms) {
  const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

  if (pattern.test(customerText)) {
    throw new Error(`Forbidden customer-facing term found: ${term}`);
  }
}

const token = await getAccessToken();
const [before, grantedScopes] = await Promise.all([
  getExactProduct(token, handle),
  getGrantedScopes(token),
]);

if (before.id !== expectedId) {
  throw new Error(`Product ID mismatch for ${handle}`);
}

if (before.vendor !== expectedVendor) {
  throw new Error(`Vendor mismatch for ${handle}`);
}

if (before.status !== "ACTIVE") {
  throw new Error(`Product ${handle} is not ACTIVE`);
}

if (before.media.nodes.some((media) => media.alt === altText)) {
  throw new Error(`A product image with this exact alt text already exists`);
}

const plan = {
  mode: args.apply ? "APPLY" : "DRY_RUN",
  product: {
    id: before.id,
    handle: before.handle,
    title: before.title,
    vendor: before.vendor,
    status: before.status,
  },
  image: {
    path: imagePath,
    bytes: imageInfo.size,
    sha256: crypto
      .createHash("sha256")
      .update(await readFile(imagePath))
      .digest("hex"),
    alt: altText,
    uploadMethod: "REST_PRODUCT_IMAGE_ATTACHMENT",
  },
  description: {
    path: descriptionPath,
    wordCount: countWords(descriptionHtml),
    forbiddenTermsChecked: forbiddenTerms,
  },
  effects: {
    updateDescription: true,
    addImage: true,
    makeNewImagePrimary: true,
    deleteExistingImages: false,
    changeTitle: false,
    changeHandle: false,
    changeVariants: false,
  },
  permissions: {
    writeProducts: grantedScopes.includes("write_products"),
  },
};

if (!args.apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (!grantedScopes.includes("write_products")) {
  throw new Error("The Shopify app is missing write_products permission");
}

const filename = path.basename(imagePath);
const imageBuffer = await readFile(imagePath);
let uploadedImage = null;
let descriptionChanged = false;
let after;

try {
  uploadedImage = await createProductImageFromAttachment(
    token,
    before.id,
    imageBuffer,
    filename,
    altText,
  );
  await updateDescription(token, before.id, descriptionHtml);
  descriptionChanged = true;

  const processed = await waitForMedia(token, handle, altText);

  if (processed.product.media.nodes[0]?.id !== processed.media.id) {
    const reorderData = await shopifyRequest(
      token,
      `
        mutation MakeProductImagePrimary($id: ID!, $moves: [MoveInput!]!) {
          productReorderMedia(id: $id, moves: $moves) {
            job {
              id
            }
            mediaUserErrors {
              field
              message
            }
          }
        }
      `,
      {
        id: before.id,
        moves: [{ id: processed.media.id, newPosition: "0" }],
      },
      "Product media reorder",
    );
    assertNoUserErrors(
      reorderData.productReorderMedia.mediaUserErrors,
      "Product media reorder",
    );
  }

  after = await waitForPrimaryMedia(token, handle, processed.media.id);
} catch (error) {
  const rollbackErrors = [];

  if (descriptionChanged) {
    try {
      await updateDescription(token, before.id, before.descriptionHtml);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError.message);
    }
  }

  if (uploadedImage) {
    try {
      await deleteProductImage(token, before.id, uploadedImage.id);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError.message);
    }
  }

  const rollback = rollbackErrors.length
    ? ` Rollback warnings: ${rollbackErrors.join("; ")}`
    : " Changes were rolled back.";
  throw new Error(`${error.message}${rollback}`);
}

if (normalizeHtml(after.descriptionHtml) !== normalizeHtml(descriptionHtml)) {
  throw new Error("Post-write verification found a description mismatch");
}

const log = {
  completedAt: new Date().toISOString(),
  plan,
  result: {
    productId: after.id,
    handle: after.handle,
    title: after.title,
    onlineStoreUrl: after.onlineStoreUrl,
    descriptionWordCount: countWords(after.descriptionHtml),
      primaryMedia: after.media.nodes[0],
      mediaCount: after.media.nodes.length,
      uploadedRestImageId: uploadedImage.id,
    previousPrimaryMediaId: before.media.nodes[0]?.id ?? null,
    existingImagesDeleted: 0,
  },
};
const logDirectory = path.resolve(
  args["log-dir"] ?? path.join("generated-product-images", "publish-logs"),
);
await mkdir(logDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logPath = path.join(logDirectory, `${handle}-${timestamp}.json`);
await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      status: "ok",
      productId: after.id,
      handle: after.handle,
      title: after.title,
      onlineStoreUrl: after.onlineStoreUrl,
      descriptionWordCount: countWords(after.descriptionHtml),
      primaryMediaId: after.media.nodes[0].id,
      primaryImageUrl: after.media.nodes[0].image.url,
      oldPrimaryRetained: after.media.nodes.some(
        (media) => media.id === before.media.nodes[0]?.id,
      ),
      logPath,
    },
    null,
    2,
  ),
);
