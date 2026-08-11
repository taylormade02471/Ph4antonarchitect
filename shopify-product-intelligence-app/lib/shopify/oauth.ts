import "server-only";

import crypto from "node:crypto";

const SHOPIFY_DOMAIN_PATTERN =
  /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export const SHOPIFY_OAUTH_SCOPES = [
  "read_products",
  "write_products",
] as const;

export type ShopifyOAuthTokenResponse = {
  access_token?: string;
  scope?: string;
};

export function requiredShopifyEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function normalizeShopDomain(input: string) {
  let value = input.trim().toLowerCase();

  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0] ?? "";
  value = value.split("?")[0] ?? "";

  if (!value.endsWith(".myshopify.com") && /^[a-z0-9][a-z0-9-]*$/i.test(value)) {
    value = `${value}.myshopify.com`;
  }

  if (!SHOPIFY_DOMAIN_PATTERN.test(value)) {
    throw new Error(
      "Shop must be a valid myshopify.com domain, such as stone-wick.myshopify.com"
    );
  }

  return value;
}

export function getAppOrigin(request: Request) {
  const configuredHost =
    process.env.SHOPIFY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (configuredHost) {
    return configuredHost.replace(/\/$/, "");
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "https";

  if (!host) {
    throw new Error("Unable to determine app host for Shopify OAuth redirect");
  }

  return `${protocol}://${host}`;
}

export function createOAuthState() {
  return crypto.randomBytes(24).toString("hex");
}

export function verifyShopifyHmac(
  searchParams: URLSearchParams,
  clientSecret: string
) {
  const hmac = searchParams.get("hmac");

  if (!hmac) {
    return false;
  }

  const message = [...searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  const expected = Buffer.from(digest, "utf8");
  const supplied = Buffer.from(hmac, "utf8");

  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}

function encryptionKey() {
  const configuredKey =
    process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY ?? process.env.SHOPIFY_CLIENT_SECRET;

  if (!configuredKey) {
    throw new Error("Missing SHOPIFY_TOKEN_ENCRYPTION_KEY or SHOPIFY_CLIENT_SECRET");
  }

  return crypto.createHash("sha256").update(configuredKey).digest();
}

export function encryptShopifyToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]);
}

export function safeSlugFromShopDomain(shopDomain: string) {
  return shopDomain
    .replace(/\.myshopify\.com$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function displayNameFromShopDomain(shopDomain: string) {
  const slug = safeSlugFromShopDomain(shopDomain);

  if (slug === "stone-wick") {
    return "Stone Wick";
  }

  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
