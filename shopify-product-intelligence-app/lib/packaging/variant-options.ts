import { sql } from "@/lib/db";

export const productFormats = ["SPRAY_BOTTLE", "HOME_SPRAY", "BOSTON_ROUND_ROLL_ON"] as const;
export const bottleMaterials = ["GLASS", "PLASTIC"] as const;

export type ProductFormat = (typeof productFormats)[number];
export type BottleMaterial = (typeof bottleMaterials)[number];

export type PackagingVariantInput = {
  shopifyVariantId: string;
  productFormat: ProductFormat;
  bottleMaterial: BottleMaterial;
  fillOz: 0.5 | 1;
  landedUnitCost?: number | null;
  notes?: string;
};

export const allowedMaterials: Record<ProductFormat, readonly BottleMaterial[]> = {
  SPRAY_BOTTLE: ["GLASS", "PLASTIC"],
  HOME_SPRAY: ["GLASS", "PLASTIC"],
  BOSTON_ROUND_ROLL_ON: ["GLASS", "PLASTIC"],
};

function validate(input: PackagingVariantInput) {
  if (!input.shopifyVariantId?.trim()) throw new Error("shopifyVariantId is required");
  if (!productFormats.includes(input.productFormat)) throw new Error("Unsupported productFormat");
  if (!bottleMaterials.includes(input.bottleMaterial)) throw new Error("Unsupported bottleMaterial");
  if (input.fillOz !== 0.5 && input.fillOz !== 1) throw new Error("fillOz must be 0.5 or 1");
  if (input.landedUnitCost != null && (!Number.isFinite(input.landedUnitCost) || input.landedUnitCost < 0)) {
    throw new Error("landedUnitCost must be a non-negative number");
  }
  if (!allowedMaterials[input.productFormat].includes(input.bottleMaterial)) {
    throw new Error(`${input.productFormat} cannot use ${input.bottleMaterial}`);
  }
}

function roundUpTo99(value: number) {
  return Number((Math.ceil(value) - 0.01).toFixed(2));
}

function packagingPrice(input: PackagingVariantInput) {
  const anchor = input.fillOz === 0.5
    ? (input.bottleMaterial === "GLASS" ? 7.99 : 6.89)
    : (input.bottleMaterial === "GLASS" ? 13.99 : 11.99);
  const marginPrice = input.landedUnitCost == null ? null : roundUpTo99(input.landedUnitCost / 0.4);
  return { anchor, recommended: Math.max(anchor, marginPrice ?? anchor), marginPrice };
}

export async function savePackagingVariant(input: PackagingVariantInput) {
  validate(input);
  const variant = await sql`SELECT shopify_variant_id, variant_title, sku
    FROM shopify_product_map WHERE shopify_variant_id=${input.shopifyVariantId} LIMIT 1`;
  if (variant.length === 0) throw new Error("Shopify variant is not present in the local catalog");
  const price = packagingPrice(input);

  const rows = await sql`INSERT INTO packaging_variant_options
    (shopify_variant_id, product_format, bottle_material, fill_oz, recommended_price,
      landed_unit_cost, status, compatibility_verified, notes)
    VALUES (${input.shopifyVariantId}, ${input.productFormat}, ${input.bottleMaterial}, ${input.fillOz},
      ${price.recommended}, ${input.landedUnitCost ?? null}, 'REVIEW_REQUIRED', FALSE, ${input.notes?.trim() || null})
    ON CONFLICT (shopify_variant_id, product_format, bottle_material, fill_oz)
    DO UPDATE SET notes=EXCLUDED.notes, recommended_price=EXCLUDED.recommended_price,
      landed_unit_cost=EXCLUDED.landed_unit_cost, status='REVIEW_REQUIRED',
      compatibility_verified=FALSE, updated_at=NOW()
    RETURNING *`;

  return {
    ...rows[0],
    variant: variant[0],
    pricing: {
      policy: "TAYLORMADE_PACKAGING_PRICE_V1",
      anchorPrice: price.anchor,
      marginPrice: price.marginPrice,
      recommendedPrice: price.recommended,
      approvalRequired: true,
    },
  };
}

export async function getPackagingVariants(shopifyVariantId?: string) {
  if (shopifyVariantId) {
    return sql`SELECT option.*, mapping.variant_title, mapping.sku
      FROM packaging_variant_options option
      JOIN shopify_product_map mapping ON mapping.shopify_variant_id=option.shopify_variant_id
      WHERE option.shopify_variant_id=${shopifyVariantId}
      ORDER BY option.product_format, option.bottle_material`;
  }
  return sql`SELECT option.*, mapping.variant_title, mapping.sku
    FROM packaging_variant_options option
    JOIN shopify_product_map mapping ON mapping.shopify_variant_id=option.shopify_variant_id
    ORDER BY option.updated_at DESC LIMIT 250`;
}
