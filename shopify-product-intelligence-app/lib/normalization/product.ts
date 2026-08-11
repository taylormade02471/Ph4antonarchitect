export type PackageType =
  | "FRAGRANCE_SPRAY"
  | "BODY_SPRAY"
  | "LOTION"
  | "SHAMPOO"
  | "BODY_OIL"
  | "GIFT_SET"
  | "TESTER"
  | "REFILL"
  | "OTHER";

const PACKAGE_LIMIT_OZ: Partial<Record<PackageType, number>> = {
  FRAGRANCE_SPRAY: 1,
  BODY_SPRAY: 6,
  LOTION: 6,
  SHAMPOO: 7,
  BODY_OIL: 4,
};

export function canonicalText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalProductName(title: string, brand: string) {
  const normalizedTitle = canonicalText(title);
  const normalizedBrand = canonicalText(brand);

  return normalizedTitle.startsWith(`${normalizedBrand} `)
    ? normalizedTitle.slice(normalizedBrand.length + 1)
    : normalizedTitle;
}

export function detectConcentration(value: string) {
  const text = canonicalText(value);

  if (/\beau de parfum\b|\bedp\b/.test(text)) return "EDP";
  if (/\beau de toilette\b|\bedt\b/.test(text)) return "EDT";
  if (/\beau de cologne\b|\bedc\b/.test(text)) return "EDC";
  if (/\bextrait\b/.test(text)) return "EXTRAIT";
  if (/\bparfum\b/.test(text)) return "PARFUM";
  if (/\bbody (mist|spray)\b/.test(text)) return "BODY_MIST";

  return null;
}

export function detectPackageType(value: string): PackageType {
  const text = canonicalText(value);

  if (/\bgift set\b|\bset of\b/.test(text)) return "GIFT_SET";
  if (/\btester\b/.test(text)) return "TESTER";
  if (/\brefill\b/.test(text)) return "REFILL";
  if (/\bbody (mist|spray)\b/.test(text)) return "BODY_SPRAY";
  if (/\blotion\b/.test(text)) return "LOTION";
  if (/\bshampoo\b/.test(text)) return "SHAMPOO";
  if (/\bbody oil\b/.test(text)) return "BODY_OIL";
  if (/\b(parfum|perfume|cologne|eau de|fragrance)\b/.test(text)) {
    return "FRAGRANCE_SPRAY";
  }

  return "OTHER";
}

export function parseSize(value: string) {
  const ounceMatch = value.match(/([\d.]+)\s*(?:fl\.?\s*)?oz\b/i);
  const milliliterMatch = value.match(/([\d.]+)\s*ml\b/i);

  if (ounceMatch) {
    const sizeOz = Number(ounceMatch[1]);
    return {
      sizeOz,
      sizeMl: Number((sizeOz * 29.5735).toFixed(2)),
    };
  }

  if (milliliterMatch) {
    const sizeMl = Number(milliliterMatch[1]);
    return {
      sizeOz: Number((sizeMl / 29.5735).toFixed(2)),
      sizeMl,
    };
  }

  return { sizeOz: null, sizeMl: null };
}

export function packageEligibility(packageType: PackageType, sizeOz: number | null) {
  if (["GIFT_SET", "TESTER", "REFILL", "OTHER"].includes(packageType)) {
    return {
      eligible: false,
      reason: `PACKAGE_TYPE_${packageType}`,
    };
  }

  const limit = PACKAGE_LIMIT_OZ[packageType];

  if (sizeOz === null) {
    return { eligible: false, reason: "SIZE_MISSING" };
  }

  if (limit !== undefined && sizeOz > limit + 0.001) {
    return {
      eligible: false,
      reason: "SIZE_ABOVE_PACKAGE_LIMIT",
    };
  }

  return { eligible: true, reason: null };
}

export function normalizeAvailability(value: string | null) {
  if (!value) return "UNKNOWN";
  if (/available|in stock|listed/i.test(value)) return "AVAILABLE";
  if (/unavailable|out of stock/i.test(value)) return "UNAVAILABLE";
  return "UNKNOWN";
}
