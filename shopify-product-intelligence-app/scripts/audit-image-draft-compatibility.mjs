import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const inventoryPath = path.resolve(
  projectRoot,
  "..",
  "..",
  "work",
  "shopify-active-media",
  "manifest.json",
);
const reviewJsonPath = path.join(
  projectRoot,
  "generated-product-images",
  "active-product-content-review.json",
);
const reviewCsvPath = path.join(
  projectRoot,
  "generated-product-images",
  "active-product-content-review.csv",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const inventory = readJson(inventoryPath);
const review = readJson(reviewJsonPath);
const inventoryByHandle = new Map(
  inventory.products.map((product) => [product.handle, product]),
);

for (const product of review.products) {
  const inventoryProduct = inventoryByHandle.get(product.handle);
  const activeVariantTitles =
    inventoryProduct?.variants.map((variant) => variant.title) ?? [];

  product.activeVariantTitles = activeVariantTitles;

  if (!product.proposedImagePath) {
    product.imageApprovalStatus = "NOT_APPLICABLE";
    product.imageReasonCodes = [];
    continue;
  }

  const hasCologneSprayVariant = activeVariantTitles.some((title) =>
    /\bcologne\s+spray\b/i.test(title),
  );

  if (hasCologneSprayVariant) {
    product.imageStatus = "DRAFT_READY_FOR_REVIEW";
    product.imageApprovalStatus = "REVIEW_READY";
    product.imageReasonCodes = ["COLOGNE_SPRAY_VARIANT_PRESENT"];
  } else {
    product.imageStatus = "BLOCKED_VARIANT_FORMAT_UNVERIFIED";
    product.imageApprovalStatus = "DO_NOT_UPLOAD";
    product.imageReasonCodes = ["COLOGNE_SPRAY_VARIANT_NOT_VERIFIED"];
  }
}

const generatedDrafts = review.products.filter(
  (product) => product.proposedImagePath,
);
const uploadReadyDrafts = generatedDrafts.filter(
  (product) => product.imageStatus === "DRAFT_READY_FOR_REVIEW",
);
const blockedDrafts = generatedDrafts.filter(
  (product) => product.imageStatus === "BLOCKED_VARIANT_FORMAT_UNVERIFIED",
);

review.policy.imageVariantGate =
  "A 1 fl oz / 30 mL cologne-spray draft is review-ready only when the active Shopify product explicitly includes a Cologne Spray variant.";
review.summary.generatedImageDrafts = generatedDrafts.length;
review.summary.uploadReadyImageDrafts = uploadReadyDrafts.length;
review.summary.blockedImageDrafts = blockedDrafts.length;
review.summary.shopifyWrites = 0;

fs.writeFileSync(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`);

const headers = [
  "shopifyProductId",
  "title",
  "handle",
  "vendor",
  "imageStatus",
  "imageApprovalStatus",
  "imageReasonCodes",
  "activeVariantTitles",
  "currentImageUrl",
  "proposedImagePath",
  "proposedImageWidth",
  "proposedImageHeight",
  "proposedImageSha256",
  "descriptionStatus",
  "descriptionWordCount",
  "shopifyWrites",
];
const rows = review.products.map((product) =>
  headers.map((header) => csvCell(product[header])).join(","),
);
fs.writeFileSync(reviewCsvPath, `${headers.join(",")}\n${rows.join("\n")}\n`);

console.log(
  JSON.stringify(
    {
      activeProducts: review.products.length,
      generatedImageDrafts: generatedDrafts.length,
      uploadReadyImageDrafts: uploadReadyDrafts.length,
      blockedImageDrafts: blockedDrafts.length,
      blockedHandles: blockedDrafts.map((product) => product.handle),
      shopifyWrites: 0,
    },
    null,
    2,
  ),
);
