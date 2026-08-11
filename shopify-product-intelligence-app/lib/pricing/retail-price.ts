export type RetailPriceInput = {
  supplierUnitCost: number;
  shippingCostPerUnit?: number | null;
  otherCostPerUnit?: number | null;
};

const MINIMUM_MARGIN = 0.55;
const TARGET_MARGIN = 0.60;
const MAXIMUM_MARGIN = 0.65;

function requireMoney(value: number | null | undefined, name: string) {
  if (value !== null && value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${name} must be a non-negative number`);
  }
}

function money(value: number) {
  return Number(value.toFixed(2));
}

// Use familiar retail endings without materially dropping below the requested margin.
function roundUpTo99(value: number) {
  return money(Math.ceil(value) - 0.01);
}

function priceForMargin(cost: number, margin: number) {
  return roundUpTo99(cost / (1 - margin));
}

export function recommendRetailPrice(input: RetailPriceInput) {
  requireMoney(input.supplierUnitCost, "supplierUnitCost");
  requireMoney(input.shippingCostPerUnit, "shippingCostPerUnit");
  requireMoney(input.otherCostPerUnit, "otherCostPerUnit");

  const costsComplete = input.shippingCostPerUnit !== null && input.shippingCostPerUnit !== undefined &&
    input.otherCostPerUnit !== null && input.otherCostPerUnit !== undefined;
  const landedCost = costsComplete
    ? money(input.supplierUnitCost + input.shippingCostPerUnit! + input.otherCostPerUnit!)
    : null;
  const costBasis = landedCost ?? input.supplierUnitCost;
  const minimumPrice = priceForMargin(costBasis, MINIMUM_MARGIN);
  const recommendedPrice = priceForMargin(costBasis, TARGET_MARGIN);
  const maximumPrice = priceForMargin(costBasis, MAXIMUM_MARGIN);
  const grossProfit = landedCost === null ? null : money(recommendedPrice - landedCost);
  const grossMarginPercent = grossProfit === null
    ? null
    : Number(((grossProfit / recommendedPrice) * 100).toFixed(2));

  return {
    policyVersion: "TAYLORMADE_55_65_MARGIN_V1",
    status: costsComplete ? "READY_FOR_PRICE_REVIEW" : "PROVISIONAL_COSTS_MISSING",
    supplierUnitCost: money(input.supplierUnitCost),
    shippingCostPerUnit: input.shippingCostPerUnit ?? null,
    otherCostPerUnit: input.otherCostPerUnit ?? null,
    landedCost,
    costBasis: money(costBasis),
    marginRangePercent: { minimum: 55, target: 60, maximum: 65 },
    priceRange: { minimum: minimumPrice, maximum: maximumPrice },
    recommendedPrice,
    projectedGrossProfit: grossProfit,
    projectedGrossMarginPercent: grossMarginPercent,
    approvalRequired: true,
    shopifyPriceChanged: false,
    reasonCodes: costsComplete ? ["PRICE_REVIEW_REQUIRED"] : [
      "SHIPPING_ALLOCATION_MISSING",
      "OTHER_SOURCING_COSTS_UNVERIFIED",
      "PRICE_IS_PROVISIONAL",
    ],
  };
}
