import "server-only";

import crypto from "node:crypto";

const SHOPIFY_DOMAIN_PATTERN =
  /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

const STONE_WICK_SHOP_DOMAINS = new Set([
  "stonewick-store.myshopify.com",
  "jnb17f-fb.myshopify.com",
]);

const SHOPIFY_ADMIN_HOST = "admin.shopify.com";

const SHOP_DOMAIN_ALIASES = new Map<string, string>([
  ["stone-wick.com", "stonewick-store.myshopify.com"],
  ["www.stone-wick.com", "stonewick-store.myshopify.com"],
  ["stonewick-store", "stonewick-store.myshopify.com"],
  ["stone-wick", "stonewick-store.myshopify.com"],
]);

export const SHOPIFY_OAUTH_SCOPES = [
  "read_products",
  "read_orders",
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

  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);

    if (url.hostname === SHOPIFY_ADMIN_HOST) {
      const [, section, shopSlug] = url.pathname.split("/");

      if (section === "store" && shopSlug) {
        value = shopSlug;
      }
    } else {
      value = url.hostname;
    }
  } catch {
    value = value.replace(/^https?:\/\//, "");
    value = value.split("/")[0] ?? "";
    value = value.split("?")[0] ?? "";
  }

  value = value.replace(/^www\./, "");
  value = SHOP_DOMAIN_ALIASES.get(value) ?? value;

  if (!value.endsWith(".myshopify.com") && /^[a-z0-9][a-z0-9-]*$/i.test(value)) {
    value = `${value}.myshopify.com`;
  }

  if (!SHOPIFY_DOMAIN_PATTERN.test(value)) {
    throw new Error(
      "Shop must be a valid myshopify.com domain or Shopify admin store URL, such as stonewick-store.myshopify.com"
    );
  }

  return value;
}

export function getAppOrigin(request: Request) {
  const configuredHost =
    process.env.SHOPIFY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (configuredHost) {
    return normalizeAppOrigin(configuredHost);
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "https";

  if (!host) {
    throw new Error("Unable to determine app host for Shopify OAuth redirect");
  }

  return `${protocol}://${host}`;
}

function normalizeAppOrigin(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");

  try {
    const url = new URL(trimmed);

    if (!["https:", "http:"].includes(url.protocol)) {
      throw new Error("Invalid protocol");
    }

    if (url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Origin cannot include a path, query, or hash");
    }

    return url.origin;
  } catch {
    throw new Error(
      "SHOPIFY_APP_URL must be a valid app origin like https://shopify-product-intelligence.vercel.app"
    );
  }
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

function encryptedTokenBuffer(value: Buffer | Uint8Array | string) {
  if (typeof value !== "string") {
    return Buffer.from(value);
  }

  if (value.startsWith("\\x")) {
    return Buffer.from(value.slice(2), "hex");
  }

  return Buffer.from(value, "base64");
}

export function decryptShopifyToken(value: Buffer | Uint8Array | string) {
  const encrypted = encryptedTokenBuffer(value);

  if (encrypted.length <= 28) {
    throw new Error("Stored Shopify token payload is invalid");
  }

  const iv = encrypted.subarray(0, 12);
  const authTag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);

  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
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

  if (slug === "stone-wick" || slug === "stonewick-store") {
    return "Stone Wick";
  }

  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isStoneWickShopDomain(shopDomain: string) {
  return STONE_WICK_SHOP_DOMAINS.has(normalizeShopDomain(shopDomain));
}
