const API_VERSION = "2026-07";

type CachedToken = {
  token: string;
  expiresAt: number;
};

type ShopifyTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

let cachedToken: CachedToken | null = null;

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export async function getShopifyAccessToken() {
  if (
    cachedToken &&
    Date.now() < cachedToken.expiresAt - 5 * 60 * 1000
  ) {
    return cachedToken.token;
  }

  const shop = requiredEnv("SHOPIFY_SHOP");
  const clientId = requiredEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = requiredEnv("SHOPIFY_CLIENT_SECRET");

  const response = await fetch(
    `https://${shop}.myshopify.com/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify authentication failed: ${response.status}`);
  }

  const data = (await response.json()) as ShopifyTokenResponse;

  if (!data.access_token || !data.expires_in) {
    throw new Error("Shopify authentication response was incomplete");
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const shop = requiredEnv("SHOPIFY_SHOP");
  const token = await getShopifyAccessToken();

  const response = await fetch(
    `https://${shop}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      cache: "no-store",
    }
  );

  const data = (await response.json()) as {
    data?: T;
    errors?: unknown;
  };

  if (!response.ok || data.errors || !data.data) {
    throw new Error("Shopify GraphQL request failed");
  }

  return data.data;
}
